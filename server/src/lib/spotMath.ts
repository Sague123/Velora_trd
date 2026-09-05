import { div, mul, SCALE } from "./money.js";
import { feeFor } from "../engine/risk.js";

/**
 * The arithmetic of a spot exchange, with no database in sight.
 *
 * Every spot operation — buying an asset with dollars, selling it back,
 * swapping one asset for another — is the same calculation with USD as the
 * pivot, so it is written once here. lib/spot.ts calls this to execute a fill
 * and routes/spot.ts calls it to quote one, which is the point: a preview that
 * rounds differently from the fill it previews is a support ticket waiting to
 * happen, and the only way to guarantee they agree is for both to run this.
 *
 * Pure and total: given the same inputs it returns the same numbers, and it
 * never throws. Callers decide what to do about a zero result.
 */

/** The price of the quote asset in itself. USD is worth one dollar. */
export const QUOTE_PRICE = SCALE;

export interface ExchangeMath {
  /** What the sold leg was worth in USD before the fee. */
  grossUsd: bigint;
  feeUsd: bigint;
  /** grossUsd - feeUsd: the USD actually converted into the bought asset. */
  netUsd: bigint;
  /** Quantity of the bought asset the trader receives. */
  toQty: bigint;
  /** Units of `to` per unit of `from`, after the fee — what the receipt calls
   * "rate". Zero when nothing was given up. */
  rate: bigint;
}

export function computeExchange(args: {
  fromQty: bigint;
  /** USD price of one unit of the asset being given up (QUOTE_PRICE for USD). */
  fromPrice: bigint;
  /** USD price of one unit of the asset being received (QUOTE_PRICE for USD). */
  toPrice: bigint;
}): ExchangeMath {
  const { fromQty, fromPrice, toPrice } = args;
  if (fromQty <= 0n || fromPrice <= 0n || toPrice <= 0n) {
    return { grossUsd: 0n, feeUsd: 0n, netUsd: 0n, toQty: 0n, rate: 0n };
  }

  // Multiplying by SCALE and dividing by SCALE are not inverses in integer
  // arithmetic, so USD legs take the identity path rather than round-tripping
  // through a price of exactly 1.0 — otherwise a large dollar amount could
  // come back a satoshi light purely from the pivot.
  const grossUsd = fromPrice === QUOTE_PRICE ? fromQty : mul(fromQty, fromPrice);
  const feeUsd = feeFor(grossUsd);
  const netUsd = grossUsd - feeUsd;
  const toQty = toPrice === QUOTE_PRICE ? netUsd : div(netUsd, toPrice);
  const rate = toQty === 0n ? 0n : div(toQty, fromQty);

  return { grossUsd, feeUsd, netUsd, toQty, rate };
}
