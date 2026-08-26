import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { AuthShell, authButtonCls, authInputCls } from "../components/auth/AuthShell";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import type { MfaChallenge } from "../lib/types";

export function LoginPage() {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const completeMfa = useAuthStore((s) => s.completeMfa);
  const busy = useAuthStore((s) => s.busy);
  const navigate = useNavigate();

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
      if (mfa) return setChallenge(mfa);
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

  const errorBlock = error && (
    <div className="mb-4 rounded-lg border border-sell/40 bg-sell-soft px-3 py-2 text-2xs text-sell">{error}</div>
  );

  if (challenge) {
    return (
      <AuthShell
        title="Подтверждение входа"
        subtitle="Введите шестизначный код из приложения-аутентификатора. Если телефон недоступен — используйте один из резервных кодов."
      >
        <form onSubmit={onSubmitCode}>
          <label className="mb-5 block">
            <span className="mb-1.5 block text-2xs font-medium text-txt-2">Код подтверждения</span>
            <input
              required autoFocus inputMode="text" autoComplete="one-time-code"
              value={code} onChange={(e) => setCode(e.target.value)}
              className={`${authInputCls} tabular text-center text-sm tracking-[0.4em]`}
              placeholder="000000"
            />
          </label>

          {errorBlock}

          <button type="submit" disabled={busy} className={authButtonCls}>
            {busy ? "Проверка…" : "Подтвердить"}
          </button>

          <button
            type="button"
            onClick={() => { setChallenge(null); setCode(""); setError(null); setPassword(""); }}
            className="mt-4 w-full text-center text-2xs text-txt-2 hover:text-txt-0"
          >
            Войти под другим аккаунтом
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={t("auth.login.title")}
      subtitle={t("auth.login.tagline")}
      footer={
        <>
          {t("auth.login.noAccount")}{" "}
          <Link to="/register" className="font-medium text-accent hover:underline">
            {t("auth.login.register")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-2xs font-medium text-txt-2">{t("auth.login.email")}</span>
          <input
            type="email" required autoFocus value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className={authInputCls} placeholder="you@example.com"
          />
        </label>

        <label className="mb-2 block">
          <span className="mb-1.5 block text-2xs font-medium text-txt-2">{t("auth.login.password")}</span>
          <input
            type="password" required value={password} autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            className={authInputCls} placeholder="••••••••••"
          />
        </label>

        <div className="mb-5 text-right">
          <Link to="/forgot-password" className="text-2xs text-txt-2 hover:text-accent hover:underline">
            Забыли пароль?
          </Link>
        </div>

        {errorBlock}

        <button type="submit" disabled={busy} className={authButtonCls}>
          {busy ? t("auth.login.submitting") : t("auth.login.submit")}
        </button>
      </form>
    </AuthShell>
  );
}
