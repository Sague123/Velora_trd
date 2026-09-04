import { useEffect, useRef, useState } from "react";
import { mapToBinance, parseDepthPayload, type DepthSnapshot } from "../lib/binance";
import { LocalOrderBook, type DepthDiffEvent } from "../lib/orderBook";

/**
 * How many levels per side the panel is handed. This is a rendering budget,
 * not the depth of the book: the book behind it (lib/orderBook.ts) holds
 * everything Binance has sent, and `book.depth` reports how much that is.
 *
 * The old value — 20 — was not a budget but a hard ceiling, because the
 * partial-depth stream it used cannot carry more.
 */
export const DEPTH_LEVELS = 200;

/** Levels requested in the seeding snapshot. Binance allows up to 5000; 1000
 * is deep enough to cover any aggregation step the panel offers while still
 * being one quick request. */
const SNAPSHOT_LIMIT = 1000;

/** The stream pushes every 100ms. Repainting a table that often is what made
 * the book look like it was vibrating, so updates are collected and flushed
 * at this interval instead — fast enough to read as live, slow enough that a
 * row stays still long enough to be read. */
const FLUSH_MS = 250;

const STALE_MS = 8000;

export interface DepthState {
  book: DepthSnapshot | null;
  status: "idle" | "connecting" | "open" | "closed" | "unsupported";
  /** How many price levels the local book actually holds per side — the
   * honest answer to "am I seeing all the orders?", which the panel shows
   * rather than leaving the truncation implicit. */
  depth: { bids: number; asks: number };
  /** False while resyncing after a sequence gap: the numbers on screen are
   * the last good ones, not current. */
  synced: boolean;
}

/**
 * Real order-book depth from Binance's diff-depth stream, maintained locally.
 *
 * Shared by the order book panel and anywhere that just needs best bid/ask
 * without rendering the whole book.
 */
export function useLiveDepth(symbol: string | null, category: string | undefined): DepthState {
  const [book, setBook] = useState<DepthSnapshot | null>(null);
  const [status, setStatus] = useState<DepthState["status"]>("idle");
  const [depth, setDepth] = useState({ bids: 0, asks: 0 });
  const [synced, setSynced] = useState(false);

  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgRef = useRef(0);

  useEffect(() => {
    setBook(null);
    setDepth({ bids: 0, asks: 0 });
    setSynced(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (watchdogRef.current) clearInterval(watchdogRef.current);
    if (flushRef.current) clearInterval(flushRef.current);
    socketRef.current?.close();
    socketRef.current = null;

    if (!symbol || !category) {
      setStatus("idle");
      return;
    }
    const mapping = mapToBinance(symbol, category as any);
    if (!mapping) {
      setStatus("unsupported");
      return;
    }

    let cancelled = false;
    let attempt = 0;
    let dirty = false;
    const orderBook = new LocalOrderBook(mapping.market === "futures" ? "futures" : "spot");

    /**
     * Fetches a snapshot and seeds the book with it, replaying whatever the
     * stream sent meanwhile. Retries when the buffered events don't join up
     * with the snapshot — that means the snapshot was already too old, and
     * the fix is a newer one, not applying the events anyway.
     */
    async function resync(depthAttempt = 0): Promise<void> {
      if (cancelled || depthAttempt > 4) return;
      try {
        const res = await fetch(`${mapping!.restBase}/depth?symbol=${mapping!.binanceSymbol}&limit=${SNAPSHOT_LIMIT}`);
        if (!res.ok) throw new Error(String(res.status));
        const json = await res.json();
        const parsed = parseDepthPayload(json);
        const lastUpdateId = Number(json?.lastUpdateId);
        if (!parsed || !Number.isFinite(lastUpdateId)) throw new Error("bad snapshot");
        if (cancelled) return;

        if (!orderBook.seed({ ...parsed, lastUpdateId })) {
          // Snapshot older than the buffered events — try again for a newer one.
          timerRef.current = setTimeout(() => resync(depthAttempt + 1), 400);
          return;
        }
        dirty = true;
        setSynced(true);
      } catch {
        if (!cancelled) timerRef.current = setTimeout(() => resync(depthAttempt + 1), 800);
      }
    }

    function connect() {
      setStatus("connecting");
      // The diff stream, not @depthN: it carries changes to the whole book
      // rather than a fixed-size window of it.
      const stream = `${mapping!.binanceSymbol.toLowerCase()}@depth@100ms`;
      const ws = new WebSocket(`${mapping!.wsBase}/${stream}`);
      socketRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        lastMsgRef.current = Date.now();
        setStatus("open");
        // Snapshot only after the stream is live, so nothing between the two
        // can be missed: events arriving before it lands are buffered.
        orderBook.reset();
        setSynced(false);
        resync();
      };
      ws.onmessage = (ev) => {
        lastMsgRef.current = Date.now();
        try {
          const payload = JSON.parse(ev.data) as DepthDiffEvent;
          if (typeof payload?.u !== "number") return;
          if (!orderBook.apply(payload)) {
            // Sequence gap: the book is stale until a fresh snapshot lands.
            setSynced(false);
            resync();
            return;
          }
          if (orderBook.isSynced) dirty = true;
        } catch { /* ignore malformed frame */ }
      };
      ws.onclose = () => {
        if (cancelled) return;
        setStatus("closed");
        const delay = Math.min(1000 * 2 ** attempt, 10000);
        attempt += 1;
        timerRef.current = setTimeout(connect, delay);
      };
      ws.onerror = () => ws.close();
    }

    connect();

    // One repaint per interval, and only when something actually changed —
    // the stream's own cadence is not a reason to re-render at it.
    flushRef.current = setInterval(() => {
      if (!dirty || cancelled) return;
      dirty = false;
      setBook(orderBook.snapshot(DEPTH_LEVELS));
      setDepth(orderBook.depth);
    }, FLUSH_MS);

    // Belt-and-braces: some streams go quiet without ever firing onclose.
    watchdogRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN && Date.now() - lastMsgRef.current > STALE_MS) {
        socketRef.current.close();
      }
    }, 3000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      if (flushRef.current) clearInterval(flushRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [symbol, category]);

  return { book, status, depth, synced };
}

/** Best bid/ask straight from the shared depth snapshot — undefined until
 * the book has loaded at least once. The snapshot is already sorted best-first
 * per side, so this is the head of each, not a scan. */
export function bestBidAsk(book: DepthSnapshot | null) {
  if (!book || book.bids.length === 0 || book.asks.length === 0) return null;
  return { bid: book.bids[0].price, ask: book.asks[0].price };
}
