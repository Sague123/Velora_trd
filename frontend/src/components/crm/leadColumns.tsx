import type { ReactNode } from "react";
import { StatusChip } from "./StatusChip";
import { StatusSelect } from "./StatusSelect";
import { NextActionCell } from "./NextActionCell";
import { ContactAction } from "./ContactActions";
import {
  ACCOUNT_STATUS_LABEL, ACCOUNT_STATUS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE,
} from "./leadLabels";
import { classNames, fmtDateTime } from "../../lib/format";
import type { Lead } from "../../lib/types";
import type { LeadSortColumn } from "../../hooks/useCrm";

export type LeadColumnId =
  | "accountNumber" | "fullName" | "status" | "account" | "nextAction" | "lastContact"
  | "phone" | "email" | "manager" | "country" | "source" | "verification" | "age" | "createdAt" | "tags";

/** Which per-column search box, if any, belongs under this header. */
export type ColumnFilterKey = "accountNumber" | "fullName" | "phone" | "email" | "country";

export interface LeadColumn {
  id: LeadColumnId;
  label: string;
  sort?: LeadSortColumn;
  filter?: ColumnFilterKey;
  /** Starting width in px. The user can drag any header edge from here. */
  width: number;
  cell: (lead: Lead) => ReactNode;
}

/** How long this lead has been sitting in the base. A lead nobody has touched
 * for three weeks is the single most useful thing this table can tell a head
 * of sales, and until now it was buried in a full timestamp the eye has to
 * decode. */
function ageLabel(createdAt: string): { text: string; stale: boolean } {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (days < 1) return { text: "сегодня", stale: false };
  if (days === 1) return { text: "1 день", stale: false };
  if (days < 7) return { text: `${days} дн`, stale: false };
  if (days < 31) return { text: `${Math.floor(days / 7)} нед`, stale: days >= 14 };
  return { text: `${Math.floor(days / 30)} мес`, stale: true };
}

export const LEAD_COLUMNS: LeadColumn[] = [
  {
    // Plain, not tinted by status: the stage chip now sits in the very next
    // column, so colouring the name the same hue said the same thing twice
    // and left a list of names in six different colours to scan through.
    id: "fullName", label: "ФИО", sort: "fullName", filter: "fullName", width: 200,
    cell: (l) => <span className="font-medium text-txt-0">{l.fullName}</span>,
  },
  {
    id: "status", label: "Этап", sort: "status", width: 190,
    cell: (l) => <StatusSelect leadId={l.id} status={l.status} />,
  },
  {
    id: "nextAction", label: "Следующий шаг", sort: "nextActionAt", width: 160,
    cell: (l) => <NextActionCell leadId={l.id} at={l.nextActionAt} type={l.nextActionType} />,
  },
  {
    id: "phone", label: "Телефон", sort: "phone", filter: "phone", width: 165,
    cell: (l) => <ContactAction value={l.phone} kind="phone" />,
  },
  {
    id: "email", label: "Email", sort: "email", filter: "email", width: 200,
    cell: (l) => <ContactAction value={l.email} kind="email" />,
  },
  {
    id: "account", label: "Аккаунт", sort: "accountStatus", width: 140,
    cell: (l) => (
      <StatusChip tone={ACCOUNT_STATUS_TONE[l.accountStatus]}>
        {ACCOUNT_STATUS_LABEL[l.accountStatus]}
      </StatusChip>
    ),
  },
  {
    id: "manager", label: "Ответственный", sort: "manager", width: 140,
    cell: (l) => <span className="text-txt-2">{l.assignedManager?.name ?? "—"}</span>,
  },
  {
    id: "age", label: "Возраст", sort: "createdAt", width: 90,
    cell: (l) => {
      const a = ageLabel(l.createdAt);
      return <span className={classNames("tabular", a.stale ? "text-warn" : "text-txt-2")}>{a.text}</span>;
    },
  },
  {
    id: "lastContact", label: "Последний контакт", sort: "lastContactAt", width: 150,
    cell: (l) => (
      <span className="tabular text-txt-3">{l.lastContactAt ? fmtDateTime(l.lastContactAt) : "не было"}</span>
    ),
  },
  {
    id: "accountNumber", label: "Счёт", sort: "accountNumber", filter: "accountNumber", width: 110,
    cell: (l) => <span className="mono text-txt-2">{l.accountNumber ?? "—"}</span>,
  },
  {
    id: "verification", label: "Верификация", sort: "verificationStatus", width: 130,
    cell: (l) => (
      <StatusChip tone={VERIFICATION_TONE[l.verificationStatus]}>
        {VERIFICATION_LABEL[l.verificationStatus]}
      </StatusChip>
    ),
  },
  {
    id: "country", label: "Страна", sort: "country", filter: "country", width: 90,
    cell: (l) => <span className="text-txt-2">{l.country ?? "—"}</span>,
  },
  {
    id: "source", label: "Источник", width: 130,
    cell: (l) => <span className="truncate text-txt-3">{l.source ?? "—"}</span>,
  },
  {
    // Not sortable: sorting by an array has no meaning a manager would
    // predict. The filter above the table is how tags are worked.
    id: "tags", label: "Теги", width: 150,
    cell: (l) =>
      l.tags.length === 0 ? <span className="text-txt-3">—</span> : (
        <span className="flex flex-wrap gap-1">
          {l.tags.map((t) => (
            <span key={t} className="rounded-full bg-bg-3 px-1.5 py-px text-3xs text-txt-2">{t}</span>
          ))}
        </span>
      ),
  },
  {
    id: "createdAt", label: "Создан", sort: "createdAt", width: 150,
    cell: (l) => <span className="tabular text-txt-3">{fmtDateTime(l.createdAt)}</span>,
  },
];

export const COLUMN_BY_ID = new Map(LEAD_COLUMNS.map((c) => [c.id, c]));

/**
 * What a salesperson sees before touching anything: who, at what stage, what
 * to do next, and how to reach them. The old default led with the account
 * number and the verification status — back-office fields that answer a
 * question nobody on the phone is asking — and pushed the callback date off
 * the visible width entirely.
 */
export const DEFAULT_COLUMNS: LeadColumnId[] = [
  "fullName", "status", "nextAction", "phone", "email", "account", "manager", "age",
];
