import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, tx, asNum } from "../db.js";
import { audit } from "../lib/ledger.js";
import { badRequest, notFound } from "../lib/errors.js";
import { sLead, sLeadDetail, sLeadComment, sLeadHistory } from "./serialize.js";

/**
 * CRM for the sales desk: the affiliate lead pipeline, one card per lead, and
 * the managers' comment thread on it.
 *
 * A lead is *not* a platform user, and this is the decision the whole module
 * turns on. It exists before anyone has registered, it comes from an affiliate
 * with contact details `users` has nowhere to put (there is no phone and no
 * country column there), and what the affiliate sent routinely differs from
 * what the person later types in themselves. So a lead keeps its own copy as
 * the source record; once they register, `platform_user_id` links the two and
 * the card reads the live account state — balance, KYC, last login — from
 * `users` instead of duplicating it.
 */

/** Funnel stages, in the order the desk works them. */
export const LEAD_STATUSES = [
  "NEW", "OLDDB", "CALLBACK", "WELCOME_CALL", "NO_ANSWER",
  "WRONG_INFO", "LOW_POTENTIAL", "NOT_INTERESTED", "DENY_REG", "UNDER_18",
] as const;

/** Kept apart from the funnel stage on purpose: a lead can be VERIFIED and
 * NOT_INTERESTED at the same time, and collapsing the two would lose that. */
export const VERIFICATION_STATUSES = ["NOT_SUBMITTED", "PENDING", "VERIFIED", "REJECTED"] as const;

const leadStatus = z.enum(LEAD_STATUSES);
const verificationStatus = z.enum(VERIFICATION_STATUSES);

const q = {
  // Filters are all optional and applied with the same "@x IS NULL OR …"
  // shape the admin routes already use, so one prepared statement serves
  // every combination instead of the SQL being assembled per request.
  list: db.prepare(`
    SELECT l.*,
           m.name  AS manager_name,
           m.email AS manager_email,
           u.email AS platform_email,
           u.kyc_status AS platform_kyc_status
    FROM leads l
    LEFT JOIN users m ON m.id = l.assigned_manager_id
    LEFT JOIN users u ON u.id = l.platform_user_id
    WHERE (@status::text IS NULL OR l.status = @status)
      AND (@managerId::text IS NULL OR l.assigned_manager_id = @managerId)
      AND (@search::text IS NULL
           OR LOWER(l.full_name) LIKE @like
           OR LOWER(COALESCE(l.email, '')) LIKE @like
           OR COALESCE(l.phone, '') LIKE @like)
    ORDER BY l.created_at DESC
    LIMIT @limit OFFSET @offset
  `),
  count: db.prepare(`
    SELECT COUNT(*) AS n FROM leads l
    WHERE (@status::text IS NULL OR l.status = @status)
      AND (@managerId::text IS NULL OR l.assigned_manager_id = @managerId)
      AND (@search::text IS NULL
           OR LOWER(l.full_name) LIKE @like
           OR LOWER(COALESCE(l.email, '')) LIKE @like
           OR COALESCE(l.phone, '') LIKE @like)
  `),
  // The card: the lead itself, plus whatever the platform knows if this lead
  // has since registered. account/last_login are read live, never copied.
  one: db.prepare(`
    SELECT l.*,
           m.name  AS manager_name,
           m.email AS manager_email,
           u.email        AS platform_email,
           u.name         AS platform_name,
           u.status       AS platform_status,
           u.kyc_status   AS platform_kyc_status,
           u.email_verified AS platform_email_verified,
           u.created_at   AS platform_registered_at,
           u.last_login_at AS platform_last_login_at,
           a.cash_scaled  AS platform_cash_scaled,
           (SELECT MAX(created_at) FROM audit_logs al WHERE al.actor_id = u.id) AS platform_last_action_at
    FROM leads l
    LEFT JOIN users m ON m.id = l.assigned_manager_id
    LEFT JOIN users u ON u.id = l.platform_user_id
    LEFT JOIN accounts a ON a.user_id = u.id
    WHERE l.id = ?
  `),
  bare: db.prepare("SELECT * FROM leads WHERE id = ?"),
  insert: db.prepare(`
    INSERT INTO leads (id, full_name, phone, email, country, source, status,
                       verification_status, assigned_manager_id, platform_user_id,
                       created_at, updated_at)
    VALUES (@id, @fullName, @phone, @email, @country, @source, @status,
            @verificationStatus, @managerId, @platformUserId, @ts, @ts)
  `),
  // Conditional on the current value, so two managers clicking different
  // statuses at the same moment cannot both write a history row claiming they
  // moved it from the same place.
  setStatus: db.prepare(`
    UPDATE leads SET status = @next, updated_at = @ts
    WHERE id = @id AND status = @current
    RETURNING id
  `),
  setVerification: db.prepare(`
    UPDATE leads SET verification_status = @next, updated_at = @ts
    WHERE id = @id AND verification_status = @current
    RETURNING id
  `),
  assign: db.prepare("UPDATE leads SET assigned_manager_id = ?, updated_at = ? WHERE id = ?"),
  insHistory: db.prepare(`
    INSERT INTO lead_status_history (id, lead_id, manager_id, kind, old_status, new_status, created_at)
    VALUES (@id, @leadId, @managerId, @kind, @old, @new, @ts)
  `),
  history: db.prepare(`
    SELECT h.*, u.name AS manager_name FROM lead_status_history h
    LEFT JOIN users u ON u.id = h.manager_id
    WHERE h.lead_id = ? ORDER BY h.created_at DESC LIMIT 100
  `),
  comments: db.prepare(`
    SELECT c.*, u.name AS manager_name, u.email AS manager_email
    FROM lead_comments c JOIN users u ON u.id = c.manager_id
    WHERE c.lead_id = ? ORDER BY c.created_at DESC LIMIT 200
  `),
  insComment: db.prepare(`
    INSERT INTO lead_comments (id, lead_id, manager_id, text, created_at)
    VALUES (@id, @leadId, @managerId, @text, @ts)
  `),
  comment: db.prepare(`
    SELECT c.*, u.name AS manager_name, u.email AS manager_email
    FROM lead_comments c JOIN users u ON u.id = c.manager_id WHERE c.id = ?
  `),
  managers: db.prepare(`
    SELECT id, name, email, role FROM users
    WHERE role IN ('MANAGER', 'ADMIN') AND status = 'ACTIVE'
    ORDER BY name
  `),
  // An affiliate re-sending the same person must not create a second card for
  // them; the desk would then work one and comment on the other.
  byContact: db.prepare(`
    SELECT id FROM leads
    WHERE (@phone::text IS NOT NULL AND phone = @phone)
       OR (@email::text IS NOT NULL AND LOWER(email) = @email)
    LIMIT 1
  `),
  userByEmail: db.prepare("SELECT id FROM users WHERE email = ?"),
};

