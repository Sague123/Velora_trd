import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconBot } from "../../icons/Icon";
import { buttonCls } from "../../../lib/ui";
import strategiesShot from "../../../assets/landing/ui-strategies.png";

/**
 * A real screenshot of the actual bot builder — real risk profiles, real
 * backtest numbers, not a redrawn mockup with invented figures. That also
 * retires the separate "illustrative example" caveat this section used to
 * need: the disclaimer was there because the old mockup's numbers were made
 * up for the page. The real screen already carries its own honest caveat
 * inline ("не гарантия будущей доходности"), same as it does inside the
 * actual app — nothing here says anything the product itself doesn't.
 *
 * The one bordered "product card" in the lower half of the page — used
 * exactly once, so it reads as "here's a screenshot in a frame," not as the
 * repeating container every section was wrapped in before this pass.
 */
export function AutomatedTradingSection() {
  const { t } = useTranslation();
  const navigate = useNavigate();

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

      {/* min-w-0: a flex item's default min-width is its content's intrinsic
          size, and an <img> with no width/height attributes reports its raw
          pixel size (here 1754px, a 2x-captured screenshot) as intrinsic —
          without this the item refused to shrink below that and blew out
          the section's width regardless of `flex-1`. */}
      <img
        src={strategiesShot}
        alt={t("home.landing.strategiesScreenshotAlt")}
        width={877}
        height={720}
        className="w-full min-w-0 rounded-lg border border-line-soft lg:flex-1"
      />
    </section>
  );
}
