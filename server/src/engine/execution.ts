import { db, newId, now, tx, asBig, asBigOrNull, asNum, asBool } from "../db.js";
import { postLedger, chargeFee, refundFee } from "../lib/ledger.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { notional, marginFor, feeFor, pnlFor, liquidationPrice, maxSafeLeverage, type Side } from "./risk.js";
import { quoteIsFresh } from "./prices.js";

export interface PositionRow {
  id: string; user_id: string; symbol: string; side: string;
  qty_scaled: bigint; entry_scaled: bigint; margin_scaled: bigint;
  leverage: bigint; liq_scaled: bigint | null; tp_scaled: bigint | null;
  sl_scaled: bigint | null; status: string; opened_at: string; closed_at: string | null;
}
export interface OrderRow {
  id: string; user_id: string; symbol: string; side: string; type: string;
  qty_scaled: bigint; price_scaled: bigint; leverage: bigint; margin_scaled: bigint;
  fee_scaled: bigint; tp_scaled: bigint | null; sl_scaled: bigint | null;
  status: string; filled_scaled: bigint | null; position_id: string | null;
  created_at: string; filled_at: string | null; cancelled_at: string | null;
}

const q = {
  realBalance: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  instrument: db.prepare(`
    SELECT i.*, p.price_scaled, p.updated_at AS price_updated_at FROM instruments i
    LEFT JOIN price_snapshots p ON p.symbol = i.symbol WHERE i.symbol = ?
  `),
  insOrder: db.prepare(`
    INSERT INTO orders (id, user_id, symbol, side, type, qty_scaled, price_scaled, leverage,
                        margin_scaled, fee_scaled, tp_scaled, sl_scaled, status, filled_scaled,
                        position_id, created_at, filled_at)
    VALUES (@id, @userId, @symbol, @side, @type, @qty, @price, @leverage, @margin, @fee,
            @tp, @sl, @status, @filled, @positionId, @createdAt, @filledAt)
  `),
  insPosition: db.prepare(`
    INSERT INTO positions (id, user_id, symbol, side, qty_scaled, entry_scaled, margin_scaled,
                           leverage, liq_scaled, tp_scaled, sl_scaled, status, opened_at)
    VALUES (@id, @userId, @symbol, @side, @qty, @entry, @margin, @leverage, @liq, @tp, @sl, 'OPEN', @openedAt)
  `),
  insTrade: db.prepare(`
    INSERT INTO trades (id, user_id, position_id, symbol, side, qty_scaled, entry_scaled,
                        exit_scaled, pnl_scaled, fee_scaled, close_reason, closed_at)
    VALUES (@id, @userId, @positionId, @symbol, @side, @qty, @entry, @exit, @pnl, @fee, @reason, @closedAt)
  `),
  getOrder: db.prepare("SELECT * FROM orders WHERE id = ?"),
  getUserOrder: db.prepare("SELECT * FROM orders WHERE id = ? AND user_id = ?"),
  fillOrder: db.prepare("UPDATE orders SET status='FILLED', filled_scaled=?, filled_at=?, position_id=? WHERE id=?"),
  cancelOrderStmt: db.prepare("UPDATE orders SET status='CANCELLED', cancelled_at=? WHERE id=?"),
  getPosition: db.prepare("SELECT * FROM positions WHERE id = ?"),
  getUserPosition: db.prepare("SELECT * FROM positions WHERE id = ? AND user_id = ? AND status = 'OPEN'"),
  closePositionStmt: db.prepare("UPDATE positions SET status='CLOSED', closed_at=? WHERE id=?"),
  markOf: db.prepare("SELECT price_scaled, updated_at FROM price_snapshots WHERE symbol = ?"),
  updateLeverage: db.prepare("UPDATE positions SET leverage=?, margin_scaled=?, liq_scaled=? WHERE id=?"),
};

/**
 * Last known price for a symbol, however old. Correct for *display* — showing
 * the last print beats showing a blank cell — and wrong for anything that
 * moves money, which must use tradeableMark() instead.
 */
export const markPrice = async (symbol: string): Promise<bigint | null> => {
  const row = (await q.markOf.get(symbol)) as { price_scaled: bigint } | undefined;
  return row ? asBig(row.price_scaled) : null;
};

