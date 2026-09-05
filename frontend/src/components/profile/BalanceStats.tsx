import { useMemo, type ReactNode } from "react";
import { useAccount, useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { useAuthStore } from "../../store/auth";
import { classNames, fmtRate, fmtSigned, fmtUsd } from "../../lib/format";
import { ErrorRow, SkeletonBar } from "../common/States";

function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: "buy" | "sell"; sub?: string }) {
  return (
    <div className="rounded border border-line bg-bg-1 px-3 py-2.5">
      <div className="text-2xs text-txt-2">{label}</div>
      <div className={classNames("mt-1 tabular text-base font-semibold", tone === "buy" && "text-buy", tone === "sell" && "text-sell", !tone && "text-txt-0")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-2xs text-txt-3">{sub}</div>}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="rounded border border-line bg-bg-1 px-3 py-2.5">
      <SkeletonBar width="55%" height={10} />
      <div className="mt-1.5">
        <SkeletonBar width="40%" height={18} />
      </div>
    </div>
  );
}

/** One labelled cluster of figures. Twelve identically-sized cards in one
 * flat grid read as a spreadsheet dump: nothing tells you that Equity and
 * Total Deposited answer completely different questions. The heading is the
 * cheapest thing that restores that. */
function StatGroup({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-baseline gap-2">
        <h3 className="text-2xs font-semibold uppercase tracking-wide text-txt-2">{title}</h3>
        {hint && <span className="text-2xs text-txt-3">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export function BalanceStats() {
  const user = useAuthStore((s) => s.user);
  const account = useAccount(!!user);
  const ledger = useLedger(!!user);
  const spot = useSpotLedger(!!user);

  const stats = useMemo(() => {
    let deposited = 0, withdrawn = 0, transferIn = 0, transferOut = 0, fees = 0;

    // The cash journal. Deposits and withdrawals only appear here for accounts
    // funded before money moved to the spot wallet (and for the registration
    // credit, which still lands in futures) — they are counted because that
    // money is just as real, not because new ones arrive this way.
    // SPOT_TRANSFER_* rows are deliberately skipped: moving money between two
    // of your own wallets is not a contribution, and counting it would make
    // ROI swing every time someone topped up their margin.
    for (const e of ledger.data?.entries ?? []) {
      const amt = Number(e.amount);
      if (e.type === "DEPOSIT") deposited += amt;
      else if (e.type === "WITHDRAWAL") withdrawn += Math.abs(amt);
      else if (e.type === "TRANSFER_IN") transferIn += amt;
      else if (e.type === "TRANSFER_OUT") transferOut += Math.abs(amt);
      else if (e.type === "FEE") fees += Math.abs(amt);
    }

    // The spot journal, where deposits, withdrawals and peer transfers live
    // now. Only its USD rows: a BTC purchase moves value between two assets
    // the account already owns, so it is neither money in nor money out.
    for (const e of spot.data?.entries ?? []) {
      if (e.asset !== "USD") continue;
      const qty = Number(e.qty);
      if (e.type === "DEPOSIT") deposited += qty;
      else if (e.type === "WITHDRAWAL") withdrawn += Math.abs(qty);
    }

    const netContributions = deposited - withdrawn + transferIn - transferOut;
    // Measured against everything the account holds, not against futures
    // equity alone — otherwise moving money into the spot wallet reads as a
    // catastrophic loss, which is exactly what it looked like before.
    const total = account.data ? Number(account.data.totalBalance) : null;
    const roi = total !== null && netContributions > 0 ? ((total - netContributions) / netContributions) * 100 : null;
    return { deposited, withdrawn, transferIn, transferOut, fees, netContributions, roi };
  }, [ledger.data, spot.data, account.data]);

  if (account.isLoading || ledger.isLoading || spot.isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 11 }).map((_, i) => <StatSkeleton key={i} />)}
      </div>
    );
  }
  if (account.isError || ledger.isError) return <ErrorRow label="Не удалось загрузить статистику" onRetry={() => { account.refetch(); ledger.refetch(); spot.refetch(); }} />;
  if (!account.data) return null;
  const a = account.data;

  return (
    <div className="flex flex-col gap-4">
      {/* Capital first, and on its own wider grid: "how much do I have and how
          is it going" is the question this screen gets opened for. */}
      <StatGroup title="Капитал и результат">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
          <Stat label="Total Balance" value={fmtUsd(a.totalBalance)} sub="спот + фьючерсы" />
          <Stat label="Futures Equity" value={fmtUsd(a.equity)} sub="залог под позиции" />
          <Stat label="Realised PnL" value={fmtSigned(a.realisedPnl)} tone={Number(a.realisedPnl) >= 0 ? "buy" : "sell"} />
          <Stat label="Unrealised PnL" value={fmtSigned(a.unrealisedPnl)} tone={Number(a.unrealisedPnl) >= 0 ? "buy" : "sell"} />
          <Stat label="ROI (net contributions)" value={stats.roi !== null ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—"} tone={stats.roi !== null ? (stats.roi >= 0 ? "buy" : "sell") : undefined} />
        </div>
      </StatGroup>

      <StatGroup title="Движение средств">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Stat label="Total Deposited" value={fmtUsd(stats.deposited)} />
          <Stat label="Total Withdrawn" value={fmtUsd(stats.withdrawn)} />
          <Stat label="Net Transfers" value={fmtSigned(stats.transferIn - stats.transferOut)} tone={stats.transferIn - stats.transferOut >= 0 ? "buy" : "sell"} />
        </div>
      </StatGroup>

      <StatGroup title="Торговая активность">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {/* Every FEE ledger entry — one is booked when an order is placed
              and another when the position closes (engine/execution.ts). The
              History tab's own fee total sums the trade rows instead, which
              only carry the closing fee, so the two figures legitimately
              differ; both now say which half they count rather than showing
              two unexplained numbers for "fees". */}
          <Stat label="Fees Paid" value={fmtUsd(stats.fees, 4)} sub="вход + закрытие" />
          <Stat label="Win Rate" value={a.winRatePct !== null ? fmtRate(a.winRatePct) : "—"} sub={`${a.totalTrades} trades`} />
          <Stat label="Used Margin" value={fmtUsd(a.usedMargin)} sub={`${a.marginUsagePct.toFixed(1)}% of equity`} />
          <Stat label="Open Positions" value={String(a.openPositions)} />
          <Stat label="Open Orders" value={String(a.openOrders)} />
        </div>
      </StatGroup>
    </div>
  );
}
