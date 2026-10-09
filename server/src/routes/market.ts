import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, asBig, asBigOrNull, asNum } from "../db.js";
import { out } from "../lib/money.js";
import { priceCache } from "../market/cache.js";
import { marketStatus, catalogCountsCached } from "../market/status.js";
import { CATEGORIES } from "../market/types.js";
import { leverageCap } from "../engine/risk.js";

/**
 * Browsing the catalogue.
 *
 * Separate from routes/trading.ts's `/instruments`, which returns everything
 * at once. That was fine for eighteen instruments and is not for thousands:
 * this one pages, filters and searches, and the quote on each row comes from
 * the in-memory cache rather than a join, so a page costs one indexed query
 * and no price lookup at all.
 */

const q = {
  byId: db.prepare("SELECT * FROM instruments WHERE symbol = ?"),
  categoryCounts: db.prepare(`
    SELECT category, COUNT(*) AS n FROM instruments
    WHERE status = 'TRADING' GROUP BY category
  `),
};

/** Shapes one row, with its live quote folded in. */
function present(row: any) {
  const quote = priceCache.get(row.symbol);
  const decimals = asNum(row.price_decimals);
  // Stale is a property of the quote, not of the instrument: the row stays
  // listed and the last price stays visible, the UI just says it cannot be
  // traded. See tradeableMark() in engine/execution.ts for why that halt is
  // the policy rather than hiding the instrument.
  const stale = priceCache.stale(row.symbol);
  return {
    symbol: row.symbol,
    name: row.display_name,
    category: row.category,
    market: row.market,
    provider: row.provider,
    providerSymbol: row.provider_symbol,
    base: row.base,
    quote: row.quote,
    tickSize: out(asBigOrNull(row.tick_size), 8),
    stepSize: out(asBigOrNull(row.step_size), 8),
    minQty: out(asBigOrNull(row.min_qty), 8),
    maxLeverage: leverageCap(row),
    priceDecimals: decimals,
    status: row.status,
    tradingHours: row.trading_hours,
    price: quote ? out(quote.last, decimals) : null,
    bid: quote?.bid ? out(quote.bid, decimals) : null,
    ask: quote?.ask ? out(quote.ask, decimals) : null,
    change24h: quote?.change24hPct ?? 0,
    volume24h: quote?.volume24h ? out(quote.volume24h, 0) : null,
    updatedAt: quote ? new Date(quote.ts).toISOString() : null,
    stale,
    tradeable: !!quote && !stale && row.status === "TRADING",
  };
}

export default async function marketRoutes(app: FastifyInstance) {
  app.get("/instruments/browse", async (req) => {
    const p = z.object({
      category: z.enum(CATEGORIES as [string, ...string[]]).optional(),
      market: z.enum(["spot", "perp"]).optional(),
      /** Substring of the symbol or the display name. */
      q: z.string().trim().max(40).optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      /** Delisted instruments are excluded unless asked for: they exist so
       * history resolves, not to be browsed. */
      includeDelisted: z.enum(["true", "false"]).default("false"),
    }).parse(req.query);

    const clauses: string[] = [];
    const args: Record<string, unknown> = {};
    if (p.includeDelisted !== "true") clauses.push("status <> 'DELISTED'");
    if (p.category) { clauses.push("category = @category"); args.category = p.category; }
    if (p.market) { clauses.push("market = @market"); args.market = p.market; }
    if (p.q) {
      // Both columns, because a trader types either "BTC" or "Bitcoin".
      clauses.push("(symbol ILIKE @search OR display_name ILIKE @search)");
      args.search = `%${p.q}%`;
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    args.limit = p.limit;
    args.offset = (p.page - 1) * p.limit;

    const total = asNum(((await db.prepare(
      `SELECT COUNT(*) AS n FROM instruments ${where}`
    ).get(args)) as any).n);
    const rows = (await db.prepare(`
      SELECT * FROM instruments ${where}
      ORDER BY category, market, symbol LIMIT @limit OFFSET @offset
    `).all(args)) as any[];

    return {
      total, page: p.page, limit: p.limit,
      instruments: rows.map(present),
    };
  });

  /** Counts per category, for the tabs above the watchlist. One query, so the
   * UI does not page the whole catalogue to find out how big it is. */
  app.get("/instruments/counts", async () => {
    const rows = (await q.categoryCounts.all()) as any[];
    const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c, 0]));
    let total = 0;
    for (const row of rows) {
      byCategory[row.category] = asNum(row.n);
      total += asNum(row.n);
    }
    return { total, byCategory, catalog: await catalogCountsCached() };
  });

  /** A price snapshot for an explicit list. Read straight from the cache. */
  app.get("/quotes", async (req) => {
    const p = z.object({
      symbols: z.string().trim().min(1).max(4000),
    }).parse(req.query);

    const wanted = [...new Set(
      p.symbols.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    )].slice(0, 500);

    const quotes = wanted.map((symbol) => {
      const quote = priceCache.get(symbol);
      if (!quote) return { symbol, price: null, stale: true };
      return {
        symbol,
        price: out(quote.last, 8),
        bid: quote.bid ? out(quote.bid, 8) : null,
        ask: quote.ask ? out(quote.ask, 8) : null,
        change24h: quote.change24hPct,
        volume24h: quote.volume24h ? out(quote.volume24h, 0) : null,
        ts: quote.ts,
        stale: priceCache.stale(symbol),
      };
    });

    return { quotes, feed: marketStatus() };
  });
}
