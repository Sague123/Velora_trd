import { useAdminAudit } from "../../hooks/useAdmin";
import { fmtDateTime } from "../../lib/format";
import { LoadingRow } from "../common/States";

/**
 * A customer's own slice of the platform-wide admin audit log — what an
 * admin did to this specific account (balance adjustments, suspensions,
 * password resets, KYC decisions) and when. ADMIN-only: the underlying
 * endpoint is /api/admin/audit, which requireAdmin gates outright, so a
 * manager reading a lead card never even requests this.
 */
export function AuditPanel({ userId }: { userId: string }) {
  const { data, isLoading } = useAdminAudit({ action: "", targetUserId: userId, page: 1, pageSize: 20 }, true);

  if (isLoading) return <LoadingRow />;
  if (!data || data.entries.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-bg-2/20 px-3 py-4 text-center text-2xs text-txt-3">
        Действий администратора по этому аккаунту пока нет.
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-lg border border-line-soft bg-bg-2/30 p-2">
      {data.entries.map((e) => (
        <div key={e.id} className="flex flex-wrap items-center gap-1.5 text-2xs text-txt-2">
          <span className="tabular text-txt-3">{fmtDateTime(e.createdAt)}</span>
          <span className="text-txt-0">{e.action}</span>
          {e.actor && <span className="text-txt-3">· {e.actor}</span>}
        </div>
      ))}
    </div>
  );
}
