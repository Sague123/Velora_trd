import { db, asBig, now } from "../db.js";
import { notFound, badRequest } from "./errors.js";
import { notional, marginFor, feeFor, pnlFor, liquidationPrice, type Side } from "../engine/risk.js";
import { out } from "./money.js";

/**
 * Retroactive editing of a client's trade, for testing how the engine's own
 * arithmetic behaves on scenarios that are tedious to reach by trading.
 *
 * This is the one place in the codebase that writes over history. Everything
 * else moves money only through postLedger(), which appends. Here the
 * existing journal rows for the edited trade are rewritten in place and every
 * later row's running balance is recomputed, so the ledger still adds up to
 * the account balance afterwards — the invariant that matters is that the
 * balance is reconstructible from the journal, and that survives. What does
 * not survive is the journal being an untouched record of what happened at
 * the time: an edited trade leaves the ledger looking as though it always had
 * these numbers. That is why the route above this one is gated on an explicit
 * permission plus the client's recorded consent, confirms before saving, and
 * writes what changed into both the audit log and the lead's own history —
 * those records, not the ledger, are what say an edit happened.
 */

const q = {
  trade: db.prepare("SELECT * FROM trades WHERE id = ?"),
  position: db.prepare("SELECT * FROM positions WHERE id = ?"),
  orderForPosition: db.prepare("SELECT * FROM orders WHERE position_id = ? ORDER BY created_at LIMIT 1"),

  updTrade: db.prepare(`
    UPDATE trades SET qty_scaled = @qty, entry_scaled = @entry, exit_scaled = @exit,
                      pnl_scaled = @pnl, fee_scaled = @fee, closed_at = @closedAt
    WHERE id = @id
  `),
  updPosition: db.prepare(`
    UPDATE positions SET qty_scaled = @qty, entry_scaled = @entry, margin_scaled = @margin,
                         leverage = @leverage, liq_scaled = @liq,
                         opened_at = @openedAt, closed_at = @closedAt
    WHERE id = @id
  `),
  updOrder: db.prepare(`
    UPDATE orders SET qty_scaled = @qty, price_scaled = @price, leverage = @leverage,
                      margin_scaled = @margin, fee_scaled = @fee, created_at = @createdAt
    WHERE id = @id
  `),

  /** Close-side rows are addressable: execution.ts writes them with
   * refType 'POSITION' and the position's id. */
  ledgerByRef: db.prepare(`
    SELECT * FROM ledger_entries WHERE ref_type = 'POSITION' AND ref_id = ? AND type = ?
    ORDER BY created_at LIMIT 1
  `),
  /** Entry-side rows are not: they are written before the order id exists, so
   * they carry refType 'ORDER' with a null refId (see execution.ts's
   * placeOrder). They are found by what they must have been instead — the
   * exact amount the order row says was charged, on the right account, at or
   * before the moment the order was created. Matching the amount is what
   * keeps this from touching an unrelated row: a hit means the row holds
   * precisely the figure being replaced. */
  ledgerEntrySide: db.prepare(`
    SELECT * FROM ledger_entries
    WHERE user_id = @userId AND type = @type AND ref_type = 'ORDER' AND ref_id IS NULL
      AND amount_scaled = @amount AND created_at <= @before
    ORDER BY created_at DESC LIMIT 1
  `),
  updLedgerAmount: db.prepare("UPDATE ledger_entries SET amount_scaled = ? WHERE id = ?"),
  updLedgerTime: db.prepare("UPDATE ledger_entries SET created_at = ? WHERE id = ?"),

  chain: db.prepare("SELECT id, amount_scaled FROM ledger_entries WHERE user_id = ? ORDER BY created_at, id"),
  updBalanceAfter: db.prepare("UPDATE ledger_entries SET balance_after_scaled = ? WHERE id = ?"),
  updCash: db.prepare("UPDATE accounts SET cash_scaled = ?, updated_at = ? WHERE user_id = ?"),
};

export interface TradeEditPatch {
  entryPrice?: bigint;
  exitPrice?: bigint;
  qty?: bigint;
  leverage?: number;
  entryTime?: string;
  exitTime?: string;
}

export interface FieldChange {
  field: string;
  from: string;
  to: string;
}

/**
 * Replays the whole journal for one account and rewrites each row's running
 * balance, then sets the account's cash to the final total.
 *
 * Rewriting one row's amount invalidates the `balance_after` of every row
 * after it, and those columns are what the client's ledger view shows — left
 * alone they would each be off by the same delta and read as a balance that
 * jumps for no reason. Replaying from the start rather than patching from the
 * edit forward also means the account lands exactly on the sum of its
 * journal, with no accumulated drift from earlier edits.
 */
async function recomputeBalances(userId: string): Promise<bigint> {
  const rows = (await q.chain.all(userId)) as { id: string; amount_scaled: bigint }[];
  let running = 0n;
  for (const row of rows) {
    running += asBig(row.amount_scaled);
    await q.updBalanceAfter.run(running, row.id);
  }
  await q.updCash.run(running, now(), userId);
  return running;
}

