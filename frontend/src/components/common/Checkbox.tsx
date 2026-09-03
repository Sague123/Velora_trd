import type { ReactNode } from "react";
import { classNames } from "../../lib/format";
import { IconCheck } from "../icons/Icon";

/**
 * A real `<input type="checkbox">` (sr-only, not display:none — keeps full
 * keyboard/screen-reader semantics), with a custom box driven by Tailwind's
 * `peer-*` states. Same technique already proven in the terminal's SMA/EMA
 * legend toggles (ChartPanel.tsx's IndicatorToggle) — extracted here as a
 * shared primitive rather than copied a third time, since this is now used
 * in more than one place outside the terminal.
 */
export function Checkbox({
  checked, onChange, children, className,
}: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; className?: string }) {
  return (
    <label className={classNames("flex cursor-pointer items-center gap-2", className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={classNames(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-line bg-bg-2 transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent",
          checked && "border-accent bg-accent"
        )}
      >
        {checked && <IconCheck size={9} className="text-white" />}
      </span>
      {children}
    </label>
  );
}
