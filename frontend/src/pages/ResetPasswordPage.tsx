import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiPost, ApiError } from "../lib/api";
import { AuthShell, authButtonCls } from "../components/auth/AuthShell";
import { PasswordField, passwordIsValid } from "../components/auth/PasswordField";
import { toast } from "../store/toast";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = !!token && passwordIsValid(password) && !mismatch && confirm.length > 0 && !busy;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/auth/reset-password", { token, newPassword: password });
      toast.success("Пароль изменён", "Войдите с новым паролем");
      navigate("/login");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сменить пароль");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell
        title="Ссылка неполная"
        subtitle="В адресе нет токена сброса. Откройте ссылку из письма целиком."
        footer={<Link to="/forgot-password" className="text-accent hover:underline">Запросить новую ссылку</Link>}
      >
        <div className="rounded border border-line-soft bg-bg-2/40 px-3 py-2.5 text-2xs text-txt-2">
          Некоторые почтовые клиенты обрезают длинные ссылки — попробуйте скопировать её в адресную строку вручную.
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Новый пароль"
      subtitle="После смены пароля все активные сессии будут завершены — на всех устройствах."
      footer={<Link to="/login" className="text-accent hover:underline">Вернуться ко входу</Link>}
    >
      <form onSubmit={onSubmit}>
        <PasswordField label="Новый пароль" value={password} onChange={setPassword} autoFocus />

        <label className="mb-4 block">
          <span className="mb-1 block text-2xs text-txt-2">Повторите пароль</span>
          <input
            type="password" required value={confirm} autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            className={`w-full rounded border bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent ${mismatch ? "border-sell/60" : "border-line"}`}
            placeholder="••••••••••"
          />
          {mismatch && <div className="mt-1 text-2xs text-sell">Пароли не совпадают</div>}
        </label>

        {error && (
          <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">{error}</div>
        )}

        <button type="submit" disabled={!canSubmit} className={authButtonCls}>
          {busy ? "Сохранение…" : "Установить новый пароль"}
        </button>
      </form>
    </AuthShell>
  );
}
