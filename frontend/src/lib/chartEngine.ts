/**
 * Dependency-free canvas candlestick chart engine. Built to replace
 * lightweight-charts (its license requires a permanent TradingView
 * attribution mark we were asked to drop) while keeping full control over
 * rendering — grid-bot planned levels, trendlines, and precise pan/zoom that
 * accounts for the reserved price-axis gutter.
 *
 * Owns its own canvas and re-renders imperatively; no React state involved,
 * so panning/zooming/live ticks never trigger a React re-render.
 */

export interface Bar {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface OverlayLine {
  key: string;
  color: string;
  values: (number | null)[]; // aligned 1:1 with the bars passed to setData
}

export interface OscillatorConfig {
  type: "RSI" | "MACD";
  rsi?: (number | null)[];
  macd?: { macd: (number | null)[]; signal: (number | null)[]; hist: (number | null)[] };
}

export interface GridLevel {
  price: number;
  side: "BUY" | "SELL";
  filled?: boolean;
}

export type ChartKind = "candles" | "line" | "area";
export type DrawTool = "cursor" | "trendline" | "hline";

export interface TrendDrawing { id: string; type: "trend"; t1: number; p1: number; t2: number; p2: number }
export interface HLineDrawing { id: string; type: "hline"; price: number }
export type Drawing = TrendDrawing | HLineDrawing;

/** The open position for the chart's current symbol, drawn directly on the
 * price axis — entry as a solid line with a close button, TP/SL as dashed
 * lines you can grab and drag to reprice. */
export interface PositionMarker {
  side: "BUY" | "SELL";
  entry: number;
  tp: number | null;
  sl: number | null;
  label: string; // e.g. "Long 0.05 · +$12.30 (3.4%)"
}
export interface PositionHandlers {
  onTpChange?: (price: number) => void;
  onSlChange?: (price: number) => void;
  onClose?: () => void;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export interface ChartTheme {
  bg: string;
  grid: string;
  text: string;
  buy: string;
  sell: string;
  accent: string;
  crosshair: string;
  // SMA20/SMA50 overlay lines reuse accent/warn above; EMA9/EMA21 have no
  // other semantic match, so they get two dedicated indicator colors — see
  // globals.css's --c-indicator-ema9/--c-indicator-ema21, which this
  // mirrors so the drawn line and its legend label are always the same
  // color. Terminal-only, same as everything else in this theme object.
  ema9: string;
  ema21: string;
}

const DEFAULT_THEME: ChartTheme = {
  bg: "#0a0d12",
  grid: "#12161d",
  text: "#6b7480",
  buy: "#17c885",
  sell: "#f5495e",
  accent: "#3d7cff",
  crosshair: "#4a515c",
  ema9: "#c084fc",
  ema21: "#22d3ee",
};

const OSC_BAND_RATIO = 0.26; // fraction of plot height reserved for the oscillator
const PRICE_SCALE_W = 62;
const TIME_SCALE_H = 22;
const HIT_PX = 6;

function niceStep(range: number, targetTicks: number): number {
  if (range <= 0) return 1;
  const rough = range / targetTicks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}

function distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export class ChartEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private dpr = Math.max(1, window.devicePixelRatio || 1);
  private cssW = 0;
  private cssH = 0;

  private bars: Bar[] = [];
  private overlays: OverlayLine[] = [];
  private oscillator: OscillatorConfig | null = null;
  private gridLevels: GridLevel[] = [];
  private drawings: Drawing[] = [];
  private tool: DrawTool = "cursor";
  private pendingPoint: { time: number; price: number } | null = null;
  private kind: ChartKind = "candles";
  private theme: ChartTheme = DEFAULT_THEME;
  private priceDecimals = 2;

  // logical view range over bar indices (fractional for smooth zoom)
  private viewStart = 0;
  private viewEnd = 100;

  // manual vertical stretch applied on top of the auto-fit price range —
  // dragging the price-axis gutter adjusts this independently of pan/zoom
  private priceScaleFactor = 1;
  private priceDragging = false;
  private priceDragLastY = 0;

  // manual vertical pan on top of the auto-fit price range — dragging inside
  // the plot (not the gutter) now moves the chart freely in both directions,
  // the way panning already worked horizontally.
  private priceOffset = 0;

  // cached from the last render(), used for hit-testing / placement outside it
  private lastMinP = 0;
  private lastMaxP = 1;
  private lastPlotW = 0;
  private lastPriceH = 0;

  private crosshair: { x: number; y: number } | null = null;
  private onCrosshairChange: ((bar: Bar | null) => void) | null = null;
  private onRangeChange: ((atStart: boolean) => void) | null = null;
  private onDrawingsChange: ((drawings: Drawing[]) => void) | null = null;

  private dragging = false;
  private dragLastX = 0;
  private dragLastY = 0;
  private rafPending = false;

  private position: PositionMarker | null = null;
  private positionHandlers: PositionHandlers = {};
  private draggingPosLine: "tp" | "sl" | null = null;
  private posDragPreviewPrice: number | null = null;
  private entryCloseHotspot: { x: number; y: number; w: number; h: number } | null = null;

