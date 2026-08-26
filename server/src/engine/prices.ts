import { db, now, asBig, asBool } from "../db.js";
import { config } from "../config.js";
import { toScaled } from "../lib/money.js";
import { captureAlert } from "../lib/monitoring.js";
import { isQuoteFresh } from "../lib/quotes.js";

/**
 * Server-side market data. Fetching upstream here rather than in the browser
 * removes CORS issues, centralises rate limiting, keeps any future API key on
 * the server, and gives every client one consistent price to trade against.
 */
type Listener = (symbols: string[]) => void;
const listeners = new Set<Listener>();
export const onPriceUpdate = (fn: Listener) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (symbols: string[]) => listeners.forEach((fn) => { try { fn(symbols); } catch {} });

let upstreamHealthy = false;
let lastFetchAt: string | null = null;
/** When the current run of failures began — null while the feed is healthy. */
let unhealthySince: number | null = null;
/** Whether the current outage has already been escalated, so an hour of
 * downtime produces one alert rather than eighteen hundred. */
let outageReported = false;

export const feedStatus = () => ({
  healthy: upstreamHealthy,
  lastFetch: lastFetchAt,
  /** How long the upstream has been failing, in ms. 0 while healthy. */
  unhealthyForMs: unhealthySince === null ? 0 : Date.now() - unhealthySince,
  /** True once the outage is long enough to be an incident rather than a blip. */
  degraded: unhealthySince !== null && Date.now() - unhealthySince >= config.feedUnhealthyAlertMs,
  maxQuoteAgeMs: config.maxQuoteAgeMs,
  /** Which upstream last refused, and how. Without this a halted market is
   * indistinguishable from a bug, because the browser's own Binance feed keeps
   * the UI looking live. Carries no secrets — host and status only. */
  lastFailure: lastUpstreamFailure,
});

/**
 * A quote nobody has refreshed recently is not a price, it is a memory. The
 * platform will show it (better than a blank cell) but will not let anyone
 * trade against it — see engine/execution.ts and engine/matching.ts, which
 * both gate on this. One definition, used everywhere, so "how old is too old"
 * can never drift apart between the two.
 */
export const quoteIsFresh = (updatedAt: string | null | undefined): boolean =>
  isQuoteFresh(updatedAt, config.maxQuoteAgeMs);

/** Records the outcome of one upstream refresh cycle and escalates an outage
 * that has outlived a single cycle into a logged, reportable incident. */
function recordFeedOutcome(ok: boolean): void {
  if (ok) {
    if (unhealthySince !== null) {
      const downForMs = Date.now() - unhealthySince;
      // Only worth saying out loud if the outage was worth reporting.
      if (outageReported) {
        captureAlert("Price feed recovered", { scope: "engine.prices", extra: { downForMs }, level: "warning" });
      } else {
        console.log(`[prices] upstream recovered after ${downForMs}ms`);
      }
    }
    upstreamHealthy = true;
    lastFetchAt = now();
    unhealthySince = null;
    outageReported = false;
    return;
  }

  upstreamHealthy = false;
  if (unhealthySince === null) {
    // First failed cycle: a log line, not an alert — upstreams blip.
    unhealthySince = Date.now();
    console.warn(`[prices] upstream refresh failed — last good fetch ${lastFetchAt ?? "never"}`);
    return;
  }
  const downForMs = Date.now() - unhealthySince;
  if (!outageReported && downForMs >= config.feedUnhealthyAlertMs) {
    outageReported = true;
    captureAlert("Price feed unhealthy — quotes are no longer updating", {
      scope: "engine.prices",
      level: "error",
      extra: { downForMs, lastFetch: lastFetchAt, maxQuoteAgeMs: config.maxQuoteAgeMs },
    });
  }
}

