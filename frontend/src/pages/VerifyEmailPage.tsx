import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiPost, ApiError } from "../lib/api";
import { useAuthStore } from "../store/auth";
import { AuthShell } from "../components/auth/AuthShell";
import { Spinner } from "../components/common/States";

/**
 * Opened from a link in an inbox, which may well be on a different device from
 * the one that registered — so this screen never requires a session. It just
 * spends the token and reports what happened.
 */
export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const user = useAuthStore((s) => s.user);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const [state, setState] = useState<"working" | "done" | "failed">(token ? "working" : "failed");
  const [error, setError] = useState<string | null>(token ? null : "В ссылке нет токена подтверждения.");
  // A verification token is single-use, so React 18's double-mounted effects in
  // development would spend it on the first run and report failure on the
  // second. One attempt per token, ever.
  const attempted = useRef(false);

  useEffect(() => {
    if (!token || attempted.current) return;
    attempted.current = true;
    apiPost("/api/auth/verify-email", { token })
      .then(async () => {
        setState("done");
        // If this is the same browser that's signed in, reflect the new status
        // without making the user reload.
        if (user) await refreshMe().catch(() => {});
      })
      .catch((e) => {
        setState("failed");
        setError(e instanceof ApiError ? e.message : "Не удалось подтвердить адрес");
      });
  }, [token, user, refreshMe]);

  if (state === "working") {
    return (
      <AuthShell title="Подтверждаем адрес…">
        <div className="flex justify-center py-4"><Spinner size={18} /></div>
      </AuthShell>
    );
  }

  if (state === "done") {
    return (
      <AuthShell
        title="Адрес подтверждён"
        subtitle="Спасибо — эта почта теперь привязана к аккаунту."
        footer={<Link to={user ? "/terminal" : "/login"} className="text-accent hover:underline">
          {user ? "Перейти в терминал" : "Войти"}
        </Link>}
      >
        <div className="rounded border border-buy/40 bg-buy-soft px-3 py-2.5 text-2xs text-buy">
          Подтверждённая почта нужна, чтобы восстановить доступ к аккаунту и получать уведомления о смене пароля.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Не удалось подтвердить"
      subtitle={error}
      footer={<Link to="/login" className="text-accent hover:underline">Вернуться ко входу</Link>}
    >
      <div className="rounded border border-line-soft bg-bg-2/40 px-3 py-2.5 text-2xs text-txt-2">
        Ссылка действует 24 часа и срабатывает один раз. Если срок истёк — войдите в аккаунт и запросите новое
        письмо в профиле.
      </div>
    </AuthShell>
  );
}
