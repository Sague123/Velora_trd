import { useEffect, useMemo, useRef, useState } from "react";
import { ChartEngine, type Bar, type Drawing, type DrawTool, type OverlayLine } from "../../lib/chartEngine";
import { chartThemeFor } from "../../lib/chartTheme";
import { useChartBars } from "../../hooks/useMarket";
import { useLiveInstrument } from "../../hooks/useLivePrices";
import { useTerminalStore } from "../../store/terminal";
import { usePriceStore } from "../../store/prices";
import { useThemeStore } from "../../store/theme";
import { useAuthStore } from "../../store/auth";
import { usePositions, useUpdatePosition, useClosePosition } from "../../hooks/useTrading";
import { useLiveDepth, bestBidAsk } from "../../hooks/useLiveDepth";
import { useBinanceSymbolFeed } from "../../hooks/useBinanceSymbolFeed";
import { classNames, fmtCompact, fmtPct, fmtPrice, fmtQty, fmtSigned, fmtUsd, n } from "../../lib/format";
import { ema, macd as macdCalc, rsi as rsiCalc, sma } from "../../lib/indicators";
import { computeSignal, ratingLabel, type SignalResult } from "../../lib/signal";
import { Tooltip } from "../common/Tooltip";
import { LoadingRow, ErrorRow } from "../common/States";
import { IconRefresh } from "../icons/Icon";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import type { Position, Timeframe } from "../../lib/types";

