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
