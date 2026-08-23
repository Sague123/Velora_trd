import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Client-side only — a per-browser watchlist, same pattern as bots/settings
 * elsewhere in this app. No backend favorites table exists; this doesn't
 * pretend to sync across devices. */
interface FavoritesState {
  symbols: string[];
  toggle: (symbol: string) => void;
  isFavorite: (symbol: string) => boolean;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      symbols: [],
      toggle: (symbol) =>
        set((s) => ({
          symbols: s.symbols.includes(symbol) ? s.symbols.filter((x) => x !== symbol) : [...s.symbols, symbol],
        })),
      isFavorite: (symbol) => get().symbols.includes(symbol),
    }),
    { name: "velora-favorites" }
  )
);
