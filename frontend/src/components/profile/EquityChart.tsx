import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { useAccount, useLedger } from "../../hooks/useTrading";
import { useSpotLedger } from "../../hooks/useSpot";
import { classNames, fmtSigned, n } from "../../lib/format";
import { EmptyRow, ErrorRow, LoadingRow } from "../common/States";
import { Tabs } from "../common/Tabs";

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
 * final point is today's live Total Balance, mark-to-market — the rest of the
 * curve is at recorded value, not re-priced day by day.
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
    ];

    // A transfer, buy/sell or convert writes one journal row per leg — a
    // Spot<->Futures transfer touches both journals, a trade touches two rows
    // of the same one — and each leg's own recorded value is only ever
    // designed to cancel against the *other* leg, never to stand on its own.
    // Walking the legs as separate, sequentially-timestamped points meant the
    // instant between them rendered as money briefly lost or gained in
    // transit — a real dip-and-recover spike on the line, not a display
    // artifact, and it got worse the further apart the two legs' timestamps
    // ended up (backdating one side of a position through the trade-edit tool
    // is exactly that). The backend already links every multi-row operation
    // with a shared refId (routes/spot.ts, lib/ledger.ts); grouping by it
    // applies both legs at once, so the running total only ever moves by what
    // the operation actually added or removed.
    const groups = new Map<string, Row[]>();
    for (const row of rows) {
      const key = row.e.refId ? `${row.e.refType}:${row.e.refId}` : `solo:${row.kind}:${row.e.id}`;
      const group = groups.get(key);
      if (group) group.push(row);
      else groups.set(key, [row]);
    }
    // Grouping by refId doesn't cover every same-instant pair — an order's
    // entry-side margin-hold and its entry fee are written before the order's
    // own id exists to key off (see tradeRewrite.ts's ledgerEntrySide comment),
    // so they carry no shared refId at all and land as two separate solo
    // batches here. When that happens their relative order still has to match
    // how the backend itself replayed them to produce the balanceAfter each
    // one carries — `ORDER BY created_at, id` in lib/tradeRewrite.ts's chain
    // query — because reading one row's absolute balanceAfter only makes
    // sense as "the state right after this row, in that same replay order".
    // /api/ledger's own query has no id tiebreak, so two rows sharing a
    // timestamp can come back in either order; sorting by id here, the same
    // way the backend does, is what makes them line up again.
    const idOf = (group: Row[]) => group.map((r) => r.e.id as string).sort()[0];
    const batches = [...groups.values()]
      .map((group) => ({
        t: Math.max(...group.map((r) => r.t)),
        rows: [...group].sort((a, b) => (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0)),
      }))
      .sort((a, b) => a.t - b.t || (idOf(a.rows) < idOf(b.rows) ? -1 : idOf(a.rows) > idOf(b.rows) ? 1 : 0));

    let futuresCash = 0, heldMargin = 0, spotUsd = 0, assetCost = 0;
    const all: { t: number; v: number }[] = [];
    for (const { t, rows: legs } of batches) {
      for (const { kind, e } of legs) {
        if (kind === "cash") {
          // balanceAfter is absolute, so cash self-corrects even if the
          // journal window starts mid-history; margin can only be accumulated.
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
 * corners off the data.
 *
 * Catmull-Rom control points are extrapolated from the tangent between
 * neighbouring points, so a sharp bend — a long flat run then a steep last
 * leg, exactly what a burst of deposits at the end of a quiet window looks
 * like — can push a control point's y past the data's own min/max. The
 * viewBox's padding only accounts for the plotted points, not that
 * overshoot, so the curve's peak was rendering above y=0 and getting cut
 * off by the SVG's default overflow:hidden. Clamping each control point to
 * the viewBox keeps the curve inside what's actually visible. */
function smoothPath(pts: { x: number; y: number }[], w: number, h: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  const clampX = (x: number) => Math.min(w, Math.max(0, x));
  const clampY = (y: number) => Math.min(h, Math.max(0, y));
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = clampX(p1.x + (p2.x - p0.x) / 6);
    const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
    const c2x = clampX(p2.x - (p3.x - p1.x) / 6);
    const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

export function EquityChart() {
  const { t } = useTranslation();
  const [range, setRange] = useState<Range>("7D");
  const { points, isLoading, isError, refetch } = useTotalSeries(range);

  const first = points[0]?.v;
  const last = points.at(-1)?.v;
  const change = first !== undefined && last !== undefined ? last - first : null;
  // A starting balance under a dollar is a real state (a brand-new account,
  // or a history window that happens to open right after everything was
  // withdrawn) but a division floor for it isn't — over/under a few cents
  // turns any ordinary change into a swing of hundreds of thousands of
  // percent, which is noise dressed up as a number.
  const changePct = first !== undefined && Math.abs(first) >= 1 ? ((change ?? 0) / first) * 100 : null;

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
    const line = smoothPath(xy, W, H);
    return { line, area: `${line} L ${W} ${H} L 0 ${H} Z` };
  }, [points]);

  return (
    <div className="rounded-xl border border-line-soft bg-bg-2/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xs font-semibold uppercase tracking-wide text-txt-2">{t("account.balanceHistory")}</div>
          {change !== null && (
            <div className={classNames("tabular text-xs font-medium", change >= 0 ? "text-buy" : "text-sell")}>
              {fmtSigned(change)}
              {changePct !== null && ` (${changePct.toFixed(1)}%)`} за {range === "7D" ? "7 дней" : "30 дней"}
            </div>
          )}
        </div>
        <Tabs
          className="shrink-0"
          value={range}
          onChange={setRange}
          items={[{ id: "7D" as Range, label: "7D" }, { id: "1M" as Range, label: "1M" }]}
        />
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

      <div className="mt-1.5 text-3xs leading-snug text-txt-3">
        Оба кошелька вместе — переводы между ними не двигают линию.
      </div>
    </div>
  );
}
