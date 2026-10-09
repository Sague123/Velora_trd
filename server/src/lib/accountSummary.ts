import { db, asBig } from "../db.js";
import { out, pctOf } from "./money.js";
import { pnlFor, type Side } from "../engine/risk.js";
import { markPrice } from "../engine/execution.js";
import { sOrder, sPosition, sTrade, sLedger } from "../routes/serialize.js";
import { spotTotalValue } from "./spot.js";

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
  account: db.prepare("SELECT cash_scaled, bonus_scaled FROM accounts WHERE user_id = ?"),
  // "Вложено": the client's own money in, minus their own money out.
  //
  // Read from spot_ledger, because that is where money enters and leaves the
  // platform (routes/trading.ts's /account/deposit and /account/withdraw).
  // What lands in the futures journal is a transfer between the client's own
  // two wallets, which moves nothing in or out -- summing that would report
  // zero deposited for everyone and count an internal transfer as an
  // investment.
  //
  // Deliberately narrow beyond that too: bonus is granted, not invested; the
  // old $10 000 is LEGACY_DEMO; an ADMIN_ADJUSTMENT is the desk correcting
  // something, not the client sending money. USD legs only, since a BUY of
  // BTC is a quantity of coin rather than dollars.
  deposited: db.prepare(`
    SELECT COALESCE(SUM(qty_scaled), 0) AS n FROM spot_ledger
    WHERE user_id = ? AND asset = 'USD' AND type IN ('DEPOSIT', 'WITHDRAWAL')
  `),
  // What the bonus wallet has paid out in fees over its life, which is the
  // only thing it can be spent on.
  bonusSpent: db.prepare(`
    SELECT COALESCE(SUM(-amount_scaled), 0) AS n FROM ledger_entries
    WHERE user_id = ? AND wallet = 'bonus' AND type = 'FEE' AND amount_scaled < 0
  `),
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
  const acc = (await q.account.get(userId)) as { cash_scaled: bigint; bonus_scaled: bigint } | undefined;
  const positionsRaw = (await q.positions.all(userId)) as any[];
  const openOrdersRaw = (await q.openOrders.all(userId)) as any[];
  const tradesRaw = (await q.trades.all(userId)) as any[];
  const allTrades = (await q.allTrades.all(userId)) as any[];
  const ledgerRaw = (await q.ledger.all(userId)) as any[];

  const cash = acc ? asBig(acc.cash_scaled) : 0n;
  const bonus = acc ? asBig(acc.bonus_scaled) : 0n;
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
  const deposited = asBig(((await q.deposited.get(userId)) as any).n);
  const bonusSpent = asBig(((await q.bonusSpent.get(userId)) as any).n);

  // Everything the client's real money is currently worth, across both
  // wallets.
  //
  // Margin is added back because holding it physically debits cash_scaled (a
  // MARGIN_HOLD row), so the money is posted but not lost -- leaving it out
  // would make equity fall by the margin the moment a position opens.
  //
  // The spot wallet is in here because "Вложено" counts money that entered
  // through it: a client who deposits 1000 and moves 600 to futures has not
  // lost 400, and an equity that only saw the futures side would say they
  // had. Its non-USD holdings are valued at the current mark, the same way
  // open positions are.
  //
  // Bonus is excluded on purpose: it is not the client's money, backs nothing
  // and can never be withdrawn, so counting it here would overstate what the
  // account is worth by exactly the amount the desk gave away.
  const spot = (await spotTotalValue(userId)).total;
  const equity = cash + usedMargin + lockedMargin + unrealised + savings + spot;

  // Withdrawable is free real cash: margin is committed, savings sit in their
  // own account, and bonus is not the client's to take.
  const withdrawable = cash;

  // Profit against what the client actually put in. Guarded at zero deposits,
  // where a percentage has no meaning rather than being infinite.
  const pnlAbs = equity - deposited;
  const pnlPct = deposited > 0n ? pctOf(pnlAbs, deposited) : null;

  return {
    summary: {
      cash: out(cash, 2), usedMargin: out(usedMargin, 2), lockedMargin: out(lockedMargin, 2),
      savings: out(savings, 2), unrealisedPnl: out(unrealised, 2), realisedPnl: out(realised, 2),
      equity: out(equity, 2), marginUsagePct: pctOf(usedMargin, equity),
      /** The real wallet, named for what it is now that there are two. */
      real: out(cash, 2),
      spot: out(spot, 2),
      bonus: out(bonus, 2),
      bonusSpent: out(bonusSpent, 2),
      deposited: out(deposited, 2),
      withdrawable: out(withdrawable, 2),
      pnl: out(pnlAbs, 2),
      pnlPct,
    },
    positions,
    openOrders: openOrdersRaw.map(sOrder),
    trades: tradesRaw.map(sTrade),
    ledger: ledgerRaw.map(sLedger),
  };
}
