import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconBot, IconCheck, IconTrendUp } from "../../icons/Icon";
import { buttonCls } from "../../../lib/ui";
import { AnimatedNumber } from "../../common/AnimatedNumber";
import { useInView } from "../../../hooks/useInView";

/**
 * The real bot-builder screenshot this used to show carried whatever state
 * that capture session happened to be in (a disabled button gated on KYC, a
 * half-filled form) — accurate to the app, wrong for a page that's supposed
 * to sell the idea of automation rather than the mechanics of the form. This
 * is a purpose-built illustrative tile instead: bot icon, a P&L counter that
 * counts up once scrolled into view, and three lines naming what actually
 * happens once a strategy is running — clearly labelled as an illustration,
 * not a captured backtest result.
 *
 * The one bordered "product card" in the lower half of the page — used
 * exactly once, so it reads as "here's a real feature in a frame," not as
 * the repeating container every section was wrapped in before this pass.
 */
export function AutomatedTradingSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { ref, inView } = useInView<HTMLDivElement>(0.4);
  const features = [t("home.landing.automatedFeature1"), t("home.landing.automatedFeature2"), t("home.landing.automatedFeature3")];

  return (
    <section className="anim-rise flex flex-col gap-8 rounded-xl border border-line bg-bg-1 p-5 sm:p-8 lg:flex-row lg:items-center">
      <div className="max-w-md shrink-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-txt-0 sm:text-xl">
          <IconBot size={20} className="text-accent" />
          {t("home.landing.automatedTitle")}
        </h2>
        <p className="mt-2 text-xs text-txt-2 sm:text-sm">{t("home.landing.automatedSubtitle")}</p>

        <button onClick={() => navigate("/strategies")} className={buttonCls("primary", "lg", "mt-5 rounded-full px-6 py-3 text-sm gap-2")}>
          {t("home.promoCta")} <IconArrowRight size={15} />
        </button>
      </div>

      <div ref={ref} className="flex w-full flex-col items-center gap-5 rounded-lg border border-line-soft bg-bg-2 p-6 text-center lg:flex-1">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-soft">
          <IconBot size={26} className="text-accent" />
        </div>

        <div>
          <div className="flex items-center justify-center gap-1.5">
            <IconTrendUp size={16} className="text-buy" />
            <AnimatedNumber
              value={inView ? 18.2 : 0}
              format={(n) => `+${n.toFixed(1)}%`}
              durationMs={900}
              className="tabular text-xl font-bold text-buy sm:text-2xl"
            />
          </div>
          <div className="mt-1 text-2xs text-txt-3">{t("home.landing.automatedPnlLabel")}</div>
        </div>

        <ul className="w-full space-y-2 text-left text-xs text-txt-1">
          {features.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" />
              {line}
            </li>
          ))}
        </ul>

        <p className="text-2xs text-txt-3">{t("home.landing.automatedIllustrativeLabel")}</p>
      </div>
    </section>
  );
}
