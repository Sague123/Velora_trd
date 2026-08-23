/**
 * All money and quantities live as scaled BigInt integers (SCALE = 1e8).
 * Floating point is never used for balances, prices, quantities or PnL —
 * only for display-level percentages that are never persisted.
 */
export const SCALE = 100_000_000n; // 1e8

export class MoneyError extends Error {}

/** "123.45" | 123.45 -> scaled BigInt */
export function toScaled(v: string | number): bigint {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) throw new MoneyError("Non-finite number");
    v = v.toFixed(8);
  }
  const s = String(v).trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new MoneyError(`Invalid decimal: ${s}`);
  const neg = s.startsWith("-");
  const [int, frac = ""] = (neg ? s.slice(1) : s).split(".");
  const fracPadded = (frac + "00000000").slice(0, 8);
  const result = BigInt(int) * SCALE + BigInt(fracPadded);
  return neg ? -result : result;
}

/** scaled BigInt -> "123.45000000" */
export function toDecimalString(v: bigint, decimals = 8): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  const int = a / SCALE;
  const frac = (a % SCALE).toString().padStart(8, "0");
  const body = decimals === 0 ? `${int}` : `${int}.${frac.slice(0, decimals)}`;
  return neg ? `-${body}` : body;
}

/** For JSON: emit strings, never JS numbers, so precision survives the wire. */
export const out = (v: bigint | null | undefined, decimals = 8): string | null =>
  v === null || v === undefined ? null : toDecimalString(v, decimals);

/** (a * b) / SCALE — product of two scaled values */
export const mul = (a: bigint, b: bigint): bigint => (a * b) / SCALE;

/** (a * SCALE) / b — quotient of two scaled values */
export function div(a: bigint, b: bigint): bigint {
  if (b === 0n) throw new MoneyError("Division by zero");
  return (a * SCALE) / b;
}

export const abs = (a: bigint): bigint => (a < 0n ? -a : a);
export const maxOf = (a: bigint, b: bigint): bigint => (a > b ? a : b);
export const minOf = (a: bigint, b: bigint): bigint => (a < b ? a : b);

/** basis points: bps(amount, 4) = 0.04% of amount */
export const bps = (amount: bigint, points: number): bigint =>
  (amount * BigInt(Math.round(points))) / 10_000n;

/** ratio as a display number — computed for rendering only, never stored */
export const pctOf = (part: bigint, whole: bigint): number =>
  whole === 0n ? 0 : Number((part * 1_000_000n) / whole) / 10_000;
