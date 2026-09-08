import type { ComponentType, ReactNode } from "react";
import { classNames } from "../../lib/format";
import { buttonCls } from "../../lib/ui";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
  Icon?: ComponentType<{ size?: number; className?: string }>;
  /** Admin-ish entries tint with `warn` instead of `accent`. */
  warn?: boolean;
}

/**
 * Every tab strip in the product.
 *
 * There were three visual languages for "pick one of these" — a bordered
 * segment (Markets categories, the order ticket's amount mode), an underline
 * (the terminal's bottom panel), and a soft pill (Profile's sections) — plus
 * a handful of one-off strips that matched none of them.
 *
 * The two variants that survive are told apart by what the choice *does*,
 * the same way `buttonCls`'s variants are:
 *
 * - `segment` filters one set of data that stays on screen — Spot/Perp,
 *   7D/1M, BTC/Total/Margin. The chosen option is filled, the rest keep a
 *   visible border so they still read as pressable.
 * - `underline` swaps which panel of content is shown — Profile's sections,
 *   the terminal's Positions/Orders/History. It sits on a container edge and
 *   marks the active panel rather than looking like a control.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  variant = "segment",
  scroll = false,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  variant?: "segment" | "underline";
  /** Let the strip scroll sideways instead of squeezing labels (narrow screens). */
  scroll?: boolean;
  className?: string;
}) {
  if (variant === "underline") {
    return (
      <div
        role="tablist"
        className={classNames(
          "flex items-center gap-0.5 border-b border-line px-1 py-1",
          scroll && "overflow-x-auto",
          className
        )}
      >
        {items.map(({ id, label, Icon, warn }) => {
          const active = id === value;
          return (
            <button
              key={id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(id)}
              className={classNames(
                "btn-fx tap-sm flex shrink-0 items-center gap-1.5 rounded border-b-2 px-3 py-1.5 text-2xs font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
                active
                  ? warn
                    ? "border-warn bg-bg-2 text-warn shadow-btn"
                    : "border-accent bg-bg-2 text-txt-0 shadow-btn"
                  : "border-transparent text-txt-2 hover:bg-bg-2/60 hover:text-txt-0"
              )}
            >
              {Icon && <Icon size={14} className={active && !warn ? "text-accent" : undefined} />}
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      className={classNames(
        "flex gap-1 rounded-lg border border-line-soft bg-bg-1 p-1",
        scroll && "overflow-x-auto",
        className
      )}
    >
      {items.map(({ id, label, Icon }) => {
        const active = id === value;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={classNames("gap-1", buttonCls(active ? "primary" : "secondary", "sm"))}
          >
            {Icon && <Icon size={11} />}
            {label}
          </button>
        );
      })}
    </div>
  );
}
