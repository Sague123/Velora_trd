import { useState } from "react";
import { Popover } from "../common/Popover";
import { StatusChip } from "./StatusChip";
import { LEAD_STATUS_LABEL, LEAD_STATUS_TONE, PIPELINE_STAGES, TERMINAL_STATUSES } from "./leadLabels";
import { useBulkAssign, useBulkStatus, useCrmMeta } from "../../hooks/useCrm";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { buttonCls } from "../../lib/ui";
import { IconChevron, IconClose } from "../icons/Icon";
import type { LeadStatus } from "../../lib/types";

/**
 * What you can do to a selection.
 *
 * It appears only when something is selected and takes the place the filter
 * chips occupy otherwise, so the table below never jumps: a bar that pushes
 * every row down by its own height the moment you tick a checkbox makes the
 * second tick land on the wrong lead.
 *
 * Both actions are confirmed before they fire — a mis-click on a bar that acts
 * on two hundred rows is not something the audit log can undo for you.
 */
export function BulkBar({
  ids, onClear,
}: { ids: string[]; onClear: () => void }) {
  const meta = useCrmMeta();
  const bulkAssign = useBulkAssign();
  const bulkStatus = useBulkStatus();
  const busy = bulkAssign.isPending || bulkStatus.isPending;
  const [confirm, setConfirm] = useState<
    | { kind: "assign"; managerId: string | null; label: string }
    | { kind: "status"; status: LeadStatus }
    | null
  >(null);

  async function run() {
    if (!confirm) return;
    try {
      if (confirm.kind === "assign") {
        const { changed } = await bulkAssign.mutateAsync({ ids, managerId: confirm.managerId });
        toast.success(`Назначено: ${changed}`, changed < ids.length ? `Без изменений: ${ids.length - changed}` : undefined);
      } else {
        const { changed, skipped } = await bulkStatus.mutateAsync({ ids, status: confirm.status });
        toast.success(`Статус изменён: ${changed}`, skipped ? `Пропущено: ${skipped}` : undefined);
      }
      setConfirm(null);
      onClear();
    } catch (e) {
      toast.error("Массовое действие не выполнено", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="anim-rise mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-soft px-3 py-2">
      <span className="text-2xs font-semibold text-accent">Выбрано: {ids.length}</span>

      {confirm ? (
        <>
          <span className="text-2xs text-txt-1">
            {confirm.kind === "assign"
              ? `Назначить ${ids.length} лид(ов) на «${confirm.label}»?`
              : `Перевести ${ids.length} лид(ов) в «${LEAD_STATUS_LABEL[confirm.status]}»?`}
          </span>
          <button disabled={busy} onClick={run} className={buttonCls("primary", "sm")}>
            {busy ? "Применяю…" : "Подтвердить"}
          </button>
          <button disabled={busy} onClick={() => setConfirm(null)} className={buttonCls("secondary", "sm")}>
            Отмена
          </button>
        </>
      ) : (
        <>
          <Popover
            trigger={(open, toggle) => (
              <button onClick={toggle} aria-expanded={open} className={buttonCls("secondary", "sm", "gap-1")}>
                Назначить <IconChevron size={10} direction={open ? "up" : "down"} />
              </button>
            )}
          >
            {(close) => (
              <div className="max-h-64 w-52 overflow-y-auto p-1.5">
                <button
                  onClick={() => { setConfirm({ kind: "assign", managerId: null, label: "Без ответственного" }); close(); }}
                  className="btn-fx tap-sm w-full rounded px-2 py-1 text-left text-2xs text-txt-2 hover:bg-bg-3"
                >
                  Снять ответственного
                </button>
                {(meta.data?.managers ?? []).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setConfirm({ kind: "assign", managerId: m.id, label: m.name }); close(); }}
                    className="btn-fx tap-sm w-full rounded px-2 py-1 text-left text-2xs text-txt-1 hover:bg-bg-3"
                  >
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <Popover
            trigger={(open, toggle) => (
              <button onClick={toggle} aria-expanded={open} className={buttonCls("secondary", "sm", "gap-1")}>
                Сменить этап <IconChevron size={10} direction={open ? "up" : "down"} />
              </button>
            )}
          >
            {(close) => (
              <div className="max-h-72 w-56 overflow-y-auto p-1.5">
                {[...PIPELINE_STAGES, ...TERMINAL_STATUSES].map((s) => (
                  <button
                    key={s}
                    onClick={() => { setConfirm({ kind: "status", status: s }); close(); }}
                    className="btn-fx tap-sm w-full rounded px-1.5 py-1 text-left hover:bg-bg-3"
                  >
                    <StatusChip tone={LEAD_STATUS_TONE[s]}>{LEAD_STATUS_LABEL[s]}</StatusChip>
                  </button>
                ))}
              </div>
            )}
          </Popover>

          <button onClick={onClear} className="btn-fx ml-auto flex items-center gap-1 rounded px-2 py-1 text-2xs text-txt-2 hover:text-accent">
            <IconClose size={10} /> Снять выделение
          </button>
        </>
      )}
    </div>
  );
}
