import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { classNames } from "../../lib/format";
import { buttonCls, fieldCls } from "../../lib/ui";

/**
 * The Settings page's vocabulary: groups of rows, not cards. A group is a
 * small uppercase heading over hairline-separated rows; a row is a label
 * (with an optional one-line explanation) on the left and its control on the
 * right. Every section is built from these, so all six read the same.
 */

export function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-xl font-semibold tracking-tight text-txt-0">{title}</h1>
      {description && <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-txt-2">{description}</p>}
    </header>
  );
}

export function SettingsGroup({
  title, children, note, action,
}: {
  title: string;
  children: ReactNode;
  /** Small print under the group — a caveat that belongs to all its rows. */
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="mt-10 first:mt-0">
      <div className="flex items-end justify-between gap-4 pb-2">
        <h2 className="text-2xs font-semibold uppercase tracking-wider text-txt-3">{title}</h2>
        {action}
      </div>
      <div className="divide-y divide-line-soft border-y border-line-soft">{children}</div>
      {note && <p className="mt-2 text-2xs leading-relaxed text-txt-3">{note}</p>}
    </section>
  );
}

export function SettingsRow({
  label, hint, children, htmlFor, stack,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children?: ReactNode;
  htmlFor?: string;
  /** Put the control under the label (wide controls: text fields on a phone). */
  stack?: boolean;
}) {
  const Label = htmlFor ? "label" : "div";
  return (
    <div className={classNames("flex min-h-[56px] gap-x-6 gap-y-2 py-3", stack ? "flex-col sm:flex-row sm:items-center" : "items-center")}>
      <Label {...(htmlFor ? { htmlFor } : {})} className="min-w-0 flex-1">
        <span className="block text-sm text-txt-0">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-txt-3">{hint}</span>}
      </Label>
      {children !== undefined && (
        <div className={classNames("flex shrink-0 items-center", stack ? "justify-start sm:justify-end" : "justify-end")}>{children}</div>
      )}
    </div>
  );
}

/** A value that is shown, not edited — right-aligned like any control. */
export function RowValue({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <span className={classNames("text-sm tabular", muted ? "text-txt-3" : "text-txt-1")}>{children}</span>;
}

export function Switch({
  checked, onChange, label, disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Accessible name when the row label isn't wired to it. */
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={classNames(
        "tap relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-accent bg-accent-fill" : "border-line bg-bg-3",
      )}
    >
      <span
        aria-hidden
        className={classNames(
          "absolute left-0.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

export function Segmented<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-bg-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={classNames(
            "tap-sm h-8 rounded-md px-3 text-xs font-medium transition-colors",
            "focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent",
            value === o.value ? "bg-bg-0 text-txt-0 shadow-btn" : "text-txt-2 hover:text-txt-0",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Select<T extends string>({
  value, onChange, options, id, label, className = "min-w-[10rem] max-w-full",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  id?: string;
  label?: string;
  className?: string;
}) {
  return (
    <select
      id={id}
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={fieldCls("md", `tap-sm pr-8 ${className}`)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

/** Draft state for one section: edit freely, then save or discard as a whole. */
export function useDraft<T>(saved: T) {
  const [draft, setDraft] = useState<T>(saved);
  const savedKey = JSON.stringify(saved);
  // Adopt a new saved value (initial load, or after a save) when not editing.
  useEffect(() => setDraft(saved), [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = useMemo(() => JSON.stringify(draft) !== savedKey, [draft, savedKey]);
  const set = <K extends keyof T>(key: K, value: T[K]) => setDraft((d) => ({ ...d, [key]: value }));
  return { draft, setDraft, set, dirty, discard: () => setDraft(saved) };
}

/**
 * The section's one commit point. Sticky to the bottom of the viewport while
 * there are unsaved edits, so it is never scrolled out of reach; at rest it
 * sits quietly at the end of the form.
 */
export function SaveBar({
  dirty, saving, onSave, onDiscard,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { t } = useTranslation();
  const statusId = useId();
  return (
    <div
      className={classNames(
        "mt-10 flex items-center justify-end gap-3 border-t border-line-soft py-4",
        dirty && "sticky bottom-0 z-10 -mx-4 bg-bg-0/95 px-4 backdrop-blur sm:-mx-6 sm:px-6",
      )}
    >
      <span id={statusId} aria-live="polite" className="mr-auto text-xs text-txt-3">
        {dirty ? t("settings.unsaved") : ""}
      </span>
      {dirty && (
        <button type="button" onClick={onDiscard} disabled={saving} className={buttonCls("ghost", "md")}>
          {t("settings.discard")}
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || saving}
        aria-describedby={statusId}
        className={buttonCls("primary", "md", "px-4")}
      >
        {saving ? t("settings.saving") : t("settings.save")}
      </button>
    </div>
  );
}
