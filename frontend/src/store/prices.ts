import { create } from "zustand";
import { WS_BASE } from "../lib/api";
import type { WsPriceTick } from "../lib/types";

export type ConnStatus = "connecting" | "open" | "closed";

export interface PriceEntry extends WsPriceTick {
  prevPrice: string | null;
  dir: "up" | "down" | null;
  updatedAt: number;
}

interface PriceState {
  ticks: Record<string, PriceEntry>;
  status: ConnStatus;
  connect: () => void;
  /** Applied by the direct Binance ticker feed — same shape/logic as a
   * server-pushed tick, just sourced client-side for sub-second updates
   * instead of waiting on the backend's own refresh cycle. */
  applyTick: (tick: WsPriceTick) => void;
  /** Trade-by-trade price for the one symbol the user is actually looking at.
   * A trade carries no 24h statistics, so this deliberately updates only the
   * price and keeps whatever high/low/change the 1s ticker last supplied —
   * otherwise the header stats would blank out between ticker frames. */
  applyPriceOnly: (symbol: string, price: string) => void;
  /**
   * Narrows what the server sends.
   *
   * The catalogue is now thousands of instruments; a socket carrying all of
   * them several times a second is megabytes nobody reads. The server frames
   * at most four times a second and sends only what moved, but it still has
   * to be told which symbols this tab is actually looking at.
   */
  subscribe: (next: { categories?: string[]; symbols?: string[] }) => void;
}

/** What the socket last asked for, replayed on every reconnect — a
 * subscription the server forgot when the connection dropped would leave a
 * silent watchlist that looks exactly like a dead market. */
let subscription: { categories?: string[]; symbols?: string[] } = {};

function sendSubscription(): void {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({ type: "subscribe", ...subscription }));
}

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let started = false;

function mergeTick(ticks: Record<string, PriceEntry>, row: WsPriceTick, now: number): Record<string, PriceEntry> {
  const prev = ticks[row.symbol];
  const prevPrice = prev?.price ?? null;
  let dir: "up" | "down" | null = prev?.dir ?? null;
  if (prevPrice !== null && row.price !== prevPrice) {
    dir = Number(row.price) > Number(prevPrice) ? "up" : "down";
  }
  return { ...ticks, [row.symbol]: { ...row, prevPrice, dir, updatedAt: now } };
}

export const usePriceStore = create<PriceState>((set, get) => ({
  ticks: {},
  status: "connecting",

  applyTick: (tick) => set((s) => ({ ticks: mergeTick(s.ticks, tick, Date.now()) })),

  subscribe: (next) => {
    subscription = next;
    sendSubscription();
  },

  applyPriceOnly: (symbol, price) =>
    set((s) => {
      const prev = s.ticks[symbol];
      // Nothing to merge into yet — wait for the ticker feed to establish the
      // baseline rather than inventing an entry with zeroed-out statistics.
      if (!prev || prev.price === price) return s;
      return {
        ticks: {
          ...s.ticks,
          [symbol]: {
            ...prev,
            price,
            prevPrice: prev.price,
            dir: Number(price) > Number(prev.price) ? "up" : "down",
            updatedAt: Date.now(),
          },
        },
      };
    }),

  connect: () => {
    if (started) return;
    started = true;
    open();

    function open() {
      set({ status: "connecting" });
      socket = new WebSocket(`${WS_BASE}/ws/prices`);

      socket.onopen = () => {
        attempt = 0;
        set({ status: "open" });
        sendSubscription();
      };

      socket.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type !== "prices" || !Array.isArray(msg.data)) return;
          set((s) => {
            let next = s.ticks;
            const now = Date.now();
            for (const row of msg.data as WsPriceTick[]) next = mergeTick(next, row, now);
            return { ticks: next };
          });
        } catch {
          /* ignore malformed frame */
        }
      };

      socket.onclose = () => {
        set({ status: "closed" });
        scheduleReconnect();
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    function scheduleReconnect() {
      if (reconnectTimer) return;
      const delay = Math.min(1000 * 2 ** attempt, 15000);
      attempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        open();
      }, delay);
    }
  },
}));
