import { useEffect, useRef } from "react";
import { useInstruments } from "./useMarket";
import { usePriceStore } from "../store/prices";
import { mapToBinance } from "../lib/binance";
import type { Instrument } from "../lib/types";

/**
 * The order book and chart already get sub-second updates straight from
 * Binance's public WS feeds — the top-of-app "live price" ticker was the one
 * thing still waiting on the backend's own price-refresh cycle (tens of
 * seconds). This mirrors the same direct-from-Binance approach for price/
 * change/high/low so the ticker, chart header and PnL preview feel exactly
 * as live as the order book. It only *displays* faster; the account's real
 * margin/liquidation math still runs off the server's own price, which the
 * backend refreshes on its own (much shorter) cycle independently.
 *
 * Binance's combined `!ticker@arr` stream pushes every symbol's 24hr ticker
 * in one message roughly once a second — one connection per market covers
 * the whole catalog instead of one socket per symbol.
 */
export function useBinanceTickerFeed() {
  const { data } = useInstruments();
  const applyTick = usePriceStore((s) => s.applyTick);
  const instrumentsRef = useRef<Instrument[]>([]);
  instrumentsRef.current = data?.instruments ?? [];

  useEffect(() => {
    const spotMap = new Map<string, Instrument>();
    const futuresMap = new Map<string, Instrument>();
    for (const inst of instrumentsRef.current) {
      const mapping = mapToBinance(inst.symbol, inst.category);
      if (!mapping) continue;
      const key = mapping.binanceSymbol.toLowerCase();
      if (mapping.market === "spot") spotMap.set(key, inst);
      else futuresMap.set(key, inst);
    }
    if (spotMap.size === 0 && futuresMap.size === 0) return;

    const sockets: WebSocket[] = [];

    function subscribe(url: string, map: Map<string, Instrument>) {
      if (map.size === 0) return;
      let closedByUs = false;
      let ws: WebSocket;
      const connect = () => {
        ws = new WebSocket(url);
        sockets.push(ws);
        ws.onmessage = (ev) => {
          try {
            const rows = JSON.parse(ev.data);
            if (!Array.isArray(rows)) return;
            for (const row of rows) {
              const inst = map.get(String(row.s).toLowerCase());
              if (!inst || row.c === undefined) continue;
              applyTick({
                symbol: inst.symbol,
                price: String(row.c),
                change24h: Number(row.P) || 0,
                high24h: row.h !== undefined ? String(row.h) : null,
                low24h: row.l !== undefined ? String(row.l) : null,
                source: inst.source === "SYNTHETIC" ? "SYNTHETIC" : "BINANCE",
              });
            }
          } catch { /* ignore malformed frame */ }
        };
        ws.onclose = () => { if (!closedByUs) setTimeout(connect, 3000); };
        ws.onerror = () => ws.close();
      };
      connect();
      return () => { closedByUs = true; };
    }

    const stopSpot = subscribe("wss://stream.binance.com:9443/ws/!ticker@arr", spotMap);
    const stopFutures = subscribe("wss://fstream.binance.com/ws/!ticker@arr", futuresMap);

    return () => {
      stopSpot?.();
      stopFutures?.();
      for (const ws of sockets) ws.close();
    };
    // Reconnect whenever the instrument catalog itself changes, not on every
    // price tick — `data` already drives instrumentsRef above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
