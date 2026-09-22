import { useTranslation } from "react-i18next";
import { classNames } from "../../../lib/format";
import { useInView } from "../../../hooks/useInView";
import { LANDING_WRAP, LEVELS, Node, SIGNATURE, SectionLabel, Stroke, TechLabel, toPath } from "./primitives";

/**
 * Candles derived from the signature line itself: each segment of the line
 * becomes one candle that opens where the segment starts and closes where it
 * ends. The chart and the line can therefore never disagree. A falling y is a
 * rising price, so that candle is a `buy` — direction is the only thing those
 * two colours say anywhere on this page.
 */
const CANDLES = SIGNATURE.slice(0, -1).map(([x0, y0], i) => {
  const [x1, y1] = SIGNATURE[i + 1];
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  return { x: (x0 + x1) / 2, top, bottom, up: y1 < y0 };
});

const BODY_W = 2.4;

function MarketChart() {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  return (
    <div ref={ref} aria-hidden className="relative h-64 border border-line bg-bg-1 sm:h-80">
      <div className="absolute inset-x-4 inset-y-10">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          {LEVELS.map((y) => (
            <Stroke key={y} d={`M0,${y} L100,${y}`} className="stroke-line" dashed width={1} />
          ))}
          {CANDLES.map((c) => (
            <g key={c.x} className={c.up ? "fill-buy/25 stroke-buy" : "fill-sell/25 stroke-sell"}>
              <path d={`M${c.x},${c.top - 3} L${c.x},${c.bottom + 3}`} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <rect
                x={c.x - BODY_W / 2}
                y={c.top}
                width={BODY_W}
                height={Math.max(c.bottom - c.top, 1)}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
        </svg>
        <div className="landing-reveal absolute inset-0" data-shown={inView}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            <Stroke d={toPath(SIGNATURE)} className="stroke-accent" width={1.5} />
          </svg>
        </div>
      </div>
      <div className="absolute inset-x-4 top-3 flex justify-between">
        <TechLabel tone="strong">Candles · Signal</TechLabel>
        <TechLabel>Illustrative</TechLabel>
      </div>
    </div>
  );
}

type Side = "top" | "left" | "right";

/**
 * One annotation on the market system. Its rule is the connector: on the
 * sides it runs on through the gap (gap-x-6 = w-6) to the chart's edge; on
 * top it drops through the row gap (gap-y-6 = h-6) onto the chart.
 */
function Callout({ k, tag, side, className }: { k: string; tag: string; side: Side; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={classNames("relative", side === "top" ? "border-b border-line pb-3" : "border-t border-line pt-3", className)}>
      {side === "left" && <span aria-hidden className="absolute -right-6 -top-px hidden w-6 border-t border-accent/50 lg:block" />}
      {side === "right" && <span aria-hidden className="absolute -left-6 -top-px hidden w-6 border-t border-accent/50 lg:block" />}
      {side === "top" && <span aria-hidden className="absolute left-1/2 top-full hidden h-6 border-l border-accent/50 lg:block" />}
      <h3 className="text-sm font-semibold text-txt-0">{t(`home.landing.mk${k}`)}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-txt-2">{t(`home.landing.mk${k}Body`)}</p>
      <TechLabel className="mt-2 block">{tag}</TechLabel>
    </div>
  );
}

/** Only what the platform actually enforces — every leaf maps to real code. */
const SECURITY = [
  { branch: "Access", leaves: ["sec2fa", "secBackup", "secEmail"] },
  { branch: "Identity", leaves: ["secKyc", "secKycWithdraw"] },
  { branch: "Execution", leaves: ["secStale", "secSlTp"] },
] as const;

/**
 * The market system: one chart in the middle, each capability annotated
 * around it by a rule that physically meets the chart — the product
 * explained as parts of one instrument, not a feature grid. Security is not
 * another callout but the ground the system stands on, so it follows as an
 * architecture tree rooted in the account.
 *
 * Below `lg` the annotations fall under the chart in two columns (one on a
 * phone); the connectors are only drawn where the chart is beside them.
 */
export function MarketsSection() {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="markets-title" className="bg-bg-0 py-20 lg:py-28">
      <div className={LANDING_WRAP}>
        <header className="max-w-md">
          <SectionLabel index="03" label="Markets" />
          <h2 id="markets-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0">
            {t("home.landing.marketsTitle")}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-txt-2">{t("home.landing.marketsLead")}</p>
        </header>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-12">
          <div className="sm:col-span-2 lg:col-span-6 lg:col-start-4 lg:row-span-2 lg:row-start-2">
            <MarketChart />
          </div>
          <Callout k="Spot" tag="Spot · Market · Limit" side="top" className="sm:col-span-2 lg:col-span-6 lg:col-start-4 lg:row-start-1 lg:text-center" />
          <Callout k="Analysis" tag="SMA · EMA · RSI · MACD" side="left" className="lg:col-span-3 lg:col-start-1 lg:row-start-2 lg:mt-8 lg:self-start" />
          <Callout k="Execution" tag="Stop-loss · Take-profit" side="left" className="lg:col-span-3 lg:col-start-1 lg:row-start-3 lg:self-start" />
          <Callout k="Grid" tag="Grid · Martingale" side="right" className="lg:col-span-3 lg:col-start-10 lg:row-start-2 lg:mt-8 lg:self-start" />
          <Callout k="Leverage" tag="Perpetual · Leverage" side="right" className="lg:col-span-3 lg:col-start-10 lg:row-start-3 lg:self-start" />
        </div>

        {/* the security tree */}
        <div className="mt-16 grid gap-y-8 lg:mt-20 lg:grid-cols-12 lg:gap-x-6">
          <div className="relative lg:col-span-3 lg:pt-7">
            <div className="flex items-center gap-2 lg:absolute lg:inset-x-0 lg:top-0 lg:-translate-y-1/2">
              <Node />
              <TechLabel tone="strong">Account</TechLabel>
              <span aria-hidden className="-mr-6 hidden flex-1 border-t border-accent/50 lg:block" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-txt-0 lg:mt-0">{t("home.landing.secTitle")}</h3>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-txt-2">{t("home.landing.secBody")}</p>
          </div>

          <ol className="relative ml-1 border-l border-line lg:col-span-9 lg:ml-0 lg:grid lg:grid-cols-3 lg:border-l-0 lg:border-t">
            {SECURITY.map(({ branch, leaves }) => (
              <li key={branch} className="relative pb-8 pl-6 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-6 lg:pt-7">
                <span className="absolute left-0 top-1.5 -translate-x-1/2 lg:top-0 lg:-translate-y-1/2">
                  <Node size="sm" />
                </span>
                <TechLabel tone="accent">{branch}</TechLabel>
                <ul className="mt-3 space-y-2 border-l border-line-soft pl-3">
                  {leaves.map((leaf) => (
                    <li key={leaf} className="text-xs leading-relaxed text-txt-1">{t(`home.landing.${leaf}`)}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
