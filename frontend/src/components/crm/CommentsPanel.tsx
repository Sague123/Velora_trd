import { FormEvent, useState } from "react";
import { useAddLeadComment, useLeadComments } from "../../hooks/useCrm";
import { fmtDateTime } from "../../lib/format";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import { SkeletonLines } from "../common/States";

/**
 * Comments, paged rather than an inline list that grows without bound the
 * longer a lead is worked. Docked permanently on the right side of the lead
 * card (see LeadCard.tsx) rather than opened as its own overlay on demand —
 * "what was said and when" is exactly the context a manager wants visible the
 * instant the card opens, not one click further away.
 */
export function CommentsPanel({ leadId, leadName }: { leadId: string; leadName: string }) {
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const { data, isLoading } = useLeadComments(leadId, page, pageSize);
  const addComment = useAddLeadComment();
  const [text, setText] = useState("");

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / pageSize));

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    try {
      await addComment.mutateAsync({ id: leadId, text: text.trim() });
      setText("");
      setPage(1); // a new comment sorts first — jump back to where it landed
    } catch (e) {
      toast.error("Не удалось добавить комментарий", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-line bg-bg-2/40 px-3 py-2.5">
        <div className="text-2xs font-semibold uppercase tracking-wide text-txt-2">Комментарии</div>
        <div className="truncate text-2xs text-txt-3">{leadName}</div>
      </div>

      <form onSubmit={submit} className="shrink-0 border-b border-line-soft bg-bg-2/20 p-2.5">
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Что сказал клиент, о чём договорились, когда перезвонить…"
          className="w-full resize-none rounded-lg border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none placeholder:text-txt-3 focus:border-accent"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="submit"
            disabled={!text.trim() || addComment.isPending}
            className="btn-fx rounded-lg bg-accent-fill px-3 py-1.5 text-2xs font-semibold text-white hover:brightness-110 disabled:opacity-40"
          >
            {addComment.isPending ? "Отправка…" : "Добавить"}
          </button>
        </div>
      </form>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="rounded-lg border border-line-soft bg-bg-2/30 px-3 py-2">
                <SkeletonLines lines={2} />
              </div>
            ))}
          </div>
        )}
        {!isLoading && (data?.comments.length ?? 0) === 0 && (
          <div className="rounded-lg border border-dashed border-line px-3 py-5 text-center text-2xs text-txt-3">
            Комментариев пока нет.
          </div>
        )}
        <div className="space-y-2">
          {(data?.comments ?? []).map((c) => (
            <div key={c.id} className="rounded-lg border border-line-soft bg-bg-2/30 px-3 py-2">
              <div className="mb-1 flex items-baseline gap-2">
                <span className="text-2xs font-medium text-txt-1">{c.manager.name}</span>
                <span className="tabular text-2xs text-txt-3">{fmtDateTime(c.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap text-xs text-txt-1">{c.text}</div>
            </div>
          ))}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex shrink-0 items-center justify-between border-t border-line-soft px-2.5 py-2 text-2xs text-txt-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-fx rounded-lg border border-line px-2.5 py-1 disabled:opacity-40"
          >
            Назад
          </button>
          <span className="tabular">
            {page} / {totalPages} · всего {data?.total}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-fx rounded-lg border border-line px-2.5 py-1 disabled:opacity-40"
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
