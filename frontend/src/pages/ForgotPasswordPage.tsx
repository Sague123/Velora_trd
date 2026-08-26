import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiPost, ApiError } from "../lib/api";
import { AuthShell, authButtonCls, authInputCls } from "../components/auth/AuthShell";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/auth/forgot-password", { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось отправить письмо");
    } finally {
      setBusy(false);
    }
  }

  // The server answers identically whether or not the address exists, so this
  // screen must too — saying "no such account" here would rebuild the
  // enumeration oracle the API deliberately avoids being.
  if (sent) {
    return (
      <AuthShell
        title="Проверьте почту"
        subtitle="Если аккаунт с таким адресом существует, мы отправили на него ссылку для сброса пароля."
        footer={<Link to="/login" className="text-accent hover:underline">Вернуться ко входу</Link>}
      >
        <div className="rounded border border-line-soft bg-bg-2/40 px-3 py-2.5 text-2xs text-txt-2">
          Ссылка действует 60 минут и сработает только один раз. Письмо не пришло — проверьте папку «Спам»
          или попробуйте ещё раз через несколько минут.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Сброс пароля"
      subtitle="Введите адрес, на который зарегистрирован аккаунт — пришлём ссылку для установки нового пароля."
      footer={<Link to="/login" className="text-accent hover:underline">Вернуться ко входу</Link>}
    >
      <form onSubmit={onSubmit}>
        <label className="mb-4 block">
          <span className="mb-1 block text-2xs text-txt-2">Email</span>
          <input
            type="email" required autoFocus value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputCls} placeholder="you@example.com"
          />
        </label>

        {error && (
          <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">{error}</div>
        )}

        <button type="submit" disabled={busy} className={authButtonCls}>
          {busy ? "Отправка…" : "Отправить ссылку"}
        </button>
      </form>
    </AuthShell>
  );
}
