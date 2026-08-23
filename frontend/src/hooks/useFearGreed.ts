import { useQuery } from "@tanstack/react-query";

export interface FearGreed {
  value: number;
  classification: string;
}

/** Real Crypto Fear & Greed Index — alternative.me's public, keyless API,
 * the same source most crypto sites cite for this figure. The index only
 * updates once a day upstream, so this is polled gently. Null on failure —
 * never a made-up number. */
async function fetchFearGreed(): Promise<FearGreed | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1");
    if (!res.ok) return null;
    const json = await res.json();
    const row = json?.data?.[0];
    if (!row) return null;
    const value = Number(row.value);
    if (!Number.isFinite(value)) return null;
    return { value, classification: row.value_classification ?? "" };
  } catch {
    return null;
  }
}

export function useFearGreed() {
  return useQuery({
    queryKey: ["fear-greed-index"],
    queryFn: fetchFearGreed,
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
