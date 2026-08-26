import { useIssueViewToken } from "../../hooks/useCrm";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";

/**
 * Mints a one-time support link and opens it in a new tab. What opens is a
 * read-only snapshot (see pages/CrmViewPage.tsx) — never a session, never a
 * way to place an order or move money — and it stops working the instant
 * that tab finishes loading it, single-use like every other token in this
 * codebase.
 */
export function ViewTokenButton({ leadId }: { leadId: string }) {
  const issue = useIssueViewToken();

  async function open() {
    try {
      const res = await issue.mutateAsync(leadId);
      window.open(`${window.location.origin}/crm/view?token=${encodeURIComponent(res.token)}`, "_blank", "noopener");
    } catch (e) {
      toast.error("Не удалось создать ссылку просмотра", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <button
      onClick={open}
      disabled={issue.isPending}
      className="btn-fx rounded border border-accent/40 px-3 py-1.5 text-2xs font-medium text-accent hover:bg-accent-soft disabled:opacity-40"
    >
      {issue.isPending ? "Открытие…" : "Просмотреть аккаунт клиента"}
    </button>
  );
}
