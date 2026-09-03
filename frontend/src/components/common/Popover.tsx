import { useEffect, useRef, useState, type ReactNode } from "react";
import { classNames } from "../../lib/format";

/**
 * A trigger + a small anchored panel, dismissed by an outside tap/click or
 * Escape. Built for the mobile terminal's compact controls (timeframe,
 * indicators, drawing tools, the nav's "More" menu) — the same
 * absolute-panel-under-a-button shape already used ad hoc elsewhere
 * (PositionsTable's TP/SL editor), pulled out once four more call sites
 * needed the identical open/close/outside-click wiring.
 */
export function Popover({
  trigger, children, align = "left", panelClassName,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "center";
  panelClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      {trigger(open, () => setOpen((v) => !v))}
      {open && (
        <div
          className={classNames(
            "absolute top-full z-40 mt-1.5 min-w-max rounded-lg border border-line bg-bg-2 shadow-lift",
            align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
            panelClassName
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
