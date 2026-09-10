import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
  trigger, children, align = "left", side = "bottom", panelClassName, portal = false,
}: {
  trigger: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "center";
  /** Which way the panel opens. "top" is for triggers pinned to the bottom
   * of the screen (the mobile nav bar), where a downward panel would open
   * off-screen. */
  side?: "bottom" | "top";
  panelClassName?: string;
  /**
   * Render the panel into `document.body` instead of next to the trigger.
   *
   * An absolutely positioned panel is clipped by any ancestor that scrolls or
   * hides its overflow, which is exactly the situation inside the CRM table —
   * a horizontally scrolling container full of cells that truncate. There the
   * panel simply disappeared. Positioning is measured from the trigger and
   * re-measured on scroll/resize, so the panel still tracks its button.
   */
  portal?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!open) return;
    function onOutside(e: PointerEvent) {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
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

  // Re-measure while open: the trigger moves when the page or the table it
  // sits in is scrolled, and a panel left behind at stale coordinates is
  // worse than one that is clipped.
  useLayoutEffect(() => {
    if (!open || !portal) return;
    const measure = () => setRect(rootRef.current?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, portal]);

  const panelCls = classNames(
    // max-w clamps every popover to the viewport regardless of which
    // align a call site picked — a backstop for the case align alone
    // can't fix: a trigger close enough to the screen edge that even
    // "right" would clip the panel's own far side.
    "z-40 min-w-max max-w-[calc(100vw-16px)] rounded-lg border border-line bg-bg-2 shadow-lift",
    panelClassName
  );

  const panel = !open ? null : portal && rect ? (
    createPortal(
      <div
        ref={panelRef}
        // maxHeight is set inline below; without a scroller a long list
        // would simply be cut off at the viewport edge.
        className={classNames("fixed overflow-y-auto", panelCls)}
        style={{
          // Clamped to the viewport so a trigger near the right edge still
          // opens a fully visible panel.
          top: side === "top" ? undefined : Math.min(rect.bottom + 6, window.innerHeight - 8),
          bottom: side === "top" ? Math.max(window.innerHeight - rect.top + 6, 8) : undefined,
          left: align === "right" ? undefined : Math.max(8, Math.min(rect.left, window.innerWidth - 8)),
          right: align === "right" ? Math.max(8, window.innerWidth - rect.right) : undefined,
          maxHeight: side === "top" ? rect.top - 16 : window.innerHeight - rect.bottom - 16,
        }}
      >
        {children(() => setOpen(false))}
      </div>,
      document.body
    )
  ) : portal ? null : (
    <div
      ref={panelRef}
      className={classNames(
        "absolute",
        side === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5",
        align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0",
        panelCls
      )}
    >
      {children(() => setOpen(false))}
    </div>
  );

  return (
    <div ref={rootRef} className="relative">
      {trigger(open, () => setOpen((v) => !v))}
      {panel}
    </div>
  );
}
