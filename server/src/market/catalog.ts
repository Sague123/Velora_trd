import { db, now } from "../db.js";
import { config } from "../config.js";
import { captureError } from "../lib/monitoring.js";
import { classify, isUsdtPair, Unclassified } from "./classify.js";
import { toScaledFromVenue } from "./binance.js";
import type { CatalogEntry, Market } from "./types.js";

/**
 * Keeps `instruments` in step with what the venue actually trades.
 *
 * Runs at boot and every few hours. It never deletes: six tables reference
 * instruments(symbol) by foreign key, and a client's closed trade from last
 * year has to keep resolving to the thing it was a trade in. A delisting is a
 * status change, and a relisting changes it back.
 *
 * A symbol this cannot categorise is parked rather than guessed at -- see
 * classify.ts for why -- and reported by name at the end of the run.
 */

const q = {
  upsert: db.prepare(`
    INSERT INTO instruments (symbol, display_name, category, market, provider, provider_symbol,
                             base, quote, tick_size, step_size, min_qty, max_leverage,
                             price_decimals, status, trading_hours, updated_at)
    VALUES (@symbol, @displayName, @category, @market, @provider, @providerSymbol,
            @base, @quote, @tickSize, @stepSize, @minQty, @maxLeverage,
            @priceDecimals, @status, @tradingHours, @ts)
    ON CONFLICT(symbol) DO UPDATE SET
      -- display_name and max_leverage are deliberately NOT overwritten: an
      -- admin may have set a house limit or a friendlier name, and a routine
      -- catalogue refresh must not undo that twice a day.
      category        = excluded.category,
      market          = excluded.market,
      provider        = excluded.provider,
      provider_symbol = excluded.provider_symbol,
      base            = excluded.base,
      quote           = excluded.quote,
      tick_size       = excluded.tick_size,
      step_size       = excluded.step_size,
      min_qty         = excluded.min_qty,
      price_decimals  = excluded.price_decimals,
      status          = excluded.status,
      trading_hours   = excluded.trading_hours,
      updated_at      = excluded.updated_at
  `),
  /** Everything this provider owns, to spot what the venue stopped listing. */
  ownedBy: db.prepare(
    "SELECT symbol, provider_symbol, market, status FROM instruments WHERE provider = ?"
  ),
  delist: db.prepare("UPDATE instruments SET status = 'DELISTED', updated_at = ? WHERE symbol = ?"),
  counts: db.prepare(`
    SELECT category, market, COUNT(*) AS n FROM instruments
    WHERE status = 'TRADING' GROUP BY category, market ORDER BY category, market
  `),
};

/* ----------------------------- venue payloads ----------------------------- */

interface BinanceFilter { filterType: string; tickSize?: string; stepSize?: string; minQty?: string }
interface BinanceSymbol {
  symbol: string;
  status: string;
  baseAsset: string;
  quoteAsset: string;
  filters: BinanceFilter[];
  /** USDT-M futures only. */
  contractType?: string;
  /** Present on futures symbols; absent on spot. */
  pricePrecision?: number;
  quantityPrecision?: number;
  underlyingType?: string;
  underlyingSubType?: string[];
}

const filterOf = (symbol: BinanceSymbol, type: string): BinanceFilter | undefined =>
  symbol.filters?.find((f) => f.filterType === type);

/** Decimal places implied by a tick size: 0.01 -> 2, 0.00001 -> 5. Driven by
 * the venue's own tick rather than a guess from magnitude, so a price is
 * never displayed to finer precision than it can actually trade at. */
function decimalsFromTick(tick: bigint | null): number {
  if (!tick || tick <= 0n) return 2;
  let decimals = 0;
  let value = tick;
  const ten = 10n;
  // 1e8 scaling: a tick of 0.01 is 1_000_000n.
  let unit = 100_000_000n;
  while (unit > value && decimals < 8) {
    unit /= ten;
    decimals += 1;
  }
  return decimals;
}

export interface SyncResult {
  provider: string;
  upserted: number;
  delisted: number;
  unclassified: string[];
  error: string | null;
}

