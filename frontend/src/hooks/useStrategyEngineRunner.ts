import { useEffect } from "react";
import { runEngineTick } from "../lib/strategyEngine";

const TICK_MS = 8000;

/** Drives GRID/MARTINGALE strategies while this tab is open. There is no
 * server-side bot engine — closing the tab or losing connection stops all
 * bots, which is why the Strategies UI says so prominently. */
export function useStrategyEngineRunner(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      runEngineTick().catch(() => {});
    }, TICK_MS);
    return () => clearInterval(id);
  }, [enabled]);
}
