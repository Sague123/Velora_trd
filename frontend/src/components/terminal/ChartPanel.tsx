import { useEffect, useMemo, useRef, useState } from "react";
import { ChartEngine, type Bar, type Drawing, type OverlayLine } from "../../lib/chartEngine";
import { chartThemeFor } from "../../lib/chartTheme";
import { useChartBars } from "../../hooks/useMarket";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useTerminalStore } from "../../store/terminal";
import { usePriceStore } from "../../store/prices";
import { useThemeStore } from "../../store/theme";
import { useAuthStore } from "../../store/auth";
import { usePositions, useUpdatePosition, useClosePosition } from "../../hooks/useTrading";
import { useBinanceSymbolFeed } from "../../hooks/useBinanceSymbolFeed";
import { classNames, fmtCompact, fmtPct, fmtPrice, fmtQty, fmtSigned, fmtUsd, n } from "../../lib/format";
import { ema, macd as macdCalc, rsi as rsiCalc, sma } from "../../lib/indicators";
import { computeSignal, ratingLabel, type SignalResult } from "../../lib/signal";
import { Tooltip } from "../common/Tooltip";
import { LoadingRow, ErrorRow } from "../common/States";
import { ChartToolbar } from "./ChartToolbar";
import { IconRefresh, IconChevron, IconFit, IconExpand, IconCollapse } from "../icons/Icon";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import type { Position } from "../../lib/types";

const RATING_COLOR: Record<SignalResult["rating"], string> = {
  STRONG_BUY: "text-buy", BUY: "text-buy", NEUTRAL: "text-txt-2", SELL: "text-sell", STRONG_SELL: "text-sell",
};

