import { asBig, asBigOrNull, asNum } from "../db.js";
import { out, pctOf } from "../lib/money.js";
import { pnlFor, notional, type Side } from "../engine/risk.js";

export const sOrder = (o: any) => ({
  id: o.id, symbol: o.symbol, side: o.side, type: o.type,
  qty: out(asBig(o.qty_scaled)), price: out(asBig(o.price_scaled)),
  filledPrice: out(asBigOrNull(o.filled_scaled)),
  leverage: asNum(o.leverage), margin: out(asBig(o.margin_scaled), 2),
  fee: out(asBig(o.fee_scaled), 4),
  takeProfit: out(asBigOrNull(o.tp_scaled)), stopLoss: out(asBigOrNull(o.sl_scaled)),
  status: o.status, createdAt: o.created_at, filledAt: o.filled_at,
});

export const sPosition = (p: any, mark: bigint) => {
  const qty = asBig(p.qty_scaled), entry = asBig(p.entry_scaled), margin = asBig(p.margin_scaled);
  const pnl = pnlFor(p.side as Side, qty, entry, mark);
  return {
    id: p.id, symbol: p.symbol, side: p.side,
    qty: out(qty), entryPrice: out(entry), markPrice: out(mark),
    leverage: asNum(p.leverage), margin: out(margin, 2),
    liquidationPrice: out(asBigOrNull(p.liq_scaled)),
    takeProfit: out(asBigOrNull(p.tp_scaled)), stopLoss: out(asBigOrNull(p.sl_scaled)),
    notional: out(notional(qty, mark), 2),
    unrealisedPnl: out(pnl, 2), roePct: pctOf(pnl, margin),
    openedAt: p.opened_at,
  };
};

export const sTrade = (t: any) => ({
  id: t.id, symbol: t.symbol, side: t.side,
  qty: out(asBig(t.qty_scaled)), entryPrice: out(asBig(t.entry_scaled)),
  exitPrice: out(asBig(t.exit_scaled)), pnl: out(asBig(t.pnl_scaled), 2),
  fee: out(asBig(t.fee_scaled), 4), closeReason: t.close_reason, closedAt: t.closed_at,
  // Both belong to the position this trade closed, and are present only when
  // the query joined it in (see lib/accountSummary.ts). Null elsewhere rather
  // than invented, so a caller can tell "not loaded" from "was 1x".
  openedAt: t.opened_at ?? null,
  leverage: t.leverage ?? null,
});

export const sLedger = (e: any) => ({
  id: e.id, type: e.type,
  amount: out(asBig(e.amount_scaled), 2),
  balanceAfter: out(asBig(e.balance_after_scaled), 2),
  note: e.note, actorUserId: e.actor_user_id, createdAt: e.created_at,
  // Both legs of a Spot<->Futures transfer share one refId (see
  // routes/spot.ts's /transfer) — exposing it is what lets EquityChart tell
  // "one transfer, two journal rows" apart from two unrelated events that
  // just happened to land close together.
  refType: e.ref_type ?? null, refId: e.ref_id ?? null,
});

/* ----------------------------------- CRM ---------------------------------- */

/** Row shape for the leads table: enough to work the list, nothing more. */
/**
 * The state of the Velora account behind a lead — derived from the account
 * relation on every read, never stored as a second column that could drift
 * from the truth.
 *
 * This is deliberately a different axis from the sales stage: a lead can be
 * NOT_INTERESTED and still have a funded, active account, and a lead can be
 * DEPOSITED in the funnel only because someone typed that. Account status is
 * what the platform actually knows.
 */
export type LeadAccountStatus =
  | "NO_ACCOUNT" | "REGISTERED" | "KYC_PENDING" | "KYC_VERIFIED" | "ACTIVE" | "BLOCKED";

export function leadAccountStatus(l: any): LeadAccountStatus {
  if (!l.platform_user_id) return "NO_ACCOUNT";
  if (l.platform_status === "SUSPENDED") return "BLOCKED";
  const kyc = l.platform_kyc_status ?? "NONE";
  if (kyc === "APPROVED") return l.platform_status === "ACTIVE" ? "ACTIVE" : "KYC_VERIFIED";
  if (kyc === "PENDING") return "KYC_PENDING";
  return "REGISTERED";
}

