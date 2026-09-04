import type { ReactNode } from "react";

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-line border-t-accent"
      style={{ width: size, height: size }}
    />
  );
}

export function LoadingRow({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-6 text-2xs text-txt-2">
      <Spinner />
      <span>{label}</span>
    </div>
  );
}

export function ErrorRow({ label, onRetry }: { label: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-6 text-2xs text-sell">
      <span>⚠ {label}</span>
      {onRetry && (
        <button onClick={onRetry} className="rounded border border-line px-2 py-0.5 text-txt-1 hover:border-accent hover:text-accent">
          Повторить
        </button>
      )}
    </div>
  );
}

export function EmptyRow({ label }: { label: string }) {
  return <div className="py-6 text-center text-2xs text-txt-3">{label}</div>;
}

/**
 * The full-panel version of EmptyRow: an icon, a line of text and an optional
 * way out of the empty state.
 *
 * EmptyRow stays as-is for dense contexts (a table body inside the terminal,
 * where a tall graphic would push the rows that matter off screen). This one
 * is for a panel whose whole job is that list — where a bare line of grey
 * text reads as a rendering failure rather than as "there is nothing here
 * yet, here is what to do about it".
 */
export function EmptyState({
  icon, label, hint, action,
}: {
  icon?: ReactNode;
  label: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <span className="text-txt-3 opacity-70">{icon}</span>}
      <div className="text-xs font-medium text-txt-1">{label}</div>
      {hint && <p className="max-w-xs text-2xs leading-relaxed text-txt-3">{hint}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="btn-fx tap-sm mt-1 rounded-lg border border-line bg-bg-2 px-3 py-1.5 text-2xs font-medium text-txt-1 hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** A single shimmering placeholder bar — the shimmer itself lives in
 * globals.css (`.skeleton`) so every use shares one animation. */
export function SkeletonBar({ width = "100%", height = 12, className = "" }: { width?: string | number; height?: number; className?: string }) {
  return <span className={`skeleton block rounded ${className}`} style={{ width, height }} />;
}

/** Content-shaped loading state for a data table: renders the real column
 * count as shimmering bars instead of a spinner that gives no sense of what
 * is about to appear. Row count is capped — a huge skeleton is just as
 * uninformative as a spinner once it fills the screen. */
export function SkeletonTableRows({ columns, rows = 6 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-line-soft/60">
          {Array.from({ length: columns }).map((__, c) => (
            <td key={c} className="px-3 py-2.5">
              <SkeletonBar width={c === 0 ? "70%" : `${45 + ((r + c) % 3) * 15}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Same idea for a card/panel body — a few lines of shimmer at plausible
 * widths rather than a spinner floating in empty space. */
export function SkeletonLines({ lines = 3 }: { lines?: number }) {
  return (
    <div className="flex flex-col gap-2 py-1">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonBar key={i} width={i === lines - 1 ? "55%" : "100%"} />
      ))}
    </div>
  );
}
