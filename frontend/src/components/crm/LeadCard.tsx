import { FormEvent, useEffect, useState } from "react";
import {
  useAssignLead, useCrmMeta, useEditLead, useLead, useSetLeadStatus, useSetLeadVerification,
} from "../../hooks/useCrm";
import { useAuthStore } from "../../store/auth";
import { classNames, fmtDateTime, fmtUsd } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { LoadingRow } from "../common/States";
import { StatusChip } from "./StatusChip";
import { CommentsPanel } from "./CommentsPanel";
import { AccountPanel } from "./AccountPanel";
import { KycPanel } from "./KycPanel";
import { AuditPanel } from "./AuditPanel";
import { PasswordResetForm } from "./PasswordResetForm";
import { ConvertLeadButton, RevealedPasswordBanner } from "./ConvertLeadButton";
import { ViewTokenButton } from "./ViewTokenButton";
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TONE, TONE_TEXT_CLASS, VERIFICATION_LABEL, VERIFICATION_TONE,
} from "./leadLabels";
import type { LeadStatus, LeadVerificationStatus } from "../../lib/types";
import { IconClose, IconPencil } from "../icons/Icon";

const selectCls =
  "w-full rounded-lg border border-line bg-bg-2 px-2 py-1.5 text-xs text-txt-0 outline-none focus:border-accent";
const inputCls = selectCls;

type Tab = "main" | "account" | "kyc";

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

interface EditForm {
  fullName: string;
  phone: string;
  email: string;
  country: string;
  source: string;
}

/**
 * The lead card — one place for everything the desk knows about a client,
 * split into three tabs so "who is this" doesn't compete for space with
 * "what's in their account" or "what documents did they send": Основное
 * (identity, pipeline stage, password/logs), Аккаунт (platform account,
 * balance, positions, trades, ledger), and KYC (identity documents).
 * Comments are not a tab — they sit permanently docked on the right, because
 * "what was said and when" is exactly the context a manager wants the instant
 * the card opens, not one click further away (see CommentsPanel.tsx).
 */
