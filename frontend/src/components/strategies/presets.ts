import type { GridConfig, MartingaleConfig, OrderSide } from "../../lib/types";

/**
 * The three risk profiles offered on the Strategies page, with the concrete
 * numbers each one stands for.
 *
 * Two of the advertised parameters are **not enforced by the engine** and are
 * flagged as such wherever they're shown (see `enforced` below):
 *
 * - Grid spacing: server/src/engine/strategy.ts places rungs at
 *   `lower + (upper-lower)/levels * i` — arithmetic, always. Geometric spacing
 *   would be an engine change, which this pass deliberately doesn't make.
 * - Stop-Loss: the bot engine has no stop-loss of any kind, for either type.
 *   Showing one as if it worked would promise a safety net that isn't there,
 *   so it is displayed as a preset intention, dimmed and marked.
 *
 * Everything else here maps onto a real field the server validates and the
 * engine acts on.
 */

export type RiskKey = "conservative" | "balanced" | "aggressive";
export type PresetTone = "buy" | "warn" | "sell";

interface PresetBase {
  key: RiskKey;
  label: string;
  tone: PresetTone;
  /** One line on who this profile is for — shown under the label. */
  blurb: string;
}

export interface GridPreset extends PresetBase {
  /** Half-width of the grid band around the current price, in percent. */
  rangePct: number;
  levels: number;
  spacing: "Arithmetic" | "Geometric";
  leverage: number;
  stopLossPct: number;
}

export interface MartingalePreset extends PresetBase {
  multiplier: number;
  /** Safety orders after the base one — the engine's `maxSteps`. */
  maxSafetyOrders: number;
  /** Price move against the position that triggers the next safety order. */
  deviationPct: number;
  takeProfitPct: number;
  stopLossPct: number;
}

export const GRID_PRESETS: GridPreset[] = [
  { key: "conservative", label: "Conservative", tone: "buy", blurb: "Узкий диапазон, без плеча", rangePct: 3, levels: 4, spacing: "Arithmetic", leverage: 1, stopLossPct: 5 },
  { key: "balanced", label: "Balanced", tone: "warn", blurb: "Средний диапазон, умеренное плечо", rangePct: 8, levels: 6, spacing: "Geometric", leverage: 3, stopLossPct: 10 },
  { key: "aggressive", label: "Aggressive", tone: "sell", blurb: "Широкий диапазон, высокое плечо", rangePct: 15, levels: 10, spacing: "Geometric", leverage: 8, stopLossPct: 20 },
];

export const MARTINGALE_PRESETS: MartingalePreset[] = [
  { key: "conservative", label: "Conservative", tone: "buy", blurb: "Короткая серия, ранний выход", multiplier: 1.3, maxSafetyOrders: 3, deviationPct: 2, takeProfitPct: 1.5, stopLossPct: 8 },
  { key: "balanced", label: "Balanced", tone: "warn", blurb: "Средняя серия докупок", multiplier: 1.6, maxSafetyOrders: 5, deviationPct: 1.5, takeProfitPct: 2, stopLossPct: 15 },
  { key: "aggressive", label: "Aggressive", tone: "sell", blurb: "Длинная серия, крупные докупки", multiplier: 2, maxSafetyOrders: 8, deviationPct: 1, takeProfitPct: 3, stopLossPct: 25 },
];

/** Martingale presets run unlevered on purpose: the engine measures both
 * `takeProfitPct` and `addOnDrawdownPct` as ROE, and ROE only equals the raw
 * price move at 1x. At any other leverage the preset's "deviation 2%" would
 * quietly mean a different price move than it says. */
export const MARTINGALE_PRESET_LEVERAGE = 1;

export const gridPreset = (key: RiskKey) => GRID_PRESETS.find((p) => p.key === key) ?? GRID_PRESETS[1];
export const martingalePreset = (key: RiskKey) => MARTINGALE_PRESETS.find((p) => p.key === key) ?? MARTINGALE_PRESETS[1];

/** Sum of the multiplier series the engine walks: base order plus each safety
 * order, in units of the base quantity (mirrors estimatedCapital() server-side). */
export function martingaleQtyFactor(multiplier: number, maxSafetyOrders: number): number {
  let f = 0;
  for (let i = 0; i < Math.max(1, maxSafetyOrders); i++) f += Math.pow(multiplier, i);
  return f;
}

