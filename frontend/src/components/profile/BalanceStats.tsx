import { useMemo } from "react";
import { useAccount, useLedger } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { classNames, fmtRate, fmtSigned, fmtUsd } from "../../lib/format";
import { LoadingRow, ErrorRow } from "../common/States";

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

export function BalanceStats() {
  const user = useAuthStore((s) => s.user);
  const account = useAccount(!!user);
  const ledger = useLedger(!!user);

  const stats = useMemo(() => {
    const entries = ledger.data?.entries ?? [];
    let deposited = 0, withdrawn = 0, transferIn = 0, transferOut = 0, fees = 0;
    for (const e of entries) {
      const amt = Number(e.amount);
      if (e.type === "DEPOSIT") deposited += amt;
      else if (e.type === "WITHDRAWAL") withdrawn += Math.abs(amt);
      else if (e.type === "TRANSFER_IN") transferIn += amt;
      else if (e.type === "TRANSFER_OUT") transferOut += Math.abs(amt);
      else if (e.type === "FEE") fees += Math.abs(amt);
    }
    const netContributions = deposited - withdrawn + transferIn - transferOut;
    const equity = account.data ? Number(account.data.equity) : null;
    const roi = equity !== null && netContributions > 0 ? ((equity - netContributions) / netContributions) * 100 : null;
    return { deposited, withdrawn, transferIn, transferOut, fees, netContributions, roi };
  }, [ledger.data, account.data]);

  if (account.isLoading || ledger.isLoading) return <LoadingRow label="Загрузка статистики…" />;
  if (account.isError || ledger.isError) return <ErrorRow label="Не удалось загрузить статистику" onRetry={() => { account.refetch(); ledger.refetch(); }} />;
  if (!account.data) return null;
  const a = account.data;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      <Stat label="Equity" value={fmtUsd(a.equity)} />
      <Stat label="Realised PnL" value={fmtSigned(a.realisedPnl)} tone={Number(a.realisedPnl) >= 0 ? "buy" : "sell"} />
      <Stat label="Unrealised PnL" value={fmtSigned(a.unrealisedPnl)} tone={Number(a.unrealisedPnl) >= 0 ? "buy" : "sell"} />
      <Stat label="ROI (net contributions)" value={stats.roi !== null ? `${stats.roi >= 0 ? "+" : ""}${stats.roi.toFixed(1)}%` : "—"} tone={stats.roi !== null ? (stats.roi >= 0 ? "buy" : "sell") : undefined} />
      <Stat label="Total Deposited" value={fmtUsd(stats.deposited)} />
      <Stat label="Total Withdrawn" value={fmtUsd(stats.withdrawn)} />
      <Stat label="Net Transfers" value={fmtSigned(stats.transferIn - stats.transferOut)} tone={stats.transferIn - stats.transferOut >= 0 ? "buy" : "sell"} />
      <Stat label="Fees Paid" value={fmtUsd(stats.fees, 4)} />
      <Stat label="Win Rate" value={a.winRatePct !== null ? fmtRate(a.winRatePct) : "—"} sub={`${a.totalTrades} trades`} />
      <Stat label="Used Margin" value={fmtUsd(a.usedMargin)} sub={`${a.marginUsagePct.toFixed(1)}% of equity`} />
      <Stat label="Open Positions" value={String(a.openPositions)} />
      <Stat label="Open Orders" value={String(a.openOrders)} />
    </div>
  );
}
