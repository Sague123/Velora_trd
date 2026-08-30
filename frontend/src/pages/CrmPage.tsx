import { FormEvent, useState } from "react";
import { useCrmMeta, useImportLead, useLeads, type LeadFilters } from "../hooks/useCrm";
import { LeadCard } from "../components/crm/LeadCard";
import { StatusChip } from "../components/crm/StatusChip";
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE,
} from "../components/crm/leadLabels";
import { EmptyRow, SkeletonTableRows } from "../components/common/States";
import { SiteFooter } from "../components/layout/SiteFooter";
import { classNames, fmtDateTime } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import type { LeadStatus } from "../lib/types";
import { IconClipboard } from "../components/icons/Icon";

const inputCls =
  "w-full rounded-lg border border-line bg-bg-2 px-2.5 py-1.5 text-xs text-txt-0 outline-none placeholder:text-txt-3 focus:border-accent";

/**
 * Manual intake. Affiliate webhooks are out of scope for this milestone, so
 * this is how a lead gets into the pipeline — and it is the same endpoint a
 * webhook handler will call later.
 */
function ImportForm({ onClose }: { onClose: () => void }) {
  const importLead = useImportLead();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [country, setCountry] = useState("");
  const [source, setSource] = useState("");

  // The server enforces this too; saying it here just avoids a round trip to
  // learn something the form already knows.
  const hasContact = !!phone.trim() || !!email.trim();

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await importLead.mutateAsync({
        fullName: fullName.trim(),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        country: country.trim() || undefined,
        source: source.trim() || undefined,
      });
      toast.success("Лид добавлен", res.lead.platform ? "Уже зарегистрирован на платформе" : undefined);
      onClose();
    } catch (e) {
      toast.error("Не удалось добавить лида", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <form onSubmit={submit} className="anim-rise mb-3 rounded-lg border border-line bg-bg-1 p-3">
      <div className="mb-2 text-2xs font-semibold uppercase tracking-wide text-txt-2">Новый лид</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
        <input required minLength={2} value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} placeholder="ФИО*" />
        <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} mono`} placeholder="Телефон" />
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="Email" />
        <input value={country} onChange={(e) => setCountry(e.target.value)} className={inputCls} placeholder="Страна" />
        <input value={source} onChange={(e) => setSource(e.target.value)} className={inputCls} placeholder="Источник" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={!hasContact || fullName.trim().length < 2 || importLead.isPending}
          className="btn-fx rounded-lg bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
        >
          {importLead.isPending ? "Добавление…" : "Добавить"}
        </button>
        <button type="button" onClick={onClose} className="btn-fx rounded-lg border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
          Отмена
        </button>
        {!hasContact && <span className="text-2xs text-txt-3">Нужен телефон или email</span>}
      </div>
    </form>
  );
}

export function CrmPage() {
  const meta = useCrmMeta();
  const [filters, setFilters] = useState<LeadFilters>({
    status: "", managerId: "", search: "", verificationStatus: "", converted: "", source: "",
    createdFrom: "", createdTo: "", page: 1, pageSize: 25,
  });
  // Typed separately from the applied filter so the list isn't refetched on
  // every keystroke of a phone number.
  const [searchDraft, setSearchDraft] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { data, isLoading } = useLeads(filters);
  const patch = (next: Partial<LeadFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize));

  return (
    <div className="mx-auto flex h-full w-full max-w-[1500px] flex-col overflow-y-auto p-3">
      {openId && <LeadCard leadId={openId} onClose={() => setOpenId(null)} />}

      <div className="anim-rise relative mb-3 overflow-hidden rounded-xl border border-line bg-bg-1 px-4 py-3">
        <div className="section-glow" aria-hidden />
        <div className="neon-strip" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-1.5 text-sm font-semibold text-txt-0">
            <IconClipboard size={15} /> CRM — лиды
          </h1>
          <span className="text-2xs text-txt-3">Всего: {data?.total ?? 0}</span>
          <button
            onClick={() => setImporting((v) => !v)}
            className="btn-fx ml-auto rounded-lg border border-accent/40 px-3 py-1.5 text-2xs font-medium text-accent hover:bg-accent-soft"
          >
            {importing ? "Скрыть форму" : "Добавить лида"}
          </button>
        </div>
      </div>

      {importing && <ImportForm onClose={() => setImporting(false)} />}

      <div className="anim-rise-2 mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-bg-1 p-3">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Поиск по телефону, email или ФИО</span>
          <form
            onSubmit={(e) => { e.preventDefault(); patch({ search: searchDraft }); }}
          >
            <input
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onBlur={() => patch({ search: searchDraft })}
              className={inputCls}
              placeholder="+7900…, name@mail, Иванов"
            />
          </form>
        </label>

        <label className="min-w-[150px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Статус</span>
          <select
            value={filters.status}
            onChange={(e) => patch({ status: e.target.value as LeadStatus | "" })}
            className={inputCls}
          >
            <option value="">Все</option>
            {(meta.data?.statuses ?? []).map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABEL[s] ?? s}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[150px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Верификация</span>
          <select
            value={filters.verificationStatus}
            onChange={(e) => patch({ verificationStatus: e.target.value as LeadFilters["verificationStatus"] })}
            className={inputCls}
          >
            <option value="">Все</option>
            {(meta.data?.verificationStatuses ?? []).map((s) => (
              <option key={s} value={s}>{VERIFICATION_LABEL[s] ?? s}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[150px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Клиент</span>
          <select
            value={filters.converted}
            onChange={(e) => patch({ converted: e.target.value as LeadFilters["converted"] })}
            className={inputCls}
          >
            <option value="">Все</option>
            <option value="true">Уже клиент</option>
            <option value="false">Ещё лид</option>
          </select>
        </label>

        <label className="min-w-[150px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Источник</span>
          <select value={filters.source} onChange={(e) => patch({ source: e.target.value })} className={inputCls}>
            <option value="">Все</option>
            {(meta.data?.sources ?? []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[170px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Отв.</span>
          <select value={filters.managerId} onChange={(e) => patch({ managerId: e.target.value })} className={inputCls}>
            <option value="">Все</option>
            {(meta.data?.managers ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[130px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Создан с</span>
          <input type="date" value={filters.createdFrom} onChange={(e) => patch({ createdFrom: e.target.value })} className={inputCls} />
        </label>

        <label className="min-w-[130px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">по</span>
          <input type="date" value={filters.createdTo} onChange={(e) => patch({ createdTo: e.target.value })} className={inputCls} />
        </label>

        {(filters.status || filters.managerId || filters.search || filters.verificationStatus
          || filters.converted || filters.source || filters.createdFrom || filters.createdTo) && (
          <button
            onClick={() => {
              setSearchDraft("");
              setFilters((f) => ({
                ...f, status: "", managerId: "", search: "", verificationStatus: "",
                converted: "", source: "", createdFrom: "", createdTo: "", page: 1,
              }));
            }}
            className="btn-fx rounded-lg border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0"
          >
            Сбросить
          </button>
        )}
      </div>

      <div className="anim-rise-3 min-h-0 flex-1 overflow-x-auto rounded-lg border border-line bg-bg-1">
        {!isLoading && (data?.leads.length ?? 0) === 0 && (
          <EmptyRow label={filters.search || filters.status || filters.managerId
            ? "Под фильтры ничего не подошло"
            : "Лидов пока нет — добавьте первого кнопкой выше"} />
        )}

        {(isLoading || (data?.leads.length ?? 0) > 0) && (
          <table className="w-full min-w-[900px] text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-3 py-2 font-medium">ФИО</th>
                <th className="px-3 py-2 font-medium">Телефон</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Статус</th>
                <th className="px-3 py-2 font-medium">Верификация</th>
                <th className="px-3 py-2 font-medium">Страна</th>
                <th className="px-3 py-2 font-medium">Ответственный</th>
                <th className="px-3 py-2 font-medium">Создан</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <SkeletonTableRows columns={8} />}
              {!isLoading && data!.leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="cursor-pointer border-b border-line-soft/60 hover:bg-bg-2/60"
                >
                  <td className="px-3 py-2 text-txt-0">
                    {l.fullName}
                    {l.platformUserId && (
                      <span className="ml-1.5 rounded bg-accent-soft px-1 py-0.5 text-accent">клиент</span>
                    )}
                  </td>
                  <td className="mono px-3 py-2 text-txt-1">{l.phone ?? "—"}</td>
                  <td className="px-3 py-2 text-txt-1">{l.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <StatusChip tone={LEAD_STATUS_TONE[l.status]}>{LEAD_STATUS_LABEL[l.status]}</StatusChip>
                  </td>
                  <td className="px-3 py-2">
                    <StatusChip tone={VERIFICATION_TONE[l.verificationStatus]}>
                      {VERIFICATION_LABEL[l.verificationStatus]}
                    </StatusChip>
                  </td>
                  <td className="px-3 py-2 text-txt-2">{l.country ?? "—"}</td>
                  <td className="px-3 py-2 text-txt-2">{l.assignedManager?.name ?? "—"}</td>
                  <td className="tabular px-3 py-2 text-txt-3">{fmtDateTime(l.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-2 flex items-center justify-end gap-2 text-2xs text-txt-2">
          <button
            disabled={filters.page <= 1}
            onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
            className={classNames("btn-fx rounded-lg border border-line px-2.5 py-1", filters.page <= 1 && "opacity-40")}
          >
            Назад
          </button>
          <span className="tabular">{filters.page} / {totalPages}</span>
          <button
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className={classNames("btn-fx rounded-lg border border-line px-2.5 py-1", filters.page >= totalPages && "opacity-40")}
          >
            Вперёд
          </button>
        </div>
      )}

      <SiteFooter compact />
    </div>
  );
}
