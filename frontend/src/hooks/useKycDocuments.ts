import { useEffect, useState } from "react";
import { apiBlob } from "../lib/api";

export type KycSlot = "front" | "back" | "selfie";

/**
 * Object URLs for one submission's identity documents.
 *
 * The documents have no address of their own: the bytes come through an
 * authenticated request (an `<img src>` would send no Authorization header),
 * and the browser gets a `blob:` URL that dies with the page. Every URL is
 * revoked when the submission changes or the panel closes, so a review
 * session leaves nothing holding a passport photo.
 *
 * A slot that fails to load is simply absent — one lost file must not stop
 * the rest of the submission from being reviewed.
 */
export function useKycDocuments(submissionId: string | null, available: Record<KycSlot, boolean> | undefined) {
  const [urls, setUrls] = useState<Partial<Record<KycSlot, string>>>({});
  // Primitive, so the effect re-runs when the slots change but not on every
  // render that rebuilds an equivalent object.
  const slotsKey = available ? `${available.front}|${available.back}|${available.selfie}` : "";

  useEffect(() => {
    if (!submissionId || !available) return;
    let cancelled = false;
    const created: string[] = [];

    void (async () => {
      const slots = (["front", "back", "selfie"] as KycSlot[]).filter((s) => available[s]);
      for (const slot of slots) {
        try {
          const blob = await apiBlob(`/api/admin/kyc/${submissionId}/file/${slot}`);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          created.push(url);
          setUrls((prev) => ({ ...prev, [slot]: url }));
        } catch {
          /* one unreadable document must not hide the others */
        }
      }
    })();

    return () => {
      cancelled = true;
      setUrls({});
      for (const url of created) URL.revokeObjectURL(url);
    };
  }, [submissionId, slotsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return urls;
}
