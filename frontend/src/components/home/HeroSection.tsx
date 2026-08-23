import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../../store/auth";
import { useLiveInstruments } from "../../hooks/useLivePrices";
import { useSparkline } from "../../hooks/useSparkline";
import { useTerminalStore } from "../../store/terminal";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { CoinBadge } from "../common/CoinBadge";
import { Sparkline } from "../common/Sparkline";
import { IconArrowRight } from "../icons/Icon";

/**
 * Compact hero — Overview's own visual language (anim-rise, hero-glow,
 * gradient-text, cta-pill) applied to a public, marketing-facing headline
 * instead of a logged-in welcome. A real spotlight card (today's biggest
 * mover, with its actual recent price line) stands in for a generic
 * illustration, so this reads as "a real exchange" rather than a SaaS
 * landing page — deliberately not full-screen.
 */
export function HeroSection() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const instruments = useLiveInstruments();
  const setSymbol = useTerminalStore((s) => s.setSymbol);

  const spotlight = useMemo(() => {
    if (instruments.length === 0) return null;
    return [...instruments].sort((a, b) => Math.abs(b.liveChange24h) - Math.abs(a.liveChange24h))[0];
  }, [instruments]);

  const { data: spark } = useSparkline(spotlight?.symbol ?? "", spotlight?.category ?? "SPOT");

  function goTrade(symbol?: string) {
    if (symbol) setSymbol(symbol);
    navigate("/terminal");
  }

  return (
    <div className="anim-rise relative overflow-hidden rounded-xl border border-line bg-bg-1 px-5 py-6 sm:px-8 sm:py-8">
      <div className="hero-glow" aria-hidden />
      <div className="relative flex flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-xl">
          <h1 className="text-2xl font-bold leading-tight tracking-tight text-txt-0 sm:text-3xl">
            {t("home.heroPre")} <span className="gradient-text">{t("home.heroAccent")}</span>
            {t("home.heroPost")}
          </h1>
          <p className="mt-2.5 max-w-md text-xs text-txt-2 sm:text-sm">{t("home.heroSub")}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            {user ? (
              <>
                <button onClick={() => goTrade()} className="cta-pill cta-trade flex items-center gap-2 px-6 py-3 text-sm">
                  {t("overview.startTrading")} <IconArrowRight size={16} />
                </button>
                <button onClick={() => navigate("/profile")} className="btn-fx rounded-full border border-line px-5 py-3 text-sm font-medium text-txt-1 hover:border-accent hover:text-accent">
                  {t("overview.myProfile")}
                </button>
              </>
            ) : (
              <>
                <button onClick={() => navigate("/register")} className="cta-pill cta-trade flex items-center gap-2 px-6 py-3 text-sm">
                  {t("home.signUp")} <IconArrowRight size={16} />
                </button>
                <button onClick={() => navigate("/login")} className="btn-fx rounded-full border border-line px-5 py-3 text-sm font-medium text-txt-1 hover:border-accent hover:text-accent">
                  {t("home.logIn")}
                </button>
              </>
            )}
          </div>
        </div>

        {spotlight && (
          <button
            onClick={() => goTrade(spotlight.symbol)}
            className="btn-fx w-full shrink-0 rounded-lg border border-line-soft bg-bg-2/60 p-4 text-left transition-colors hover:border-accent/50 sm:w-72"
          >
            <div className="mb-2.5 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-3">
              <span className={classNames("h-1.5 w-1.5 rounded-full", spotlight.liveChange24h >= 0 ? "bg-buy" : "bg-sell")} />
              {t("home.heroSpotlight")}
            </div>
            <div className="flex items-center gap-2.5">
              <CoinBadge symbol={spotlight.symbol} size={32} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-txt-0">{spotlight.symbol}</div>
                <div className="tabular text-lg font-bold text-txt-0">{fmtPrice(spotlight.livePrice, spotlight.priceDecimals)}</div>
              </div>
              <span className={classNames("shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold tabular", spotlight.liveChange24h >= 0 ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                {fmtPct(spotlight.liveChange24h)}
              </span>
            </div>
            <div className="mt-2">
              <Sparkline values={spark ?? undefined} positive={spotlight.liveChange24h >= 0} width={260} height={48} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
