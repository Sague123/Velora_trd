import { useQuery } from "@tanstack/react-query";

export interface GlobalStats {
  totalMarketCapUsd: number;
  totalVolumeUsd: number;
  btcDominance: number;
  ethDominance: number;
  marketCapChange24h: number;
}

/**
 * Real aggregate crypto-market figures (total cap, 24h volume, BTC/ETH
 * dominance) — CoinGecko's public /global endpoint, no key required. This
 * data doesn't exist anywhere in Velora's own instrument catalog (18 pairs
 * isn't "the market"), so it's fetched client-side directly rather than
 * invented. Returns null on any failure — callers must render an honest
 * "—" / skeleton state, never a guessed number.
 */
async function fetchGlobal(): Promise<GlobalStats | null> {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/global");
    if (!res.ok) return null;
    const json = await res.json();
    const d = json?.data;
    if (!d) return null;
    return {
      totalMarketCapUsd: Number(d.total_market_cap?.usd) || 0,
      totalVolumeUsd: Number(d.total_volume?.usd) || 0,
      btcDominance: Number(d.market_cap_percentage?.btc) || 0,
      ethDominance: Number(d.market_cap_percentage?.eth) || 0,
      marketCapChange24h: Number(d.market_cap_change_percentage_24h_usd) || 0,
    };
  } catch {
    return null;
  }
}

export function useGlobalStats() {
  return useQuery({
    queryKey: ["global-market-stats"],
    queryFn: fetchGlobal,
    staleTime: 55_000,
    refetchInterval: 60_000,
  });
}
