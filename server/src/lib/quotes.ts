/**
 * One rule, in one place: when is a quote too old to trade against?
 *
 * It lives here — pure, with no database, config or clock of its own — because
 * two independent places gate on it (engine/execution.ts refuses new orders and
 * closes, engine/matching.ts refuses fills and liquidations) and the two
 * drifting apart would be the worst possible bug: a position that can be
 * liquidated against a price it cannot be closed against.
 */
export function isQuoteFresh(
  updatedAt: string | null | undefined,
  maxAgeMs: number,
  nowMs: number = Date.now()
): boolean {
  if (!updatedAt) return false;
  const at = new Date(updatedAt).getTime();
  if (!Number.isFinite(at)) return false;
  // A timestamp from the future is a clock problem, not a fresh quote, but it
  // is also not a reason to halt trading on an otherwise-updating feed.
  if (at > nowMs) return true;
  return nowMs - at <= maxAgeMs;
}
