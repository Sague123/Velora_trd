import { useState } from "react";
import { useAdminKycDetail, useReviewKyc } from "../../hooks/useAdmin";
import { classNames, fmtDateTime } from "../../lib/format";
import { SkeletonBar } from "../common/States";
import { toast } from "../../store/toast";
import { ApiError } from "../../lib/api";
import type { KycStatus, LeadPlatformInfo } from "../../lib/types";

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
 * The identity-verification tab of the lead card. Two very different views
 * live here, gated by isAdmin — never by a CRM permission, because deciding
 * who can see another person's passport photo was never one of the four
 * grantable CRM powers (lib/crmPermissions.ts) and stays the stricter,
 * ADMIN-only line the platform already drew (see plugins/authenticate.ts's
 * requireManager comment about other people's KYC documents).
 *
 * A manager without that role still sees the outcome — status, document type,
 * dates, rejection reason — because sLeadDetail already put a kycStatus figure
 * on the card for everyone; hiding the small amount of extra context around
 * that same figure would only make it harder to explain, not more private.
 * Only the images and the approve/reject controls need ADMIN.
 */
export function KycPanel({ platform, isAdmin }: { platform: LeadPlatformInfo | null; isAdmin: boolean }) {
  const [reason, setReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const detail = useAdminKycDetail(isAdmin ? platform?.kycSubmissionId ?? null : null);
  const review = useReviewKyc();

  if (!platform) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-bg-2/20 px-3 py-6 text-center text-2xs text-txt-3">
        Лид ещё не зарегистрирован на платформе — подавать документы не на что.
      </div>
    );
  }

  if (platform.kycStatus === "NONE" || !platform.kycSubmissionId) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-bg-2/20 px-3 py-6 text-center text-2xs text-txt-3">
        Клиент ещё не подавал документы на верификацию.
      </div>
    );
  }

  async function decide(decision: "APPROVE" | "REJECT") {
    if (decision === "REJECT" && reason.trim().length < 3) {
      toast.warning("Укажите причину", "Она будет показана пользователю");
      return;
    }
    try {
      await review.mutateAsync({
        id: platform!.kycSubmissionId!, decision, reason: decision === "REJECT" ? reason.trim() : undefined,
      });
      toast.success(decision === "APPROVE" ? "Заявка одобрена" : "Заявка отклонена");
      setRejecting(false);
      setReason("");
    } catch (e) {
      toast.error("Не удалось сохранить решение", e instanceof ApiError ? e.message : undefined);
    }
  }

  const s = isAdmin ? detail.data?.submission : undefined;
  const docs = isAdmin ? detail.data?.documents : undefined;

  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 text-2xs sm:grid-cols-4">
        <div>
          <span className="text-txt-2">Документ</span>
          <div className="text-txt-0">{DOC_LABEL[platform.kycDocumentType ?? ""] ?? platform.kycDocumentType ?? "—"}</div>
        </div>
        <div>
          <span className="text-txt-2">Подана</span>
          <div className="tabular text-txt-0">{platform.kycSubmittedAt ? fmtDateTime(platform.kycSubmittedAt) : "—"}</div>
        </div>
        <div>
          <span className="text-txt-2">Статус</span>
          <div><span className={classNames("rounded px-1.5 py-0.5 font-medium", STATUS_CLS[platform.kycStatus])}>{platform.kycStatus}</span></div>
        </div>
        <div>
          <span className="text-txt-2">Решение</span>
          <div className="tabular text-txt-0">{platform.kycReviewedAt ? fmtDateTime(platform.kycReviewedAt) : "—"}</div>
        </div>
        {platform.kycRejectionReason && (
          <div className="col-span-2 sm:col-span-4">
            <span className="text-txt-2">Причина отклонения</span>
            <div className="text-txt-0">{platform.kycRejectionReason}</div>
          </div>
        )}
      </div>

      {!isAdmin ? (
        <div className="rounded-lg border border-line-soft bg-bg-2/40 px-3 py-2.5 text-2xs text-txt-2">
          Сами документы (фото) доступны только администратору.
        </div>
      ) : (
        <>
          {detail.isLoading && (
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-line bg-bg-2 p-1.5">
                  <SkeletonBar width="40%" height={10} />
                  <div className="mt-1">
                    <SkeletonBar height={96} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {s && (
            <>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {([["Лицевая сторона", docs?.front], ["Обратная сторона", docs?.back], ["Селфи", docs?.selfie]] as const).map(([label, url]) => (
                  <div key={label} className="rounded-lg border border-line bg-bg-2 p-1.5">
                    <div className="mb-1 text-2xs text-txt-2">{label}</div>
                    {url ? (
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
                        rows={2}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        className="w-full resize-none rounded border border-line bg-bg-2 px-2.5 py-2 text-xs text-txt-0 outline-none focus:border-accent"
                        placeholder="Например: номер документа не читается на фото"
                      />
                    </label>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => decide("APPROVE")}
                      disabled={review.isPending || rejecting}
                      className="btn-fx rounded border border-buy/40 bg-buy-soft px-3 py-1.5 text-2xs font-semibold text-buy hover:bg-buy/20 disabled:opacity-40"
                    >
                      Одобрить
                    </button>
                    {rejecting ? (
                      <>
                        <button
                          onClick={() => decide("REJECT")}
                          disabled={review.isPending}
                          className="btn-fx rounded border border-sell/40 bg-sell-soft px-3 py-1.5 text-2xs font-semibold text-sell hover:bg-sell/20 disabled:opacity-40"
                        >
                          Подтвердить отклонение
                        </button>
                        <button
                          onClick={() => { setRejecting(false); setReason(""); }}
                          className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:text-txt-0"
                        >
                          Отмена
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setRejecting(true)}
                        disabled={review.isPending}
                        className="btn-fx rounded border border-line px-3 py-1.5 text-2xs text-txt-2 hover:border-sell hover:text-sell disabled:opacity-40"
                      >
                        Отклонить
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-line-soft bg-bg-2/40 px-3 py-2 text-2xs text-txt-2">
                  Решение уже принято{s.reviewedAt ? ` ${fmtDateTime(s.reviewedAt)}` : ""}
                  {s.rejectionReason ? ` — ${s.rejectionReason}` : ""}.
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
