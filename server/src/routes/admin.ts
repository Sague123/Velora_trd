import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, now, tx, asBig, asBigOrNull, asNum } from "../db.js";
import { out, toScaled, pctOf } from "../lib/money.js";
import { pnlFor, type Side } from "../engine/risk.js";
import { postLedger, audit } from "../lib/ledger.js";
import { closePositionById, cancelOrder, markPrice } from "../engine/execution.js";
import { revokeAllForUser, hashPassword } from "../lib/auth.js";
import { badRequest, notFound, forbidden } from "../lib/errors.js";
import { sOrder, sPosition, sTrade, sLedger } from "./serialize.js";

const money = z.string().regex(/^-?\d+(\.\d{1,8})?$/, "Ожидается десятичное число");

/**
 * Every route here is admin-gated and every mutation writes an audit row.
 * Admin actions on user money are deliberately noisy: they are the highest-risk
 * operations in the system and must always be attributable to a named actor.
 */
const q = {
  counts: {
    users: db.prepare("SELECT COUNT(*) AS n FROM users"),
    active: db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'ACTIVE'"),
    positions: db.prepare("SELECT COUNT(*) AS n FROM positions WHERE status = 'OPEN'"),
    orders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'NEW'"),
  },
  sums: db.prepare("SELECT COALESCE(SUM(pnl_scaled),0) AS pnl, COALESCE(SUM(fee_scaled),0) AS fee, COUNT(*) AS n FROM trades"),
  totalCash: db.prepare("SELECT COALESCE(SUM(cash_scaled),0) AS n FROM accounts"),
  listUsers: db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.last_login_at,
           COALESCE(a.cash_scaled, 0) AS cash_scaled,
           (SELECT COUNT(*) FROM positions p WHERE p.user_id = u.id AND p.status='OPEN') AS open_positions,
           (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS trade_count
    FROM users u LEFT JOIN accounts a ON a.user_id = u.id
    WHERE (@status = 'ALL' OR u.status = @status)
      AND (@search IS NULL OR u.email LIKE @like OR u.name LIKE @like)
    ORDER BY u.created_at DESC LIMIT @limit OFFSET @offset
  `),
  countUsers: db.prepare(`
    SELECT COUNT(*) AS n FROM users u
    WHERE (@status = 'ALL' OR u.status = @status)
      AND (@search IS NULL OR u.email LIKE @like OR u.name LIKE @like)
  `),
  user: db.prepare("SELECT * FROM users WHERE id = ?"),
  account: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  positions: db.prepare("SELECT * FROM positions WHERE user_id = ? AND status = 'OPEN'"),
  orders: db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'NEW' ORDER BY created_at DESC LIMIT 50"),
  trades: db.prepare("SELECT * FROM trades WHERE user_id = ? ORDER BY closed_at DESC LIMIT 50"),
  ledger: db.prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"),
  updUser: db.prepare("UPDATE users SET name = ?, status = ?, role = ?, updated_at = ? WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?"),
  audit: db.prepare(`
    SELECT a.*, actor.email AS actor_email, target.email AS target_email
    FROM audit_logs a
    LEFT JOIN users actor ON actor.id = a.actor_id
    LEFT JOIN users target ON target.id = a.target_user_id
    WHERE (@action IS NULL OR a.action = @action)
      AND (@target IS NULL OR a.target_user_id = @target)
    ORDER BY a.created_at DESC LIMIT @limit OFFSET @offset
  `),
  auditCount: db.prepare(`
    SELECT COUNT(*) AS n FROM audit_logs a
    WHERE (@action IS NULL OR a.action = @action) AND (@target IS NULL OR a.target_user_id = @target)
  `),
  updInstrument: db.prepare("UPDATE instruments SET active = ?, max_leverage = ? WHERE symbol = ?"),
  instrument: db.prepare("SELECT * FROM instruments WHERE symbol = ?"),
};

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAdmin);

  app.get("/stats", async () => {
    const sums = (await q.sums.get()) as any;
    return {
      users: asNum((await q.counts.users.get() as any).n),
      activeUsers: asNum((await q.counts.active.get() as any).n),
      openPositions: asNum((await q.counts.positions.get() as any).n),
      openOrders: asNum((await q.counts.orders.get() as any).n),
      closedTrades: asNum(sums.n),
      totalCash: out(asBig((await q.totalCash.get() as any).n), 2),
      totalRealisedPnl: out(asBig(sums.pnl), 2),
      totalFees: out(asBig(sums.fee), 2),
    };
  });

  app.get("/users", async (req) => {
    const p = z.object({
      search: z.string().optional(),
      status: z.enum(["ACTIVE", "SUSPENDED", "ALL"]).default("ALL"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    const args = {
      status: p.status, search: p.search ?? null, like: p.search ? `%${p.search}%` : null,
      limit: p.pageSize, offset: (p.page - 1) * p.pageSize,
    };
    const total = asNum((await q.countUsers.get(args) as any).n);
    const rows = (await q.listUsers.all(args)) as any[];

    return {
      total, page: p.page, pageSize: p.pageSize,
      users: rows.map((u) => ({
        id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
        balance: out(asBig(u.cash_scaled), 2),
        openPositions: asNum(u.open_positions), trades: asNum(u.trade_count),
        createdAt: u.created_at, lastLoginAt: u.last_login_at,
      })),
    };
  });

  app.get("/users/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = (await q.user.get(id)) as any;
    if (!user) throw notFound("Пользователь не найден");

    const acc = (await q.account.get(id)) as any;
    const positions = (await q.positions.all(id)) as any[];
    const trades = (await q.trades.all(id)) as any[];
    const cash = acc ? asBig(acc.cash_scaled) : 0n;
    const usedMargin = positions.reduce((s, p) => s + asBig(p.margin_scaled), 0n);
    let unrealised = 0n;
    for (const p of positions) {
      const mark = (await markPrice(p.symbol)) ?? asBig(p.entry_scaled);
      unrealised += pnlFor(p.side as Side, asBig(p.qty_scaled), asBig(p.entry_scaled), mark);
    }
    const realised = trades.reduce((s, t) => s + asBig(t.pnl_scaled), 0n);

    const positionsOut = await Promise.all(
      positions.map(async (p) => sPosition(p, (await markPrice(p.symbol)) ?? asBig(p.entry_scaled)))
    );

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role,
        status: user.status, createdAt: user.created_at, lastLoginAt: user.last_login_at },
      account: {
        cash: out(cash, 2), usedMargin: out(usedMargin, 2),
        unrealisedPnl: out(unrealised, 2), realisedPnl: out(realised, 2),
        equity: out(cash + usedMargin + unrealised, 2),
        marginUsagePct: pctOf(usedMargin, cash + usedMargin + unrealised),
      },
      positions: positionsOut,
      orders: ((await q.orders.all(id)) as any[]).map(sOrder),
      trades: trades.map(sTrade),
      ledger: ((await q.ledger.all(id)) as any[]).map(sLedger),
    };
  });

  app.patch("/users/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(80).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      role: z.enum(["USER", "ADMIN"]).optional(),
    }).parse(req.body);

    const user = (await q.user.get(id)) as any;
    if (!user) throw notFound("Пользователь не найден");
    if (id === req.user.sub && (body.role === "USER" || body.status === "SUSPENDED")) {
      // Stops an admin locking the whole team out by demoting themselves.
      throw forbidden("Нельзя понизить или заблокировать собственный аккаунт");
    }

    const next = { name: body.name ?? user.name, status: body.status ?? user.status, role: body.role ?? user.role };
    await q.updUser.run(next.name, next.status, next.role, now(), id);
    if (next.status === "SUSPENDED") await revokeAllForUser(id);
    await audit({ actorId: req.user.sub, targetUserId: id, action: "USER_UPDATED", meta: body, ip: req.ip });
    return { user: { id, ...next, email: user.email } };
  });

  app.post("/users/:id/reset-password", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ newPassword: z.string().min(10).max(200) }).parse(req.body);
    if (!(await q.user.get(id))) throw notFound("Пользователь не найден");
    await q.setPassword.run(await hashPassword(body.newPassword), now(), id);
    await revokeAllForUser(id);
    await audit({ actorId: req.user.sub, targetUserId: id, action: "ADMIN_PASSWORD_RESET", ip: req.ip });
    return { ok: true };
  });

  app.post("/users/:id/balance", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ amount: money, note: z.string().max(200).optional() }).parse(req.body);

    const amount = toScaled(body.amount); // signed: "500" credits, "-500" debits
    if (amount === 0n) throw badRequest("ZERO_AMOUNT", "Сумма не может быть нулевой");
    if (!(await q.user.get(id))) throw notFound("Пользователь не найден");

    const balanceAfter = await tx(async () => {
      const b = await postLedger({
        userId: id, type: "ADMIN_ADJUSTMENT", amountScaled: amount,
        note: body.note ?? "Корректировка баланса администратором", actorUserId: req.user.sub,
      });
      await audit({ actorId: req.user.sub, targetUserId: id, action: "BALANCE_ADJUSTED",
        meta: { amount: body.amount, note: body.note }, ip: req.ip });
      return b;
    });

    return { balance: out(balanceAfter, 2) };
  });

  app.post("/users/:userId/positions/:positionId/close", async (req) => {
    const { userId, positionId } = z.object({ userId: z.string(), positionId: z.string() }).parse(req.params);
    const trade = await closePositionById(userId, positionId, "ADMIN", req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "ADMIN_CLOSED_POSITION",
      meta: { positionId, pnl: out(trade.pnl_scaled, 2) }, ip: req.ip });
    return { trade: sTrade(trade) };
  });

  app.delete("/users/:userId/orders/:orderId", async (req) => {
    const { userId, orderId } = z.object({ userId: z.string(), orderId: z.string() }).parse(req.params);
    const order = await cancelOrder(userId, orderId, req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "ADMIN_CANCELLED_ORDER", meta: { orderId }, ip: req.ip });
    return { order: sOrder(order) };
  });

  app.get("/audit", async (req) => {
    const p = z.object({
      action: z.string().optional(),
      targetUserId: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const args = { action: p.action ?? null, target: p.targetUserId ?? null,
      limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
    return {
      total: asNum((await q.auditCount.get(args) as any).n),
      entries: ((await q.audit.all(args)) as any[]).map((r) => ({
        id: r.id, action: r.action, actor: r.actor_email ?? null, target: r.target_email ?? null,
        meta: r.meta ? JSON.parse(r.meta) : null, ip: r.ip, createdAt: r.created_at,
      })),
    };
  });

  app.patch("/instruments/:symbol", async (req) => {
    const { symbol } = z.object({ symbol: z.string() }).parse(req.params);
    const body = z.object({
      active: z.boolean().optional(),
      maxLeverage: z.number().int().min(1).max(125).optional(),
    }).parse(req.body);

    const ins = (await q.instrument.get(symbol.toUpperCase())) as any;
    if (!ins) throw notFound("Инструмент не найден");
    const active = body.active === undefined ? asNum(ins.active) : body.active ? 1 : 0;
    const maxLev = body.maxLeverage ?? asNum(ins.max_leverage);
    await q.updInstrument.run(active, maxLev, ins.symbol);
    await audit({ actorId: req.user.sub, action: "INSTRUMENT_UPDATED", meta: { symbol, ...body }, ip: req.ip });
    return { instrument: { symbol: ins.symbol, active: active === 1, maxLeverage: maxLev } };
  });
}