/** `out` is typed for nullable columns; everything formatted here is a
 * computed bigint, so the null branch is unreachable — narrowing it once
 * beats an `!` at each of the dozen call sites below. */
const money = (v: bigint): string => out(v, 2) as string;
const qtyText = (v: bigint): string => out(v, 8) as string;

/**
 * Applies `patch` to a closed trade and brings everything derived from it back
 * into agreement: the position and order rows it came from, the journal rows
 * that moved the money, and the account balance.
 *
 * Returns the field-level diff, which the caller writes to the audit log and
 * the lead card — this function deliberately records nothing itself, so that
 * the "what changed" narrative has exactly one author.
 */
export async function rewriteClosedTrade(
  tradeId: string,
  patch: TradeEditPatch,
  expectUserId: string
): Promise<{ changes: FieldChange[]; balance: bigint }> {
  const trade = (await q.trade.get(tradeId)) as any;
  if (!trade) throw notFound("Сделка не найдена");
  if (trade.user_id !== expectUserId) throw notFound("Сделка не найдена");

  const position = trade.position_id ? ((await q.position.get(trade.position_id)) as any) : null;
  const order = position ? ((await q.orderForPosition.get(position.id)) as any) : null;

  const side = trade.side as Side;
  const oldQty = asBig(trade.qty_scaled);
  const oldEntry = asBig(trade.entry_scaled);
  const oldExit = asBig(trade.exit_scaled);
  const oldPnl = asBig(trade.pnl_scaled);
  const oldExitFee = asBig(trade.fee_scaled);
  const oldLeverage: number = position?.leverage ?? order?.leverage ?? 1;
  const oldMargin = position ? asBig(position.margin_scaled) : order ? asBig(order.margin_scaled) : 0n;
  const oldEntryFee = order ? asBig(order.fee_scaled) : 0n;

  const qty = patch.qty ?? oldQty;
  const entry = patch.entryPrice ?? oldEntry;
  const exit = patch.exitPrice ?? oldExit;
  const leverage = patch.leverage ?? oldLeverage;
  const openedAt = patch.entryTime ?? position?.opened_at ?? order?.created_at ?? trade.closed_at;
  const closedAt = patch.exitTime ?? trade.closed_at;

  if (qty <= 0n) throw badRequest("BAD_QTY", "Количество должно быть больше нуля");
  if (entry <= 0n || exit <= 0n) throw badRequest("BAD_PRICE", "Цены должны быть больше нуля");
  if (closedAt < openedAt) throw badRequest("BAD_TIME", "Время закрытия не может быть раньше времени входа");

  // Same functions the engine itself uses (engine/risk.ts), not a second copy
  // of the formulas — the point of this tool is to check what the engine
  // would produce, which it cannot do if the recalculation is its own
  // implementation that can drift.
  const entryNotional = notional(qty, entry);
  const newMargin = marginFor(entryNotional, leverage);
  const newEntryFee = feeFor(entryNotional);
  const newExitFee = feeFor(notional(qty, exit));
  const newLiq = liquidationPrice(side, entry, leverage);
  // A liquidation is capped at the margin posted, exactly as closePositionRow
  // decides it — editing must not turn a liquidation into a trade that lost
  // more (or less) than the margin that was on the line.
  const rawPnl = pnlFor(side, qty, entry, exit);
  const newPnl = trade.close_reason === "LIQUIDATION" ? -newMargin : rawPnl;

  const changes: FieldChange[] = [];
  const track = (field: string, from: string, to: string) => {
    if (from !== to) changes.push({ field, from, to });
  };
  track("Entry Price", money(oldEntry), money(entry));
  track("Exit Price", money(oldExit), money(exit));
  track("Qty", qtyText(oldQty), qtyText(qty));
  track("Leverage", `${oldLeverage}x`, `${leverage}x`);
  track("Entry Time", position?.opened_at ?? order?.created_at ?? "—", openedAt);
  track("Exit Time", trade.closed_at, closedAt);
  track("P&L", money(oldPnl), money(newPnl));
  track("Комиссия закрытия", money(oldExitFee), money(newExitFee));
  if (order) track("Комиссия входа", money(oldEntryFee), money(newEntryFee));
  track("Маржа", money(oldMargin), money(newMargin));

  if (changes.length === 0) return { changes, balance: await recomputeBalances(expectUserId) };

  await q.updTrade.run({
    id: tradeId, qty, entry, exit, pnl: newPnl, fee: newExitFee, closedAt,
  });

  if (position) {
    await q.updPosition.run({
      id: position.id, qty, entry, margin: newMargin, leverage,
      liq: newLiq, openedAt, closedAt,
    });
  }
  if (order) {
    await q.updOrder.run({
      id: order.id, qty, price: entry, leverage,
      margin: newMargin, fee: newEntryFee, createdAt: openedAt,
    });
  }

  if (position) {
    // Close side: addressable by the position id these rows were written with.
    const release = (await q.ledgerByRef.get(position.id, "MARGIN_RELEASE")) as any;
    if (release) {
      await q.updLedgerAmount.run(newMargin, release.id);
      await q.updLedgerTime.run(closedAt, release.id);
    }
    const pnlRow = (await q.ledgerByRef.get(position.id, "PNL")) as any;
    if (pnlRow) {
      await q.updLedgerAmount.run(newPnl, pnlRow.id);
      await q.updLedgerTime.run(closedAt, pnlRow.id);
    }
    const feeRow = (await q.ledgerByRef.get(position.id, "FEE")) as any;
    if (feeRow) {
      await q.updLedgerAmount.run(-newExitFee, feeRow.id);
      await q.updLedgerTime.run(closedAt, feeRow.id);
    }
  }

  if (order) {
    // Entry side: matched on the amounts the order row says were charged.
    // A miss here is not an error — an older account may predate these rows
    // carrying a ref_type at all — it just means that component keeps its
    // original value, and the balance still reconciles because the chain is
    // recomputed from whatever the journal actually holds.
    const hold = (await q.ledgerEntrySide.get({
      userId: expectUserId, type: "MARGIN_HOLD", amount: -oldMargin, before: order.created_at,
    })) as any;
    if (hold) {
      await q.updLedgerAmount.run(-newMargin, hold.id);
      await q.updLedgerTime.run(openedAt, hold.id);
    }
    const entryFeeRow = (await q.ledgerEntrySide.get({
      userId: expectUserId, type: "FEE", amount: -oldEntryFee, before: order.created_at,
    })) as any;
    if (entryFeeRow) {
      await q.updLedgerAmount.run(-newEntryFee, entryFeeRow.id);
      await q.updLedgerTime.run(openedAt, entryFeeRow.id);
    }
  }

  const balance = await recomputeBalances(expectUserId);
  return { changes, balance };
}

