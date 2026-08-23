import { OrderBookPanel } from "./OrderBookPanel";

/** Just the order book now — the separate "Market Info" tab was folded into
 * a slim stats line at the top of OrderBookPanel, and honest per-instrument
 * source labeling already lives on the chart header. */
export function RightPanelTabs() {
  return (
    <div className="flex h-full flex-col border-l border-line bg-bg-1">
      <OrderBookPanel />
    </div>
  );
}
