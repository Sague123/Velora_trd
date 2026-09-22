import { useTranslation } from "react-i18next";
import { At, LANDING_WRAP, LEVELS, Node, SectionLabel, Stroke, TechLabel, toPath, type Point } from "./primitives";

/**
 * A grid strategy, drawn the way it actually behaves: price oscillates inside
 * a range, every turn lands on a level, and the turns alternate — a trough is
 * a buy filling, a peak is a sell filling. Buy/sell carry their market
 * meaning here and nothing else.
 */
const GRID_PATH: readonly Point[] = [
  [0, 50], [10, 65], [20, 35], [30, 80], [40, 50], [50, 20],
  [60, 65], [70, 35], [80, 50], [90, 20], [100, 35],
];

type Fill = { at: Point; side: "buy" | "sell" };

/** Troughs (larger y = lower price) are buys, peaks are sells. */
const GRID_FILLS: Fill[] = GRID_PATH.slice(1, -1).flatMap((p, i): Fill[] => {
  const prev = GRID_PATH[i][1];
  const next = GRID_PATH[i + 2][1];
  if (p[1] > prev && p[1] > next) return [{ at: p, side: "buy" }];
  if (p[1] < prev && p[1] < next) return [{ at: p, side: "sell" }];
  return [];
});

function AiGridVisual() {
  return (
    <div aria-hidden className="relative h-56 sm:h-64">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {LEVELS.map((y) => (
          <Stroke key={y} d={`M0,${y} L100,${y}`} className="stroke-line" dashed width={1} />
        ))}
        <Stroke d={toPath(GRID_PATH)} className="stroke-accent" width={2} />
      </svg>
      {LEVELS.map((y, i) => (
        <At key={y} x={-4} y={y}><TechLabel>L{i + 1}</TechLabel></At>
      ))}
      {GRID_FILLS.map(({ at: [x, y], side }) => (
        <At key={x} x={x} y={y}><Node tone={side} /></At>
      ))}
    </div>
  );
}

const CAPABILITIES = [
  { key: "Analysis", tag: "SMA · EMA · RSI · MACD" },
  { key: "Intelligence", tag: "24h · Movers" },
  { key: "Execution", tag: "Market · Limit" },
  { key: "Automation", tag: "Grid · Martingale" },
  { key: "Support", tag: "1 : 1" },
  { key: "Security", tag: "2FA · KYC" },
] as const;

/**
 * A system map, not a card grid. One dominant module (AI Grid) with its own
 * working diagram, dropping a connector onto a bus that the six supporting
 * capabilities hang from — so the section reads as parts of one machine.
 *
 * Desktop: the bus runs horizontally and each capability sits on a node on
 * it. Below `lg` the same bus turns into a vertical rail, because six items
 * side by side on a phone would be unreadable, and the rail keeps the idea of
 * "one line, many stations" instead of dissolving into a list.
 */
export function ArsenalSection() {
  const { t } = useTranslation();

  return (
    <section id="arsenal" aria-labelledby="arsenal-title" className="scroll-mt-16 bg-bg-0 py-20 lg:py-28">
      <div className={`${LANDING_WRAP} grid gap-y-12 lg:grid-cols-12 lg:gap-x-6`}>
        <header className="lg:col-span-4">
          <SectionLabel index="01" label="Arsenal" />
          <h2 id="arsenal-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0">
            {t("home.landing.arsenalTitle")}
          </h2>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-txt-2">{t("home.landing.arsenalLead")}</p>
        </header>

        {/* the dominant module — starts on column 5, which is exactly where
            the bus's third station (Execution) sits, so the connector below
            drops straight onto it: the grid's orders go to execution. */}
        <div className="lg:col-span-8 lg:col-start-5">
          <div className="flex items-baseline justify-between gap-4 border-b border-line pb-3">
            <h3 className="flex items-baseline gap-3">
              <TechLabel tone="accent">01</TechLabel>
              <span className="text-lg font-semibold text-txt-0">AI Grid</span>
            </h3>
            <TechLabel className="hidden sm:inline">Range · Levels · Fills</TechLabel>
          </div>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-txt-2">{t("home.landing.capAiGridBody")}</p>
          <div className="mt-6 pl-8">
            <AiGridVisual />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 pl-8">
            <TechLabel><span className="text-buy">●</span> {t("home.landing.gridBuyFill")}</TechLabel>
            <TechLabel><span className="text-sell">●</span> {t("home.landing.gridSellFill")}</TechLabel>
          </div>
        </div>

        {/* the bus */}
        <ol className="relative border-l border-line lg:col-span-12 lg:grid lg:grid-cols-6 lg:border-l-0 lg:border-t">
          {CAPABILITIES.map((c, i) => (
            <li key={c.key} className="relative pb-8 pl-6 last:pb-0 lg:pb-0 lg:pl-0 lg:pr-6 lg:pt-7">
              {/* the connector: spans the row gap exactly (gap-y-12 = h-12) */}
              {c.key === "Execution" && (
                <span aria-hidden className="absolute bottom-full left-0 hidden h-12 border-l border-accent/50 lg:block" />
              )}
              <span className="absolute left-0 top-1.5 -translate-x-1/2 lg:top-0 lg:-translate-y-1/2">
                <Node tone={c.key === "Support" ? "muted" : "accent"} size="sm" />
              </span>
              <TechLabel tone="accent">{String(i + 2).padStart(2, "0")}</TechLabel>
              <h3 className="mt-2 text-sm font-semibold text-txt-0">{t(`home.landing.cap${c.key}`)}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-txt-2">{t(`home.landing.cap${c.key}Body`)}</p>
              <TechLabel className="mt-3 block">{c.tag}</TechLabel>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
