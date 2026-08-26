import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { AuthShell, authButtonCls, authInputCls } from "../components/auth/AuthShell";
import { PasswordField, passwordIsValid } from "../components/auth/PasswordField";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import { classNames } from "../lib/format";

/**
 * Registration asks for exactly what an account needs: an email, a password,
 * and optionally a name.
 *
 * Identity verification is deliberately *not* part of this screen. It is
 * optional — it gates withdrawals and savings, nothing else — and asking
 * someone to photograph a passport before they have seen the product would
 * lose people who would otherwise have signed up. It lives in the profile's
 * security settings, where someone goes when they actually need it.
 */
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

  const passwordsMatch = confirmPassword.length > 0 && confirmPassword === password;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDetails([]);
    if (!passwordsMatch) return setError("Пароли не совпадают");
    try {
      await register(email.trim().toLowerCase(), password, name || undefined);
      toast.success("Аккаунт создан", "Стартовый баланс зачислен");
      navigate("/terminal");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        if (Array.isArray(e.details)) setDetails((e.details as any[]).map((d) => d.message));
      } else {
        setError("Не удалось зарегистрироваться");
      }
    }
  }

  return (
    <AuthShell
      title={t("auth.register.title")}
      subtitle="Аккаунт создаётся за минуту. Стартовый баланс зачисляется сразу — торговать можно немедленно."
      footer={
        <>
          {t("auth.register.haveAccount")}{" "}
          <Link to="/login" className="font-medium text-accent hover:underline">
            {t("auth.register.login")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <label className="mb-4 block">
          <span className="mb-1.5 block text-2xs font-medium text-txt-2">{t("auth.register.name")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={authInputCls}
            placeholder="Alex Trader"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1.5 block text-2xs font-medium text-txt-2">{t("auth.register.email")}</span>
          <input
            type="email" required value={email} autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            className={authInputCls} placeholder="you@example.com"
          />
        </label>

        <PasswordField label={t("auth.register.password")} value={password} onChange={setPassword} />

        <label className="mb-5 block">
          <span className="mb-1.5 block text-2xs font-medium text-txt-2">{t("auth.register.confirmPassword")}</span>
          <input
            type="password" required value={confirmPassword} autoComplete="new-password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={classNames(authInputCls, confirmPassword && !passwordsMatch && "border-sell/60")}
            placeholder="Ещё раз тот же пароль"
          />
          {confirmPassword && !passwordsMatch && (
            <div className="mt-1.5 text-2xs text-sell">Пароли не совпадают</div>
          )}
        </label>

        {error && (
          <div className="mb-4 rounded-lg border border-sell/40 bg-sell-soft px-3 py-2 text-2xs text-sell">
            {error}
            {details.length > 0 && (
              <ul className="mt-1 list-disc pl-4">{details.map((d, i) => <li key={i}>{d}</li>)}</ul>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || !passwordIsValid(password) || !passwordsMatch}
          className={authButtonCls}
        >
          {busy ? t("auth.register.submitting") : t("auth.register.submit")}
        </button>

        <p className="mt-4 text-center text-2xs leading-relaxed text-txt-3">
          {t("auth.register.policyAgree")}{" "}
          <Link to="/legal/privacy" target="_blank" className="text-accent hover:underline">
            {t("auth.register.policyLink")}
          </Link>
          . Подтверждение личности не требуется — его можно пройти позже в настройках профиля,
          если понадобится вывод средств или накопительный счёт.
        </p>
      </form>
    </AuthShell>
  );
}
