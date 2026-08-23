import { useToastStore, type ToastKind } from "../../store/toast";
import { classNames } from "../../lib/format";

const KIND_STYLES: Record<ToastKind, string> = {
  success: "border-buy/40 bg-buy-soft text-buy",
  error: "border-sell/40 bg-sell-soft text-sell",
  info: "border-accent/40 bg-accent-soft text-accent",
  warning: "border-warn/40 bg-[#231a0c] text-warn",
};

const KIND_ICON: Record<ToastKind, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-12 right-3 z-[200] flex w-80 flex-col gap-1.5">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={classNames(
            "toast-in flex items-start gap-2 rounded border px-3 py-2 shadow-lg backdrop-blur",
            "bg-bg-2/95 border-line",
          )}
        >
          <span
            className={classNames(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
              KIND_STYLES[t.kind],
            )}
          >
            {KIND_ICON[t.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-txt-0">{t.title}</div>
            {t.message && <div className="mt-0.5 text-2xs text-txt-1">{t.message}</div>}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="shrink-0 text-txt-3 hover:text-txt-1"
            aria-label="Закрыть уведомление"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