/**
 * What the platform does when the quote upstream is unreachable — the one
 * decision this whole file turns on, stated once, here:
 *
 *   No quote at all, or a quote older than config.maxQuoteAgeMs, means the
 *   symbol is HALTED. Nothing opens, nothing closes, nothing fills and nothing
 *   liquidates on it until a fresh price arrives.
 *
 * The alternative — carrying on against the last known number — is worse in
 * both directions at once: traders get filled at prices the market left behind
 * minutes ago, and, far more seriously, positions get *liquidated* against a
 * price that never happened. Refusing to act is the only behaviour that cannot
 * take money from someone on the strength of a number the platform has no
 * current evidence for. It is also what a real venue does: it halts the market.
 *
 * The halt is symmetric on purpose. Blocking closes while still allowing
 * liquidations would be indefensible, so neither runs; a trader cannot exit
 * during a halt, but neither can the house take the position away.
 * `/api/instruments` exposes `tradeable` and the feed's health so the UI can
 * say which it is rather than surfacing a bare error.
 */
export async function tradeableMark(symbol: string): Promise<bigint> {
  const row = (await q.markOf.get(symbol)) as { price_scaled: bigint; updated_at: string } | undefined;
  if (!row) throw conflict("NO_PRICE", "Нет котировки по инструменту");
  if (!quoteIsFresh(row.updated_at)) {
    throw conflict("STALE_PRICE",
      "Котировка устарела — торговля по инструменту приостановлена до восстановления фида");
  }
  return asBig(row.price_scaled);
}

export interface OpenRequest {
  userId: string; symbol: string; side: Side;
  type: "MARKET" | "LIMIT" | "STOP";
  qtyScaled: bigint; priceScaled: bigint; leverage: number;
  tpScaled?: bigint | null; slScaled?: bigint | null;
}

/**
 * Places an order. MARKET fills immediately and opens a position; LIMIT/STOP
 * reserve margin and rest until the engine fills them. One transaction — margin
 * is never held without a corresponding order row.
 */
export async function placeOrder(req: OpenRequest) {
  const ins = (await q.instrument.get(req.symbol)) as any;
  if (!ins || !asBool(ins.active)) throw notFound("Инструмент недоступен");
  if (req.qtyScaled <= 0n) throw badRequest("INVALID_QTY", "Количество должно быть больше нуля");

  const maxLev = asNum(ins.max_leverage);
  if (req.leverage < 1 || req.leverage > maxLev) {
    throw badRequest("INVALID_LEVERAGE", `Плечо для ${req.symbol} должно быть от 1x до ${maxLev}x`);
  }
  const safeLev = maxSafeLeverage();
  if (req.leverage > safeLev) {
    throw badRequest("UNSAFE_LEVERAGE",
      `Плечо выше ${safeLev}x приводит к мгновенной ликвидации при текущих требованиях к марже`);
  }
  if (ins.price_scaled == null) throw conflict("NO_PRICE", "Нет котировки по инструменту");
  // Applies to LIMIT and STOP too, not just MARKET: a resting order placed now
  // is filled later by matching.ts against the mark, so accepting one while the
  // symbol is halted just defers the same bad fill.
  if (!quoteIsFresh(ins.price_updated_at)) {
    throw conflict("STALE_PRICE",
      "Котировка устарела — торговля по инструменту приостановлена до восстановления фида");
  }

  const mark = asBig(ins.price_scaled);
  const fillPrice = req.type === "MARKET" ? mark : req.priceScaled;
  if (fillPrice <= 0n) throw badRequest("INVALID_PRICE", "Некорректная цена");

  const notionalScaled = notional(req.qtyScaled, fillPrice);
  const marginScaled = marginFor(notionalScaled, req.leverage);
  const feeScaled = feeFor(notionalScaled);
  if (marginScaled <= 0n) throw badRequest("TOO_SMALL", "Слишком маленький объём");

  return tx(async () => {
    // Real money is what backs a position: bonus is not collateral, so an
    // account holding nothing but bonus cannot open one however large that
    // bonus is. Checked here rather than only in the UI, and inside the
    // transaction, so it cannot be raced past by two orders at once.
    const acc = (await q.realBalance.get(req.userId)) as { cash_scaled: bigint } | undefined;
    if (!acc) throw notFound("Счёт не найден");
    if (asBig(acc.cash_scaled) <= 0n) {
      throw conflict("NO_REAL_FUNDS",
        "Для открытия позиции нужен реальный баланс — бонусные средства не обеспечивают маржу");
    }

    const ts = now();
    const orderId = newId();

    await postLedger({ userId: req.userId, type: "MARGIN_HOLD", amountScaled: -marginScaled,
      refType: "ORDER", refId: orderId, note: `${req.side} ${req.symbol} ${req.type}` });
    // Bonus first, the rest from real. No allowNegative: an opening order the
    // client cannot pay for is refused, and because the margin hold above is
    // in this same transaction, the refusal takes it back with it — a rejected
    // order leaves nothing behind at all.
    await chargeFee({ userId: req.userId, amountScaled: feeScaled,
      refType: "ORDER", refId: orderId, note: `Комиссия ${req.symbol}` });

    let positionId: string | null = null;

    if (req.type === "MARKET") {
      positionId = newId();
      await q.insPosition.run({
        id: positionId, userId: req.userId, symbol: req.symbol, side: req.side,
        qty: req.qtyScaled, entry: fillPrice, margin: marginScaled, leverage: req.leverage,
        liq: liquidationPrice(req.side, fillPrice, req.leverage),
        tp: req.tpScaled ?? null, sl: req.slScaled ?? null, openedAt: ts,
      });
    }

    await q.insOrder.run({
      id: orderId, userId: req.userId, symbol: req.symbol, side: req.side, type: req.type,
      qty: req.qtyScaled, price: fillPrice, leverage: req.leverage, margin: marginScaled,
      fee: feeScaled, tp: req.tpScaled ?? null, sl: req.slScaled ?? null,
      status: req.type === "MARKET" ? "FILLED" : "NEW",
      filled: req.type === "MARKET" ? fillPrice : null,
      positionId, createdAt: ts, filledAt: req.type === "MARKET" ? ts : null,
    });

    return {
      order: (await q.getOrder.get(orderId)) as OrderRow,
      position: positionId ? ((await q.getPosition.get(positionId)) as PositionRow) : null,
    };
  });
}

