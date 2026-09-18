import { useTranslation } from "react-i18next";
import { IconCheck, IconShield } from "../../icons/Icon";

/**
 * Two lines. Only two, because only two security features actually exist and
 * are switched on today (2FA and KYC) — the previous audit's lesson was that
 * a landing page listing things the platform doesn't really do is worse than
 * listing fewer, true ones. No lock icons, no "bank-grade encryption"
 * copy, nothing this list can't back up.
 */
export function SecuritySection() {
  const { t } = useTranslation();
  const items = [t("home.landing.security2fa"), t("home.landing.securityKyc")];

  return (
    <section className="anim-rise-1 rounded-xl border border-line bg-bg-1 p-5 sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-bold text-txt-0 sm:text-xl">
        <IconShield size={18} className="text-accent" />
        {t("home.landing.securityTitle")}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((text) => (
          <li key={text} className="flex items-start gap-2 rounded-lg border border-line-soft bg-bg-2/30 p-3 text-xs text-txt-1">
            {/* accent, not buy — buy/sell stay reserved for market direction */}
            <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}
