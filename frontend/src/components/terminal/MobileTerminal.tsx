import { useEffect, useMemo, useRef, useState } from "react";
import { MarketWatch } from "./MarketWatch";
import { ChartPanel } from "./ChartPanel";
import { ChartToolbar } from "./ChartToolbar";
import { BottomPanel } from "./BottomPanel";
import { OrderBookPanel } from "./OrderBookPanel";
import { MobileOrderTicket } from "./MobileOrderTicket";
import { useTerminalStore } from "../../store/terminal";
import { useOrderTicketStore } from "../../store/orderTicket";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useChartBars } from "../../hooks/useMarket";
import { ema, sma } from "../../lib/indicators";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { IconBookOpenCover, IconCandles, IconChevron, IconClose, IconOrderHistory } from "../icons/Icon";
import type { MobileMode } from "../../store/terminal";
import type { OrderSide } from "../../lib/types";

const MODES: { id: MobileMode; Icon: typeof IconCandles; label: string }[] = [
  { id: "chart", Icon: IconCandles, label: "График" },
  { id: "book", Icon: IconBookOpenCover, label: "Стакан" },
  { id: "history", Icon: IconOrderHistory, label: "История" },
];

/** The moving averages actually drawn on the chart right now, with their last
 * value — the same overlays the Indicators menu toggles, not a fixed set of
 * periods invented for the legend. */
function IndicatorLegend() {
  const symbol = useTerminalStore((s) => s.symbol);
  const timeframe = useTerminalStore((s) => s.timeframe);
  const inst = useLiveInstrument(symbol);
  const { data } = useChartBars(symbol, inst?.category, timeframe);
  const showSma20 = useTerminalStore((s) => s.showSma20);
  const showSma50 = useTerminalStore((s) => s.showSma50);
  const showEma9 = useTerminalStore((s) => s.showEma9);
  const showEma21 = useTerminalStore((s) => s.showEma21);

  const items = useMemo(() => {
    const closes = (data?.bars ?? []).map((b) => b.close);
    if (closes.length === 0) return [];
    const last = (arr: (number | null)[]) => arr.at(-1) ?? null;
    const out: { label: string; value: number | null; cls: string }[] = [];
    if (showSma20) out.push({ label: "SMA20", value: last(sma(closes, 20)), cls: "text-accent" });
    if (showSma50) out.push({ label: "SMA50", value: last(sma(closes, 50)), cls: "text-warn" });
    if (showEma9) out.push({ label: "EMA9", value: last(ema(closes, 9)), cls: "text-indicator-ema9" });
    if (showEma21) out.push({ label: "EMA21", value: last(ema(closes, 21)), cls: "text-indicator-ema21" });
    return out;
  }, [data, showSma20, showSma50, showEma9, showEma21]);

  return (
    <div className="flex items-center gap-3 px-3.5 pb-1 pt-2">
      <div className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden text-[10px] tabular">
        {items.length === 0 ? (
          <span className="text-txt-3">Индикаторы выключены</span>
        ) : (
          items.map((i) => (
            <span key={i.label} className={classNames("shrink-0", i.cls)}>
              {i.label} <span className="text-txt-3">{i.value !== null ? fmtPrice(i.value, inst?.priceDecimals ?? 2) : "—"}</span>
            </span>
          ))
        )}
      </div>
      {/* All four chart controls together, timeframe leading — it's also a
          chart display setting, not a property of the symbol, so it belongs
          with the rest of them rather than pinned up in the price row. */}
      <ChartToolbar show={["timeframe", "chartType", "indicators", "draw"]} />
    </div>
  );
}

/**
 * Phone terminal: chart, order book and history are three modes of one
 * screen, switched from the symbol row, with the order ticket below whichever
 * of them is showing (history excepted — there is no order to compose while
 * reading past ones). The page scrolls; Buy/Sell and the account summary stay
 * pinned in MobileBottomStack, which is the only place an order is sent.
 */
