import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../store/auth";
import { IconArrowRight } from "../../icons/Icon";
import { buttonCls } from "../../../lib/ui";
import { useInView } from "../../../hooks/useInView";
import {
  At, DirectionMarker, GridLines, LANDING_WRAP, LEVELS, Node, SIGNATURE, SectionLabel, Stroke, TechLabel, toPath,
} from "./primitives";

/**
 * The hero's line, reprised: same levels, same trajectory, but reduced to
 * where it is heading — only the last fill and the direction are marked.
 * `focal` is the same extensible slot the hero has.
 */
function CtaVisual({ className, focal }: { className?: string; focal?: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const [lx, ly] = SIGNATURE[SIGNATURE.length - 3];

  return (
    <div ref={ref} aria-hidden className={className}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {LEVELS.map((y) => (
          <Stroke key={y} d={`M0,${y} L100,${y}`} className="stroke-line" dashed width={1} />
        ))}
      </svg>
      <div className="landing-reveal absolute inset-0" data-shown={inView}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <Stroke d={toPath(SIGNATURE)} className="stroke-accent" width={2} />
        </svg>
        <At x={lx} y={ly}><Node /></At>
        <At x={96} y={6}><DirectionMarker /></At>
      </div>
      {focal && <div className="absolute inset-0">{focal}</div>}
    </div>
  );
}

/**
 * Bookends the hero as its mirror: there the copy is left and the chart runs
 * off the right edge; here the chart runs off the left and the copy closes
 * on the right, so the page ends where the line does.
 */
export function FinalCtaSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <section aria-labelledby="cta-title" className="relative overflow-hidden bg-bg-0">
      <GridLines id="cta-grid" />

      <div className={`${LANDING_WRAP} relative grid lg:min-h-[480px] lg:grid-cols-12`}>
        <div className="relative z-10 flex flex-col justify-center py-16 sm:py-20 lg:col-span-5 lg:col-start-8 lg:py-24">
          <SectionLabel index="05" label="Next" />
          <h2 id="cta-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
            {t("home.landing.ctaTitle")}
          </h2>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-txt-2">{t("home.landing.ctaBody")}</p>
          <div className="mt-8">
            <button
              onClick={() => navigate(user ? "/terminal" : "/register")}
              className={buttonCls("primary", "lg", "tap gap-2 rounded-full px-6")}
            >
              {t("home.landing.heroCta")} <IconArrowRight size={15} />
            </button>
          </div>
          <p className="mt-8 max-w-sm text-2xs leading-relaxed text-txt-3">{t("home.landing.ctaRisk")}</p>
        </div>
      </div>

      <CtaVisual className="relative h-56 border-t border-line sm:h-72 lg:absolute lg:inset-y-0 lg:left-0 lg:right-1/2 lg:h-auto lg:border-r lg:border-t-0" />
      <div className="absolute left-4 top-4 hidden sm:left-6 sm:top-6 lg:block">
        <TechLabel>Illustrative</TechLabel>
      </div>
    </section>
  );
}
