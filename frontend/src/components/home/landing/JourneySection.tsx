import { useTranslation } from "react-i18next";
import { useInView } from "../../../hooks/useInView";

import { DirectionMarker, LANDING_WRAP, Node, SectionLabel, Stroke, TechLabel } from "./primitives";

const STAGES = [1, 2, 3, 4] as const;

/**
 * One continuous path, not four cards.
 *
 * Desktop: a 4×4 grid where stage N sits in column N and row 5−N, so the
 * stages climb by construction — no pixel offsets. The path is drawn in the
 * same 0–100 space as the grid (each cell is 25×25), stepping right-then-up
 * through the top-left corner of every stage, and it does not stop at 04: it
 * runs on past the page measure to the edge of the viewport, because the
 * journey doesn't end at "Continue".
 *
 * Below `lg` the same idea becomes a vertical rail ending in a direction
 * marker — a staircase squeezed to 390px would be unreadable.
 */
export function JourneySection() {
  const { t } = useTranslation();
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  return (
    <section aria-labelledby="journey-title" className="overflow-hidden border-y border-line bg-bg-1 py-20 lg:py-28">
      <div className={LANDING_WRAP}>
        <header className="max-w-md">
          <SectionLabel index="02" label="Journey" />
          <h2 id="journey-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0">
            {t("home.landing.journeyTitle")}
          </h2>
        </header>

        <div ref={ref} className="relative mt-12 lg:mt-6 lg:h-[440px]">
          <div aria-hidden className="landing-reveal pointer-events-none absolute inset-0 hidden lg:block" data-shown={inView}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              <Stroke d="M0,75 H25 V50 H50 V25 H75 V0 H100" className="stroke-accent" width={1.5} />
            </svg>
            {/* past stage 04 and off the page measure */}
            <span className="absolute left-full top-0 w-[50vw] border-t border-accent/40" />
          </div>

          <ol className="relative flex flex-col border-l border-line lg:grid lg:h-full lg:grid-cols-4 lg:grid-rows-4 lg:border-l-0">
          {STAGES.map((n) => (
            <li
              key={n}
              style={{ gridColumn: n, gridRow: 5 - n }}
              className="relative pb-10 pl-6 lg:pb-0 lg:pl-5 lg:pt-5"
            >
              <span className="absolute left-0 top-1 -translate-x-1/2 lg:top-0 lg:-translate-y-1/2">
                <Node on="bg-1" />
              </span>
              <TechLabel tone="accent">{String(n).padStart(2, "0")}</TechLabel>
              <h3 className="mt-2 text-base font-semibold text-txt-0">{t(`home.landing.journey${n}Title`)}</h3>
              <p className="mt-1.5 max-w-[15rem] text-xs leading-relaxed text-txt-2">{t(`home.landing.journey${n}Body`)}</p>
            </li>
          ))}
          </ol>
        </div>

        {/* the phone rail's continuation */}
        <div aria-hidden className="flex items-center gap-2 lg:hidden">
          <span className="-translate-x-1/2 rotate-180"><DirectionMarker /></span>
          <TechLabel>{t("home.landing.journeyNext")}</TechLabel>
        </div>
      </div>
    </section>
  );
}
