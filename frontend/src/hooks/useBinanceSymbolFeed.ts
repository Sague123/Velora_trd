import { useEffect } from "react";
import { usePriceStore } from "../store/prices";
import { mapToBinance } from "../lib/binance";
import type { Category } from "../lib/types";

/**
 * Trade-by-trade price for the single symbol currently on screen.
 *
 * The catalog-wide `!ticker@arr` feed is capped at one frame per second, which
 * is what made the chart feel sluggish — the live candle could only ever
 * redraw once a second no matter how fast the market moved. Binance's
 * `@aggTrade` stream instead pushes on every executed trade (many per second
 * on a liquid pair), so the forming candle and the header price track the
 * market in real time.
 *
 * Scoped to one symbol on purpose: this is a second socket, and it is only
 * worth opening for the instrument the user is actually watching. The
 * broad ticker feed still supplies 24h statistics for everything else.
 */
export function useBinanceSymbolFeed(symbol: string | null, category: Category | undefined) {
  const applyPriceOnly = usePriceStore((s) => s.applyPriceOnly);

  useEffect(() => {
    if (!symbol || !category) return;
    const mapping = mapToBinance(symbol, category);
    if (!mapping) return;

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closedByUs = false;

    const connect = () => {
      ws = new WebSocket(`${mapping.wsBase}/${mapping.binanceSymbol.toLowerCase()}@aggTrade`);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg?.p) applyPriceOnly(symbol, String(msg.p));
        } catch {
          /* ignore malformed frame */
        }
      };
      ws.onclose = () => {
        if (!closedByUs) retry = setTimeout(connect, 3000);
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    return () => {
      closedByUs = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [symbol, category, applyPriceOnly]);
}
