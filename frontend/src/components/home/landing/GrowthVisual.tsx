import { useTranslation } from "react-i18next";
import { AnimatedNumber } from "../../common/AnimatedNumber";
import { IconTrendUp } from "../../icons/Icon";
import { useInView } from "../../../hooks/useInView";

const LINE_POINTS = "0,150 48,130 96,145 144,100 192,120 240,75 288,95 336,55 384,70 432,25 480,40";
const LINE_PATH = `M${LINE_POINTS.split(" ").join(" L")}`;
const AREA_PATH = `${LINE_PATH} L480,200 L0,200 Z`;

/**
 * Replaces the earlier real terminal screenshot in the hero: a screenshot of
 * the actual app inevitably carries whatever state it happened to be in
 * (stale-quote banners, a loading order book, mixed locales from a captured
 * session) — none of that belongs on a page meant to sell the idea of the
 * product. This is a purpose-built illustration instead: a line that draws
 * itself in (stroke-dashoffset, not opacity — an interrupted/failed observer
 * leaves it fully drawn, never stuck invisible, same guarantee as the rest
 * of the app's entrance motion) plus two counters that count up from zero.
 * Both values are clearly captioned as a demo, per the platform's own rule
 * against dressing illustrative numbers up as real ones.
 */
export function GrowthVisual() {
  const { t } = useTranslation();
  const { ref, inView } = useInView<HTMLDivElement>(0.4);

  return (
    <div ref={ref} className="anim-rise-1 relative overflow-hidden rounded-xl border border-line bg-bg-1 p-6 shadow-lift sm:p-8">
      <div className="hero-glow" />

      <div className="relative flex flex-wrap items-start justify-between gap-5">
        <div>
          <div className="text-2xs font-medium uppercase tracking-wide text-txt-3">{t("home.landing.heroGrowthLabel")}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <IconTrendUp size={20} className="text-buy" />
            <AnimatedNumber
              value={inView ? 24.7 : 0}
              format={(n) => `+${n.toFixed(1)}%`}
              durationMs={900}
              className="tabular text-2xl font-bold text-buy drop-shadow-[0_0_14px_rgb(var(--c-buy)/0.35)] sm:text-3xl"
            />
          </div>
        </div>

        <div className="text-right">
          <div className="text-2xs font-medium uppercase tracking-wide text-txt-3">{t("home.landing.heroDemoBalanceLabel")}</div>
          <AnimatedNumber
            value={inView ? 12480 : 0}
            format={(n) => `$${Math.round(n).toLocaleString("en-US")}`}
            durationMs={900}
            className="tabular mt-1 block text-2xl font-bold text-txt-0 sm:text-3xl"
          />
        </div>
      </div>

      <div className="relative mt-6 h-36 w-full sm:h-48">
        <svg viewBox="0 0 480 200" preserveAspectRatio="none" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="heroGrowthFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgb(var(--c-buy))" stopOpacity="0.32" />
              <stop offset="100%" stopColor="rgb(var(--c-buy))" stopOpacity="0" />
            </linearGradient>
            <clipPath id="heroGrowthReveal">
              <rect x="0" y="0" width={inView ? 480 : 0} height="200" style={{ transition: "width 900ms cubic-bezier(0.16, 1, 0.3, 1)" }} />
            </clipPath>
          </defs>
          <g clipPath="url(#heroGrowthReveal)">
            <path d={AREA_PATH} fill="url(#heroGrowthFill)" stroke="none" />
            <path d={LINE_PATH} fill="none" className="stroke-buy" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <circle cx="480" cy="40" r="5" className="fill-buy" />
        </svg>
      </div>

      <p className="relative mt-4 text-2xs text-txt-3">{t("home.landing.automatedIllustrativeLabel")}</p>
    </div>
  );
}
