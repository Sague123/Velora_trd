import { useCallback, useEffect, useState } from "react";
import { DEFAULT_COLUMNS, LEAD_COLUMNS, type LeadColumn, type LeadColumnId } from "../components/crm/leadColumns";

interface ColumnLayout {
  /** Every known column, in display order — hidden ones included, so
   * unhiding one puts it back where the user left it rather than at the end. */
  order: LeadColumnId[];
  hidden: LeadColumnId[];
  widths: Partial<Record<LeadColumnId, number>>;
}

const ALL_IDS = LEAD_COLUMNS.map((c) => c.id);
const MIN_WIDTH = 70;
const MAX_WIDTH = 460;

function defaultLayout(): ColumnLayout {
  return {
    order: [...DEFAULT_COLUMNS, ...ALL_IDS.filter((id) => !DEFAULT_COLUMNS.includes(id))],
    hidden: ALL_IDS.filter((id) => !DEFAULT_COLUMNS.includes(id)),
    widths: {},
  };
}

/**
 * Reconciles a stored layout with the columns this build actually has.
 *
 * Ids that no longer exist are dropped, and columns added since the layout was
 * saved are appended *hidden*: a release should not silently rearrange a board
 * someone has already set up, and a new column that quietly appears mid-shift
 * is exactly the kind of surprise that makes people stop trusting their saved
 * view.
 */
function reconcile(stored: Partial<ColumnLayout> | null): ColumnLayout {
  if (!stored?.order?.length) return defaultLayout();
  const known = stored.order.filter((id) => ALL_IDS.includes(id));
  const added = ALL_IDS.filter((id) => !known.includes(id));
  return {
    order: [...known, ...added],
    hidden: [...(stored.hidden ?? []).filter((id) => ALL_IDS.includes(id)), ...added],
    widths: stored.widths ?? {},
  };
}

/**
 * The manager's own table layout: which columns, in what order, how wide.
 *
 * Kept per user id in localStorage rather than on the server — it is a
 * preference about one browser's window, not data about the lead base, and a
 * round trip for it would put a network failure between a manager and their
 * own table. Loading falls back to the default view on anything unreadable.
 */
export function useLeadColumns(userId: string | undefined) {
  const key = userId ? `velora.crm.columns.${userId}` : null;
  const [layout, setLayout] = useState<ColumnLayout>(defaultLayout);

  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      setLayout(reconcile(raw ? JSON.parse(raw) : null));
    } catch {
      setLayout(defaultLayout());
    }
  }, [key]);

  const persist = useCallback((next: ColumnLayout) => {
    setLayout(next);
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode — the session still works */ }
  }, [key]);

  const toggle = useCallback((id: LeadColumnId) => {
    setLayout((l) => {
      const hidden = l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id];
      // Never let the board go empty — a table with no columns has no way back.
      if (hidden.length === ALL_IDS.length) return l;
      const next = { ...l, hidden };
      if (key) { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  }, [key]);

  const move = useCallback((id: LeadColumnId, dir: -1 | 1) => {
    setLayout((l) => {
      const i = l.order.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= l.order.length) return l;
      const order = [...l.order];
      [order[i], order[j]] = [order[j], order[i]];
      const next = { ...l, order };
      if (key) { try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ } }
      return next;
    });
  }, [key]);

  const setWidth = useCallback((id: LeadColumnId, width: number) => {
    setLayout((l) => ({
      ...l,
      widths: { ...l.widths, [id]: Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width))) },
    }));
  }, []);

  /** Called once at the end of a resize drag: every pointermove would otherwise
   * write to localStorage sixty times a second for no benefit. */
  const commitWidths = useCallback(() => {
    if (!key) return;
    setLayout((l) => {
      try { localStorage.setItem(key, JSON.stringify(l)); } catch { /* ignore */ }
      return l;
    });
  }, [key]);

  const reset = useCallback(() => persist(defaultLayout()), [persist]);

  const visible: LeadColumn[] = layout.order
    .filter((id) => !layout.hidden.includes(id))
    .map((id) => LEAD_COLUMNS.find((c) => c.id === id)!)
    .filter(Boolean);

  const widthOf = (c: LeadColumn) => layout.widths[c.id] ?? c.width;

  return { layout, visible, widthOf, toggle, move, setWidth, commitWidths, reset };
}