const q = {
  active: db.prepare("SELECT * FROM instruments WHERE active = 1"),
  syntheticOnly: db.prepare(`
    SELECT i.symbol, p.price_scaled FROM instruments i
    JOIN price_snapshots p ON p.symbol = i.symbol
    WHERE i.active = 1 AND i.cg_id IS NULL AND i.fx_code IS NULL
  `),
  upsertFull: db.prepare(`
    INSERT INTO price_snapshots (symbol, price_scaled, change_24h, high_24h, low_24h, volume_24h, source, updated_at)
    VALUES (@symbol, @price, @change, @high, @low, @volume, @source, @updatedAt)
    ON CONFLICT(symbol) DO UPDATE SET
      price_scaled = excluded.price_scaled,
      change_24h   = excluded.change_24h,
      high_24h     = COALESCE(excluded.high_24h, price_snapshots.high_24h),
      low_24h      = COALESCE(excluded.low_24h, price_snapshots.low_24h),
      volume_24h   = COALESCE(excluded.volume_24h, price_snapshots.volume_24h),
      source       = excluded.source,
      updated_at   = excluded.updated_at
  `),
  // Price-only update: leaves 24h statistics untouched so a drift tick can
  // never overwrite real market data with zeros.
  upsertPrice: db.prepare(`
    INSERT INTO price_snapshots (symbol, price_scaled, change_24h, source, updated_at)
    VALUES (@symbol, @price, 0, @source, @updatedAt)
    ON CONFLICT(symbol) DO UPDATE SET
      price_scaled = excluded.price_scaled,
      source       = excluded.source,
      updated_at   = excluded.updated_at
  `),
  all: db.prepare("SELECT * FROM price_snapshots"),
  one: db.prepare(`
    SELECT i.*, p.price_scaled FROM instruments i
    LEFT JOIN price_snapshots p ON p.symbol = i.symbol WHERE i.symbol = ?
  `),
};

async function setPrice(symbol: string, priceScaled: bigint, extra: {
  change?: number | null; high?: bigint | null; low?: bigint | null;
  volume?: bigint | null; source: string;
}) {
  if (extra.change === undefined || extra.change === null) {
    await q.upsertPrice.run({ symbol, price: priceScaled, source: extra.source, updatedAt: now() });
    return;
  }
  await q.upsertFull.run({
    symbol, price: priceScaled, change: extra.change,
    high: extra.high ?? null, low: extra.low ?? null, volume: extra.volume ?? null,
    source: extra.source, updatedAt: now(),
  });
}

/**
 * Why the last upstream failure is remembered rather than swallowed:
 * a dead feed halts trading (see engine/execution.ts), and "trading is halted
 * but the chart looks live" is impossible to diagnose without knowing *which*
 * host refused and with what status. The browser gets its prices straight from
 * Binance, so the UI can look perfectly healthy while the server is being
 * refused — most notably HTTP 451, which is how Binance geo-blocks datacenter
 * regions it does not serve.
 */
export interface UpstreamFailure { host: string; status: number | null; detail: string; at: string }
let lastUpstreamFailure: UpstreamFailure | null = null;
export const lastFeedFailure = () => lastUpstreamFailure;

