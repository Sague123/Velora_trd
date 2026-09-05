import { useEffect, useMemo, useRef, useState } from "react";
import { useChartBars } from "../../hooks/useMarket";
import { classNames, fmtDateTime, fmtPrice } from "../../lib/format";
import { IconClose } from "../icons/Icon";
import type { Category } from "../../lib/types";

export interface PickedPoint {
  /** ISO string, ready to hand straight to a datetime-local field's setter. */
  time: string;
  price: number;
}

const PICKER_TF = "1H" as const;
// Binance hands back at most 1000 bars a page; six pages of 1H candles is
// roughly eight months of history, which is more headroom than a demo
// account's trade history needs and bounds the auto-paging loop below so a
// bogus anchor timestamp can't turn it into an unbounded fetch loop.
const MAX_AUTO_PAGES = 6;

/**
 * Real historical candles for one symbol, with a crosshair a manager can drag
 * across them to pick an exact (time, price) — for backfilling an Entry or
 * Exit that predates any order Velora actually placed. The candles are the
 * same real OHLC the trading chart draws, fetched through the same hook; this
 * is not a mock strip like a sketch's placeholder data.
 *
 * The vertical crosshair snaps to the nearest candle (time has no finer
 * resolution than a bar), but price is a continuous interpolation of the
 * pointer's Y position across the visible range — not rounded to that
 * candle's own O/H/L/C — so a point anywhere inside the wick is reachable.
 */
export function ChartPointPicker({
  symbol, category, priceDecimals, anchorTime, targetLabel, onConfirm, onCancel,
}: {
  symbol: string;
  category: Category | undefined;
  priceDecimals: number;
  /** An existing timestamp already on the field being edited, used only to
   * page far enough back in history that this point is reachable — never to
   * pre-select anything. */
  anchorTime?: string | null;
  targetLabel: string;
  onConfirm: (point: PickedPoint) => void;
  onCancel: () => void;
}) {
  const { data, isLoading, loadMore, hasMore, isLoadingMore } = useChartBars(symbol, category, PICKER_TF);
  const bars = data?.bars ?? [];
  const pagedRef = useRef(0);

  useEffect(() => {
    if (!anchorTime || bars.length === 0 || !hasMore || isLoadingMore) return;
    const anchorSec = Math.floor(new Date(anchorTime).getTime() / 1000);
    if (bars[0].time <= anchorSec || pagedRef.current >= MAX_AUTO_PAGES) return;
    pagedRef.current += 1;
    loadMore();
  }, [anchorTime, bars, hasMore, isLoadingMore, loadMore]);

  const [hover, setHover] = useState<{ time: number; price: number; xPct: number; yPct: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const { minP, maxP } = useMemo(() => {
    if (bars.length === 0) return { minP: 0, maxP: 1 };
    const lo = Math.min(...bars.map((b) => b.low));
    const hi = Math.max(...bars.map((b) => b.high));
    const pad = (hi - lo) * 0.06 || 1;
    return { minP: lo - pad, maxP: hi + pad };
  }, [bars]);

  const W = 1000, H = 320;
  const barW = bars.length ? W / bars.length : W;
  const toY = (p: number) => ((maxP - p) / (maxP - minP)) * H;

  function handleMove(clientX: number, clientY: number) {
    const svg = svgRef.current;
    if (!svg || bars.length === 0) return;
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left, y = clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
    const idx = Math.max(0, Math.min(bars.length - 1, Math.floor((x / rect.width) * bars.length)));
    const bar = bars[idx];
    const yFrac = Math.max(0, Math.min(1, y / rect.height));
    const price = maxP - yFrac * (maxP - minP);
    setHover({ time: bar.time, price, xPct: ((idx + 0.5) / bars.length) * 100, yPct: yFrac * 100 });
  }

  return (
    <div className="rounded-lg border border-line bg-bg-1 p-3">
      <div className="mb-2 flex items-center justify-between">
        <strong className="text-xs font-semibold text-txt-0">Выбрать точку на графике · {targetLabel}</strong>
        <button type="button" onClick={onCancel} className="btn-fx rounded p-1 text-txt-3 hover:text-txt-0">
          <IconClose size={13} />
        </button>
      </div>

      <div
        className="relative h-56 cursor-crosshair overflow-hidden rounded-lg border border-line-soft bg-bg-0"
        onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
        onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
      >
        {isLoading || bars.length === 0 ? (
          <div className="flex h-full items-center justify-center text-2xs text-txt-3">
            {isLoading ? "Загрузка исторических свечей…" : "Нет данных по этому инструменту"}
          </div>
        ) : (
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
            {bars.map((b, i) => {
              const x = i * barW + barW / 2;
              const up = b.close >= b.open;
              const cls = up ? "fill-buy stroke-buy" : "fill-sell stroke-sell";
              const bodyTop = Math.min(toY(b.open), toY(b.close));
              const bodyH = Math.max(2, Math.abs(toY(b.open) - toY(b.close)));
              return (
                <g key={b.time} className={cls} opacity={0.9}>
                  <line x1={x} x2={x} y1={toY(b.high)} y2={toY(b.low)} strokeWidth={Math.max(1, barW * 0.12)} />
                  <rect x={x - barW * 0.32} y={bodyTop} width={barW * 0.64} height={bodyH} stroke="none" />
                </g>
              );
            })}
          </svg>
        )}

        {hover && (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 border-l border-dashed border-accent/70"
              style={{ left: `${hover.xPct}%` }}
            />
            <div
              className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-accent/70"
              style={{ top: `${hover.yPct}%` }}
            />
            <div
              className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-fill glow-accent"
              style={{ left: `${hover.xPct}%`, top: `${hover.yPct}%` }}
            />
          </>
        )}
      </div>

      {hasMore && (
        <button
          type="button"
          onClick={() => loadMore()}
          disabled={isLoadingMore}
          className="btn-fx mt-1.5 w-full rounded border border-line-soft py-1 text-2xs text-txt-3 hover:text-txt-1 disabled:opacity-40"
        >
          {isLoadingMore ? "Загрузка…" : "Показать более старые свечи"}
        </button>
      )}

      <div className="mt-2 flex items-center justify-between rounded-lg border border-line bg-bg-2 px-2.5 py-2">
        {hover ? (
          <>
            <span className="text-2xs text-txt-2">
              Время: <strong className="tabular text-txt-0">{fmtDateTime(new Date(hover.time * 1000).toISOString())}</strong>
            </span>
            <span className="text-2xs text-txt-2">
              Цена: <strong className="tabular text-txt-0">{fmtPrice(hover.price, priceDecimals)}</strong>
            </span>
          </>
        ) : (
          <span className="text-2xs text-txt-3">Проведите курсором (или пальцем) по графику, чтобы выбрать точку</span>
        )}
      </div>

      <button
        type="button"
        disabled={!hover}
        onClick={() => hover && onConfirm({ time: new Date(hover.time * 1000).toISOString(), price: hover.price })}
        className={classNames(
          "btn-fx tap-sm mt-2 w-full rounded-lg py-2 text-xs font-bold transition-colors",
          hover ? "bg-accent-fill text-white hover:brightness-110" : "bg-bg-2 text-txt-3"
        )}
      >
        Использовать эту точку
      </button>
    </div>
  );
}
