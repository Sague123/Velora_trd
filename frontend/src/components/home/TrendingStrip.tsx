import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLiveInstruments } from "../../hooks/useLivePrices";
import { useSparkline } from "../../hooks/useSparkline";
import { useTerminalStore } from "../../store/terminal";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { CoinBadge } from "../common/CoinBadge";
import { Sparkline } from "../common/Sparkline";
import { IconFlame } from "../icons/Icon";
import type { LiveInstrument } from "../../hooks/useLivePrices";

function Chip({ inst, onTrade }: { inst: LiveInstrument; onTrade: (s: string) => void }) {
  const { data: spark } = useSparkline(inst.symbol, inst.category);
  const up = inst.liveChange24h >= 0;
  return (
    <button
      onClick={() => onTrade(inst.symbol)}
      className="btn-fx flex shrink-0 items-center gap-2.5 rounded-lg border border-line-soft bg-bg-2/40 px-3 py-2 transition-colors hover:border-accent/50 hover:bg-bg-2"
    >
      <CoinBadge symbol={inst.symbol} size={26} />
      <div className="text-left">
        <div className="text-2xs font-medium text-txt-1">{inst.symbol}</div>
        <div className="tabular text-xs font-semibold text-txt-0">{fmtPrice(inst.livePrice, inst.priceDecimals)}</div>
      </div>
      <Sparkline values={spark ?? undefined} positive={up} width={56} height={22} />
      <span className={classNames("shrink-0 text-2xs font-semibold tabular", up ? "text-buy" : "text-sell")}>{fmtPct(inst.liveChange24h)}</span>
    </button>
  );
}

/** Most active by real 24h volume — the same honest, no-fabrication ranking
 * approach as Overview's "Most Volatile" list, just a different metric. */
export function TrendingStrip() {
  const { t } = useTranslation();
  const instruments = useLiveInstruments();
  const setSymbol = useTerminalStore((s) => s.setSymbol);
  const navigate = useNavigate();

  const top = useMemo(
    () => [...instruments].sort((a, b) => Number(b.volume24h ?? 0) - Number(a.volume24h ?? 0)).slice(0, 8),
    [instruments]
  );

  function onTrade(symbol: string) {
    setSymbol(symbol);
    navigate("/terminal");
  }

  return (
    <div className="anim-rise-2">
      <div className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
        <IconFlame size={13} className="text-warn" /> {t("home.trending")}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {top.map((i) => (
          <Chip key={i.symbol} inst={i} onTrade={onTrade} />
        ))}
      </div>
    </div>
  );
}
