import { useMemo, useState } from "react";
import { useAccount, useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { classNames, fmtSigned, n } from "../../lib/format";
import { EmptyRow, ErrorRow, LoadingRow } from "../common/States";

type Range = "7D" | "1M";
const RANGE_MS: Record<Range, number> = { "7D": 7 * 86_400_000, "1M": 30 * 86_400_000 };

const W = 600;
const H = 120;

/**
 * The whole account over time — both wallets, replayed from both journals.
 *
 * Charting one journal was actively misleading. Cash alone drops off a cliff
 * the moment a position reserves margin or money is moved to spot, and
 * futures-only does the same on a transfer: nothing was lost, but the line
 * says −88%. The total has to net those internal movements out, so this walks
 * the cash journal and the spot journal together:
 *
 *   total(t) = futures cash + margin held + spot USD + what the spot assets cost
 *
 * Each of those four is exact from the journals. MARGIN_HOLD/RELEASE cancel
 * against the cash they moved; a Spot↔Futures transfer cancels between the two
 * wallets; a purchase cancels spot USD against the asset's recorded USD value
 * (spot_ledger.usd_value_scaled, written for exactly this). What is left
 * moving the line is real: deposits, withdrawals, fees and realised P&L.
 *
 * The one thing no journal can give back is what an asset was *worth* at some
 * past moment — a held BTC's price then, or an open position's float then;
 * neither is stored anywhere. So history is carried at recorded value, and the
 * final point is today's live Total Balance, mark-to-market. The gap between
 * them is unrealised market movement, and the caption says so rather than
 * letting the reader assume the whole curve is marked.
 */
function useTotalSeries(range: Range) {
  const ledger = useLedger(true);
  const spot = useSpotLedger(true);
  const account = useAccount(true);

  const points = useMemo(() => {
    const cash = ledger.data?.entries ?? [];
    const assets = spot.data?.entries ?? [];
    if (cash.length === 0 && assets.length === 0) return [];

    type Row = { t: number; kind: "cash" | "spot"; e: any };
    const rows: Row[] = [
      ...cash.map((e) => ({ t: new Date(e.createdAt).getTime(), kind: "cash" as const, e })),
      ...assets.map((e) => ({ t: new Date(e.createdAt).getTime(), kind: "spot" as const, e })),
    ].sort((a, b) => a.t - b.t);

    let futuresCash = 0, heldMargin = 0, spotUsd = 0, assetCost = 0;
    const all: { t: number; v: number }[] = [];
    for (const { t, kind, e } of rows) {
      if (kind === "cash") {
        // balanceAfter is absolute, so cash self-corrects even if the journal
        // window starts mid-history; margin can only be accumulated.
        futuresCash = n(e.balanceAfter);
        if (e.type === "MARGIN_HOLD") heldMargin += Math.abs(n(e.amount));
        else if (e.type === "MARGIN_RELEASE") heldMargin = Math.max(0, heldMargin - Math.abs(n(e.amount)));
      } else if (e.asset === "USD") {
        spotUsd = n(e.balanceAfter);
      } else {
        // Signed by the leg's direction: buying adds what it cost, selling
        // removes what it was recorded at.
        const qty = n(e.qty);
        const usd = n(e.usdValue);
        assetCost += (qty < 0 ? -1 : 1) * Math.abs(usd);
      }
      all.push({ t, v: futuresCash + heldMargin + spotUsd + assetCost });
    }

    const cutoff = Date.now() - RANGE_MS[range];
    const within = all.filter((p) => p.t >= cutoff);
    const before = all.filter((p) => p.t < cutoff).at(-1);
    const series = before ? [{ t: cutoff, v: before.v }, ...within] : within;
    if (series.length === 0) return [];

    // Land the right edge on the live figure printed directly above the chart.
    const liveTotal = account.data ? n(account.data.totalBalance) : series[series.length - 1].v;
    series.push({ t: Date.now(), v: liveTotal });
    return series;
  }, [ledger.data, spot.data, account.data, range]);

  return {
    points,
    isLoading: ledger.isLoading || spot.isLoading,
    isError: ledger.isError || spot.isError,
    refetch: () => { ledger.refetch(); spot.refetch(); },
  };
}

/** Catmull-Rom through the points, converted to cubic béziers — a curve that
 * actually passes through every reading rather than a spline that rounds the
 * corners off the data. */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function EquityChart() {
  const [range, setRange] = useState<Range>("7D");
  const { points, isLoading, isError, refetch } = useTotalSeries(range);

  const first = points[0]?.v;
  const last = points.at(-1)?.v;
  const change = first !== undefined && last !== undefined ? last - first : null;
  const changePct = first ? ((change ?? 0) / first) * 100 : null;
  // How far today's marked value sits from the last recorded point — the
  // unrealised part, spot appreciation and open-position float together.
  const lastRecorded = points.length > 1 ? points[points.length - 2].v : null;
  const unrealised = lastRecorded !== null && last !== undefined ? last - lastRecorded : 0;

  const geometry = useMemo(() => {
    if (points.length < 2) return null;
    const ts = points.map((p) => p.t);
    const vs = points.map((p) => p.v);
    const tMin = Math.min(...ts), tMax = Math.max(...ts);
    const vMin = Math.min(...vs), vMax = Math.max(...vs);
    // A flat line would otherwise divide by zero and collapse onto the top
    // edge; padding the range keeps it centred.
    const span = vMax - vMin || Math.max(1, Math.abs(vMax) * 0.02);
    const pad = span * 0.12;
    const lo = vMin - pad, hi = vMax + pad;
    const xy = points.map((p) => ({
      x: tMax === tMin ? W : ((p.t - tMin) / (tMax - tMin)) * W,
      y: H - ((p.v - lo) / (hi - lo)) * H,
    }));
    const line = smoothPath(xy);
    return { line, area: `${line} L ${W} ${H} L 0 ${H} Z` };
  }, [points]);

  return (
    <div className="rounded-xl border border-line-soft bg-bg-2/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Total Balance History</div>
          {change !== null && (
            <div className={classNames("tabular text-xs font-medium", change >= 0 ? "text-buy" : "text-sell")}>
              {fmtSigned(change)} ({changePct?.toFixed(1)}%) за {range === "7D" ? "7 дней" : "30 дней"}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-0.5 rounded-lg border border-line p-0.5">
          {(["7D", "1M"] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={classNames(
                "btn-fx rounded-md px-2.5 py-1 text-2xs font-semibold",
                range === r ? "bg-warn/15 text-warn" : "text-txt-3 hover:text-txt-1"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <LoadingRow />}
      {isError && <ErrorRow label="Не удалось загрузить историю" onRetry={() => refetch()} />}
      {!isLoading && !isError && !geometry && <EmptyRow label="Пока недостаточно операций для графика" />}

      {geometry && (
        // Static by design: no pan, no pinch-zoom, no crosshair. This is a
        // glance at the trend directly under the balance it belongs to, and a
        // chart that moves under the thumb here would fight the page's own
        // scroll on every touch.
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="pointer-events-none h-28 w-full select-none"
          aria-hidden
        >
          <defs>
            <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--c-warn))" stopOpacity="0.28" />
              <stop offset="100%" stopColor="rgb(var(--c-warn))" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geometry.area} fill="url(#equityFill)" />
          <path
            d={geometry.line}
            fill="none"
            stroke="rgb(var(--c-warn))"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      <div className="mt-1.5 text-[9px] leading-snug text-txt-3">
        Оба кошелька: спот по стоимости покупки плюс фьючерсы с маржой. Переводы между кошельками не
        двигают линию — это одни и те же деньги.
        {Math.abs(unrealised) >= 0.01 &&
          ` Правый край — сегодняшняя рыночная оценка, она отличается от последней записи на ${fmtSigned(unrealised)} за счёт нереализованной переоценки.`}
      </div>
    </div>
  );
}
