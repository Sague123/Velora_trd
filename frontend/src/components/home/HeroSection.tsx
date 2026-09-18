import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { IconArrowRight } from "../icons/Icon";
import { TerminalShowcase } from "./landing/TerminalShowcase";

/**
 * Two zones: pitch + CTA on the left, a self-contained rendition of the
 * terminal on the right (`TerminalShowcase`) — stacked on mobile, the
 * terminal preview first since it's the thing being sold. Copy is
 * placeholder text (bracketed, unmistakably not final) pending real hero
 * copy — see this session's Этап 0 answers. Nothing here claims a specific
 * result or dresses up a placeholder as a real number.
 */
export function HeroSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <div className="anim-rise flex flex-col-reverse items-center gap-6 rounded-xl border border-line bg-bg-1 px-5 py-6 sm:px-8 sm:py-8 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
      <div className="max-w-xl text-center lg:text-left">
        <h1 className="text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
          {t("home.landing.heroTitle")}
        </h1>
        <p className="mt-2.5 text-xs text-txt-2 sm:text-sm">{t("home.landing.heroSubtitle")}</p>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-3 lg:justify-start">
          {user ? (
            <>
              <button onClick={() => navigate("/terminal")} className="cta-pill cta-trade flex items-center gap-2 px-6 py-3 text-sm">
                {t("home.landing.heroCta")} <IconArrowRight size={16} />
              </button>
              <button onClick={() => navigate("/profile")} className="btn-fx rounded-full border border-line px-5 py-3 text-sm font-medium text-txt-1 hover:border-accent hover:text-accent">
                {t("overview.myProfile")}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate("/register")} className="cta-pill cta-trade flex items-center gap-2 px-6 py-3 text-sm">
                {t("home.landing.heroCta")} <IconArrowRight size={16} />
              </button>
              <button onClick={() => navigate("/login")} className="btn-fx rounded-full border border-line px-5 py-3 text-sm font-medium text-txt-1 hover:border-accent hover:text-accent">
                {t("home.logIn")}
              </button>
            </>
          )}
        </div>
      </div>

      <TerminalShowcase />
    </div>
  );
}