/** Fills a resting order — margin was already held when it was placed. */
export async function fillRestingOrder(order: OrderRow): Promise<PositionRow> {
  const side = order.side as Side;
  const positionId = newId();
  const ts = now();
  await q.insPosition.run({
    id: positionId, userId: order.user_id, symbol: order.symbol, side,
    qty: asBig(order.qty_scaled), entry: asBig(order.price_scaled),
    margin: asBig(order.margin_scaled), leverage: asNum(order.leverage),
    liq: liquidationPrice(side, asBig(order.price_scaled), asNum(order.leverage)),
    tp: asBigOrNull(order.tp_scaled), sl: asBigOrNull(order.sl_scaled), openedAt: ts,
  });
  await q.fillOrder.run(asBig(order.price_scaled), ts, positionId, order.id);
  return (await q.getPosition.get(positionId)) as PositionRow;
}

export async function cancelOrder(userId: string, orderId: string, actorUserId?: string): Promise<OrderRow> {
  return tx(async () => {
    const order = (await q.getUserOrder.get(orderId, userId)) as OrderRow | undefined;
    if (!order) throw notFound("Ордер не найден");
    if (order.status !== "NEW") throw conflict("ORDER_NOT_ACTIVE", "Ордер уже не активен");

    // Release the held margin, and give the placement fee back to the wallets
    // that paid it, in the proportions they paid (refundFee reads the original
    // rows rather than recomputing the split, so a bonus balance that changed
    // in between cannot turn a bonus-paid fee into a real-money refund).
    //
    // The fee used to stay taken. Charging for an order that never filled and
    // keeping it when the client withdraws the order is a fee for nothing;
    // the exit fee on a position that did open is untouched by this.
    await postLedger({
      userId, type: "MARGIN_RELEASE", amountScaled: asBig(order.margin_scaled),
      refType: "ORDER", refId: order.id, note: "Отмена ордера", actorUserId,
    });
    await refundFee({ userId, refType: "ORDER", refId: order.id,
      note: "Возврат комиссии за отменённый ордер", actorUserId });
    await q.cancelOrderStmt.run(now(), order.id);
    return (await q.getOrder.get(order.id)) as OrderRow;
  });
}

export type CloseReason = "MANUAL" | "TAKE_PROFIT" | "STOP_LOSS" | "LIQUIDATION" | "ADMIN";

