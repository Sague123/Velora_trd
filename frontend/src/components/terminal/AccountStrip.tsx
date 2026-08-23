import { useAccount } from "../../hooks/useTrading";
import { useAuthStore } from "../../store/auth";
import { classNames, fmtRate, fmtSigned, fmtUsd } from "../../lib/format";

function Metric({ label, value, tone }: { label: string; value: string; tone?: "buy" | "sell" | "warn" | "default" }) {
  return (
    <div className="flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-2xs text-txt-2">{label}</span>
      <span
        className={classNames(
          "tabular text-xs font-semibold",
          tone === "buy" && "text-buy",
          tone === "sell" && "text-sell",
          tone === "warn" && "text-warn",
          (!tone || tone === "default") && "text-txt-0"
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function AccountStrip() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading } = useAccount(!!user);

  if (!user) return null;

  const marginUsage = data?.marginUsagePct ?? 0;
  const uPnl = Number(data?.unrealisedPnl ?? 0);
  const freeMargin = data ? Number(data.cash) : 0;

  return (
    <div className="flex h-8 shrink-0 items-center gap-5 overflow-x-auto border-t border-line bg-bg-1 px-3 text-2xs">
      {isLoading && !data ? (
        <span className="text-txt-3">Загрузка счёта…</span>
      ) : data ? (
        <>
          <Metric label="Equity" value={fmtUsd(data.equity)} />
          <Metric label="Free Margin" value={fmtUsd(freeMargin)} />
          <Metric label="Used Margin" value={fmtUsd(data.usedMargin)} />
          <Metric label="Locked (orders)" value={fmtUsd(data.lockedMargin)} />
          <Metric label="Unrealised PnL" value={fmtSigned(data.unrealisedPnl)} tone={uPnl > 0 ? "buy" : uPnl < 0 ? "sell" : "default"} />
          <Metric label="Realised PnL" value={fmtSigned(data.realisedPnl)} tone={Number(data.realisedPnl) >= 0 ? "buy" : "sell"} />
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-txt-2">Margin Usage</span>
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-3">
              <div
                className={classNames("h-full", marginUsage > 80 ? "bg-sell" : marginUsage > 50 ? "bg-warn" : "bg-buy")}
                style={{ width: `${Math.min(100, marginUsage)}%` }}
              />
            </div>
            <span className="tabular text-txt-1">{marginUsage.toFixed(1)}%</span>
          </div>
          <Metric label="Open Positions" value={String(data.openPositions)} />
          <Metric label="Open Orders" value={String(data.openOrders)} />
          {data.winRatePct !== null && <Metric label="Win Rate" value={fmtRate(data.winRatePct)} />}
        </>
      ) : (
        <span className="text-txt-3">Нет данных счёта</span>
      )}
    </div>
  );
}
