import WebSocket from "ws";
import { SCALE } from "../lib/money.js";
import { config } from "../config.js";
import type { PriceProvider, ProviderState, Quote, QuoteHandler } from "./types.js";

/**
 * Binance market data over its combined streams.
 *
 * One connection per market, carrying every symbol the venue trades, rather
 * than a subscription per instrument. A thousand individual subscriptions
 * costs a thousand messages on every reconnect and runs into the venue's
 * stream-count limits; `!miniTicker@arr` and `!bookTicker` cost one each and
 * carry the same data. `subscribe()` therefore only narrows what this filters
 * locally -- it never changes what is asked for.
 *
 * Prices are converted to scaled BigInt here, at the boundary, because that
 * is the last point where the venue's decimal string is still exact.
 */

/** "63250.12" -> 6325012000000n. Parses the decimal text rather than going
 * through Number: a float round-trip loses the eighth decimal on small-tick
 * assets, and this is the one place that could still be exact. */
export function toScaledFromVenue(text: string): bigint | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  // Venues occasionally send exponent notation for very small prices.
  if (/^-?\d+(\.\d+)?[eE][-+]?\d+$/.test(trimmed)) {
    const asNumber = Number(trimmed);
    if (!Number.isFinite(asNumber)) return null;
    return toScaledFromVenue(asNumber.toFixed(8));
  }
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const negative = trimmed.startsWith("-");
  const [whole, fraction = ""] = (negative ? trimmed.slice(1) : trimmed).split(".");
  // Truncates beyond 1e-8 rather than rounding: a price must never be nudged
  // up into a level that did not trade.
  const padded = (fraction + "00000000").slice(0, 8);
  const scaled = BigInt(whole) * SCALE + BigInt(padded);
  return negative ? -scaled : scaled;
}

interface MiniTicker { s: string; c: string; o: string; v: string; E: number }
interface BookTicker { s: string; b: string; a: string }

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];
/** Binance sends a ping every ~3 minutes and closes a connection that does
 * not pong. `ws` pongs automatically; this is the other direction — a socket
 * that has gone quiet without closing, which happens behind NAT and proxies
 * and otherwise looks exactly like a market with no trades. */
const SILENCE_TIMEOUT_MS = 5 * 60_000;

export interface BinanceProviderOptions {
  name: string;
  /** wss host, no path. */
  wsBase: string;
  /** Maps a venue symbol ("BTCUSDT") to Velora's own, or null to ignore it.
   * Supplied by the caller so the provider needs no database access. */
  resolve: (providerSymbol: string) => string | null;
}

export class BinanceStreamProvider implements PriceProvider {
  readonly name: string;
  private readonly wsBase: string;
  private readonly resolve: (providerSymbol: string) => string | null;

  private socket: WebSocket | null = null;
  private status: ProviderState = "stopped";
  private failure: string | null = null;
  private attempt = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private silenceTimer: NodeJS.Timeout | null = null;
  private stopped = true;

  private readonly handlers = new Set<QuoteHandler>();
  /** Last book seen per venue symbol, so a miniTicker can carry a bid/ask the
   * book stream delivered a moment earlier. */
  private readonly book = new Map<string, { bid: bigint | null; ask: bigint | null }>();

  constructor(options: BinanceProviderOptions) {
    this.name = options.name;
    this.wsBase = options.wsBase;
    this.resolve = options.resolve;
  }

  state(): ProviderState { return this.status; }
  reason(): string | null { return this.failure; }

