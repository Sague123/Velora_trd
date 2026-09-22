import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../store/auth";
import { IconArrowRight } from "../../icons/Icon";
import { buttonCls } from "../../../lib/ui";
import { useInView } from "../../../hooks/useInView";
import mascot from "../../../assets/landing/mascot.webp";
import { At, FILLS, GridLines, LANDING_WRAP, Node, SIGNATURE, SectionLabel, Stroke, toPath } from "./primitives";

/**
 * The closing stage — the one place the page carries illustration. The
 * figure presents toward the copy, so the copy sits left and the artwork
 * right, and the two are never separated by an edge:
 *
 * back → front: the artwork, blurred to atmosphere across the whole stage
 * (a second, shifted copy puts its colour behind the copy) → a scrim that
 * keeps the text legible → chart paper → the signature line, passing
 * *behind* the figure → the sharp artwork, masked on every side → copy.
 *
 * The stage is always dark (`data-theme="dark"`): the artwork is a night
 * scene and would sit on a light page as a pasted rectangle. In the light
 * theme it reads as a deliberate dark stage at the end of the page.
 */
export function FinalCtaSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const { ref, inView } = useInView<HTMLDivElement>(0.25);

  return (
    <section aria-labelledby="cta-title" className="bg-bg-0 px-2 py-16 sm:px-4 lg:px-6 lg:py-24">
      <div
        ref={ref}
        data-theme="dark"
        className="relative isolate mx-auto max-w-[1440px] overflow-hidden rounded-xl border border-line bg-bg-0"
      >
        {/* atmosphere */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
          <img src={mascot} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-80 blur-3xl" />
          <img src={mascot} alt="" className="absolute inset-y-0 -left-1/3 h-full w-full object-cover object-right opacity-40 blur-3xl" />
          <div className="landing-stage-scrim absolute inset-0" />
          <GridLines id="stage-grid" className="opacity-50" />
        </div>

        {/* the line runs behind the figure */}
        <div aria-hidden className="landing-reveal pointer-events-none absolute inset-x-0 bottom-0 hidden h-1/2 lg:block" data-shown={inView}>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <Stroke d={toPath(SIGNATURE)} className="stroke-accent/50" width={1.5} />
          </svg>
          {FILLS.slice(0, 3).map(([x, y]) => (
            <At key={x} x={x} y={y}><Node size="sm" /></At>
          ))}
        </div>

        <div className="relative h-72 sm:h-96 lg:absolute lg:inset-y-0 lg:right-0 lg:h-auto lg:w-[68%]">
          <img
            src={mascot}
            alt=""
            aria-hidden
            className="landing-stage-art pointer-events-none h-full w-full select-none object-cover object-[72%_top] lg:object-right-top"
          />
        </div>

        <div className={`${LANDING_WRAP} relative -mt-10 grid sm:-mt-16 lg:mt-0 lg:min-h-[560px] lg:grid-cols-12`}>
          <div className="flex flex-col justify-center pb-12 sm:pb-16 lg:col-span-5 lg:py-24">
            <SectionLabel index="05" label="Next" />
            <h2 id="cta-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
              {t("home.landing.ctaTitle")}
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-txt-1">{t("home.landing.ctaBody")}</p>
            <div className="mt-8">
              <button
                onClick={() => navigate(user ? "/terminal" : "/register")}
                className={buttonCls("primary", "lg", "tap gap-2 rounded-full px-6")}
              >
                {t("home.landing.heroCta")} <IconArrowRight size={15} />
              </button>
            </div>
            <p className="mt-8 max-w-sm text-2xs leading-relaxed text-txt-2">{t("home.landing.ctaRisk")}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
