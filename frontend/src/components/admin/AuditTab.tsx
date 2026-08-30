import { useState } from "react";
import { useAdminAudit } from "../../hooks/useAdmin";
import { LoadingRow, ErrorRow, EmptyRow } from "../common/States";
import { fmtDateTime } from "../../lib/format";

const PAGE_SIZE = 40;

export function AuditTab() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useAdminAudit({ action, targetUserId: "", page, pageSize: PAGE_SIZE }, true);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2">
        <input
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder="Фильтр по action (напр. ORDER_PLACED)…"
          className="w-72 rounded-lg border border-line bg-bg-2 px-2.5 py-1.5 text-xs outline-none focus:border-accent"
        />
        {data && <span className="ml-auto text-2xs text-txt-3">{data.total} записей</span>}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <LoadingRow label="Загрузка журнала…" />}
        {isError && <ErrorRow label="Не удалось загрузить журнал" onRetry={() => refetch()} />}
        {!isLoading && !isError && data && data.entries.length === 0 && <EmptyRow label="Записей нет" />}
        {!isLoading && !isError && data && data.entries.length > 0 && (
          <table className="w-full min-w-[820px] text-2xs">
            <thead className="sticky top-0 bg-bg-1">
              <tr className="border-b border-line text-left text-txt-3">
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Target</th>
                <th className="px-3 py-2 font-medium">Meta</th>
                <th className="px-3 py-2 font-medium">IP</th>
                <th className="px-3 py-2 font-medium">Time</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-line-soft/60 tabular hover:bg-bg-2/60">
                  <td className="px-3 py-2 font-medium text-txt-0">{e.action}</td>
                  <td className="px-3 py-2 text-txt-1">{e.actor ?? "—"}</td>
                  <td className="px-3 py-2 text-txt-1">{e.target ?? "—"}</td>
                  <td className="max-w-[280px] truncate px-3 py-2 text-txt-2" title={e.meta ? JSON.stringify(e.meta) : ""}>
                    {e.meta ? JSON.stringify(e.meta) : "—"}
                  </td>
                  <td className="px-3 py-2 text-txt-3">{e.ip ?? "—"}</td>
                  <td className="px-3 py-2 text-txt-2">{fmtDateTime(e.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-3 py-2 text-2xs">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-line px-2 py-1 text-txt-2 hover:text-txt-0 disabled:opacity-30">
            ← Prev
          </button>
          <span className="text-txt-2">{page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-line px-2 py-1 text-txt-2 hover:text-txt-0 disabled:opacity-30">
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
