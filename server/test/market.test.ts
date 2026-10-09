import test from "node:test";
import assert from "node:assert/strict";
import { classify, Unclassified, isUsdtPair } from "../src/market/classify.js";
import { toScaledFromVenue } from "../src/market/binance.js";
import { PriceCache } from "../src/market/cache.js";
import { toScaled, toDecimalString } from "../src/lib/money.js";
import { config } from "../src/config.js";
import type { Quote } from "../src/market/types.js";

/**
 * The three things between a venue's JSON and money moving: what an
 * instrument is, what its price is exactly, and whether that price is still
 * allowed to be traded against.
 */

/* ----------------------------- classification ----------------------------- */

test("a token quoted in USDT is crypto", () => {
  assert.equal(classify({ base: "BTC", quote: "USDT", market: "spot" }), "crypto");
  assert.equal(classify({ base: "PEPE", quote: "USDT", market: "spot" }), "crypto");
  assert.equal(classify({ base: "BTC", quote: "USDT", market: "perp" }), "crypto");
});

test("gold is metals however it settles", () => {
  // PAXG settles on-chain and XAU does not; a desk pricing either is pricing
  // the same metal, and a client looking for gold looks in one place.
  assert.equal(classify({ base: "PAXG", quote: "USDT", market: "spot" }), "metals");
  assert.equal(classify({ base: "XAUT", quote: "USDT", market: "spot" }), "metals");
  assert.equal(classify({ base: "XAU", quote: "USD", market: "spot" }), "metals");
  assert.equal(classify({ base: "XAG", quote: "USD", market: "spot" }), "metals");
});

test("the explicit map beats the crypto default", () => {
  // The whole point of a map rather than a heuristic: PAXG is quoted in USDT
  // exactly like every token, and must not fall through to crypto.
  assert.notEqual(classify({ base: "PAXG", quote: "USDT", market: "spot" }), "crypto");
  assert.equal(classify({ base: "WTI", quote: "USDT", market: "perp" }), "commodities");
  assert.equal(classify({ base: "SPX", quote: "USD", market: "perp" }), "indices");
});

test("fiat against fiat is forex either way round", () => {
  assert.equal(classify({ base: "EUR", quote: "USD", market: "spot" }), "forex");
  assert.equal(classify({ base: "USD", quote: "JPY", market: "spot" }), "forex");
});

test("an unknown underlying is refused, not guessed", () => {
  // Null is a real answer: the sync parks the symbol and logs it rather than
  // filing it somewhere a trader would later assume had been checked.
  assert.equal(classify({ base: "WHEAT", quote: "GBP", market: "spot" }), null);
  assert.equal(classify({ base: "TSLA", quote: "USD", market: "spot" }), null);
});

test("unclassified symbols are collected by name, once each", () => {
  const seen = new Unclassified();
  seen.add("TSLAUSD", "TSLA", "USD");
  seen.add("TSLAUSD", "TSLA", "USD");
  seen.add("WHEATGBP", "WHEAT", "GBP");
  assert.equal(seen.size, 2);
  assert.deepEqual(seen.symbols(), ["TSLAUSD", "WHEATGBP"]);
  assert.ok(seen.describe().some((line) => line.includes("TSLA/USD")));
});

test("spot carries USDT pairs only", () => {
  assert.equal(isUsdtPair("USDT"), true);
  assert.equal(isUsdtPair("usdt"), true);
  assert.equal(isUsdtPair("BTC"), false);
  assert.equal(isUsdtPair("BUSD"), false);
});

/* ------------------------------ normalisation ----------------------------- */

test("a venue price becomes a scaled BigInt, exactly", () => {
  assert.equal(toScaledFromVenue("63250.12"), toScaled("63250.12"));
  assert.equal(toScaledFromVenue("1"), 100_000_000n);
  assert.equal(toScaledFromVenue("0.00000001"), 1n);
});

