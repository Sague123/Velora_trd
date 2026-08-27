import { FormEvent, useState } from "react";
import { useCrmMeta, useImportLead, useLeads, type LeadFilters, type LeadSortColumn } from "../hooks/useCrm";
import { LeadCard } from "../components/crm/LeadCard";
import { StatusChip } from "../components/crm/StatusChip";
import {
  LEAD_STATUS_LABEL, LEAD_STATUS_TONE, TONE_TEXT_CLASS, VERIFICATION_LABEL, VERIFICATION_TONE,
} from "../components/crm/leadLabels";
import { EmptyRow, LoadingRow } from "../components/common/States";
import { SiteFooter } from "../components/layout/SiteFooter";
import { classNames, fmtDateTime } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import type { KycStatus, LeadStatus } from "../lib/types";
import { IconChevron, IconClipboard } from "../components/icons/Icon";

const inputCls =
  "w-full rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs text-txt-0 outline-none placeholder:text-txt-3 focus:border-accent";
const colFilterCls =
  "w-full rounded border border-line-soft bg-bg-2/60 px-1.5 py-1 text-2xs text-txt-1 outline-none placeholder:text-txt-3 focus:border-accent";

const KYC_LABEL: Record<KycStatus, string> = {
  NONE: "Нет", PENDING: "На проверке", APPROVED: "Подтверждён", REJECTED: "Отклонён",
};

const DEFAULT_FILTERS: LeadFilters = {
  status: "", managerId: "", kycStatus: "", search: "",
  fullName: "", phone: "", email: "", country: "", accountNumber: "",
  sortBy: "createdAt", sortDir: "desc", page: 1, pageSize: 25,
};

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
          className="btn-fx rounded bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
        >
          {importLead.isPending ? "Добавление…" : "Добавить"}
        </button>
        <button type="button" onClick={onClose} className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
          Отмена
        </button>
        {!hasContact && <span className="text-2xs text-txt-3">Нужен телефон или email</span>}
      </div>
    </form>
  );
}

/** One clickable column header with a sort-direction indicator. Clicking the
 * currently-sorted column flips its direction; clicking a different one
 * switches to it, defaulting to descending (newest/highest first, which is
 * the more useful starting direction for every column here). */
function SortHeader({
  label, column, filters, onSort,
}: {
  label: string;
  column: LeadSortColumn;
  filters: LeadFilters;
  onSort: (column: LeadSortColumn) => void;
}) {
  const active = filters.sortBy === column;
  return (
    <button
      onClick={() => onSort(column)}
      className={classNames(
        "btn-fx flex items-center gap-0.5 font-medium",
        active ? "text-txt-0" : "text-txt-3 hover:text-txt-1"
      )}
    >
      {label}
      <IconChevron
        size={9}
        direction={active && filters.sortDir === "asc" ? "up" : "down"}
        className={active ? "opacity-100" : "opacity-30"}
      />
    </button>
  );
}

