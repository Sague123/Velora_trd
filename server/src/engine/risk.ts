import { SCALE, mul, div, bps, abs } from "../lib/money.js";
import { config } from "../config.js";

export type Side = "BUY" | "SELL";

/** notional = qty * price */
export const notional = (qtyScaled: bigint, priceScaled: bigint): bigint =>
  mul(qtyScaled, priceScaled);

/** margin = notional / leverage */
export const marginFor = (notionalScaled: bigint, leverage: number): bigint =>
  notionalScaled / BigInt(Math.max(1, Math.trunc(leverage)));

export const feeFor = (notionalScaled: bigint): bigint =>
  bps(notionalScaled, config.takerFeeBps);

/** Unrealised PnL. Long profits when price rises, short when it falls. */
export function pnlFor(
  side: Side,
  qtyScaled: bigint,
  entryScaled: bigint,
  markScaled: bigint
): bigint {
  const diff = markScaled - entryScaled;
  const signed = side === "BUY" ? diff : -diff;
  return mul(qtyScaled, signed);
}

/**
 * Liquidation price: where the loss consumes the posted margin down to the
 * maintenance threshold. Unleveraged spot positions cannot be liquidated.
 */
export function liquidationPrice(
  side: Side,
  entryScaled: bigint,
  leverage: number
): bigint | null {
  if (leverage <= 1) return null;
  const mmr = config.maintenanceMarginRatio;
  // buffer = (1 / leverage) - mmr, expressed as a scaled fraction of entry
  const bufferNum = BigInt(Math.round((1 / leverage - mmr) * 1e8));
  if (bufferNum <= 0n) return entryScaled; // guarded against upstream by maxSafeLeverage
  const move = mul(entryScaled, bufferNum);
  return side === "BUY" ? entryScaled - move : entryScaled + move;
}

/** Highest leverage that still leaves room between entry and liquidation. */
export const maxSafeLeverage = (): number => Math.floor(1 / config.maintenanceMarginRatio) - 1;

/** Has the mark price crossed the liquidation level? */
export function isLiquidated(side: Side, liq: bigint | null, mark: bigint): boolean {
  if (liq === null) return false;
  return side === "BUY" ? mark <= liq : mark >= liq;
}

/** Should a resting order fill at the current mark? */
export function shouldFill(
  type: "LIMIT" | "STOP",
  side: Side,
  trigger: bigint,
  mark: bigint
): boolean {
  if (type === "LIMIT") {
    // buy limit rests below the market, sell limit above
    return side === "BUY" ? mark <= trigger : mark >= trigger;
  }
  // stop orders trigger on breakout in the direction of the trade
  return side === "BUY" ? mark >= trigger : mark <= trigger;
}

/** TP/SL evaluation for an open position. */
export function exitReason(
  side: Side,
  mark: bigint,
  tp: bigint | null,
  sl: bigint | null
): "TAKE_PROFIT" | "STOP_LOSS" | null {
  if (side === "BUY") {
    if (tp !== null && mark >= tp) return "TAKE_PROFIT";
    if (sl !== null && mark <= sl) return "STOP_LOSS";
  } else {
    if (tp !== null && mark <= tp) return "TAKE_PROFIT";
    if (sl !== null && mark >= sl) return "STOP_LOSS";
  }
  return null;
}

export { SCALE, mul, div, abs };
