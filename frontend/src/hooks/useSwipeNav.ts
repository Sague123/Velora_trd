import { useRef } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Swipe left/right over the content pane to move to the next/previous tab in
 * `order`. Deliberately defers to anything scrollable under the touch first —
 * a CRM/Admin table's `overflow-x-auto` — by walking up the DOM from the
 * touch target and bailing out if an ancestor still has room to scroll in
 * that direction. Without that check, swiping to scroll a wide table sideways
 * would also fire a tab change.
 *
 * The trading chart needs its own, unconditional escape hatch rather than
 * this scroll-room check: it isn't an `overflow-x` element at all — panning
 * it is pointer-event drawing on a `<canvas>` (see lib/chartEngine.ts) — so
 * `canScrollX` below is never true for it, and a horizontal drag on the chart
 * would otherwise both pan the chart *and* fire a tab change underneath it.
 * Any element (or ancestor) carrying `data-swipe-nav-ignore` is exempt
 * outright; ChartPanel puts it on the canvas's wrapper.
 */
export function useSwipeNav(order: string[], currentPath: string, enabled: boolean) {
  const navigate = useNavigate();
  const startRef = useRef<{ x: number; y: number } | null>(null);

  function shouldIgnore(target: EventTarget | null): boolean {
    let el = target as HTMLElement | null;
    let depth = 0;
    while (el && depth < 12) {
      if (el.dataset?.swipeNavIgnore !== undefined) return true;
      el = el.parentElement;
      depth++;
    }
    return false;
  }

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
    // A real swipe: mostly horizontal and far enough not to be a tap, a
    // vertical-scroll jitter reading as a tiny bit of X movement too, or an
    // everyday diagonal drag (dragging a TP/SL line on the chart, adjusting
    // the leverage slider) getting misread as "swipe to change page". Both
    // numbers were too permissive — 60px is a fifth of a small phone's
    // width, and 1.4x let a fairly diagonal drag through as "mostly
    // horizontal" — so this now asks for a longer, straighter gesture.
    if (Math.abs(dx) < 80 || Math.abs(dx) < Math.abs(dy) * 2) return;
    if (shouldIgnore(e.target)) return;
    if (scrollableAncestorHasRoom(e.target, dx)) return;
    const idx = order.indexOf(currentPath);
    if (idx === -1) return;
    const nextIdx = dx < 0 ? idx + 1 : idx - 1;
    if (nextIdx < 0 || nextIdx >= order.length) return;
    navigate(order[nextIdx]);
  }

  return { onTouchStart, onTouchEnd };
}
