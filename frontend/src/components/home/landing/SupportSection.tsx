import { useTranslation } from "react-i18next";
import { Logo } from "../../layout/Logo";
import { LANDING_PANEL, LANDING_PANEL_GUTTER, LANDING_WRAP, Node, SectionLabel, Stroke, TechLabel } from "./primitives";

/** The machine side — real, shipped capabilities, named the way the product names them. */
const TECHNOLOGY = ["SMA · EMA · RSI · MACD", "Grid bot", "Martingale bot", "Stop-loss · Take-profit", "2FA · KYC"];
const PEOPLE = ["Setup", "Guidance", "Support", "Assistance"] as const;

/** Row centres in the 0–100 space for `n` equal rows. */
const centres = (n: number) => Array.from({ length: n }, (_, i) => ((2 * i + 1) * 50) / n);

/**
 * Two columns that meet in one point. Five technology rails converge on the
 * Velora mark and four people rails leave it — the argument of the section
 * drawn rather than stated: the tools and the humans are one service, with
 * the platform at the junction.
 *
 * The rails are one SVG in the shared 0–100 space; both lists are equal-row
 * grids of the same height, so every line lands on the centre of its row at
 * any width. Below `lg` the same order becomes a single vertical path with
 * the mark as the hinge.
 */
export function SupportSection() {
  const { t } = useTranslation();
  const tech = centres(TECHNOLOGY.length);
  const people = centres(PEOPLE.length);

  return (
    <section aria-labelledby="support-title" className={LANDING_PANEL_GUTTER}>
      <div className={`${LANDING_PANEL} py-20 lg:py-28`}>
        <div className={LANDING_WRAP}>
          <header className="max-w-md">
            <SectionLabel index="04" label="Support" />
            <h2 id="support-title" className="mt-5 text-2xl font-bold leading-tight tracking-tight text-txt-0">
              {t("home.landing.supportTitle")}
            </h2>
          </header>

          <div className="mt-12 grid lg:h-80 lg:grid-cols-12 lg:gap-x-6">
            {/* technology */}
            <div className="lg:col-span-3 lg:flex lg:flex-col">
              <TechLabel tone="strong" className="block h-4 leading-4">{t("home.landing.supportTech")}</TechLabel>
              <ul className="mt-4 grid border-t border-line lg:flex-1 lg:grid-rows-5">
                {TECHNOLOGY.map((item) => (
                  <li key={item} className="flex items-center border-b border-line py-3 lg:py-0">
                    <TechLabel tone="strong">{item}</TechLabel>
                  </li>
                ))}
              </ul>
            </div>

            {/* the junction */}
            <div aria-hidden className="relative my-6 flex flex-col items-center lg:col-span-3 lg:my-0 lg:mt-8 lg:block">
              <span className="h-8 border-l border-accent/50 lg:hidden" />
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 hidden h-full w-full lg:block">
                {tech.map((y) => (
                  <Stroke key={`t${y}`} d={`M0,${y} C25,${y} 25,50 44,50`} className="stroke-line" width={1} />
                ))}
                {people.map((y) => (
                  <Stroke key={`p${y}`} d={`M56,50 C75,50 75,${y} 100,${y}`} className="stroke-accent/60" width={1} />
                ))}
              </svg>
              <span className="relative flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-bg-0 lg:absolute lg:left-1/2 lg:top-1/2 lg:-translate-x-1/2 lg:-translate-y-1/2">
                <Logo size={24} />
              </span>
              <span className="h-8 border-l border-accent/50 lg:hidden" />
            </div>

            {/* people */}
            <div className="lg:col-span-6 lg:flex lg:flex-col">
              <TechLabel tone="strong" className="block h-4 leading-4">{t("home.landing.supportPeople")}</TechLabel>
              <ol className="mt-4 grid border-t border-line lg:flex-1 lg:grid-rows-4">
                {PEOPLE.map((p) => (
                  <li key={p} className="flex items-center gap-4 border-b border-line py-3 lg:py-0">
                    <Node size="sm" on="bg-1" />
                    <div className="min-w-0 sm:flex sm:flex-1 sm:items-baseline sm:gap-4">
                      <h3 className="text-sm font-semibold text-txt-0 sm:w-28 sm:shrink-0">{t(`home.landing.people${p}`)}</h3>
                      <p className="mt-0.5 text-xs leading-relaxed text-txt-2 sm:mt-0">{t(`home.landing.people${p}Body`)}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
