import { useEffect, useMemo, useRef } from "react";
import { ChartEngine, type GridLevel } from "../../lib/chartEngine";
import { chartThemeFor } from "../../lib/chartTheme";
import { useThemeStore } from "../../store/theme";
import { useChartBars } from "../../hooks/useMarket";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { LoadingRow } from "../common/States";
import type { Timeframe } from "../../lib/types";

interface Props {
  symbol: string;
  lower: number;
  upper: number;
  levels: number;
  timeframe?: Timeframe;
}

// Showing the full ~1000-bar page (weeks of history) made a tight grid band
// vanish as a sliver near one edge whenever price had trended hard over that
// whole window — the axis autoscaled to the trend, not to the grid. Zooming
// the preview to a recent slice keeps the visible price swing comparable to
// the grid's own range so the levels are actually legible.
const PREVIEW_BARS = 240;

/** Renders the actual candles for the bot's symbol with its planned grid
 * lines drawn directly on the price axis — so you can see before starting a
 * bot whether the range makes sense against where price has actually been. */
export function GridPreviewChart({ symbol, lower, upper, levels, timeframe = "1H" }: Props) {
  const inst = useLiveInstrument(symbol);
  const { data, isLoading } = useChartBars(symbol, inst?.category, timeframe);
  const theme = useThemeStore((s) => s.theme);
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new ChartEngine(containerRef.current);
    engine.setTheme(chartThemeFor(useThemeStore.getState().theme));
    engineRef.current = engine;
    return () => engine.destroy();
  }, []);

  useEffect(() => engineRef.current?.setTheme(chartThemeFor(theme)), [theme]);
  useEffect(() => engineRef.current?.setPriceDecimals(inst?.priceDecimals ?? 2), [inst?.priceDecimals]);

  const recentBars = useMemo(() => (data?.bars?.length ? data.bars.slice(-PREVIEW_BARS) : []), [data]);

  useEffect(() => {
    if (recentBars.length) engineRef.current?.setData(recentBars);
  }, [recentBars]);

  const gridLevels = useMemo<GridLevel[]>(() => {
    if (!(upper > lower) || levels < 1 || !recentBars.length) return [];
    const step = (upper - lower) / levels;
    const price = recentBars[recentBars.length - 1].close;
    const out: GridLevel[] = [];
    for (let i = 0; i <= levels; i++) {
      const p = lower + step * i;
      out.push({ price: p, side: p < price ? "BUY" : "SELL" });
    }
    return out;
  }, [lower, upper, levels, data]);

  useEffect(() => engineRef.current?.setGridLevels(gridLevels), [gridLevels]);

  return (
    <div className="relative h-full min-h-[220px] rounded border border-line-soft">
      <div ref={containerRef} className="absolute inset-0" />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-0/50">
          <LoadingRow label="Загрузка графика…" />
        </div>
      )}
    </div>
  );
}
