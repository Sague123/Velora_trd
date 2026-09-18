import { useTranslation } from "react-i18next";
import { classNames } from "../../../lib/format";

const STEPS = [
  { titleKey: "home.landing.step1Title", bodyKey: "home.landing.step1Body" },
  { titleKey: "home.landing.step2Title", bodyKey: "home.landing.step2Body" },
  { titleKey: "home.landing.step3Title", bodyKey: "home.landing.step3Body" },
  { titleKey: "home.landing.step4Title", bodyKey: "home.landing.step4Body" },
];

/** Four steps, numbered, text-only — the actual account flow (sign up →
 * verify → deposit → trade), not an illustrated "why us" panel. */
export function HowItWorksSection() {
  const { t } = useTranslation();

  return (
    <section className="anim-rise-2 rounded-xl border border-line bg-bg-1 p-5 sm:p-7">
      <h2 className="text-lg font-bold text-txt-0 sm:text-xl">{t("home.landing.howItWorksTitle")}</h2>
      <ol className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.titleKey} className={classNames("flex flex-col gap-2 lg:pl-4", i > 0 && "lg:border-l lg:border-line-soft")}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-accent-soft text-2xs font-bold text-accent">
              {i + 1}
            </span>
            <div>
              <div className="text-sm font-semibold text-txt-0">{t(s.titleKey)}</div>
              <div className="mt-0.5 text-xs text-txt-2">{t(s.bodyKey)}</div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
