import { Popover } from "../common/Popover";
import { FollowUpPanel } from "./FollowUpPanel";
import { NEXT_ACTION_LABEL } from "./leadLabels";
import { useSetNextAction } from "../../hooks/useCrm";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { IconCalendar } from "../icons/Icon";
import type { NextActionType } from "../../lib/types";

/** Relative where relative is what the manager needs ("через 2 ч", "вчера"),
 * absolute once it is far enough away that a weekday means more than a count
 * of hours. */
function whenLabel(at: Date): { text: string; state: "overdue" | "today" | "soon" | "later" } {
  const ms = at.getTime() - Date.now();
  const mins = Math.round(ms / 60_000);
  const sameDay = at.toDateString() === new Date().toDateString();

  if (ms < 0) {
    const late = Math.abs(mins);
    if (late < 60) return { text: `просрочено ${late} мин`, state: "overdue" };
    if (late < 24 * 60) return { text: `просрочено ${Math.round(late / 60)} ч`, state: "overdue" };
    return { text: `просрочено ${Math.round(late / (60 * 24))} дн`, state: "overdue" };
  }
  if (mins < 60) return { text: `через ${Math.max(1, mins)} мин`, state: "today" };
  if (sameDay) return { text: `сегодня ${at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`, state: "today" };
  if (ms < 48 * 3600_000) return { text: `завтра ${at.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`, state: "soon" };
  return {
    text: at.toLocaleString("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    state: "later",
  };
}

const STATE_CLASS = {
  overdue: "text-cat-rose",
  today: "text-warn",
  soon: "text-txt-1",
  later: "text-txt-2",
} as const;

/**
 * When the desk next has to touch this lead — and the control to move it.
 *
 * This is the column a manager works their day from, so an empty one is not
 * blank filler: "не запланировано" is a real state that means nobody owns the
 * next step, and it gets a control rather than a dash so the fix is one tap
 * from where the problem is visible.
 *
 * Overdue is `cat-rose`, not `sell` — on a trading platform red means short,
 * and a late callback must not read as a position.
 */
export function NextActionCell({
  leadId, at, type, compact,
}: { leadId: string; at: string | null; type: NextActionType | null; compact?: boolean }) {
  const setNextAction = useSetNextAction();
  const date = at ? new Date(at) : null;
  const shown = date && !Number.isNaN(date.getTime()) ? whenLabel(date) : null;

  async function save(iso: string | null, close: () => void) {
    try {
      await setNextAction.mutateAsync({ id: leadId, at: iso, type: iso ? (type ?? "CALL") : undefined });
      toast.success(iso ? "Напоминание поставлено" : "Напоминание убрано");
      close();
    } catch (e) {
      toast.error("Не удалось сохранить", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Popover
        align="left"
        portal
        trigger={(open, toggle) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            disabled={setNextAction.isPending}
            title={shown ? `${date!.toLocaleString("ru-RU")} · ${NEXT_ACTION_LABEL[type ?? "CALL"]}` : "Поставить напоминание"}
            className={classNames(
              "btn-fx flex items-center gap-1 rounded px-1 py-0.5 hover:bg-bg-3 disabled:opacity-50",
              shown ? STATE_CLASS[shown.state] : "text-txt-3"
            )}
          >
            <IconCalendar size={11} className="shrink-0 opacity-60" />
            <span className={classNames("truncate", shown?.state === "overdue" && "font-semibold")}>
              {shown ? shown.text : "не запланировано"}
            </span>
            {!compact && shown && type && type !== "CALL" && (
              <span className="shrink-0 text-3xs text-txt-3">· {NEXT_ACTION_LABEL[type]}</span>
            )}
          </button>
        )}
      >
        {(close) => (
          <FollowUpPanel
            title={shown ? "Перенести на" : "Напомнить"}
            busy={setNextAction.isPending}
            onPick={(iso) => save(iso, close)}
            onClear={shown ? () => save(null, close) : undefined}
          />
        )}
      </Popover>
    </span>
  );
}
