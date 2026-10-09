import { config } from "../config.js";
import type { PriceProvider, ProviderState, QuoteHandler } from "./types.js";

/**
 * Providers that are planned but not written.
 *
 * They exist as real objects rather than as a TODO so the wiring that will
 * use them is already in place and typed: registering one is adding it to the
 * list in market/index.ts, and the shape it has to satisfy is checked by the
 * compiler today. Each refuses to start unless its env flag is on, and says
 * plainly that it is a stub rather than pretending to be an outage.
 *
 * Credentials come from the environment only. Nothing here has a default, and
 * a missing token is a refusal to start rather than an anonymous connection
 * that fails later for reasons nobody can see.
 */
class StubProvider implements PriceProvider {
  private status: ProviderState = "stopped";
  private failure: string | null = null;

  constructor(
    readonly name: string,
    private readonly enabled: boolean,
    private readonly credentials: Record<string, string | null>,
  ) {}

  state(): ProviderState { return this.status; }
  reason(): string | null { return this.failure; }

  async start(): Promise<void> {
    if (!this.enabled) {
      this.status = "stopped";
      return;
    }
    const missing = Object.entries(this.credentials)
      .filter(([, value]) => !value)
      .map(([key]) => key);
    this.status = "unavailable";
    this.failure = missing.length
      ? `${this.name} is enabled but ${missing.join(", ")} is not set`
      : `${this.name} is not implemented yet`;
    console.warn(`[market] ${this.failure}`);
  }

  stop(): void { this.status = "stopped"; }
  subscribe(_symbols: string[]): void { /* nothing to subscribe to yet */ }
  onQuote(_handler: QuoteHandler): () => void { return () => {}; }
}

/** Forex and metals, to replace Frankfurter's daily ECB fixings. */
export const createOandaProvider = (): PriceProvider =>
  new StubProvider("oanda", config.oandaEnabled, {
    OANDA_TOKEN: config.oandaToken,
    OANDA_ACCOUNT_ID: config.oandaAccountId,
  });

/** US equities and indices. */
export const createAlpacaProvider = (): PriceProvider =>
  new StubProvider("alpaca", config.alpacaEnabled, {
    ALPACA_KEY_ID: config.alpacaKeyId,
    ALPACA_SECRET: config.alpacaSecret,
  });
