import { useMemo } from "react";
import { useCandles } from "../../hooks/useMarket";
import { computeSignal, ratingLabel, type Rating } from "../../lib/signal";
import { n, classNames } from "../../lib/format";
import { Tooltip } from "../common/Tooltip";

const RATING_STYLE: Record<Rating, string> = {
  STRONG_BUY: "bg-buy-soft text-buy",
  BUY: "bg-buy-soft/60 text-buy",
  NEUTRAL: "bg-bg-3 text-txt-2",
  SELL: "bg-sell-soft/60 text-sell",
  STRONG_SELL: "bg-sell-soft text-sell",
};

export function SignalBadge({ symbol }: { symbol: string }) {
  const { data, isLoading } = useCandles(symbol, "1H");
  const closes = useMemo(() => (data?.candles ?? []).map((c) => n(c.c)), [data]);
  const signal = useMemo(() => computeSignal(closes), [closes]);

  if (isLoading) return <span className="rounded bg-bg-3 px-2 py-0.5 text-2xs text-txt-3">…</span>;
  if (!signal) return <span className="rounded bg-bg-3 px-2 py-0.5 text-2xs text-txt-3">n/a</span>;

  const badge = (
    <span className={classNames("rounded px-2 py-0.5 text-2xs font-medium", RATING_STYLE[signal.rating])}>
      {ratingLabel(signal.rating)}
      {data && !data.real && <span className="ml-1 text-warn">*</span>}
    </span>
  );

  if (data && !data.real) {
    return (
      <Tooltip label="Свечи для этого сигнала — модельные (upstream CoinGecko временно недоступен/лимит запросов), не реальная история цены">
        <span className="cursor-help">{badge}</span>
      </Tooltip>
    );
  }
  return badge;
}
