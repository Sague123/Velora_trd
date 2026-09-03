import { useState } from "react";
import { MarketWatch } from "../components/terminal/MarketWatch";
import { ChartPanel } from "../components/terminal/ChartPanel";
import { BottomPanel } from "../components/terminal/BottomPanel";
import { OrderBookPanel } from "../components/terminal/OrderBookPanel";
import { OrderEntry } from "../components/terminal/OrderEntry";
import { AccountStrip } from "../components/terminal/AccountStrip";
import { Resizer } from "../components/common/Resizer";
import { useResizable, useResizableInverted } from "../hooks/useResizable";
import { useIsMobile } from "../hooks/useIsMobile";
import { MobileTerminal } from "../components/terminal/MobileTerminal";

export function TerminalPage() {
  const isMobile = useIsMobile();
  // Defaults tuned toward the chart and the order form, which is what a
  // trader actually spends their time on — MarketWatch and the order book
  // are reference panels, not workspaces, so they start closer to their
  // usable minimum instead of splitting the window three ways evenly.
  // Every one of these stays fully resizable; this only changes where the
  // drag starts from.
  const [watchWidth, onWatchDelta] = useResizable(220, 180, 420);
  const [rightWidth, onRightDelta] = useResizableInverted(320, 260, 460);
  const [bottomHeight, onBottomDelta] = useResizableInverted(220, 120, 460);
  const [infoHeight, onInfoDelta] = useResizable(260, 200, 560);
  const [watchCollapsed, setWatchCollapsed] = useState(false);

  if (isMobile) return <MobileTerminal />;

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {!watchCollapsed && (
          <>
            <div style={{ width: watchWidth }} className="shrink-0">
              <MarketWatch />
            </div>
            <Resizer axis="x" onResize={onWatchDelta} />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <ChartPanel onToggleWatch={() => setWatchCollapsed((v) => !v)} watchCollapsed={watchCollapsed} />
          </div>
          <Resizer axis="y" onResize={onBottomDelta} />
          <div style={{ height: bottomHeight }} className="shrink-0 border-t border-line">
            <BottomPanel />
          </div>
        </div>

        <Resizer axis="x" onResize={onRightDelta} />
        <div style={{ width: rightWidth }} className="flex shrink-0 flex-col">
          <div style={{ height: infoHeight }} className="min-h-0 shrink-0">
            <OrderBookPanel />
          </div>
          <Resizer axis="y" onResize={onInfoDelta} />
          <div className="min-h-0 flex-1 border-l border-line">
            <OrderEntry />
          </div>
        </div>
      </div>

      <AccountStrip />
    </div>
  );
}