async function fetchJson(url: string): Promise<any | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { accept: "application/json" } });
    if (res.status === 451 || res.status === 403) {
      // The one failure worth naming precisely: everything downstream looks
      // like "no instruments" and nobody would guess why.
      throw new Error(
        `HTTP ${res.status} — region blocked, or an egress proxy refused the request to ${new URL(url).host}`
      );
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Reads one Binance exchangeInfo endpoint into catalogue entries. */
function toEntries(
  symbols: BinanceSymbol[],
  market: Market,
  unclassified: Unclassified
): CatalogEntry[] {
  const entries: CatalogEntry[] = [];

  for (const raw of symbols) {
    const base = raw.baseAsset?.toUpperCase();
    const quote = raw.quoteAsset?.toUpperCase();
    if (!base || !quote) continue;

    // Spot carries USDT pairs only: that is what the platform prices and
    // settles in, and a BTC-quoted pair would need a second numeraire
    // everywhere money is touched.
    if (market === "spot" && !isUsdtPair(quote)) continue;
    // Futures: linear perpetuals only. Quarterlies expire, and an instrument
    // that stops existing on a date is a different product from one that does
    // not — not something to slip into the same catalogue unannounced.
    if (market === "perp" && raw.contractType && raw.contractType !== "PERPETUAL") continue;

    const category = classify({ base, quote, market });
    if (!category) {
      unclassified.add(raw.symbol, base, quote);
      continue;
    }

    const tickSize = toScaledFromVenue(filterOf(raw, "PRICE_FILTER")?.tickSize ?? "");
    const lot = filterOf(raw, market === "perp" ? "LOT_SIZE" : "LOT_SIZE");

    entries.push({
      // Perps get Velora's own key so they cannot collide with the spot pair
      // of the same name — see the instruments table comment in db.ts.
      symbol: market === "perp" ? `${base}-PERP` : raw.symbol.toUpperCase(),
      displayName: market === "perp" ? `${base} Perpetual` : `${base}/${quote}`,
      category,
      market,
      provider: "BINANCE",
      providerSymbol: raw.symbol.toUpperCase(),
      base,
      quote,
      tickSize,
      stepSize: toScaledFromVenue(lot?.stepSize ?? ""),
      minQty: toScaledFromVenue(lot?.minQty ?? ""),
      // Left to the admin: the venue's own leverage tiers are per-account and
      // not in exchangeInfo, and a house limit is a risk decision anyway.
      maxLeverage: null,
      priceDecimals: decimalsFromTick(tickSize),
      status: raw.status === "TRADING" ? "TRADING" : raw.status === "BREAK" ? "BREAK" : "HALT",
      // Crypto never closes. A provider whose markets do will set this.
      tradingHours: null,
    });
  }

  return entries;
}

async function writeEntries(entries: CatalogEntry[]): Promise<number> {
  const ts = now();
  let written = 0;
  for (const entry of entries) {
    await q.upsert.run({ ...entry, ts });
    written += 1;
  }
  return written;
}

/** Marks everything this provider used to list and no longer does. */
async function delistMissing(provider: string, seen: Set<string>): Promise<number> {
  const rows = (await q.ownedBy.all(provider)) as
    { symbol: string; provider_symbol: string | null; market: string; status: string }[];
  const ts = now();
  let delisted = 0;
  for (const row of rows) {
    if (row.status === "DELISTED") continue;
    if (seen.has(row.symbol)) continue;
    await q.delist.run(ts, row.symbol);
    delisted += 1;
  }
  return delisted;
}

export async function syncBinanceCatalog(): Promise<SyncResult> {
  const unclassified = new Unclassified();
  const result: SyncResult = {
    provider: "BINANCE", upserted: 0, delisted: 0, unclassified: [], error: null,
  };

  try {
    const [spot, futures] = await Promise.all([
      fetchJson(`${config.binanceSpotRest}/api/v3/exchangeInfo`),
      fetchJson(`${config.binanceFuturesRest}/fapi/v1/exchangeInfo`),
    ]);

    const entries = [
      ...toEntries((spot?.symbols ?? []) as BinanceSymbol[], "spot", unclassified),
      ...toEntries((futures?.symbols ?? []) as BinanceSymbol[], "perp", unclassified),
    ];
    if (entries.length === 0) {
      throw new Error("exchangeInfo returned no usable symbols");
    }

    result.upserted = await writeEntries(entries);
    result.delisted = await delistMissing("BINANCE", new Set(entries.map((e) => e.symbol)));
    result.unclassified = unclassified.describe();

    console.log(
      `[catalog] Binance: ${result.upserted} instruments, ${result.delisted} delisted` +
      (unclassified.size ? `, ${unclassified.size} unclassified` : "")
    );
    if (unclassified.size) {
      // By name, so filling the gap in classify.ts's map is a matter of
      // reading this line rather than diffing the venue by hand.
      console.warn(`[catalog] unclassified symbols: ${unclassified.describe().join(", ")}`);
    }
  } catch (e) {
    result.error = (e as Error).message;
    // Not fatal. The catalogue already in the database stays exactly as it
    // was, which is the right outcome: an unreachable venue is not a reason
    // to stop trading the instruments already listed.
    console.error(`[catalog] Binance sync failed: ${result.error}`);
    captureError(e, { scope: "market.catalog" });
  }

  return result;
}

/** Live counts, for the health endpoint and the summary a deploy prints. */
export async function catalogCounts(): Promise<{ category: string; market: string; n: number }[]> {
  return ((await q.counts.all()) as any[]).map((r) => ({
    category: r.category, market: r.market, n: Number(r.n),
  }));
}

export function startCatalogSync(): () => void {
  syncBinanceCatalog().catch(() => {});
  const timer = setInterval(() => { syncBinanceCatalog().catch(() => {}); }, config.catalogSyncMs);
  return () => clearInterval(timer);
}
