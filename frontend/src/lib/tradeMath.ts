/**
 * Client-side estimate only — mirrors server/src/engine/risk.ts using plain
 * numbers for display purposes (order preview). The server is always the
 * source of truth and recomputes everything from scaled BigInt on submit.
 */

export const TAKER_FEE_BPS = 4; // 0.04%
export const MAINTENANCE_MARGIN_RATIO = 0.005;

export function estNotional(qty: number, price: number): number {
  return qty * price;
}

export function estMargin(notional: number, leverage: number): number {
  const lev = Math.max(1, Math.trunc(leverage) || 1);
  return notional / lev;
}

export function estFee(notional: number): number {
  return (notional * TAKER_FEE_BPS) / 10_000;
}

export function estLiquidationPrice(side: "BUY" | "SELL", entry: number, leverage: number): number | null {
  if (leverage <= 1) return null;
  const buffer = 1 / leverage - MAINTENANCE_MARGIN_RATIO;
  if (buffer <= 0) return entry;
  const move = entry * buffer;
  return side === "BUY" ? entry - move : entry + move;
}

export function estPnl(side: "BUY" | "SELL", qty: number, entry: number, mark: number): number {
  const diff = mark - entry;
  const signed = side === "BUY" ? diff : -diff;
  return qty * signed;
}

const LEVERAGE_TICK_CANDIDATES = [1, 5, 10, 25, 50, 75, 100, 125];

/** Tick marks for the leverage slider, adapted to the instrument's own cap —
 * a fixed 1/10/25/50/75/100 set would either overshoot a 20x instrument or
 * leave a 125x one without a mark near its ceiling. Always includes 1 and the
 * cap itself. */
export function leverageTicks(max: number): number[] {
  if (max <= 1) return [1];
  const picked = LEVERAGE_TICK_CANDIDATES.filter((v) => v <= max);
  if (picked[picked.length - 1] !== max) picked.push(max);
  return picked;
}
