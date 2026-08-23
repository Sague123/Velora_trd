import { useAdminStats } from "../../hooks/useAdmin";
import { fmtUsd } from "../../lib/format";
import { LoadingRow, ErrorRow } from "../common/States";
import { classNames } from "../../lib/format";

function Card({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" | "warn" }) {
  return (
    <div className="rounded border border-line bg-bg-1 px-3 py-2.5">
      <div className="text-2xs text-txt-2">{label}</div>
      <div className={classNames("mt-1 tabular text-base font-semibold", tone === "buy" && "text-buy", tone === "sell" && "text-sell", tone === "warn" && "text-warn", !tone && "text-txt-0")}>
        {value}
      </div>
    </div>
  );
}

export function StatsCards() {
  const { data, isLoading, isError, refetch } = useAdminStats(true);

  if (isLoading) return <LoadingRow label="Загрузка статистики…" />;
  if (isError) return <ErrorRow label="Не удалось загрузить статистику" onRetry={() => refetch()} />;
  if (!data) return null;

  const pnl = Number(data.totalRealisedPnl);

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <Card label="Users" value={String(data.users)} />
      <Card label="Active Users" value={String(data.activeUsers)} tone="buy" />
      <Card label="Open Positions" value={String(data.openPositions)} />
      <Card label="Open Orders" value={String(data.openOrders)} />
      <Card label="Closed Trades" value={String(data.closedTrades)} />
      <Card label="Total Cash (all users)" value={fmtUsd(data.totalCash)} />
      <Card label="Total Realised PnL" value={fmtUsd(data.totalRealisedPnl)} tone={pnl >= 0 ? "buy" : "sell"} />
      <Card label="Total Fees" value={fmtUsd(data.totalFees)} tone="warn" />
    </div>
  );
}
