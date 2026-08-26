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
});

export const sLedger = (e: any) => ({
  id: e.id, type: e.type,
  amount: out(asBig(e.amount_scaled), 2),
  balanceAfter: out(asBig(e.balance_after_scaled), 2),
  note: e.note, actorUserId: e.actor_user_id, createdAt: e.created_at,
});

/* ----------------------------------- CRM ---------------------------------- */

/** Row shape for the leads table: enough to work the list, nothing more. */
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
