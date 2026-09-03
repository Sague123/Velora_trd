import { useMemo, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useLiveDepth, DEPTH_LEVELS as LEVELS } from "../../hooks/useLiveDepth";
import { classNames, fmt, fmtPrice } from "../../lib/format";
import type { OrderSide } from "../../lib/types";

const MIN_SIZE_OPTIONS = [
  { value: 0, label: "All sizes" },
  { value: 0.001, label: "Hide dust (<0.1% of largest)" },
  { value: 0.01, label: "Hide small (<1% of largest)" },
  { value: 0.05, label: "Show only large (>5% of largest)" },
];

// Was OrderBookPanel wrapped one level deep in a component literally named
// RightPanelTabs, which held no tabs — the second tab ("Market Info") was
// folded into this panel's own stats bar a while back, leaving a wrapper
// that only ever rendered <OrderBookPanel /> and contributed one class
// (border-l + bg-1, now on the root below). Removed rather than kept around
// as unexplained indirection.
export function OrderBookPanel({
  compact = false,
  onPickPrice,
}: {
  /** Phone layout: a two-sided ladder whose prices are tappable, rather than
   * the desktop panel's stacked asks-over-bids column. */
  compact?: boolean;
  onPickPrice?: (price: number, side: OrderSide) => void;
} = {}) {
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const { book, status } = useLiveDepth(symbol, inst?.category);
  const decimals = inst?.priceDecimals ?? 2;
  const [minSizeRatio, setMinSizeRatio] = useState(0);
  const [aggIdx, setAggIdx] = useState(0);

  // Aggregation steps scale with the instrument's own price rather than
  // being hard-coded: 1 / 5 / 10 dollars groups a $64k BTC book usefully and
  // would flatten a $3 token into a single line.
  const aggSteps = useMemo(() => {
    const px = Number(inst?.livePrice ?? 0);
    if (!px) return [0];
    const base = Math.pow(10, Math.floor(Math.log10(px)) - 4);
    return [base, base * 5, base * 10];
  }, [inst?.livePrice]);
  const aggStep = aggSteps[Math.min(aggIdx, aggSteps.length - 1)] ?? 0;

  const rows = useMemo(() => {
    if (!book) return null;
    const allQty = [...book.asks, ...book.bids].map((l) => l.qty);
    const globalMax = Math.max(...allQty, 1e-9);
    const threshold = globalMax * minSizeRatio;
    const filterSize = (l: { qty: number }) => l.qty >= threshold;

    // Group levels onto a coarser price grid, summing the size that falls in
    // each bucket — bids round down and asks round up, so neither side ever
    // reads as better than it is.
    const bucket = (levels: { price: number; qty: number }[], dir: "down" | "up") => {
      if (!compact || aggStep <= 0) return levels;
      const map = new Map<number, number>();
      for (const l of levels) {
        const k = (dir === "down" ? Math.floor(l.price / aggStep) : Math.ceil(l.price / aggStep)) * aggStep;
        map.set(k, (map.get(k) ?? 0) + l.qty);
      }
      return [...map].map(([price, qty]) => ({ price, qty }));
    };

    const asks = bucket([...book.asks].filter(filterSize), "up").sort((a, b) => a.price - b.price).slice(0, LEVELS);
    const bids = bucket([...book.bids].filter(filterSize), "down").sort((a, b) => b.price - a.price).slice(0, LEVELS);
    const maxQty = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty), 1e-9);
    let cum = 0;
    const asksCum = [...asks].reverse().map((a) => { cum += a.qty; return { ...a, cum }; }).reverse();
    cum = 0;
    const bidsCum = bids.map((b) => { cum += b.qty; return { ...b, cum }; });
    const maxCum = Math.max(asksCum.at(0)?.cum ?? 0, bidsCum.at(-1)?.cum ?? 0, 1e-9);
    return { asks: asksCum, bids: bidsCum, maxQty, maxCum };
  }, [book, minSizeRatio, compact, aggStep]);

  const bestAsk = rows?.asks.at(-1)?.price;
  const bestBid = rows?.bids.at(0)?.price;
  const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : null;

  // Share of resting size sitting on the bid — the same figure the ladder
  // already shows, read as one number.
  const buyPct = useMemo(() => {
    if (!rows) return null;
    const bid = rows.bids.reduce((s, b) => s + b.qty, 0);
    const ask = rows.asks.reduce((s, a) => s + a.qty, 0);
    if (bid + ask <= 0) return null;
    return Math.round((bid / (bid + ask)) * 100);
  }, [rows]);

  if (status === "unsupported") {
    return (
      <div className={classNames("flex h-full flex-col bg-bg-1", !compact && "border-l border-line")}>
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="text-2xs text-txt-3">Стакан не поддерживается для {symbol}.</span>
        </div>
      </div>
    );
  }

  if (compact) {
    // Paired ladder: bid side on the left, ask side on the right, depth bars
    // growing outward from the middle — the shape a phone can read at a
    // glance, versus the desktop panel's single stacked column.
    const pairs = Array.from({ length: Math.max(rows?.bids.length ?? 0, rows?.asks.length ?? 0) }, (_, i) => ({
      bid: rows?.bids[i], ask: rows?.asks.slice().reverse()[i],
    }));
    return (
      <div className="bg-bg-0 pb-1">
        {buyPct !== null && (
          <div className="mx-3.5 mb-2.5 mt-2 flex h-7 overflow-hidden rounded-md border border-line bg-bg-2">
            <div className="flex items-center bg-buy-soft pl-2 text-2xs font-bold text-buy" style={{ width: `${buyPct}%` }}>
              B {buyPct}%
            </div>
            <div className="flex flex-1 items-center justify-end bg-sell-soft pr-2 text-2xs font-bold text-sell">
              {100 - buyPct}% S
            </div>
          </div>
        )}

        <div className="flex items-center justify-between px-3.5 pb-2">
          <div className="flex gap-3.5 text-2xs font-bold">
            <span className="text-buy">Купить</span>
            <span className="text-sell">Продать</span>
          </div>
          <select
            value={aggIdx}
            onChange={(e) => setAggIdx(Number(e.target.value))}
            aria-label="Шаг агрегации цен"
            className="tap-sm rounded-md border border-line bg-bg-1 px-1.5 text-2xs text-txt-2 outline-none focus:border-accent"
          >
            {aggSteps.map((s, i) => (
              <option key={i} value={i}>{s > 0 ? s.toFixed(Math.max(0, decimals - 2)) : "—"}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-4 px-3.5 pb-1 text-[9px] text-txt-3">
          <span>Amount</span>
          <span className="text-right">Bid</span>
          <span className="pl-2">Ask</span>
          <span className="text-right">Amount</span>
        </div>

        {!rows ? (
          <div className="px-3.5 py-8 text-center text-2xs text-txt-3">Загрузка стакана…</div>
        ) : (
          <div className="mx-2.5 overflow-hidden rounded-lg border border-line-soft">
            {pairs.map(({ bid, ask }, i) => (
              <div
                key={i}
                className={classNames(
                  "relative grid grid-cols-4 items-center bg-bg-1 px-1.5 py-1.5 text-2xs tabular",
                  i !== pairs.length - 1 && "border-b border-line-soft"
                )}
              >
                {bid && <div className="absolute inset-y-0 left-0 bg-buy/10" style={{ width: `${(bid.qty / rows.maxQty) * 50}%` }} />}
                {ask && <div className="absolute inset-y-0 right-0 bg-sell/10" style={{ width: `${(ask.qty / rows.maxQty) * 50}%` }} />}
                <span className="relative text-txt-2">{bid ? fmt(bid.qty, 3) : ""}</span>
                <button
                  type="button"
                  disabled={!bid}
                  onClick={() => bid && onPickPrice?.(bid.price, "BUY")}
                  className="relative text-right font-bold text-buy"
                >
                  {bid ? fmtPrice(bid.price, decimals) : ""}
                </button>
                <button
                  type="button"
                  disabled={!ask}
                  onClick={() => ask && onPickPrice?.(ask.price, "SELL")}
                  className="relative pl-2 text-left font-bold text-sell"
                >
                  {ask ? fmtPrice(ask.price, decimals) : ""}
                </button>
                <span className="relative text-right text-txt-2">{ask ? fmt(ask.qty, 3) : ""}</span>
              </div>
            ))}
          </div>
        )}

        <p className="px-3.5 py-2 text-center text-[9px] text-txt-3">
          Нажмите на цену, чтобы создать лимитный ордер
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-line bg-bg-1">
      {/* One header row, not two: price/24h-change/volume used to repeat here
          in a stats bar of their own, right underneath the same three
          numbers already shown in the chart's own toolbar. What belongs here
          instead — mid-price and spread — already has its own row further
          down, between asks and bids, where it's actually book-specific
          information rather than a duplicate of the chart's. */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-2.5 py-1.5">
        <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Order Book</span>
        <select
          value={minSizeRatio}
          onChange={(e) => setMinSizeRatio(Number(e.target.value))}
          className="rounded border border-line bg-bg-2 px-1 py-0.5 text-2xs text-txt-1 outline-none focus:border-accent"
        >
          {MIN_SIZE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className={classNames("ml-auto flex items-center gap-1 text-2xs", status === "open" ? "text-buy" : "text-txt-3")}>
          <span className={classNames("h-1.5 w-1.5 rounded-full", status === "open" ? "bg-buy" : status === "connecting" ? "bg-warn animate-pulse" : "bg-sell")} />
          {status === "open" ? "live" : status === "connecting" ? "connecting" : "offline"}
        </span>
      </div>

      {!rows ? (
        <div className="flex flex-1 items-center justify-center text-2xs text-txt-3">Загрузка стакана…</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-2xs tabular">
          <div className="grid grid-cols-3 px-2 py-1 text-txt-3">
            <span>Price</span>
            <span className="text-right">Size</span>
            <span className="text-right">Total</span>
          </div>
          <div className="flex flex-col-reverse">
            {rows.asks.map((a) => (
              <div key={a.price} className="relative grid grid-cols-3 px-2 py-[1.5px]">
                <div className="absolute inset-y-0 right-0 bg-sell/10" style={{ width: `${(a.cum / rows.maxCum) * 100}%` }} />
                <span className="relative text-sell">{fmtPrice(a.price, decimals)}</span>
                <span className="relative text-right text-txt-1">{fmt(a.qty, 4)}</span>
                <span className="relative text-right text-txt-3">{fmt(a.cum, 4)}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 border-y border-line-soft bg-bg-2/40 px-2 py-1 font-medium">
            {bestBid !== undefined && bestAsk !== undefined && (
              <>
                <span className="text-txt-0">{fmtPrice((bestBid + bestAsk) / 2, decimals)}</span>
                <span className="text-txt-3">spread {spread !== null ? fmtPrice(spread, decimals) : "—"}</span>
              </>
            )}
          </div>

          <div>
            {rows.bids.map((b) => (
              <div key={b.price} className="relative grid grid-cols-3 px-2 py-[1.5px]">
                <div className="absolute inset-y-0 right-0 bg-buy/10" style={{ width: `${(b.cum / rows.maxCum) * 100}%` }} />
                <span className="relative text-buy">{fmtPrice(b.price, decimals)}</span>
                <span className="relative text-right text-txt-1">{fmt(b.qty, 4)}</span>
                <span className="relative text-right text-txt-3">{fmt(b.cum, 4)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