/**
 * The same edit for a position that is still open. There is no exit yet, so
 * there is no P&L to settle: what changes is the margin held against the
 * account and, with it, the price at which the position would be liquidated.
 */
export async function rewriteOpenPosition(
  positionId: string,
  patch: TradeEditPatch,
  expectUserId: string
): Promise<{ changes: FieldChange[]; balance: bigint }> {
  const position = (await q.position.get(positionId)) as any;
  if (!position) throw notFound("Позиция не найдена");
  if (position.user_id !== expectUserId) throw notFound("Позиция не найдена");
  if (position.status !== "OPEN") throw badRequest("NOT_OPEN", "Позиция уже закрыта — правьте её как сделку");

  const order = (await q.orderForPosition.get(position.id)) as any;
  const side = position.side as Side;
  const oldQty = asBig(position.qty_scaled);
  const oldEntry = asBig(position.entry_scaled);
  const oldMargin = asBig(position.margin_scaled);
  const oldLeverage: number = position.leverage ?? 1;
  const oldEntryFee = order ? asBig(order.fee_scaled) : 0n;

  const qty = patch.qty ?? oldQty;
  const entry = patch.entryPrice ?? oldEntry;
  const leverage = patch.leverage ?? oldLeverage;
  const openedAt = patch.entryTime ?? position.opened_at;

  if (qty <= 0n) throw badRequest("BAD_QTY", "Количество должно быть больше нуля");
  if (entry <= 0n) throw badRequest("BAD_PRICE", "Цена должна быть больше нуля");

  const entryNotional = notional(qty, entry);
  const newMargin = marginFor(entryNotional, leverage);
  const newEntryFee = feeFor(entryNotional);
  const newLiq = liquidationPrice(side, entry, leverage);

  const changes: FieldChange[] = [];
  const track = (field: string, from: string, to: string) => {
    if (from !== to) changes.push({ field, from, to });
  };
  track("Entry Price", money(oldEntry), money(entry));
  track("Qty", qtyText(oldQty), qtyText(qty));
  track("Leverage", `${oldLeverage}x`, `${leverage}x`);
  track("Entry Time", position.opened_at, openedAt);
  track("Маржа", money(oldMargin), money(newMargin));
  if (order) track("Комиссия входа", money(oldEntryFee), money(newEntryFee));

  if (changes.length === 0) return { changes, balance: await recomputeBalances(expectUserId) };

  await q.updPosition.run({
    id: position.id, qty, entry, margin: newMargin, leverage,
    liq: newLiq, openedAt, closedAt: position.closed_at,
  });
  if (order) {
    await q.updOrder.run({
      id: order.id, qty, price: entry, leverage,
      margin: newMargin, fee: newEntryFee, createdAt: openedAt,
    });

    const hold = (await q.ledgerEntrySide.get({
      userId: expectUserId, type: "MARGIN_HOLD", amount: -oldMargin, before: order.created_at,
    })) as any;
    if (hold) {
      await q.updLedgerAmount.run(-newMargin, hold.id);
      await q.updLedgerTime.run(openedAt, hold.id);
    }
    const entryFeeRow = (await q.ledgerEntrySide.get({
      userId: expectUserId, type: "FEE", amount: -oldEntryFee, before: order.created_at,
    })) as any;
    if (entryFeeRow) {
      await q.updLedgerAmount.run(-newEntryFee, entryFeeRow.id);
      await q.updLedgerTime.run(openedAt, entryFeeRow.id);
    }
  }

  const balance = await recomputeBalances(expectUserId);
  return { changes, balance };
}
