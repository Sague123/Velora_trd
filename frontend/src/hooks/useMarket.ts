import { useMemo } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { apiGet } from "../lib/api";
import { fetchBinanceKlines, mapToBinance } from "../lib/binance";
import type { Bar } from "../lib/chartEngine";
import type { Category, CandlesResponse, InstrumentsResponse, Timeframe } from "../lib/types";

export function useInstruments() {
  return useQuery({
    queryKey: ["instruments"],
    queryFn: () => apiGet<InstrumentsResponse>("/api/instruments"),
    refetchInterval: 10_000,
    staleTime: 5_000,
  });
}

export function useCandles(symbol: string | null, tf: Timeframe) {
  return useQuery({
    queryKey: ["candles", symbol, tf],
    queryFn: () => apiGet<CandlesResponse>(`/api/instruments/${symbol}/candles?tf=${tf}`),
    enabled: !!symbol,
    refetchInterval: 10_000,
    staleTime: 6_000,
  });
}

export interface ChartBarsResult {
  bars: Bar[];
  source: "BINANCE" | "VELORA";
  real: boolean;
}

/**
 * Real candles for the chart: Binance klines directly for crypto SPOT/PERP,
 * paged backwards with `endTime` on demand so panning to the start of what's
 * loaded can keep fetching further into the pair's actual listing history —
 * there's no artificial "last N bars" ceiling. Velora's own candles endpoint
 * is the fallback for anything Binance has no market for (kept for safety;
 * every instrument in the current catalog is Binance-backed).
 */
export function useChartBars(symbol: string | null, category: Category | undefined, tf: Timeframe) {
  const binanceEligible = !!symbol && !!category && !!mapToBinance(symbol, category);

  const binanceQuery = useInfiniteQuery({
    queryKey: ["chart-bars", "binance", symbol, tf],
    queryFn: ({ pageParam }) => fetchBinanceKlines(symbol as string, category as Category, tf, pageParam as number | undefined),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (!lastPage || lastPage.length === 0) return undefined;
      return lastPage[0].time * 1000 - 1; // page further back from the oldest bar we have
    },
    enabled: binanceEligible,
    refetchInterval: 12_000,
    staleTime: 8_000,
  });

  const binanceBars = useMemo(() => {
    if (!binanceQuery.data) return null;
    // pages arrive newest-first (each fetchNextPage goes further back); each
    // individual page is already chronological, so reverse page order only.
    return [...binanceQuery.data.pages].reverse().flat().filter((b): b is Bar => b !== null);
  }, [binanceQuery.data]);

  // fetchBinanceKlines calls api.binance.com/fapi.binance.com straight from
  // the browser (see lib/binance.ts) — a deliberate move off the server,
  // which can't reach Binance from its own region. That trade means a
  // client that can't reach Binance either (a blocked region, an
  // ad-blocker treating *.binance.com as a tracker, a restrictive network)
  // hits the same wall, and used to dead-end on a hard error with Velora's
  // own working candles endpoint sitting right there unused — the doc
  // comment above already promised this endpoint as "the fallback", it just
  // never actually ran for an instrument Binance has a market for once the
  // live fetch failed. Falls back here instead of only for instruments with
  // no Binance mapping at all.
  const anyPageNull = binanceQuery.data?.pages.some((p) => p === null) ?? false;
  const binanceFailed = binanceQuery.isError || (binanceQuery.isSuccess && anyPageNull && !binanceBars?.length);
  const useVelora = !binanceEligible || binanceFailed;
  const veloraQuery = useCandles(useVelora ? symbol : null, tf);

  if (binanceEligible && !binanceFailed) {
    return {
      data: binanceBars ? { bars: binanceBars, source: "BINANCE" as const, real: true } : undefined,
      isLoading: binanceQuery.isLoading,
      isError: false,
      isFetching: binanceQuery.isFetching,
      refetch: binanceQuery.refetch,
      loadMore: () => binanceQuery.fetchNextPage(),
      hasMore: binanceQuery.hasNextPage,
      isLoadingMore: binanceQuery.isFetchingNextPage,
    };
  }

  const bars: Bar[] = (veloraQuery.data?.candles ?? []).map((c) => ({
    time: Math.floor(c.t / 1000), open: Number(c.o), high: Number(c.h), low: Number(c.l), close: Number(c.c),
  }));
  return {
    data: veloraQuery.data ? { bars, source: "VELORA" as const, real: veloraQuery.data.real } : undefined,
    isLoading: veloraQuery.isLoading,
    isError: veloraQuery.isError,
    isFetching: veloraQuery.isFetching,
    // Binance keeps retrying itself in the background (refetchInterval
    // above) regardless of which source is currently showing, so a manual
    // retry here gives both a fresh shot — if Binance recovers, the next
    // render switches back to it on its own.
    refetch: () => { if (binanceEligible) binanceQuery.refetch(); veloraQuery.refetch(); },
    loadMore: () => {},
    hasMore: false,
    isLoadingMore: false,
  };
}
