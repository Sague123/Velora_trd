import { useEffect } from "react";
import { useTerminalStore, type ChartType, type Oscillator } from "../store/terminal";
import { useUserSettings } from "../store/userSettings";
import type { Timeframe } from "../lib/types";

/**
 * Settings → Charts, applied to the terminal's chart state.
 *
 * - Default timeframe and chart type are what a chart opens with.
 * - "Remember layout" keeps the trader's last timeframe, chart type,
 *   indicators and oscillator on this device instead, and restores them on
 *   the next visit. (Drawings are saved per symbol regardless.)
 *
 * Applied once per app session, and again only when those defaults are
 * changed in Settings — never while someone is mid-way through switching
 * timeframes on the chart itself.
 */

const KEY = "velora-chart-layout";

interface Layout {
  timeframe: Timeframe;
  chartType: ChartType;
  showSma20: boolean;
  showSma50: boolean;
  showEma9: boolean;
  showEma21: boolean;
  oscillator: Oscillator;
}

const pick = (s: Layout): Layout => ({
  timeframe: s.timeframe, chartType: s.chartType,
  showSma20: s.showSma20, showSma50: s.showSma50, showEma9: s.showEma9, showEma21: s.showEma21,
  oscillator: s.oscillator,
});

function readLayout(): Layout | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Layout) : null;
  } catch {
    return null;
  }
}

let appliedFor: string | null = null;

export function useChartLayout() {
  const loaded = useUserSettings((s) => s.loaded);
  const { timeframe, chartType, rememberLayout } = useUserSettings((s) => s.settings.charts);

  useEffect(() => {
    if (!loaded) return;
    const key = JSON.stringify([timeframe, chartType, rememberLayout]);
    if (appliedFor === key) return;
    const firstThisSession = appliedFor === null;
    appliedFor = key;
    const saved = rememberLayout && firstThisSession ? readLayout() : null;
    useTerminalStore.setState(saved ?? { timeframe, chartType: chartType.toLowerCase() as ChartType });
  }, [loaded, timeframe, chartType, rememberLayout]);

  useEffect(() => {
    if (!rememberLayout) return;
    return useTerminalStore.subscribe((s) => {
      // Not before the saved layout/defaults have been applied: the store's
      // initial state would otherwise overwrite the layout it's about to load.
      if (appliedFor === null) return;
      try {
        localStorage.setItem(KEY, JSON.stringify(pick(s)));
      } catch { /* storage unavailable */ }
    });
  }, [rememberLayout]);
}

/** Settings → Charts → Reset: forget the remembered layout on this device. */
export function forgetChartLayout() {
  try {
    localStorage.removeItem(KEY);
  } catch { /* storage unavailable */ }
  appliedFor = null;
}
