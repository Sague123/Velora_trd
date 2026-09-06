import { useState, type ReactNode } from "react";

export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
      onClick={() => setShow(false)}
    >
      {children}
      {show && (
        <span
          role="tooltip"
          // Same viewport clamp as Popover's panel: several labels here run
          // 100-200+ chars, and without a max-w the old whitespace-nowrap
          // bubble sized to the full single-line string (measured 1044px at
          // a 390px viewport) — invisible today only because every call site
          // happens to sit inside an overflow:hidden ancestor, but the next
          // one that doesn't would reproduce the page-jitter bug directly.
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 w-max max-w-[min(260px,calc(100vw-24px))] -translate-x-1/2 whitespace-normal text-left rounded border border-line bg-bg-4 px-2 py-1 text-2xs text-txt-0 shadow-float"
        >
          {label}
        </span>
      )}
    </span>
  );
}
