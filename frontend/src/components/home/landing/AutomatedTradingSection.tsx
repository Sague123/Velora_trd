import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconBot } from "../../icons/Icon";
import { classNames } from "../../../lib/format";

/** Three risk levels, matching the real Strategies page's own vocabulary —
 * but this is a static mockup, not the live `RiskProfileCards` component
 * (see the design decision this session settled on), so the numbers here
 * are fixed illustrative examples, never live P&L. Labels come from i18n
 * (`labelKey`), not hardcoded English, same as every other string here. */
const PROFILES: { key: string; labelKey: string; step: string; positions: string; tone: "neutral" | "accent" | "warn" }[] = [
  { key: "conservative", labelKey: "home.landing.profileConservative", step: "1.5%", positions: "3", tone: "neutral" },
  { key: "balanced", labelKey: "home.landing.profileBalanced", step: "1.0%", positions: "6", tone: "accent" },
  { key: "aggressive", labelKey: "home.landing.profileAggressive", step: "0.5%", positions: "10", tone: "warn" },
];

const TONE_BORDER: Record<string, string> = {
  neutral: "border-line",
  accent: "border-accent/50 bg-accent-soft/30",
  warn: "border-warn/50 bg-warn/10",
};

/**
 * Static marketing mockup of the real Grid/Martingale strategy picker — not
 * the live `RiskProfileCards`/`StrategyDashboard` components, so nothing
 * here is wired to an actual bot or real performance. The illustrative label
 * is not a footnote: it sits right next to the one number in this block that
 * could otherwise be mistaken for a claim about returns.
 */
export function AutomatedTradingSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <section className="anim-rise rounded-xl border border-line bg-bg-1 p-5 sm:p-7">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-lg">
          <h2 className="flex items-center gap-2 text-lg font-bold text-txt-0 sm:text-xl">
            <IconBot size={20} className="text-accent" />
            {t("home.landing.automatedTitle")}
          </h2>
          <p className="mt-2 text-xs text-txt-2 sm:text-sm">{t("home.landing.automatedSubtitle")}</p>

          <button
            onClick={() => navigate("/strategies")}
            className="cta-pill cta-trade mt-4 flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            {t("home.promoCta")} <IconArrowRight size={15} />
          </button>
        </div>

        <div className="w-full shrink-0 lg:w-[360px]">
          <div className="grid grid-cols-3 gap-2">
            {PROFILES.map((p) => (
              <div key={p.key} className={classNames("min-w-0 rounded-lg border p-2.5", TONE_BORDER[p.tone])}>
                {/* break-words: long uppercase labels (e.g. "СБАЛАНСИРОВАННЫЙ")
                    have no natural break point and will otherwise overflow a
                    ~100px grid column instead of wrapping. */}
                <div className="break-words text-3xs font-semibold uppercase leading-tight text-txt-2">{t(p.labelKey)}</div>
                <div className="mt-2 space-y-1">
                  <div>
                    <div className="text-3xs text-txt-3">{t("home.landing.specGridStep")}</div>
                    <div className="tabular text-xs font-semibold text-txt-0">{p.step}</div>
                  </div>
                  <div>
                    <div className="text-3xs text-txt-3">{t("home.landing.specPositions")}</div>
                    <div className="tabular text-xs font-semibold text-txt-0">{p.positions}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 rounded-lg border border-line-soft bg-bg-2/40 px-3 py-2 text-3xs text-txt-3">
            {t("home.landing.automatedIllustrativeLabel")}
          </div>
        </div>
      </div>
    </section>
  );
}
