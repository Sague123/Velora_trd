/**
 * What the platform needs from a market-data upstream, and nothing else.
 *
 * Every provider hands back the same shape, with prices already BigInt-scaled
 * (money.ts's SCALE, 1e8) at the provider boundary. That conversion belongs
 * here rather than at the reader: a number that reaches the matching engine
 * as a float has already lost precision, and no amount of care downstream
 * gets it back. Adding a venue means implementing this interface and nothing
 * more -- see README.md, "Adding a price provider".
 */

export type Market = "spot" | "perp";

export type Category = "crypto" | "forex" | "metals" | "commodities" | "indices" | "stocks";

export const CATEGORIES: Category[] = ["crypto", "forex", "metals", "commodities", "indices", "stocks"];

export interface Quote {
  /** Velora's own symbol, not the provider's — the provider translates. */
  symbol: string;
  /** Scaled 1e8. Null where the venue's stream does not carry a book. */
  bid: bigint | null;
  ask: bigint | null;
  last: bigint;
  /** A display percentage, never persisted and never used in arithmetic that
   * touches money. */
  change24hPct: number;
  /** Scaled 1e8, in base units. */
  volume24h: bigint | null;
  /** When the venue said this was true, in epoch ms — not when we received
   * it. The staleness guard is only meaningful against the venue's clock. */
  ts: number;
}

export type QuoteHandler = (quote: Quote) => void;

export type ProviderState = "stopped" | "connecting" | "live" | "unavailable";

export interface PriceProvider {
  readonly name: string;
  /** What this provider can currently do. `unavailable` is a provider that
   * started and was refused — a geo-block, a bad key — as opposed to one that
   * is merely between reconnects. */
  state(): ProviderState;
  /** Why it is unavailable, for the health endpoint. Null when it is fine. */
  reason(): string | null;
  start(): Promise<void>;
  stop(): void;
  /**
   * Narrows what the provider asks the venue for. A provider using a venue's
   * all-market firehose may ignore this and filter locally, which is what the
   * Binance ones do: one stream of every ticker costs the same as one of a
   * hundred, and a thousand individual subscriptions does not.
   */
  subscribe(symbols: string[]): void;
  onQuote(handler: QuoteHandler): () => void;
}

/** One instrument as a venue describes it, before it becomes a database row. */
export interface CatalogEntry {
  symbol: string;
  displayName: string;
  category: Category;
  market: Market;
  provider: string;
  providerSymbol: string;
  base: string;
  quote: string;
  tickSize: bigint | null;
  stepSize: bigint | null;
  minQty: bigint | null;
  maxLeverage: number | null;
  priceDecimals: number;
  status: "TRADING" | "BREAK" | "HALT" | "DELISTED";
  tradingHours: string | null;
}
