import test from "node:test";
import assert from "node:assert/strict";
import { toScaled, toDecimalString } from "../src/lib/money.js";
import { feeFor } from "../src/engine/risk.js";
import { computeExchange, QUOTE_PRICE } from "../src/lib/spotMath.js";

/**
 * The spot wallet's arithmetic. Buying an asset, selling it and swapping one
 * for another are the same calculation with USD as the pivot, so what is
 * asserted here is that they stay the same calculation — and that the
 * quantities it produces are ones the wallet can actually pay out.
 */

const P = (s: string) => toScaled(s);
const S = (v: bigint, d = 8) => toDecimalString(v, d);

const BTC = P("60000");
const ETH = P("3000");

test("buying spends dollars and receives the asset, less the fee", () => {
  const r = computeExchange({ fromQty: P("6000"), fromPrice: QUOTE_PRICE, toPrice: BTC });
  assert.equal(S(r.grossUsd, 2), "6000.00");
  // 4bps of $6000 = $2.40, so $5997.60 actually converts.
  assert.equal(S(r.feeUsd, 2), "2.40");
  assert.equal(r.netUsd, r.grossUsd - r.feeUsd);
  assert.equal(S(r.toQty), "0.09996000"); // 5997.60 / 60000
});

test("selling gives up the asset and receives dollars, less the fee", () => {
  const r = computeExchange({ fromQty: P("0.1"), fromPrice: BTC, toPrice: QUOTE_PRICE });
  assert.equal(S(r.grossUsd, 2), "6000.00");
  assert.equal(S(r.feeUsd, 2), "2.40");
  assert.equal(S(r.toQty, 2), "5997.60");
});

test("a USD leg is passed through untouched, never round-tripped via a price", () => {
  // The pivot multiplies then divides by SCALE, which is lossy in integer
  // arithmetic; the identity path is what keeps a dollar amount exact.
  const big = P("123456789.12345678");
  const r = computeExchange({ fromQty: big, fromPrice: QUOTE_PRICE, toPrice: QUOTE_PRICE });
  assert.equal(r.grossUsd, big);
  assert.equal(r.toQty, big - feeFor(big));
});

test("asset to asset converts through USD and charges one fee, not two", () => {
  const direct = computeExchange({ fromQty: P("1"), fromPrice: BTC, toPrice: ETH });
  assert.equal(S(direct.grossUsd, 2), "60000.00");
  assert.equal(S(direct.feeUsd, 2), "24.00");
  assert.equal(S(direct.toQty), "19.99200000"); // 59976 / 3000

  // Going the long way round — sell to USD, then buy — pays the fee twice and
  // must therefore come out strictly worse. That difference is the whole
  // reason /convert exists as its own operation.
  const leg1 = computeExchange({ fromQty: P("1"), fromPrice: BTC, toPrice: QUOTE_PRICE });
  const leg2 = computeExchange({ fromQty: leg1.toQty, fromPrice: QUOTE_PRICE, toPrice: ETH });
  assert.ok(leg2.toQty < direct.toQty);
});

test("the fee is the platform's own taker rate, not a second copy of it", () => {
  for (const usd of ["1", "250.75", "10000", "9999999.99"]) {
    const r = computeExchange({ fromQty: P(usd), fromPrice: QUOTE_PRICE, toPrice: BTC });
    assert.equal(r.feeUsd, feeFor(P(usd)));
  }
});

test("rate is what one unit actually bought, fee included", () => {
  const r = computeExchange({ fromQty: P("2"), fromPrice: BTC, toPrice: ETH });
  // 2 BTC -> $120000, less $48 fee -> $119952 -> 39.984 ETH, so 19.992 per BTC.
  assert.equal(S(r.toQty), "39.98400000");
  assert.equal(S(r.rate), "19.99200000");
});

test("nonsense inputs produce nothing rather than a negative payout", () => {
  const zero = { grossUsd: 0n, feeUsd: 0n, netUsd: 0n, toQty: 0n, rate: 0n };
  assert.deepEqual(computeExchange({ fromQty: 0n, fromPrice: BTC, toPrice: ETH }), zero);
  assert.deepEqual(computeExchange({ fromQty: P("-1"), fromPrice: BTC, toPrice: ETH }), zero);
  // A missing or nonsensical quote must not become a free asset: with no
  // price there is no exchange, and the caller refuses the trade.
  assert.deepEqual(computeExchange({ fromQty: P("1"), fromPrice: 0n, toPrice: ETH }), zero);
  assert.deepEqual(computeExchange({ fromQty: P("1"), fromPrice: BTC, toPrice: 0n }), zero);
});

test("dust rounds to zero received rather than to a rounding-error windfall", () => {
  // One cent of a $60k asset is 166 satoshi; after the fee it is still
  // positive, so it fills. The caller's job is only to refuse an outright zero.
  const dust = computeExchange({ fromQty: P("0.01"), fromPrice: QUOTE_PRICE, toPrice: BTC });
  assert.ok(dust.toQty > 0n);
  // A millionth of a cent buys nothing at all, and says so.
  const nothing = computeExchange({ fromQty: 1n, fromPrice: QUOTE_PRICE, toPrice: BTC });
  assert.equal(nothing.toQty, 0n);
});

test("a round trip never returns more than it started with", () => {
  // The invariant that matters most: fees mean the wallet cannot be pumped by
  // bouncing an asset back and forth.
  let usd = P("10000");
  for (let i = 0; i < 5; i++) {
    const buy = computeExchange({ fromQty: usd, fromPrice: QUOTE_PRICE, toPrice: BTC });
    const sell = computeExchange({ fromQty: buy.toQty, fromPrice: BTC, toPrice: QUOTE_PRICE });
    assert.ok(sell.toQty < usd, `round trip ${i} produced ${S(sell.toQty, 2)} from ${S(usd, 2)}`);
    usd = sell.toQty;
  }
});

test("value in equals value out, to the cent, minus the fee", () => {
  // What the wallet gives up and what it receives have to reconcile in USD,
  // or the spot balances stop adding up to the account total shown on screen.
  const r = computeExchange({ fromQty: P("3.5"), fromPrice: ETH, toPrice: BTC });
  const receivedUsd = (r.toQty * BTC) / 100_000_000n;
  const givenUsd = (P("3.5") * ETH) / 100_000_000n;
  assert.equal(S(givenUsd, 2), "10500.00");
  // Rounding down the received quantity can only ever lose fractions of a
  // cent, never gain any.
  assert.ok(receivedUsd <= givenUsd - r.feeUsd);
  assert.ok(givenUsd - r.feeUsd - receivedUsd < P("0.01"));
});