function drawingsKey(symbol: string) {
  return `velora-drawings-${symbol}`;
}
function loadDrawings(symbol: string): Drawing[] {
  try {
    const raw = localStorage.getItem(drawingsKey(symbol));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function saveDrawings(symbol: string, drawings: Drawing[]) {
  try {
    localStorage.setItem(drawingsKey(symbol), JSON.stringify(drawings));
  } catch { /* storage full/unavailable — drawings just won't persist */ }
}

/** SMA/EMA legend toggle — a real `<input type="checkbox">`, visually hidden
 * (`sr-only`, not `hidden`/`display:none`) so it keeps full keyboard/screen-
 * reader semantics, with a custom box driven by Tailwind's `peer` variants
 * for the checked/focus-visible states. Was a bare native checkbox before —
 * the only unstyled form control left in an otherwise fully custom UI kit. */
export function ChartPanel({ onToggleWatch, watchCollapsed, compact = false }: { onToggleWatch?: () => void; watchCollapsed?: boolean; compact?: boolean }) {
  const symbol = useTerminalStore((s) => s.symbol);
  const timeframe = useTerminalStore((s) => s.timeframe);
  const setTimeframe = useTerminalStore((s) => s.setTimeframe);
  const inst = useLiveInstrument(symbol);
  const { data, isLoading, isError, refetch, isFetching, loadMore, hasMore, isLoadingMore } = useChartBars(symbol, inst?.category, timeframe);
  // Real-time, trade-by-trade price for this one symbol — without it the live
  // candle could only redraw once a second (the catalog ticker's cadence).
  useBinanceSymbolFeed(symbol, inst?.category);
  const tick = usePriceStore((s) => s.ticks[symbol]);
  const theme = useThemeStore((s) => s.theme);
  const user = useAuthStore((s) => s.user);
  const positionsQuery = usePositions(!!user);
  const updatePosition = useUpdatePosition();
  const closePosition = useClosePosition();
  const position = useMemo(
    () => positionsQuery.data?.positions.find((p) => p.symbol === symbol) ?? null,
    [positionsQuery.data, symbol]
  );
  const positionRef = useRef<Position | null>(null);
  useEffect(() => { positionRef.current = position; }, [position]);

  // Chart type and overlay/tool state live in the shared terminal store, not
  // local state — see store/terminal.ts's doc comment: both the desktop and
  // mobile headers render the same ChartToolbar controls, so this component
  // and they need to read/write the same values.
  const chartType = useTerminalStore((s) => s.chartType);
  const showSma20 = useTerminalStore((s) => s.showSma20);
  const showSma50 = useTerminalStore((s) => s.showSma50);
  const showEma9 = useTerminalStore((s) => s.showEma9);
  const showEma21 = useTerminalStore((s) => s.showEma21);
  const oscillator = useTerminalStore((s) => s.oscillator);
  const tool = useTerminalStore((s) => s.tool);
  // Only the setter this component itself still calls (reset to cursor on
  // symbol change, below) — the rest of the toggles are set from
  // ChartToolbar.tsx, which writes the same store directly.
  const setTool = useTerminalStore((s) => s.setTool);
  const [fullscreen, setFullscreen] = useState(false);
  const [atHistoryStart, setAtHistoryStart] = useState(false);
  const [legend, setLegend] = useState<Bar | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<ChartEngine | null>(null);
  const fittedKeyRef = useRef<string>("");
  const barsRef = useRef<Bar[]>([]);
  const firstBarTimeRef = useRef<number | null>(null);

  // Drop the still-forming last bar for the signal read — its close moves
  // with every live tick/refetch, which used to flip Buy/Sell back and forth
  // within seconds instead of only when a candle actually closes.
  const closes = useMemo(() => {
    const bars = data?.bars ?? [];
    const closed = bars.length > 31 ? bars.slice(0, -1) : bars;
    return closed.map((b) => b.close);
  }, [data]);
  const signal = useMemo(() => computeSignal(closes), [closes]);

  // ---- create engine once ----
  useEffect(() => {
    if (!containerRef.current) return;
    const engine = new ChartEngine(containerRef.current);
    engine.setTheme(chartThemeFor(useThemeStore.getState().theme));
    engine.setRangeListener((atStart) => setAtHistoryStart(atStart));
    engine.setCrosshairListener((bar) => setLegend(bar));
    engine.setDrawingsListener((drawings) => saveDrawings(useTerminalStore.getState().symbol, drawings));
    // Dragging TP/SL on the chart or hitting the close button on the entry
    // line reuses the exact same mutations as the Positions table — reading
    // the live position through a ref so this only needs registering once.
    engine.setPositionHandlers({
      onTpChange: (price) => {
        const p = positionRef.current;
        if (!p) return;
        updatePosition.mutate({ id: p.id, takeProfit: String(price) }, {
          onSuccess: () => toast.success("Take Profit обновлён", `${p.symbol} @ ${fmtPrice(price, 4)}`),
          onError: (e) => toast.error("Не удалось обновить TP", e instanceof ApiError ? e.message : undefined),
        });
      },
      onSlChange: (price) => {
        const p = positionRef.current;
        if (!p) return;
        updatePosition.mutate({ id: p.id, stopLoss: String(price) }, {
          onSuccess: () => toast.success("Stop Loss обновлён", p.symbol),
          onError: (e) => toast.error("Не удалось обновить SL", e instanceof ApiError ? e.message : undefined),
        });
      },
      onClose: () => {
        const p = positionRef.current;
        if (!p) return;
        closePosition.mutate(p.id, {
          onSuccess: (res) => {
            const pnl = Number(res.trade.pnl);
            if (pnl >= 0) toast.success(`Позиция закрыта: +${fmtUsd(res.trade.pnl)}`, p.symbol);
            else toast.error(`Позиция закрыта: ${fmtUsd(res.trade.pnl)}`, p.symbol);
          },
          onError: (e) => toast.error("Не удалось закрыть позицию", e instanceof ApiError ? e.message : undefined),
        });
      },
    });
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => engineRef.current?.setKind(chartType), [chartType]);
  useEffect(() => engineRef.current?.setPriceDecimals(inst?.priceDecimals ?? 2), [inst?.priceDecimals]);
  // Mobile's Draw menu lives outside this component (see ChartToolbar.tsx)
  // and has no access to engineRef, so "clear all" is a request through the
  // shared store instead of a direct call — see store/terminal.ts.
  const clearDrawingsRequest = useTerminalStore((s) => s.clearDrawingsRequest);
  useEffect(() => {
    if (clearDrawingsRequest > 0) engineRef.current?.clearDrawings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clearDrawingsRequest]);
  useEffect(() => engineRef.current?.setTheme(chartThemeFor(theme)), [theme]);
  useEffect(() => engineRef.current?.setTool(tool), [tool]);

  // ---- open position for this symbol, drawn directly on the chart ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!position) { engine.setPosition(null); return; }
    engine.setPosition({
      side: position.side,
      entry: n(position.entryPrice),
      tp: position.takeProfit ? n(position.takeProfit) : null,
      sl: position.stopLoss ? n(position.stopLoss) : null,
      label: `${position.side === "BUY" ? "Long" : "Short"} ${fmtQty(position.qty)} · ${fmtSigned(position.unrealisedPnl)} (${position.roePct.toFixed(1)}%)`,
    });
  }, [position]);

  // drawings are per-symbol and persisted locally — real, user-made annotations
  useEffect(() => {
    engineRef.current?.setDrawings(loadDrawings(symbol));
    setTool("cursor");
  }, [symbol]);

  // ---- load bars: keep the user's pan/zoom across background refetches;
  // only reset the view when the symbol/timeframe actually changes. A grown
  // array whose first bar got *older* than before means a loadMore() page
  // landed — prepend it in place instead of resetting like a fresh load. ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !data?.bars?.length) return;
    const newBars = data.bars;
    const key = `${symbol}:${timeframe}`;

    if (fittedKeyRef.current !== key) {
      barsRef.current = newBars;
      firstBarTimeRef.current = newBars[0].time;
      engine.setData(newBars, false);
      fittedKeyRef.current = key;
      return;
    }

    const prevFirst = firstBarTimeRef.current;
    if (prevFirst !== null && newBars.length > barsRef.current.length && newBars[0].time < prevFirst) {
      const olderCount = newBars.length - barsRef.current.length;
      engine.prependBars(newBars.slice(0, olderCount));
    } else {
      engine.setData(newBars, true);
    }
    barsRef.current = newBars;
    firstBarTimeRef.current = newBars[0].time;
  }, [data, symbol, timeframe]);

  useEffect(() => {
    fittedKeyRef.current = "";
    firstBarTimeRef.current = null;
  }, [symbol, timeframe]);

  // ---- infinite history: panning to the start requests the next older page ----
  useEffect(() => {
    if (atHistoryStart && hasMore && !isLoadingMore) loadMore();
  }, [atHistoryStart, hasMore, isLoadingMore]);

  // ---- overlays ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const bars = barsRef.current;
    const closesArr = bars.map((b) => b.close);
    const overlays: OverlayLine[] = [];
    // SMA20/SMA50 keep their pre-existing hex here (out of scope for this
    // pass — see the audit note); EMA9/EMA21 source from the same per-theme
    // ChartTheme the legend's text-indicator-ema9/-ema21 classes resolve to,
    // so the drawn line always matches its label's color, in both themes.
    const chartTheme = chartThemeFor(theme);
    if (showSma20) overlays.push({ key: "sma20", color: "#3d7cff", values: sma(closesArr, 20) });
    if (showSma50) overlays.push({ key: "sma50", color: "#e0a53c", values: sma(closesArr, 50) });
    if (showEma9) overlays.push({ key: "ema9", color: chartTheme.ema9, values: ema(closesArr, 9) });
    if (showEma21) overlays.push({ key: "ema21", color: chartTheme.ema21, values: ema(closesArr, 21) });
    engine.setOverlays(overlays);
  }, [showSma20, showSma50, showEma9, showEma21, data, theme]);

  // ---- oscillator ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (oscillator === "NONE") {
      engine.setOscillator(null);
      return;
    }
    const closesArr = barsRef.current.map((b) => b.close);
    if (oscillator === "RSI") engine.setOscillator({ type: "RSI", rsi: rsiCalc(closesArr, 14) });
    else engine.setOscillator({ type: "MACD", macd: macdCalc(closesArr) });
  }, [oscillator, data]);

  // ---- live ticker updates the last bar without disturbing the view ----
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !tick || barsRef.current.length === 0) return;
    const price = n(tick.price);
    if (!price) return;
    const last = barsRef.current[barsRef.current.length - 1];
    engine.updateLast({ high: Math.max(last.high, price), low: Math.min(last.low, price), close: price });
  }, [tick]);

  function toggleFullscreen() {
    // `fullscreen` state is never set optimistically here — only the
    // fullscreenchange listener below sets it, from the browser's actual
    // state. The old code set it immediately on click regardless of whether
    // requestFullscreen() actually succeeded; if the browser silently
    // rejected the request (blocked by an embedding iframe, permissions
    // policy, etc. — a real, observed failure mode), the button's icon and
    // the "exit fullscreen" affordance would claim fullscreen was active
    // when nothing had actually happened, making the whole feature look
    // broken with no way to tell why.
    if (!document.fullscreenElement) {
      const el = containerRef.current?.parentElement?.parentElement;
      if (!el?.requestFullscreen) return toast.error("Полноэкранный режим не поддерживается этим браузером");
      el.requestFullscreen().catch((e: unknown) => {
        toast.error("Не удалось открыть полноэкранный режим", e instanceof Error ? e.message : undefined);
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const notReal = data && !data.real;
  const legendData = legend ?? barsRef.current.at(-1) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-0">
      {/* Desktop only — mobile's equivalent (symbol, price, Chart/Book toggle,
          ChartToolbar) lives one level up in MobileTerminal's own merged
          header row, so this row doesn't render at all in compact mode
          rather than leaving an empty bordered strip behind. One row,
          not the three-deep wrapped mess this used to be at normal window
          widths: Bid/Ask dropped (the order book right next to this already
          owns that), zoom +/- dropped (mouse wheel already zooms; Fit
          remains), and chart-type/timeframe/indicators/draw-tools are one
          shared ChartToolbar instead of four separate always-open rows. */}
      {!compact && (
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-2.5 py-1.5">
          {onToggleWatch && (
            <Tooltip label={watchCollapsed ? "Показать список пар" : "Скрыть список пар (больше места графику)"}>
              <button
                onClick={onToggleWatch}
                aria-label={watchCollapsed ? "Показать список пар" : "Скрыть список пар"}
                className="btn-fx rounded border border-line px-1.5 py-1 text-txt-2 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <IconChevron direction={watchCollapsed ? "right" : "left"} size={15} />
              </button>
            </Tooltip>
          )}

          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-txt-0">{symbol}</span>
            {inst && <span className="rounded border border-line px-1 py-px text-2xs text-txt-3">{inst.category}</span>}
            {inst?.source === "SYNTHETIC" && (
              <Tooltip label="Модельная цена: для этого инструмента нет бесплатного рыночного фида">
                <span className="rounded border border-warn/40 bg-warn/10 px-1 py-px text-2xs text-warn">model</span>
              </Tooltip>
            )}
            {inst?.source === "DERIVED" && (
              <Tooltip label="Цена базового актива (спот): фьючерсный фид недоступен из региона сервера, поэтому маркировка перпетуала следует за спотом. Данные биржевые, но это не котировка фьючерса.">
                <span className="rounded border border-accent/40 bg-accent-soft px-1 py-px text-2xs text-accent">spot-based</span>
              </Tooltip>
            )}
          </div>

          {inst && (
            <div className="flex items-center gap-3 tabular text-2xs">
              <Tooltip label="Mark price — используется для расчёта uPnL и ликвидации">
                <span className={classNames("cursor-help text-sm font-semibold", inst.dir === "up" ? "text-buy" : inst.dir === "down" ? "text-sell" : "text-txt-0")}>
                  {fmtPrice(inst.livePrice, inst.priceDecimals)}
                </span>
              </Tooltip>
              <span className={inst.liveChange24h >= 0 ? "text-buy" : "text-sell"}>{fmtPct(inst.liveChange24h)}</span>
              <span className="text-txt-2">H <span className="text-txt-1">{fmtPrice(inst.liveHigh24h, inst.priceDecimals)}</span></span>
              <span className="text-txt-2">L <span className="text-txt-1">{fmtPrice(inst.liveLow24h, inst.priceDecimals)}</span></span>
              <span className="text-txt-2">Vol <span className="text-txt-1">{fmtCompact(inst.volume24h)}</span></span>
            </div>
          )}

          {signal && (
            <Tooltip label={`${signal.votes.map((v) => `${v.label}: ${v.direction > 0 ? "bullish" : v.direction < 0 ? "bearish" : "neutral"}`).join(" · ")} — техническая сводка, не инвестсовет`}>
              <span className={classNames("cursor-help rounded border border-line px-1.5 py-0.5 text-2xs font-medium", RATING_COLOR[signal.rating])}>
                {ratingLabel(signal.rating)}
              </span>
            </Tooltip>
          )}

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <ChartToolbar variant="flat" />

            {/* Fit and fullscreen share one bordered box instead of two —
                same controls, one less border+gap pair competing for room
                in an already-tight row at 1280px. */}
            <div className="flex items-center gap-0.5 rounded border border-line p-0.5">
              <Tooltip label="Сбросить масштаб к последним свечам">
                <button onClick={() => engineRef.current?.fitContent()} aria-label="Сбросить масштаб к последним свечам" className="btn-fx rounded px-1 py-1 text-txt-2 hover:text-txt-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                  <IconFit size={14} />
                </button>
              </Tooltip>
              <div className="h-4 w-px shrink-0 bg-line" aria-hidden />
              <Tooltip label={fullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}>
                <button
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}
                  className="btn-fx rounded px-1 py-1 text-txt-2 hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {fullscreen ? <IconCollapse size={14} /> : <IconExpand size={14} />}
                </button>
              </Tooltip>
            </div>
          </div>
        </div>
      )}

      {/* data-swipe-nav-ignore: see useSwipeNav.ts — a horizontal drag to pan
          the chart is not an overflow-x scroll, so without this the page-swipe
          tab-switcher would fire underneath it on mobile. */}
      <div className="relative min-h-0 flex-1" data-swipe-nav-ignore="">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Faint enough (3.5% opacity, see .chart-watermark) that it never
            competes with a candle or the legend sitting on top of it —
            purely a "this came from Velora" mark for a screenshotted chart. */}
        <div className="chart-watermark" aria-hidden>VELORA</div>

        {/* Always-visible exit affordance while fullscreen — on top of the
            toolbar's own toggle button, since a stray click elsewhere or an
            unfamiliar layout in true fullscreen shouldn't leave anyone
            stuck; Escape also exits natively via the browser. */}
        {fullscreen && (
          <button
            onClick={toggleFullscreen}
            className="btn-fx absolute right-2 top-2 z-20 flex items-center gap-1 rounded border border-line bg-bg-1/90 px-2 py-1 text-2xs font-medium text-txt-1 shadow-lg hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconCollapse size={13} /> Выйти из полноэкранного режима
          </button>
        )}

        {/* Mobile shows this same OHLC in the symbol-row card instead (see
            MobileTerminal's HeaderOhlc) — packed in next to the mode switch
            rather than floating over the candles it would otherwise cover on
            a screen this narrow. */}
        {!compact && legendData && inst && (
          <div className="pointer-events-none absolute left-2 top-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded bg-bg-0/70 px-2 py-1 tabular text-2xs text-txt-1">
            <span className="text-txt-2">
              {new Date(legendData.time * 1000).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </span>
            <span>O <span className="text-txt-0">{fmtPrice(legendData.open, inst.priceDecimals)}</span></span>
            <span>H <span className="text-buy">{fmtPrice(legendData.high, inst.priceDecimals)}</span></span>
            <span>L <span className="text-sell">{fmtPrice(legendData.low, inst.priceDecimals)}</span></span>
            <span>C <span className="text-txt-0">{fmtPrice(legendData.close, inst.priceDecimals)}</span></span>
            {legendData.volume !== undefined && (
              <span>Vol <span className="text-txt-0">{fmtCompact(legendData.volume)}</span></span>
            )}
          </div>
        )}

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-0/60">
            <LoadingRow label="Загрузка свечей…" />
          </div>
        )}
        {isError && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-0/60">
            <ErrorRow label="Не удалось загрузить график" onRetry={() => refetch()} />
          </div>
        )}
        {notReal && !isLoading && (
          <div className="absolute left-2 bottom-2 rounded border border-warn/40 bg-bg-1/90 px-2 py-1 text-2xs text-warn">
            Смоделированные свечи — нет доступного live-фида для {symbol}
          </div>
        )}
        {isLoadingMore && (
          <div className="absolute right-2 bottom-2 rounded-full border border-line bg-bg-1/90 p-1.5">
            <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-txt-3/40 border-t-accent" />
          </div>
        )}
        {compact && (
          // The absolute positioning has to live on this wrapper, not on the
          // button itself: Tooltip's own root <span> is `position: relative`,
          // and an absolutely-positioned child inside it anchors to THAT
          // small, content-sized span instead of this chart pane — which is
          // exactly what sent the button off the left edge before.
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
            <Tooltip label="Вернуться к последним свечам">
              <button
                onClick={() => engineRef.current?.fitContent()}
                className="btn-fx flex items-center gap-1 rounded-full border border-line bg-bg-1/90 px-2.5 py-1.5 text-2xs text-txt-1 shadow-panel focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                <IconRefresh size={13} /> К текущей цене
              </button>
            </Tooltip>
          </div>
        )}
        {isFetching && !isLoading && <div className="absolute right-2 top-2 text-2xs text-txt-3">обновление…</div>}
        {tool !== "cursor" && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded border border-accent/40 bg-bg-0/80 px-2.5 py-1 text-2xs text-accent">
            {tool === "trendline" ? "Клик — первая точка, ещё клик — вторая. ПКМ по линии — удалить." : "Клик — поставить линию на этой цене. ПКМ по линии — удалить."}
          </div>
        )}
      </div>
    </div>
  );
}
