import { db, now } from "../db.js";
import { config } from "../config.js";
import { priceCache } from "./cache.js";
import { createBinanceSpotProvider, createBinanceFuturesProvider } from "./binance.js";
import { createOandaProvider, createAlpacaProvider } from "./stubs.js";
import { startCatalogSync } from "./catalog.js";
import { publishProviderStatus } from "./status.js";
import type { PriceProvider, Quote } from "./types.js";

/**
 * Wires the providers to the cache, and the cache to everything else.
 *
 * The cache is the single read point: the matching engine, the order path and
 * the websocket broadcast all take prices from it rather than from a table.
 * price_snapshots is still written, but on a timer and as a record -- it is
 * what survives a restart and what the API falls back to before the first
 * tick arrives, not what the engine trades against.
 */

const q = {
  /** Which venue symbol maps to which Velora symbol, for the providers. */
  routes: db.prepare(
    "SELECT symbol, provider_symbol, market FROM instruments WHERE provider = 'BINANCE' AND status = 'TRADING'"
  ),
  snapshot: db.prepare(`
    INSERT INTO price_snapshots (symbol, price_scaled, change_24h, volume_24h, source, updated_at)
    VALUES (@symbol, @price, @change, @volume, @source, @ts)
    ON CONFLICT(symbol) DO UPDATE SET
      price_scaled = excluded.price_scaled, change_24h = excluded.change_24h,
      volume_24h = excluded.volume_24h, source = excluded.source, updated_at = excluded.updated_at
  `),
};

/** venue symbol -> Velora symbol, per market. Rebuilt whenever the catalogue
 * changes, which is rarely; a miss simply means the provider ignores a symbol
 * the platform does not list. */
const spotRoutes = new Map<string, string>();
const perpRoutes = new Map<string, string>();

export async function reloadRoutes(): Promise<{ spot: number; perp: number }> {
  const rows = (await q.routes.all()) as
    { symbol: string; provider_symbol: string | null; market: string }[];
  spotRoutes.clear();
  perpRoutes.clear();
  for (const row of rows) {
    const venue = (row.provider_symbol ?? row.symbol).toUpperCase();
    (row.market === "perp" ? perpRoutes : spotRoutes).set(venue, row.symbol);
  }
  return { spot: spotRoutes.size, perp: perpRoutes.size };
}

const providers: PriceProvider[] = [];

export const marketProviders = (): PriceProvider[] => providers;

/** Pushes provider health to market/status.ts, which is what the routes
 * read — they must not import this module, because importing it is what
 * starts the providers. */
const publishStatus = () =>
  publishProviderStatus(providers.map((p) => ({ name: p.name, state: p.state(), reason: p.reason() })));

/**
 * Persists what the cache holds, at a fraction of the rate quotes arrive.
 *
 * Thousands of symbols ticking several times a second is far more than a
 * ledger database should be asked to absorb, and nothing reads these rows on
 * the hot path any more. Once every few seconds is enough for the purpose
 * they still serve: a price to show immediately after a restart.
 */
async function persistSnapshot(): Promise<void> {
  const ts = now();
  for (const quote of priceCache.snapshot()) {
    await q.snapshot.run({
      symbol: quote.symbol,
      price: quote.last,
      change: quote.change24hPct,
      volume: quote.volume24h,
      source: "BINANCE",
      ts,
    });
  }
}

/** Warms the cache from the last persisted snapshot, so a restart does not
 * halt every market until the first tick lands. Rows already too old to trade
 * against stay too old -- the staleness rule is applied on read, not here. */
async function warmFromSnapshots(): Promise<number> {
  const rows = (await db.prepare(
    "SELECT symbol, price_scaled, change_24h, volume_24h, updated_at FROM price_snapshots"
  ).all()) as any[];
  let warmed = 0;
  for (const row of rows) {
    const ts = Date.parse(row.updated_at);
    if (!Number.isFinite(ts)) continue;
    const quote: Quote = {
      symbol: row.symbol,
      bid: null, ask: null,
      last: BigInt(row.price_scaled),
      change24hPct: Number(row.change_24h ?? 0),
      volume24h: row.volume_24h === null ? null : BigInt(row.volume_24h),
      ts,
    };
    priceCache.set(quote);
    warmed += 1;
  }
  return warmed;
}

export async function startMarketData(): Promise<() => void> {
  const stops: Array<() => void> = [];

  const warmed = await warmFromSnapshots();
  const routes = await reloadRoutes();
  console.log(`[market] warmed ${warmed} quotes, routing ${routes.spot} spot and ${routes.perp} perp symbols`);

  if (config.marketStreamsEnabled) {
    providers.push(
      createBinanceSpotProvider((venue) => spotRoutes.get(venue) ?? null),
      createBinanceFuturesProvider((venue) => perpRoutes.get(venue) ?? null),
    );
  }
  // Registered either way: a disabled stub reports "stopped", which is a
  // different and more useful thing to see on the health endpoint than
  // nothing at all.
  providers.push(createOandaProvider(), createAlpacaProvider());

  for (const provider of providers) {
    provider.onQuote((quote) => priceCache.set(quote));
    await provider.start();
    stops.push(() => provider.stop());
  }

  publishStatus();
  const persistTimer = setInterval(() => { persistSnapshot().catch(() => {}); }, 5_000);
  stops.push(() => clearInterval(persistTimer));
  const statusTimer = setInterval(publishStatus, 5_000);
  stops.push(() => clearInterval(statusTimer));

  if (config.marketStreamsEnabled) {
    stops.push(startCatalogSync());
    // The catalogue grows; the routing table has to follow it or newly listed
    // symbols stream in and get dropped as unknown.
    const routeTimer = setInterval(() => { reloadRoutes().catch(() => {}); }, 60_000);
    stops.push(() => clearInterval(routeTimer));
  }

  return () => stops.forEach((stop) => { try { stop(); } catch { /* shutting down */ } });
}

export { priceCache } from "./cache.js";
