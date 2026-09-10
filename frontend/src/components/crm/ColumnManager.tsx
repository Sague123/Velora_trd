import { Popover } from "../common/Popover";
import { Checkbox } from "../common/Checkbox";
import { LEAD_COLUMNS } from "./leadColumns";
import type { useLeadColumns } from "../../hooks/useLeadColumns";
import { classNames } from "../../lib/format";
import { buttonCls } from "../../lib/ui";
import { IconChevron, IconColumns } from "../icons/Icon";

/**
 * Which columns this manager wants, and in what order.
 *
 * Reordering is up/down buttons rather than drag-and-drop on purpose: the list
 * is short, the buttons work with a keyboard and on a phone (where a drag
 * fights the page scroll for the same gesture), and it needs no library. The
 * cost is one extra tap to move a column three places — an operation nobody
 * repeats often enough for that to matter.
 */
export function ColumnManager({ columns }: { columns: ReturnType<typeof useLeadColumns> }) {
  const { layout, toggle, move, reset } = columns;
  const hiddenCount = layout.hidden.length;

  return (
    <Popover
      align="right"
      // The CRM filter bar animates in, and an animated ancestor is its own
      // stacking context — an absolutely positioned panel inside it renders
      // *under* the bulk bar and table no matter how high its z-index.
      portal
      panelClassName="max-h-[70vh] overflow-y-auto"
      trigger={(open, toggleOpen) => (
        <button
          type="button"
          onClick={toggleOpen}
          aria-expanded={open}
          title="Колонки"
          className={buttonCls("secondary", "md", "gap-1.5")}
        >
          <IconColumns size={12} />
          Колонки
          {hiddenCount > 0 && (
            <span className="tabular rounded bg-bg-3 px-1 text-3xs text-txt-3">{LEAD_COLUMNS.length - hiddenCount}</span>
          )}
        </button>
      )}
    >
      {() => (
        <div className="w-64 p-1.5">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-2xs font-semibold uppercase tracking-wide text-txt-3">Колонки таблицы</span>
            <button onClick={reset} className="btn-fx rounded px-1 text-2xs text-txt-2 hover:text-accent">
              По умолчанию
            </button>
          </div>
          {layout.order.map((id, i) => {
            const col = LEAD_COLUMNS.find((c) => c.id === id);
            if (!col) return null;
            const shown = !layout.hidden.includes(id);
            return (
              <div key={id} className="flex items-center gap-1 rounded pr-0.5 hover:bg-bg-3">
                <Checkbox
                  checked={shown}
                  onChange={() => toggle(id)}
                  className={classNames("tap-sm min-w-0 flex-1 px-1 py-1 text-xs", shown ? "text-txt-1" : "text-txt-3")}
                >
                  <span className="truncate">{col.label}</span>
                </Checkbox>
                <button
                  onClick={() => move(id, -1)}
                  disabled={i === 0}
                  aria-label={`Поднять «${col.label}»`}
                  className="btn-fx rounded p-0.5 text-txt-3 hover:text-accent disabled:opacity-25"
                >
                  <IconChevron size={11} direction="up" />
                </button>
                <button
                  onClick={() => move(id, 1)}
                  disabled={i === layout.order.length - 1}
                  aria-label={`Опустить «${col.label}»`}
                  className="btn-fx rounded p-0.5 text-txt-3 hover:text-accent disabled:opacity-25"
                >
                  <IconChevron size={11} direction="down" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </Popover>
  );
}
