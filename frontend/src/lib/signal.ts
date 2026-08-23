import { ema, macd, rsi, sma } from "./indicators";

export type Rating = "STRONG_SELL" | "SELL" | "NEUTRAL" | "BUY" | "STRONG_BUY";

export interface SignalResult {
  rating: Rating;
  score: number; // -6..+6, sum of individual votes
  votes: { label: string; direction: -1 | 0 | 1 }[];
}

const RATING_LABEL: Record<Rating, string> = {
  STRONG_SELL: "Strong Sell",
  SELL: "Sell",
  NEUTRAL: "Neutral",
  BUY: "Buy",
  STRONG_BUY: "Strong Buy",
};

export function ratingLabel(r: Rating): string {
  return RATING_LABEL[r];
}

/** Score (-6..+6, sum of the vote tally) mapped to a 0-100 "bullish" reading
 * for the probability slider — still just the same mechanical vote count,
 * only rescaled for display. */
export function signalProbability(score: number): number {
  const clamped = Math.max(-6, Math.min(6, score));
  return Math.round(((clamped + 6) / 12) * 100);
}

// A dead zone of ±1 around zero: with ~6 binary ±1 votes derived from
// closely-related moving averages, a single indicator flickering across its
// own crossover point (e.g. RSI drifting from 49.8 to 50.2) used to be enough
// to flip the entire published rating from BUY to SELL on essentially no
// price movement. Requiring at least two votes of net agreement before
// calling a direction keeps the label stable through that kind of noise.
function ratingFromScore(score: number): Rating {
  if (score >= 4) return "STRONG_BUY";
  if (score >= 2) return "BUY";
  if (score <= -4) return "STRONG_SELL";
  if (score <= -2) return "SELL";
  return "NEUTRAL";
}

/**
 * A simple, transparent technical-analysis summary in the spirit of a
 * classic "buy/sell rating" widget — every input is a real indicator value
 * computed from the candles the API returned. This is not investment
 * advice: it is a mechanical tally of common crossover/level rules.
 */
export function computeSignal(closes: number[]): SignalResult | null {
  if (closes.length < 30) return null;

  const last = closes.length - 1;
  const votes: { label: string; direction: -1 | 0 | 1 }[] = [];

  const sma20 = sma(closes, 20)[last];
  const sma50 = sma(closes, Math.min(50, closes.length - 1))[last];
  const ema9 = ema(closes, 9)[last];
  const ema21 = ema(closes, 21)[last];
  const price = closes[last];

  if (sma20 !== null) votes.push({ label: "Price vs SMA20", direction: price > sma20 ? 1 : price < sma20 ? -1 : 0 });
  if (sma50 !== null) votes.push({ label: "Price vs SMA50", direction: price > sma50 ? 1 : price < sma50 ? -1 : 0 });
  if (ema9 !== null && ema21 !== null) {
    votes.push({ label: "EMA9 vs EMA21", direction: ema9 > ema21 ? 1 : ema9 < ema21 ? -1 : 0 });
  }

  const rsiSeries = rsi(closes, 14);
  const rsiVal = rsiSeries[last];
  if (rsiVal !== null) {
    // A hard split at exactly 50 used to mean 49.9 and 50.1 — indistinguishable
    // in any practical sense — voted opposite directions. A real neutral band
    // around the midpoint (45-55) only registers a vote once RSI has actually
    // moved into a mild trend, not on sub-1-point noise around its center.
    let dir: -1 | 0 | 1 = 0;
    if (rsiVal < 30) dir = 1; // oversold -> bullish mean-reversion vote
    else if (rsiVal > 70) dir = -1; // overbought -> bearish
    else if (rsiVal > 55) dir = 1;
    else if (rsiVal < 45) dir = -1;
    votes.push({ label: `RSI14 (${rsiVal.toFixed(0)})`, direction: dir });
  }

  const { hist } = macd(closes);
  const histVal = hist[last];
  const histPrev = hist[last - 1];
  if (histVal !== null) {
    let dir: -1 | 0 | 1 = histVal > 0 ? 1 : histVal < 0 ? -1 : 0;
    votes.push({ label: "MACD Histogram", direction: dir });
    if (histPrev !== null) {
      votes.push({ label: "MACD Momentum", direction: histVal > histPrev ? 1 : histVal < histPrev ? -1 : 0 });
    }
  }

  if (votes.length === 0) return null;
  const score = votes.reduce((s, v) => s + v.direction, 0);
  return { rating: ratingFromScore(score), score, votes };
}
