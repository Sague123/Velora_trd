import { useState } from "react";

// Matches .anim-rise-out's own duration in globals.css — change both
// together if that ever moves.
const EXIT_MS = 220;

/**
 * Delays a modal's real onClose by the CSS exit-animation duration, so the
 * card can play `.anim-rise-out` instead of vanishing instantly on close —
 * the counterpart to `.anim-rise`'s entrance. Three modals in the terminal
 * need the exact same sequence, hence one shared hook rather than three
 * copies of the same setTimeout dance.
 *
 * Route every dismissal path (backdrop click, Cancel/X, and a successful
 * submit) through `requestClose` instead of calling `onClose` directly, so
 * the exit plays no matter how the modal was closed.
 */
export function useModalExit(onClose: () => void) {
  const [closing, setClosing] = useState(false);

  function requestClose() {
    if (closing) return; // already animating out — ignore a second trigger
    setClosing(true);
    setTimeout(onClose, EXIT_MS);
  }

  return { closing, requestClose };
}
