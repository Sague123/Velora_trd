import { db } from "../db.js";
import { out } from "../lib/money.js";
import { priceCache } from "./cache.js";
import { CATEGORIES, type Category } from "./types.js";

/**
 * Pushing prices to browsers without drowning them.
 *
 * The old broadcast sent every instrument to every client on every upstream
 * refresh. With eighteen instruments that was a few hundred bytes; with a
 * few thousand streaming several times a second it is megabytes per second
 * per client, almost all of it symbols nobody is looking at.
 *
 * Three things fix that, and all three are necessary:
 *  - a client says what it wants (categories, or an explicit symbol list),
 *  - only symbols that actually moved since its last frame are sent,
 *  - and frames are capped at FRAME_MS apart regardless of how fast the
 *    venue ticks, so the socket carries at most four a second.
 */

const FRAME_MS = 250;

/** symbol -> category, kept in memory because a subscription by category has
 * to resolve on every frame and the mapping changes twice a day. */
let symbolCategory = new Map<string, Category>();

export async function reloadBroadcastRoutes(): Promise<number> {
  const rows = (await db.prepare(
    "SELECT symbol, category FROM instruments WHERE status = 'TRADING'"
  ).all()) as { symbol: string; category: Category }[];
  symbolCategory = new Map(rows.map((r) => [r.symbol, r.category]));
  return symbolCategory.size;
}

export interface Subscription {
  categories: Set<Category>;
  symbols: Set<string>;
}

const emptySubscription = (): Subscription => ({ categories: new Set(), symbols: new Set() });

/** Parses what a client asked for. Unknown categories are ignored rather than
 * rejected: a newer client asking for something this server does not have
 * should degrade, not disconnect. */
export function parseSubscribe(message: unknown): Subscription | null {
  if (!message || typeof message !== "object") return null;
  const body = message as { type?: unknown; categories?: unknown; symbols?: unknown };
  if (body.type !== "subscribe") return null;

  const subscription = emptySubscription();
  if (Array.isArray(body.categories)) {
    for (const value of body.categories) {
      if (typeof value === "string" && (CATEGORIES as string[]).includes(value)) {
        subscription.categories.add(value as Category);
      }
    }
  }
  if (Array.isArray(body.symbols)) {
    // Bounded: a client cannot pin the server by naming the whole catalogue
    // one symbol at a time.
    for (const value of body.symbols.slice(0, 2000)) {
      if (typeof value === "string") subscription.symbols.add(value.toUpperCase());
    }
  }
  return subscription;
}

const wants = (subscription: Subscription, symbol: string): boolean => {
  // No filter at all means everything, which is what a client that never
  // sends a subscribe frame gets — the previous behaviour, kept so an older
  // frontend against a newer server still shows prices.
  if (subscription.categories.size === 0 && subscription.symbols.size === 0) return true;
  if (subscription.symbols.has(symbol)) return true;
  const category = symbolCategory.get(symbol);
  return category !== undefined && subscription.categories.has(category);
};

export interface PriceSocket {
  readyState: number;
  OPEN: number;
  send(data: string): void;
}

/**
 * Drives one socket. Returns a stop function.
 *
 * Each socket keeps its own cursor into the cache's change sequence, so two
 * clients subscribed to different things never affect each other's frames.
 */
export function attachPriceSocket(socket: PriceSocket, onError: (e: unknown) => void) {
  let subscription = emptySubscription();
  let cursor = 0;
  /** First frame carries everything the client asked for, not just what has
   * changed since connecting — otherwise a quiet symbol stays blank until it
   * happens to tick. */
  let primed = false;

  const frame = () => {
    if (socket.readyState !== socket.OPEN) return;
    try {
      const { quotes, seq } = primed
        ? priceCache.changedSince(cursor)
        : { quotes: priceCache.snapshot(), seq: priceCache.changedSince(0).seq };
      cursor = seq;

      const data = quotes
        .filter((quote) => wants(subscription, quote.symbol))
        .map((quote) => ({
          symbol: quote.symbol,
          price: out(quote.last, 8),
          bid: quote.bid ? out(quote.bid, 8) : null,
          ask: quote.ask ? out(quote.ask, 8) : null,
          change24h: quote.change24hPct,
          ts: quote.ts,
          stale: priceCache.stale(quote.symbol),
        }));

      primed = true;
      // An empty frame is worth nothing and still costs a round trip.
      if (data.length === 0) return;
      socket.send(JSON.stringify({ type: "prices", data }));
    } catch (e) {
      onError(e);
    }
  };

  frame();
  const timer = setInterval(frame, FRAME_MS);

  return {
    stop: () => clearInterval(timer),
    /** Re-primes, so the first frame after a subscription change carries the
     * newly requested symbols rather than only their next tick. */
    setSubscription: (next: Subscription) => {
      subscription = next;
      primed = false;
      frame();
    },
  };
}
