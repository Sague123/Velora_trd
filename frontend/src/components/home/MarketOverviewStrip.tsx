import { useTranslation } from "react-i18next";
import { useGlobalStats } from "../../hooks/useGlobalStats";
import { useFearGreed } from "../../hooks/useFearGreed";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useSparkline } from "../../hooks/useSparkline";
import { useNavigate } from "react-router-dom";
import { useTerminalStore } from "../../store/terminal";
import { classNames, fmtCompact, fmtPct, fmtPrice, fmtRate } from "../../lib/format";
import { CoinBadge } from "../common/CoinBadge";
import { Sparkline } from "../common/Sparkline";

function PulseCard({ symbol }: { symbol: string }) {
  const inst = useLiveInstrument(symbol);
  const { data: spark } = useSparkline(symbol, "SPOT");
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();

  if (!inst) {
    return <div className="anim-rise-1 h-[104px] rounded-lg border border-line bg-bg-1" />;
  }
  const up = inst.liveChange24h >= 0;

  return (
    <button
      onClick={() => { setSymbol(symbol); navigate("/terminal"); }}
      className="btn-fx anim-rise-1 flex flex-col justify-between rounded-lg border border-line bg-bg-1 p-3 text-left transition-colors hover:border-accent/50"
    >
      <div className="flex items-center gap-2">
        <CoinBadge symbol={symbol} size={24} />
        <div className="min-w-0 flex-1">
          <div className="text-2xs font-medium text-txt-2">{symbol.replace("USDT", "")}</div>
          <div className="tabular text-sm font-semibold text-txt-0">{fmtPrice(inst.livePrice, inst.priceDecimals)}</div>
        </div>
        <span className={classNames("shrink-0 rounded px-1.5 py-0.5 text-2xs font-semibold tabular", up ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
          {fmtPct(inst.liveChange24h)}
        </span>
      </div>
      <div className="mt-2">
        <Sparkline values={spark ?? undefined} positive={up} width={140} height={30} />
      </div>
    </button>
  );
}

function GaugeBar({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-sell via-bg-3 to-buy">
      <div className="h-full w-[3px] bg-txt-0 shadow-[0_0_4px_rgba(0,0,0,0.5)]" style={{ marginLeft: `calc(${pct}% - 1.5px)` }} />
    </div>
  );
}

/** Global aggregate stats (real CoinGecko + Fear&Greed data — see the
 * hooks) composed as one denser panel, using the same gradient gauge
 * language as the Terminal's Technical Signals card, so it doesn't just
 * read as another flat stat tile next to the ticker cards. */
function GlobalStatsCard() {
  const { t } = useTranslation();
  const { data: global } = useGlobalStats();
  const { data: fng } = useFearGreed();

  return (
    <div className="anim-rise-1 flex flex-col justify-between gap-3 rounded-lg border border-line bg-bg-1 p-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-2xs text-txt-3">{t("home.marketCap")}</div>
          <div className="tabular text-sm font-semibold text-txt-0">{global ? `$${fmtCompact(global.totalMarketCapUsd)}` : "—"}</div>
        </div>
        <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-semibold tabular", global && global.marketCapChange24h >= 0 ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
          {global ? fmtPct(global.marketCapChange24h) : "—"}
        </span>
        <div className="text-right">
          <div className="text-2xs text-txt-3">{t("home.volume24h")}</div>
          <div className="tabular text-sm font-semibold text-txt-0">{global ? `$${fmtCompact(global.totalVolumeUsd)}` : "—"}</div>
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-2xs text-txt-3">
          <span>{t("home.btcDominance")}</span>
          <span className="tabular text-txt-1">{global ? fmtRate(global.btcDominance, 1) : "—"}</span>
        </div>
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-bg-3">
          <div className="h-full bg-gradient-to-r from-accent to-accent-dim" style={{ width: `${global?.btcDominance ?? 0}%` }} />
        </div>
      </div>

      <div>
        <div className="mb-1 flex justify-between text-2xs text-txt-3">
          <span>{t("home.fearGreed")}</span>
          <span className="tabular text-txt-1">{fng ? `${fng.value} · ${fng.classification}` : "—"}</span>
        </div>
        <GaugeBar pct={fng?.value ?? 50} />
      </div>
    </div>
  );
}

export function MarketOverviewStrip() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <PulseCard symbol="BTCUSDT" />
      <PulseCard symbol="ETHUSDT" />
      <PulseCard symbol="SOLUSDT" />
      <div className="col-span-2 lg:col-span-1">
        <GlobalStatsCard />
      </div>
    </div>
  );
}
