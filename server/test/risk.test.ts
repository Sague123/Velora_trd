import test from "node:test";
import assert from "node:assert/strict";
import { toScaled, toDecimalString, mul } from "../src/lib/money.js";
import { config } from "../src/config.js";
import { isQuoteFresh } from "../src/lib/quotes.js";
import {
  notional, marginFor, feeFor, pnlFor, liquidationPrice, maxSafeLeverage,
  isLiquidated, shouldFill, exitReason,
} from "../src/engine/risk.js";

/**
 * risk.ts decides how much margin a trade costs, what it is worth right now,
 * and when the house takes the position away. Every one of those is money
 * moving, so the invariants live here as executable statements rather than as
 * comments that can quietly stop being true.
 */

const P = (s: string) => toScaled(s);

test("notional is qty x price", () => {
  assert.equal(notional(P("2"), P("30000")), P("60000"));
  assert.equal(notional(P("0.5"), P("30000")), P("15000"));
  assert.equal(notional(0n, P("30000")), 0n);
});

test("margin is notional / leverage and shrinks as leverage rises", () => {
  const n = P("60000");
  assert.equal(marginFor(n, 1), P("60000"));
  assert.equal(marginFor(n, 10), P("6000"));
  assert.equal(marginFor(n, 3), 2_000_000_000_000n); // 20000.00000000
  // Nonsense leverage is clamped to 1x rather than producing a free position.
  assert.equal(marginFor(n, 0), n);
  assert.equal(marginFor(n, -5), n);
  assert.equal(marginFor(n, 2.9), marginFor(n, 2)); // truncated, never rounded up
});

test("fee is the configured taker rate on notional", () => {
  assert.equal(feeFor(P("10000")), P("4")); // 4 bps
  assert.equal(feeFor(0n), 0n);
  assert.equal(config.takerFeeBps, 4);
});

test("pnl is signed by side and symmetric between long and short", () => {
  const qty = P("2"), entry = P("30000"), up = P("31000"), down = P("29000");
  assert.equal(pnlFor("BUY", qty, entry, up), P("2000"));
  assert.equal(pnlFor("BUY", qty, entry, down), P("-2000"));
  assert.equal(pnlFor("SELL", qty, entry, up), P("-2000"));
  assert.equal(pnlFor("SELL", qty, entry, down), P("2000"));
  assert.equal(pnlFor("BUY", qty, entry, entry), 0n);
  // A long and a short of the same size are exactly each other's mirror.
  assert.equal(pnlFor("BUY", qty, entry, up) + pnlFor("SELL", qty, entry, up), 0n);
});

test("unleveraged positions have no liquidation price", () => {
  assert.equal(liquidationPrice("BUY", P("30000"), 1), null);
  assert.equal(liquidationPrice("SELL", P("30000"), 1), null);
});

test("liquidation sits below entry for a long and above it for a short", () => {
  const entry = P("30000");
  const long = liquidationPrice("BUY", entry, 10)!;
  const short = liquidationPrice("SELL", entry, 10)!;
  assert.ok(long < entry);
  assert.ok(short > entry);
  // 10x: buffer = 1/10 - 0.005 = 9.5% of entry.
  assert.equal(toDecimalString(long, 2), "27150.00");
  assert.equal(toDecimalString(short, 2), "32850.00");
  // The two are equidistant from entry.
  assert.equal(entry - long, short - entry);
});

test("higher leverage moves liquidation closer to entry", () => {
  const entry = P("30000");
  let previous = 0n;
  for (const lev of [2, 5, 10, 25, 50]) {
    const gap = entry - liquidationPrice("BUY", entry, lev)!;
    assert.ok(gap > 0n, `${lev}x should leave a gap`);
    if (previous) assert.ok(gap < previous, `${lev}x should be tighter than the previous step`);
    previous = gap;
  }
});

test("at the liquidation price the loss is the posted margin less maintenance", () => {
  // This is the whole point of the formula: the trader's loss at liquidation
  // must be bounded by what they put up, with the maintenance margin left over.
  const entry = P("30000"), qty = P("1"), lev = 10;
  const margin = marginFor(notional(qty, entry), lev);
  const liq = liquidationPrice("BUY", entry, lev)!;
  const loss = -pnlFor("BUY", qty, entry, liq);
  const maintenance = mul(notional(qty, entry), toScaled(String(config.maintenanceMarginRatio)));
  assert.equal(loss, margin - maintenance);
  assert.ok(loss < margin);
});

