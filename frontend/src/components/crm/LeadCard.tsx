import { FormEvent, useState } from "react";
import {
  useAddLeadComment, useAssignLead, useCrmMeta, useLead, useLeadComments,
  useSetLeadStatus, useSetLeadVerification,
} from "../../hooks/useCrm";
import { classNames, fmtDateTime, fmtUsd } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { LoadingRow } from "../common/States";
import { StatusChip } from "./StatusChip";
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE,
} from "./leadLabels";
import type { LeadStatus, LeadVerificationStatus } from "../../lib/types";
import { IconClose } from "../icons/Icon";

const selectCls =
  "w-full rounded border border-line bg-bg-2 px-2 py-1.5 text-xs text-txt-0 outline-none focus:border-accent";

/** History rows store the raw enum value; the timeline should read the same
 * way the selects above it do, not in database vocabulary. Unknown values fall
 * through as-is rather than rendering blank — a stage removed from the enum
 * later still has to be readable in the log of what happened. */
function historyLabel(kind: "STATUS" | "VERIFICATION", value: string | null): string {
  if (!value) return "—";
  const map: Record<string, string> = kind === "STATUS" ? LEAD_STATUS_LABEL : VERIFICATION_LABEL;
  return map[value] ?? value;
}

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-2xs text-txt-2">{label}</div>
      {/* Missing data shows an em dash. Never a plausible-looking placeholder —
          a CRM that invents a phone number is worse than one that admits it
          has none. */}
      <div className={classNames("text-xs text-txt-0", mono && "mono")}>{value || "—"}</div>
    </div>
  );
}

/**
 * The lead card: personal data, the two status selects, and the managers'
 * comment thread. One tab for now — status history and trading activity are a
 * separate task once this slice is in use.
 */
