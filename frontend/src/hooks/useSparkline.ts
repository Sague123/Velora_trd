import { useQuery } from "@tanstack/react-query";
import { fetchBinanceKlines } from "../lib/binance";
import type { Category } from "../lib/types";

/** Last ~24h of hourly closes, straight from Binance — real recent price
 * history for the Home markets table's mini chart column, not a fabricated
 * shape. Kept to a small `limit` (unlike the main chart, which needs up to
 * 1000 bars) since this renders tiny and runs once per visible row. */
export function useSparkline(symbol: string, category: Category) {
  return useQuery({
    queryKey: ["sparkline", symbol],
    queryFn: () => fetchBinanceKlines(symbol, category, "1H", undefined, 24),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    select: (bars) => bars?.map((b) => b.close) ?? null,
  });
}
