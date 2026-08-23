import { useEffect, useMemo, useRef, useState } from "react";
import { ChartEngine, type Bar } from "../../lib/chartEngine";
import { chartThemeFor } from "../../lib/chartTheme";
import { useThemeStore } from "../../store/theme";
import { useLedger } from "../../hooks/useTrading";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
import { classNames, fmtUsd } from "../../lib/format";

type Range = "7D" | "1M";
const RANGE_MS: Record<Range, number> = { "7D": 7 * 86_400_000, "1M": 30 * 86_400_000 };

export function BalanceChart() {
  const { data, isLoading, isError, refetch } = useLedger(true);
  const [range, setRange] = useState<Range>("7D");
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const theme = useThemeStore((s) => s.theme);

  const bars = useMemo<Bar[]>(() => {
    if (!data?.entries.length) return [];
    // ledger comes back newest-first — walk it oldest-first to build a real
    // running balance-over-time series from `balanceAfter` on each entry.
    const asc = [...data.entries].reverse();
    const cutoff = Date.now() - RANGE_MS[range];
    const before = asc.filter((e) => new Date(e.createdAt).getTime() < cutoff).at(-1);
    const within = asc.filter((e) => new Date(e.createdAt).getTime() >= cutoff);
    const points: { t: number; v: number }[] = [];
    if (before) points.push({ t: cutoff, v: Number(before.balanceAfter) });
    for (const e of within) points.push({ t: new Date(e.createdAt).getTime(), v: Number(e.balanceAfter) });
    if (points.length === 0 && asc.length > 0) {
      // account is younger than the window — start from its very first entry
      points.push({ t: new Date(asc[0].createdAt).getTime(), v: Number(asc[0].balanceAfter) });
    }
    if (points.length > 0) points.push({ t: Date.now(), v: points[points.length - 1].v }); // carry forward to now
    return points.map((p) => ({ time: Math.floor(p.t / 1000), open: p.v, high: p.v, low: p.v, close: p.v }));
  }, [data, range]);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new ChartEngine(containerRef.current);
    engine.setKind("area");
    engine.setTheme({ ...chartThemeFor(useThemeStore.getState().theme), bg: "transparent" });
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  useEffect(() => {
    engineRef.current?.setData(bars);
  }, [bars]);

  useEffect(() => {
    engineRef.current?.setTheme({ ...chartThemeFor(theme), bg: "transparent" });
  }, [theme]);

  const first = bars[0]?.close;
  const last = bars.at(-1)?.close;
  const change = first !== undefined && last !== undefined ? last - first : null;
  const changePct = first ? ((change ?? 0) / first) * 100 : null;

  return (
    <div className="rounded border border-line bg-bg-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <div className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Cash Balance History</div>
          {change !== null && (
            <div className={classNames("tabular text-xs font-medium", change >= 0 ? "text-buy" : "text-sell")}>
              {change >= 0 ? "+" : ""}{fmtUsd(change)} ({changePct?.toFixed(1)}%) за {range === "7D" ? "7 дней" : "30 дней"}
            </div>
          )}
        </div>
        <div className="flex gap-0.5 rounded border border-line p-0.5">
          {(["7D", "1M"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={classNames("btn-fx rounded px-2.5 py-1 text-2xs font-medium", range === r ? "bg-accent-soft text-accent" : "text-txt-2")}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="h-40">
        {isLoading && <LoadingRow />}
        {isError && <ErrorRow label="Не удалось загрузить историю баланса" onRetry={() => refetch()} />}
        {!isLoading && !isError && bars.length === 0 && <EmptyRow label="Нет данных леджера" />}
        <div ref={containerRef} className={classNames("h-full w-full", (isLoading || isError || bars.length === 0) && "hidden")} />
      </div>
      <div className="mt-1.5 text-2xs text-txt-3">
        Реальный кэш-баланс из /api/ledger (не эквити — маржа и открытый PnL сюда не входят).
      </div>
    </div>
  );
}
