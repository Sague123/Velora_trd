import { config } from "../config.js";
import type { Quote } from "./types.js";

/**
 * The last quote per symbol, in memory.
 *
 * Everything that needs a price reads it here: the matching engine on its 2s
 * tick, the order path when it validates a fill, and the websocket broadcast.
 * Before this they each read price_snapshots, which meant a round trip to
 * Postgres per tick for data that changes faster than it can be written and
 * is worthless the moment it is old. The table is still written, but as a
 * record rather than as the thing the engine trades against.
 *
 * Staleness is the one rule this file exists to enforce. A quote nobody has
 * refreshed recently is not a price, it is a memory; the platform will show
 * it, and will not fill, stop, take or liquidate against it. One definition,
 * here, so the engine and the API can never disagree about what "too old"
 * means.
 */

export class PriceCache {
  private readonly quotes = new Map<string, Quote>();
  /** Bumped on every write, so a broadcaster can ask "what changed since?"
   * without diffing the whole map. */
  private readonly version = new Map<string, number>();
  private seq = 0;

  set(quote: Quote): void {
    const previous = this.quotes.get(quote.symbol);
    // Out-of-order delivery is normal on a reconnect: two streams can both
    // carry the same symbol and the slower one must not overwrite the newer
    // tick with an older one.
    if (previous && previous.ts > quote.ts) return;
    this.quotes.set(quote.symbol, quote);
    this.version.set(quote.symbol, ++this.seq);
  }

  get(symbol: string): Quote | undefined {
    return this.quotes.get(symbol);
  }

  /** The quote only if it is fresh enough to trade against. */
  tradeable(symbol: string, atMs = Date.now()): Quote | undefined {
    const quote = this.quotes.get(symbol);
    return quote && this.isFresh(quote, atMs) ? quote : undefined;
  }

  isFresh(quote: Quote | undefined, atMs = Date.now()): boolean {
    if (!quote) return false;
    // A quote timestamped in the future is a clock problem, not freshness;
    // treating it as fresh is the safe reading, since the alternative halts a
    // market over a few seconds of drift between us and the venue.
    return atMs - quote.ts <= config.maxQuoteAgeMs;
  }

  stale(symbol: string, atMs = Date.now()): boolean {
    return !this.isFresh(this.quotes.get(symbol), atMs);
  }

  /** Every fresh symbol and its price, for one engine tick. */
  tradeableMarks(atMs = Date.now()): Map<string, bigint> {
    const marks = new Map<string, bigint>();
    for (const [symbol, quote] of this.quotes) {
      if (this.isFresh(quote, atMs)) marks.set(symbol, quote.last);
    }
    return marks;
  }

  snapshot(symbols?: string[]): Quote[] {
    if (!symbols) return [...this.quotes.values()];
    const out: Quote[] = [];
    for (const symbol of symbols) {
      const quote = this.quotes.get(symbol);
      if (quote) out.push(quote);
    }
    return out;
  }

  /** Symbols written since `since`, with the sequence to pass next time. A
   * broadcaster uses this to send only what moved. */
  changedSince(since: number): { quotes: Quote[]; seq: number } {
    const quotes: Quote[] = [];
    for (const [symbol, version] of this.version) {
      if (version > since) {
        const quote = this.quotes.get(symbol);
        if (quote) quotes.push(quote);
      }
    }
    return { quotes, seq: this.seq };
  }

  get size(): number {
    return this.quotes.size;
  }

  clear(): void {
    this.quotes.clear();
    this.version.clear();
    this.seq = 0;
  }
}

/** The one the running process uses. */
export const priceCache = new PriceCache();