/** Fields of the grid form a preset fills in, given the money the trader put in
 * the "сколько вложить" box and the instrument's current price.
 *
 * Capital is split the way the server counts it (estimatedCapital): margin per
 * rung × (levels + 1), since the ladder places a rung at both ends. */
export function gridDraftFromPreset(preset: GridPreset, price: number, capital: number) {
  const lower = price * (1 - preset.rangePct / 100);
  const upper = price * (1 + preset.rangePct / 100);
  const mid = (lower + upper) / 2;
  const rungs = preset.levels + 1;
  const qtyPerLevel = mid > 0 ? (capital * preset.leverage) / (mid * rungs) : 0;
  return {
    lower: lower > 0 ? lower.toFixed(8) : "",
    upper: upper > 0 ? upper.toFixed(8) : "",
    levels: String(preset.levels),
    qtyPerLevel: qtyPerLevel > 0 ? qtyPerLevel.toFixed(8) : "",
    leverage: String(preset.leverage),
  };
}

export function martingaleDraftFromPreset(preset: MartingalePreset, price: number, capital: number, side: OrderSide) {
  const factor = martingaleQtyFactor(preset.multiplier, preset.maxSafetyOrders);
  const baseQty = price > 0 && factor > 0 ? (capital * MARTINGALE_PRESET_LEVERAGE) / (price * factor) : 0;
  return {
    side,
    baseQty: baseQty > 0 ? baseQty.toFixed(8) : "",
    multiplier: String(preset.multiplier),
    maxSteps: String(preset.maxSafetyOrders),
    takeProfitPct: String(preset.takeProfitPct),
    addOnDrawdownPct: String(preset.deviationPct),
    leverage: String(MARTINGALE_PRESET_LEVERAGE),
  };
}

export type GridDraft = ReturnType<typeof gridDraftFromPreset>;
export type MartingaleDraft = ReturnType<typeof martingaleDraftFromPreset>;

/** What the whole series costs if every safety order fires — the number that
 * actually bounds a martingale's downside, since the engine has no stop-loss.
 * This is the honest version of "защита от слива депозита": the series is
 * finite because `maxSteps` is, and this is how big it gets. */
export function martingaleWorstCase(draft: MartingaleDraft, price: number) {
  const baseQty = Number(draft.baseQty) || 0;
  const multiplier = Number(draft.multiplier) || 0;
  const steps = Math.trunc(Number(draft.maxSteps)) || 0;
  const leverage = Math.max(1, Math.trunc(Number(draft.leverage)) || 1);
  if (!(baseQty > 0) || !(multiplier > 0) || steps < 1 || !(price > 0)) return null;
  const totalQty = baseQty * martingaleQtyFactor(multiplier, steps);
  const notional = totalQty * price;
  return { totalQty, notional, margin: notional / leverage, steps };
}

export function gridConfigFromDraft(draft: GridDraft): GridConfig | null {
  const lower = Number(draft.lower), upper = Number(draft.upper);
  const levels = Math.trunc(Number(draft.levels));
  const qty = Number(draft.qtyPerLevel);
  const leverage = Math.max(1, Math.trunc(Number(draft.leverage)) || 1);
  if (!(lower > 0) || !(upper > lower) || !(qty > 0) || !(levels >= 2)) return null;
  // Money-shaped fields go over the wire as fixed-precision decimal strings —
  // the server stores scaled integers and a float would be where precision
  // could be lost on the way in.
  return { lower: lower.toFixed(8), upper: upper.toFixed(8), levels, qtyPerLevel: qty.toFixed(8), leverage };
}

export function martingaleConfigFromDraft(draft: MartingaleDraft): MartingaleConfig | null {
  const baseQty = Number(draft.baseQty);
  const multiplier = Number(draft.multiplier);
  const maxSteps = Math.trunc(Number(draft.maxSteps));
  const takeProfitPct = Number(draft.takeProfitPct);
  const addOnDrawdownPct = Number(draft.addOnDrawdownPct);
  const leverage = Math.max(1, Math.trunc(Number(draft.leverage)) || 1);
  if (!(baseQty > 0) || !(multiplier > 1) || !(maxSteps >= 1)) return null;
  if (!(takeProfitPct > 0) || !(addOnDrawdownPct > 0)) return null;
  return { side: draft.side, baseQty: baseQty.toFixed(8), multiplier, maxSteps, takeProfitPct, addOnDrawdownPct, leverage };
}
