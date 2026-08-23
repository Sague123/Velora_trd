import { db, newId, now, asBig } from "../db.js";
import { conflict, notFound } from "./errors.js";

export type LedgerType =
  | "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_OUT" | "TRANSFER_IN" | "MARGIN_HOLD" | "MARGIN_RELEASE"
  | "PNL" | "FEE" | "ADMIN_ADJUSTMENT";

export interface LedgerMove {
  userId: string;
  type: LedgerType;
  /** signed: positive credits the account, negative debits it */
  amountScaled: bigint;
  refType?: string;
  refId?: string;
  note?: string;
  actorUserId?: string;
  /** only realised losses may push a balance negative */
  allowNegative?: boolean;
}

const selAccount = db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?");
const updAccount = db.prepare("UPDATE accounts SET cash_scaled = ?, updated_at = ? WHERE user_id = ?");
const insLedger = db.prepare(`
  INSERT INTO ledger_entries (id, user_id, type, amount_scaled, balance_after_scaled,
                              ref_type, ref_id, note, actor_user_id, created_at)
  VALUES (@id, @userId, @type, @amount, @balanceAfter, @refType, @refId, @note, @actorUserId, @createdAt)
`);

/**
 * The ONLY sanctioned way to move money. Writes an immutable journal row with
 * every balance change, so a balance can always be re-derived from the ledger.
 * Must be called inside tx().
 */
export async function postLedger(move: LedgerMove): Promise<bigint> {
  const row = (await selAccount.get(move.userId)) as { cash_scaled: bigint } | undefined;
  if (!row) throw notFound("Счёт не найден");

  const next = asBig(row.cash_scaled) + move.amountScaled;
  if (next < 0n && !move.allowNegative) {
    throw conflict("INSUFFICIENT_FUNDS", "Недостаточно средств на счёте");
  }

  const ts = now();
  await updAccount.run(next, ts, move.userId);
  await insLedger.run({
    id: newId(),
    userId: move.userId,
    type: move.type,
    amount: move.amountScaled,
    balanceAfter: next,
    refType: move.refType ?? null,
    refId: move.refId ?? null,
    note: move.note ?? null,
    actorUserId: move.actorUserId ?? null,
    createdAt: ts,
  });
  return next;
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
