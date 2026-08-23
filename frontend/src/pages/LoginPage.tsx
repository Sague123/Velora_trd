import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";

export function LoginPage() {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      toast.success("Добро пожаловать", email);
      navigate("/terminal");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось войти");
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
          <div className="text-2xs text-txt-2">{t("auth.login.tagline")}</div>
        </div>

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
            className="w-full rounded bg-accent py-2 text-xs font-semibold text-white transition-colors hover:bg-accent-dim disabled:opacity-50"
          >
            {busy ? t("auth.login.submitting") : t("auth.login.submit")}
          </button>

          <div className="mt-3 text-center text-2xs text-txt-2">
            {t("auth.login.noAccount")}{" "}
            <Link to="/register" className="text-accent hover:underline">
              {t("auth.login.register")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
