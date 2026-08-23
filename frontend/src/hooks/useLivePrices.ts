import { useEffect } from "react";
import { usePriceStore } from "../store/prices";
import { useInstruments } from "./useMarket";
import type { Instrument } from "../lib/types";

export interface LiveInstrument extends Instrument {
  livePrice: string;
  liveChange24h: number;
  liveHigh24h: string | null;
  liveLow24h: string | null;
  dir: "up" | "down" | null;
  stale: boolean;
}

/** Ensures the shared price socket is opened once at app boot. */
export function useEnsurePriceSocket() {
  const connect = usePriceStore((s) => s.connect);
  useEffect(() => {
    connect();
  }, [connect]);
}

export function useConnStatus() {
  return usePriceStore((s) => s.status);
}

/** Merges REST instrument metadata with the live WS ticker for one symbol. */
export function useLiveInstrument(symbol: string | null): LiveInstrument | null {
  const { data } = useInstruments();
  const tick = usePriceStore((s) => (symbol ? s.ticks[symbol] : undefined));
  const base = data?.instruments.find((i) => i.symbol === symbol);
  if (!base) return null;
  return {
    ...base,
    livePrice: tick?.price ?? base.price ?? "0",
    liveChange24h: tick?.change24h ?? base.change24h,
    liveHigh24h: tick?.high24h ?? base.high24h,
    liveLow24h: tick?.low24h ?? base.low24h,
    dir: tick?.dir ?? null,
    stale: !tick,
  };
}

export function useLiveInstruments(): LiveInstrument[] {
  const { data } = useInstruments();
  const ticks = usePriceStore((s) => s.ticks);
  if (!data) return [];
  return data.instruments.map((base) => {
    const tick = ticks[base.symbol];
    return {
      ...base,
      livePrice: tick?.price ?? base.price ?? "0",
      liveChange24h: tick?.change24h ?? base.change24h,
      liveHigh24h: tick?.high24h ?? base.high24h,
      liveLow24h: tick?.low24h ?? base.low24h,
      dir: tick?.dir ?? null,
      stale: !tick,
    };
  });
}