export function CrmPage() {
  const meta = useCrmMeta();
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  // Typed separately from the applied filter so the list isn't refetched on
  // every keystroke — each commits on blur or Enter, same pattern as the
  // original single search box.
  const [drafts, setDrafts] = useState({
    search: "", fullName: "", phone: "", email: "", country: "", accountNumber: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const { data, isLoading } = useLeads(filters);
  const patch = (next: Partial<LeadFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize));

  function sortBy(column: LeadSortColumn) {
    setFilters((f) => ({
      ...f, page: 1, sortBy: column,
      sortDir: f.sortBy === column && f.sortDir === "desc" ? "asc" : "desc",
    }));
  }

  const hasAnyFilter = !!(filters.status || filters.managerId || filters.kycStatus || filters.search
    || filters.fullName || filters.phone || filters.email || filters.country || filters.accountNumber);

  function resetAll() {
    setDrafts({ search: "", fullName: "", phone: "", email: "", country: "", accountNumber: "" });
    setFilters(DEFAULT_FILTERS);
  }

  // A column filter input: local draft state, committed to the real filter on
  // blur or Enter — same debounce-by-interaction the top search box already used.
  function colFilter(key: keyof typeof drafts, filterKey: keyof LeadFilters, placeholder: string, mono?: boolean) {
    return (
      <input
        value={drafts[key]}
        onChange={(e) => setDrafts((d) => ({ ...d, [key]: e.target.value }))}
        onBlur={() => patch({ [filterKey]: drafts[key] } as Partial<LeadFilters>)}
        onKeyDown={(e) => { if (e.key === "Enter") patch({ [filterKey]: drafts[key] } as Partial<LeadFilters>); }}
        placeholder={placeholder}
        className={classNames(colFilterCls, mono && "mono")}
      />
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-y-auto p-3">
      {openId && <LeadCard leadId={openId} onClose={() => setOpenId(null)} />}

      <div className="anim-rise mb-3 flex flex-wrap items-center gap-2">
        <h1 className="flex items-center gap-1.5 text-sm font-semibold text-txt-0">
          <IconClipboard size={15} /> CRM — клиенты и лиды
        </h1>
        <span className="text-2xs text-txt-3">Всего: {data?.total ?? 0}</span>
        <button
          onClick={() => setImporting((v) => !v)}
          className="btn-fx ml-auto rounded border border-accent/40 px-3 py-1.5 text-2xs font-medium text-accent hover:bg-accent-soft"
        >
          {importing ? "Скрыть форму" : "Добавить лида"}
        </button>
      </div>

      {importing && <ImportForm onClose={() => setImporting(false)} />}

      <div className="anim-rise-2 mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-line bg-bg-1 p-3">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Быстрый поиск по телефону, email или ФИО</span>
          <form onSubmit={(e) => { e.preventDefault(); patch({ search: drafts.search }); }}>
            <input
              value={drafts.search}
              onChange={(e) => setDrafts((d) => ({ ...d, search: e.target.value }))}
              onBlur={() => patch({ search: drafts.search })}
              className={inputCls}
              placeholder="+7900…, name@mail, Иванов"
            />
          </form>
        </label>

        <label className="min-w-[170px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Статус</span>
          <select value={filters.status} onChange={(e) => patch({ status: e.target.value as LeadStatus | "" })} className={inputCls}>
            <option value="">Все</option>
            {(meta.data?.statuses ?? []).map((s) => (
              <option key={s} value={s}>{LEAD_STATUS_LABEL[s] ?? s}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[150px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">KYC</span>
          <select value={filters.kycStatus} onChange={(e) => patch({ kycStatus: e.target.value as LeadFilters["kycStatus"] })} className={inputCls}>
            <option value="">Все</option>
            {(["NONE", "PENDING", "APPROVED", "REJECTED"] as KycStatus[]).map((s) => (
              <option key={s} value={s}>{KYC_LABEL[s]}</option>
            ))}
          </select>
        </label>

        <label className="min-w-[170px]">
          <span className="mb-1 block text-2xs font-medium text-txt-2">Ответственный</span>
          <select value={filters.managerId} onChange={(e) => patch({ managerId: e.target.value })} className={inputCls}>
            <option value="">Все</option>
            {(meta.data?.managers ?? []).map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </label>

        {hasAnyFilter && (
          <button onClick={resetAll} className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
            Сбросить всё
          </button>
        )}
      </div>

      <div className="anim-rise-3 min-h-0 flex-1 overflow-x-auto rounded-lg border border-line bg-bg-1">
        {isLoading && <LoadingRow />}
        {!isLoading && (data?.leads.length ?? 0) === 0 && (
          <EmptyRow label={hasAnyFilter ? "Под фильтры ничего не подошло" : "Лидов пока нет — добавьте первого кнопкой выше"} />
        )}

        {(data?.leads.length ?? 0) > 0 && (
          <table className="w-full min-w-[1080px] text-2xs">
            <thead className="border-b border-line-soft text-left text-txt-3">
              <tr>
                <th className="px-3 pt-2"><SortHeader label="ID" column="accountNumber" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="ФИО" column="fullName" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Телефон" column="phone" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Email" column="email" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Статус" column="status" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Верификация" column="verificationStatus" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Страна" column="country" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Ответственный" column="manager" filters={filters} onSort={sortBy} /></th>
                <th className="px-3 pt-2"><SortHeader label="Создан" column="createdAt" filters={filters} onSort={sortBy} /></th>
              </tr>
              {/* Per-column search — narrower and quieter than the row above,
                  so it reads as a refinement of the quick search, not a
                  second, competing search bar. */}
              <tr>
                <th className="px-3 pb-2">{colFilter("accountNumber", "accountNumber", "напр. 42081930", true)}</th>
                <th className="px-3 pb-2">{colFilter("fullName", "fullName", "Иванов")}</th>
                <th className="px-3 pb-2">{colFilter("phone", "phone", "+7900…", true)}</th>
                <th className="px-3 pb-2">{colFilter("email", "email", "name@mail")}</th>
                <th className="px-3 pb-2" />
                <th className="px-3 pb-2" />
                <th className="px-3 pb-2">{colFilter("country", "country", "RU, KZ…")}</th>
                <th className="px-3 pb-2" />
                <th className="px-3 pb-2" />
              </tr>
            </thead>
            <tbody>
              {data!.leads.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setOpenId(l.id)}
                  className="cursor-pointer border-b border-line-soft/60 hover:bg-bg-2/60"
                >
                  <td className="mono px-3 py-2 text-txt-2">{l.accountNumber ?? "—"}</td>
                  <td className={classNames("px-3 py-2 font-medium", TONE_TEXT_CLASS[LEAD_STATUS_TONE[l.status]])}>
                    {l.fullName}
                    {l.platformUserId && (
                      <span className="ml-1.5 rounded bg-accent-soft px-1 py-0.5 font-normal text-accent">клиент</span>
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
            className={classNames("btn-fx rounded border border-line px-2.5 py-1", filters.page <= 1 && "opacity-40")}
          >
            Назад
          </button>
          <span className="tabular">{filters.page} / {totalPages}</span>
          <button
            disabled={filters.page >= totalPages}
            onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
            className={classNames("btn-fx rounded border border-line px-2.5 py-1", filters.page >= totalPages && "opacity-40")}
          >
            Вперёд
          </button>
        </div>
      )}

      <SiteFooter compact />
    </div>
  );
}
