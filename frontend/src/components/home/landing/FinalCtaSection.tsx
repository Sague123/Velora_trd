import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../../store/auth";
import { IconArrowRight } from "../../icons/Icon";
import { buttonCls } from "../../../lib/ui";

/**
 * The closing band — full-bleed like the hero, bookending the page, so the
 * last thing a visitor sees echoes the first rather than trailing off into
 * another card. One headline, one button. Copy is placeholder pending real
 * hero/CTA text (see Этап 0), same bracket convention as the hero.
 */
export function FinalCtaSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();

  return (
    <section className="w-full border-y border-line bg-bg-1">
      <div className="mx-auto flex max-w-[1600px] flex-col items-center gap-5 px-4 py-12 text-center sm:py-16">
        <h2 className="max-w-xl text-xl font-bold text-txt-0 sm:text-2xl">{t("home.landing.finalCtaTitle")}</h2>
        <button
          onClick={() => navigate(user ? "/terminal" : "/register")}
          className={buttonCls("primary", "lg", "rounded-full px-8 py-3 text-sm gap-2")}
        >
          {t("home.landing.heroCta")} <IconArrowRight size={16} />
        </button>
      </div>
    </section>
  );
}
