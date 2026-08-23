import { useEffect, useRef, useState } from "react";
import { mapToBinance, parseDepthPayload, type DepthSnapshot } from "../lib/binance";

// Binance's partial-book-depth stream only accepts 5, 10 or 20 as the level
// count in its stream name (`@depth20@100ms`) — any other number silently
// fails to deliver updates, which is what made the book look frozen.
export const DEPTH_LEVELS = 20;
const STALE_MS = 8000;

/** Real order-book depth straight from Binance's public WS stream — shared
 * by the order book panel and anywhere else that just needs best bid/ask
 * (chart header, order entry) without rendering the full book. */
export function useLiveDepth(symbol: string | null, category: string | undefined) {
  const [book, setBook] = useState<DepthSnapshot | null>(null);
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed" | "unsupported">("idle");
  const socketRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastMsgRef = useRef(0);

  useEffect(() => {
    setBook(null);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (watchdogRef.current) clearInterval(watchdogRef.current);
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

    async function loadSnapshot() {
      try {
        const res = await fetch(`${mapping!.restBase}/depth?symbol=${mapping!.binanceSymbol}&limit=${DEPTH_LEVELS}`);
        if (!res.ok) return;
        const json = await res.json();
        const snap = parseDepthPayload(json);
        if (snap && !cancelled) setBook(snap);
      } catch {
        /* the WS stream will still try to populate it */
      }
    }

    function connect() {
      setStatus("connecting");
      const stream = `${mapping!.binanceSymbol.toLowerCase()}@depth${DEPTH_LEVELS}@100ms`;
      const ws = new WebSocket(`${mapping!.wsBase}/${stream}`);
      socketRef.current = ws;

      ws.onopen = () => { attempt = 0; lastMsgRef.current = Date.now(); setStatus("open"); };
      ws.onmessage = (ev) => {
        lastMsgRef.current = Date.now();
        try {
          const payload = JSON.parse(ev.data);
          const snap = parseDepthPayload(payload);
          if (snap) setBook(snap);
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

    loadSnapshot();
    connect();

    // Belt-and-braces: some streams go quiet without ever firing onclose.
    // If nothing has arrived in a while, force a reconnect.
    watchdogRef.current = setInterval(() => {
      if (socketRef.current?.readyState === WebSocket.OPEN && Date.now() - lastMsgRef.current > STALE_MS) {
        socketRef.current.close();
      }
    }, 3000);

    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      if (watchdogRef.current) clearInterval(watchdogRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [symbol, category]);

  return { book, status };
}

/** Best bid/ask straight from the shared depth snapshot — undefined until
 * the book has loaded at least once. */
export function bestBidAsk(book: DepthSnapshot | null) {
  if (!book || book.bids.length === 0 || book.asks.length === 0) return null;
  const bestBid = book.bids.reduce((max, l) => (l.price > max ? l.price : max), -Infinity);
  const bestAsk = book.asks.reduce((min, l) => (l.price < min ? l.price : min), Infinity);
  return { bid: bestBid, ask: bestAsk };
}
