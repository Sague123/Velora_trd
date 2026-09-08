import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

export type StatTone = "neutral" | "buy" | "sell" | "warn" | "accent";

const TONES: Record<StatTone, string> = {
  neutral: "text-txt-0",
  buy: "text-buy",
  sell: "text-sell",
  warn: "text-warn",
  accent: "text-accent",
};

const SIZES = {
  sm: { label: "text-3xs", value: "text-2xs font-bold" },
  md: { label: "text-2xs", value: "text-xs font-semibold" },
  lg: { label: "text-2xs", value: "text-sm font-semibold" },
} as const;

/**
 * A caption over a figure — the shape used by the account strip, the mobile
 * bottom stack, Overview's summary row, Profile's balance block and the
 * admin cards, each of which had its own copy with slightly different sizes
 * and a slightly different dimmed label.
 *
 * `tabular` is applied to the value here rather than left to the caller: a
 * column of figures that isn't tabular jitters on every price tick, and
 * these are figures by definition.
 */
export function Stat({
  label,
  value,
  tone = "neutral",
  size = "md",
  align = "left",
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  size?: keyof typeof SIZES;
  align?: "left" | "right";
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <div className={classNames("min-w-0", align === "right" && "text-right", className)}>
      <div className={classNames("truncate text-txt-3", s.label)}>{label}</div>
      <div className={classNames("truncate tabular", s.value, TONES[tone])}>{value}</div>
    </div>
  );
}
