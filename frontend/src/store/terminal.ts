import { create } from "zustand";
import type { Timeframe } from "../lib/types";

interface TerminalState {
  symbol: string;
  timeframe: Timeframe;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  symbol: "BTCUSDT",
  timeframe: "1H",
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),
}));
