import { priceCache } from "./cache.js";
import { catalogCounts } from "./catalog.js";

/**
 * Health and counts, in a module of their own so routes can read them without
 * importing market/index.ts -- which starts providers as a side effect of
 * being wired, and must not be pulled in by a process that only serves the
 * CRM (see VELORA_ROLE in config.ts).
 */

let providerSnapshot: { name: string; state: string; reason: string | null }[] = [];

export const publishProviderStatus = (
  snapshot: { name: string; state: string; reason: string | null }[]
): void => { providerSnapshot = snapshot; };

export const marketStatus = () => ({
  cached: priceCache.size,
  providers: providerSnapshot,
});

/** Catalogue counts, cached briefly: the tabs ask for them on every mount and
 * the answer changes twice a day. */
let cached: { at: number; data: Awaited<ReturnType<typeof catalogCounts>> } | null = null;
const TTL_MS = 30_000;

export async function catalogCountsCached() {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const data = await catalogCounts();
  cached = { at: Date.now(), data };
  return data;
}