export function LeadCard({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const detail = useLead(leadId);
  const comments = useLeadComments(leadId);
  const meta = useCrmMeta();
  const setStatus = useSetLeadStatus();
  const setVerification = useSetLeadVerification();
  const assign = useAssignLead();
  const addComment = useAddLeadComment();
  const [text, setText] = useState("");

  const lead = detail.data?.lead;
  const history = detail.data?.history ?? [];

  function fail(e: unknown, what: string) {
    toast.error(what, e instanceof ApiError ? e.message : undefined);
  }

  async function changeStatus(status: LeadStatus) {
    try { await setStatus.mutateAsync({ id: leadId, status }); }
    catch (e) { fail(e, "Не удалось сменить статус"); }
  }

  async function changeVerification(verificationStatus: LeadVerificationStatus) {
    try { await setVerification.mutateAsync({ id: leadId, verificationStatus }); }
    catch (e) { fail(e, "Не удалось сменить статус верификации"); }
  }

  async function changeManager(managerId: string) {
    try { await assign.mutateAsync({ id: leadId, managerId: managerId || null }); }
    catch (e) { fail(e, "Не удалось назначить менеджера"); }
  }

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await addComment.mutateAsync({ id: leadId, text: text.trim() });
      setText("");
    } catch (e) {
      fail(e, "Не удалось добавить комментарий");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-bg-1 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-bg-2/40 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-txt-0">{lead?.fullName ?? "…"}</div>
            {lead && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                <StatusChip tone={LEAD_STATUS_TONE[lead.status]}>{LEAD_STATUS_LABEL[lead.status]}</StatusChip>
                <StatusChip tone={VERIFICATION_TONE[lead.verificationStatus]}>
                  {VERIFICATION_LABEL[lead.verificationStatus]}
                </StatusChip>
                {lead.platform && <StatusChip tone="accent">зарегистрирован</StatusChip>}
              </div>
            )}
          </div>
          <button onClick={onClose} className="btn-fx flex shrink-0 items-center gap-1 rounded border border-line px-2 py-1 text-xs text-txt-2 hover:text-txt-0">
            <IconClose size={12} /> Закрыть
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {detail.isLoading && <LoadingRow />}

          {lead && (
            <>
              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">Персональные данные</div>
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line-soft bg-bg-2/30 p-3 sm:grid-cols-3">
                <Field label="ФИО" value={lead.fullName} />
                <Field label="Телефон" value={lead.phone} mono />
                <Field label="Email" value={lead.email} />
                <Field label="Страна" value={lead.country} />
                <Field label="Источник" value={lead.source} />
                <Field label="Создан" value={fmtDateTime(lead.createdAt)} />
              </div>

              {/* Everything here is read live from the platform account on each
                  request, not copied into the lead — so a KYC decision or a
                  deposit from a minute ago is already reflected. */}
              {lead.platform && (
                <>
                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                    Аккаунт на платформе
                  </div>
                  <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-accent/25 bg-accent-soft/40 p-3 sm:grid-cols-3">
                    <Field label="Email аккаунта" value={lead.platform.email} />
                    <Field label="Баланс" value={fmtUsd(lead.platform.balance)} />
                    <Field label="KYC" value={lead.platform.kycStatus} />
                    <Field label="Регистрация" value={lead.platform.registeredAt ? fmtDateTime(lead.platform.registeredAt) : null} />
                    <Field label="Последний вход" value={lead.platform.lastLoginAt ? fmtDateTime(lead.platform.lastLoginAt) : null} />
                    <Field label="Последнее действие" value={lead.platform.lastActionAt ? fmtDateTime(lead.platform.lastActionAt) : null} />
                  </div>
                </>
              )}

              <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="mb-1 block text-2xs font-medium text-txt-2">Статус лида</span>
                  <select
                    value={lead.status}
                    disabled={setStatus.isPending}
                    onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                    className={selectCls}
                  >
                    {(meta.data?.statuses ?? [lead.status]).map((s) => (
                      <option key={s} value={s}>{LEAD_STATUS_LABEL[s] ?? s}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-2xs font-medium text-txt-2">Верификация</span>
                  <select
                    value={lead.verificationStatus}
                    disabled={setVerification.isPending}
                    onChange={(e) => changeVerification(e.target.value as LeadVerificationStatus)}
                    className={selectCls}
                  >
                    {(meta.data?.verificationStatuses ?? [lead.verificationStatus]).map((s) => (
                      <option key={s} value={s}>{VERIFICATION_LABEL[s] ?? s}</option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-2xs font-medium text-txt-2">Ответственный</span>
                  <select
                    value={lead.assignedManager?.id ?? ""}
                    disabled={assign.isPending}
                    onChange={(e) => changeManager(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">Не назначен</option>
                    {(meta.data?.managers ?? []).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                Комментарии ({comments.data?.comments.length ?? 0})
              </div>

              <form onSubmit={submitComment} className="mb-3">
                <textarea
                  rows={2}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Что сказал клиент, о чём договорились, когда перезвонить…"
                  className="w-full resize-none rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none placeholder:text-txt-3 focus:border-accent"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="submit"
                    disabled={!text.trim() || addComment.isPending}
                    className="btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
                  >
                    {addComment.isPending ? "Отправка…" : "Добавить"}
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                {comments.isLoading && <LoadingRow />}
                {!comments.isLoading && (comments.data?.comments.length ?? 0) === 0 && (
                  <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-2xs text-txt-3">
                    Комментариев пока нет.
                  </div>
                )}
                {(comments.data?.comments ?? []).map((c) => (
                  <div key={c.id} className="rounded-lg border border-line-soft bg-bg-2/30 px-3 py-2">
                    <div className="mb-1 flex items-baseline gap-2">
                      <span className="text-2xs font-medium text-txt-1">{c.manager.name}</span>
                      <span className="tabular text-2xs text-txt-3">{fmtDateTime(c.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-xs text-txt-1">{c.text}</div>
                  </div>
                ))}
              </div>

              {history.length > 0 && (
                <>
                  <div className="mt-4 mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                    История статусов
                  </div>
                  <div className="space-y-0.5 rounded-lg border border-line-soft bg-bg-2/30 p-2">
                    {history.map((h) => (
                      <div key={h.id} className="flex flex-wrap items-center gap-1.5 text-2xs text-txt-2">
                        <span className="tabular text-txt-3">{fmtDateTime(h.createdAt)}</span>
                        <span className="text-txt-3">{h.kind === "STATUS" ? "статус" : "верификация"}:</span>
                        <span>
                          {historyLabel(h.kind, h.oldStatus)} → <span className="text-txt-0">{historyLabel(h.kind, h.newStatus)}</span>
                        </span>
                        {h.manager && <span className="text-txt-3">· {h.manager.name}</span>}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
