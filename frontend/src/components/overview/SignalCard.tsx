import { useMemo } from "react";
import { useCandles } from "../../hooks/useMarket";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { computeSignal, ratingLabel, signalProbability, type Rating } from "../../lib/signal";
import { classNames, fmtPct, fmtPrice, n } from "../../lib/format";
import { Tooltip } from "../common/Tooltip";

const RATING_STYLE: Record<Rating, string> = {
  STRONG_BUY: "text-buy", BUY: "text-buy", NEUTRAL: "text-txt-2", SELL: "text-sell", STRONG_SELL: "text-sell",
};

export function SignalCard({ symbol, onClick }: { symbol: string; onClick?: () => void }) {
  const inst = useLiveInstrument(symbol);
  const { data, isLoading } = useCandles(symbol, "1H");
  // Drop the still-forming last candle — its close wiggles with every live
  // tick, which was flipping the rating back and forth every refetch instead
  // of only when an hourly candle actually closes.
  const closes = useMemo(() => {
    const candles = data?.candles ?? [];
    const closed = candles.length > 31 ? candles.slice(0, -1) : candles;
    return closed.map((c) => n(c.c));
  }, [data]);
  const signal = useMemo(() => computeSignal(closes), [closes]);
  const probability = signal ? signalProbability(signal.score) : 50;

  return (
    <button
      onClick={onClick}
      className="btn-fx flex flex-col gap-2 rounded border border-line bg-bg-1 p-3 text-left hover:border-accent/50"
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-txt-0">{symbol}</span>
        {inst && <span className={classNames("tabular text-2xs", inst.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(inst.liveChange24h)}</span>}
      </div>

      {inst && <div className="tabular text-sm font-semibold text-txt-0">{fmtPrice(inst.livePrice, inst.priceDecimals)}</div>}

      {isLoading && <div className="h-8 animate-pulse rounded bg-bg-3" />}
      {!isLoading && !signal && <div className="text-2xs text-txt-3">Недостаточно данных</div>}
      {signal && (
        <>
          <Tooltip label={signal.votes.map((v) => `${v.label}: ${v.direction > 0 ? "bullish" : v.direction < 0 ? "bearish" : "neutral"}`).join(" · ")}>
            <div className={classNames("cursor-help text-xs font-semibold", RATING_STYLE[signal.rating])}>{ratingLabel(signal.rating)}</div>
          </Tooltip>
          <div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-gradient-to-r from-sell via-bg-3 to-buy">
              <div
                className="h-full w-[3px] bg-txt-0 shadow-[0_0_4px_rgba(0,0,0,0.5)]"
                style={{ marginLeft: `calc(${probability}% - 1.5px)` }}
              />
            </div>
            <div className="mt-0.5 flex justify-between text-2xs text-txt-3">
              <span>Sell</span>
              <span className="tabular text-txt-1">{probability}% buy</span>
              <span>Buy</span>
            </div>
          </div>
        </>
      )}
    </button>
  );
}