const TIMEFRAMES: Timeframe[] = ["1m", "5m", "15m", "1H", "4H", "1D", "1W"];
type ChartType = "candles" | "line" | "area";
type Oscillator = "NONE" | "RSI" | "MACD";

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
  const { book: depthBook } = useLiveDepth(symbol, inst?.category);
  const bidAsk = useMemo(() => bestBidAsk(depthBook), [depthBook]);
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

  const [chartType, setChartType] = useState<ChartType>("candles");
  const [showSma20, setShowSma20] = useState(true);
  const [showSma50, setShowSma50] = useState(false);
  const [showEma9, setShowEma9] = useState(false);
  const [showEma21, setShowEma21] = useState(false);
  const [oscillator, setOscillator] = useState<Oscillator>("NONE");
  const [fullscreen, setFullscreen] = useState(false);
  const [atHistoryStart, setAtHistoryStart] = useState(false);
  const [legend, setLegend] = useState<Bar | null>(null);
  const [tool, setTool] = useState<DrawTool>("cursor");

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
    if (showSma20) overlays.push({ key: "sma20", color: "#3d7cff", values: sma(closesArr, 20) });
    if (showSma50) overlays.push({ key: "sma50", color: "#e0a53c", values: sma(closesArr, 50) });
    if (showEma9) overlays.push({ key: "ema9", color: "#c084fc", values: ema(closesArr, 9) });
    if (showEma21) overlays.push({ key: "ema21", color: "#22d3ee", values: ema(closesArr, 21) });
    engine.setOverlays(overlays);
  }, [showSma20, showSma50, showEma9, showEma21, data]);

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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line px-2.5 py-1.5">
        {onToggleWatch && (
          <Tooltip label={watchCollapsed ? "Показать список пар" : "Скрыть список пар (больше места графику)"}>
            <button onClick={onToggleWatch} className="btn-fx rounded border border-line px-1.5 py-1 text-txt-2 hover:border-accent hover:text-accent">
              {watchCollapsed ? "▶" : "◀"}
            </button>
          </Tooltip>
        )}

        {!compact && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-txt-0">{symbol}</span>
            {inst && <span className="rounded border border-line px-1 py-px text-2xs text-txt-3">{inst.category}</span>}
            {inst?.source === "SYNTHETIC" && (
              <Tooltip label="Модельная цена: для этого инструмента нет бесплатного рыночного фида">
                <span className="rounded border border-warn/40 bg-warn/10 px-1 py-px text-2xs text-warn">model</span>
              </Tooltip>
            )}
          </div>
        )}

        {!compact && inst && (
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
            {bidAsk && (
              <>
                <span className="text-txt-2">Bid <span className="text-buy">{fmtPrice(bidAsk.bid, inst.priceDecimals)}</span></span>
                <span className="text-txt-2">Ask <span className="text-sell">{fmtPrice(bidAsk.ask, inst.priceDecimals)}</span></span>
              </>
            )}
          </div>
        )}

        {!compact && signal && (
          <Tooltip label={`${signal.votes.map((v) => `${v.label}: ${v.direction > 0 ? "bullish" : v.direction < 0 ? "bearish" : "neutral"}`).join(" · ")} — техническая сводка, не инвестсовет`}>
            <span className={classNames("cursor-help rounded border border-line px-1.5 py-0.5 text-2xs font-medium", RATING_COLOR[signal.rating])}>
              {ratingLabel(signal.rating)}
            </span>
          </Tooltip>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {!compact && (
            <div className="flex gap-0.5 rounded border border-line p-0.5">
              {(["candles", "line", "area"] as ChartType[]).map((t) => (
                <button key={t} onClick={() => setChartType(t)} title={t}
                  className={classNames("btn-fx rounded px-1.5 py-0.5 text-2xs font-medium", chartType === t ? "bg-accent text-white" : "text-txt-2 hover:text-txt-0")}>
                  {t === "candles" ? "▤" : t === "line" ? "╱" : "◢"}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-0.5 rounded border border-line p-0.5">
            {(compact ? TIMEFRAMES.filter((tf) => tf !== "1m") : TIMEFRAMES).map((tf) => (
              <button key={tf} onClick={() => setTimeframe(tf)}
                className={classNames("btn-fx rounded px-1.5 py-0.5 text-2xs font-medium", timeframe === tf ? "bg-accent text-white" : "text-txt-2 hover:text-txt-0")}>
                {tf}
              </button>
            ))}
          </div>

          {!compact && (
            <div className="flex items-center gap-1.5 text-2xs">
              <label className="flex items-center gap-1 text-txt-2"><input type="checkbox" checked={showSma20} onChange={(e) => setShowSma20(e.target.checked)} className="accent-accent" /><span style={{ color: "#3d7cff" }}>SMA20</span></label>
              <label className="flex items-center gap-1 text-txt-2"><input type="checkbox" checked={showSma50} onChange={(e) => setShowSma50(e.target.checked)} className="accent-warn" /><span style={{ color: "#e0a53c" }}>SMA50</span></label>
              <label className="flex items-center gap-1 text-txt-2"><input type="checkbox" checked={showEma9} onChange={(e) => setShowEma9(e.target.checked)} className="accent-accent" /><span style={{ color: "#c084fc" }}>EMA9</span></label>
              <label className="flex items-center gap-1 text-txt-2"><input type="checkbox" checked={showEma21} onChange={(e) => setShowEma21(e.target.checked)} className="accent-accent" /><span style={{ color: "#22d3ee" }}>EMA21</span></label>
              <select value={oscillator} onChange={(e) => setOscillator(e.target.value as Oscillator)}
                className="rounded border border-line bg-bg-2 px-1 py-0.5 text-2xs text-txt-1 outline-none focus:border-accent">
                <option value="NONE">Oscillator: none</option>
                <option value="RSI">RSI (14)</option>
                <option value="MACD">MACD (12,26,9)</option>
              </select>
            </div>
          )}

          {!compact && (
            <div className="flex gap-0.5 rounded border border-line p-0.5">
              <Tooltip label="Cursor — перетаскивание и зум колесом; потяните за шкалу цен справа, чтобы растянуть её по вертикали">
                <button onClick={() => setTool("cursor")} className={classNames("btn-fx rounded px-1.5 py-0.5 text-2xs", tool === "cursor" ? "bg-accent text-white" : "text-txt-2 hover:text-txt-0")}>
                  ✛
                </button>
              </Tooltip>
              <Tooltip label="Trend line — клик, потом второй клик для завершения; ПКМ по линии удаляет">
                <button onClick={() => setTool("trendline")} className={classNames("btn-fx rounded px-1.5 py-0.5 text-2xs", tool === "trendline" ? "bg-accent text-white" : "text-txt-2 hover:text-txt-0")}>
                  ╱
                </button>
              </Tooltip>
              <Tooltip label="Horizontal line — клик по цене; ПКМ по линии удаляет">
                <button onClick={() => setTool("hline")} className={classNames("btn-fx rounded px-1.5 py-0.5 text-2xs", tool === "hline" ? "bg-accent text-white" : "text-txt-2 hover:text-txt-0")}>
                  —
                </button>
              </Tooltip>
              <Tooltip label="Удалить все линии на этом графике">
                <button onClick={() => engineRef.current?.clearDrawings()} className="btn-fx rounded px-1.5 py-0.5 text-2xs text-txt-2 hover:text-sell">
                  ✕
                </button>
              </Tooltip>
            </div>
          )}

          {!compact && (
            <div className="flex gap-0.5 rounded border border-line p-0.5">
              <Tooltip label="Уменьшить масштаб">
                <button onClick={() => engineRef.current?.zoomBy(1.4)} className="btn-fx rounded px-1.5 py-0.5 text-xs text-txt-2 hover:text-txt-0">−</button>
              </Tooltip>
              <Tooltip label="Сбросить масштаб">
                <button onClick={() => engineRef.current?.fitContent()} className="btn-fx rounded px-1.5 py-0.5 text-2xs text-txt-2 hover:text-txt-0">⤢fit</button>
              </Tooltip>
              <Tooltip label="Увеличить масштаб">
                <button onClick={() => engineRef.current?.zoomBy(1 / 1.4)} className="btn-fx rounded px-1.5 py-0.5 text-xs text-txt-2 hover:text-txt-0">+</button>
              </Tooltip>
            </div>
          )}

          {!compact && (
          <Tooltip label={fullscreen ? "Выйти из полноэкранного режима" : "Полноэкранный режим"}>
            <button onClick={toggleFullscreen} className="btn-fx rounded border border-line px-1.5 py-1 text-txt-2 hover:border-accent hover:text-accent">
              {fullscreen ? "⤡" : "⤢"}
            </button>
          </Tooltip>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div ref={containerRef} className="absolute inset-0" />

        {/* Always-visible exit affordance while fullscreen — on top of the
            toolbar's own toggle button, since a stray click elsewhere or an
            unfamiliar layout in true fullscreen shouldn't leave anyone
            stuck; Escape also exits natively via the browser. */}
        {fullscreen && (
          <button
            onClick={toggleFullscreen}
            className="btn-fx absolute right-2 top-2 z-20 flex items-center gap-1 rounded border border-line bg-bg-1/90 px-2 py-1 text-2xs font-medium text-txt-1 shadow-lg hover:border-accent hover:text-accent"
          >
            ⤡ Выйти из полноэкранного режима
          </button>
        )}

        {legendData && inst && (
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
          <Tooltip label="Вернуться к последним свечам">
            <button
              onClick={() => engineRef.current?.fitContent()}
              className="btn-fx absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-line bg-bg-1/90 px-2.5 py-1.5 text-2xs text-txt-1 shadow-panel"
            >
              <IconRefresh size={13} /> К текущей цене
            </button>
          </Tooltip>
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
