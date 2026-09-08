import type { ReactNode } from "react";
import { classNames } from "../../lib/format";

/**
 * The bordered surface everything sits on.
 *
 * There were ~136 hand-written variants of `rounded-lg border border-line
 * bg-bg-1 p-3` around the app, drifting in radius (lg vs xl), padding (p-3
 * vs p-3.5 vs p-4) and whether the header row was inside or outside the
 * border. The design system's rule is that radius follows the size of the
 * surface, so `size` picks both together rather than leaving each call site
 * to pair them by hand.
 *
 * `title` renders the standard section header — small, uppercase, dimmed —
 * on its own divider row, which is what most of those call sites were
 * rebuilding each time.
 */
export function Card({
  children,
  title,
  action,
  size = "md",
  padded = true,
  className,
  bodyClassName,
}: {
  children: ReactNode;
  title?: ReactNode;
  /** Right-aligned control in the header row (a filter, a "see all" link). */
  action?: ReactNode;
  /** `md` is a panel (8px radius); `lg` is a large surface like a hero or modal (12px). */
  size?: "md" | "lg";
  padded?: boolean;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div
      className={classNames(
        "flex flex-col border border-line bg-bg-1",
        size === "lg" ? "rounded-xl" : "rounded-lg",
        className
      )}
    >
      {(title || action) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line-soft px-3 py-2">
          {typeof title === "string" ? (
            <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">{title}</span>
          ) : (
            title
          )}
          {action}
        </div>
      )}
      <div className={classNames("min-h-0 flex-1", padded && "p-3", bodyClassName)}>{children}</div>
    </div>
  );
}
