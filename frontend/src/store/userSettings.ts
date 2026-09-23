import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiGet, apiPatch } from "../lib/api";
import { setLanguage } from "../i18n";
import i18next from "../i18n";
import { useThemeStore, type ThemeMode } from "./theme";
import type { Timeframe } from "../lib/types";

/**
 * The signed-in user's preferences. Mirrors server/src/lib/userSettings.ts,
 * which owns the shape and the defaults — the server always answers with the
 * complete document, and the client adopts it whole.
 *
 * Cached in localStorage too, so density/motion are right on the very first
 * paint of a reload instead of snapping into place once the fetch returns.
 */

export interface Channels { inApp: boolean; email: boolean; push: boolean }
export type NotificationEvent =
  | "orderFilled" | "slTpTriggered" | "marginWarning"
  | "newLogin" | "securityChanges"
  | "maintenance" | "news";

export interface UserSettings {
  appearance: {
    theme: ThemeMode;
    density: "compact" | "comfortable";
    animations: boolean;
    tooltips: boolean;
    navStyle: "text" | "both" | "icons";
    language: string;
  };
  trading: {
    amountMode: "BASE" | "QUOTE" | "MARGIN";
    defaultAmount: string | null;
    leverage: number;
    orderType: "MARKET" | "LIMIT" | "STOP";
    confirmOrders: boolean;
    stopLossPct: number | null;
    takeProfitPct: number | null;
    riskPerTradePct: number | null;
    showFees: boolean;
    showLiquidation: boolean;
    showAvailableMargin: boolean;
    pnlDisplay: "CURRENCY" | "PERCENT" | "BOTH";
    confirmClose: boolean;
  };
  charts: {
    timeframe: Timeframe;
    chartType: "CANDLES" | "LINE" | "AREA";
    showVolume: boolean;
    showGrid: boolean;
    crosshair: "NORMAL" | "MAGNET";
    autoScale: boolean;
    showPositions: boolean;
    showOrders: boolean;
    rememberLayout: boolean;
  };
  notifications: Record<NotificationEvent, Channels>;
}

export type Appearance = UserSettings["appearance"];

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K] };
export type SettingsPatch = {
  appearance?: Partial<UserSettings["appearance"]>;
  trading?: Partial<UserSettings["trading"]>;
  charts?: Partial<UserSettings["charts"]>;
  notifications?: DeepPartial<UserSettings["notifications"]>;
};

const ch = (inApp = true, email = false, push = false): Channels => ({ inApp, email, push });

export const DEFAULT_SETTINGS: UserSettings = {
  appearance: { theme: "dark", density: "compact", animations: true, tooltips: true, navStyle: "text", language: "ru" },
  trading: {
    amountMode: "BASE", defaultAmount: null, leverage: 1, orderType: "MARKET", confirmOrders: false,
    stopLossPct: null, takeProfitPct: null, riskPerTradePct: null,
    showFees: true, showLiquidation: true, showAvailableMargin: true, pnlDisplay: "BOTH", confirmClose: true,
  },
  charts: {
    timeframe: "1H", chartType: "CANDLES", showVolume: true, showGrid: true, crosshair: "NORMAL",
    autoScale: false, showPositions: true, showOrders: true, rememberLayout: true,
  },
  notifications: {
    orderFilled: ch(), slTpTriggered: ch(), marginWarning: ch(),
    newLogin: ch(), securityChanges: ch(), maintenance: ch(), news: ch(),
  },
};

/**
 * Puts an appearance on screen. Used for the saved value and for the
 * Settings page's live preview alike; the page re-applies the saved value
 * if its edits are discarded.
 */
export function applyAppearance(a: Appearance) {
  const theme = useThemeStore.getState();
  if (theme.mode !== a.theme) theme.setMode(a.theme);
  if (i18next.language !== a.language) setLanguage(a.language);
  const root = document.documentElement;
  root.dataset.density = a.density;
  root.dataset.motion = a.animations ? "on" : "off";
  useUserSettings.setState({ live: a });
}

interface State {
  settings: UserSettings;
  /** What is on screen right now — the saved appearance, or a preview. */
  live: Appearance;
  loaded: boolean;
  load: () => Promise<void>;
  save: (patch: SettingsPatch) => Promise<UserSettings>;
  /** Clears the in-memory copy on logout; the device keeps its look. */
  reset: () => void;
}

export const useUserSettings = create<State>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      live: DEFAULT_SETTINGS.appearance,
      loaded: false,

      load: async () => {
        const settings = await apiGet<UserSettings>("/api/settings");
        set({ settings, loaded: true });
        applyAppearance(settings.appearance);
      },

      save: async (patch) => {
        const settings = await apiPatch<UserSettings>("/api/settings", patch);
        set({ settings, loaded: true });
        if (patch.appearance) applyAppearance(settings.appearance);
        return settings;
      },

      reset: () => set({ settings: DEFAULT_SETTINGS, loaded: false }),
    }),
    {
      name: "velora-user-settings",
      partialize: (s) => ({ settings: s.settings }),
      // A cache written by an older build may lack keys added since; fill
      // them from the defaults so nothing reads undefined.
      merge: (persisted, current) => {
        const p = (persisted as { settings?: Partial<UserSettings> } | undefined)?.settings ?? {};
        const settings: UserSettings = {
          appearance: { ...DEFAULT_SETTINGS.appearance, ...p.appearance },
          trading: { ...DEFAULT_SETTINGS.trading, ...p.trading },
          charts: { ...DEFAULT_SETTINGS.charts, ...p.charts },
          notifications: { ...DEFAULT_SETTINGS.notifications, ...p.notifications },
        };
        return { ...current, settings, live: settings.appearance };
      },
    }
  )
);

/**
 * For the header's own theme/language controls: they change the look for
 * everyone, and for a signed-in user also update the saved preference, so
 * the Settings page and the quick toggles never disagree.
 */
export function rememberAppearance(patch: Partial<Appearance>, signedIn: boolean) {
  const s = useUserSettings.getState();
  useUserSettings.setState({ live: { ...s.live, ...patch } });
  if (signedIn && s.loaded) void s.save({ appearance: patch }).catch(() => undefined);
}
