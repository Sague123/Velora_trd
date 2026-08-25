import { useState } from "react";
import { MarketWatch } from "./MarketWatch";
import { ChartPanel } from "./ChartPanel";
import { BottomPanel } from "./BottomPanel";
import { RightPanelTabs } from "./RightPanelTabs";
import { OrderEntry } from "./OrderEntry";
import { AccountStrip } from "./AccountStrip";
import { useTerminalStore } from "../../store/terminal";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { classNames, fmtPct, fmtPrice } from "../../lib/format";
import { IconBook, IconCandles, IconClipboard, IconClose, IconTrade } from "../icons/Icon";

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

  return (
    <div className="flex h-full flex-col">
      {pickerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-bg-0">
          <div className="flex shrink-0 items-center justify-between border-b border-line px-3 py-2">
            <span className="text-xs font-semibold text-txt-0">Выбрать инструмент</span>
            <button onClick={() => setPickerOpen(false)} className="btn-fx tap-sm flex items-center gap-1 rounded border border-line px-2.5 text-2xs text-txt-2">
              <IconClose size={12} /> Закрыть
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <MarketWatch onSelect={() => setPickerOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-line px-2 py-1.5">
        <button onClick={() => setPickerOpen(true)} className="btn-fx tap-sm flex items-center gap-1 rounded border border-line px-2.5 text-xs font-semibold text-txt-0">
          {symbol} <span className="text-2xs text-txt-3">▾</span>
        </button>
        {inst && (
          <>
            <span className={classNames("tabular text-xs font-semibold", inst.dir === "up" ? "text-buy" : inst.dir === "down" ? "text-sell" : "text-txt-0")}>
              {fmtPrice(inst.livePrice, inst.priceDecimals)}
            </span>
            <span className={classNames("tabular text-2xs", inst.liveChange24h >= 0 ? "text-buy" : "text-sell")}>{fmtPct(inst.liveChange24h)}</span>
          </>
        )}
        <div className="ml-auto flex gap-0.5 rounded border border-line p-0.5">
          <button onClick={() => setTopView("chart")} className={classNames("tap-sm flex items-center gap-1 rounded px-2.5 text-2xs font-medium", topView === "chart" ? "bg-accent-soft text-accent" : "text-txt-2")}>
            <IconCandles size={13} /> Chart
          </button>
          <button onClick={() => setTopView("book")} className={classNames("tap-sm flex items-center gap-1 rounded px-2.5 text-2xs font-medium", topView === "book" ? "bg-accent-soft text-accent" : "text-txt-2")}>
            <IconBook size={13} /> Book
          </button>
        </div>
      </div>

      <div className="shrink-0 border-b border-line" style={{ height: "46%" }}>
        {topView === "chart" ? <ChartPanel compact /> : <RightPanelTabs />}
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 gap-0.5 border-b border-line-soft bg-bg-2/30 p-1">
          <button
            onClick={() => setBottomView("trade")}
            className={classNames("btn-fx tap-sm flex flex-1 items-center justify-center gap-1 rounded text-2xs font-medium transition-colors", bottomView === "trade" ? "bg-accent text-white" : "text-txt-2")}
          >
            <IconTrade size={13} /> Trade
          </button>
          <button
            onClick={() => setBottomView("orders")}
            className={classNames("btn-fx tap-sm flex flex-1 items-center justify-center gap-1 rounded text-2xs font-medium transition-colors", bottomView === "orders" ? "bg-accent text-white" : "text-txt-2")}
          >
            <IconClipboard size={13} /> Orders &amp; History
          </button>
        </div>
        <div className="min-h-0 flex-1">{bottomView === "trade" ? <OrderEntry compact /> : <BottomPanel />}</div>
      </div>

      <AccountStrip />
    </div>
  );
}
