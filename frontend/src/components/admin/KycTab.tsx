import { useState } from "react";
import { useAdminKycDetail, useAdminKycQueue, useReviewKyc } from "../../hooks/useAdmin";
import { classNames, fmtDateTime } from "../../lib/format";
import { EmptyRow, LoadingRow } from "../common/States";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import type { KycStatus } from "../../lib/types";
import { IconClose } from "../icons/Icon";

const FILTERS: (KycStatus | "ALL")[] = ["PENDING", "APPROVED", "REJECTED", "ALL"];

const STATUS_CLS: Record<KycStatus, string> = {
  NONE: "bg-bg-3 text-txt-2",
  PENDING: "bg-warn/10 text-warn",
  APPROVED: "bg-buy-soft text-buy",
  REJECTED: "bg-sell-soft text-sell",
};

const DOC_LABEL: Record<string, string> = {
  PASSPORT: "Паспорт",
  ID_CARD: "ID-карта",
  DRIVER_LICENSE: "Водительское",
};

/**
 * The review drawer. Documents are fetched only when a submission is opened —
 * the list carries no links at all — and the links it does get expire within
 * minutes, which is why they're never cached between opens.
 */
function ReviewDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useAdminKycDetail(id);
  const review = useReviewKyc();
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const s = detail.data?.submission;
  const docs = detail.data?.documents;

  async function decide(decision: "APPROVE" | "REJECT") {
    if (decision === "REJECT" && reason.trim().length < 3) {
      return toast.warning("Укажите причину", "Она будет показана пользователю");
    }
    try {
      await review.mutateAsync({ id, decision, reason: decision === "REJECT" ? reason.trim() : undefined });
      toast.success(decision === "APPROVE" ? "Заявка одобрена" : "Заявка отклонена", s?.email);
      onClose();
    } catch (e) {
      toast.error("Не удалось сохранить решение", e instanceof ApiError ? e.message : undefined);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="anim-rise flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-line bg-bg-1 shadow-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line bg-bg-2/40 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-txt-0">{s?.fullName ?? "…"}</div>
            <div className="truncate text-2xs text-txt-2">{s?.email}</div>
          </div>
          <button onClick={onClose} className="btn-fx flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs text-txt-2 hover:text-txt-0">
            <IconClose size={12} /> Close
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {detail.isLoading && <LoadingRow />}

          {s && (
            <>
              <div className="mb-3 grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
                <div><span className="text-txt-2">Документ</span><div className="text-txt-0">{DOC_LABEL[s.documentType] ?? s.documentType}</div></div>
                <div><span className="text-txt-2">Номер</span><div className="mono text-txt-0">{s.documentNumber}</div></div>
                <div><span className="text-txt-2">Подана</span><div className="tabular text-txt-0">{fmtDateTime(s.createdAt)}</div></div>
                <div><span className="text-txt-2">Статус</span><div><span className={classNames("rounded px-1.5 py-0.5 font-medium", STATUS_CLS[s.status])}>{s.status}</span></div></div>
                <div className="col-span-2 sm:col-span-4"><span className="text-txt-2">Адрес</span><div className="text-txt-0">{s.address}</div></div>
              </div>

              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([["Лицевая сторона", docs?.front], ["Обратная сторона", docs?.back], ["Селфи", docs?.selfie]] as const).map(([label, url]) => (
                  <div key={label} className="rounded-lg border border-line bg-bg-2 p-1.5">
                    <div className="mb-1 text-2xs text-txt-2">{label}</div>
                    {url ? (
                      // Opens the signed link in a new tab for a closer look;
                      // it stops working on its own within minutes.
                      <a href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt={label} className="max-h-44 w-full rounded object-contain" />
                      </a>
                    ) : (
                      <div className="flex h-24 items-center justify-center rounded bg-bg-3 text-2xs text-txt-3">—</div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mb-3 text-2xs text-txt-3">
                Ссылки на документы подписаны и действуют {docs?.expiresInSec ?? 0} секунд. Каждый просмотр
                записывается в аудит.
              </p>

              {s.status === "PENDING" ? (
                <div className="rounded-lg border border-line-soft bg-bg-2/40 p-3">
                  {rejecting && (
                    <label className="mb-2 block">
                      <span className="mb-1 block text-2xs text-txt-2">Причина отклонения (увидит пользователь)</span>
                      <textarea
                        rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                        className="w-full resize-none rounded-lg border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
                        placeholder="Например: номер документа не читается на фото"
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => decide("APPROVE")}
                      disabled={review.isPending || rejecting}
                      className="btn-fx rounded-lg border border-buy/40 bg-buy-soft px-3 py-1.5 text-2xs font-semibold text-buy hover:bg-buy/20 disabled:opacity-40"
                    >
                      Одобрить
                    </button>
                    {rejecting ? (
                      <>
                        <button
                          onClick={() => decide("REJECT")}
                          disabled={review.isPending}
                          className="btn-fx rounded-lg border border-sell/40 bg-sell-soft px-3 py-1.5 text-2xs font-semibold text-sell hover:bg-sell/20 disabled:opacity-40"
                        >
                          Подтвердить отклонение
                        </button>
                        <button onClick={() => { setRejecting(false); setReason(""); }} className="btn-fx rounded-lg border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0">
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={review.isPending}
                        className="btn-fx rounded-lg border border-line px-3 py-1.5 text-2xs text-txt-2 hover:border-sell hover:text-sell disabled:opacity-40"
                      >
                        Отклонить
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-line-soft bg-bg-2/40 px-3 py-2 text-2xs text-txt-2">
                  Решение уже принято {s.reviewedAt ? fmtDateTime(s.reviewedAt) : ""}
                  {s.rejectionReason ? ` — ${s.rejectionReason}` : ""}.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function KycTab() {
  const [status, setStatus] = useState<KycStatus | "ALL">("PENDING");
  const [openId, setOpenId] = useState<string | null>(null);
  const queue = useAdminKycQueue(status, true);

  return (
    <div className="flex h-full flex-col">
      {openId && <ReviewDrawer id={openId} onClose={() => setOpenId(null)} />}

      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-soft px-3 py-2">
        <div className="flex gap-0.5 rounded-lg border border-line p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatus(f)}
              className={classNames("btn-fx rounded px-2.5 py-1 text-2xs font-medium", status === f ? "bg-accent-soft text-accent" : "text-txt-2 hover:text-txt-0")}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-2xs text-txt-3">Всего: {queue.data?.total ?? 0}</span>
        {queue.data?.storageConfigured === false && (
          <span className="rounded-lg border border-warn/40 bg-warn/10 px-2 py-0.5 text-2xs text-warn">
            Хранилище документов не настроено — новые заявки подать нельзя
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {queue.isLoading && <LoadingRow />}
        {!queue.isLoading && (queue.data?.submissions.length ?? 0) === 0 && (
          <EmptyRow label={status === "PENDING" ? "Заявок на проверке нет" : "Заявок не найдено"} />
        )}

        {(queue.data?.submissions.length ?? 0) > 0 && (
          <table className="w-full min-w-[640px] text-2xs">
            <thead>
              <tr className="border-b border-line-soft text-left text-txt-3">
                <th className="px-3 py-1.5 font-medium">Подана</th>
                <th className="px-3 py-1.5 font-medium">Пользователь</th>
                <th className="px-3 py-1.5 font-medium">Имя в документе</th>
                <th className="px-3 py-1.5 font-medium">Документ</th>
                <th className="px-3 py-1.5 font-medium">Статус</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {queue.data!.submissions.map((row) => (
                <tr key={row.id} className="border-b border-line-soft/60 hover:bg-bg-2/60">
                  <td className="px-3 py-1.5 tabular text-txt-2">{fmtDateTime(row.createdAt)}</td>
                  <td className="px-3 py-1.5 text-txt-1">{row.email}</td>
                  <td className="px-3 py-1.5 text-txt-1">{row.fullName}</td>
                  <td className="px-3 py-1.5 text-txt-2">{DOC_LABEL[row.documentType] ?? row.documentType}</td>
                  <td className="px-3 py-1.5">
                    <span className={classNames("rounded px-1.5 py-0.5 font-medium", STATUS_CLS[row.status])}>{row.status}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <button onClick={() => setOpenId(row.id)} className="btn-fx rounded-lg border border-line px-2 py-1 text-2xs text-accent hover:bg-accent-soft">
                      Открыть
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
