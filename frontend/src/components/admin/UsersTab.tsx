import { useState } from "react";
import { useAdminUsers } from "../../hooks/useAdmin";
import { UserDetailDrawer } from "./UserDetailDrawer";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
import { classNames, fmtDateTime, fmtUsd } from "../../lib/format";
import type { UserStatus } from "../../lib/types";

const PAGE_SIZE = 20;

/**
 * Staff accounts only — MANAGER and ADMIN — never USER. Customers have their
 * own home now: every USER-role account is a CRM lead (see
 * server/src/lib/leadIntake.ts), so listing them here too would be exactly
 * the duplicate, drifting-apart view this merge was meant to remove. What
 * stays here is what the CRM has no reason to show: role changes, CRM
 * permission grants, and password resets for the desk's own team.
 */
export function UsersTab() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<UserStatus | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useAdminUsers({ search, status, role: "STAFF", page, pageSize: PAGE_SIZE }, true);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Поиск по email или имени…"
          className="w-64 rounded border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
        <div className="flex gap-0.5 rounded border border-line p-0.5">
          {(["ALL", "ACTIVE", "SUSPENDED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={classNames(
                "rounded px-2.5 py-1 text-2xs font-medium",
                status === s ? "bg-accent-soft text-accent" : "text-txt-2 hover:text-txt-0"
              )}
            >
              {s}
            </button>
          ))}
        </div>
        {data && <span className="ml-auto text-2xs text-txt-3">{data.total} сотрудников</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <LoadingRow label="Загрузка пользователей…" />}
        {isError && <ErrorRow label="Не удалось загрузить пользователей" onRetry={() => refetch()} />}
        {!isLoading && !isError && data && data.users.length === 0 && <EmptyRow label="Ничего не найдено" />}
        {!isLoading && !isError && data && data.users.length > 0 && (
          <table className="w-full min-w-[820px] text-xs">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="border-b border-line text-left text-txt-3">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 text-right font-medium">Positions</th>
                <th className="px-3 py-2 text-right font-medium">Trades</th>
                <th className="px-3 py-2 font-medium">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {data.users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u.id)}
                  className="cursor-pointer border-b border-line-soft/60 tabular hover:bg-bg-2/60"
                >
                  <td className="px-3 py-2 font-medium text-txt-0">{u.name}</td>
                  <td className="px-3 py-2 text-txt-1">{u.email}</td>
                  <td className="px-3 py-2">
                    <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", u.role === "ADMIN" ? "bg-warn/10 text-warn" : "bg-accent-soft text-accent")}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={classNames("rounded px-1.5 py-0.5 text-2xs font-medium", u.status === "ACTIVE" ? "bg-buy-soft text-buy" : "bg-sell-soft text-sell")}>
                      {u.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{fmtUsd(u.balance)}</td>
                  <td className="px-3 py-2 text-right">{u.openPositions}</td>
                  <td className="px-3 py-2 text-right">{u.trades}</td>
                  <td className="px-3 py-2 text-txt-2">{fmtDateTime(u.lastLoginAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2 text-2xs">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded border border-line px-2 py-1 text-txt-2 hover:text-txt-0 disabled:opacity-30"
          >
            ← Prev
          </button>
          <span className="text-txt-2">
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded border border-line px-2 py-1 text-txt-2 hover:text-txt-0 disabled:opacity-30"
          >
            Next →
          </button>
        </div>
      )}

      {selected && <UserDetailDrawer userId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