/** Closes a position: releases margin, settles PnL, charges the exit fee. */
export async function closePositionRow(
  position: PositionRow,
  exitScaled: bigint,
  reason: CloseReason,
  actorUserId?: string
) {
  const side = position.side as Side;
  const qty = asBig(position.qty_scaled);
  const entry = asBig(position.entry_scaled);
  const margin = asBig(position.margin_scaled);
  const pnl = pnlFor(side, qty, entry, exitScaled);
  const fee = feeFor(notional(qty, exitScaled));

  // A liquidated trader cannot lose more than the margin they posted.
  const settled = reason === "LIQUIDATION" ? -margin : pnl;

  await postLedger({ userId: position.user_id, type: "MARGIN_RELEASE", amountScaled: margin,
    refType: "POSITION", refId: position.id, note: `Возврат маржи ${position.symbol}`, actorUserId });
  await postLedger({ userId: position.user_id, type: "PNL", amountScaled: settled,
    refType: "POSITION", refId: position.id, note: `${reason} ${position.symbol}`,
    actorUserId, allowNegative: true });
  // allowNegative: a close is never refused over its fee. The position
  // already exists and the margin released just above is right there; blocking
  // the exit would trap the client in the trade, which is a far worse outcome
  // than a balance that dips below zero and is settled against the next
  // deposit. Bonus still pays first.
  await chargeFee({ userId: position.user_id, amountScaled: fee,
    refType: "POSITION", refId: position.id, note: `Комиссия закрытия ${position.symbol}`,
    actorUserId, allowNegative: true });

  const ts = now();
  await q.closePositionStmt.run(ts, position.id);
  const tradeId = newId();
  await q.insTrade.run({
    id: tradeId, userId: position.user_id, positionId: position.id, symbol: position.symbol,
    side: position.side, qty, entry, exit: exitScaled, pnl: settled, fee, reason, closedAt: ts,
  });
  return { id: tradeId, symbol: position.symbol, side: position.side, qty_scaled: qty,
    entry_scaled: entry, exit_scaled: exitScaled, pnl_scaled: settled, fee_scaled: fee,
    close_reason: reason, closed_at: ts };
}

/**
 * Re-levers an open position in place: the notional (qty × entry) never
 * changes, only how much margin backs it, so this just holds the extra
 * margin (or releases the surplus) and recomputes the liquidation price for
 * the new leverage — the same formulas used when the position was opened.
 */
export async function changeLeverage(userId: string, positionId: string, newLeverage: number): Promise<PositionRow> {
  return tx(async () => {
    const position = (await q.getUserPosition.get(positionId, userId)) as PositionRow | undefined;
    if (!position) throw notFound("Открытая позиция не найдена");

    const ins = (await q.instrument.get(position.symbol)) as any;
    const maxLev = asNum(ins.max_leverage);
    if (newLeverage < 1 || newLeverage > maxLev) {
      throw badRequest("INVALID_LEVERAGE", `Плечо для ${position.symbol} должно быть от 1x до ${maxLev}x`);
    }
    const safeLev = maxSafeLeverage();
    if (newLeverage > safeLev) {
      throw badRequest("UNSAFE_LEVERAGE", `Плечо выше ${safeLev}x приводит к мгновенной ликвидации при текущих требованиях к марже`);
    }

    const side = position.side as Side;
    const qty = asBig(position.qty_scaled);
    const entry = asBig(position.entry_scaled);
    const oldMargin = asBig(position.margin_scaled);
    const newMargin = marginFor(notional(qty, entry), newLeverage);
    if (newMargin <= 0n) throw badRequest("TOO_SMALL", "Слишком маленький объём для этого плеча");

    const delta = newMargin - oldMargin;
    if (delta > 0n) {
      await postLedger({ userId, type: "MARGIN_HOLD", amountScaled: -delta,
        refType: "POSITION", refId: positionId, note: `Смена плеча ${position.symbol} → ${newLeverage}x` });
    } else if (delta < 0n) {
      await postLedger({ userId, type: "MARGIN_RELEASE", amountScaled: -delta,
        refType: "POSITION", refId: positionId, note: `Смена плеча ${position.symbol} → ${newLeverage}x` });
    }

    await q.updateLeverage.run(newLeverage, newMargin, liquidationPrice(side, entry, newLeverage), positionId);
    return (await q.getPosition.get(positionId)) as PositionRow;
  });
}

export async function closePositionById(
  userId: string, positionId: string,
  reason: CloseReason = "MANUAL", actorUserId?: string
) {
  return tx(async () => {
    const position = (await q.getUserPosition.get(positionId, userId)) as PositionRow | undefined;
    if (!position) throw notFound("Открытая позиция не найдена");
    return closePositionRow(position, await tradeableMark(position.symbol), reason, actorUserId);
  });
}

export const queries = q;