/** Records a transition. Called inside the same transaction as the update, so
 * a status can never move without the history row that explains it. */
async function logTransition(entry: {
  leadId: string; managerId: string; kind: "STATUS" | "VERIFICATION";
  old: string | null; next: string;
}): Promise<void> {
  await q.insHistory.run({
    id: newId(), leadId: entry.leadId, managerId: entry.managerId,
    kind: entry.kind, old: entry.old, new: entry.next, ts: now(),
  });
}

export default async function crmRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireManager);

  /** The enums, so the UI builds its selects from the server's list rather
   * than a copy that quietly drifts when a funnel stage is added. */
  app.get("/meta", async () => ({
    statuses: LEAD_STATUSES,
    verificationStatuses: VERIFICATION_STATUSES,
    managers: ((await q.managers.all()) as any[]).map((m) => ({
      id: m.id, name: m.name, email: m.email, role: m.role,
    })),
  }));

  app.get("/leads", async (req) => {
    const p = z.object({
      status: leadStatus.optional(),
      managerId: z.string().optional(),
      search: z.string().max(120).optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    const term = p.search?.trim().toLowerCase();
    const args = {
      status: p.status ?? null,
      managerId: p.managerId ?? null,
      search: term || null,
      like: term ? `%${term}%` : null,
      limit: p.pageSize,
      offset: (p.page - 1) * p.pageSize,
    };

    return {
      total: asNum(((await q.count.get(args)) as any).n),
      page: p.page,
      pageSize: p.pageSize,
      leads: ((await q.list.all(args)) as any[]).map(sLead),
    };
  });

  app.get("/leads/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const lead = (await q.one.get(id)) as any;
    if (!lead) throw notFound("Лид не найден");
    return {
      lead: sLeadDetail(lead),
      history: ((await q.history.all(id)) as any[]).map(sLeadHistory),
    };
  });

  app.patch("/leads/:id/status", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { status } = z.object({ status: leadStatus }).parse(req.body);

    const lead = (await q.bare.get(id)) as any;
    if (!lead) throw notFound("Лид не найден");
    if (lead.status === status) return { lead: sLeadDetail((await q.one.get(id)) as any), changed: false };

    await tx(async () => {
      const updated = await q.setStatus.get({ id, next: status, current: lead.status, ts: now() });
      // Lost the race with another manager: their write stands, and this one
      // must not leave a history row for a transition that did not happen.
      if (!updated) throw badRequest("STATUS_CHANGED", "Статус уже изменён другим менеджером — обновите карточку");
      await logTransition({ leadId: id, managerId: req.user.sub, kind: "STATUS", old: lead.status, next: status });
      await audit({ actorId: req.user.sub, action: "CRM_LEAD_STATUS_CHANGED",
        meta: { leadId: id, from: lead.status, to: status }, ip: req.ip });
    });

    return { lead: sLeadDetail((await q.one.get(id)) as any), changed: true };
  });

  app.patch("/leads/:id/verification", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { verificationStatus: next } = z.object({ verificationStatus }).parse(req.body);

    const lead = (await q.bare.get(id)) as any;
    if (!lead) throw notFound("Лид не найден");
    if (lead.verification_status === next) {
      return { lead: sLeadDetail((await q.one.get(id)) as any), changed: false };
    }

    await tx(async () => {
      const updated = await q.setVerification.get({
        id, next, current: lead.verification_status, ts: now(),
      });
      if (!updated) throw badRequest("STATUS_CHANGED", "Статус уже изменён другим менеджером — обновите карточку");
      await logTransition({
        leadId: id, managerId: req.user.sub, kind: "VERIFICATION",
        old: lead.verification_status, next,
      });
      await audit({ actorId: req.user.sub, action: "CRM_LEAD_VERIFICATION_CHANGED",
        meta: { leadId: id, from: lead.verification_status, to: next }, ip: req.ip });
    });

    return { lead: sLeadDetail((await q.one.get(id)) as any), changed: true };
  });

  /**
   * Assignment. Not in the MVP's endpoint list, but the list view has an
   * "assigned manager" column and a filter by manager — without a way to set
   * the field, both are decorative and the column is always empty.
   */
  app.patch("/leads/:id/assign", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { managerId } = z.object({ managerId: z.string().nullable() }).parse(req.body);

    if (!(await q.bare.get(id))) throw notFound("Лид не найден");
    if (managerId) {
      const managers = (await q.managers.all()) as { id: string }[];
      if (!managers.some((m) => m.id === managerId)) {
        throw badRequest("NOT_A_MANAGER", "Назначить можно только активного менеджера");
      }
    }

    await q.assign.run(managerId, now(), id);
    await audit({ actorId: req.user.sub, targetUserId: managerId ?? undefined,
      action: "CRM_LEAD_ASSIGNED", meta: { leadId: id, managerId }, ip: req.ip });
    return { lead: sLeadDetail((await q.one.get(id)) as any) };
  });

  app.get("/leads/:id/comments", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    if (!(await q.bare.get(id))) throw notFound("Лид не найден");
    return { comments: ((await q.comments.all(id)) as any[]).map(sLeadComment) };
  });

  app.post("/leads/:id/comments", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
    if (!(await q.bare.get(id))) throw notFound("Лид не найден");

    const commentId = newId();
    await q.insComment.run({ id: commentId, leadId: id, managerId: req.user.sub, text, ts: now() });
    return reply.code(201).send({ comment: sLeadComment((await q.comment.get(commentId)) as any) });
  });

  /**
   * Manual/test intake. Real affiliate webhooks are explicitly out of scope for
   * this milestone, but leads have to get in somehow, so this is the one door —
   * and it is the door a webhook handler will call into later, which is why the
   * duplicate check and the platform-user match live here rather than in a
   * caller.
   */
  app.post("/leads/import", async (req, reply) => {
    const body = z.object({
      fullName: z.string().trim().min(2).max(120),
      phone: z.string().trim().min(5).max(32).optional(),
      email: z.string().trim().email().max(254).optional(),
      country: z.string().trim().min(2).max(64).optional(),
      source: z.string().trim().max(120).optional(),
      status: leadStatus.default("NEW"),
      assignedManagerId: z.string().optional(),
    }).refine((b) => !!b.phone || !!b.email, {
      message: "Нужен телефон или email — иначе с лидом нельзя работать",
    }).parse(req.body);

    const email = body.email?.toLowerCase() ?? null;

    const duplicate = (await q.byContact.get({ phone: body.phone ?? null, email })) as { id: string } | undefined;
    if (duplicate) {
      throw badRequest("DUPLICATE_LEAD", "Лид с таким телефоном или email уже есть в базе");
    }

    // If this person already registered on the platform, link the card to their
    // account immediately: the desk should see the real balance and KYC state
    // rather than opening a lead that looks brand new.
    const existingUser = email ? ((await q.userByEmail.get(email)) as { id: string } | undefined) : undefined;

    const id = newId();
    const ts = now();
    await tx(async () => {
      await q.insert.run({
        id, fullName: body.fullName, phone: body.phone ?? null, email,
        country: body.country ?? null, source: body.source ?? null,
        status: body.status, verificationStatus: "NOT_SUBMITTED",
        managerId: body.assignedManagerId ?? null,
        platformUserId: existingUser?.id ?? null, ts,
      });
      // A lead's first status is a transition too — from nothing. Without this
      // row the timeline starts blank for every lead that was never touched.
      await logTransition({ leadId: id, managerId: req.user.sub, kind: "STATUS", old: null, next: body.status });
      await audit({ actorId: req.user.sub, action: "CRM_LEAD_IMPORTED",
        meta: { leadId: id, source: body.source ?? null, linked: !!existingUser }, ip: req.ip });
    });

    return reply.code(201).send({ lead: sLeadDetail((await q.one.get(id)) as any) });
  });
}