export function MobileTerminal() {
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const mode = useTerminalStore((s) => s.mobileMode);
  const setMode = useTerminalStore((s) => s.setMobileMode);
  const focusTicketRequest = useTerminalStore((s) => s.focusTicketRequest);
  const setType = useOrderTicketStore((s) => s.setType);
  const setPrice = useOrderTicketStore((s) => s.setPrice);
  const setSide = useOrderTicketStore((s) => s.setSide);
  const [pickerOpen, setPickerOpen] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // A mode switch replaces everything below the symbol row, so carrying the
  // old scroll offset over would drop the trader into the middle of the new
  // content — with the switch they just tapped scrolled off the top.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [mode]);

  // Scrolls the ticket into view on request — from the pinned Buy/Sell bar,
  // or from a price tapped in the book. The scroll container is this
  // component's, so the request arrives through the store rather than as a
  // callback threaded down from the fixed bar outside this tree.
  useEffect(() => {
    if (focusTicketRequest === 0) return;
    const id = window.setTimeout(() => {
      ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
    return () => window.clearTimeout(id);
  }, [focusTicketRequest]);

  /** One tap in the book is one action, not five: it sets a limit order at
   * that price on that side, returns to the chart and brings the ticket up. */
  function pickPriceFromBook(price: number, side: OrderSide) {
    setType("LIMIT");
    setPrice(String(price));
    setSide(side);
    setMode("chart");
    window.setTimeout(() => ticketRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
  }

  return (
    <div className="flex h-full flex-col bg-bg-0">
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg-0">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-semibold text-txt-0">Выбрать инструмент</span>
            <button onClick={() => setPickerOpen(false)} className="btn-fx tap-sm flex items-center gap-1 rounded-lg border border-line px-2.5 text-2xs text-txt-2 shadow-btn">
              <IconClose size={12} /> Закрыть
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <MarketWatch onSelect={() => setPickerOpen(false)} />
          </div>
        </div>
      )}

      {/* History has its own internal scroll and should fill exactly what's
          left of the screen; the other two modes stack content that runs
          past the fold, so there the page itself scrolls. */}
      <div
        ref={scrollRef}
        className={classNames("flex min-h-0 flex-1 flex-col", mode === "history" ? "overflow-hidden" : "overflow-y-auto")}
      >
        {/* Symbol, price, timeframe and the mode switch — one row, and the
            only chrome above the chart. */}
        <section className="flex shrink-0 items-start justify-between border-b border-line-soft px-3.5 pb-2.5 pt-3">
          <div className="min-w-0">
            <button
              onClick={() => setPickerOpen(true)}
              className="tap-sm flex items-center gap-1.5 text-sm font-bold text-txt-0"
            >
              {symbol} <IconChevron size={13} direction="down" className="text-txt-3" />
            </button>
            <div className="mt-1 flex items-baseline gap-2">
              <span
                className={classNames(
                  "text-[22px] font-bold leading-none tabular tracking-tight",
                  inst?.dir === "up" ? "text-buy" : inst?.dir === "down" ? "text-sell" : "text-txt-0"
                )}
              >
                {fmtPrice(inst?.livePrice, inst?.priceDecimals ?? 2)}
              </span>
              {inst && (
                <span className={classNames("text-xs font-bold tabular", inst.liveChange24h >= 0 ? "text-buy" : "text-sell")}>
                  {fmtPct(inst.liveChange24h)}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex rounded-lg border border-line bg-bg-2 p-0.5">
              {MODES.map(({ id, Icon, label }) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  aria-label={label}
                  title={label}
                  aria-pressed={mode === id}
                  className={classNames(
                    "tap-sm flex h-7 w-8 items-center justify-center rounded-md transition-colors",
                    mode === id ? "bg-accent-fill text-white shadow-btn" : "text-txt-3"
                  )}
                >
                  <Icon size={14} />
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* data-swipe-nav-ignore: a horizontal drag here pans the chart or
            reads the ladder — it must never be taken for a page swipe. */}
        {mode === "chart" && (
          <>
            <IndicatorLegend />
            <div className="h-[38vh] min-h-[200px] shrink-0 px-2.5" data-swipe-nav-ignore="">
              <div className="h-full overflow-hidden rounded-xl border border-line-soft">
                <ChartPanel compact />
              </div>
            </div>
          </>
        )}
        {mode === "book" && (
          <div className="shrink-0" data-swipe-nav-ignore="">
            <OrderBookPanel compact onPickPrice={pickPriceFromBook} />
          </div>
        )}
        {mode === "history" && (
          <div className="flex min-h-0 flex-1 flex-col">
            <BottomPanel />
          </div>
        )}

        {/* No ticket while reading history: there is nothing to compose
            against a list of closed trades, and the pinned Buy/Sell bar
            switches back to the chart before it needs one. */}
        {mode !== "history" && (
          <div ref={ticketRef} className="mt-2.5 shrink-0">
            <MobileOrderTicket />
          </div>
        )}
      </div>
    </div>
  );
}
