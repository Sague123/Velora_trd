import type { Category, Market } from "./types.js";

/**
 * Which category an instrument belongs to.
 *
 * The rule is an explicit map, not a heuristic over the venue's fields. A
 * heuristic ("contains XAU", "the contractType looks unusual") silently
 * reclassifies things when the venue adds a product, and the failure is
 * invisible: a commodity quietly filed under crypto looks exactly like a
 * commodity. A map is wrong loudly instead — anything it does not cover is
 * reported by `unclassified()` and parked, rather than guessed at.
 *
 * Keyed on the BASE asset, because that is what identifies the underlying:
 * the same gold shows up as XAUUSDT and XAUUSD depending on the quote.
 */

/**
 * Non-crypto underlyings, by base asset.
 *
 * NOTE: this map currently holds only the entries that could be verified
 * against instruments already trading on this platform. Binance's TradFi
 * perpetuals could not be enumerated from here -- api.binance.com and
 * fapi.binance.com are blocked by this environment's egress policy, so
 * exchangeInfo was never seen, and inventing symbols for it would be worse
 * than leaving it short. Every base the sync meets and this map does not
 * cover is logged by name (see `unclassified`), so filling the gap is a
 * matter of reading one log line per missing symbol, not of guessing.
 */
const NON_CRYPTO_BASE: Record<string, Category> = {
  // Gold-backed tokens. They settle on-chain, but what a desk is pricing is
  // the metal, and a client looking for gold looks under metals.
  PAXG: "metals",
  XAUT: "metals",
  // Spot metals and the common TradFi tickers for them.
  XAU: "metals",
  XAG: "metals",
  XPT: "metals",
  XPD: "metals",
  // Energy and softs.
  WTI: "commodities",
  BRENT: "commodities",
  NGAS: "commodities",
  // Index underlyings.
  SPX: "indices",
  NDX: "indices",
  DJI: "indices",
  DAX: "indices",
  UKX: "indices",
  NIK: "indices",
};

/** Quote assets that make a pair a crypto pair. */
const CRYPTO_QUOTES = new Set(["USDT", "USDC", "BUSD", "FDUSD", "TUSD", "BTC", "ETH", "BNB"]);

/** Fiat currencies, for the forex pairs a non-Binance provider will bring. */
const FIAT = new Set([
  "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "NZD",
  "SEK", "NOK", "DKK", "PLN", "CZK", "HUF", "TRY", "ZAR", "MXN", "SGD", "HKD", "CNH",
]);

export interface ClassifyInput {
  base: string;
  quote: string;
  market: Market;
}

/**
 * The category, or null when nothing here covers it.
 *
 * Null is a real answer and the caller must handle it: the sync parks such a
 * symbol rather than filing it under a category somebody will later trade
 * against believing it was checked.
 */
export function classify(input: ClassifyInput): Category | null {
  const base = input.base.toUpperCase();
  const quote = input.quote.toUpperCase();

  const mapped = NON_CRYPTO_BASE[base];
  if (mapped) return mapped;

  // Fiat against fiat is forex, whichever way round it is quoted.
  if (FIAT.has(base) && FIAT.has(quote)) return "forex";

  // Anything else quoted in a crypto quote asset is crypto. This is the bulk
  // of a venue's catalogue and the one case where the default is safe: a pair
  // quoted in USDT whose base is not a known commodity, index or currency is
  // a token.
  if (CRYPTO_QUOTES.has(quote)) return "crypto";

  return null;
}

/** Collects what a sync could not classify, so it can be logged once per run
 * rather than per symbol. */
export class Unclassified {
  private readonly seen = new Map<string, string>();

  add(providerSymbol: string, base: string, quote: string): void {
    this.seen.set(providerSymbol, `${base}/${quote}`);
  }

  get size(): number {
    return this.seen.size;
  }

  /** Symbol names only — enough to look each one up and add a map entry. */
  symbols(): string[] {
    return [...this.seen.keys()].sort();
  }

  describe(): string[] {
    return [...this.seen.entries()].map(([symbol, pair]) => `${symbol} (${pair})`).sort();
  }
}

/** True when this pair is one the spot catalogue should carry at all: USDT
 * quote only, which is what the platform prices and settles in. */
export const isUsdtPair = (quote: string): boolean => quote.toUpperCase() === "USDT";

export const KNOWN_NON_CRYPTO_BASES = Object.keys(NON_CRYPTO_BASE);
