import { useTerminalStore } from "../../store/terminal";
import { classNames } from "../../lib/format";
import { Popover } from "../common/Popover";
import { IndicatorToggle } from "./IndicatorToggle";
import { IconChevron, IconClose, IconCrosshair, IconHorizontalLine, IconPencil, IconSliders, IconTrendLine } from "../icons/Icon";
import type { Oscillator } from "../../store/terminal";
import type { Timeframe } from "../../lib/types";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];

/** Shared press/depth treatment for every compact control in this row and in
 * MobileTerminal's header. globals.css's `.btn-fx` gives depth only via
 * `:hover` (a state a touchscreen never fires) and clears it on `:active` —
 * built for a mouse, invisible on a phone. It's also tuned as `--shadow-btn`
 * (`0 1px 2px rgba(0,0,0,.4)`), a 2px-blur shadow that barely registers
 * against this app's near-black surfaces regardless of hover state. Mobile
 * controls use `shadow-lift` instead — the same larger, further-reaching
 * shadow the chart-collapse button already used — kept at rest (not cleared
 * on press, unlike `.btn-fx`) so there's always a visible raised edge, with
 * `active:scale-95` as the actual press feedback: a real tap-down squish
 * that doesn't depend on a shadow being visible at all. */
export const mobileCtrlCls =
  "tap-sm relative flex items-center justify-center gap-1 rounded-xl border font-semibold shadow-lift " +
  "transition-transform duration-100 active:scale-95";

export function mobileCtrlTone(active: boolean) {
  return active
    ? "border-accent/70 bg-accent-fill text-white"
    : "border-line bg-bg-2 text-txt-1";
}

/**
 * Timeframe / Indicators / Draw — merged into the mobile header row between
 * the symbol picker and the Chart/Book toggle (moved out of ChartPanel's own
 * toolbar entirely, which is why the mobile chart pane now starts with no
 * standing control row of its own). All three read/write the shared terminal
 * store (see store/terminal.ts) so ChartPanel, which owns the actual
 * ChartEngine instance, reacts to the same values without needing a ref
 * passed across components.
 */
export function ChartToolbar() {
  const timeframe = useTerminalStore((s) => s.timeframe);
  const setTimeframe = useTerminalStore((s) => s.setTimeframe);
  const showSma20 = useTerminalStore((s) => s.showSma20);
  const showSma50 = useTerminalStore((s) => s.showSma50);
  const showEma9 = useTerminalStore((s) => s.showEma9);
  const showEma21 = useTerminalStore((s) => s.showEma21);
  const oscillator = useTerminalStore((s) => s.oscillator);
  const setShowSma20 = useTerminalStore((s) => s.setShowSma20);
  const setShowSma50 = useTerminalStore((s) => s.setShowSma50);
  const setShowEma9 = useTerminalStore((s) => s.setShowEma9);
  const setShowEma21 = useTerminalStore((s) => s.setShowEma21);
  const setOscillator = useTerminalStore((s) => s.setOscillator);
  const tool = useTerminalStore((s) => s.tool);
  const setTool = useTerminalStore((s) => s.setTool);
  const requestClearDrawings = useTerminalStore((s) => s.requestClearDrawings);

  const indicatorsActive = showSma20 || showSma50 || showEma9 || showEma21 || oscillator !== "NONE";

  return (
    <div className="flex shrink-0 items-center gap-1">
      <Popover
        trigger={(open, toggle) => (
          <button onClick={toggle} className={classNames(mobileCtrlCls, "h-8 px-2 text-2xs", mobileCtrlTone(open))}>
            {timeframe}
            <IconChevron size={10} direction={open ? "up" : "down"} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-24 p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => { setTimeframe(tf); close(); }}
                className={classNames(
                  "tap-sm flex w-full items-center rounded-lg px-2.5 text-xs font-medium active:scale-95",
                  timeframe === tf ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover
        align="left"
        trigger={(open, toggle) => (
          <button
            onClick={toggle}
            className={classNames(mobileCtrlCls, "h-8 w-8", mobileCtrlTone(open || indicatorsActive))}
            aria-label="Индикаторы"
            title="Индикаторы"
          >
            <IconSliders size={17} />
          </button>
        )}
      >
        {() => (
          <div className="w-44 space-y-2 p-3">
            <IndicatorToggle checked={showSma20} onChange={setShowSma20} textClass="text-accent" boxCheckedClass="border-accent bg-accent" label="SMA20" />
            <IndicatorToggle checked={showSma50} onChange={setShowSma50} textClass="text-warn" boxCheckedClass="border-warn bg-warn" label="SMA50" />
            <IndicatorToggle checked={showEma9} onChange={setShowEma9} textClass="text-indicator-ema9" boxCheckedClass="border-indicator-ema9 bg-indicator-ema9" label="EMA9" />
            <IndicatorToggle checked={showEma21} onChange={setShowEma21} textClass="text-indicator-ema21" boxCheckedClass="border-indicator-ema21 bg-indicator-ema21" label="EMA21" />
            <div className="border-t border-line-soft pt-2">
              <select value={oscillator} onChange={(e) => setOscillator(e.target.value as Oscillator)}
                className="w-full rounded-lg border border-line bg-bg-3 px-1.5 py-1 text-2xs text-txt-1 outline-none focus:border-accent">
                <option value="NONE">Oscillator: none</option>
                <option value="RSI">RSI (14)</option>
                <option value="MACD">MACD (12,26,9)</option>
              </select>
            </div>
          </div>
        )}
      </Popover>

      <Popover
        align="left"
        trigger={(open, toggle) => (
          <button
            onClick={toggle}
            className={classNames(mobileCtrlCls, "h-8 w-8", mobileCtrlTone(open || tool !== "cursor"))}
            aria-label="Инструменты рисования"
            title="Инструменты рисования"
          >
            <IconPencil size={17} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-48 p-1">
            <button
              onClick={() => { setTool("cursor"); close(); }}
              className={classNames("tap-sm flex w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium active:scale-95", tool === "cursor" ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3")}
            >
              <IconCrosshair size={15} /> Курсор
            </button>
            <button
              onClick={() => { setTool("trendline"); close(); }}
              className={classNames("tap-sm flex w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium active:scale-95", tool === "trendline" ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3")}
            >
              <IconTrendLine size={15} /> Линия тренда
            </button>
            <button
              onClick={() => { setTool("hline"); close(); }}
              className={classNames("tap-sm flex w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium active:scale-95", tool === "hline" ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3")}
            >
              <IconHorizontalLine size={15} /> Горизонтальная линия
            </button>
            <div className="my-1 border-t border-line-soft" />
            <button
              onClick={() => { requestClearDrawings(); close(); }}
              className="tap-sm flex w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium text-txt-2 hover:bg-bg-3 hover:text-sell active:scale-95"
            >
              <IconClose size={15} /> Удалить все линии
            </button>
          </div>
        )}
      </Popover>
    </div>
  );
}
