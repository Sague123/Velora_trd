import { db, newId, now, asBig } from "../db.js";
import { conflict, notFound, badRequest } from "./errors.js";

/**
 * The only place money moves.
 *
 * Two wallets live on one account row (see db.ts): `real` is what the client
 * put in — withdrawable, backs margin, settles PnL — and `bonus` is what the
 * desk granted, which backs nothing and can only pay fees. Every journal row
 * moves exactly one of them, so each wallet's balance is the sum of its own
 * rows and nothing else. That is the invariant the money tests assert, and
 * the reason a fee split across both writes two rows rather than one row with
 * two columns.
 */

export type Wallet = "real" | "bonus";

export type LedgerType =
  | "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_OUT" | "TRANSFER_IN" | "MARGIN_HOLD" | "MARGIN_RELEASE"
  | "PNL" | "FEE" | "ADMIN_ADJUSTMENT"
  // Granted and withdrawn by the desk. Bonus enters the system here and
  // leaves it as FEE on the bonus wallet; nothing else touches it.
  | "BONUS_GRANT" | "BONUS_REVOKE"
  // The $10 000 accounts used to be opened with. Kept so the journal still
  // sums to the balance it produced, typed apart so it counts as neither a
  // deposit nor withdrawable money. Never written again — see config.ts.
  | "LEGACY_DEMO"
  // Savings moves the same money between the trading balance and a savings
  // account, so it goes through this journal like everything else: the cash
  // balance stays reconstructible from these rows alone, and the savings
  // principal is the running total of DEPOSIT minus WITHDRAWAL against it.
  | "SAVINGS_DEPOSIT" | "SAVINGS_WITHDRAWAL" | "SAVINGS_INTEREST"
  // The futures side of a spot<->futures transfer. The spot side is journalled
  // separately in spot_ledger (quantities of an asset, not dollars), so these
  // two rows are what keeps the *cash* balance reconstructible from this
  // table alone, exactly as before spot existed.
  | "SPOT_TRANSFER_IN" | "SPOT_TRANSFER_OUT";

/** Types that are the client's own money arriving or leaving. Everything else
 * is internal movement (margin, PnL, fees, transfers between our own wallets)
 * or granted money, and none of it belongs in "Вложено". */
export const DEPOSIT_TYPES: LedgerType[] = ["DEPOSIT"];
export const WITHDRAWAL_TYPES: LedgerType[] = ["WITHDRAWAL"];

export interface LedgerMove {
  userId: string;
  type: LedgerType;
  /** Defaults to the real wallet, which is what every pre-existing call site
   * meant and still means. Only bonus grants, revocations and the bonus half
   * of a fee pass anything else. */
  wallet?: Wallet;
  /** signed: positive credits the account, negative debits it */
  amountScaled: bigint;
  refType?: string;
  refId?: string;
  note?: string;
  actorUserId?: string;
  /** only realised losses may push a balance negative */
  allowNegative?: boolean;
  /**
   * De-duplication key, unique across the whole journal. A retried request
   * that carries the key it used the first time gets the balance that first
   * call produced instead of moving the money twice.
   */
  idemKey?: string;
}

const COLUMN: Record<Wallet, string> = { real: "cash_scaled", bonus: "bonus_scaled" };

/**
 * Reads and LOCKS the account row for the rest of the transaction.
 *
 * FOR UPDATE is the whole point. Without it two concurrent debits both read
 * the same starting balance, each computes an absolute new value from it, and
 * the second write silently discards the first — the classic lost update. The
 * UPDATE below takes a row lock too, but only after the arithmetic has
 * already been done on a stale number, which is too late. Serialising here
 * means the second transaction waits and then reads the first one's result.
 */
const lockAccount = db.prepare(
  "SELECT cash_scaled, bonus_scaled FROM accounts WHERE user_id = ? FOR UPDATE"
);
const byIdemKey = db.prepare(
  "SELECT balance_after_scaled FROM ledger_entries WHERE idem_key = ?"
);
const insLedger = db.prepare(`
  INSERT INTO ledger_entries (id, user_id, wallet, type, amount_scaled, balance_after_scaled,
                              ref_type, ref_id, note, actor_user_id, idem_key, created_at)
  VALUES (@id, @userId, @wallet, @type, @amount, @balanceAfter, @refType, @refId, @note,
          @actorUserId, @idemKey, @createdAt)
`);

/**
 * Writes one immutable journal row and moves the wallet it names. Must be
 * called inside tx() — the row lock it takes is only held for a transaction.
 *
 * Returns the wallet's balance after the move.
 */
