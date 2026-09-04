import { db, asBig } from "../db.js";
import { out, pctOf } from "./money.js";
import { pnlFor, type Side } from "../engine/risk.js";
import { markPrice } from "../engine/execution.js";
import { sOrder, sPosition, sTrade, sLedger } from "../routes/serialize.js";

/**
 * A read-only snapshot of one account: balances, open positions, open orders,
 * recent trades, recent ledger entries. Both `routes/trading.ts`'s own
 * `/account` and `routes/admin.ts`'s per-user detail view already compute a
 * version of this inline; this file exists so the CRM's two new places that
 * need the same numbers (a manager's account view, and the one-time
 * impersonation snapshot) don't become a third copy of the same arithmetic.
 * The two existing call sites are left as they are — they are shipped,
 * tested, and not part of this change.
 */

const q = {
  account: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  positions: db.prepare("SELECT * FROM positions WHERE user_id = ? AND status = 'OPEN' ORDER BY opened_at DESC"),
  openOrders: db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'NEW' ORDER BY created_at DESC"),
  // Joined to the position it closed so a trade also carries when it was
  // opened and at what leverage — both live on the position, and the CRM's
  // trade editor needs to show them as current values before changing them.
  trades: db.prepare(`
    SELECT t.*, p.opened_at AS opened_at, p.leverage AS leverage
    FROM trades t LEFT JOIN positions p ON p.id = t.position_id
    WHERE t.user_id = ? ORDER BY t.closed_at DESC LIMIT 50
  `),
  allTrades: db.prepare("SELECT pnl_scaled FROM trades WHERE user_id = ?"),
  ledger: db.prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 50"),
  savings: db.prepare("SELECT COALESCE(SUM(balance_scaled), 0) AS n FROM savings_accounts WHERE user_id = ? AND status = 'ACTIVE'"),
};

export async function accountSnapshot(userId: string) {
  const acc = (await q.account.get(userId)) as { cash_scaled: bigint } | undefined;
  const positionsRaw = (await q.positions.all(userId)) as any[];
  const openOrdersRaw = (await q.openOrders.all(userId)) as any[];
  const tradesRaw = (await q.trades.all(userId)) as any[];
  const allTrades = (await q.allTrades.all(userId)) as any[];
  const ledgerRaw = (await q.ledger.all(userId)) as any[];

  const cash = acc ? asBig(acc.cash_scaled) : 0n;
  const usedMargin = positionsRaw.reduce((s, p) => s + asBig(p.margin_scaled), 0n);
  const lockedMargin = openOrdersRaw.reduce((s, o) => s + asBig(o.margin_scaled), 0n);

  let unrealised = 0n;
  const positions = [];
  for (const p of positionsRaw) {
    const mark = (await markPrice(p.symbol)) ?? asBig(p.entry_scaled);
    unrealised += pnlFor(p.side as Side, asBig(p.qty_scaled), asBig(p.entry_scaled), mark);
    positions.push(sPosition(p, mark));
  }

  const realised = allTrades.reduce((s, t) => s + asBig(t.pnl_scaled), 0n);
  const savings = asBig(((await q.savings.get(userId)) as any).n);
  const equity = cash + usedMargin + lockedMargin + unrealised + savings;

  return {
    summary: {
      cash: out(cash, 2), usedMargin: out(usedMargin, 2), lockedMargin: out(lockedMargin, 2),
      savings: out(savings, 2), unrealisedPnl: out(unrealised, 2), realisedPnl: out(realised, 2),
      equity: out(equity, 2), marginUsagePct: pctOf(usedMargin, equity),
    },
    positions,
    openOrders: openOrdersRaw.map(sOrder),
    trades: tradesRaw.map(sTrade),
    ledger: ledgerRaw.map(sLedger),
  };
}
