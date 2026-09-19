import { useTranslation } from "react-i18next";
import { IconCheck, IconShield } from "../../icons/Icon";
import securityShot from "../../../assets/landing/ui-security.png";

/**
 * Deliberately not a card — no border, no panel background. Automated
 * Trading right above this is the one section that's a framed product shot
 * in a side-by-side split; repeating that same split here would put the
 * page right back to "identical containers stacked down the page." This is
 * a plain stack instead: the trust list first, then the real settings row
 * as a full-width strip below it, shown at its own natural wide-short
 * shape (a real settings row genuinely is that shape) rather than forced
 * into a portrait box it doesn't fit.
 *
 * Two lines, only two, because only two security features actually exist
 * and are switched on today (2FA and KYC) — the earlier audit's lesson was
 * that a landing page listing things the platform doesn't really do is
 * worse than listing fewer, true ones. No lock/encryption copy this can't
 * back up.
 */
export function SecuritySection() {
  const { t } = useTranslation();
  const items = [t("home.landing.security2fa"), t("home.landing.securityKyc")];

  return (
    <section className="anim-rise-1">
      <h2 className="flex items-center gap-2 text-lg font-bold text-txt-0 sm:text-xl">
        <IconShield size={18} className="text-accent" />
        {t("home.landing.securityTitle")}
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map((text) => (
          <li key={text} className="flex items-start gap-2 text-xs text-txt-1">
            {/* accent, not buy — buy/sell stay reserved for market direction */}
            <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" />
            {text}
          </li>
        ))}
      </ul>

      <img
        src={securityShot}
        alt={t("home.landing.securityScreenshotAlt")}
        width={873}
        height={116}
        className="mt-5 w-full rounded-lg border border-line-soft"
      />
    </section>
  );
}
