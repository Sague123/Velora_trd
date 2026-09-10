import { useState } from "react";
import { Popover } from "../common/Popover";
import { StatusChip } from "./StatusChip";
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TONE, PIPELINE_STAGES, TERMINAL_STATUSES, pipelineStep,
} from "./leadLabels";
import { useSetLeadStatus } from "../../hooks/useCrm";
import { classNames } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { FollowUpPanel } from "./FollowUpPanel";
import type { LeadStatus } from "../../lib/types";

/**
 * Changing a lead's stage where the manager is already looking at it.
 *
 * Every status change used to mean opening the card, finding the select,
 * changing it and closing the card again — four interactions to record the
 * outcome of a call that took thirty seconds. The chip in the row is the
 * control now.
 *
 * Picking CALLBACK opens a second step asking *when*, because a "перезвонить"
 * with no time is the same as no status at all: it can't be queued, counted,
 * or chased. The date goes to the server in the same request as the stage, so
 * the follow-up queue can never disagree with the status that created it.
 */
export function StatusSelect({
  leadId, status, disabled,
}: { leadId: string; status: LeadStatus; disabled?: boolean }) {
  const setStatus = useSetLeadStatus();
  const [pendingStage, setPendingStage] = useState<LeadStatus | null>(null);
  const [when, setWhen] = useState("");

  async function apply(next: LeadStatus, nextActionAt?: string | null, close?: () => void) {
    if (next === status && nextActionAt === undefined) return close?.();
    try {
      await setStatus.mutateAsync({
        id: leadId, status: next,
        nextActionAt: nextActionAt ?? undefined,
        nextActionType: nextActionAt ? "CALL" : undefined,
      });
      toast.success("Статус изменён", LEAD_STATUS_LABEL[next]);
      close?.();
    } catch (e) {
      toast.error("Не удалось изменить статус", e instanceof ApiError ? e.message : undefined);
    }
  }

  const step = pipelineStep(status);

  return (
    <span onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Popover
        align="left"
        portal
        panelClassName="max-h-[70vh] overflow-y-auto"
        trigger={(open, toggle) => (
          <button
            type="button"
            disabled={disabled || setStatus.isPending}
            onClick={() => { setPendingStage(null); toggle(); }}
            aria-expanded={open}
            className="btn-fx rounded-full disabled:opacity-50"
            title="Изменить статус"
          >
            <StatusChip tone={LEAD_STATUS_TONE[status]}>
              {LEAD_STATUS_LABEL[status]}
              {step > 0 && <span className="ml-1 tabular opacity-60">{step}/{PIPELINE_STAGES.length}</span>}
            </StatusChip>
          </button>
        )}
      >
        {(close) =>
          pendingStage ? (
            <FollowUpPanel
              title="Когда перезвонить?"
              busy={setStatus.isPending}
              onPick={(at) => apply(pendingStage, at, close)}
              onCancel={() => setPendingStage(null)}
            />
          ) : (
            <div className="w-60 p-1.5">
              <Group label={step > 0 ? `Воронка · шаг ${step} из ${PIPELINE_STAGES.length}` : "Вернуть в воронку"} />
              {PIPELINE_STAGES.map((s, i) => (
                <StageButton
                  key={s} status={s} current={status} index={i + 1}
                  onPick={() => (s === "CALLBACK" ? setPendingStage(s) : apply(s, undefined, close))}
                />
              ))}
              <Group label="Закрыть лида" />
              {TERMINAL_STATUSES.map((s) => (
                <StageButton key={s} status={s} current={status} onPick={() => apply(s, null, close)} />
              ))}
            </div>
          )
        }
      </Popover>
    </span>
  );
}

function Group({ label }: { label: string }) {
  return (
    <div className="px-1.5 pb-1 pt-1.5 text-3xs font-semibold uppercase tracking-wide text-txt-3">{label}</div>
  );
}

function StageButton({
  status, current, index, onPick,
}: { status: LeadStatus; current: LeadStatus; index?: number; onPick: () => void }) {
  const active = status === current;
  return (
    <button
      onClick={onPick}
      className={classNames(
        "btn-fx tap-sm flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-2xs",
        active ? "bg-bg-3 text-txt-0" : "text-txt-1 hover:bg-bg-3"
      )}
    >
      {index !== undefined && <span className="tabular w-3 shrink-0 text-txt-3">{index}</span>}
      <StatusChip tone={LEAD_STATUS_TONE[status]}>{LEAD_STATUS_LABEL[status]}</StatusChip>
      {active && <span className="ml-auto text-3xs text-txt-3">сейчас</span>}
    </button>
  );
}
