/** All amounts arrive from the API as decimal strings — never coerce through
 * float for anything that will be sent back; these helpers are display-only. */

export function n(v: string | number | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const num = typeof v === "number" ? v : Number.parseFloat(v);
  return Number.isFinite(num) ? num : 0;
}

export function fmt(v: string | number | null | undefined, decimals = 2): string {
  const num = n(v);
  return num.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export function fmtPrice(v: string | number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  return fmt(v, decimals);
}

export function fmtUsd(v: string | number | null | undefined, decimals = 2): string {
  return `$${fmt(v, decimals)}`;
}

export function fmtSigned(v: string | number | null | undefined, decimals = 2): string {
  const num = n(v);
  const s = fmt(Math.abs(num), decimals);
  if (num > 0) return `+${s}`;
  if (num < 0) return `-${s}`;
  return s;
}

export function fmtPct(v: number | null | undefined, decimals = 2): string {
  if (v === null || v === undefined) return "—";
  const s = v.toFixed(decimals);
  return v > 0 ? `+${s}%` : `${s}%`;
}

export function fmtRate(v: number | null | undefined, decimals = 0): string {
  if (v === null || v === undefined) return "—";
  return `${v.toFixed(decimals)}%`;
}

export function fmtCompact(v: string | number | null | undefined): string {
  const num = n(v);
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 2 }).format(num);
}

export function fmtQty(v: string | number | null | undefined, decimals = 6): string {
  const num = n(v);
  const s = num.toFixed(decimals);
  // trim trailing zeros but keep at least 2 places for readability
  return s.replace(/(\.\d{2,}?)0+$/, "$1").replace(/\.$/, "");
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function classNames(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Pretty side-effect-free decimal precision guess for a raw price string,
 * based on magnitude — used only where an instrument's own priceDecimals
 * isn't at hand yet. */
export function guessDecimals(price: number): number {
  if (price >= 1000) return 2;
  if (price >= 1) return 4;
  return 6;
}