export const sLead = (l: any) => ({
  id: l.id,
  fullName: l.full_name,
  phone: l.phone ?? null,
  email: l.email ?? null,
  country: l.country ?? null,
  source: l.source ?? null,
  status: l.status,
  verificationStatus: l.verification_status,
  assignedManager: l.assigned_manager_id
    ? { id: l.assigned_manager_id, name: l.manager_name, email: l.manager_email }
    : null,
  /** Set once the lead registered on the platform — the list shows it as a
   * badge, because "already a user" changes how the desk works the lead. */
  platformUserId: l.platform_user_id ?? null,
  /** The platform account's number — the human-readable ID a converted lead
   * has, since the lead's own UUID is not something anyone reads aloud on a
   * call. Null until conversion; a prospect who hasn't registered yet has no
   * account to number. */
  accountNumber: l.platform_account_number ?? null,
  /** Derived, see leadAccountStatus — the lead's sales stage and its account
   * state are two different questions and the desk needs both at a glance. */
  accountStatus: leadAccountStatus(l),
  /** When the desk next has to do something, and what. Null = nothing planned,
   * which is itself a state the follow-up filters ask about. */
  nextActionAt: l.next_action_at ?? null,
  nextActionType: l.next_action_type ?? null,
  /** When someone last actually reached this lead — not `updatedAt`, which
   * moves on any edit the client never saw. */
  lastContactAt: l.last_contact_at ?? null,
  createdAt: l.created_at,
  updatedAt: l.updated_at,
});

/**
 * The card. Everything under `platform` is read live from the users table on
 * each request rather than copied into the lead, so it cannot go stale: a
 * balance or a KYC decision that changed a minute ago shows here immediately.
 * Null when the lead has not registered yet.
 */
export const sLeadDetail = (l: any) => ({
  ...sLead(l),
  /**
   * The client's consent for their assigned manager to act on their trades.
   * `valid` is the only field the UI should gate on: consent recorded for a
   * manager who is no longer the assignee doesn't carry over to whoever holds
   * the lead now, and the raw columns are kept alongside so the card can say
   * exactly that instead of silently showing "no consent".
   */
  managerConsent: l.manager_consent_at
    ? {
        at: l.manager_consent_at,
        by: l.manager_consent_by ?? null,
        byName: l.consent_by_name ?? null,
        forManagerId: l.manager_consent_for ?? null,
        valid: !!l.assigned_manager_id && l.manager_consent_for === l.assigned_manager_id,
      }
    : null,
  platform: l.platform_user_id
    ? {
        userId: l.platform_user_id,
        email: l.platform_email,
        name: l.platform_name,
        status: l.platform_status,
        kycStatus: l.platform_kyc_status ?? "NONE",
        emailVerified: l.platform_email_verified === true,
        registeredAt: l.platform_registered_at ?? null,
        // There is no presence tracking on this platform, so "last seen" is the
        // most recent real signal there is: the later of their last login and
        // their last audited action. Labelled as such rather than dressed up as
        // an online indicator the data cannot support.
        lastLoginAt: l.platform_last_login_at ?? null,
        lastActionAt: l.platform_last_action_at ?? null,
        balance: out(asBigOrNull(l.platform_cash_scaled), 2),
        // Latest KYC submission's metadata only — never the document links
        // themselves. A manager sees this much (it's the same figure the
        // account summary already shows); the images require the admin-only
        // /api/admin/kyc/:id, which this id is just enough to call.
        kycSubmissionId: l.kyc_submission_id ?? null,
        kycDocumentType: l.kyc_document_type ?? null,
        kycRejectionReason: l.kyc_rejection_reason ?? null,
        kycReviewedAt: l.kyc_reviewed_at ?? null,
        kycSubmittedAt: l.kyc_submitted_at ?? null,
      }
    : null,
});

export const sLeadComment = (c: any) => ({
  id: c.id,
  text: c.text,
  manager: { id: c.manager_id, name: c.manager_name, email: c.manager_email },
  createdAt: c.created_at,
});

export const sLeadHistory = (h: any) => ({
  id: h.id,
  kind: h.kind,
  oldStatus: h.old_status ?? null,
  newStatus: h.new_status,
  manager: h.manager_id ? { id: h.manager_id, name: h.manager_name } : null,
  createdAt: h.created_at,
});
