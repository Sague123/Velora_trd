import { useState } from "react";
import { CALL_RESULT_LABEL } from "./leadLabels";
import { QUICK_TIMES } from "./FollowUpPanel";
import { useLogCall } from "../../hooks/useCrm";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { buttonCls, textareaCls } from "../../lib/ui";
import type { CallResult } from "../../lib/types";

const RESULTS: CallResult[] = ["NO_ANSWER", "BUSY", "CALL_BACK", "INTERESTED", "NOT_INTERESTED"];

/**
 * Recording what happened on a call, in one form instead of three actions.
 *
 * Before this the desk had to stamp the contact date, write a comment and
 * reschedule the follow-up separately — three interactions for one event,
 * which is why in practice only the comment ever got written and the
 * follow-up queue drifted away from reality. Here the outcome, the note and
 * the next call go in the same request.
 */
export function CallLogForm({ leadId, onDone }: { leadId: string; onDone: () => void }) {
  const logCall = useLogCall();
  const [result, setResult] = useState<CallResult>("NO_ANSWER");
  const [note, setNote] = useState("");
  /** The *label* of the chosen preset, not an instant: `at()` returns a fresh
   * "now + 1h" on every render, so holding an ISO string here could never
   * match the button that produced it. The instant is resolved on submit,
   * which also means "через час" means an hour from sending, not an hour from
   * whenever the manager happened to tap it. */
  const [followUpKey, setFollowUpKey] = useState<string | null>(null);

  async function submit() {
    try {
      const preset = QUICK_TIMES.find((q) => q.label === followUpKey);
      const nextActionAt = preset ? preset.at().toISOString() : null;
      await logCall.mutateAsync({
        id: leadId, result, note: note.trim() || undefined,
        nextActionAt, nextActionType: nextActionAt ? "CALL" : undefined,
      });
      toast.success("Звонок записан", CALL_RESULT_LABEL[result]);
      onDone();
    } catch (e) {
      toast.error("Не удалось записать звонок", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/20 p-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-txt-2">Результат звонка</div>

      <div className="mb-2 flex flex-wrap gap-1.5">
        {RESULTS.map((r) => (
          <button
            key={r}
            onClick={() => setResult(r)}
            className={classNames(
              "btn-fx tap-sm rounded-lg border px-2.5 py-1 text-2xs transition-colors",
              result === r ? "border-accent bg-accent-fill text-white" : "border-line bg-bg-2 text-txt-1 hover:border-accent"
            )}
          >
            {CALL_RESULT_LABEL[r]}
          </button>
        ))}
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Что сказал клиент (необязательно)"
        className={textareaCls("md", "mb-2 w-full")}
      />

      <div className="mb-2">
        <div className="mb-1 text-2xs text-txt-2">Перезвонить</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFollowUpKey(null)}
            className={classNames(
              "btn-fx tap-sm rounded-lg border px-2.5 py-1 text-2xs",
              followUpKey === null ? "border-accent text-accent" : "border-line text-txt-2 hover:border-accent"
            )}
          >
            Не нужно
          </button>
          {QUICK_TIMES.map((qt) => (
            <button
              key={qt.label}
              onClick={() => setFollowUpKey(qt.label)}
              className={classNames(
                "btn-fx tap-sm rounded-lg border px-2.5 py-1 text-2xs",
                followUpKey === qt.label ? "border-accent text-accent" : "border-line text-txt-2 hover:border-accent"
              )}
            >
              {qt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button disabled={logCall.isPending} onClick={submit} className={buttonCls("primary", "sm")}>
          {logCall.isPending ? "Сохранение…" : "Записать"}
        </button>
        <button onClick={onDone} className={buttonCls("secondary", "sm")}>Отмена</button>
      </div>
    </div>
  );
}
