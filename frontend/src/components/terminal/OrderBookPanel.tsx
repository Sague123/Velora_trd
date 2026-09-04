import { useMemo, useState } from "react";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useLiveDepth } from "../../hooks/useLiveDepth";
import { classNames, fmt, fmtCompact, fmtPrice } from "../../lib/format";
import type { OrderSide } from "../../lib/types";

const MIN_SIZE_OPTIONS = [
  { value: 0, label: "All sizes" },
  { value: 0.001, label: "Hide dust (<0.1% of largest)" },
  { value: 0.01, label: "Hide small (<1% of largest)" },
  { value: 0.05, label: "Show only large (>5% of largest)" },
];

/**
 * Rows drawn per side. Fixed, and padded with blanks when the book is
 * thinner than this — a ladder whose row count follows the data is a ladder
 * whose every row moves whenever a level at the top is filled, which is most
 * of what "скачет" was: not the numbers changing, the rows changing places
 * under them.
 */
const ROWS_DESKTOP = 12;
const ROWS_COMPACT = 7;

interface Level { price: number; qty: number }
interface CumLevel extends Level { cum: number }

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
  const { book, status, depth, synced } = useLiveDepth(symbol, inst?.category);
  const decimals = inst?.priceDecimals ?? 2;
  const [minSizeRatio, setMinSizeRatio] = useState(0);
  const [aggIdx, setAggIdx] = useState(1);
  const rowCount = compact ? ROWS_COMPACT : ROWS_DESKTOP;

  /**
   * Aggregation steps, scaled to the instrument's own price rather than
   * hard-coded: grouping a $64k BTC book by $0.01 is the raw book again,
   * while the same step on a $3 token collapses it to one line. The first
   * option is no grouping at all, so the raw book stays reachable.
   */
  const aggSteps = useMemo(() => {
    const px = Number(inst?.livePrice ?? 0);
    if (!px) return [0];
    const base = Math.pow(10, Math.floor(Math.log10(px)) - 4);
    return [0, base, base * 5, base * 10, base * 50];
  }, [inst?.livePrice]);
  const aggStep = aggSteps[Math.min(aggIdx, aggSteps.length - 1)] ?? 0;

  const rows = useMemo(() => {
    if (!book) return null;

    const allQty = [...book.asks, ...book.bids].map((l) => l.qty);
    const globalMax = Math.max(...allQty, 1e-9);
    const threshold = globalMax * minSizeRatio;
    const filterSize = (l: Level) => l.qty >= threshold;

    /**
     * Groups levels onto a coarser price grid, summing the size in each
     * bucket. Bids round down and asks round up, so a bucket is never
     * labelled with a price better than the orders inside it — rounding the
     * other way would show a bid at a price nobody is actually bidding.
     *
     * This now applies to both layouts. Without it the desktop panel showed
     * raw levels one cent apart, which is where "нет логики" comes from: a
     * dozen rows whose prices differ in the last digit and whose sizes have
     * no relation to each other read as noise, not as a book.
     */
    const bucket = (levels: Level[], dir: "down" | "up"): Level[] => {
      if (aggStep <= 0) return levels;
      const map = new Map<number, number>();
      for (const l of levels) {
        const k = (dir === "down" ? Math.floor(l.price / aggStep) : Math.ceil(l.price / aggStep)) * aggStep;
        map.set(k, (map.get(k) ?? 0) + l.qty);
      }
      return [...map].map(([price, qty]) => ({ price, qty }));
    };

    // Best price first on both sides, then cut to the rows actually drawn.
    const asks = bucket(book.asks.filter(filterSize), "up")
      .sort((a, b) => a.price - b.price)
      .slice(0, rowCount);
    const bids = bucket(book.bids.filter(filterSize), "down")
      .sort((a, b) => b.price - a.price)
      .slice(0, rowCount);

    // Cumulative size runs outward from the spread on both sides — the depth
    // bar then answers "how much is between the current price and here",
    // which is the question the shape of a book is for.
    const withCum = (levels: Level[]): CumLevel[] => {
      let cum = 0;
      return levels.map((l) => { cum += l.qty; return { ...l, cum }; });
    };
    const asksCum = withCum(asks);
    const bidsCum = withCum(bids);

    const maxQty = Math.max(...asks.map((a) => a.qty), ...bids.map((b) => b.qty), 1e-9);
    const maxCum = Math.max(asksCum.at(-1)?.cum ?? 0, bidsCum.at(-1)?.cum ?? 0, 1e-9);

    // Price range actually on screen, so the panel can say what it is
    // showing instead of leaving the cut implicit.
    const shownLow = bidsCum.at(-1)?.price ?? null;
    const shownHigh = asksCum.at(-1)?.price ?? null;

    return { asks: asksCum, bids: bidsCum, maxQty, maxCum, shownLow, shownHigh };
  }, [book, minSizeRatio, aggStep, rowCount]);

  const bestAsk = rows?.asks[0]?.price;
  const bestBid = rows?.bids[0]?.price;
  const spread = bestAsk !== undefined && bestBid !== undefined ? bestAsk - bestBid : null;
  const mid = bestAsk !== undefined && bestBid !== undefined ? (bestAsk + bestBid) / 2 : null;

  /** Share of the displayed resting size sitting on the bid. */
  const buyPct = useMemo(() => {
    if (!rows) return null;
    const bid = rows.bids.reduce((s, b) => s + b.qty, 0);
    const ask = rows.asks.reduce((s, a) => s + a.qty, 0);
    if (bid + ask <= 0) return null;
    return Math.round((bid / (bid + ask)) * 100);
  }, [rows]);

  /** What the book holds versus what fits on screen, and over what price
   * band — the answer to "почему я не вижу все ордера", stated rather than
   * left for the trader to infer from rows that stop. */
  const coverage = useMemo(() => {
    if (!rows || rows.shownLow === null || rows.shownHigh === null || !mid) return null;
    const held = depth.bids + depth.asks;
    const bandPct = ((rows.shownHigh - rows.shownLow) / 2 / mid) * 100;
    return { held, bandPct };
  }, [rows, depth, mid]);

  /** Decimals taken from the step's own magnitude, so 1 reads as "1" and
   * 0.05 as "0.05" — deriving them from the instrument's price precision
   * instead gave "10.0" next to "1.00". */
  const aggLabel = (step: number) => {
    if (step <= 0) return "без группировки";
    const dp = Math.max(0, Math.min(8, -Math.floor(Math.log10(step))));
    return step.toFixed(dp);
  };

  /** Blank filler rows keep the ladder's height fixed while the book is thin. */
  const pad = <T,>(list: T[]): (T | null)[] =>
    list.length >= rowCount ? list : [...list, ...Array<null>(rowCount - list.length).fill(null)];

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
    // Always `rowCount` rows, and both sides already run best-first, so the
    // columns line up at the spread and the ladder keeps its height even when
    // one side thins out. The old version re-reversed the ask array once per
    // row, which was both O(n^2) and the reason the two columns drifted out
    // of alignment as the book changed depth.
    const bidRows = pad(rows?.bids ?? []);
    const askRows = pad(rows?.asks ?? []);
    const pairs = bidRows.map((bid, i) => ({ bid, ask: askRows[i] }));
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
            {aggSteps.map((step, i) => (
              <option key={i} value={i}>{aggLabel(step)}</option>
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
          {coverage
            ? `Показано ±${coverage.bandPct.toFixed(2)}% от цены · уровней в стакане: ${coverage.held} · нажмите на цену для лимитного ордера`
            : "Нажмите на цену, чтобы создать лимитный ордер"}
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
        <select
          value={aggIdx}
          onChange={(e) => setAggIdx(Number(e.target.value))}
          aria-label="Шаг группировки цен"
          className="rounded border border-line bg-bg-2 px-1 py-0.5 text-2xs text-txt-1 outline-none focus:border-accent"
        >
          {aggSteps.map((step, i) => (
            <option key={i} value={i}>{aggLabel(step)}</option>
          ))}
        </select>
        {/* "live" means the socket is up; "sync" means the local book has a
            verified, gap-free sequence behind it. They are different claims,
            and after a dropped update only the first one is still true. */}
        <span className={classNames("ml-auto flex items-center gap-1 text-2xs", status === "open" && synced ? "text-buy" : "text-txt-3")}>
          <span className={classNames("h-1.5 w-1.5 rounded-full", status !== "open" ? "bg-sell" : synced ? "bg-buy" : "bg-warn animate-pulse")} />
          {status !== "open" ? (status === "connecting" ? "connecting" : "offline") : synced ? "live" : "sync…"}
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
          {/* Asks run best-first in the data and are drawn bottom-up, so the
              best ask sits against the spread. Padding keeps the block a fixed
              height: without it every fill at the top shifted the whole
              ladder, and the mid-price row moved with it. */}
          <div className="flex flex-col-reverse">
            {pad(rows.asks).map((a, i) => (
              <div key={a ? a.price : `pad-a-${i}`} className="relative grid h-[15px] grid-cols-3 items-center px-2">
                {a && <div className="absolute inset-y-0 right-0 bg-sell/10" style={{ width: `${(a.cum / rows.maxCum) * 100}%` }} />}
                <span className="relative text-sell">{a ? fmtPrice(a.price, decimals) : ""}</span>
                <span className="relative text-right text-txt-1">{a ? fmt(a.qty, 4) : ""}</span>
                <span className="relative text-right text-txt-3">{a ? fmt(a.cum, 4) : ""}</span>
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
            {pad(rows.bids).map((b, i) => (
              <div key={b ? b.price : `pad-b-${i}`} className="relative grid h-[15px] grid-cols-3 items-center px-2">
                {b && <div className="absolute inset-y-0 right-0 bg-buy/10" style={{ width: `${(b.cum / rows.maxCum) * 100}%` }} />}
                <span className="relative text-buy">{b ? fmtPrice(b.price, decimals) : ""}</span>
                <span className="relative text-right text-txt-1">{b ? fmt(b.qty, 4) : ""}</span>
                <span className="relative text-right text-txt-3">{b ? fmt(b.cum, 4) : ""}</span>
              </div>
            ))}
          </div>
          {coverage && (
            <div className="mt-auto shrink-0 border-t border-line-soft px-2 py-1 text-[10px] text-txt-3">
              ±{coverage.bandPct.toFixed(2)}% от цены · уровней в стакане: {coverage.held}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
