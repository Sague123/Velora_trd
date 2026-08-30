import { useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Swipe left/right over the content pane to move to the next/previous tab in
 * `order`. Deliberately defers to anything scrollable under the touch first —
 * a CRM/Admin table's `overflow-x-auto`, the trading chart's own pan — by
 * walking up the DOM from the touch target and bailing out if an ancestor
 * still has room to scroll in that direction. Without that check, swiping to
 * scroll a wide table sideways would also fire a tab change.
 */
export function useSwipeNav(order: string[], currentPath: string, enabled: boolean) {
  const navigate = useNavigate();
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function scrollableAncestorHasRoom(target: EventTarget | null, dx: number): boolean {
    let el = target as HTMLElement | null;
    let depth = 0;
    while (el && depth < 10) {
      const style = getComputedStyle(el);
      const canScrollX = /(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
      if (canScrollX) {
        const atRightEdge = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
        const atLeftEdge = el.scrollLeft <= 1;
        // Swiping left (dx<0) drags content leftward, i.e. scrolls toward the
        // right edge — so it's "the table's gesture" only while there's still
        // room to go that way, and likewise for the opposite direction.
        if (dx < 0 && !atRightEdge) return true;
        if (dx > 0 && !atLeftEdge) return true;
      }
      el = el.parentElement;
      depth++;
    }
    return false;
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!enabled) return;
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!enabled) return;
    const start = startRef.current;
    startRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // A real swipe: mostly horizontal and far enough not to be a tap or a
    // vertical-scroll jitter reading as a tiny bit of X movement too.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
    if (scrollableAncestorHasRoom(e.target, dx)) return;
    const idx = order.indexOf(currentPath);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= order.length) return;
    navigate(order[nextIdx]);
  }

  return { onTouchStart, onTouchEnd };
}
