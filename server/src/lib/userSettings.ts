import { z } from "zod";

/**
 * Per-user preferences, stored as one JSONB document (user_settings.data).
 *
 * The schema is the single source of truth for both shape and defaults:
 * every read is parsed through it, so a document written by an older build
 * (missing a key added since) comes back complete, and a stray key from a
 * newer or hand-edited one is dropped rather than echoed to the client.
 *
 * These are preferences, not account state — nothing here moves money. The
 * trading block only pre-fills the order ticket; every order is still
 * validated by the engine on its own terms.
 */

const channels = z.object({
  inApp: z.boolean().default(true),
  email: z.boolean().default(false),
  push: z.boolean().default(false),
}).default({});

const pct = z.number().min(0).max(100).nullable().default(null);

export const settingsSchema = z.object({
  appearance: z.object({
    theme: z.enum(["dark", "light", "system"]).default("dark"),
    density: z.enum(["compact", "comfortable"]).default("compact"),
    animations: z.boolean().default(true),
    tooltips: z.boolean().default(true),
    // The authenticated shell's navigation: always labelled, icons only, or
    // labels that collapse on narrow desktop widths.
    navLabels: z.enum(["always", "auto", "icons"]).default("auto"),
    language: z.string().min(2).max(8).default("ru"),
  }).default({}),

  trading: z.object({
    amountMode: z.enum(["BASE", "QUOTE", "MARGIN"]).default("BASE"),
    // Decimal string, like every amount the API accepts — never a float.
    defaultAmount: z.string().regex(/^\d+(\.\d+)?$/).nullable().default(null),
    leverage: z.number().int().min(1).max(125).default(1),
    orderType: z.enum(["MARKET", "LIMIT", "STOP"]).default("MARKET"),
    confirmOrders: z.boolean().default(false),
    stopLossPct: pct,
    takeProfitPct: pct,
    riskPerTradePct: pct,
    showFees: z.boolean().default(true),
    showLiquidation: z.boolean().default(true),
    showAvailableMargin: z.boolean().default(true),
    pnlDisplay: z.enum(["CURRENCY", "PERCENT", "BOTH"]).default("BOTH"),
    confirmClose: z.boolean().default(true),
  }).default({}),

  charts: z.object({
    timeframe: z.enum(["1m", "5m", "15m", "1H", "4H", "1D", "1W"]).default("1H"),
    chartType: z.enum(["CANDLES", "BARS", "LINE", "AREA"]).default("CANDLES"),
    showVolume: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    crosshair: z.enum(["NORMAL", "MAGNET"]).default("NORMAL"),
    autoScale: z.boolean().default(true),
    showPositions: z.boolean().default(true),
    showOrders: z.boolean().default(true),
    rememberLayout: z.boolean().default(true),
  }).default({}),

  notifications: z.object({
    orderFilled: channels,
    slTpTriggered: channels,
    marginWarning: channels,
    newLogin: channels,
    securityChanges: channels,
    maintenance: channels,
    news: channels,
  }).default({}),
});

export type UserSettings = z.infer<typeof settingsSchema>;

/** A partial update: any section, any subset of its keys. */
export const settingsPatchSchema = z.object({
  appearance: settingsSchema.shape.appearance.removeDefault().partial().optional(),
  trading: settingsSchema.shape.trading.removeDefault().partial().optional(),
  charts: settingsSchema.shape.charts.removeDefault().partial().optional(),
  notifications: z.record(z.string(), channels.removeDefault().partial()).optional(),
}).strict();

export type UserSettingsPatch = z.infer<typeof settingsPatchSchema>;

/** Stored document + defaults, dropping anything the schema doesn't know. */
export function normalizeSettings(stored: unknown): UserSettings {
  const res = settingsSchema.safeParse(stored ?? {});
  // A document that no longer validates (a value the schema since tightened)
  // falls back per section rather than failing the whole read.
  if (res.success) return res.data;
  const base = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(settingsSchema.shape) as (keyof UserSettings)[]) {
    const section = settingsSchema.shape[key].safeParse(base[key] ?? {});
    out[key] = section.success ? section.data : settingsSchema.shape[key].parse({});
  }
  return out as UserSettings;
}

/** Shallow merge per section (per event for notifications), then normalise. */
export function applyPatch(current: UserSettings, patch: UserSettingsPatch): UserSettings {
  const notifications: Record<string, unknown> = { ...current.notifications };
  for (const [event, ch] of Object.entries(patch.notifications ?? {})) {
    if (event in current.notifications) {
      notifications[event] = { ...(current.notifications as Record<string, object>)[event], ...ch };
    }
  }
  return normalizeSettings({
    appearance: { ...current.appearance, ...patch.appearance },
    trading: { ...current.trading, ...patch.trading },
    charts: { ...current.charts, ...patch.charts },
    notifications,
  });
}