  onQuote(handler: QuoteHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Accepted and ignored: this provider already receives every symbol. See
   * the note at the top of the file. */
  subscribe(_symbols: string[]): void { /* all-market streams */ }

  async start(): Promise<void> {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.status = "stopped";
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.reconnectTimer = null;
    this.silenceTimer = null;
    this.socket?.close();
    this.socket = null;
  }

  private connect(): void {
    if (this.stopped) return;
    this.status = "connecting";
    const url = `${this.wsBase}/stream?streams=!miniTicker@arr/!bookTicker`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (e) {
      this.fail(`could not open ${this.wsBase}: ${(e as Error).message}`);
      return;
    }
    this.socket = socket;

    socket.on("open", () => {
      this.attempt = 0;
      this.status = "live";
      this.failure = null;
      console.log(`[market] ${this.name} connected`);
      this.armSilenceTimer();
    });

    socket.on("message", (raw) => {
      this.armSilenceTimer();
      this.handleMessage(raw.toString());
    });

    socket.on("unexpected-response", (_req, res) => {
      // 451 is Binance refusing the region outright, 403 a proxy refusing on
      // its behalf. Neither is retryable, and retrying forever would bury the
      // one log line that explains why there are no prices.
      const geoBlocked = res.statusCode === 451 || res.statusCode === 403;
      this.fail(
        `${this.wsBase} answered HTTP ${res.statusCode}` +
        (geoBlocked ? " — this region is blocked, or an egress proxy refused the connection" : ""),
        { retry: !geoBlocked }
      );
    });

    socket.on("error", (e) => {
      // Reported through close/unexpected-response as well; this keeps the
      // reason when the close frame carries none.
      this.failure = `${this.name}: ${(e as Error).message}`;
    });

    socket.on("close", () => {
      if (this.stopped || this.status === "unavailable") return;
      this.scheduleReconnect();
    });

    socket.on("ping", () => socket.pong());
  }

  private handleMessage(text: string): void {
    let payload: { stream?: string; data?: unknown };
    try {
      payload = JSON.parse(text);
    } catch {
      return;
    }
    const data = payload.data;
    if (!data) return;

    if (payload.stream === "!bookTicker") {
      const tick = data as BookTicker;
      this.book.set(tick.s, { bid: toScaledFromVenue(tick.b), ask: toScaledFromVenue(tick.a) });
      return;
    }

    if (payload.stream === "!miniTicker@arr" && Array.isArray(data)) {
      for (const tick of data as MiniTicker[]) this.emitMiniTicker(tick);
    }
  }

  private emitMiniTicker(tick: MiniTicker): void {
    const symbol = this.resolve(tick.s);
    if (!symbol) return;
    const last = toScaledFromVenue(tick.c);
    if (last === null || last <= 0n) return;

    // miniTicker carries the open rather than a percentage, so the change is
    // derived. Display only — it never enters an arithmetic path that moves
    // money, which is why a float is acceptable here and nowhere else.
    const open = toScaledFromVenue(tick.o);
    const change24hPct = open && open > 0n ? (Number(last - open) / Number(open)) * 100 : 0;

    const book = this.book.get(tick.s);
    const quote: Quote = {
      symbol,
      bid: book?.bid ?? null,
      ask: book?.ask ?? null,
      last,
      change24hPct,
      volume24h: toScaledFromVenue(tick.v),
      // The venue's own event time. Using arrival time here would mean a
      // stalled stream kept looking fresh for as long as it kept us connected.
      ts: typeof tick.E === "number" ? tick.E : Date.now(),
    };
    for (const handler of this.handlers) {
      try { handler(quote); } catch { /* one bad listener must not stop the feed */ }
    }
  }

  private armSilenceTimer(): void {
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    this.silenceTimer = setTimeout(() => {
      console.warn(`[market] ${this.name} silent for ${SILENCE_TIMEOUT_MS}ms — reconnecting`);
      this.socket?.terminate();
    }, SILENCE_TIMEOUT_MS);
  }

  private fail(reason: string, options: { retry: boolean } = { retry: true }): void {
    this.failure = reason;
    if (options.retry) {
      this.scheduleReconnect();
      return;
    }
    this.status = "unavailable";
    console.error(`[market] ${this.name} unavailable: ${reason}`);
    this.socket?.close();
    this.socket = null;
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = BACKOFF_MS[Math.min(this.attempt, BACKOFF_MS.length - 1)];
    this.attempt += 1;
    this.status = "connecting";
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}

export const createBinanceSpotProvider = (resolve: (s: string) => string | null) =>
  new BinanceStreamProvider({ name: "binance-spot", wsBase: config.binanceSpotWs, resolve });

export const createBinanceFuturesProvider = (resolve: (s: string) => string | null) =>
  new BinanceStreamProvider({ name: "binance-futures", wsBase: config.binanceFuturesWs, resolve });
