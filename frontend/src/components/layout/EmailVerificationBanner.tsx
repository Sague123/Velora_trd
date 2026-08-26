import { useState } from "react";
import { useAuthStore } from "../../store/auth";
import { apiPost, ApiError } from "../../lib/api";
import { toast } from "../../store/toast";
import { IconWarning } from "../icons/Icon";

/**
 * A quiet, dismissible nudge — not a wall. An unverified address does not stop
 * anyone trading demo money; it only matters when they need to recover the
 * account or want the features that require identity. Blocking the app over it
 * would be out of proportion to that, so this states the consequence and gets
 * out of the way.
 *
 * Dismissal is per-session on purpose: it comes back next visit, because the
 * problem does too.
 */
export function EmailVerificationBanner() {
  const user = useAuthStore((s) => s.user);
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!user || user.emailVerified !== false || dismissed) return null;

  async function resend() {
    setBusy(true);
    try {
      const res = await apiPost<{ alreadyVerified: boolean }>("/api/auth/resend-verification");
      toast.info(
        res.alreadyVerified ? "Адрес уже подтверждён" : "Письмо отправлено",
        res.alreadyVerified ? undefined : user?.email
      );
      if (res.alreadyVerified) setDismissed(true);
    } catch (e) {
      toast.error("Не удалось отправить письмо", e instanceof ApiError ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-accent/30 bg-accent-soft px-3 py-1.5 text-2xs text-accent">
      <IconWarning size={13} />
      <span className="font-medium">
        Адрес {user.email} не подтверждён — без этого не получится восстановить доступ по ссылке из почты.
      </span>
      <button
        onClick={resend}
        disabled={busy}
        className="btn-fx ml-auto rounded border border-accent/40 px-2 py-0.5 font-medium hover:bg-accent/10 disabled:opacity-50"
      >
        {busy ? "…" : "Отправить письмо"}
      </button>
      <button onClick={() => setDismissed(true)} className="btn-fx px-1 text-txt-2 hover:text-txt-0" aria-label="Скрыть">
        ✕
      </button>
    </div>
  );
}