test("maxSafeLeverage is the last leverage that still leaves a gap", () => {
  const safe = maxSafeLeverage();
  assert.equal(safe, Math.floor(1 / config.maintenanceMarginRatio) - 1);
  const entry = P("30000");
  assert.ok(liquidationPrice("BUY", entry, safe)! < entry, "the safe cap must not liquidate at entry");
  // One step past the cap the buffer collapses onto entry — which is exactly
  // why execution.ts refuses to open there.
  assert.equal(liquidationPrice("BUY", entry, safe + 2), entry);
});

test("isLiquidated triggers only once the mark crosses the level", () => {
  const liq = P("27150");
  assert.equal(isLiquidated("BUY", liq, P("27151")), false);
  assert.equal(isLiquidated("BUY", liq, liq), true);       // touching counts
  assert.equal(isLiquidated("BUY", liq, P("27000")), true);
  assert.equal(isLiquidated("SELL", P("32850"), P("32849")), false);
  assert.equal(isLiquidated("SELL", P("32850"), P("33000")), true);
  assert.equal(isLiquidated("BUY", null, 0n), false);      // spot can't liquidate
});

test("limit orders rest on the passive side of the book", () => {
  const trigger = P("30000");
  assert.equal(shouldFill("LIMIT", "BUY", trigger, P("30001")), false);
  assert.equal(shouldFill("LIMIT", "BUY", trigger, trigger), true);
  assert.equal(shouldFill("LIMIT", "BUY", trigger, P("29999")), true);
  assert.equal(shouldFill("LIMIT", "SELL", trigger, P("29999")), false);
  assert.equal(shouldFill("LIMIT", "SELL", trigger, P("30001")), true);
});

test("stop orders trigger on a breakout in the trade's direction", () => {
  const trigger = P("30000");
  assert.equal(shouldFill("STOP", "BUY", trigger, P("29999")), false);
  assert.equal(shouldFill("STOP", "BUY", trigger, P("30001")), true);
  assert.equal(shouldFill("STOP", "SELL", trigger, P("30001")), false);
  assert.equal(shouldFill("STOP", "SELL", trigger, P("29999")), true);
});

test("exitReason reads TP/SL from the position's side", () => {
  const tp = P("31000"), sl = P("29000");
  assert.equal(exitReason("BUY", P("30000"), tp, sl), null);
  assert.equal(exitReason("BUY", P("31000"), tp, sl), "TAKE_PROFIT");
  assert.equal(exitReason("BUY", P("28900"), tp, sl), "STOP_LOSS");
  // Short: the same levels mean the opposite things.
  assert.equal(exitReason("SELL", P("29000"), P("29000"), P("31000")), "TAKE_PROFIT");
  assert.equal(exitReason("SELL", P("31500"), P("29000"), P("31000")), "STOP_LOSS");
  assert.equal(exitReason("BUY", P("40000"), null, null), null);
  assert.equal(exitReason("BUY", P("40000"), null, sl), null);
});

test("take-profit wins over stop-loss when a single tick crosses both", () => {
  // A gap can jump past both levels at once; the trader must get the better
  // of the two, not whichever branch happens to be checked first.
  assert.equal(exitReason("BUY", P("40000"), P("31000"), P("39000")), "TAKE_PROFIT");
});

test("a quote is tradeable only while it is fresh", () => {
  // The rule two independent engines gate on: refuse to act on a price the
  // market has left behind, rather than fill or liquidate against a memory.
  const at = "2026-01-01T12:00:00.000Z";
  const nowMs = new Date("2026-01-01T12:01:00.000Z").getTime(); // one minute later
  assert.equal(isQuoteFresh(at, 120_000, nowMs), true);
  assert.equal(isQuoteFresh(at, 30_000, nowMs), false);
  assert.equal(isQuoteFresh(at, 60_000, nowMs), true);  // exactly at the limit still counts
  assert.equal(isQuoteFresh(null, 120_000, nowMs), false);
  assert.equal(isQuoteFresh(undefined, 120_000, nowMs), false);
  assert.equal(isQuoteFresh("not a date", 120_000, nowMs), false);
  // A timestamp slightly ahead of us is a clock skew, not a stale quote — it
  // must not halt an otherwise-updating feed.
  assert.equal(isQuoteFresh("2026-01-01T12:02:00.000Z", 120_000, nowMs), true);
});
