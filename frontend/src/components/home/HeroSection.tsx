import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { IconArrowRight } from "../icons/Icon";
import { buttonCls } from "../../lib/ui";
import { MarketTicker } from "./landing/MarketTicker";
import terminalShot from "../../assets/landing/ui-terminal.png";

/**
 * Full-bleed — no card, no border, no radius around the section itself; the
 * page's own background *is* the hero background. Two things carry the
 * weight: the headline/CTA, and a real screenshot of the actual terminal
 * (order book, chart, live position, order ticket — not a redrawn mockup).
 * No illustrated backdrop: this session tried an abstract network/price-line
 * SVG texture here first and it got cut for exactly the reason any hero
 * graphic would — it didn't do anything, it just filled space. The
 * screenshot does the same job and is also true.
 *
 * The market ticker is fused directly to the bottom edge, full width, so the
 * hero and the first proof of "this is a real market" read as one
 * continuous band rather than a card followed by another card.
 */
export function HeroSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="w-full border-b border-line">
      <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-8 sm:pt-12 lg:pb-14 lg:pt-16">
        <div className="max-w-2xl text-center lg:text-left">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
            {t("home.landing.heroTitle")}
          </h1>
          <p className="mt-3 text-xs text-txt-2 sm:text-sm">{t("home.landing.heroSubtitle")}</p>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
            {user ? (
              <>
                <button onClick={() => navigate("/terminal")} className={buttonCls("primary", "lg", "rounded-full px-7 py-3 text-sm gap-2")}>
                  {t("home.landing.heroCta")} <IconArrowRight size={16} />
                </button>
                <button onClick={() => navigate("/profile")} className={buttonCls("secondary", "lg", "rounded-full px-6 py-3 text-sm")}>
                  {t("overview.myProfile")}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/register")} className={buttonCls("primary", "lg", "rounded-full px-7 py-3 text-sm gap-2")}>
                  {t("home.landing.heroCta")} <IconArrowRight size={16} />
                </button>
                <button onClick={() => navigate("/login")} className={buttonCls("secondary", "lg", "rounded-full px-6 py-3 text-sm")}>
                  {t("home.logIn")}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="anim-rise-1 mt-8 lg:mt-10">
          <img
            src={terminalShot}
            alt={t("home.landing.terminalScreenshotAlt")}
            className="w-full rounded-xl border border-line shadow-lift"
            width={1600}
            height={945}
          />
        </div>
      </div>

      <MarketTicker />
    </div>
  );
}
