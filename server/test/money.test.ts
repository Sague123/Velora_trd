import test from "node:test";
import assert from "node:assert/strict";
import {
  SCALE, MoneyError, toScaled, toDecimalString, out, mul, div, abs, maxOf, minOf, bps, pctOf,
} from "../src/lib/money.js";

/**
 * money.ts is the arithmetic every balance, price, quantity and PnL in the
 * platform is expressed in. A regression here is silent and expensive — it
 * doesn't throw, it just moves the wrong amount of money — so the properties
 * that must hold are pinned here rather than left to the smoke test to
 * notice indirectly.
 */

test("toScaled parses decimal strings exactly", () => {
  assert.equal(toScaled("0"), 0n);
  assert.equal(toScaled("1"), SCALE);
  assert.equal(toScaled("123.45"), 12_345_000_000n);
  assert.equal(toScaled("0.00000001"), 1n);          // one satoshi-sized unit
  assert.equal(toScaled("-1.5"), -150_000_000n);
  assert.equal(toScaled("-0.00000001"), -1n);
});

test("toScaled keeps precision a float would destroy", () => {
  // 0.1 + 0.2 !== 0.3 in binary floating point; in scaled integers it must.
  assert.equal(toScaled("0.1") + toScaled("0.2"), toScaled("0.3"));
  // A balance larger than Number.MAX_SAFE_INTEGER once scaled still round-trips.
  const huge = "90071992.54740993";
  assert.equal(toDecimalString(toScaled(huge)), "90071992.54740993");
});

test("toScaled truncates beyond 8 decimals rather than rounding up", () => {
  // Truncation is the safe direction: it can never credit an account with a
  // fraction of a unit that was not actually paid in.
  assert.equal(toScaled("1.123456789"), 112_345_678n);
  assert.equal(toScaled("-1.123456789"), -112_345_678n);
});

test("toScaled rejects anything that isn't a plain decimal", () => {
  for (const bad of ["", " ", "abc", "1.2.3", "1e5", "0x10", "1,5", "--1", "+1", "NaN", "Infinity"]) {
    assert.throws(() => toScaled(bad), MoneyError, `expected ${JSON.stringify(bad)} to be rejected`);
  }
  assert.throws(() => toScaled(Number.NaN), MoneyError);
  assert.throws(() => toScaled(Number.POSITIVE_INFINITY), MoneyError);
});

test("toScaled accepts numbers via a fixed-precision string, not float maths", () => {
  assert.equal(toScaled(123.45), toScaled("123.45"));
  assert.equal(toScaled(0.1) + toScaled(0.2), toScaled("0.3"));
});

test("toDecimalString formats and pads, honouring the requested precision", () => {
  assert.equal(toDecimalString(toScaled("123.45")), "123.45000000");
  assert.equal(toDecimalString(toScaled("123.456789"), 2), "123.45");
  assert.equal(toDecimalString(toScaled("123.456789"), 0), "123");
  assert.equal(toDecimalString(toScaled("-0.5"), 2), "-0.50");
  assert.equal(toDecimalString(0n, 2), "0.00");
});

test("out emits strings for the wire and passes null through", () => {
  assert.equal(out(toScaled("10"), 2), "10.00");
  assert.equal(out(null), null);
  assert.equal(out(undefined), null);
  assert.equal(typeof out(1n), "string"); // never a JS number — precision must survive JSON
});

test("mul and div are scale-preserving inverses", () => {
  const a = toScaled("7.5");
  const b = toScaled("4");
  assert.equal(mul(a, b), toScaled("30"));
  assert.equal(div(a, b), toScaled("1.875"));
  assert.equal(div(mul(a, b), b), a);
  assert.throws(() => div(a, 0n), MoneyError);
});

test("mul/div truncate toward zero on both signs", () => {
  // BigInt division truncates toward zero, so a loss is never rounded into a
  // slightly larger loss, nor a gain into a slightly larger gain.
  assert.equal(mul(1n, 1n), 0n);                       // 1e-8 * 1e-8 underflows
  assert.equal(mul(-3n, toScaled("0.5")), -1n);        // -1.5 -> -1, not -2
  assert.equal(div(toScaled("1"), toScaled("3")), 33_333_333n);
  assert.equal(div(toScaled("-1"), toScaled("3")), -33_333_333n);
});

test("bps computes basis points of an amount", () => {
  assert.equal(bps(toScaled("10000"), 4), toScaled("4"));        // 0.04% taker fee
  assert.equal(bps(toScaled("10000"), 10_000), toScaled("10000")); // 100%
  assert.equal(bps(toScaled("10000"), 0), 0n);
  assert.equal(bps(toScaled("-10000"), 4), toScaled("-4"));
});

test("abs / maxOf / minOf", () => {
  assert.equal(abs(-5n), 5n);
  assert.equal(abs(5n), 5n);
  assert.equal(maxOf(-5n, 5n), 5n);
  assert.equal(minOf(-5n, 5n), -5n);
});

test("pctOf is display-only and never divides by zero", () => {
  assert.equal(pctOf(toScaled("50"), toScaled("200")), 25);
  assert.equal(pctOf(toScaled("-50"), toScaled("200")), -25);
  assert.equal(pctOf(toScaled("1"), 0n), 0);
});
