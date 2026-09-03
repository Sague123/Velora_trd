import { useTerminalStore } from "../../store/terminal";
import { classNames } from "../../lib/format";
import { Popover } from "../common/Popover";
import { IndicatorToggle } from "./IndicatorToggle";
import {
  IconCandles, IconChartArea, IconChartLine, IconChevron, IconClose, IconCrosshair,
  IconHorizontalLine, IconPencil, IconSliders, IconTrendLine,
} from "../icons/Icon";
import type { ChartType, Oscillator } from "../../store/terminal";
import type { Timeframe } from "../../lib/types";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
const CHART_TYPES: { id: ChartType; label: string; Icon: typeof IconCandles }[] = [
  { id: "candles", label: "Свечи", Icon: IconCandles },
  { id: "line", label: "Линия", Icon: IconChartLine },
  { id: "area", label: "Область", Icon: IconChartArea },
];

/** Touch never fires `:hover`, which is the only place globals.css's `.btn-fx`
 * puts any shadow — so on mobile a control looks flat at rest and (since
 * `:active` clears shadow too) flatter still on tap. `lifted` fixes that with
 * its own shadow held at rest and a real tap-down scale instead. Desktop has
 * genuine mouse hover, so `.btn-fx`'s existing lift already works there —
 * `flat` just matches the rest of the desktop toolbar's plain bordered
 * buttons (chart-type, zoom, fullscreen) instead of introducing a heavier,
 * inconsistent shadow style next to them. */
const liftedCls =
  "tap-sm relative flex items-center justify-center gap-1 rounded-xl border font-semibold shadow-lift " +
  "transition-transform duration-100 active:scale-95";
const flatCls =
  "btn-fx relative flex items-center justify-center gap-1 rounded border font-medium " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

export const mobileCtrlCls = liftedCls;

export function mobileCtrlTone(active: boolean) {
  return active ? "border-accent/70 bg-accent-fill text-white" : "border-line bg-bg-2 text-txt-1";
}

function toneFor(variant: "flat" | "lifted", active: boolean) {
  if (variant === "lifted") return mobileCtrlTone(active);
  return active ? "border-accent-fill bg-accent-fill text-white" : "border-line bg-bg-2 text-txt-2 hover:text-txt-0";
}

/**
 * Chart type / Timeframe / Indicators / Draw — one shared toolbar for both
 * breakpoints instead of desktop hand-rolling its own inline row and mobile
 * keeping a separate compact one. All four read/write the shared terminal
 * store (see store/terminal.ts) so ChartPanel, which owns the actual
 * ChartEngine instance, reacts to the same values without a ref passed
 * across components.
 *
 * `variant="lifted"` (mobile, the default) gives each control its own
 * always-on shadow and a tap-down squish, since touch never triggers the
 * hover-only lift the rest of the app's buttons rely on. `variant="flat"`
 * (desktop) matches the plain bordered buttons already used for zoom/
 * fullscreen there — real mouse hover already provides feedback.
 */
export function ChartToolbar({ variant = "lifted" }: { variant?: "flat" | "lifted" }) {
  const chartType = useTerminalStore((s) => s.chartType);
  const setChartType = useTerminalStore((s) => s.setChartType);
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
  const btnCls = variant === "lifted" ? liftedCls : flatCls;
  const ChartTypeIcon = CHART_TYPES.find((c) => c.id === chartType)?.Icon ?? IconCandles;
  const menuItemCls = (active: boolean) =>
    classNames(
      "tap-sm flex w-full items-center gap-2 rounded-lg px-2.5 text-xs font-medium active:scale-95",
      active ? "bg-accent-soft text-accent" : "text-txt-1 hover:bg-bg-3"
    );

  return (
    <div className="flex shrink-0 items-center gap-1">
      {/* Timeframe first — it's the control a trader actually reaches for
          constantly; chart type is set once and rarely touched again, so it
          gets the quieter icon-only slot right after instead of the lead
          position. */}
      <Popover
        trigger={(open, toggle) => (
          <button onClick={toggle} className={classNames(btnCls, "h-8 px-2 text-2xs", toneFor(variant, open))}>
            {timeframe}
            <IconChevron size={10} direction={open ? "up" : "down"} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-24 p-1">
            {TIMEFRAMES.map((tf) => (
              <button key={tf} onClick={() => { setTimeframe(tf); close(); }} className={menuItemCls(timeframe === tf)}>
                {tf}
              </button>
            ))}
          </div>
        )}
      </Popover>

      <Popover
        trigger={(open, toggle) => (
          <button onClick={toggle} className={classNames(btnCls, "h-8 w-8", toneFor(variant, open))} aria-label="Тип графика" title="Тип графика">
            <ChartTypeIcon size={variant === "lifted" ? 17 : 14} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-36 p-1">
            {CHART_TYPES.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => { setChartType(id); close(); }} className={menuItemCls(chartType === id)}>
                <Icon size={15} /> {label}
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
            className={classNames(btnCls, "h-8 w-8", toneFor(variant, open || indicatorsActive))}
            aria-label="Индикаторы"
            title="Индикаторы"
          >
            <IconSliders size={variant === "lifted" ? 17 : 14} />
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
            className={classNames(btnCls, "h-8 w-8", toneFor(variant, open || tool !== "cursor"))}
            aria-label="Инструменты рисования"
            title="Инструменты рисования"
          >
            <IconPencil size={variant === "lifted" ? 17 : 14} />
          </button>
        )}
      >
        {(close) => (
          <div className="w-48 p-1">
            <button onClick={() => { setTool("cursor"); close(); }} className={menuItemCls(tool === "cursor")}>
              <IconCrosshair size={15} /> Курсор
            </button>
            <button onClick={() => { setTool("trendline"); close(); }} className={menuItemCls(tool === "trendline")}>
              <IconTrendLine size={15} /> Линия тренда
            </button>
            <button onClick={() => { setTool("hline"); close(); }} className={menuItemCls(tool === "hline")}>
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
