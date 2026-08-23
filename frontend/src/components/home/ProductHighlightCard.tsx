import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IconArrowRight, IconBot } from "../icons/Icon";

/**
 * A distinct card shape (soft gradient tint, no border-grid uniformity)
 * pointing at a real, working feature — the Grid/Martingale strategy engine
 * — rather than another data tile. Purely a nav shortcut with honest copy,
 * no invented stats.
 */
export function ProductHighlightCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate("/strategies")}
      className="btn-fx relative w-full overflow-hidden rounded-lg border border-line-soft p-4 text-left transition-colors hover:border-accent/40"
      style={{ background: "linear-gradient(135deg, rgba(61,124,255,0.10), rgba(124,58,237,0.08))" }}
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <IconBot size={17} />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-txt-0">{t("home.promoTitle")}</div>
          <p className="mt-1 text-2xs text-txt-2">{t("home.promoBody")}</p>
          <span className="mt-2 inline-flex items-center gap-1 text-2xs font-semibold text-accent">
            {t("home.promoCta")} <IconArrowRight size={11} />
          </span>
        </div>
      </div>
    </button>
  );
}
