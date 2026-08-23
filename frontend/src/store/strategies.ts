import { create } from "zustand";
import { persist } from "zustand/middleware";

export type BotType = "GRID" | "MARTINGALE";
export type BotStatus = "RUNNING" | "STOPPED" | "ERROR";

export interface GridOrderRef {
  orderId: string;
  level: number; // grid index, 0 = lowest
  side: "BUY" | "SELL";
  price: number;
}

export interface BotBase {
  id: string;
  type: BotType;
  symbol: string;
  leverage: number;
  status: BotStatus;
  createdAt: string;
  log: { ts: string; message: string }[];
  errorCount: number;
}

export interface GridBot extends BotBase {
  type: "GRID";
  lower: number;
  upper: number;
  levels: number; // number of grid lines
  qtyPerLevel: number; // base-asset qty per grid order
  gridOrders: GridOrderRef[];
}

export interface MartingaleBot extends BotBase {
  type: "MARTINGALE";
  side: "BUY" | "SELL";
  baseQty: number;
  multiplier: number;
  maxSteps: number;
  takeProfitPct: number;
  addOnDrawdownPct: number;
  step: number;
  positionIds: string[];
}

export type Bot = GridBot | MartingaleBot;

const LOG_CAP = 80;

interface StrategiesState {
  bots: Record<string, Bot>;
  upsert: (bot: Bot) => void;
  remove: (id: string) => void;
  setStatus: (id: string, status: BotStatus) => void;
  log: (id: string, message: string) => void;
  patch: (id: string, patch: Partial<Bot>) => void;
}

export const useStrategiesStore = create<StrategiesState>()(
  persist(
    (set) => ({
      bots: {},
      upsert: (bot) => set((s) => ({ bots: { ...s.bots, [bot.id]: bot } })),
      remove: (id) =>
        set((s) => {
          const next = { ...s.bots };
          delete next[id];
          return { bots: next };
        }),
      setStatus: (id, status) =>
        set((s) => (s.bots[id] ? { bots: { ...s.bots, [id]: { ...s.bots[id], status } } } : s)),
      log: (id, message) =>
        set((s) => {
          const bot = s.bots[id];
          if (!bot) return s;
          const entry = { ts: new Date().toISOString(), message };
          const nextLog = [...bot.log, entry].slice(-LOG_CAP);
          return { bots: { ...s.bots, [id]: { ...bot, log: nextLog } } };
        }),
      patch: (id, patch) =>
        set((s) => (s.bots[id] ? { bots: { ...s.bots, [id]: { ...s.bots[id], ...patch } as Bot } } : s)),
    }),
    { name: "velora-strategies" }
  )
);

/** Order ids ever placed by a grid bot — including stopped/deleted-but-still-
 * cached bots, since the order itself is real and its origin doesn't change
 * when the bot's own record is later removed. Used to tell "market" orders
 * (placed by hand) apart from "bot" orders in the shared Orders views. */
export function useBotOrderIds(): Set<string> {
  return useStrategiesStore((s) => {
    const ids = new Set<string>();
    for (const bot of Object.values(s.bots)) {
      if (bot.type === "GRID") for (const g of bot.gridOrders) ids.add(g.orderId);
    }
    return ids;
  });
}
