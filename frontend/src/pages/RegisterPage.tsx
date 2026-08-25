import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import { classNames } from "../lib/format";

export function RegisterPage() {
  const { t } = useTranslation();
  const register = useAuthStore((s) => s.register);
  const busy = useAuthStore((s) => s.busy);
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<string[]>([]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDetails([]);
    if (password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }
    try {
      await register(email, password, name || undefined);
      toast.success("Аккаунт создан", "Стартовый баланс зачислен");
      navigate("/terminal");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (Array.isArray(e.details)) {
          setDetails((e.details as any[]).map((d) => d.message));
        }
      } else {
        setError("Не удалось зарегистрироваться");
      }
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-bg-0 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-2">
          <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden>
            <rect width="32" height="32" rx="6" fill="#0b0e14" />
            <path d="M8 9l8 15 8-15h-3.4L16 19.6 10.4 9H8z" fill="#17c885" />
          </svg>
          <div className="text-base font-semibold tracking-tight">Velora Terminal</div>
          <div className="text-2xs text-txt-2">{t("auth.register.createAccount")}</div>
        </div>

        <form onSubmit={onSubmit} className="rounded border border-line bg-bg-1 p-5 shadow-panel">
          <h1 className="mb-4 text-sm font-semibold text-txt-0">{t("auth.register.title")}</h1>

          <label className="mb-3 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.register.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
              placeholder="Alex Trader"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.register.email")}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
              placeholder="you@example.com"
            />
          </label>

          <label className="mb-3 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.register.password")}</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
              placeholder="Минимум 10 символов"
            />
          </label>

          <label className="mb-1 block">
            <span className="mb-1 block text-2xs text-txt-2">{t("auth.register.confirmPassword")}</span>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={classNames(
                "w-full rounded border bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent",
                confirmPassword && confirmPassword !== password ? "border-sell" : "border-line"
              )}
              placeholder="Ещё раз тот же пароль"
            />
          </label>
          <div className="mb-4 text-2xs text-txt-3">{t("auth.register.passwordHint")}</div>

          {error && (
            <div className="mb-3 rounded border border-sell/40 bg-sell-soft px-2.5 py-1.5 text-2xs text-sell">
              {error}
              {details.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {details.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || (confirmPassword.length > 0 && confirmPassword !== password)}
            className="w-full rounded bg-accent-fill py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {busy ? t("auth.register.submitting") : t("auth.register.submit")}
          </button>

          <div className="mt-3 text-center text-2xs text-txt-3">
            {t("auth.register.policyAgree")}{" "}
            <Link to="/legal/privacy" target="_blank" className="text-accent hover:underline">
              {t("auth.register.policyLink")}
            </Link>
          </div>

          <div className="mt-4 text-center text-2xs text-txt-2">
            {t("auth.register.haveAccount")}{" "}
            <Link to="/login" className="text-accent hover:underline">
              {t("auth.register.login")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
