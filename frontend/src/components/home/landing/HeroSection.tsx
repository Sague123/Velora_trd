import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../store/auth";
import { buttonCls } from "../../../lib/ui";
import { IconArrowRight } from "../../icons/Icon";
import { useInView } from "../../../hooks/useInView";
import {
  At, DirectionMarker, FILLS, GridLines, LANDING_WRAP, LEVELS, Node, SIGNATURE, Stroke, TechLabel, toPath,
} from "./primitives";

const TICKS = ["00:00", "04:00", "08:00", "12:00", "16:00", "20:00", "24:00"];

/**
 * An abstract grid-strategy chart, built from the shared primitives rather
 * than captured from the product: five levels, the signature line crossing
 * them, and a node wherever it lands on one.
 *
 * Layers, back to front: levels → trajectory → annotations → focal → scan.
 * `focal` is where a single large object (the planned mascot) will sit —
 * between the line and the labels, so the market can visibly pass behind it
 * and the annotations stay readable over it. Nothing renders there today,
 * and the composition is balanced without it.
 */
export function HeroMarketVisual({ className, focal }: { className?: string; focal?: ReactNode }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);

  return (
    <div ref={ref} aria-hidden className={className}>
      {/* levels */}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {LEVELS.map((y) => (
          <Stroke key={y} d={`M0,${y} L100,${y}`} className="stroke-line" dashed width={1} />
        ))}
        <Stroke d="M63,0 L63,100" className="stroke-accent/40" width={1} />
      </svg>
      {LEVELS.map((y, i) => (
        <At key={y} x={97} y={y - 3}>
          <TechLabel>L{i + 1}</TechLabel>
        </At>
      ))}

      {/* trajectory — drawn in once it scrolls into view */}
      <div className="landing-reveal absolute inset-0" data-shown={inView}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          <Stroke d={toPath(SIGNATURE)} className="stroke-accent" width={2} />
        </svg>
        {FILLS.map(([x, y]) => (
          <At key={x} x={x} y={y}><Node /></At>
        ))}
        <At x={96} y={6}><DirectionMarker /></At>
      </div>

      {/* annotations */}
      <div className="absolute left-4 top-4 flex flex-col gap-1 sm:left-6 sm:top-6">
        <TechLabel tone="strong">Velora / Grid · 1H</TechLabel>
        <TechLabel>Illustrative</TechLabel>
      </div>
      <At x={63} y={35} className="ml-14 hidden sm:block">
        <span className="whitespace-nowrap rounded border border-accent/40 bg-bg-0 px-1.5 py-0.5">
          <TechLabel tone="accent">L4 · Filled</TechLabel>
        </span>
      </At>
      <div className="absolute bottom-4 left-4 hidden gap-5 sm:left-6 sm:flex">
        <TechLabel>— Grid levels</TechLabel>
        <TechLabel><span className="text-accent">●</span> Filled</TechLabel>
        <TechLabel><span className="text-buy">▲</span> Direction</TechLabel>
      </div>

      {focal && <div className="absolute inset-0">{focal}</div>}

      {/* the read-head: one slow sweep, the page's only ambient motion */}
      <div className="landing-scan pointer-events-none absolute inset-y-0 left-0 w-full border-l border-accent/25" />
    </div>
  );
}

/**
 * Asymmetric on purpose: the copy holds the left five columns of the page
 * measure, and the chart owns the right half of the *viewport*, running off
 * its edge — the one place the page deliberately breaks its own width. The
 * time axis closes the section full-bleed and hands the line to the next one.
 */
export function HeroSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <section aria-labelledby="hero-title" className="relative border-b border-line bg-bg-0">
      <div className="relative overflow-hidden">
        <GridLines id="hero-grid" />

        <div className={`${LANDING_WRAP} relative grid lg:min-h-[560px] lg:grid-cols-12`}>
          <div className="relative z-10 flex flex-col justify-center py-14 sm:py-20 lg:col-span-5 lg:py-24">
            <p className="font-mono text-2xs uppercase tracking-widest text-txt-3">
              <span className="text-accent">Velora</span> / Platform
            </p>
            <h1 id="hero-title" className="mt-6 max-w-md text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
              {t("home.landing.heroTitle")}
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-relaxed text-txt-2">{t("home.landing.heroSubtitle")}</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                onClick={() => navigate(user ? "/terminal" : "/register")}
                className={buttonCls("primary", "lg", "tap gap-2 !rounded-full px-6")}
              >
                {t("home.landing.heroCta")} <IconArrowRight size={15} />
              </button>
              <a href="#arsenal" className={buttonCls("secondary", "lg", "tap !rounded-full px-6")}>
                {t("home.landing.heroSecondary")}
              </a>
            </div>
          </div>
        </div>

        <HeroMarketVisual className="relative h-64 border-t border-line sm:h-80 lg:absolute lg:inset-y-0 lg:left-1/2 lg:right-0 lg:h-auto lg:border-l lg:border-t-0" />
      </div>

      {/* the market trajectory's time axis */}
      <div className="border-t border-line">
        <div className={`${LANDING_WRAP} flex items-center gap-6 py-3`}>
          <TechLabel tone="strong" className="shrink-0">Market trajectory</TechLabel>
          <div aria-hidden className="flex flex-1 justify-between">
            {TICKS.map((tick, i) => (
              <TechLabel key={tick} className={i % 2 === 1 ? "hidden sm:inline" : undefined}>{tick}</TechLabel>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