export async function postLedger(move: LedgerMove): Promise<bigint> {
  const wallet: Wallet = move.wallet ?? "real";

  if (move.idemKey) {
    const seen = (await byIdemKey.get(move.idemKey)) as { balance_after_scaled: bigint } | undefined;
    // Already applied. Hand back what it produced rather than doing it again;
    // the caller cannot tell the difference, which is the point.
    if (seen) return asBig(seen.balance_after_scaled);
  }

  const row = (await lockAccount.get(move.userId)) as
    { cash_scaled: bigint; bonus_scaled: bigint } | undefined;
  if (!row) throw notFound("Счёт не найден");

  const current = wallet === "real" ? asBig(row.cash_scaled) : asBig(row.bonus_scaled);
  const next = current + move.amountScaled;

  if (next < 0n && !(move.allowNegative && wallet === "real")) {
    // A bonus wallet has no overdraft at all: granted money that went negative
    // would be the platform lending against its own promotion. Only a realised
    // loss on real money may go below zero, and only because the position it
    // settles was already taken.
    throw conflict("INSUFFICIENT_FUNDS",
      wallet === "bonus" ? "Недостаточно бонусных средств" : "Недостаточно средств на счёте");
  }

  const ts = now();
  await db.prepare(
    `UPDATE accounts SET ${COLUMN[wallet]} = ?, updated_at = ? WHERE user_id = ?`
  ).run(next, ts, move.userId);
  await insLedger.run({
    id: newId(),
    userId: move.userId,
    wallet,
    type: move.type,
    amount: move.amountScaled,
    balanceAfter: next,
    refType: move.refType ?? null,
    refId: move.refId ?? null,
    note: move.note ?? null,
    actorUserId: move.actorUserId ?? null,
    idemKey: move.idemKey ?? null,
    createdAt: ts,
  });
  return next;
}

/** How a fee was actually paid. Both halves are non-negative magnitudes. */
export interface FeeSplit {
  fromBonus: bigint;
  fromReal: bigint;
}

const readBonus = db.prepare("SELECT bonus_scaled FROM accounts WHERE user_id = ? FOR UPDATE");

/**
 * Charges a fee: bonus first, the remainder from real.
 *
 * `allowNegative` is what separates opening from closing. Opening a position
 * is refused outright when the client cannot pay — and because the whole
 * placement runs in one transaction, that refusal rolls back the margin hold
 * with it, so a rejected order leaves nothing behind. Closing one is never
 * refused: the position already exists, the margin being released is right
 * there, and blocking an exit over a fee would trap a client in a trade. The
 * engine's close path already passed allowNegative for exactly that reason.
 *
 * Returns the split, which is what a refund mirrors so each wallet gets back
 * precisely what it paid.
 */
export async function chargeFee(input: {
  userId: string;
  amountScaled: bigint;
  refType?: string;
  refId?: string;
  note?: string;
  actorUserId?: string;
  allowNegative?: boolean;
}): Promise<FeeSplit> {
  if (input.amountScaled < 0n) throw badRequest("INVALID_FEE", "Комиссия не может быть отрицательной");
  if (input.amountScaled === 0n) return { fromBonus: 0n, fromReal: 0n };

  const acc = (await readBonus.get(input.userId)) as { bonus_scaled: bigint } | undefined;
  if (!acc) throw notFound("Счёт не найден");

  const bonusAvailable = asBig(acc.bonus_scaled);
  const fromBonus = bonusAvailable < input.amountScaled ? bonusAvailable : input.amountScaled;
  const fromReal = input.amountScaled - fromBonus;

  if (fromBonus > 0n) {
    await postLedger({
      userId: input.userId, wallet: "bonus", type: "FEE", amountScaled: -fromBonus,
      refType: input.refType, refId: input.refId, note: input.note, actorUserId: input.actorUserId,
    });
  }
  if (fromReal > 0n) {
    await postLedger({
      userId: input.userId, wallet: "real", type: "FEE", amountScaled: -fromReal,
      refType: input.refType, refId: input.refId, note: input.note,
      actorUserId: input.actorUserId, allowNegative: input.allowNegative,
    });
  }
  return { fromBonus, fromReal };
}

const feeRowsFor = db.prepare(`
  SELECT wallet, SUM(-amount_scaled) AS paid FROM ledger_entries
  WHERE user_id = @userId AND type = 'FEE' AND ref_type = @refType AND ref_id = @refId
  GROUP BY wallet
`);

/**
 * Gives a fee back to the wallets that paid it, in the proportions they paid.
 *
 * Reading the original rows rather than recomputing the split is what keeps a
 * refund honest: the bonus balance may have changed since, and recomputing
 * would hand real money back for a fee that bonus actually covered.
 */
export async function refundFee(input: {
  userId: string;
  refType: string;
  refId: string;
  note?: string;
  actorUserId?: string;
}): Promise<FeeSplit> {
  const rows = (await feeRowsFor.all({
    userId: input.userId, refType: input.refType, refId: input.refId,
  })) as { wallet: Wallet; paid: bigint }[];

  const split: FeeSplit = { fromBonus: 0n, fromReal: 0n };
  for (const row of rows) {
    const paid = asBig(row.paid);
    if (paid <= 0n) continue;
    await postLedger({
      userId: input.userId, wallet: row.wallet, type: "FEE", amountScaled: paid,
      refType: input.refType, refId: input.refId,
      note: input.note ?? "Возврат комиссии", actorUserId: input.actorUserId,
    });
    if (row.wallet === "bonus") split.fromBonus = paid;
    else split.fromReal = paid;
  }
  return split;
}

const insAudit = db.prepare(`
  INSERT INTO audit_logs (id, actor_id, target_user_id, action, meta, ip, created_at)
  VALUES (@id, @actorId, @targetUserId, @action, @meta, @ip, @createdAt)
`);

export async function audit(entry: {
  actorId?: string | null;
  targetUserId?: string | null;
  action: string;
  meta?: unknown;
  ip?: string;
}): Promise<void> {
  await insAudit.run({
    id: newId(),
    actorId: entry.actorId ?? null,
    targetUserId: entry.targetUserId ?? null,
    action: entry.action,
    meta: entry.meta === undefined ? null : JSON.stringify(entry.meta),
    ip: entry.ip ?? null,
    createdAt: now(),
  });
}
