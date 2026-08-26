import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import type { MfaChallenge } from "../lib/types";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const navigate = useNavigate();
  const completeMfa = useAuthStore((s) => s.completeMfa);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Set only when the account has 2FA on. While it is set the password has
  // already been accepted but no session exists yet — this screen is the whole
  // of that five-minute window.
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [code, setCode] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const mfa = await login(email, password);
      if (mfa) {
        setChallenge(mfa);
        return;
      }
      toast.success("Добро пожаловать", email);
      navigate("/terminal");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось войти");
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    if (!challenge) return;
    setError(null);
    try {
      await completeMfa(challenge.mfaToken, code.trim());
      toast.success("Добро пожаловать", email);
      navigate("/terminal");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось подтвердить код");
      setCode("");
    }
  }

  const inputCls = "w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent";

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-0 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#0b0e14" />
            <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
          </svg>
          <div className="text-base font-semibold tracking-tight">Velora Terminal</div>
          <div className="text-2xs text-txt-2">{t("auth.login.tagline")}</div>
        </div>

        {challenge ? (
          <form onSubmit={onSubmitCode} className="rounded border border-line bg-bg-1 p-5 shadow-panel">
            <h1 className="mb-1 text-sm font-semibold text-txt-0">Подтверждение входа</h1>
            <p className="mb-4 text-2xs text-txt-2">
              Введите шестизначный код из приложения-аутентификатора. Если телефон недоступен — используйте
              один из резервных кодов.
            </p>

            <label className="mb-4 block">
              <span className="mb-1 block text-2xs text-txt-2">Код подтверждения</span>
              <input
                required
                autoFocus
                inputMode="text"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={`${inputCls} tabular tracking-[0.3em]`}
                placeholder="000000"
              />
            </label>

            {error && (
              <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">{error}</div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded bg-accent-fill py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
            >
              {busy ? "Проверка…" : "Подтвердить"}
            </button>

            <button
              type="button"
              onClick={() => { setChallenge(null); setCode(""); setError(null); setPassword(""); }}
              className="mt-3 w-full text-center text-2xs text-txt-2 hover:text-txt-0"
            >
              Войти под другим аккаунтом
            </button>
          </form>
        ) : (
        <form onSubmit={onSubmit} className="rounded border border-line bg-bg-1 p-5 shadow-panel">
          <h1 className="mb-4 text-sm font-semibold text-txt-0">{t("auth.login.title")}</h1>

          <label className="mb-3 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.login.email")}</span>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.login.password")}</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
              placeholder="••••••••••"
            />
          </label>

          {error && (
            <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded bg-accent-fill py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {busy ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>

          <div className="mt-3 text-center text-2xs text-txt-2">
            <Link to="/forgot-password" className="text-txt-2 hover:text-accent hover:underline">
              Забыли пароль?
            </Link>
          </div>

          <div className="mt-2 text-center text-2xs text-txt-2">
            {t("auth.login.noAccount")}{" "}
            <Link to="/register" className="text-accent hover:underline">
              {t("auth.login.register")}
            </Link>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
