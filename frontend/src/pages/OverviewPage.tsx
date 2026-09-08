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
import { ErrorRow, SkeletonBar } from "../components/common/States";
import { classNames, fmtPct, fmtSigned, fmtUsd, n } from "../lib/format";
import { AnimatedNumber } from "../components/common/AnimatedNumber";
import { IconArrowRight, IconBolt, IconTrendDown, IconTrendUp, IconWalletPlus } from "../components/icons/Icon";
import { Page } from "../components/layout/Page";

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
    const withData = instruments.filter((i) => i.source !== "NONE");
    const ranked = [...withData].sort((a, b) => b.liveChange24h - a.liveChange24h);
    // slice(-4) on the full ranked list pulled from the *bottom* of whatever
    // was there — in a mostly-green market that's still positive movers, not
    // losers (the reported "BTC +0.37%" showing under Top Losers). Filtering
    // by sign first means a thin/quiet market shows fewer rows instead of
    // wrong ones.
    const gainers = ranked.filter((i) => i.liveChange24h > 0).slice(0, 4);
    const losers = [...ranked].reverse().filter((i) => i.liveChange24h < 0).slice(0, 4);
    // 24h range as a % of price — an actual volatility measure, independent
    // of direction, instead of |change24h| which just re-sorts the same
    // gainers/losers list and made this block a duplicate of Top Gainers.
    const volatile = [...withData]
      .map((i) => {
        const price = n(i.livePrice);
        const high = i.liveHigh24h !== null ? n(i.liveHigh24h) : null;
        const low = i.liveLow24h !== null ? n(i.liveLow24h) : null;
        const range = price > 0 && high !== null && low !== null ? ((high - low) / price) * 100 : 0;
        return { i, range };
      })
      .sort((a, b) => b.range - a.range)
      .slice(0, 4)
      .map((x) => x.i);
    return { gainers, losers, volatile };
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
    <Page>
      {showDeposit && <QuickDepositModal onClose={() => setShowDeposit(false)} />}

      {/* Hero — kept, but dialed down: this is what a returning trader sees
          every session, not a one-time landing moment, so it shouldn't carry
          the same weight as Home's. Smaller headline, tighter padding, and
          the CTAs are a size down from before — the account snapshot right
          below is the dashboard's actual content and should win the eye. */}
      <div className="anim-rise relative mb-3 overflow-hidden rounded-xl border border-line bg-bg-1 px-5 pb-5 pt-5">
        <div className="hero-glow" aria-hidden />
        <div className="relative flex flex-col gap-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-txt-0">
              {t("overview.welcome")} <span className="gradient-text">{user?.name}</span>
            </h1>
            <p className="mt-1 text-xs text-txt-2">{t("overview.subtitle")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => navigate("/terminal")} className="cta-pill cta-trade flex items-center gap-2 px-6 py-2.5 text-xs">
              {t("overview.startTrading")} <IconArrowRight size={15} />
            </button>
            <button onClick={() => setShowDeposit(true)} className="cta-pill cta-deposit flex items-center gap-2 px-6 py-2.5 text-xs">
              <IconWalletPlus size={15} /> {t("overview.deposit")}
            </button>
            <button onClick={() => navigate("/profile")} className="btn-fx text-2xs font-medium text-txt-2 underline decoration-dotted hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
              {t("overview.myProfile")} →
            </button>
          </div>
        </div>
      </div>

      {/* Shaped like the grid it's about to become (account snapshot / movers
          / signals) instead of a bare spinner floating in empty space —
          nothing else on the page hints at what's coming until this resolves. */}
      {isLoading && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-bg-1 p-3.5 sm:grid-cols-4 lg:col-span-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i}><SkeletonBar width="60%" height={9} /><div className="mt-1.5"><SkeletonBar width="80%" height={16} /></div></div>
            ))}
          </div>
          <div className="grid grid-cols-1 divide-y divide-line-soft rounded border border-line bg-bg-1 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:col-span-4">
            {Array.from({ length: 3 }).map((_, col) => (
              <div key={col} className="p-3">
                {Array.from({ length: 4 }).map((__, row) => (
                  <div key={row} className="flex items-center justify-between py-1.5">
                    <SkeletonBar width="40%" height={10} />
                    <SkeletonBar width="20%" height={10} />
                  </div>
                ))}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:col-span-4 lg:grid-cols-4 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded border border-line bg-bg-1 p-3">
                <SkeletonBar width="50%" height={9} />
                <div className="mt-2"><SkeletonBar width="70%" height={16} /></div>
                <div className="mt-2"><SkeletonBar width="100%" height={8} /></div>
              </div>
            ))}
          </div>
        </div>
      )}
      {isError && <ErrorRow label="Не удалось загрузить рынок" onRetry={() => refetch()} />}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          {/* Account snapshot */}
          {user && account.data && (
            <div className="anim-rise-1 grid grid-cols-2 gap-2 rounded-lg border border-line bg-bg-1 p-3.5 shadow-none transition-shadow hover:shadow-float sm:grid-cols-4 lg:col-span-4">
              <div><div className="text-2xs text-txt-2">{t("overview.equity")}</div><AnimatedNumber value={n(account.data.equity)} format={fmtUsd} className="tabular text-base font-bold text-txt-0" /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.freeMargin")}</div><AnimatedNumber value={n(account.data.cash)} format={fmtUsd} className="tabular text-base font-bold text-txt-0" /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.unrealisedPnl")}</div><AnimatedNumber value={n(account.data.unrealisedPnl)} format={fmtSigned} className={classNames("tabular text-base font-bold", Number(account.data.unrealisedPnl) >= 0 ? "text-buy" : "text-sell")} /></div>
              <div><div className="text-2xs text-txt-2">{t("overview.openPositions")}</div><div className="tabular text-base font-bold text-txt-0">{account.data.openPositions}</div></div>
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

    </Page>
  );
}
