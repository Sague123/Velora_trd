import { useMemo, useState } from "react";
import { classNames } from "../../lib/format";

export type SortDir = 1 | -1;

export type SortCol<T, K extends string> = {
  key: K;
  label: string;
  align?: "right";
  /** Ascending comparator; the hook applies the direction. */
  compare: (a: T, b: T) => number;
  /**
   * Direction the first click on this column applies. Text columns read
   * naturally A→Я, money and dates read newest/largest first — defaulting
   * everything to one direction is what makes a first click on a name column
   * come back Я→А for no reason.
   */
  firstDir?: SortDir;
};

export type SortState<K extends string> = { key: K; dir: SortDir };

/**
 * Client-side sorting for tables that already hold their whole dataset in
 * memory — positions, orders, the account history.
 *
 * Deliberately separate from the CRM's own SortHeader: there the sort is a
 * query parameter the server applies across pages it hasn't sent yet, so the
 * two cannot share an implementation without one of them lying about what it
 * sorted.
 *
 * `cols` must be a stable reference (declare it at module scope) — it is a
 * dependency of the memoised sort, and a fresh array each render would re-sort
 * on every render.
 */
export function useTableSort<T, K extends string>(
  rows: T[],
  cols: SortCol<T, K>[],
  initial: SortState<K>,
) {
  const [sort, setSort] = useState<SortState<K>>(initial);

  const byKey = useMemo(() => {
    const m = {} as Record<K, SortCol<T, K>>;
    for (const c of cols) m[c.key] = c;
    return m;
  }, [cols]);

  const sorted = useMemo(() => {
    const col = byKey[sort.key];
    if (!col) return rows;
    return [...rows].sort((a, b) => sort.dir * col.compare(a, b));
  }, [rows, sort, byKey]);

  function toggle(key: K) {
    setSort((s) =>
      s.key === key
        ? { key, dir: (s.dir === 1 ? -1 : 1) as SortDir }
        : { key, dir: byKey[key]?.firstDir ?? -1 },
    );
  }

  return { sorted, sort, toggle };
}

/** One clickable column header, in the dense table header's own styling. */
export function SortTh<T, K extends string>({
  col, sort, onToggle,
}: {
  col: SortCol<T, K>;
  sort: SortState<K>;
  onToggle: (key: K) => void;
}) {
  const active = sort.key === col.key;
  return (
    <th
      className={classNames("px-2 py-1.5 font-medium", col.align === "right" && "text-right")}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
    >
      <button
        onClick={() => onToggle(col.key)}
        className={classNames(
          "btn-fx rounded font-medium hover:text-txt-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
          active ? "text-txt-1" : "text-txt-3",
        )}
      >
        {col.label}
        {/* Always rendered, hidden when inactive: the arrow appearing on click
            would otherwise widen the header and shift every column beside it. */}
        <span aria-hidden className={classNames("ml-0.5", !active && "invisible")}>
          {sort.dir === 1 ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}