export function LeadCard({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const detail = useLead(leadId);
  const meta = useCrmMeta();
  const me = useAuthStore((s) => s.user);
  const setStatus = useSetLeadStatus();
  const setVerification = useSetLeadVerification();
  const assign = useAssignLead();
  const editLead = useEditLead();

  const [tab, setTab] = useState<Tab>("main");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<EditForm | null>(null);
  // Lifted out of the convert/account branch on purpose: converting flips
  // that branch from "show the convert button" to "show the account panel" on
  // the very next refetch, which would unmount a locally-held reveal before
  // anyone had a chance to read it. Rendered above the tabs so it survives a
  // tab switch too.
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);

  const lead = detail.data?.lead;
  const history = detail.data?.history ?? [];
  const myPermissions = meta.data?.myPermissions ?? [];
  const isAdmin = me?.role === "ADMIN";

  // Seeds the edit form from the lead the first time it loads, and again
  // whenever the card is re-opened for a different lead — never mid-edit,
  // which would blow away what the manager is typing.
  useEffect(() => {
    if (lead && !editing) {
      setForm({
        fullName: lead.fullName, phone: lead.phone ?? "", email: lead.email ?? "",
        country: lead.country ?? "", source: lead.source ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

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

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    try {
      await editLead.mutateAsync({
        id: leadId,
        input: {
          fullName: form.fullName.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          country: form.country.trim() || null,
          source: form.source.trim() || null,
        },
      });
      setEditing(false);
      toast.success("Карточка обновлена");
    } catch (e) {
      fail(e, "Не удалось сохранить изменения");
    }
  }

  function cancelEdit() {
    if (lead) {
      setForm({
        fullName: lead.fullName, phone: lead.phone ?? "", email: lead.email ?? "",
        country: lead.country ?? "", source: lead.source ?? "",
      });
    }
    setEditing(false);
  }

  const nameTone = lead ? TONE_TEXT_CLASS[LEAD_STATUS_TONE[lead.status]] : "";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-line bg-bg-1 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line bg-bg-2/40 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-2">
              <span className={classNames("truncate text-sm font-semibold", nameTone)}>{lead?.fullName ?? "…"}</span>
              {lead?.accountNumber && <span className="mono shrink-0 text-2xs text-txt-3">ID {lead.accountNumber}</span>}
            </div>
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
          <button onClick={onClose} className="btn-fx flex shrink-0 items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-txt-2 hover:text-txt-0">
            <IconClose size={12} /> Закрыть
          </button>
        </div>

        {revealedPassword && (
          <div className="shrink-0 px-4 pt-3">
            <RevealedPasswordBanner password={revealedPassword} onDismiss={() => setRevealedPassword(null)} />
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex min-h-0 flex-1 flex-col lg:border-r lg:border-line">
            <div className="flex shrink-0 gap-0.5 border-b border-line px-3 pt-2">
              {(
                [
                  ["main", "Основное"],
                  ["account", "Аккаунт"],
                  ["kyc", "KYC"],
                ] as [Tab, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={classNames(
                    "border-b-2 px-3 py-1.5 text-2xs font-medium",
                    tab === id ? "border-accent text-txt-0" : "border-transparent text-txt-2 hover:text-txt-0"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {detail.isLoading && <LoadingRow />}

              {lead && form && tab === "main" && (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Персональные данные</span>
                    {!editing && (
                      <button onClick={() => setEditing(true)} className="btn-fx flex items-center gap-1 text-2xs text-accent hover:underline">
                        <IconPencil size={11} /> Редактировать
                      </button>
                    )}
                  </div>

                  {editing ? (
                    <form onSubmit={saveEdit} className="mb-4 rounded-lg border border-accent/30 bg-accent-soft/20 p-3">
                      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <label className="block">
                          <span className="mb-1 block text-2xs text-txt-2">ФИО</span>
                          <input required minLength={2} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-2xs text-txt-2">Телефон</span>
                          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className={`${inputCls} mono`} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-2xs text-txt-2">Email</span>
                          <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-2xs text-txt-2">Страна</span>
                          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className={inputCls} />
                        </label>
                        <label className="block sm:col-span-2">
                          <span className="mb-1 block text-2xs text-txt-2">Источник</span>
                          <input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={inputCls} />
                        </label>
                      </div>
                      {!form.phone.trim() && !form.email.trim() && (
                        <div className="mb-2 text-2xs text-sell">Нужен телефон или email — иначе с лидом нельзя работать.</div>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={editLead.isPending || (!form.phone.trim() && !form.email.trim()) || form.fullName.trim().length < 2}
                          className="btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
                        >
                          {editLead.isPending ? "Сохранение…" : "Сохранить"}
                        </button>
                        <button type="button" onClick={cancelEdit} className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg border border-line-soft bg-bg-2/30 p-3 sm:grid-cols-3">
                      <Field label="ФИО" value={lead.fullName} />
                      <Field label="Телефон" value={lead.phone} mono />
                      <Field label="Email" value={lead.email} />
                      <Field label="Страна" value={lead.country} />
                      <Field label="Источник" value={lead.source} />
                      <Field label="Создан" value={fmtDateTime(lead.createdAt)} />
                    </div>
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

                  {isAdmin && lead.platform && (
                    <div className="mb-4 space-y-3">
                      <div className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Доступ</div>
                      <PasswordResetForm userId={lead.platform.userId} />
                    </div>
                  )}

                  <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">Логи</div>
                  {history.length > 0 && (
                    <div className="mb-3 space-y-0.5 rounded-lg border border-line-soft bg-bg-2/30 p-2">
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
                  )}
                  {isAdmin && lead.platform && <AuditPanel userId={lead.platform.userId} />}
                  {history.length === 0 && !(isAdmin && lead.platform) && (
                    <div className="rounded-lg border border-dashed border-line bg-bg-2/20 px-3 py-4 text-center text-2xs text-txt-3">
                      Событий пока нет.
                    </div>
                  )}
                </>
              )}

              {lead && tab === "account" && (
                lead.platform ? (
                  <>
                    <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-txt-2">
                      Аккаунт на платформе
                    </div>
                    <div className="mb-3 grid grid-cols-2 gap-3 rounded-lg border border-accent/25 bg-accent-soft/40 p-3 sm:grid-cols-3">
                      <Field label="Email аккаунта" value={lead.platform.email} />
                      <Field label="Баланс" value={fmtUsd(lead.platform.balance)} />
                      <Field label="KYC" value={lead.platform.kycStatus} />
                      <Field label="Статус" value={lead.platform.status} />
                      <Field label="Регистрация" value={lead.platform.registeredAt ? fmtDateTime(lead.platform.registeredAt) : null} />
                      <Field label="Последний вход" value={lead.platform.lastLoginAt ? fmtDateTime(lead.platform.lastLoginAt) : null} />
                    </div>

                    {myPermissions.includes("IMPERSONATE") && (
                      <div className="mb-3"><ViewTokenButton leadId={leadId} /></div>
                    )}

                    <AccountPanel leadId={leadId} permissions={myPermissions} platformStatus={lead.platform.status as "ACTIVE" | "SUSPENDED"} />
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-line bg-bg-2/20 p-3">
                    <p className="mb-2 text-2xs text-txt-2">
                      Ещё не зарегистрирован на платформе. Можно создать аккаунт прямо здесь — система выдаст
                      временный пароль, который клиент сменит при первом входе.
                    </p>
                    <ConvertLeadButton leadId={leadId} hasEmail={!!lead.email} onConverted={setRevealedPassword} />
                  </div>
                )
              )}

              {lead && tab === "kyc" && <KycPanel platform={lead.platform} isAdmin={isAdmin} />}
            </div>
          </div>

          {lead && (
            <div className="flex h-72 shrink-0 flex-col border-t border-line lg:h-auto lg:w-[340px] lg:border-l lg:border-t-0">
              <CommentsPanel leadId={leadId} leadName={lead.fullName} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