function noteFailure(url: string, status: number | null, detail: string): void {
  let host = url;
  try { host = new URL(url).host; } catch { /* keep the raw string */ }
  lastUpstreamFailure = { host, status, detail, at: now() };
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<any | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { accept: "application/json" } });
    if (!res.ok) {
      // 451 in particular is not a transient outage — it is a hard refusal
      // that will never clear by retrying from the same region.
      noteFailure(url, res.status, res.status === 451
        ? "Unavailable For Legal Reasons — this host geo-blocks the server's region"
        : res.statusText || `HTTP ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (e) {
    noteFailure(url, null, e instanceof Error ? e.message : "request failed");
    return null; // upstream down — callers keep the last known price
  } finally {
    clearTimeout(timer);
  }
}

/** Maps a Velora crypto symbol to its Binance market — mirrors the frontend's
 * `mapToBinance` (lib/binance.ts) exactly, so the server's own execution
 * price (used for order fills, TP/SL and liquidation) is drawn from the
 * *same exchange* the client displays. Before this, the client showed a
 * live Binance tick while the server still checked liquidation against an
 * 8s-stale CoinGecko quote — two different prices for the same instrument,
 * which is what made liquidation/order behaviour look "wrong" even though
 * the formula itself was correct. */
function mapToBinance(symbol: string, category: string): { market: "spot" | "futures"; binanceSymbol: string } | null {
  if (category === "SPOT" || category === "COMMODITY") return { market: "spot", binanceSymbol: symbol.toUpperCase() };
  if (category === "PERP") {
    const base = symbol.replace(/-PERP$/i, "").toUpperCase();
    if (!base) return null;
    return { market: "futures", binanceSymbol: `${base}USDT` };
  }
  return null;
}

interface BinanceTicker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  highPrice: string;
  lowPrice: string;
  volume: string;
  quoteVolume: string;
}

/** Real crypto quotes straight from Binance (spot + USDT-M futures 24h
 * tickers, batched), CoinGecko as a fallback only for whatever isn't
 * Binance-mappable, and FX rates (ECB via Frankfurter). */
export async function refreshUpstream(): Promise<string[]> {
  const instruments = ((await q.active.all()) as any[]).filter((i) => asBool(i.active));
  const touched: string[] = [];
  let ok = false;

  const withMapping = instruments
    .map((ins) => ({ ins, mapping: mapToBinance(ins.symbol, ins.category) }))
    .filter((x) => x.mapping);
  const spotWanted = withMapping.filter((x) => x.mapping!.market === "spot");
  const futuresWanted = withMapping.filter((x) => x.mapping!.market === "futures");
  const binanceOk = new Set<string>();

  if (spotWanted.length) {
    const symbolsParam = encodeURIComponent(JSON.stringify(spotWanted.map((x) => x.mapping!.binanceSymbol)));
    // api.binance.com is geo-blocked in some datacenter regions (it answers 451
    // there), which silently halted trading on a deploy whose browser clients
    // were meanwhile getting live prices straight from Binance. data-api.
    // binance.vision is Binance's own public market-data host, serves the same
    // payload shape, and is not region-restricted — so it is tried whenever the
    // primary returns nothing, whatever the reason.
    const rows =
      (await fetchJson(`https://api.binance.com/api/v3/ticker/24hr?symbols=${symbolsParam}`)) ??
      (await fetchJson(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${symbolsParam}`));
    if (Array.isArray(rows)) {
      const byBinanceSymbol = new Map((rows as BinanceTicker24h[]).map((r) => [r.symbol, r]));
      for (const { ins, mapping } of spotWanted) {
        const row = byBinanceSymbol.get(mapping!.binanceSymbol);
        if (!row) continue;
        await setPrice(ins.symbol, toScaled(Number(row.lastPrice)), {
          change: Number(row.priceChangePercent) || 0,
          high: toScaled(Number(row.highPrice)),
          low: toScaled(Number(row.lowPrice)),
          volume: toScaled(Math.round(Number(row.quoteVolume))),
          source: "BINANCE",
        });
        touched.push(ins.symbol);
        binanceOk.add(ins.symbol);
      }
      ok = ok || touched.length > 0;
    }
  }

  if (futuresWanted.length) {
    // No batch-by-symbols param on the futures endpoint — one call for the
    // whole board, then filter locally; still a single request either way.
    const rows = await fetchJson(`https://fapi.binance.com/fapi/v1/ticker/24hr`);
    if (Array.isArray(rows)) {
      const byBinanceSymbol = new Map((rows as BinanceTicker24h[]).map((r) => [r.symbol, r]));
      for (const { ins, mapping } of futuresWanted) {
        const row = byBinanceSymbol.get(mapping!.binanceSymbol);
        if (!row) continue;
        await setPrice(ins.symbol, toScaled(Number(row.lastPrice)), {
          change: Number(row.priceChangePercent) || 0,
          high: toScaled(Number(row.highPrice)),
          low: toScaled(Number(row.lowPrice)),
          volume: toScaled(Math.round(Number(row.quoteVolume))),
          source: "BINANCE",
        });
        touched.push(ins.symbol);
        binanceOk.add(ins.symbol);
      }
      ok = ok || touched.length > 0;
    }
  }

  // CoinGecko fallback: only for instruments that have a cg_id but Binance
  // didn't cover this cycle (mapping missing, or the Binance calls above
  // failed/timed out) — keeps the platform alive if Binance is unreachable.
  const needsFallback = instruments.filter((i) => i.cg_id && !binanceOk.has(i.symbol));
  const cgIds = [...new Set(needsFallback.map((i) => i.cg_id as string))];
  if (cgIds.length) {
    const rows = await fetchJson(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${cgIds.join(",")}&price_change_percentage=24h`
    );
    if (Array.isArray(rows)) {
      const byId = new Map(rows.map((r: any) => [r.id, r]));
      for (const ins of needsFallback) {
        const row: any = byId.get(ins.cg_id);
        if (!row?.current_price) continue;
        const basis = ins.category === "PERP" ? 1 + (Math.random() - 0.5) * 0.0006 : 1;
        await setPrice(ins.symbol, toScaled(row.current_price * basis), {
          change: row.price_change_percentage_24h ?? 0,
          high: row.high_24h ? toScaled(row.high_24h) : null,
          low: row.low_24h ? toScaled(row.low_24h) : null,
          volume: row.total_volume ? toScaled(Math.round(row.total_volume)) : null,
          source: "COINGECKO",
        });
        touched.push(ins.symbol);
      }
      ok = true;
    }
  }

  const fx = instruments.filter((i) => i.fx_code);
  if (fx.length) {
    const codes = [...new Set(fx.map((i) => i.fx_code as string))].join(",");
    const data = await fetchJson(`https://api.frankfurter.app/latest?from=USD&to=${codes}`);
    if (data?.rates) {
      for (const ins of fx) {
        const rate = data.rates[ins.fx_code];
        if (!rate) continue;
        // USDJPY is quoted directly; EURUSD/GBPUSD are the inverse of USD->X.
        const price = String(ins.symbol).startsWith("USD") ? rate : 1 / rate;
        await setPrice(ins.symbol, toScaled(price), { source: "ECB" });
        touched.push(ins.symbol);
      }
      ok = true;
    }
  }

  recordFeedOutcome(ok);
  if (touched.length) emit(touched);
  return touched;
}

/**
 * Instruments with no free upstream feed (CFDs) follow a bounded random walk so
 * the platform stays testable. They are stored with source = SYNTHETIC and the
 * API exposes that, so a modelled number is never presented as a real quote.
 */
export async function driftSynthetic(): Promise<string[]> {
  const touched: string[] = [];
  for (const row of (await q.syntheticOnly.all()) as any[]) {
    const current = asBig(row.price_scaled);
    if (current <= 0n) continue;
    const driftBps = BigInt(Math.round((Math.random() - 0.5) * 12)); // ±0.06%
    const next = current + (current * driftBps) / 10_000n;
    await setPrice(row.symbol, next > 0n ? next : current, { source: "SYNTHETIC" });
    touched.push(row.symbol);
  }
  if (touched.length) emit(touched);
  return touched;
}

export const allPrices = async () => (await q.all.all()) as any[];

/* ------------------------- candles (cached proxy) ------------------------- */
const TF_DAYS: Record<string, number> = { "1m": 1, "5m": 1, "15m": 1, "1H": 1, "4H": 7, "1D": 30, "1W": 90 };
interface Candle { t: number; o: string; h: string; l: string; c: string }
const cache = new Map<string, { at: number; real: boolean; data: Candle[] }>();
const TTL = 60_000;

export async function getCandles(symbol: string, tf: string) {
  const key = `${symbol}:${tf}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return { candles: hit.data, real: hit.real };

  const ins = (await q.one.get(symbol)) as any;
  if (!ins) return { candles: [], real: false };

  if (ins.cg_id) {
    const rows = await fetchJson(
      `https://api.coingecko.com/api/v3/coins/${ins.cg_id}/ohlc?vs_currency=usd&days=${TF_DAYS[tf] ?? 1}`
    );
    if (Array.isArray(rows) && rows.length) {
      const data: Candle[] = rows.slice(-80).map((r: number[]) => ({
        t: r[0], o: r[1].toFixed(8), h: r[2].toFixed(8), l: r[3].toFixed(8), c: r[4].toFixed(8),
      }));
      cache.set(key, { at: Date.now(), real: true, data });
      return { candles: data, real: true };
    }
  }

  const base = ins.price_scaled ? Number(asBig(ins.price_scaled)) / 1e8 : 100;
  const vol = base * 0.004;
  let v = base;
  const data: Candle[] = [];
  for (let i = 60; i > 0; i--) {
    const o = v;
    v = v + (Math.random() - 0.5) * vol;
    data.push({
      t: Date.now() - i * 60_000,
      o: o.toFixed(8),
      h: (Math.max(o, v) + Math.random() * vol * 0.3).toFixed(8),
      l: Math.max(Math.min(o, v) - Math.random() * vol * 0.3, 0.00000001).toFixed(8),
      c: v.toFixed(8),
    });
  }
  cache.set(key, { at: Date.now(), real: false, data });
  return { candles: data, real: false };
}

export function startPriceFeed() {
  refreshUpstream().catch(() => {});
  const a = setInterval(() => { refreshUpstream().catch(() => {}); }, config.priceRefreshMs);
  const b = setInterval(() => { driftSynthetic().catch(() => {}); }, 2500);
  return () => { clearInterval(a); clearInterval(b); };
}
