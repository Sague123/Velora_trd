import { useMemo, useState } from "react";
import { classNames } from "../../lib/format";

/**
 * A password input with the server's own rules made visible.
 *
 * The API enforces ≥10 characters with at least one letter and one digit
 * (server/src/routes/auth.ts). Before this, the only way to learn that was to
 * submit and read a rejection, which is a bad trade: the user has already
 * committed to a password by then. The checklist below mirrors those rules
 * exactly — if the server's rule changes, this must change with it.
 *
 * The strength meter is deliberately separate from the rules. Meeting the
 * minimum is a gate; strength is advice, and conflating the two teaches people
 * that "Password12" is fine because the bar went green.
 */

export interface PasswordRule {
  label: string;
  ok: boolean;
}

/** The server's hard requirements, evaluated client-side for immediate feedback. */
export function passwordRules(value: string): PasswordRule[] {
  return [
    { label: "не короче 10 символов", ok: value.length >= 10 },
    { label: "есть буквы", ok: /[a-zA-Zа-яА-Я]/.test(value) },
    { label: "есть цифры", ok: /[0-9]/.test(value) },
  ];
}

export const passwordIsValid = (value: string) => passwordRules(value).every((r) => r.ok);

/** 0–4. Length dominates, because it genuinely does; character classes and the
 * absence of an obvious pattern adjust from there. */
export function passwordStrength(value: string): { score: number; label: string } {
  if (!value) return { score: 0, label: "" };
  let score = 0;
  if (value.length >= 10) score++;
  if (value.length >= 14) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/[0-9]/.test(value) && /[^a-zA-Z0-9]/.test(value)) score++;
  // A long string of one repeated character, or a straight run off the
  // keyboard, is not the entropy its length suggests.
  if (/^(.)\1+$/.test(value) || /12345|qwerty|password|пароль/i.test(value)) score = Math.min(score, 1);
  const labels = ["Очень слабый пароль", "Слабый пароль", "Средний пароль", "Хороший пароль", "Надёжный пароль"];
  return { score, label: labels[Math.min(score, 4)] };
}

const BAR_COLORS = ["bg-sell", "bg-sell", "bg-warn", "bg-accent", "bg-buy"];
const TEXT_COLORS = ["text-sell", "text-sell", "text-warn", "text-accent", "text-buy"];

export function PasswordField({
  label,
  value,
  onChange,
  autoFocus,
  showMeter = true,
  autoComplete = "new-password",
  placeholder = "••••••••••",
  error,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  showMeter?: boolean;
  autoComplete?: string;
  placeholder?: string;
  error?: string | null;
}) {
  const [touched, setTouched] = useState(false);
  const [visible, setVisible] = useState(false);
  const rules = useMemo(() => passwordRules(value), [value]);
  const strength = useMemo(() => passwordStrength(value), [value]);
  // Nothing is marked wrong until the field has been left — flagging "too
  // short" on the first keystroke is noise, not validation.
  const showProblems = touched && value.length > 0;

  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-2xs font-medium text-txt-2">{label}</span>
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          required
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          className={classNames(
            "w-full rounded-lg border bg-bg-2 px-3 py-2.5 pr-16 text-xs text-txt-0 outline-none transition-colors placeholder:text-txt-3 focus:border-accent",
            showProblems && !passwordIsValid(value) ? "border-sell/60" : "border-line"
          )}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-txt-2 hover:text-txt-0"
          tabIndex={-1}
        >
          {visible ? "скрыть" : "показать"}
        </button>
      </div>

      {showMeter && value.length > 0 && (
        <>
          <div className="mt-2.5 flex gap-1" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className={classNames(
                  "h-1 flex-1 rounded-full transition-colors",
                  i < strength.score ? BAR_COLORS[strength.score] : "bg-bg-3"
                )}
              />
            ))}
          </div>
          <div className={classNames("mt-1.5 text-2xs font-medium", TEXT_COLORS[strength.score])}>{strength.label}</div>
          <ul className="mt-1 space-y-0.5">
            {rules.map((r) => (
              <li
                key={r.label}
                className={classNames("flex items-center gap-1.5 text-2xs", r.ok ? "text-buy" : showProblems ? "text-sell" : "text-txt-3")}
              >
                <span aria-hidden>{r.ok ? "✓" : "•"}</span> {r.label}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && <div className="mt-1 text-2xs text-sell">{error}</div>}
    </div>
  );
}