test("the eighth decimal survives, where a float would not", () => {
  // 0.1 + 0.2 territory: this is the exact case a Number round trip loses.
  const scaled = toScaledFromVenue("0.00000007");
  assert.equal(scaled, 7n);
  assert.equal(toDecimalString(scaled!, 8), "0.00000007");
});

test("precision past the scale is truncated, never rounded up", () => {
  // Rounding up would nudge a price into a level that did not trade, which
  // on a stop or a liquidation is the difference between firing and not.
  assert.equal(toScaledFromVenue("1.999999999"), 199_999_999n);
  assert.equal(toScaledFromVenue("0.000000019"), 1n);
});

test("exponent notation is handled, because venues send it for small prices", () => {
  assert.equal(toScaledFromVenue("1.5E-7"), 15n);
  assert.equal(toScaledFromVenue("1e-8"), 1n);
});

test("junk is null rather than zero", () => {
  // Zero is a price. Null is "there was no price", and the caller drops the
  // tick instead of marking an instrument as worthless.
  assert.equal(toScaledFromVenue(""), null);
  assert.equal(toScaledFromVenue("abc"), null);
  assert.equal(toScaledFromVenue("12.34.56"), null);
});

/* ------------------------------- stale guard ------------------------------ */

const quoteAt = (ts: number, symbol = "BTCUSDT"): Quote => ({
  symbol, bid: null, ask: null, last: toScaled("50000"), change24hPct: 0, volume24h: null, ts,
});

test("a fresh quote is tradeable and a stale one is not", () => {
  const cache = new PriceCache();
  const now = Date.now();
  cache.set(quoteAt(now));
  assert.ok(cache.tradeable("BTCUSDT", now));
  assert.equal(cache.stale("BTCUSDT", now), false);

  const past = now + config.maxQuoteAgeMs + 1;
  assert.equal(cache.tradeable("BTCUSDT", past), undefined);
  assert.equal(cache.stale("BTCUSDT", past), true);
});

test("a stale symbol is absent from the marks the engine trades on", () => {
  const cache = new PriceCache();
  const now = Date.now();
  cache.set(quoteAt(now, "FRESH"));
  cache.set(quoteAt(now - config.maxQuoteAgeMs - 1, "OLD"));

  const marks = cache.tradeableMarks(now);
  assert.ok(marks.has("FRESH"));
  assert.equal(marks.has("OLD"), false, "a stale symbol must not reach the matching loop");
  // But it is still readable, because showing the last print beats a blank.
  assert.ok(cache.get("OLD"));
});

test("a symbol nobody has quoted is stale, not fresh-by-default", () => {
  const cache = new PriceCache();
  assert.equal(cache.stale("NEVERSEEN"), true);
  assert.equal(cache.tradeable("NEVERSEEN"), undefined);
});

test("an older tick cannot overwrite a newer one", () => {
  // Two streams carry the same symbol and reconnects reorder them; the slower
  // one arriving late must not roll the price back.
  const cache = new PriceCache();
  const now = Date.now();
  cache.set({ ...quoteAt(now), last: toScaled("60000") });
  cache.set({ ...quoteAt(now - 5_000), last: toScaled("50000") });
  assert.equal(cache.get("BTCUSDT")?.last, toScaled("60000"));
});

test("only changed symbols come back from a cursor", () => {
  const cache = new PriceCache();
  const now = Date.now();
  cache.set(quoteAt(now, "A"));
  cache.set(quoteAt(now, "B"));

  const first = cache.changedSince(0);
  assert.equal(first.quotes.length, 2);

  // Nothing moved since: a frame built from this cursor sends nothing, which
  // is what keeps a thousand idle symbols off the socket.
  assert.equal(cache.changedSince(first.seq).quotes.length, 0);

  cache.set(quoteAt(now + 1, "A"));
  const second = cache.changedSince(first.seq);
  assert.deepEqual(second.quotes.map((q) => q.symbol), ["A"]);
});
