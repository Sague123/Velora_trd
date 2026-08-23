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
