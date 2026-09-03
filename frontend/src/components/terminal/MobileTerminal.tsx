import { useState } from "react";
import { MarketWatch } from "./MarketWatch";
import { ChartPanel } from "./ChartPanel";
import { ChartToolbar, mobileCtrlCls, mobileCtrlTone } from "./ChartToolbar";
import { BottomPanel } from "./BottomPanel";
import { OrderBookPanel } from "./OrderBookPanel";
import { OrderEntry } from "./OrderEntry";
import { AccountStrip } from "./AccountStrip";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { IconBook, IconCandles, IconChevron, IconClipboard, IconClose, IconTrade } from "../icons/Icon";

type TopView = "chart" | "book";
type BottomView = "trade" | "orders";

/** Phone/portrait layout: chart fills roughly the top half, a compact order
 * entry + orders/history segment fills the bottom half, and the order book
 * swaps in for the chart via a small toggle rather than a separate page.
 * No hamburger, no full-page tab switching to trade — everything needed to
 * place and manage an order stays on one screen. */
export function MobileTerminal() {
  const symbol = useTerminalStore((s) => s.symbol);
  const inst = useLiveInstrument(symbol);
  const [topView, setTopView] = useState<TopView>("chart");
  const [bottomView, setBottomView] = useState<BottomView>("trade");
  const [pickerOpen, setPickerOpen] = useState(false);
  // Halves the chart pane so the order form gets the room instead — on a
  // phone the default split leaves the amount/leverage fields cramped.
  const [chartCollapsed, setChartCollapsed] = useState(false);

  return (
    <div className="flex h-full flex-col">
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

      {/* Everything above the chart in one row: symbol/price, then the
          chart's own timeframe/indicators/draw controls, then the Chart/Book
          switch — merged from three separate rows into one so the chart pane
          starts as high on the screen as possible (only when topView is
          "chart": the timeframe/indicator/draw controls act on the chart, so
          they hide rather than sit there disabled while looking at the book). */}
      <div className="flex shrink-0 items-center gap-1.5 border-b border-line bg-bg-1 px-2 py-1.5">
        <button
          onClick={() => setPickerOpen(true)}
          className={classNames(mobileCtrlCls, "h-8 shrink-0 px-2 text-xs", mobileCtrlTone(false))}
        >
          {symbol} <IconChevron size={10} direction="down" className="text-txt-3" />
        </button>
        {inst && (
          <div className="shrink-0 leading-tight">
            <div className={classNames("tabular text-xs font-semibold", inst.dir === "up" ? "text-buy" : inst.dir === "down" ? "text-sell" : "text-txt-0")}>
              {fmtPrice(inst.livePrice, inst.priceDecimals)}
            </div>
            <div className={classNames("tabular text-[10px]", inst.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(inst.liveChange24h)}</div>
          </div>
        )}

        {/* No overflow-x-auto here: that clips the TF/Indicators/Draw
            popovers below it too (setting overflow-x forces overflow-y to
            clip as well, per the CSS spec — not just an unrelated axis),
            which is exactly why they used to open "under" the chart pane
            instead of over it. The row fits without needing to scroll. */}
        {topView === "chart" && (
          <div className="min-w-0 flex-1">
            <ChartToolbar />
          </div>
        )}
        <div className="ml-auto flex shrink-0 gap-1">
          <button
            onClick={() => setTopView("chart")}
            title="Chart"
            aria-label="Chart"
            className={classNames(mobileCtrlCls, "h-8 w-8", mobileCtrlTone(topView === "chart"))}
          >
            <IconCandles size={16} />
          </button>
          <button
            onClick={() => setTopView("book")}
            title="Book"
            aria-label="Book"
            className={classNames(mobileCtrlCls, "h-8 w-8", mobileCtrlTone(topView === "book"))}
          >
            <IconBook size={16} />
          </button>
        </div>
      </div>

      {/* data-swipe-nav-ignore on the whole pane, not just the chart's own
          canvas wrapper (ChartPanel already carries one too, belt-and-
          braces) — a drag anywhere in here, including the still-loading/
          error states and the order book, must never be misread as "swipe
          to change page". See useSwipeNav.ts. */}
      <div
        className="relative shrink-0 border-b border-line transition-[height] duration-200"
        style={{ height: chartCollapsed ? "22%" : "48%" }}
        data-swipe-nav-ignore=""
      >
        {topView === "chart" ? <ChartPanel compact /> : <OrderBookPanel />}
        <button
          onClick={() => setChartCollapsed((v) => !v)}
          aria-label={chartCollapsed ? "Развернуть график" : "Свернуть график"}
          title={chartCollapsed ? "Развернуть график" : "Свернуть график"}
          className="btn-fx absolute bottom-1.5 right-1.5 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-line bg-bg-1/90 text-txt-2 shadow-lift backdrop-blur hover:border-accent hover:text-accent"
        >
          <IconChevron size={14} direction={chartCollapsed ? "down" : "up"} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Trade / Orders — a segmented control, not two large stacked
            buttons: real depth via shadow-lift on the active segment plus a
            press-down squish, not a flat colour fill. */}
        <div className="flex shrink-0 gap-1 border-b border-line-soft bg-bg-2/50 p-1">
          <button
            onClick={() => setBottomView("trade")}
            className={classNames(mobileCtrlCls, "h-8 flex-1 text-2xs", mobileCtrlTone(bottomView === "trade"))}
          >
            <IconTrade size={15} /> Trade
          </button>
          <button
            onClick={() => setBottomView("orders")}
            className={classNames(mobileCtrlCls, "h-8 flex-1 text-2xs", mobileCtrlTone(bottomView === "orders"))}
          >
            <IconClipboard size={15} /> Orders &amp; History
          </button>
        </div>
        <div className="min-h-0 flex-1">{bottomView === "trade" ? <OrderEntry compact /> : <BottomPanel />}</div>
      </div>

      <AccountStrip />
    </div>
  );
}
