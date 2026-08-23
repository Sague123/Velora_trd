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
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
}

export function useCandles(symbol: string | null, tf: Timeframe) {
  return useQuery({
    queryKey: ["candles", symbol, tf],
    queryFn: () => apiGet<CandlesResponse>(`/api/instruments/${symbol}/candles?tf=${tf}`),
    enabled: !!symbol,
    refetchInterval: 30_000,
    staleTime: 20_000,
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
    refetchInterval: 45_000,
    staleTime: 30_000,
  });

  const veloraQuery = useCandles(binanceEligible ? null : symbol, tf);

  const binanceBars = useMemo(() => {
    if (!binanceQuery.data) return null;
    // pages arrive newest-first (each fetchNextPage goes further back); each
    // individual page is already chronological, so reverse page order only.
    return [...binanceQuery.data.pages].reverse().flat().filter((b): b is Bar => b !== null);
  }, [binanceQuery.data]);

  if (binanceEligible) {
    const anyPageNull = binanceQuery.data?.pages.some((p) => p === null) ?? false;
    return {
      data: binanceBars ? { bars: binanceBars, source: "BINANCE" as const, real: true } : undefined,
      isLoading: binanceQuery.isLoading,
      isError: binanceQuery.isError || (binanceQuery.isSuccess && anyPageNull && !binanceBars?.length),
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
    refetch: veloraQuery.refetch,
    loadMore: () => {},
    hasMore: false,
    isLoadingMore: false,
  };
}
