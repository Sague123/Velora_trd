import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

export type BadgeTone = "neutral" | "accent" | "buy" | "sell" | "warn";

const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-bg-3 text-txt-3",
  accent: "border-accent/40 bg-accent-soft text-accent",
  buy: "border-buy/40 bg-buy-soft text-buy",
  sell: "border-sell/40 bg-sell-soft text-sell",
  warn: "border-warn/40 bg-warn/10 text-warn",
};

/**
 * The small classifying label: SPOT/PERP on an instrument, USER/ADMIN on an
 * account, a source or status marker on a row.
 *
 * Every one of these was written by hand before, which is why some carried a
 * border and some didn't, and why the same SPOT tag rendered at three
 * different sizes on three screens. `tone` is meaning, not decoration — buy
 * and sell stay reserved for market direction, per the design system.
 */
export function Badge({
  children,
  tone = "neutral",
  size = "sm",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** `xs` is for dense table rows; `sm` is the default elsewhere. */
  size?: "xs" | "sm";
  className?: string;
}) {
  return (
    <span
      className={classNames(
        "inline-flex shrink-0 items-center gap-1 rounded border font-medium uppercase tracking-wide",
        size === "xs" ? "px-1 py-px text-3xs" : "px-1.5 py-0.5 text-2xs",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
