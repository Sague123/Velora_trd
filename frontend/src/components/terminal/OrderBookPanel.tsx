import { useMemo, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useLiveDepth, DEPTH_LEVELS as LEVELS } from "../../hooks/useLiveDepth";
import { classNames, fmt, fmtPrice } from "../../lib/format";

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
export function OrderBookPanel() {
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const { book, status } = useLiveDepth(symbol, inst?.category);
  const decimals = inst?.priceDecimals ?? 2;
  const [minSizeRatio, setMinSizeRatio] = useState(0);

  const rows = useMemo(() => {
    if (!book) return null;
    const allQty = [...book.asks, ...book.bids].map((l) => l.qty);
    const globalMax = Math.max(...allQty, 1e-9);
    const threshold = globalMax * minSizeRatio;
    const filterSize = (l: { qty: number }) => l.qty >= threshold;

    const asks = [...book.asks].filter(filterSize).sort((a, b) => a.price - b.price).slice(0, LEVELS);
    const bids = [...book.bids].filter(filterSize).sort((a, b) => b.price - a.price).slice(0, LEVELS);
    const maxQty = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty), 1e-9);
    let cum = 0;
    const asksCum = [...asks].reverse().map((a) => { cum += a.qty; return { ...a, cum }; }).reverse();
    cum = 0;
    const bidsCum = bids.map((b) => { cum += b.qty; return { ...b, cum }; });
    const maxCum = Math.max(asksCum.at(0)?.cum ?? 0, bidsCum.at(-1)?.cum ?? 0, 1e-9);
    return { asks: asksCum, bids: bidsCum, maxQty, maxCum };
  }, [book, minSizeRatio]);

  const bestAsk = rows?.asks.at(-1)?.price;
  const bestBid = rows?.bids.at(0)?.price;
  const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : null;

  if (status === "unsupported") {
    return (
      <div className="flex h-full flex-col border-l border-line bg-bg-1">
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="text-2xs text-txt-3">Стакан не поддерживается для {symbol}.</span>
        </div>
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
