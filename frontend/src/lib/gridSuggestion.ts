import { atr } from "./indicators";
import type { Bar } from "./chartEngine";

export interface GridSuggestion {
  lower: number;
  upper: number;
  levels: number;
  atrValue: number;
  price: number;
}

/**
 * A transparent, indicator-based suggestion for grid-bot placement — not
 * machine learning, just Average True Range sizing the range and level
 * count around the current price, the same way a trader would eyeball a
 * volatility band by hand. Every input is a real value from real candles.
 */
export function suggestGrid(bars: Bar[]): GridSuggestion | null {
  if (bars.length < 20) return null;
  const atrValue = atr(bars, 14);
  if (atrValue === null || atrValue <= 0) return null;

  const price = bars[bars.length - 1].close;
  const spread = atrValue * 2.5;
  const lower = Math.max(0, price - spread);
  const upper = price + spread;
  const levels = Math.min(12, Math.max(4, Math.round((upper - lower) / atrValue)));

  return { lower, upper, levels, atrValue, price };
}

export interface GridBacktestResult {
  cycles: number;
  grossProfit: number;
  days: number;
  perDay: number;
}

/**
 * A mechanical, transparent estimate of what this exact grid would have
 * earned had it been running over the historical candles shown — not a
 * simulation of the real matching engine, no fees/slippage modeled, and
 * absolutely not a promise of future returns. It only counts how many times
 * the closing price actually crossed back and forth over each grid line in
 * the real candle data, which is the mechanism a grid bot profits from.
 */
export function estimateGridBacktest(bars: Bar[], lower: number, upper: number, levels: number, qtyPerLevel: number): GridBacktestResult | null {
  if (!(upper > lower) || levels < 1 || qtyPerLevel <= 0 || bars.length < 10) return null;
  const step = (upper - lower) / levels;
  const levelPrices = Array.from({ length: levels + 1 }, (_, i) => lower + step * i);
  const side: ("below" | "above" | null)[] = levelPrices.map(() => null);
  let cycles = 0;

  for (const bar of bars) {
    const price = bar.close;
    for (let i = 0; i < levelPrices.length; i++) {
      const s = price < levelPrices[i] ? "below" : "above";
      if (side[i] === null) { side[i] = s; continue; }
      if (side[i] !== s) {
        // A level crossed downward-then-later-upward (or vice versa) is one
        // round trip over that line — the same event a resting buy/sell pair
        // at that price would have filled on.
        cycles += 0.5;
        side[i] = s;
      }
    }
  }

  const grossProfit = cycles * step * qtyPerLevel;
  const days = Math.max(1, (bars[bars.length - 1].time - bars[0].time) / 86400);
  return { cycles: Math.round(cycles), grossProfit, days, perDay: grossProfit / days };
}
