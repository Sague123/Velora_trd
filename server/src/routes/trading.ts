import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, tx, asBig, asBigOrNull, asNum } from "../db.js";
import { out, toScaled, pctOf } from "../lib/money.js";
import { pnlFor, type Side } from "../engine/risk.js";
import { placeOrder, cancelOrder, closePositionById, changeLeverage, markPrice } from "../engine/execution.js";
import { getCandles, feedStatus, quoteIsFresh } from "../engine/prices.js";
import { postLedger, audit } from "../lib/ledger.js";
import { notFound, badRequest, conflict } from "../lib/errors.js";
import { requireApprovedKyc } from "./kyc.js";
import { sOrder, sPosition, sTrade, sLedger } from "./serialize.js";

const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/, "Ожидается положительное десятичное число");

// Self-service wallet actions are demo-money only (see server/README.md) and
// deliberately capped so a slipped extra zero can't produce an absurd balance.
const SELF_SERVICE_MAX = toScaled("1000000");

const q = {
  instruments: db.prepare(`
    SELECT i.*, p.price_scaled, p.change_24h, p.high_24h, p.low_24h, p.volume_24h, p.source, p.updated_at
    FROM instruments i LEFT JOIN price_snapshots p ON p.symbol = i.symbol
    WHERE i.active = 1 ORDER BY i.category, i.symbol
  `),
  orders: db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 200"),
  ordersByStatus: db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT 200"),
  openOrders: db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'NEW'"),
  positions: db.prepare("SELECT * FROM positions WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC"),
  position: db.prepare("SELECT * FROM positions WHERE id = ? AND user_id = ? AND status = 'OPEN'"),
  updateTpSl: db.prepare("UPDATE positions SET tp_scaled = ?, sl_scaled = ? WHERE id = ?"),
  trades: db.prepare("SELECT * FROM trades WHERE user_id = ? ORDER BY closed_at DESC LIMIT 200"),
  allTrades: db.prepare("SELECT pnl_scaled FROM trades WHERE user_id = ?"),
  account: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  ledger: db.prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 200"),
  savings: db.prepare("SELECT COALESCE(SUM(balance_scaled), 0) AS n FROM savings_accounts WHERE user_id = ? AND status = 'ACTIVE'"),
  userByEmail: db.prepare("SELECT id, email, status FROM users WHERE email = ?"),
  userByAccountNumber: db.prepare("SELECT id, email, status FROM users WHERE account_number = ?"),
  alerts: db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC"),
  insAlert: db.prepare(`INSERT INTO alerts (id, user_id, symbol, direction, price_scaled, created_at)
                        VALUES (@id, @userId, @symbol, @direction, @price, @ts)`),
  delAlert: db.prepare("DELETE FROM alerts WHERE id = ? AND user_id = ?"),
};

