import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Timeframe } from "../lib/types";

interface SettingsState {
  defaultLeverage: number;
  defaultAmountMode: "BASE" | "QUOTE" | "MARGIN";
  defaultTimeframe: Timeframe;
  confirmOnOrder: boolean;
  setDefaultLeverage: (v: number) => void;
  setDefaultAmountMode: (v: "BASE" | "QUOTE" | "MARGIN") => void;
  setDefaultTimeframe: (v: Timeframe) => void;
  setConfirmOnOrder: (v: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  defaultLeverage: 1,
  defaultAmountMode: "BASE" as const,
  defaultTimeframe: "1H" as Timeframe,
  confirmOnOrder: false,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      setDefaultLeverage: (v) => set({ defaultLeverage: v }),
      setDefaultAmountMode: (v) => set({ defaultAmountMode: v }),
      setDefaultTimeframe: (v) => set({ defaultTimeframe: v }),
      setConfirmOnOrder: (v) => set({ confirmOnOrder: v }),
      reset: () => set(DEFAULTS),
    }),
    { name: "velora-settings" }
  )
);
