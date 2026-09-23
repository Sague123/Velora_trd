import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "dark" | "light";
/** What the person chose; `theme` is what that resolves to right now. */
export type ThemeMode = Theme | "system";

interface ThemeState {
  mode: ThemeMode;
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  setMode: (m: ThemeMode) => void;
}

const systemQuery = () =>
  typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: light)") : null;
const resolve = (m: ThemeMode): Theme => (m === "system" ? (systemQuery()?.matches ? "light" : "dark") : m);

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      theme: "dark",
      toggle: () => {
        const next: Theme = get().theme === "dark" ? "light" : "dark";
        set({ mode: next, theme: next });
      },
      setTheme: (theme) => set({ mode: theme, theme }),
      setMode: (mode) => set({ mode, theme: resolve(mode) }),
    }),
    {
      name: "velora-theme",
      // A stored "system" is re-resolved on load: the OS may have switched
      // since the value was written.
      onRehydrateStorage: () => (state) => {
        if (state?.mode === "system") state.setMode("system");
      },
    }
  )
);

// Follow the OS live while the choice is "system".
systemQuery()?.addEventListener?.("change", () => {
  const { mode, setMode } = useThemeStore.getState();
  if (mode === "system") setMode("system");
});