export default async function tradingRoutes(app: FastifyInstance) {
  /* ------------------------------ market data ----------------------------- */
  app.get("/instruments", async () => ({
    feed: feedStatus(),
    instruments: ((await q.instruments.all()) as any[]).map((i) => ({
      symbol: i.symbol, name: i.name, category: i.category,
      maxLeverage: asNum(i.max_leverage), priceDecimals: asNum(i.price_decimals),
      fundingRate: i.funding_rate,
      price: out(asBigOrNull(i.price_scaled), asNum(i.price_decimals)),
      change24h: i.change_24h ?? 0,
      high24h: out(asBigOrNull(i.high_24h), asNum(i.price_decimals)),
      low24h: out(asBigOrNull(i.low_24h), asNum(i.price_decimals)),
      volume24h: out(asBigOrNull(i.volume_24h), 0),
      source: i.source ?? "NONE", updatedAt: i.updated_at ?? null,
      // False when the symbol is halted because its quote has gone stale (see
      // tradeableMark() in engine/execution.ts). The UI shows the last known
      // price either way, but can say why the ticket is disabled.
      tradeable: i.price_scaled != null && quoteIsFresh(i.updated_at),
    })),
  }));

  app.get("/instruments/:symbol/candles", async (req) => {
    const { symbol } = z.object({ symbol: z.string() }).parse(req.params);
    const { tf } = z.object({ tf: z.enum(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]).default("1H") }).parse(req.query);
    // `real` is surfaced so the UI can label a modelled series honestly.
    const { candles, real } = await getCandles(symbol.toUpperCase(), tf);
    return { symbol, tf, real, candles };
  });

  /* -------------------------------- orders -------------------------------- */
  app.post("/orders", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({
      symbol: z.string().min(1),
      side: z.enum(["BUY", "SELL"]),
      type: z.enum(["MARKET", "LIMIT", "STOP"]),
      qty: decimal,
      price: decimal.optional(),
      leverage: z.number().int().min(1).max(125).default(1),
      takeProfit: decimal.optional(),
      stopLoss: decimal.optional(),
    }).parse(req.body);

    if (body.type !== "MARKET" && !body.price) {
      throw badRequest("PRICE_REQUIRED", "Для лимитного и стоп-ордера нужна цена");
    }

    const result = await placeOrder({
      userId: req.user.sub, symbol: body.symbol.toUpperCase(),
      side: body.side, type: body.type,
      qtyScaled: toScaled(body.qty),
      priceScaled: body.price ? toScaled(body.price) : 0n,
      leverage: body.leverage,
      tpScaled: body.takeProfit ? toScaled(body.takeProfit) : null,
      slScaled: body.stopLoss ? toScaled(body.stopLoss) : null,
    });

    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "ORDER_PLACED",
      meta: { symbol: body.symbol, side: body.side, type: body.type, qty: body.qty }, ip: req.ip });

    return reply.code(201).send({
      order: sOrder(result.order),
      position: result.position ? sPosition(result.position, asBig(result.position.entry_scaled)) : null,
    });
  });

  app.get("/orders", { preHandler: [app.authenticate] }, async (req) => {
    const { status } = z.object({ status: z.enum(["NEW", "FILLED", "CANCELLED", "ALL"]).default("NEW") }).parse(req.query);
    const rows = status === "ALL" ? await q.orders.all(req.user.sub) : await q.ordersByStatus.all(req.user.sub, status);
    return { orders: (rows as any[]).map(sOrder) };
  });

  app.delete("/orders/:id", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const order = await cancelOrder(req.user.sub, id);
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "ORDER_CANCELLED", meta: { id }, ip: req.ip });
    return { order: sOrder(order) };
  });

  /* ------------------------------- positions ------------------------------ */
  app.get("/positions", { preHandler: [app.authenticate] }, async (req) => {
    const rows = (await q.positions.all(req.user.sub)) as any[];
    const positions = await Promise.all(
      rows.map(async (p) => sPosition(p, (await markPrice(p.symbol)) ?? asBig(p.entry_scaled)))
    );
    return { positions };
  });

  app.post("/positions/:id/close", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const trade = await closePositionById(req.user.sub, id, "MANUAL");
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "POSITION_CLOSED", meta: { id }, ip: req.ip });
    return { trade: sTrade(trade) };
  });

  app.patch("/positions/:id", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      takeProfit: decimal.nullable().optional(),
      stopLoss: decimal.nullable().optional(),
      leverage: z.number().int().min(1).max(125).optional(),
    }).parse(req.body);

    if (body.leverage !== undefined) {
      await changeLeverage(req.user.sub, id, body.leverage);
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "POSITION_LEVERAGE_CHANGED", meta: { id, leverage: body.leverage }, ip: req.ip });
    }

    const pos = (await q.position.get(id, req.user.sub)) as any;
    if (!pos) throw notFound("Позиция не найдена");
    const tp = body.takeProfit === undefined ? asBigOrNull(pos.tp_scaled) : body.takeProfit === null ? null : toScaled(body.takeProfit);
    const sl = body.stopLoss === undefined ? asBigOrNull(pos.sl_scaled) : body.stopLoss === null ? null : toScaled(body.stopLoss);
    await q.updateTpSl.run(tp, sl, id);
    const fresh = (await q.position.get(id, req.user.sub)) as any;
    return { position: sPosition(fresh, (await markPrice(fresh.symbol)) ?? asBig(fresh.entry_scaled)) };
  });

  app.get("/trades", { preHandler: [app.authenticate] }, async (req) => ({
    trades: ((await q.trades.all(req.user.sub)) as any[]).map(sTrade),
  }));

  /* -------------------------------- account ------------------------------- */
  app.get("/account", { preHandler: [app.authenticate] }, async (req) => {
    const acc = (await q.account.get(req.user.sub)) as { cash_scaled: bigint } | undefined;
    const positions = (await q.positions.all(req.user.sub)) as any[];
    const openOrders = (await q.openOrders.all(req.user.sub)) as any[];
    const trades = (await q.allTrades.all(req.user.sub)) as any[];

    const cash = acc ? asBig(acc.cash_scaled) : 0n;
    const usedMargin = positions.reduce((s, p) => s + asBig(p.margin_scaled), 0n);
    const lockedMargin = openOrders.reduce((s, o) => s + asBig(o.margin_scaled), 0n);
    let unrealised = 0n;
    for (const p of positions) {
      const mark = (await markPrice(p.symbol)) ?? asBig(p.entry_scaled);
      unrealised += pnlFor(p.side as Side, asBig(p.qty_scaled), asBig(p.entry_scaled), mark);
    }
    const realised = trades.reduce((s, t) => s + asBig(t.pnl_scaled), 0n);
    // Money in a savings account is still the trader's money — leaving it out
    // of equity would show their net worth dropping the moment they saved some
    // of it, which is exactly backwards.
    const savings = asBig(((await q.savings.get(req.user.sub)) as any).n);
    const equity = cash + usedMargin + lockedMargin + unrealised + savings;
    const wins = trades.filter((t) => asBig(t.pnl_scaled) > 0n).length;

    return {
      cash: out(cash, 2), usedMargin: out(usedMargin, 2), lockedMargin: out(lockedMargin, 2),
      savings: out(savings, 2),
      unrealisedPnl: out(unrealised, 2), realisedPnl: out(realised, 2), equity: out(equity, 2),
      marginUsagePct: pctOf(usedMargin, equity),
      openPositions: positions.length, openOrders: openOrders.length,
      totalTrades: trades.length,
      winRatePct: trades.length ? Math.round((wins / trades.length) * 100) : null,
    };
  });

  app.get("/ledger", { preHandler: [app.authenticate] }, async (req) => ({
    entries: ((await q.ledger.all(req.user.sub)) as any[]).map(sLedger),
  }));

  /* ---------------------------- wallet (demo money) ------------------------ */
  // Self-service top-up/cash-out/transfer of the demo balance. Money never
  // leaves postLedger()'s single choke point, so the ledger stays the one
  // source of truth these routes just add new entry types to.
  app.post("/account/deposit", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({ amount: decimal, note: z.string().max(200).optional() }).parse(req.body);
    const amount = toScaled(body.amount);
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");
    if (amount > SELF_SERVICE_MAX) throw badRequest("AMOUNT_TOO_LARGE", `Депозит ограничен ${out(SELF_SERVICE_MAX, 2)}`);

    const balance = await tx(async () => {
      const b = await postLedger({ userId: req.user.sub, type: "DEPOSIT", amountScaled: amount, note: body.note ?? "Пополнение" });
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "SELF_DEPOSIT", meta: { amount: body.amount }, ip: req.ip });
      return b;
    });
    return reply.code(201).send({ balance: out(balance, 2) });
  });

  app.post("/account/withdraw", { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ amount: decimal, note: z.string().max(200).optional() }).parse(req.body);
    const amount = toScaled(body.amount);
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");
    // Money leaving the platform is the one direction identity has to be
    // established first. Deposits and internal transfers deliberately are not
    // gated: refusing to let someone *put money in*, or move it between their
    // own and another Velora account, adds friction without adding assurance.
    await requireApprovedKyc(req.user.sub);

    const balance = await tx(async () => {
      const b = await postLedger({ userId: req.user.sub, type: "WITHDRAWAL", amountScaled: -amount, note: body.note ?? "Вывод" });
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "SELF_WITHDRAWAL", meta: { amount: body.amount }, ip: req.ip });
      return b;
    });
    return { balance: out(balance, 2) };
  });

  app.post("/account/transfer", { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({
      toEmail: z.string().email().optional(),
      toAccountId: z.string().regex(/^\d{8}$/, "Счёт получателя — 8 цифр").optional(),
      amount: decimal, note: z.string().max(200).optional(),
    }).refine((b) => !!b.toEmail || !!b.toAccountId, { message: "Укажите email или номер счёта получателя" }).parse(req.body);
    const amount = toScaled(body.amount);
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");
    if (amount > SELF_SERVICE_MAX) throw badRequest("AMOUNT_TOO_LARGE", `Перевод ограничен ${out(SELF_SERVICE_MAX, 2)}`);

    const recipient = (body.toAccountId
      ? await q.userByAccountNumber.get(body.toAccountId)
      : await q.userByEmail.get(body.toEmail!.toLowerCase())) as { id: string; email: string; status: string } | undefined;
    if (!recipient) throw notFound("Получатель не найден");
    if (recipient.id === req.user.sub) throw badRequest("SELF_TRANSFER", "Нельзя перевести самому себе");
    if (recipient.status !== "ACTIVE") throw conflict("RECIPIENT_INACTIVE", "Аккаунт получателя заблокирован");

    const balance = await tx(async () => {
      const b = await postLedger({
        userId: req.user.sub, type: "TRANSFER_OUT", amountScaled: -amount,
        refType: "TRANSFER", refId: recipient.id, note: body.note ?? `Перевод пользователю ${recipient.email}`,
      });
      await postLedger({
        userId: recipient.id, type: "TRANSFER_IN", amountScaled: amount,
        refType: "TRANSFER", refId: req.user.sub, note: body.note ?? `Перевод от ${req.user.email}`,
      });
      await audit({ actorId: req.user.sub, targetUserId: recipient.id, action: "USER_TRANSFER", meta: { amount: body.amount, to: recipient.email }, ip: req.ip });
      return b;
    });
    return { balance: out(balance, 2) };
  });

  /* --------------------------------- alerts ------------------------------- */
  app.get("/alerts", { preHandler: [app.authenticate] }, async (req) => ({
    alerts: ((await q.alerts.all(req.user.sub)) as any[]).map((a) => ({
      id: a.id, symbol: a.symbol, direction: a.direction,
      price: out(asBig(a.price_scaled)), firedAt: a.fired_at, createdAt: a.created_at,
    })),
  }));

  app.post("/alerts", { preHandler: [app.authenticate] }, async (req, reply) => {
    const body = z.object({
      symbol: z.string(), direction: z.enum(["ABOVE", "BELOW"]), price: decimal,
    }).parse(req.body);
    const id = newId();
    await q.insAlert.run({ id, userId: req.user.sub, symbol: body.symbol.toUpperCase(),
      direction: body.direction, price: toScaled(body.price), ts: now() });
    return reply.code(201).send({ id });
  });

  app.delete("/alerts/:id", { preHandler: [app.authenticate] }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await q.delAlert.run(id, req.user.sub);
    return { ok: true };
  });
}
