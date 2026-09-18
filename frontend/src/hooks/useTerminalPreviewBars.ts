import { useQuery } from "@tanstack/react-query";
import { fetchBinanceKlines } from "../lib/binance";

/**
 * Last 24 hourly candles for BTC/USDT, straight from Binance's public REST
 * endpoint — same call `useSparkline` makes for the markets table, just kept
 * as full OHLC instead of closes-only, so the landing preview can draw real
 * candle bodies instead of a flat line.
 *
 * `staleTime`/`refetchInterval` at 5 minutes on purpose: this is marketing
 * chrome, not a live trading surface, and the window it shows ("last 24h")
 * doesn't visibly change between one refetch and the next — ticking it every
 * second would be motion with no information behind it.
 */
export function useTerminalPreviewBars() {
  return useQuery({
    queryKey: ["terminalPreviewBars", "BTCUSDT"],
    queryFn: () => fetchBinanceKlines("BTCUSDT", "SPOT", "1H", undefined, 24),
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    retry: 1,
  });
}
