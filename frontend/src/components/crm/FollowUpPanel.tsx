import { useState } from "react";
import { buttonCls, fieldCls } from "../../lib/ui";

/** Follow-up times a desk actually uses, so the common case is one tap and the
 * date picker below is only for the uncommon one. */
export const QUICK_TIMES: { label: string; at: () => Date }[] = [
  { label: "Через час", at: () => new Date(Date.now() + 60 * 60_000) },
  { label: "Сегодня 18:00", at: () => atTime(0, 18) },
  { label: "Завтра 10:00", at: () => atTime(1, 10) },
  { label: "Через 3 дня", at: () => atTime(3, 10) },
];

function atTime(addDays: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + addDays);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/** `<input type="datetime-local">` speaks local wall-clock time with no zone,
 * so it needs the local parts — toISOString() would hand it UTC and shift the
 * displayed time by the offset. */
export function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Pick when the desk next touches this lead.
 *
 * Four presets over a bare date field because the answer is almost always one
 * of them — "перезвонить завтра утром" is the entire conversation, and making
 * a manager assemble that from a calendar widget is how follow-ups end up
 * never being set at all. The exact picker stays underneath for the rest.
 */
export function FollowUpPanel({
  title, busy, onPick, onCancel, onClear,
}: {
  title: string;
  busy?: boolean;
  onPick: (isoInstant: string) => void;
  onCancel?: () => void;
  /** Shown only when there is an existing follow-up to remove. */
  onClear?: () => void;
}) {
  const [when, setWhen] = useState("");

  return (
    <div className="w-56 p-2">
      <div className="mb-1.5 text-2xs font-semibold text-txt-1">{title}</div>
      <div className="grid gap-1">
        {QUICK_TIMES.map((qt) => (
          <button
            key={qt.label}
            disabled={busy}
            onClick={() => onPick(qt.at().toISOString())}
            className="btn-fx tap-sm rounded px-2 py-1 text-left text-2xs text-txt-1 hover:bg-bg-3 hover:text-txt-0 disabled:opacity-50"
          >
            {qt.label}
          </button>
        ))}
      </div>
      <div className="mt-2 border-t border-line-soft pt-2">
        <input
          type="datetime-local"
          value={when}
          min={toLocalInput(new Date())}
          onChange={(e) => setWhen(e.target.value)}
          className={fieldCls("sm", "w-full")}
        />
        <div className="mt-1.5 flex gap-1.5">
          <button
            disabled={!when || busy}
            onClick={() => onPick(new Date(when).toISOString())}
            className={buttonCls("primary", "sm", "flex-1")}
          >
            Сохранить
          </button>
          {onCancel && (
            <button onClick={onCancel} className={buttonCls("secondary", "sm")}>Назад</button>
          )}
        </div>
        {onClear && (
          <button
            disabled={busy}
            onClick={onClear}
            className={buttonCls("ghost", "sm", "mt-1.5 w-full")}
          >
            Убрать напоминание
          </button>
        )}
      </div>
    </div>
  );
}