  /* --- touch: every live pointer, so two fingers can pinch-zoom --- */
  private activePointers = new Map<number, { x: number; y: number }>();
  private pinchStartDist = 0;
  private pinchStartSpan = 0;
  private pinchAnchorIdx = 0;
  private get isPinching() { return this.activePointers.size >= 2; }

  constructor(container: HTMLElement) {
    const canvas = document.createElement("canvas");
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.cursor = "crosshair";
    // Without this the browser claims every touch gesture on the canvas for
    // page scrolling/zooming and fires pointercancel at us mid-drag, which is
    // why the chart was completely uncontrollable on a phone: panning just
    // scrolled the page and pinching zoomed the whole document. Taking over
    // touch-action hands us the raw gestures so pan and pinch-zoom below can
    // work — the chart implements both itself.
    canvas.style.touchAction = "none";
    container.appendChild(canvas);
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;

    this.ro = new ResizeObserver(() => this.resize(container));
    this.ro.observe(container);
    this.resize(container);

    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("pointerleave", this.onPointerLeave);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("dblclick", this.onDoubleClick);
    canvas.addEventListener("contextmenu", this.onContextMenu);
  }

  destroy() {
    this.ro.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onPointerDown);
    this.canvas.removeEventListener("pointermove", this.onPointerMove);
    this.canvas.removeEventListener("pointerup", this.onPointerUp);
    this.canvas.removeEventListener("pointercancel", this.onPointerUp);
    this.canvas.removeEventListener("pointerleave", this.onPointerLeave);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    this.canvas.remove();
  }

  setTheme(theme: Partial<ChartTheme>) {
    this.theme = { ...this.theme, ...theme };
    this.scheduleRender();
  }

  setPriceDecimals(d: number) {
    this.priceDecimals = d;
  }

  setKind(kind: ChartKind) {
    this.kind = kind;
    this.scheduleRender();
  }

  setTool(tool: DrawTool) {
    this.tool = tool;
    this.pendingPoint = null;
    this.canvas.style.cursor = tool === "cursor" ? "crosshair" : "copy";
    this.scheduleRender();
  }

  setDrawings(drawings: Drawing[]) {
    this.drawings = drawings;
    this.scheduleRender();
  }

  clearDrawings() {
    this.drawings = [];
    this.onDrawingsChange?.(this.drawings);
    this.scheduleRender();
  }

  setCrosshairListener(fn: (bar: Bar | null) => void) {
    this.onCrosshairChange = fn;
  }

  setRangeListener(fn: (atStart: boolean) => void) {
    this.onRangeChange = fn;
  }

  setDrawingsListener(fn: (drawings: Drawing[]) => void) {
    this.onDrawingsChange = fn;
  }

  /** The open position (if any) for the chart's current symbol. Pass null
   * when there is none — the lines and drag handles simply disappear. */
  setPosition(position: PositionMarker | null) {
    this.position = position;
    if (!position) this.draggingPosLine = null;
    this.scheduleRender();
  }

  setPositionHandlers(handlers: PositionHandlers) {
    this.positionHandlers = handlers;
  }

  /** Replaces all bar data. Pass `keepView` to preserve pan/zoom (background
   * refetches use this so the chart never resets under the user).
   *
   * A periodic refetch of "the latest N bars" is a trailing window — as real
   * time passes, bar 0 in that window keeps meaning a later timestamp. Just
   * keeping viewStart/viewEnd as raw indices silently drifted the visible
   * window forward on every refresh (most visible on 1m/5m, where the whole
   * window rolls over in minutes) instead of leaving it looking untouched.
   * Anchoring on the actual timestamps the user was looking at fixes that. */
  setData(bars: Bar[], keepView = false) {
    if (keepView && this.bars.length > 0 && this.viewEnd > 0) {
      const t0 = this.timeForIndex(this.viewStart);
      const t1 = this.timeForIndex(this.viewEnd);
      this.bars = bars;
      this.viewStart = this.indexForTime(t0);
      this.viewEnd = this.indexForTime(t1);
      this.clampView();
      this.scheduleRender();
      return;
    }
    this.bars = bars;
    if (!keepView || this.viewEnd <= 0) {
      this.fitContent();
    } else {
      this.clampView();
      this.scheduleRender();
    }
  }

  /** Prepends older bars (infinite-history paging) and shifts the view by the
   * same amount so the visible window doesn't jump under the user. */
  prependBars(older: Bar[]) {
    if (older.length === 0) return;
    this.bars = [...older, ...this.bars];
    this.viewStart += older.length;
    this.viewEnd += older.length;
    this.scheduleRender();
  }

  /** Mutates just the last bar (for live WS ticks) without touching the view. */
  updateLast(partial: Partial<Bar>) {
    if (this.bars.length === 0) return;
    const last = this.bars[this.bars.length - 1];
    Object.assign(last, partial);
    this.scheduleRender();
  }

  setOverlays(overlays: OverlayLine[]) {
    this.overlays = overlays;
    this.scheduleRender();
  }

  setOscillator(osc: OscillatorConfig | null) {
    this.oscillator = osc;
    this.scheduleRender();
  }

