import { create } from "zustand";
import type { Timeframe } from "../lib/types";
import type { DrawTool } from "../lib/chartEngine";

export type Oscillator = "NONE" | "RSI" | "MACD";

interface TerminalState {
  symbol: string;
  timeframe: Timeframe;
  setSymbol: (s: string) => void;
  setTimeframe: (tf: Timeframe) => void;

  // Chart overlay/tool state — shared rather than owned by ChartPanel alone,
  // so the mobile layout can render the Timeframe/Indicators/Draw controls
  // in its own compact header row (merged in with the symbol picker and the
  // Chart/Book toggle) while ChartPanel just reacts to the same values. Only
  // one ChartPanel is ever mounted at a time (desktop or mobile, never both),
  // so there is no cross-instance conflict in sharing this.
  showSma20: boolean;
  showSma50: boolean;
  showEma9: boolean;
  showEma21: boolean;
  oscillator: Oscillator;
  tool: DrawTool;
  setShowSma20: (v: boolean) => void;
  setShowSma50: (v: boolean) => void;
  setShowEma9: (v: boolean) => void;
  setShowEma21: (v: boolean) => void;
  setOscillator: (v: Oscillator) => void;
  setTool: (v: DrawTool) => void;

  // A "clear all drawings" request. ChartPanel owns the actual ChartEngine
  // instance (a ref, not something that belongs in this store), so this is a
  // signal, not the action itself: MobileTerminal's Draw menu bumps the
  // counter, and ChartPanel's own effect watches it and calls
  // engine.clearDrawings() when it changes. A plain counter rather than a
  // boolean so two clear requests in a row (nothing else changed in between)
  // both still fire.
  clearDrawingsRequest: number;
  requestClearDrawings: () => void;
}

export const useTerminalStore = create<TerminalState>((set) => ({
  symbol: "BTCUSDT",
  timeframe: "1H",
  setSymbol: (symbol) => set({ symbol }),
  setTimeframe: (timeframe) => set({ timeframe }),

  showSma20: true,
  showSma50: false,
  showEma9: false,
  showEma21: false,
  oscillator: "NONE",
  tool: "cursor",
  setShowSma20: (showSma20) => set({ showSma20 }),
  setShowSma50: (showSma50) => set({ showSma50 }),
  setShowEma9: (showEma9) => set({ showEma9 }),
  setShowEma21: (showEma21) => set({ showEma21 }),
  setOscillator: (oscillator) => set({ oscillator }),
  setTool: (tool) => set({ tool }),

  clearDrawingsRequest: 0,
  requestClearDrawings: () => set((s) => ({ clearDrawingsRequest: s.clearDrawingsRequest + 1 })),
}));
