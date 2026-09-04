import { Popover } from "../common/Popover";
import { Checkbox } from "../common/Checkbox";
import { classNames } from "../../lib/format";
import { IconChevron } from "../icons/Icon";

export interface MultiOption {
  value: string;
  label: string;
}

/**
 * A filter that takes several values at once.
 *
 * The closed state shows a count rather than the selection itself: one filter
 * can now hold four statuses, and spelling them out would either wrap the
 * whole toolbar or truncate to a first value that misrepresents what's
 * applied. What is actually selected is spelled out in the chips under the
 * toolbar, where there is room for it and each value can be removed
 * individually.
 */
export function MultiSelect({
  label, options, selected, onChange, allLabel = "Все", className,
}: {
  label: string;
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel?: string;
  className?: string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label ?? selected[0]
        : `Выбрано: ${selected.length}`;

  return (
    <Popover
      panelClassName="max-h-72 overflow-y-auto"
      trigger={(open, toggleOpen) => (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          className={classNames(
            "btn-fx flex w-full items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            selected.length > 0 ? "border-accent/50 bg-accent-soft text-accent" : "border-line bg-bg-2 text-txt-1",
            className
          )}
        >
          <span className="truncate">{summary}</span>
          <IconChevron size={11} direction={open ? "up" : "down"} className="shrink-0 opacity-60" />
        </button>
      )}
    >
      {() => (
        <div className="w-56 p-1.5">
          <div className="mb-1 flex items-center justify-between gap-2 px-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-txt-3">{label}</span>
            {selected.length > 0 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="btn-fx rounded px-1 text-2xs text-txt-2 hover:text-accent"
              >
                Сбросить
              </button>
            )}
          </div>
          {options.length === 0 ? (
            <div className="px-1 py-2 text-2xs text-txt-3">Нет значений</div>
          ) : (
            // Checkbox renders its own <label>, so this wrapper is a div —
            // nesting labels would leave the inner control with an ambiguous
            // owner and break the click-the-text-to-toggle behaviour.
            options.map((o) => (
              <div key={o.value} className="rounded hover:bg-bg-3">
                <Checkbox
                  checked={selected.includes(o.value)}
                  onChange={() => toggle(o.value)}
                  className="tap-sm w-full px-1 py-1 text-xs text-txt-1"
                >
                  {o.label}
                </Checkbox>
              </div>
            ))
          )}
        </div>
      )}
    </Popover>
  );
}