  setGridLevels(levels: GridLevel[]) {
    this.gridLevels = levels;
    this.scheduleRender();
  }

  fitContent() {
    const n = this.bars.length;
    if (n === 0) {
      this.viewStart = 0;
      this.viewEnd = 100;
    } else {
      this.viewStart = 0;
      this.viewEnd = n;
    }
    this.priceOffset = 0;
    this.scheduleRender();
    // Fitting to content always parks viewStart at 0 — that's just "show
    // everything currently loaded", not a user panning gesture asking for
    // more history. Reporting atStart here used to fire the infinite-history
    // loader on every fresh load/refetch with nobody touching the chart,
    // which snowballed into loading the entire history at once. Real pans
    // and zooms report their own atStart via onPointerMove/onWheel below.
  }

  /** Zoom in/out around the center of the visible range — used by +/- buttons. */
  zoomBy(factor: number) {
    const span = this.viewEnd - this.viewStart;
    const mid = (this.viewStart + this.viewEnd) / 2;
    const newSpan = span * factor;
    this.viewStart = mid - newSpan / 2;
    this.viewEnd = mid + newSpan / 2;
    this.clampView();
    this.scheduleRender();
  }

  private resize(container: HTMLElement) {
    const rect = container.getBoundingClientRect();
    this.cssW = Math.max(1, Math.floor(rect.width));
    this.cssH = Math.max(1, Math.floor(rect.height));
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.cssW * this.dpr);
    this.canvas.height = Math.floor(this.cssH * this.dpr);
    this.scheduleRender();
  }

  private clampView() {
    const n = this.bars.length;
    if (n === 0) return;
    const span = this.viewEnd - this.viewStart;
    const minSpan = 5;
    const maxSpan = Math.max(minSpan, n * 3);
    const clampedSpan = Math.min(maxSpan, Math.max(minSpan, span));
    if (clampedSpan !== span) {
      const mid = (this.viewStart + this.viewEnd) / 2;
      this.viewStart = mid - clampedSpan / 2;
      this.viewEnd = mid + clampedSpan / 2;
    }
    const overscan = Math.max(2, clampedSpan * 0.15);
    if (this.viewStart < -overscan) {
      const d = -overscan - this.viewStart;
      this.viewStart += d;
      this.viewEnd += d;
    }
    if (this.viewEnd > n + overscan) {
      const d = this.viewEnd - (n + overscan);
      this.viewStart -= d;
      this.viewEnd -= d;
    }
  }

  /** plot area excludes the price-axis gutter — every pointer calculation
   * must use this, not the full canvas width, or pan/zoom drift near the
   * right edge (this was the root of "can't zoom/move freely"). */
  private get plotW() {
    return Math.max(1, this.cssW - PRICE_SCALE_W);
  }

  private xToIndex(x: number): number {
    const span = this.viewEnd - this.viewStart;
    return this.viewStart + (x / this.plotW) * span;
  }

  /** Average spacing between bars — used to extrapolate index<->time past
   * either end of the loaded array, e.g. into the empty margin the user
   * panned into past the most recent bar. */
  private get avgBarInterval(): number {
    const bars = this.bars;
    const n = bars.length;
    if (n < 2) return 3600;
    return (bars[n - 1].time - bars[0].time) / (n - 1);
  }

  private indexForTime(time: number): number {
    const bars = this.bars;
    const n = bars.length;
    if (n === 0) return 0;
    if (n === 1) return 0;
    const interval = this.avgBarInterval;
    // Extrapolate rather than clamp past either edge — clamping here used to
    // silently erase any margin the user had panned into past the last (or
    // before the first) loaded bar every time the data re-anchored on a
    // background refresh, snapping the view back a little every ~15s.
    if (time < bars[0].time) return interval > 0 ? (time - bars[0].time) / interval : 0;
    if (time > bars[n - 1].time) return interval > 0 ? (n - 1) + (time - bars[n - 1].time) / interval : n - 1;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].time <= time) lo = mid; else hi = mid;
    }
    const t0 = bars[lo].time, t1 = bars[hi].time;
    const frac = t1 > t0 ? (time - t0) / (t1 - t0) : 0;
    return lo + frac;
  }

  private timeForIndex(idx: number): number {
    const bars = this.bars;
    const n = bars.length;
    if (n === 0) return 0;
    if (n === 1) return bars[0].time;
    const interval = this.avgBarInterval;
    if (idx < 0) return bars[0].time + idx * interval;
    if (idx > n - 1) return bars[n - 1].time + (idx - (n - 1)) * interval;
    const i0 = Math.floor(idx);
    const i1 = Math.min(n - 1, i0 + 1);
    const frac = idx - i0;
    return bars[i0].time + (bars[i1].time - bars[i0].time) * frac;
  }

  private priceForY(y: number): number {
    return this.lastMaxP - (y / this.lastPriceH) * (this.lastMaxP - this.lastMinP);
  }

  private yForPriceCached(p: number): number {
    return ((this.lastMaxP - p) / (this.lastMaxP - this.lastMinP)) * this.lastPriceH;
  }

  private xForIndexCached(i: number): number {
    const span = this.viewEnd - this.viewStart;
    return (i - this.viewStart) * (this.lastPlotW / span);
  }

  private addDrawing(d: Drawing) {
    this.drawings = [...this.drawings, d];
    this.onDrawingsChange?.(this.drawings);
  }

  private removeDrawing(id: string) {
    this.drawings = this.drawings.filter((d) => d.id !== id);
    this.onDrawingsChange?.(this.drawings);
  }

  private hitTestDrawing(x: number, y: number): string | null {
    for (const d of this.drawings) {
      if (d.type === "hline") {
        if (Math.abs(y - this.yForPriceCached(d.price)) < HIT_PX) return d.id;
      } else {
        const x1 = this.xForIndexCached(this.indexForTime(d.t1)), y1 = this.yForPriceCached(d.p1);
        const x2 = this.xForIndexCached(this.indexForTime(d.t2)), y2 = this.yForPriceCached(d.p2);
        if (distToSegment(x, y, x1, y1, x2, y2) < HIT_PX) return d.id;
      }
    }
    return null;
  }

  /** Pixel distance between the two active touch points. */
  private pointerSpread(): number {
    const [a, b] = [...this.activePointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  /** Begins (or re-bases) a pinch gesture from the current finger positions. */
  private beginPinch() {
    const pts = [...this.activePointers.values()];
    if (pts.length < 2) return;
    const rect = this.canvas.getBoundingClientRect();
    // Anchor on the bar under the midpoint so the chart zooms around what the
    // user has their fingers on, exactly like the wheel handler does.
    const midX = (pts[0].x + pts[1].x) / 2 - rect.left;
    this.pinchStartDist = this.pointerSpread();
    this.pinchStartSpan = this.viewEnd - this.viewStart;
    this.pinchAnchorIdx = this.xToIndex(midX);
    // A pinch is not a pan — drop any single-finger drag that was in progress
    // so the second finger landing doesn't yank the view sideways.
    this.dragging = false;
    this.priceDragging = false;
    this.draggingPosLine = null;
    this.posDragPreviewPrice = null;
  }

  private onPointerDown = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;

    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.isPinching) {
      this.beginPinch();
      return;
    }

    // dragging the price-axis gutter stretches/compresses the Y scale,
    // independent of the horizontal pan/zoom — a standard terminal control
    // this chart was missing entirely.
    if (x > this.lastPlotW) {
      this.priceDragging = true;
      this.priceDragLastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
      return;
    }

    if (this.tool === "cursor" && this.position && x <= this.lastPlotW) {
      const hs = this.entryCloseHotspot;
      if (hs && x >= hs.x && x <= hs.x + hs.w && y >= hs.y - hs.h / 2 && y <= hs.y + hs.h / 2) {
        this.positionHandlers.onClose?.();
        return;
      }
      if (this.position.tp !== null && Math.abs(y - this.yForPriceCached(this.position.tp)) < HIT_PX) {
        this.draggingPosLine = "tp";
        this.posDragPreviewPrice = this.position.tp;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
      if (this.position.sl !== null && Math.abs(y - this.yForPriceCached(this.position.sl)) < HIT_PX) {
        this.draggingPosLine = "sl";
        this.posDragPreviewPrice = this.position.sl;
        this.canvas.setPointerCapture(e.pointerId);
        return;
      }
    }

    if (this.tool === "hline" && x <= this.lastPlotW) {
      this.addDrawing({ id: crypto.randomUUID(), type: "hline", price: this.priceForY(y) });
      this.scheduleRender();
      return;
    }
    if (this.tool === "trendline" && x <= this.lastPlotW) {
      const idx = this.xToIndex(x);
      const point = { time: this.timeForIndex(idx), price: this.priceForY(y) };
      if (!this.pendingPoint) {
        this.pendingPoint = point;
      } else {
        this.addDrawing({ id: crypto.randomUUID(), type: "trend", t1: this.pendingPoint.time, p1: this.pendingPoint.price, t2: point.time, p2: point.price });
        this.pendingPoint = null;
      }
      this.scheduleRender();
      return;
    }

    this.dragging = true;
    this.dragLastX = e.clientX;
    this.dragLastY = e.clientY;
    this.canvas.setPointerCapture(e.pointerId);
  };

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (this.activePointers.has(e.pointerId)) {
      this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two fingers = pinch-zoom the time axis, anchored on the midpoint.
    if (this.isPinching) {
      if (this.pinchStartDist > 0) {
        const ratio = this.pointerSpread() / this.pinchStartDist;
        // fingers apart (ratio > 1) => fewer bars on screen => zoom in
        const newSpan = Math.max(8, this.pinchStartSpan / Math.max(0.05, ratio));
        const frac = this.pinchStartSpan > 0
          ? (this.pinchAnchorIdx - this.viewStart) / (this.viewEnd - this.viewStart)
          : 0.5;
        this.viewStart = this.pinchAnchorIdx - frac * newSpan;
        this.viewEnd = this.viewStart + newSpan;
        this.clampView();
        this.scheduleRender();
        this.onRangeChange?.(this.viewStart <= 1);
      }
      return;
    }

    if (this.priceDragging) {
      const dy = e.clientY - this.priceDragLastY;
      this.priceDragLastY = e.clientY;
      // drag down = stretch the range taller (zoom out vertically), drag up = compress
      this.priceScaleFactor = Math.max(0.15, Math.min(6, this.priceScaleFactor * (1 + dy / 180)));
      this.scheduleRender();
      return;
    }

    if (this.draggingPosLine) {
      this.posDragPreviewPrice = this.priceForY(y);
      this.canvas.style.cursor = "ns-resize";
      this.scheduleRender();
      return;
    }

    if (this.dragging) {
      const dx = e.clientX - this.dragLastX;
      this.dragLastX = e.clientX;
      const span = this.viewEnd - this.viewStart;
      const barWidth = this.plotW / span;
      const deltaBars = dx / barWidth;
      this.viewStart -= deltaBars;
      this.viewEnd -= deltaBars;
      this.clampView();
      this.onRangeChange?.(this.viewStart <= 1);

      // free vertical pan, same gesture — drag the chart body up/down, not
      // just left/right. Uses the previous frame's price mapping since the
      // new one isn't computed until the next render.
      const dy = e.clientY - this.dragLastY;
      this.dragLastY = e.clientY;
      if (this.lastPriceH > 0) {
        const range = this.lastMaxP - this.lastMinP;
        this.priceOffset += (dy / this.lastPriceH) * range;
        // generous, but finite — otherwise a fast/long drag could pan the
        // price window so far from the actual data that the chart looked
        // "lost" (an empty canvas with no candles anywhere in view).
        const limit = range * 4;
        this.priceOffset = Math.max(-limit, Math.min(limit, this.priceOffset));
      }
    }
    const nearPosLine = this.tool === "cursor" && !!this.position && x <= this.lastPlotW && (
      (this.position.tp !== null && Math.abs(y - this.yForPriceCached(this.position.tp)) < HIT_PX) ||
      (this.position.sl !== null && Math.abs(y - this.yForPriceCached(this.position.sl)) < HIT_PX)
    );
    this.canvas.style.cursor = x > this.lastPlotW ? "ns-resize" : nearPosLine ? "ns-resize" : this.tool === "cursor" ? "crosshair" : "copy";
    this.crosshair = { x, y };
    this.scheduleRender();
    this.emitCrosshairBar(x);
  };

  private onPointerUp = (e?: PointerEvent) => {
    if (e) this.activePointers.delete(e.pointerId);
    // Lifting one finger out of a pinch: re-base the gesture on whatever is
    // still down rather than snapping, so the chart doesn't jump.
    if (this.activePointers.size >= 2) { this.beginPinch(); return; }
    if (this.activePointers.size === 1) {
      const [p] = [...this.activePointers.values()];
      this.dragLastX = p.x;
      this.dragLastY = p.y;
      this.pinchStartDist = 0;
      return;
    }
    this.pinchStartDist = 0;
    this.dragging = false;
    this.priceDragging = false;
    if (this.draggingPosLine) {
      const which = this.draggingPosLine;
      const price = this.posDragPreviewPrice;
      this.draggingPosLine = null;
      this.posDragPreviewPrice = null;
      if (price !== null && price > 0) {
        if (which === "tp") this.positionHandlers.onTpChange?.(price);
        else this.positionHandlers.onSlChange?.(price);
      }
      this.scheduleRender();
    }
  };

  private onPointerLeave = () => {
    this.dragging = false;
    this.priceDragging = false;
    this.crosshair = null;
    this.onCrosshairChange?.(null);
    this.scheduleRender();
  };

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const span = this.viewEnd - this.viewStart;
    const factor = e.deltaY > 0 ? 1.12 : 1 / 1.12;
    const idxAtCursor = this.xToIndex(x);
    const newSpan = span * factor;
    this.viewStart = idxAtCursor - (idxAtCursor - this.viewStart) * (newSpan / span);
    this.viewEnd = this.viewStart + newSpan;
    this.clampView();
    this.scheduleRender();
    this.onRangeChange?.(this.viewStart <= 1);
  };

  private onDoubleClick = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x > this.lastPlotW) {
      this.priceScaleFactor = 1;
      this.priceOffset = 0;
      this.scheduleRender();
      return;
    }
    if (this.tool === "cursor") this.fitContent();
  };

  private onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const hit = this.hitTestDrawing(x, y);
    if (hit) {
      this.removeDrawing(hit);
      this.scheduleRender();
    } else if (this.pendingPoint) {
      this.pendingPoint = null;
      this.scheduleRender();
    }
  };

  private emitCrosshairBar(x: number) {
    if (!this.onCrosshairChange) return;
    const idx = Math.round(this.xToIndex(x));
    const bar = this.bars[idx];
    this.onCrosshairChange(bar ?? null);
  }

  private scheduleRender() {
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      this.render();
    });
  }

  private render() {
    const { ctx, cssW, cssH, dpr, theme } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    if (this.bars.length === 0) {
      ctx.fillStyle = theme.text;
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Нет данных", cssW / 2, cssH / 2);
      return;
    }

    const hasOsc = !!this.oscillator;
    const plotW = this.plotW;
    const totalPlotH = cssH - TIME_SCALE_H;
    const oscH = hasOsc ? totalPlotH * OSC_BAND_RATIO : 0;
    const priceH = totalPlotH - oscH;

    const span = this.viewEnd - this.viewStart;
    const barWidth = plotW / span;
    const firstIdx = Math.max(0, Math.floor(this.viewStart));
    const lastIdx = Math.min(this.bars.length - 1, Math.ceil(this.viewEnd));
    const visible = this.bars.slice(firstIdx, lastIdx + 1);

    const xForIndex = (i: number) => (i - this.viewStart) * barWidth;

    // ---- price range across visible bars + overlays + grid levels ----
    let minP = Infinity, maxP = -Infinity;
    for (const b of visible) {
      minP = Math.min(minP, b.low);
      maxP = Math.max(maxP, b.high);
    }
    for (const ov of this.overlays) {
      for (let i = firstIdx; i <= lastIdx; i++) {
        const v = ov.values[i];
        if (v !== null && v !== undefined) {
          minP = Math.min(minP, v);
          maxP = Math.max(maxP, v);
        }
      }
    }
    for (const g of this.gridLevels) {
      minP = Math.min(minP, g.price);
      maxP = Math.max(maxP, g.price);
    }
    if (!Number.isFinite(minP) || !Number.isFinite(maxP) || minP === maxP) {
      minP = (minP === Infinity ? 0 : minP) - 1;
      maxP = (maxP === -Infinity ? 1 : maxP) + 1;
    }
    const pad = (maxP - minP) * 0.08 || 1;
    minP -= pad;
    maxP += pad;

    // manual vertical stretch from dragging the price-axis gutter
    if (this.priceScaleFactor !== 1) {
      const mid = (minP + maxP) / 2;
      const half = ((maxP - minP) / 2) * this.priceScaleFactor;
      minP = mid - half;
      maxP = mid + half;
    }
    // manual vertical pan from dragging the chart body
    if (this.priceOffset !== 0) {
      minP += this.priceOffset;
      maxP += this.priceOffset;
    }
    // prices can't go negative — panning down can't push the visible
    // window below zero, however far the drag went
    if (minP < 0) {
      const shift = -minP;
      minP += shift;
      maxP += shift;
    }

    // cache for hit-testing / placement outside this render pass
    this.lastMinP = minP;
    this.lastMaxP = maxP;
    this.lastPlotW = plotW;
    this.lastPriceH = priceH;

    const yForPrice = (p: number) => ((maxP - p) / (maxP - minP)) * priceH;

    // ---- grid lines + price axis ----
    ctx.strokeStyle = theme.grid;
    ctx.fillStyle = theme.text;
    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.lineWidth = 1;
    const priceStep = niceStep(maxP - minP, 6);
    const firstTick = Math.ceil(minP / priceStep) * priceStep;
    for (let p = firstTick; p <= maxP; p += priceStep) {
      const y = yForPrice(p) + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.textAlign = "left";
      ctx.fillText(p.toFixed(this.priceDecimals), plotW + 6, y + 3);
    }

    // ---- current price marker ----
    // A filled tag in the gutter at the latest close, plus a faint line across
    // the plot. Without it the axis is just evenly-spaced round numbers and
    // there's nothing showing where the market actually *is* relative to them.
    const lastBar = this.bars[this.bars.length - 1];
    if (lastBar) {
      const lp = lastBar.close;
      if (lp >= minP && lp <= maxP) {
        const y = yForPrice(lp);
        // green/red against the bar's own open, matching the candle colouring
        const up = lastBar.close >= lastBar.open;
        const color = up ? theme.buy : theme.sell;

        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(plotW, y + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;

        const label = lp.toFixed(this.priceDecimals);
        const padX = 4;
        const w = ctx.measureText(label).width + padX * 2;
        const h = 14;
        // Clamp so the tag stays fully on-canvas at the very top/bottom.
        const boxY = Math.max(0, Math.min(priceH - h, y - h / 2));
        ctx.fillStyle = color;
        ctx.fillRect(plotW + 2, boxY, w, h);
        ctx.fillStyle = up ? "#06231a" : "#ffffff";
        ctx.textAlign = "left";
        ctx.fillText(label, plotW + 2 + padX, boxY + h - 4);
        ctx.fillStyle = theme.text;
      }
    }

    // ---- time axis: date once per day boundary (or always, for daily+ bars) ----
    const barIntervalSec = this.bars.length > 1 ? this.bars[1].time - this.bars[0].time : 3600;
    const timeStepBars = Math.max(1, Math.round(span / 6));
    ctx.textAlign = "center";
    let lastDateLabel = "";
    for (let i = Math.ceil(firstIdx / timeStepBars) * timeStepBars; i <= lastIdx; i += timeStepBars) {
      const bar = this.bars[i];
      if (!bar) continue;
      const x = xForIndex(i);
      const d = new Date(bar.time * 1000);
      const dateLabel = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
      const timeLabel = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      let label: string;
      if (barIntervalSec >= 86400) {
        label = dateLabel; // daily/weekly bars: the date IS the tick
      } else if (dateLabel !== lastDateLabel) {
        label = dateLabel; // first tick of a new day — show the date instead of time
        lastDateLabel = dateLabel;
      } else {
        label = timeLabel;
      }
      ctx.fillText(label, x, priceH + TIME_SCALE_H - 6);
    }

    // ---- grid-bot level overlay ----
    for (const g of this.gridLevels) {
      const y = yForPrice(g.price) + 0.5;
      ctx.strokeStyle = g.side === "BUY" ? theme.buy : theme.sell;
      ctx.globalAlpha = g.filled ? 0.3 : 0.85;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(plotW, y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = g.side === "BUY" ? theme.buy : theme.sell;
      ctx.textAlign = "left";
      ctx.fillText(g.price.toFixed(this.priceDecimals), plotW + 6, y + 3);
    }

    // ---- clip candles/overlays/drawings/position-lines to the plot's
    // vertical band. Compressing the price scale (dragging the price-axis
    // gutter) can shrink minP/maxP below the actual candle range on purpose
    // — without this, tall wicks or an off-screen TP/SL painted past that
    // range bled up into the toolbar or down into the time-axis strip.
    // Left unbounded horizontally so axis-gutter price labels still draw.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, cssW, priceH);
    ctx.clip();

    // ---- price series ----
    if (this.kind === "candles") {
      const bodyW = Math.max(1, barWidth * 0.62);
      for (let i = firstIdx; i <= lastIdx; i++) {
        const b = this.bars[i];
        if (!b) continue;
        const x = xForIndex(i) + barWidth / 2;
        const up = b.close >= b.open;
        ctx.strokeStyle = up ? theme.buy : theme.sell;
        ctx.fillStyle = up ? theme.buy : theme.sell;
        ctx.beginPath();
        ctx.moveTo(x, yForPrice(b.high));
        ctx.lineTo(x, yForPrice(b.low));
        ctx.stroke();
        const yO = yForPrice(b.open), yC = yForPrice(b.close);
        const top = Math.min(yO, yC), h = Math.max(1, Math.abs(yC - yO));
        ctx.fillRect(x - bodyW / 2, top, bodyW, h);
      }
    } else {
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        const b = this.bars[i];
        if (!b) continue;
        const x = xForIndex(i) + barWidth / 2;
        const y = yForPrice(b.close);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (this.kind === "area" && started) {
        ctx.lineTo(xForIndex(lastIdx) + barWidth / 2, priceH);
        ctx.lineTo(xForIndex(firstIdx) + barWidth / 2, priceH);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, 0, 0, priceH);
        grad.addColorStop(0, "rgba(61,124,255,0.30)");
        grad.addColorStop(1, "rgba(61,124,255,0.02)");
        ctx.fillStyle = grad;
        ctx.fill();
      }
    }

    // ---- overlays (SMA/EMA) ----
    for (const ov of this.overlays) {
      ctx.strokeStyle = ov.color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      for (let i = firstIdx; i <= lastIdx; i++) {
        const v = ov.values[i];
        const x = xForIndex(i) + barWidth / 2;
        if (v === null || v === undefined) { started = false; continue; }
        const y = yForPrice(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // ---- user drawings: trendlines + horizontal lines ----
    ctx.lineWidth = 1.5;
    for (const d of this.drawings) {
      if (d.type === "hline") {
        const y = yForPrice(d.price) + 0.5;
        ctx.strokeStyle = theme.accent;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
        ctx.fillStyle = theme.accent;
        ctx.textAlign = "left";
        ctx.fillText(d.price.toFixed(this.priceDecimals), plotW + 6, y + 3);
      } else {
        const x1 = xForIndex(this.indexForTime(d.t1)), y1 = yForPrice(d.p1);
        const x2 = xForIndex(this.indexForTime(d.t2)), y2 = yForPrice(d.p2);
        ctx.strokeStyle = theme.accent;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.fillStyle = theme.accent;
        ctx.beginPath(); ctx.arc(x1, y1, 3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(x2, y2, 3, 0, Math.PI * 2); ctx.fill();
      }
    }
    // rubber-band preview while placing the second trendline point
    if (this.tool === "trendline" && this.pendingPoint && this.crosshair && this.crosshair.x <= plotW) {
      const x1 = xForIndex(this.indexForTime(this.pendingPoint.time)), y1 = yForPrice(this.pendingPoint.price);
      ctx.strokeStyle = theme.accent;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(this.crosshair.x, this.crosshair.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ---- open position: entry (solid, closable) + TP/SL (dashed, draggable) ----
    this.entryCloseHotspot = null;
    if (this.position) {
      const pos = this.position;
      const entryY = yForPrice(pos.entry) + 0.5;
      ctx.setLineDash([]);
      ctx.strokeStyle = theme.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, entryY);
      ctx.lineTo(plotW, entryY);
      ctx.stroke();

      ctx.font = "10px 'JetBrains Mono', monospace";
      ctx.textAlign = "left";
      const labelText = pos.label;
      const labelW = ctx.measureText(labelText).width + 10;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(4, entryY - 9, labelW, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(labelText, 9, entryY + 3);

      const hs = { x: 4 + labelW + 3, y: entryY, w: 18, h: 18 };
      this.entryCloseHotspot = hs;
      ctx.fillStyle = theme.accent;
      ctx.fillRect(hs.x, hs.y - hs.h / 2, hs.w, hs.h);
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(hs.x + 5, hs.y - 4); ctx.lineTo(hs.x + 13, hs.y + 4);
      ctx.moveTo(hs.x + 13, hs.y - 4); ctx.lineTo(hs.x + 5, hs.y + 4);
      ctx.stroke();

      const drawDraggableLine = (price: number, kind: "tp" | "sl") => {
        const live = this.draggingPosLine === kind && this.posDragPreviewPrice !== null ? this.posDragPreviewPrice : price;
        const y = yForPrice(live) + 0.5;
        const color = kind === "tp" ? theme.buy : theme.sell;
        ctx.strokeStyle = color;
        ctx.lineWidth = this.draggingPosLine === kind ? 2 : 1.5;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(plotW, y);
        ctx.stroke();
        ctx.setLineDash([]);
        // a small drag handle at the right edge of the plot area
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(plotW - 12, y - 5);
        ctx.lineTo(plotW, y);
        ctx.lineTo(plotW - 12, y + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = color;
        ctx.textAlign = "left";
        ctx.fillText(`${kind === "tp" ? "TP" : "SL"} ${live.toFixed(this.priceDecimals)}`, plotW + 6, y + 3);
      };
      if (pos.tp !== null) drawDraggableLine(pos.tp, "tp");
      if (pos.sl !== null) drawDraggableLine(pos.sl, "sl");
    }
    ctx.restore();

    // ---- oscillator band ----
    if (this.oscillator) {
      const oscTop = priceH + 1;
      ctx.strokeStyle = theme.grid;
      ctx.beginPath();
      ctx.moveTo(0, oscTop);
      ctx.lineTo(plotW, oscTop);
      ctx.stroke();

      if (this.oscillator.type === "RSI" && this.oscillator.rsi) {
        const rsi = this.oscillator.rsi;
        const yForRsi = (v: number) => oscTop + oscH - (v / 100) * oscH;
        ctx.strokeStyle = theme.grid;
        ctx.setLineDash([2, 2]);
        for (const level of [30, 70]) {
          const y = yForRsi(level) + 0.5;
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(plotW, y); ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.strokeStyle = "#e0a53c";
        ctx.lineWidth = 1;
        ctx.beginPath();
        let started = false;
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = rsi[i];
          const x = xForIndex(i) + barWidth / 2;
          if (v === null || v === undefined) { started = false; continue; }
          const y = yForRsi(v);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      } else if (this.oscillator.type === "MACD" && this.oscillator.macd) {
        const { macd, signal, hist } = this.oscillator.macd;
        let maxAbs = 1e-9;
        for (let i = firstIdx; i <= lastIdx; i++) {
          for (const s of [macd, signal, hist]) {
            const v = s[i];
            if (v !== null && v !== undefined) maxAbs = Math.max(maxAbs, Math.abs(v));
          }
        }
        const yForMacd = (v: number) => oscTop + oscH / 2 - (v / maxAbs) * (oscH / 2) * 0.9;
        const barW = Math.max(1, barWidth * 0.5);
        for (let i = firstIdx; i <= lastIdx; i++) {
          const v = hist[i];
          if (v === null || v === undefined) continue;
          const x = xForIndex(i) + barWidth / 2;
          const yZero = yForMacd(0), y = yForMacd(v);
          ctx.fillStyle = v >= 0 ? theme.buy : theme.sell;
          ctx.fillRect(x - barW / 2, Math.min(y, yZero), barW, Math.max(1, Math.abs(y - yZero)));
        }
        for (const [series, color] of [[macd, theme.accent], [signal, "#e0a53c"]] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          let started = false;
          for (let i = firstIdx; i <= lastIdx; i++) {
            const v = series[i];
            const x = xForIndex(i) + barWidth / 2;
            if (v === null || v === undefined) { started = false; continue; }
            const y = yForMacd(v);
            if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      }
    }

    // ---- crosshair ----
    if (this.crosshair) {
      const { x, y } = this.crosshair;
      if (x >= 0 && x <= plotW && y >= 0 && y <= totalPlotH) {
        ctx.strokeStyle = theme.crosshair;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, totalPlotH);
        ctx.moveTo(0, y); ctx.lineTo(plotW, y);
        ctx.stroke();
        ctx.setLineDash([]);

        if (y <= priceH) {
          const price = maxP - (y / priceH) * (maxP - minP);
          ctx.fillStyle = theme.accent;
          const label = price.toFixed(this.priceDecimals);
          const w = ctx.measureText(label).width + 8;
          ctx.fillRect(plotW, y - 8, w, 16);
          ctx.fillStyle = "#fff";
          ctx.textAlign = "left";
          ctx.fillText(label, plotW + 4, y + 3);
        }
      }
    }

    // ---- border ----
    ctx.strokeStyle = theme.grid;
    ctx.strokeRect(0.5, 0.5, plotW - 1, totalPlotH - 1);
  }
}
