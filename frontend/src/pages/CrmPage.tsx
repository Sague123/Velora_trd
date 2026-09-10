import { FormEvent, useMemo, useRef, useState } from "react";
import {
  useCrmMeta, useImportLead, useLeads, useLeadsSummary,
  type LeadFilters, type LeadSortColumn,
} from "../hooks/useCrm";
import { useLeadColumns } from "../hooks/useLeadColumns";
import { useIsMobile } from "../hooks/useIsMobile";
import { useAuthStore } from "../store/auth";
import { LeadCard } from "../components/crm/LeadCard";
import { StatusChip } from "../components/crm/StatusChip";
import { StatusSelect } from "../components/crm/StatusSelect";
import { NextActionCell } from "../components/crm/NextActionCell";
import { ContactAction } from "../components/crm/ContactActions";
import { ColumnManager } from "../components/crm/ColumnManager";
import { BulkBar } from "../components/crm/BulkBar";
import type { LeadColumn } from "../components/crm/leadColumns";
import {
  ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE, LEAD_STATUS_LABEL, VERIFICATION_LABEL,
} from "../components/crm/leadLabels";
import { EmptyRow, SkeletonTableRows } from "../components/common/States";
import { Checkbox } from "../components/common/Checkbox";
import { Page } from "../components/layout/Page";
import { classNames } from "../lib/format";
import { toast } from "../store/toast";
import { ApiError } from "../lib/api";
import { MultiSelect } from "../components/crm/MultiSelect";
import type { CrmMeta, KycStatus, Lead, LeadStatus } from "../lib/types";
import { IconChevron, IconClipboard, IconClose, IconSliders } from "../components/icons/Icon";
import { buttonCls, fieldCls } from "../lib/ui";

const inputCls = fieldCls("md", "w-full");
const colFilterCls = fieldCls("sm", "w-full border-line-soft bg-bg-2/60 text-txt-1");

const KYC_LABEL: Record<KycStatus, string> = {
  NONE: "Нет", PENDING: "На проверке", APPROVED: "Подтверждён", REJECTED: "Отклонён",
};

const ACCOUNT_FILTER_LABEL: Record<Exclude<LeadFilters["account"], "">, string> = {
  NO_ACCOUNT: "Без аккаунта",
  HAS_ACCOUNT: "С аккаунтом",
  ACTIVE: "Аккаунт активен",
  BLOCKED: "Аккаунт заблокирован",
};

const NEXT_ACTION_FILTER_LABEL: Record<Exclude<LeadFilters["nextAction"], "">, string> = {
  TODAY: "Сегодня",
  OVERDUE: "Просрочено",
  NONE: "Без плана",
};

const DEFAULT_FILTERS: LeadFilters = {
  status: [], managerId: [], kycStatus: [], verificationStatus: [], source: [],
  search: "", converted: "", createdFrom: "", createdTo: "",
  fullName: "", phone: "", email: "", country: "", accountNumber: "",
  account: "", nextAction: "",
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
          className={buttonCls("primary", "md")}
        >
          {importLead.isPending ? "Добавление…" : "Добавить"}
        </button>
        <button type="button" onClick={onClose} className={buttonCls("secondary", "sm")}>
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

/** Drag the right edge of a header to resize its column. Sits inside the
 * `<th>` and stops its own pointer events from reaching the sort button
 * underneath — a resize must never also re-sort the table. */
function ColumnResizer({ onDrag, onCommit }: { onDrag: (dx: number) => void; onCommit: () => void }) {
  const last = useRef(0);
  const dragging = useRef(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        dragging.current = true;
        last.current = e.clientX;
        (e.target as Element).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (!dragging.current) return;
        onDrag(e.clientX - last.current);
        last.current = e.clientX;
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.target as Element).releasePointerCapture(e.pointerId);
        onCommit();
      }}
      className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-accent/40"
    />
  );
}

/** The desk's own numbers, and a one-tap way into each of them. Each figure is
 * a filter the manager would otherwise have assembled by hand, so the count
 * and the view it describes are the same control. */
