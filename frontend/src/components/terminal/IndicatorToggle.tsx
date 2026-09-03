import { classNames } from "../../lib/format";
import { IconCheck } from "../icons/Icon";

/** SMA/EMA legend toggle — a real `<input type="checkbox">`, visually hidden
 * (`sr-only`, not `hidden`/`display:none`) so it keeps full keyboard/screen-
 * reader semantics, with a custom box driven by Tailwind's `peer` variants
 * for the checked/focus-visible states. Shared by ChartPanel's own (desktop)
 * toolbar and ChartToolbar's (mobile) Indicators menu — both toggle the same
 * shared store values (store/terminal.ts), so this is just the one widget. */
export function IndicatorToggle({
  checked, onChange, textClass, boxCheckedClass, label,
}: { checked: boolean; onChange: (v: boolean) => void; textClass: string; boxCheckedClass: string; label: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        className={classNames(
          "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border border-line bg-bg-2 transition-colors",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-1 peer-focus-visible:outline-accent",
          checked && boxCheckedClass
        )}
      >
        {checked && <IconCheck size={9} className="text-white" />}
      </span>
      <span className={textClass}>{label}</span>
    </label>
  );
}
