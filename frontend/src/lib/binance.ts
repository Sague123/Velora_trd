import type { Bar } from "./chartEngine";
import type { Category, Timeframe } from "./types";

export interface BinanceMapping {
  market: "spot" | "futures";
  binanceSymbol: string;
  restBase: string;
  wsBase: string;
}

/** Velora's crypto symbols are already Binance tickers for SPOT (BTCUSDT, …)
 * and map 1:1 in spelling for PERP once the dash is dropped (BTC-PERP ->
 * BTCUSDT futures). FX and CFD instruments have no Binance equivalent. */
export function mapToBinance(symbol: string, category: Category): BinanceMapping | null {
  if (category === "SPOT" || category === "COMMODITY") {
    return { market: "spot", binanceSymbol: symbol.toUpperCase(), restBase: "https://api.binance.com/api/v3", wsBase: "wss://stream.binance.com:9443/ws" };
  }
  if (category === "PERP") {
    const base = symbol.replace(/-PERP$/i, "").toUpperCase();
    if (!base) return null;
    return { market: "futures", binanceSymbol: `${base}USDT`, restBase: "https://fapi.binance.com/fapi/v1", wsBase: "wss://fstream.binance.com/ws" };
  }
  return null;
}

export interface DepthLevel {
  price: number;
  qty: number;
}

export interface DepthSnapshot {
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export function parseDepthPayload(raw: any): DepthSnapshot | null {
  const bidsRaw = raw?.bids ?? raw?.b;
  const asksRaw = raw?.asks ?? raw?.a;
  if (!Array.isArray(bidsRaw) || !Array.isArray(asksRaw)) return null;
  const toLevels = (rows: any[]): DepthLevel[] =>
    rows
      .map((r) => ({ price: Number(r[0]), qty: Number(r[1]) }))
      .filter((l) => Number.isFinite(l.price) && Number.isFinite(l.qty) && l.qty > 0);
  return { bids: toLevels(bidsRaw), asks: toLevels(asksRaw) };
}

const TF_TO_BINANCE: Record<Timeframe, string> = {
  "1m": "1m", "5m": "5m", "15m": "15m", "1H": "1h", "4H": "4h", "1D": "1d", "1W": "1w",
};

/** Real OHLC candles straight from Binance's public klines endpoint — no
 * server round-trip, no CoinGecko rate limit, no synthetic fallback for any
 * crypto SPOT/PERP instrument. 1000 is the maximum Binance allows in a single
 * call; pass `endTime` (ms) to page further back for full listing history. */
export async function fetchBinanceKlines(symbol: string, category: Category, tf: Timeframe, endTime?: number, limit = 1000): Promise<Bar[] | null> {
  const mapping = mapToBinance(symbol, category);
  if (!mapping) return null;
  const interval = TF_TO_BINANCE[tf];
  const endParam = endTime ? `&endTime=${endTime}` : "";
  const url = `${mapping.restBase}/klines?symbol=${mapping.binanceSymbol}&interval=${interval}&limit=${limit}${endParam}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows)) return null;
    return rows.map((r: any[]) => ({
      time: Math.floor(r[0] / 1000),
      open: Number(r[1]), high: Number(r[2]), low: Number(r[3]), close: Number(r[4]),
      volume: Number(r[5]),
    }));
  } catch {
    return null;
  }
}
