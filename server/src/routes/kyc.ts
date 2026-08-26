import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now } from "../db.js";
import { audit } from "../lib/ledger.js";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import { removeObjects, storageConfigured, uploadPrivateImage } from "../lib/storage.js";

/**
 * Identity verification, from the user's side. Two things only: submit a
 * document set, and see where the submission got to.
 *
 * A user never receives a link to their own uploaded document back. There is
 * no legitimate reason to need one — they have the original — and every extra
 * place a signed link can appear is another place it can leak.
 */

const image = z.string().startsWith("data:image/", "Ожидается изображение").max(6_000_000);

const submitBody = z.object({
  fullName: z.string().min(2).max(120),
  address: z.string().min(5).max(300),
  documentType: z.enum(["PASSPORT", "ID_CARD", "DRIVER_LICENSE"]),
  documentNumber: z.string().min(3).max(60),
  documentFront: image,
  // A passport has no second side; an ID card and a licence do. Required
  // conditionally below rather than always, so the form can't demand a photo
  // of something that doesn't exist.
  documentBack: image.optional(),
  selfie: image,
});

const q = {
  latest: db.prepare("SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 1"),
  history: db.prepare("SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10"),
  insert: db.prepare(`
    INSERT INTO kyc_submissions (id, user_id, full_name, address, document_type, document_number,
                                 document_front_url, document_back_url, selfie_url, status, created_at)
    VALUES (@id, @userId, @fullName, @address, @documentType, @documentNumber,
            @front, @back, @selfie, 'PENDING', @ts)
  `),
  setUserStatus: db.prepare("UPDATE users SET kyc_status = ?, updated_at = ? WHERE id = ?"),
  user: db.prepare("SELECT kyc_status, email_verified FROM users WHERE id = ?"),
};

/** What the user is shown about their own submission — the decision and the
 * reason for it, never the stored objects. */
const sSubmission = (row: any) => ({
  id: row.id,
  status: row.status,
  documentType: row.document_type,
  rejectionReason: row.rejection_reason ?? null,
  reviewedAt: row.reviewed_at ?? null,
  createdAt: row.created_at,
});

export default async function kycRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    const user = (await q.user.get(req.user.sub)) as { kyc_status: string; email_verified: boolean } | undefined;
    if (!user) throw unauthorized();
    const latest = (await q.latest.get(req.user.sub)) as any;
    return {
      status: user.kyc_status ?? "NONE",
      emailVerified: user.email_verified === true,
      // Surfaced so the form can say "document upload is unavailable" instead
      // of letting someone photograph their passport and then fail.
      uploadAvailable: storageConfigured(),
      current: latest ? sSubmission(latest) : null,
      history: ((await q.history.all(req.user.sub)) as any[]).map(sSubmission),
    };
  });

  app.post("/", {
    // Three images in one request. The global 256KB body limit is sized for
    // JSON, not photographs; submission is atomic on purpose (a half-uploaded
    // identity is not reviewable), so the limit is raised here and only here.
    bodyLimit: 16 * 1024 * 1024,
    config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
  }, async (req, reply) => {
    if (!storageConfigured()) {
      throw badRequest("STORAGE_NOT_CONFIGURED",
        "Загрузка документов временно недоступна — хранилище не настроено");
    }

    const body = submitBody.parse(req.body);
    if (body.documentType !== "PASSPORT" && !body.documentBack) {
      throw badRequest("BACK_REQUIRED", "Для этого документа нужна фотография обратной стороны");
    }

    const user = (await q.user.get(req.user.sub)) as { kyc_status: string } | undefined;
    if (!user) throw unauthorized();
    if (user.kyc_status === "APPROVED") {
      throw conflict("ALREADY_APPROVED", "Личность уже подтверждена");
    }
    if (user.kyc_status === "PENDING") {
      throw conflict("ALREADY_PENDING", "Заявка уже на проверке");
    }

    // Uploads happen before the row exists, so a failure partway through must
    // not leave someone's passport sitting in the bucket with nothing pointing
    // at it and no way to find it again.
    const uploaded: string[] = [];
    try {
      const front = await uploadPrivateImage(req.user.sub, "document-front", body.documentFront);
      uploaded.push(front);
      const back = body.documentBack
        ? await uploadPrivateImage(req.user.sub, "document-back", body.documentBack)
        : null;
      if (back) uploaded.push(back);
      const selfie = await uploadPrivateImage(req.user.sub, "selfie", body.selfie);
      uploaded.push(selfie);

      const id = newId();
      const ts = now();
      await q.insert.run({
        id, userId: req.user.sub,
        fullName: body.fullName.trim(), address: body.address.trim(),
        documentType: body.documentType, documentNumber: body.documentNumber.trim(),
        front, back, selfie, ts,
      });
      await q.setUserStatus.run("PENDING", ts, req.user.sub);
      // Document numbers and addresses are exactly what an audit log must not
      // accumulate — the submission row already holds them, under review.
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "KYC_SUBMITTED",
        meta: { id, documentType: body.documentType }, ip: req.ip });

      return reply.code(201).send({ submission: sSubmission((await q.latest.get(req.user.sub)) as any) });
    } catch (e) {
      await removeObjects(uploaded);
      throw e;
    }
  });
}

/** The one question the rest of the platform asks about identity. Kept here so
 * every money-moving route gates on the same definition. */
export async function requireApprovedKyc(userId: string): Promise<void> {
  const user = (await q.user.get(userId)) as { kyc_status: string } | undefined;
  if (!user) throw notFound("Пользователь не найден");
  if (user.kyc_status === "APPROVED") return;
  throw conflict("KYC_REQUIRED", user.kyc_status === "PENDING"
    ? "Заявка на подтверждение личности ещё на проверке"
    : "Для этой операции нужно подтвердить личность");
}