function SummaryBar({
  filters, onApply,
}: { filters: LeadFilters; onApply: (next: Partial<LeadFilters>) => void }) {
  const user = useAuthStore((s) => s.user);
  const { data } = useLeadsSummary();
  if (!data) return null;

  const items: { key: string; label: string; value: number; tone?: string; apply: Partial<LeadFilters>; active: boolean }[] = [
    {
      key: "overdue", label: "Просрочено", value: data.overdue, tone: data.overdue > 0 ? "text-cat-rose" : undefined,
      apply: { nextAction: "OVERDUE" }, active: filters.nextAction === "OVERDUE",
    },
    {
      key: "today", label: "Сегодня", value: data.dueToday, tone: data.dueToday > 0 ? "text-warn" : undefined,
      apply: { nextAction: "TODAY" }, active: filters.nextAction === "TODAY",
    },
    {
      key: "new", label: "Новые", value: data.newLeads,
      apply: { status: ["NEW"] as LeadStatus[] }, active: filters.status.length === 1 && filters.status[0] === "NEW",
    },
    {
      key: "unassigned", label: "Без ответственного", value: data.unassigned,
      apply: { managerId: ["none"] }, active: filters.managerId.length === 1 && filters.managerId[0] === "none",
    },
    {
      key: "mine", label: "Мои", value: data.mine,
      apply: { managerId: user ? [user.id] : [] }, active: !!user && filters.managerId.length === 1 && filters.managerId[0] === user.id,
    },
    {
      key: "accounts", label: "С аккаунтом", value: data.activeAccounts,
      apply: { account: "ACTIVE" }, active: filters.account === "ACTIVE",
    },
  ];

  return (
    <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onApply(it.active ? resetOf(it.apply) : it.apply)}
          className={classNames(
            "btn-fx flex shrink-0 items-baseline gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs transition-colors",
            it.active ? "border-accent bg-accent-soft text-accent" : "border-line bg-bg-1 text-txt-2 hover:border-accent/50"
          )}
        >
          <span className={classNames("tabular text-xs font-semibold", it.active ? "text-accent" : it.tone ?? "text-txt-0")}>
            {it.value}
          </span>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/** Pressing an active summary chip clears exactly the filter it set, rather
 * than resetting the whole toolbar out from under the manager. */
function resetOf(applied: Partial<LeadFilters>): Partial<LeadFilters> {
  const cleared: Partial<LeadFilters> = {};
  for (const key of Object.keys(applied) as (keyof LeadFilters)[]) {
    (cleared as Record<string, unknown>)[key] = Array.isArray(applied[key]) ? [] : "";
  }
  return cleared;
}

export function CrmPage() {
  const user = useAuthStore((s) => s.user);
  const meta = useCrmMeta();
  const isMobile = useIsMobile();
  const columns = useLeadColumns(user?.id);
  const [filters, setFilters] = useState<LeadFilters>(DEFAULT_FILTERS);
  // Typed separately from the applied filter so the list isn't refetched on
  // every keystroke — each commits on blur or Enter, same pattern as the
  // original single search box.
  const [drafts, setDrafts] = useState({
    search: "", fullName: "", phone: "", email: "", country: "", accountNumber: "",
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const { data, isLoading } = useLeads(filters);
  const patch = (next: Partial<LeadFilters>) => setFilters((f) => ({ ...f, page: 1, ...next }));
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / filters.pageSize));

  const leads = data?.leads ?? [];
  const pageIds = useMemo(() => leads.map((l) => l.id), [leads]);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.includes(id));

  function sortBy(column: LeadSortColumn) {
    setFilters((f) => ({
      ...f, page: 1, sortBy: column,
      sortDir: f.sortBy === column && f.sortDir === "desc" ? "asc" : "desc",
    }));
  }

  const hasAnyFilter = !!(filters.search
    || filters.fullName || filters.phone || filters.email || filters.country || filters.accountNumber
    || filters.converted || filters.createdFrom || filters.createdTo || filters.account || filters.nextAction)
    || filters.status.length > 0 || filters.managerId.length > 0 || filters.kycStatus.length > 0
    || filters.verificationStatus.length > 0 || filters.source.length > 0;

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
        onClick={(e) => e.stopPropagation()}
      />
    );
  }

  const visible = columns.visible;
  const hasColumnFilters = visible.some((c) => c.filter);

  return (
    <Page>
      {openId && <LeadCard leadId={openId} onClose={() => setOpenId(null)} />}

      <div className="anim-rise relative mb-3 overflow-hidden rounded-xl border border-line bg-bg-1 px-4 py-3">
        <div className="section-glow" aria-hidden />
        <div className="neon-strip" aria-hidden />
        <div className="relative flex flex-wrap items-center gap-2">
          <h1 className="flex items-center gap-1.5 text-sm font-semibold text-txt-0">
            <IconClipboard size={15} /> CRM — клиенты и лиды
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

      <SummaryBar filters={filters} onApply={patch} />

      {/* One line of controls by default. The five filters a desk touches
          hourly stay out; the rest (verification, KYC, source, date range)
          are one click away instead of permanently taking three rows of
          height above every lead. */}
      <div className="anim-rise-2 mb-3 rounded-lg border border-line bg-bg-1 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <form
            className="min-w-[180px] flex-1"
            onSubmit={(e) => { e.preventDefault(); patch({ search: drafts.search }); }}
          >
            <input
              value={drafts.search}
              onChange={(e) => setDrafts((d) => ({ ...d, search: e.target.value }))}
              onBlur={() => patch({ search: drafts.search })}
              className={inputCls}
              placeholder="Поиск: телефон, email или ФИО"
            />
          </form>

          <MultiSelect
            label="Этап"
            className="w-[150px]"
            allLabel="Этап: все"
            selected={filters.status}
            onChange={(v) => patch({ status: v as LeadStatus[] })}
            options={(meta.data?.statuses ?? []).map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] ?? s }))}
          />

          <select
            value={filters.account}
            onChange={(e) => patch({ account: e.target.value as LeadFilters["account"] })}
            className={fieldCls("md", "w-[150px]")}
          >
            <option value="">Аккаунт: все</option>
            {(Object.keys(ACCOUNT_FILTER_LABEL) as (keyof typeof ACCOUNT_FILTER_LABEL)[]).map((k) => (
              <option key={k} value={k}>{ACCOUNT_FILTER_LABEL[k]}</option>
            ))}
          </select>

          <select
            value={filters.nextAction}
            onChange={(e) => patch({ nextAction: e.target.value as LeadFilters["nextAction"] })}
            className={fieldCls("md", "w-[150px]")}
          >
            <option value="">Шаг: все</option>
            {(Object.keys(NEXT_ACTION_FILTER_LABEL) as (keyof typeof NEXT_ACTION_FILTER_LABEL)[]).map((k) => (
              <option key={k} value={k}>{NEXT_ACTION_FILTER_LABEL[k]}</option>
            ))}
          </select>

          <MultiSelect
            label="Ответственный"
            className="w-[160px]"
            allLabel="Ответственный: все"
            selected={filters.managerId}
            onChange={(v) => patch({ managerId: v })}
            options={[
              { value: "none", label: "Без ответственного" },
              ...(meta.data?.managers ?? []).map((m) => ({ value: m.id, label: m.name })),
            ]}
          />

          <button
            onClick={() => setMoreFilters((v) => !v)}
            aria-expanded={moreFilters}
            className={buttonCls(moreFilters ? "primary" : "secondary", "md", "gap-1.5")}
          >
            <IconSliders size={12} /> Фильтры
          </button>

          {/* Columns are a table concept — the phone renders cards, where
              hiding a "column" would mean nothing. */}
          {!isMobile && <ColumnManager columns={columns} />}

          {hasAnyFilter && (
            <button onClick={resetAll} className={buttonCls("ghost", "md")}>Сбросить</button>
          )}
        </div>

        {moreFilters && (
          <div className="anim-rise mt-2 flex flex-wrap items-end gap-2 border-t border-line-soft pt-2">
            <div className="min-w-[150px]">
              <span className="mb-1 block text-2xs font-medium text-txt-2">Верификация</span>
              <MultiSelect
                label="Верификация"
                selected={filters.verificationStatus}
                onChange={(v) => patch({ verificationStatus: v as LeadFilters["verificationStatus"] })}
                options={(meta.data?.verificationStatuses ?? []).map((s) => ({ value: s, label: VERIFICATION_LABEL[s] ?? s }))}
              />
            </div>

            <div className="min-w-[150px]">
              <span className="mb-1 block text-2xs font-medium text-txt-2">KYC</span>
              <MultiSelect
                label="KYC"
                selected={filters.kycStatus}
                onChange={(v) => patch({ kycStatus: v as LeadFilters["kycStatus"] })}
                options={(["NONE", "PENDING", "APPROVED", "REJECTED"] as KycStatus[]).map((s) => ({ value: s, label: KYC_LABEL[s] }))}
              />
            </div>

            <div className="min-w-[150px]">
              <span className="mb-1 block text-2xs font-medium text-txt-2">Источник</span>
              <MultiSelect
                label="Источник"
                selected={filters.source}
                onChange={(v) => patch({ source: v })}
                options={(meta.data?.sources ?? []).map((s) => ({ value: s, label: s }))}
              />
            </div>

            <label className="min-w-[130px]">
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

            <label className="min-w-[130px]">
              <span className="mb-1 block text-2xs font-medium text-txt-2">Создан с</span>
              <input type="date" value={filters.createdFrom} onChange={(e) => patch({ createdFrom: e.target.value })} className={inputCls} />
            </label>

            <label className="min-w-[130px]">
              <span className="mb-1 block text-2xs font-medium text-txt-2">по</span>
              <input type="date" value={filters.createdTo} onChange={(e) => patch({ createdTo: e.target.value })} className={inputCls} />
            </label>

          </div>
        )}
      </div>

      {selected.length > 0
        ? <BulkBar ids={selected} onClear={() => setSelected([])} />
        : <FilterChips filters={filters} meta={meta.data} onChange={patch} />}

      {isMobile ? (
        <MobileLeadList
          leads={leads}
          isLoading={isLoading}
          hasAnyFilter={hasAnyFilter}
          selected={selected}
          onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onOpen={setOpenId}
        />
      ) : (
        <div className="anim-rise-3 min-h-0 flex-1 overflow-x-auto rounded-lg border border-line bg-bg-1">
          {!isLoading && leads.length === 0 && (
            <EmptyRow label={hasAnyFilter ? "Под фильтры ничего не подошло" : "Лидов пока нет — добавьте первого кнопкой выше"} />
          )}

          {(isLoading || leads.length > 0) && (
            <table className="w-full text-2xs" style={{ minWidth: 34 + visible.reduce((s, c) => s + columns.widthOf(c), 0) }}>
              <colgroup>
                <col style={{ width: 34 }} />
                {visible.map((c) => <col key={c.id} style={{ width: columns.widthOf(c) }} />)}
              </colgroup>
              <thead className="border-b border-line-soft text-left text-txt-3">
                <tr>
                  <th className="sticky left-0 z-10 bg-bg-1 px-2 pt-2">
                    <Checkbox
                      checked={allOnPageSelected}
                      onChange={() =>
                        setSelected((s) =>
                          allOnPageSelected
                            ? s.filter((id) => !pageIds.includes(id))
                            : [...s, ...pageIds.filter((id) => !s.includes(id))]
                        )}
                    />
                  </th>
                  {visible.map((c, i) => (
                    <th
                      key={c.id}
                      className={classNames(
                        "relative px-3 pt-2",
                        // The first data column travels with the checkbox when
                        // the table scrolls sideways: a row of contact details
                        // with no name attached to it is unusable.
                        i === 0 && "sticky left-[34px] z-10 bg-bg-1"
                      )}
                    >
                      {c.sort
                        ? <SortHeader label={c.label} column={c.sort} filters={filters} onSort={sortBy} />
                        : <span className="font-medium">{c.label}</span>}
                      <ColumnResizer
                        onDrag={(dx) => columns.setWidth(c.id, columns.widthOf(c) + dx)}
                        onCommit={columns.commitWidths}
                      />
                    </th>
                  ))}
                </tr>
                {/* Per-column search — narrower and quieter than the row above,
                    so it reads as a refinement of the quick search, not a
                    second, competing search bar. */}
                {hasColumnFilters && (
                  <tr>
                    <th className="sticky left-0 z-10 bg-bg-1 pb-2" />
                    {visible.map((c, i) => (
                      <th key={c.id} className={classNames("px-3 pb-2", i === 0 && "sticky left-[34px] z-10 bg-bg-1")}>
                        {c.filter && colFilter(c.filter, c.filter, COLUMN_FILTER_PLACEHOLDER[c.filter], c.filter === "phone" || c.filter === "accountNumber")}
                      </th>
                    ))}
                  </tr>
                )}
              </thead>
              <tbody>
                {isLoading && <SkeletonTableRows columns={visible.length + 1} />}
                {!isLoading && leads.map((l) => {
                  const checked = selected.includes(l.id);
                  return (
                    <tr
                      key={l.id}
                      onClick={() => setOpenId(l.id)}
                      className={classNames(
                        "group cursor-pointer border-b border-line-soft/60",
                        checked ? "bg-accent-soft/40" : "hover:bg-bg-2/60"
                      )}
                    >
                      <td
                        onClick={(e) => e.stopPropagation()}
                        className={classNames("sticky left-0 z-10 px-2 py-2", checked ? "bg-bg-2" : "bg-bg-1 group-hover:bg-bg-2")}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => setSelected((s) => (checked ? s.filter((x) => x !== l.id) : [...s, l.id]))}
                        />
                      </td>
                      {visible.map((c, i) => (
                        <td
                          key={c.id}
                          className={classNames(
                            "truncate px-3 py-2",
                            i === 0 && classNames("sticky left-[34px] z-10", checked ? "bg-bg-2" : "bg-bg-1 group-hover:bg-bg-2")
                          )}
                        >
                          {c.cell(l)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

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

    </Page>
  );
}

const COLUMN_FILTER_PLACEHOLDER: Record<NonNullable<LeadColumn["filter"]>, string> = {
  accountNumber: "напр. 42081930",
  fullName: "Иванов",
  phone: "+7900…",
  email: "name@mail",
  country: "RU, KZ…",
};

/**
 * The same board on a phone.
 *
 * A fourteen-column table inside a horizontal scroller is unusable at 390px —
 * the manager ends up dragging sideways to read a phone number and loses the
 * name doing it. Each lead becomes a card carrying exactly what a call needs:
 * who, what stage, when to call back, and the two contact actions. Everything
 * else stays one tap away in the card itself.
 */
function MobileLeadList({
  leads, isLoading, hasAnyFilter, selected, onToggle, onOpen,
}: {
  leads: Lead[];
  isLoading: boolean;
  hasAnyFilter: boolean;
  selected: string[];
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (isLoading) {
    return (
      <div className="grid gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-24 rounded-lg" />
        ))}
      </div>
    );
  }
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-line bg-bg-1">
        <EmptyRow label={hasAnyFilter ? "Под фильтры ничего не подошло" : "Лидов пока нет — добавьте первого кнопкой выше"} />
      </div>
    );
  }

  return (
    <div className="anim-rise-3 grid gap-2">
      {leads.map((l) => {
        const checked = selected.includes(l.id);
        return (
          <div
            key={l.id}
            onClick={() => onOpen(l.id)}
            className={classNames(
              "rounded-lg border p-2.5",
              checked ? "border-accent bg-accent-soft/40" : "border-line bg-bg-1"
            )}
          >
            <div className="flex items-start gap-2">
              <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                <Checkbox checked={checked} onChange={() => onToggle(l.id)} />
              </span>
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-txt-0">{l.fullName}</span>
              <StatusChip tone={ACCOUNT_STATUS_TONE[l.accountStatus]}>
                {ACCOUNT_STATUS_LABEL[l.accountStatus]}
              </StatusChip>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-2xs">
              <StatusSelect leadId={l.id} status={l.status} />
              <NextActionCell leadId={l.id} at={l.nextActionAt} type={l.nextActionType} compact />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs">
              <ContactAction value={l.phone} kind="phone" />
              <ContactAction value={l.email} kind="email" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * What is actually filtering the list right now, one removable chip per value.
 *
 * With multi-select the controls above can no longer answer this: a button
 * reading "Выбрано: 3" says how many, not which, and a filter set across five
 * dropdowns has no single place showing the whole picture. Each chip removes
 * exactly its own value, so narrowing down doesn't mean reopening a menu to
 * hunt for the one box to untick.
 */
function FilterChips({
  filters, meta, onChange,
}: {
  filters: LeadFilters;
  meta: CrmMeta | undefined;
  onChange: (next: Partial<LeadFilters>) => void;
}) {
  const managerName = (id: string) =>
    id === "none" ? "без ответственного" : meta?.managers.find((m) => m.id === id)?.name ?? id;

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  const addList = <T extends string>(
    group: string,
    values: T[],
    labelOf: (v: T) => string,
    apply: (next: T[]) => Partial<LeadFilters>
  ) => {
    for (const v of values) {
      chips.push({
        key: `${group}:${v}`,
        label: `${group}: ${labelOf(v)}`,
        onRemove: () => onChange(apply(values.filter((x) => x !== v))),
      });
    }
  };

  addList("Этап", filters.status, (s) => LEAD_STATUS_LABEL[s] ?? s, (next) => ({ status: next }));
  addList("Верификация", filters.verificationStatus, (s) => VERIFICATION_LABEL[s] ?? s, (next) => ({ verificationStatus: next }));
  addList("KYC", filters.kycStatus, (s) => KYC_LABEL[s as KycStatus] ?? s, (next) => ({ kycStatus: next }));
  addList("Источник", filters.source, (s) => s, (next) => ({ source: next }));
  addList("Отв.", filters.managerId, managerName, (next) => ({ managerId: next }));

  const addOne = (group: string, value: string, label: string, clear: Partial<LeadFilters>) => {
    if (!value) return;
    chips.push({ key: group, label: `${group}: ${label}`, onRemove: () => onChange(clear) });
  };
  addOne("Поиск", filters.search, filters.search, { search: "" });
  addOne("ФИО", filters.fullName, filters.fullName, { fullName: "" });
  addOne("Телефон", filters.phone, filters.phone, { phone: "" });
  addOne("Email", filters.email, filters.email, { email: "" });
  addOne("Страна", filters.country, filters.country, { country: "" });
  addOne("Счёт", filters.accountNumber, filters.accountNumber, { accountNumber: "" });
  addOne("Аккаунт", filters.account, filters.account ? ACCOUNT_FILTER_LABEL[filters.account] : "", { account: "" });
  addOne("Шаг", filters.nextAction, filters.nextAction ? NEXT_ACTION_FILTER_LABEL[filters.nextAction] : "", { nextAction: "" });
  addOne("Клиент", filters.converted, filters.converted === "true" ? "уже клиент" : "ещё лид", { converted: "" });
  addOne("Создан с", filters.createdFrom, filters.createdFrom, { createdFrom: "" });
  addOne("Создан по", filters.createdTo, filters.createdTo, { createdTo: "" });

  if (chips.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span
          key={c.key}
          className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft py-0.5 pl-2 pr-1 text-2xs text-accent"
        >
          {c.label}
          <button
            onClick={c.onRemove}
            aria-label={`Убрать фильтр ${c.label}`}
            className="btn-fx rounded-full p-0.5 hover:bg-accent/20"
          >
            <IconClose size={10} />
          </button>
        </span>
      ))}
    </div>
  );
}
