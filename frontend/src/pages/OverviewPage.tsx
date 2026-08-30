import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useInstruments } from "../hooks/useMarket";
import { useLiveInstruments } from "../hooks/useLivePrices";
import { useAuthStore } from "../store/auth";
import { useAccount } from "../hooks/useTrading";
import { useTerminalStore } from "../store/terminal";
import { SignalCard } from "../components/overview/SignalCard";
import { QuickDepositModal } from "../components/profile/QuickDepositModal";
import { LoadingRow, ErrorRow } from "../components/common/States";
import { classNames, fmtPct, fmtSigned, fmtUsd, n } from "../lib/format";
import { AnimatedNumber } from "../components/common/AnimatedNumber";
import { IconArrowRight, IconBolt, IconTrendDown, IconTrendUp, IconWalletPlus } from "../components/icons/Icon";
import { SiteFooter } from "../components/layout/SiteFooter";

// A fixed shortlist of the most liquid instruments — computing a technical
// signal needs a full candle fetch per symbol, so this stays deliberately
// bounded rather than doing it for all 26 instruments on every page load.
const SIGNAL_WATCHLIST = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
  "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "BTC-PERP", "ETH-PERP",
];

export function OverviewPage() {
  const { t } = useTranslation();
  const { isLoading, isError, refetch } = useInstruments();
  const instruments = useLiveInstruments();
  const user = useAuthStore((s) => s.user);
  const account = useAccount(!!user);
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();
  const [showDeposit, setShowDeposit] = useState(false);

  const movers = useMemo(() => {
    const ranked = [...instruments].filter((i) => i.source !== "NONE").sort((a, b) => b.liveChange24h - a.liveChange24h);
    const volatile = [...instruments].sort((a, b) => Math.abs(b.liveChange24h) - Math.abs(a.liveChange24h)).slice(0, 4);
    return { gainers: ranked.slice(0, 4), losers: ranked.slice(-4).reverse(), volatile };
  }, [instruments]);

  function openInTerminal(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  return (
    // Plain block, not flex+flex-col: this is just a vertically stacked
    // scroll container (spacing comes from each child's own mb-*), and
    // flex-col here was actively harmful — CSS flexbox gives flex items an
    // automatic min-height of 0 (instead of their content height) the
    // moment they have `overflow: hidden`, so once total content exceeded
    // the viewport height the hero card (which uses overflow-hidden for
    // its rounded corners) got shrunk by the flex algorithm down to just
    // its padding, clipping the Start Trading/Deposit buttons — the
    // long-standing "buttons disappear on mobile" bug. Block layout has no
    // shrink algorithm, so this footgun can't happen.
    <div className="h-full overflow-y-auto p-3">
      {showDeposit && <QuickDepositModal onClose={() => setShowDeposit(false)} />}

      {/* Hero */}
      <div className="anim-rise relative mb-4 overflow-hidden rounded-xl border border-line bg-bg-1 px-6 pb-8 pt-6">
        <div className="hero-glow" aria-hidden />
        <div className="relative flex flex-col gap-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-txt-0">
              {t("overview.welcome")} <span className="gradient-text">{user?.name}</span>
            </h1>
            <p className="mt-1 text-xs text-txt-2">{t("overview.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => navigate("/terminal")} className="cta-pill cta-trade flex items-center gap-2 px-7 py-3 text-sm">
              {t("overview.startTrading")} <IconArrowRight size={16} />
            </button>
            <button onClick={() => setShowDeposit(true)} className="cta-pill cta-deposit flex items-center gap-2 px-7 py-3 text-sm">
              <IconWalletPlus size={16} /> {t("overview.deposit")}
            </button>
            <button onClick={() => navigate("/profile")} className="btn-fx text-2xs font-medium text-txt-2 underline decoration-dotted hover:text-accent">
              {t("overview.myProfile")} →
            </button>
          </div>
        </div>
      </div>

      {isLoading && <LoadingRow label="Загрузка рыночных данных…" />}
      {isError && <ErrorRow label="Не удалось загрузить рынок" onRetry={() => refetch()} />}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {/* Account snapshot */}
          {user && account.data && (
            <div className="anim-rise-1 grid grid-cols-2 gap-2 rounded-lg border border-line bg-bg-1 p-3 shadow-none transition-shadow hover:shadow-float sm:grid-cols-4 lg:col-span-4">
              <div><div className="text-2xs text-txt-2">{t("overview.equity")}</div><AnimatedNumber value={n(account.data.equity)} format={fmtUsd} className="tabular text-sm font-semibold text-txt-0" /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.freeMargin")}</div><AnimatedNumber value={n(account.data.cash)} format={fmtUsd} className="tabular text-sm font-semibold text-txt-0" /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.unrealisedPnl")}</div><AnimatedNumber value={n(account.data.unrealisedPnl)} format={fmtSigned} className={classNames("tabular text-sm font-semibold", Number(account.data.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")} /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.openPositions")}</div><div className="tabular text-sm font-semibold text-txt-0">{account.data.openPositions}</div></div>
            </div>
          )}

          {/* Movers — compact */}
          <div className="anim-rise-2 rounded border border-line bg-bg-1 lg:col-span-4">
            <div className="grid grid-cols-1 divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div>
                <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2"><IconTrendUp size={13} className="text-buy" /> {t("overview.topGainers")}</div>
                {movers.gainers.map((i) => (
                  <button key={i.symbol} onClick={() => openInTerminal(i.symbol)} className="btn-fx flex w-full items-center justify-between px-3 py-1.5 text-2xs hover:bg-bg-2/60">
                    <span className="font-medium text-txt-0">{i.symbol}</span>
                    <span className="tabular text-buy">{fmtPct(i.liveChange24h)}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2"><IconTrendDown size={13} className="text-sell" /> {t("overview.topLosers")}</div>
                {movers.losers.map((i) => (
                  <button key={i.symbol} onClick={() => openInTerminal(i.symbol)} className="btn-fx flex w-full items-center justify-between px-3 py-1.5 text-2xs hover:bg-bg-2/60">
                    <span className="font-medium text-txt-0">{i.symbol}</span>
                    <span className="tabular text-sell">{fmtPct(i.liveChange24h)}</span>
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center gap-1.5 border-b border-line-soft px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2"><IconBolt size={13} className="text-warn" /> {t("overview.mostVolatile")}</div>
                {movers.volatile.map((i) => (
                  <button key={i.symbol} onClick={() => openInTerminal(i.symbol)} className="btn-fx flex w-full items-center justify-between px-3 py-1.5 text-2xs hover:bg-bg-2/60">
                    <span className="font-medium text-txt-0">{i.symbol}</span>
                    <span className={classNames("tabular", i.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(i.liveChange24h)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Technical signals — the main event */}
          <div className="anim-rise-3 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-txt-1">{t("overview.technicalSignals")}</h2>
              <span className="text-2xs text-txt-3">{t("overview.signalsHint")}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
              {SIGNAL_WATCHLIST.map((symbol) => (
                <SignalCard key={symbol} symbol={symbol} onClick={() => openInTerminal(symbol)} />
              ))}
            </div>
          </div>
        </div>
      )}

      <SiteFooter compact />
    </div>
  );
}
