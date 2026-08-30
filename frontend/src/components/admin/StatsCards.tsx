import { useAdminStats } from "../../hooks/useAdmin";
import { fmtUsd, n } from "../../lib/format";
import { AnimatedNumber } from "../common/AnimatedNumber";
import { SkeletonBar } from "../common/States";
import { ErrorRow } from "../common/States";
import { classNames } from "../../lib/format";

function Card({ label, value, format, tone }: { label: string; value: number; format: (n: number) => string; tone?: "buy" | "sell" | "warn" }) {
  return (
    <div className="rounded-lg border border-line bg-bg-1 px-3 py-2.5 shadow-none transition-shadow hover:shadow-float">
      <div className="text-2xs text-txt-2">{label}</div>
      <AnimatedNumber
        value={value}
        format={format}
        className={classNames("mt-1 block tabular text-base font-semibold", tone === "buy" && "text-buy", tone === "sell" && "text-sell", tone === "warn" && "text-warn", !tone && "text-txt-0")}
      />
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-lg border border-line bg-bg-1 px-3 py-2.5">
      <SkeletonBar width="60%" height={10} />
      <div className="mt-2"><SkeletonBar width="45%" height={18} /></div>
    </div>
  );
}

export function StatsCards() {
  const { data, isLoading, isError, refetch } = useAdminStats(true);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => <CardSkeleton key={i} />)}
      </div>
    );
  }
  if (isError) return <ErrorRow label="Не удалось загрузить статистику" onRetry={() => refetch()} />;
  if (!data) return null;

  const pnl = Number(data.totalRealisedPnl);
  const int = (v: number) => String(Math.round(v));

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      <Card label="Users" value={data.users} format={int} />
      <Card label="Active Users" value={data.activeUsers} format={int} tone="buy" />
      <Card label="Open Positions" value={data.openPositions} format={int} />
      <Card label="Open Orders" value={data.openOrders} format={int} />
      <Card label="Closed Trades" value={data.closedTrades} format={int} />
      <Card label="Total Cash (all users)" value={n(data.totalCash)} format={fmtUsd} />
      <Card label="Total Realised PnL" value={n(data.totalRealisedPnl)} format={fmtUsd} tone={pnl >= 0 ? "buy" : "sell"} />
      <Card label="Total Fees" value={n(data.totalFees)} format={fmtUsd} tone="warn" />
    </div>
  );
}
