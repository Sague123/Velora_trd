import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTerminalPreviewBars } from "../../../hooks/useTerminalPreviewBars";
import { CoinBadge } from "../../common/CoinBadge";
import { classNames, fmtPct, fmtPrice } from "../../../lib/format";
import type { Bar } from "../../../lib/chartEngine";

const VIEW_W = 520;
const VIEW_H = 200;
const PAD_TOP = 16;
const PAD_BOTTOM = 16;

/** Plots real OHLC bars as candle bodies + wicks in a fixed internal
 * coordinate system, scaled to fill the container via the SVG's viewBox —
 * hand-rolled rather than pulling in a charting library, same approach the
 * app's own Sparkline and terminal chart engine already use. Bodies grow in
 * from the baseline on mount (transform, not opacity — see globals.css's
 * rise-in convention) so the preview reads as "drawing itself" once, not a
 * looping effect. */
function CandleChart({ bars }: { bars: Bar[] }) {
  const { min, max } = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (const b of bars) { lo = Math.min(lo, b.low); hi = Math.max(hi, b.high); }
    return { min: lo, max: hi };
  }, [bars]);

  const range = max - min || 1;
  const plotH = VIEW_H - PAD_TOP - PAD_BOTTOM;
  const y = (price: number) => PAD_TOP + plotH - ((price - min) / range) * plotH;
  const slot = VIEW_W / bars.length;
  const bodyW = Math.max(2, slot * 0.55);

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="none"
      className="h-full w-full"
      role="img"
      aria-label="BTC/USDT"
    >
      {bars.map((b, i) => {
        const up = b.close >= b.open;
        const color = up ? "rgb(var(--c-buy))" : "rgb(var(--c-sell))";
        const cx = i * slot + slot / 2;
        const bodyTop = y(Math.max(b.open, b.close));
        const bodyBottom = y(Math.min(b.open, b.close));
        const bodyH = Math.max(1.5, bodyBottom - bodyTop);
        return (
          <g
            key={b.time}
            style={{
              transformOrigin: `${cx}px ${VIEW_H - PAD_BOTTOM}px`,
              animation: "candle-grow 420ms cubic-bezier(0.16,1,0.3,1) both",
              animationDelay: `${i * 18}ms`,
            }}
          >
            <line x1={cx} x2={cx} y1={y(b.high)} y2={y(b.low)} stroke={color} strokeWidth={1} />
            <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color} rx={0.5} />
          </g>
        );
      })}
    </svg>
  );
}

/** One of the three feature call-outs. `pin` positions it over the chart on
 * wider screens (sm+); below that width it renders inline in a stacked list
 * instead — three absolutely-positioned bubbles have nowhere to go on a
 * ~340px-wide preview card without overlapping the candles they're meant to
 * explain. */
function TooltipPin({ n, text, pin }: { n: number; text: string; pin: { top: string; left: string } }) {
  return (
    <div
      className="pointer-events-none absolute z-10 hidden -translate-x-1/2 items-center gap-1.5 sm:flex"
      style={{ top: pin.top, left: pin.left }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-bg-1 text-3xs font-semibold text-accent">
        {n}
      </span>
      <span className="whitespace-nowrap rounded-md border border-line bg-bg-1/95 px-2 py-1 text-3xs text-txt-1 shadow-float backdrop-blur">
        {text}
      </span>
    </div>
  );
}

/**
 * The terminal-as-landing centerpiece: a self-contained marketing rendition
 * of the real trading screen, not a trimmed instance of it. Deliberately its
 * own component (see the design decision this session settled on) — styling
 * it for a hero card and animating a one-time "draw in" would otherwise mean
 * bending the real ChartPanel, which several other pages depend on being
 * exactly itself.
 *
 * Framed as a browser window (address bar + traffic-light dots) rather than
 * a bare card or a phone: the product being sold here is a desktop trading
 * terminal, and a browser chrome says "this is the real product" without
 * claiming to *be* the live app.
 */
export function TerminalShowcase() {
  const { t } = useTranslation();
  const { data: bars, isLoading } = useTerminalPreviewBars();

  const last = bars && bars.length > 0 ? bars[bars.length - 1] : null;
  const first = bars && bars.length > 0 ? bars[0] : null;
  const changePct = last && first && first.open > 0 ? ((last.close - first.open) / first.open) * 100 : null;
  const up = (changePct ?? 0) >= 0;

  const tooltips = [
    t("home.landing.tooltip1"),
    t("home.landing.tooltip2"),
    t("home.landing.tooltip3"),
  ];
  const pins = [
    { top: "8%", left: "28%" },
    { top: "45%", left: "62%" },
    { top: "78%", left: "20%" },
  ];

  return (
    <div className="w-full max-w-md shrink-0 overflow-hidden rounded-xl border border-line bg-bg-1 shadow-float sm:w-[400px]">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-line bg-bg-2 px-3 py-2">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-txt-3/40" />
          <span className="h-2 w-2 rounded-full bg-txt-3/40" />
          <span className="h-2 w-2 rounded-full bg-txt-3/40" />
        </span>
        <span className="mono ml-1 truncate rounded bg-bg-3 px-2 py-0.5 text-3xs text-txt-3">
          velora.trade/terminal
        </span>
      </div>

      <div className="relative p-3">
        <div className="mb-2 flex items-center gap-2">
          <CoinBadge symbol="BTCUSDT" size={22} />
          <div className="min-w-0 flex-1">
            <div className="text-2xs font-medium text-txt-2">BTC/USDT</div>
            <div className="tabular text-sm font-bold text-txt-0">
              {last ? fmtPrice(last.close, 2) : "—"}
            </div>
          </div>
          {changePct !== null && (
            <span
              className={classNames(
                "shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold tabular",
                up ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell"
              )}
            >
              {fmtPct(changePct)}
            </span>
          )}
        </div>

        <div className="relative h-[160px] w-full">
          {isLoading && (
            <div className="skeleton h-full w-full rounded" />
          )}
          {!isLoading && bars && bars.length > 1 && <CandleChart bars={bars} />}
          {!isLoading && (!bars || bars.length <= 1) && (
            <div className="flex h-full w-full items-center justify-center text-2xs text-txt-3">
              {t("home.landing.chartUnavailable")}
            </div>
          )}

          {!isLoading && bars && bars.length > 1 && tooltips.map((text, i) => (
            <TooltipPin key={i} n={i + 1} text={text} pin={pins[i]} />
          ))}
        </div>

        <div className="mt-2 text-3xs text-txt-3">{t("home.landing.dataWindowNote")}</div>

        {/* Mobile fallback for the three call-outs — see TooltipPin's doc. */}
        {!isLoading && bars && bars.length > 1 && (
          <ul className="mt-2 grid gap-1 sm:hidden">
            {tooltips.map((text, i) => (
              <li key={i} className="flex items-start gap-1.5 text-3xs text-txt-2">
                <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border border-accent/50 text-3xs font-semibold text-accent">
                  {i + 1}
                </span>
                {text}
              </li>
            ))}
          </ul>
        )}

        <button className="btn-fx tap-sm mt-3 w-full rounded-lg border border-line bg-bg-2 py-2 text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent">
          {t("home.landing.terminalCta")}
        </button>
      </div>
    </div>
  );
}
