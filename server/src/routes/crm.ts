import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, tx, asNum, newAccountNumber } from "../db.js";
import { config } from "../config.js";
import { postLedger, audit } from "../lib/ledger.js";
import { badRequest, notFound, conflict } from "../lib/errors.js";
import { toScaled, out } from "../lib/money.js";
import { hashPassword, revokeAllForUser } from "../lib/auth.js";
import { closePositionById, cancelOrder } from "../engine/execution.js";
import { requireCrmPermission, getCrmPermissions, CRM_PERMISSIONS } from "../lib/crmPermissions.js";
import { issueViewToken } from "../lib/crmViewTokens.js";
import { accountSnapshot } from "../lib/accountSummary.js";
import { generateTempPassword } from "../lib/tempPassword.js";
import { sLead, sLeadDetail, sLeadComment, sLeadHistory, sOrder, sTrade } from "./serialize.js";

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
           u.account_number AS platform_account_number,
           u.created_at   AS platform_registered_at,
           u.last_login_at AS platform_last_login_at,
           a.cash_scaled  AS platform_cash_scaled,
           (SELECT MAX(created_at) FROM audit_logs al WHERE al.actor_id = u.id) AS platform_last_action_at,
           k.id             AS kyc_submission_id,
           k.document_type  AS kyc_document_type,
           k.rejection_reason AS kyc_rejection_reason,
           k.reviewed_at    AS kyc_reviewed_at,
           k.created_at     AS kyc_submitted_at
    FROM leads l
    LEFT JOIN users m ON m.id = l.assigned_manager_id
    LEFT JOIN users u ON u.id = l.platform_user_id
    LEFT JOIN accounts a ON a.user_id = u.id
    -- Latest submission only: the card shows current standing, not history —
    -- see routes/kyc.ts's own "latest" query for the same rule.
    LEFT JOIN LATERAL (
      SELECT id, document_type, rejection_reason, reviewed_at, created_at
      FROM kyc_submissions WHERE user_id = u.id ORDER BY created_at DESC LIMIT 1
    ) k ON true
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
  // Distinct source tags already in use, for the filter dropdown — source is
  // freeform text entered per import, not a fixed enum, so this is the only
  // way to offer real options instead of guessing a list.
  sources: db.prepare(`
    SELECT DISTINCT source FROM leads WHERE source IS NOT NULL AND source <> '' ORDER BY source LIMIT 200
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

  update: db.prepare(`
    UPDATE leads SET full_name = @fullName, phone = @phone, email = @email,
                     country = @country, source = @source, updated_at = @ts
    WHERE id = @id
  `),
  // Same duplicate check as import, but excluding the row being edited —
  // otherwise saving a lead's own unchanged phone would flag itself.
  byContactExcluding: db.prepare(`
    SELECT id FROM leads
    WHERE id != @id
      AND ((@phone::text IS NOT NULL AND phone = @phone)
        OR (@email::text IS NOT NULL AND LOWER(email) = @email))
    LIMIT 1
  `),

  commentsPage: db.prepare(`
    SELECT c.*, u.name AS manager_name, u.email AS manager_email
    FROM lead_comments c JOIN users u ON u.id = c.manager_id
    WHERE c.lead_id = @leadId ORDER BY c.created_at DESC LIMIT @limit OFFSET @offset
  `),
  commentsCount: db.prepare("SELECT COUNT(*) AS n FROM lead_comments WHERE lead_id = ?"),

  setPlatformStatus: db.prepare("UPDATE users SET status = ?, updated_at = ? WHERE id = ?"),

  // Lead conversion: a normal registration in every respect except that the
  // desk, not the person, filled the form in. Mirrors routes/auth.ts's own
  // /register insert exactly (same columns, same starting deposit) so a
  // converted account is indistinguishable from a self-registered one, other
  // than the temp-password flag below.
  insUser: db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, status, account_number,
                       password_change_required, created_at, updated_at)
    VALUES (@id, @email, @hash, @name, 'USER', 'ACTIVE', @accountNumber, TRUE, @ts, @ts)
  `),
  insAccount: db.prepare("INSERT INTO accounts (user_id, cash_scaled, updated_at) VALUES (?, ?, ?)"),
  insLedgerDeposit: db.prepare(`
    INSERT INTO ledger_entries (id, user_id, type, amount_scaled, balance_after_scaled, note, created_at)
    VALUES (@id, @userId, 'DEPOSIT', @amt, @amt, 'Стартовый баланс (регистрация из CRM)', @ts)
  `),
  linkLead: db.prepare("UPDATE leads SET platform_user_id = ?, updated_at = ? WHERE id = ?"),
};

/** Pipeline order, not alphabetical — sorting the status column should walk
 * the funnel the way the desk works it, not the raw enum text. Interpolated
 * directly into the SQL text below (never from user input — LEAD_STATUSES and
 * VERIFICATION_STATUSES are the fixed module-level consts above), because a
 * CASE branch list can't be passed as a bind parameter. */
const STATUS_ORDER_SQL = `CASE l.status ${LEAD_STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(" ")} END`;
const VERIFICATION_ORDER_SQL = `CASE l.verification_status ${VERIFICATION_STATUSES.map((s, i) => `WHEN '${s}' THEN ${i}`).join(" ")} END`;

/** Column a sort request may target, and the SQL it actually sorts by.
 * Whitelisted rather than taking the column name from the request directly —
 * an identifier can't be a bind parameter, so this is what stands between a
 * sort request and building a query out of arbitrary client text. */
const SORT_COLUMNS: Record<string, string> = {
  accountNumber: "u.account_number",
  fullName: "l.full_name",
  phone: "l.phone",
  email: "l.email",
  status: STATUS_ORDER_SQL,
  verificationStatus: VERIFICATION_ORDER_SQL,
  country: "l.country",
  manager: "m.name",
  createdAt: "l.created_at",
};

interface LeadsQueryInput {
  status?: string; managerId?: string; kycStatus?: string; search?: string;
  fullName?: string; phone?: string; email?: string; country?: string; accountNumber?: string;
  verificationStatus?: string;
  /** "true" = already a platform client, "false" = still just a lead. */
  converted?: "true" | "false";
  source?: string;
  /** <input type="date"> values (YYYY-MM-DD) — widened to the whole day on
   * the "to" end, see the createdTo clause below. */
  createdFrom?: string; createdTo?: string;
  sortBy: string; sortDir: "asc" | "desc";
  page: number; pageSize: number;
}

/**
 * Builds the leads list/count SQL for one request. This runs per-request
 * rather than being a module-level prepared statement like everything else in
 * `q` — db.ts's `prepare()` is a cheap regex rewrite, not a server-side
 * PREPARE, so there is no cost to that — because the sort column and the
 * per-column filters both vary by request in ways bind parameters can't
 * express (you cannot bind an ORDER BY column name, or a WHERE clause that
 * may or may not be present). Every actual value is still a bound
 * parameter; only the whitelisted column/clause *shape* is interpolated.
 */
function buildLeadsQuery(p: LeadsQueryInput): { sql: { list: string; count: string }; args: Record<string, unknown> } {
  const clauses: string[] = [];
  const args: Record<string, unknown> = {};

  if (p.status) { clauses.push("l.status = @status"); args.status = p.status; }
  if (p.managerId) { clauses.push("l.assigned_manager_id = @managerId"); args.managerId = p.managerId; }
  if (p.kycStatus) { clauses.push("COALESCE(u.kyc_status, 'NONE') = @kycStatus"); args.kycStatus = p.kycStatus; }
  if (p.verificationStatus) { clauses.push("l.verification_status = @verificationStatus"); args.verificationStatus = p.verificationStatus; }
  if (p.converted) { clauses.push(p.converted === "true" ? "l.platform_user_id IS NOT NULL" : "l.platform_user_id IS NULL"); }
  if (p.source?.trim()) { clauses.push("LOWER(COALESCE(l.source, '')) LIKE @source"); args.source = `%${p.source.trim().toLowerCase()}%`; }
  if (p.createdFrom) { clauses.push("l.created_at >= @createdFrom"); args.createdFrom = `${p.createdFrom}T00:00:00.000Z`; }
  if (p.createdTo) { clauses.push("l.created_at <= @createdTo"); args.createdTo = `${p.createdTo}T23:59:59.999Z`; }

  const term = p.search?.trim().toLowerCase();
  if (term) {
    clauses.push(`(LOWER(l.full_name) LIKE @search
      OR LOWER(COALESCE(l.email, '')) LIKE @search
      OR COALESCE(l.phone, '') LIKE @search)`);
    args.search = `%${term}%`;
  }

  const contains = (col: string, key: keyof LeadsQueryInput, sqlCol: string) => {
    const v = (p[key] as string | undefined)?.trim();
    if (!v) return;
    clauses.push(`LOWER(COALESCE(${sqlCol}, '')) LIKE @${col}`);
    args[col] = `%${v.toLowerCase()}%`;
  };
  contains("colFullName", "fullName", "l.full_name");
  contains("colPhone", "phone", "l.phone");
  contains("colEmail", "email", "l.email");
  contains("colCountry", "country", "l.country");
  contains("colAccountNumber", "accountNumber", "u.account_number");

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const orderCol = SORT_COLUMNS[p.sortBy] ?? SORT_COLUMNS.createdAt;
  const dir = p.sortDir === "asc" ? "ASC" : "DESC";
  // A secondary key breaks ties deterministically — without it, two rows
  // sorted equal on a nullable column (country, phone…) can swap places
  // between page loads, which reads as the list randomly reordering itself.
  const orderBy = `ORDER BY ${orderCol} ${dir} NULLS LAST, l.created_at DESC`;

  args.limit = p.pageSize;
  args.offset = (p.page - 1) * p.pageSize;

  const fromJoin = `
    FROM leads l
    LEFT JOIN users m ON m.id = l.assigned_manager_id
    LEFT JOIN users u ON u.id = l.platform_user_id
  `;

  return {
    sql: {
      list: `SELECT l.*, m.name AS manager_name, m.email AS manager_email,
                    u.email AS platform_email, u.kyc_status AS platform_kyc_status,
                    u.account_number AS platform_account_number
             ${fromJoin} ${where} ${orderBy} LIMIT @limit OFFSET @offset`,
      count: `SELECT COUNT(*) AS n ${fromJoin} ${where}`,
    },
    args,
  };
}

/** Resolves a lead to the platform account every account/balance/trades
 * action below operates on — never the lead row itself, which has no money
 * and nothing to trade. */
async function requirePlatformUser(leadId: string): Promise<string> {
  const row = (await q.bare.get(leadId)) as any;
  if (!row) throw notFound("Лид не найден");
  if (!row.platform_user_id) {
    throw conflict("NOT_CONVERTED", "Лид ещё не зарегистрирован на платформе — сначала переведите его в пользователя");
  }
  return row.platform_user_id as string;
}

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
   * than a copy that quietly drifts when a funnel stage is added. Also the
   * caller's own permission set — every mutation is still re-checked
   * server-side on the actual request, but the UI needs this to know which
   * buttons to show in the first place. */
  app.get("/meta", async (req) => ({
    statuses: LEAD_STATUSES,
    verificationStatuses: VERIFICATION_STATUSES,
    allPermissions: CRM_PERMISSIONS,
    myPermissions: await getCrmPermissions(req.user.sub),
    managers: ((await q.managers.all()) as any[]).map((m) => ({
      id: m.id, name: m.name, email: m.email, role: m.role,
    })),
    sources: ((await q.sources.all()) as { source: string }[]).map((r) => r.source),
  }));

  app.get("/leads", async (req) => {
    const p = z.object({
      status: leadStatus.optional(),
      managerId: z.string().optional(),
      kycStatus: z.enum(["NONE", "PENDING", "APPROVED", "REJECTED"]).optional(),
      search: z.string().max(120).optional(),
      verificationStatus: verificationStatus.optional(),
      // "true"/"false" rather than z.coerce.boolean(): a query string "false"
      // would otherwise coerce to true (any non-empty string is truthy), and
      // the frontend just needs the tri-state select the string already gives.
      converted: z.enum(["true", "false"]).optional(),
      source: z.string().max(120).optional(),
      createdFrom: z.string().optional(),
      createdTo: z.string().optional(),
      // Per-column filters, additional to (and ANDed with) the general
      // `search` above — "find the Ивановs" vs "find this exact phone
      // number" are different questions and the desk asks both.
      fullName: z.string().max(120).optional(),
      phone: z.string().max(32).optional(),
      email: z.string().max(254).optional(),
      country: z.string().max(64).optional(),
      accountNumber: z.string().max(20).optional(),
      sortBy: z.enum([
        "accountNumber", "fullName", "phone", "email", "status",
        "verificationStatus", "country", "manager", "createdAt",
      ]).default("createdAt"),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    const { sql, args } = buildLeadsQuery(p);
    return {
      total: asNum(((await db.prepare(sql.count).get(args)) as any).n),
      page: p.page,
      pageSize: p.pageSize,
      leads: ((await db.prepare(sql.list).all(args)) as any[]).map(sLead),
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

  /**
   * Edits the card itself — the fields an affiliate got wrong, or that
   * change as the desk actually talks to the person (a corrected phone
   * number, a country filled in after a call). Every field is optional so a
   * manager can fix one thing without resending the rest; `null` clears an
   * optional field, `undefined` (the key simply absent) leaves it alone.
   */
  app.patch("/leads/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      fullName: z.string().trim().min(2).max(120).optional(),
      phone: z.string().trim().min(5).max(32).nullable().optional(),
      email: z.string().trim().email().max(254).nullable().optional(),
      country: z.string().trim().min(2).max(64).nullable().optional(),
      source: z.string().trim().max(120).nullable().optional(),
    }).parse(req.body);

    const lead = (await q.bare.get(id)) as any;
    if (!lead) throw notFound("Лид не найден");

    const next = {
      fullName: body.fullName ?? lead.full_name,
      phone: body.phone === undefined ? lead.phone : body.phone,
      email: body.email === undefined ? lead.email : (body.email ? body.email.toLowerCase() : null),
      country: body.country === undefined ? lead.country : body.country,
      source: body.source === undefined ? lead.source : body.source,
    };
    if (!next.phone && !next.email) {
      throw badRequest("CONTACT_REQUIRED", "Нужен телефон или email — иначе с лидом нельзя работать");
    }

    const contactChanged = next.phone !== lead.phone || next.email !== lead.email;
    if (contactChanged) {
      const duplicate = await q.byContactExcluding.get({ id, phone: next.phone, email: next.email });
      if (duplicate) throw badRequest("DUPLICATE_LEAD", "Лид с таким телефоном или email уже есть в базе");
    }

    await q.update.run({ id, ...next, ts: now() });
    await audit({ actorId: req.user.sub, action: "CRM_LEAD_EDITED",
      meta: { leadId: id, fields: Object.keys(body) }, ip: req.ip });

    return { lead: sLeadDetail((await q.one.get(id)) as any) };
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

  /**
   * Paginated on purpose: a lead worked for months accumulates a long thread,
   * and the card used to render the whole thing inline, growing the modal
   * without bound. Comments now live in their own scrollable page instead.
   */
  app.get("/leads/:id/comments", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const p = z.object({
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(50).default(10),
    }).parse(req.query);
    if (!(await q.bare.get(id))) throw notFound("Лид не найден");

    const args = { leadId: id, limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
    return {
      total: asNum(((await q.commentsCount.get(id)) as any).n),
      page: p.page,
      pageSize: p.pageSize,
      comments: ((await q.commentsPage.all(args)) as any[]).map(sLeadComment),
    };
  });

  app.post("/leads/:id/comments", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { text } = z.object({ text: z.string().trim().min(1).max(4000) }).parse(req.body);
    if (!(await q.bare.get(id))) throw notFound("Лид не найден");

    const commentId = newId();
    await q.insComment.run({ id: commentId, leadId: id, managerId: req.user.sub, text, ts: now() });
    return reply.code(201).send({ comment: sLeadComment((await q.comment.get(commentId)) as any) });
  });

  /* --------------------------- account, balance, trades -------------------- *
   * Everything below reaches past the CRM's own tables into a real account and
   * real money, so — unlike the pipeline fields above, which any manager can
   * work — each mutation here is gated on its own admin-granted permission
   * (lib/crmPermissions.ts). Reading the account is not gated: the card
   * already shows a balance figure to any manager (sLeadDetail), and refusing
   * to show the positions and orders behind that figure would just make the
   * number unexplainable, not safer.
   */

  app.get("/leads/:id/account", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const userId = await requirePlatformUser(id);
    return accountSnapshot(userId);
  });

  app.post("/leads/:id/account/balance", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireCrmPermission(req.user.sub, "MANAGE_BALANCE");
    const userId = await requirePlatformUser(id);

    const body = z.object({
      amount: z.string().regex(/^-?\d+(\.\d{1,8})?$/, "Ожидается десятичное число"),
      note: z.string().max(200).optional(),
    }).parse(req.body);
    const amount = toScaled(body.amount); // signed: "500" credits, "-500" debits
    if (amount === 0n) throw badRequest("ZERO_AMOUNT", "Сумма не может быть нулевой");

    const balanceAfter = await tx(async () => {
      const b = await postLedger({
        userId, type: "ADMIN_ADJUSTMENT", amountScaled: amount,
        note: body.note ?? "Корректировка баланса из CRM", actorUserId: req.user.sub,
      });
      await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_BALANCE_ADJUSTED",
        meta: { leadId: id, amount: body.amount, note: body.note }, ip: req.ip });
      return b;
    });

    return { balance: out(balanceAfter, 2) };
  });

  app.patch("/leads/:id/account/status", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireCrmPermission(req.user.sub, "MANAGE_ACCOUNT");
    const userId = await requirePlatformUser(id);
    const { status } = z.object({ status: z.enum(["ACTIVE", "SUSPENDED"]) }).parse(req.body);

    await q.setPlatformStatus.run(status, now(), userId);
    // Suspending must not leave a live session behind — the same reasoning as
    // the admin console's own suspend action.
    if (status === "SUSPENDED") await revokeAllForUser(userId);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_ACCOUNT_STATUS_CHANGED",
      meta: { leadId: id, status }, ip: req.ip });

    return { status };
  });

  app.post("/leads/:id/trades/positions/:positionId/close", async (req) => {
    const { id, positionId } = z.object({ id: z.string(), positionId: z.string() }).parse(req.params);
    await requireCrmPermission(req.user.sub, "MANAGE_TRADES");
    const userId = await requirePlatformUser(id);

    const trade = await closePositionById(userId, positionId, "ADMIN", req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_POSITION_CLOSED",
      meta: { leadId: id, positionId, pnl: out(trade.pnl_scaled, 2) }, ip: req.ip });

    return { trade: sTrade(trade) };
  });

  app.delete("/leads/:id/trades/orders/:orderId", async (req) => {
    const { id, orderId } = z.object({ id: z.string(), orderId: z.string() }).parse(req.params);
    await requireCrmPermission(req.user.sub, "MANAGE_TRADES");
    const userId = await requirePlatformUser(id);

    const order = await cancelOrder(userId, orderId, req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_ORDER_CANCELLED",
      meta: { leadId: id, orderId }, ip: req.ip });

    return { order: sOrder(order) };
  });

  /**
   * Mints a one-time, read-only support link (see lib/crmViewTokens.ts). The
   * token itself is the only thing handed back — the frontend builds the
   * actual URL from its own origin, so this never has to guess which host the
   * manager is browsing from.
   */
  app.post("/leads/:id/view-token", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await requireCrmPermission(req.user.sub, "IMPERSONATE");
    const userId = await requirePlatformUser(id);

    const token = await issueViewToken({ leadId: id, platformUserId: userId, issuedBy: req.user.sub });
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_LEAD_VIEW_TOKEN_ISSUED",
      meta: { leadId: id }, ip: req.ip });

    return { token, expiresInMinutes: 10 };
  });

  /**
   * Converts a lead into a real platform account: everything a self-service
   * /register does (same columns, same starting deposit), except the desk
   * filled the form in instead of the person. The account is created with a
   * random password shown to the caller exactly once and never stored or
   * logged in plaintext — only its bcrypt hash — and flagged so the very
   * first login demands the owner set their own before anything else works
   * (routes/auth.ts's login handler and /complete-password-change).
   *
   * Not gated behind a CRM permission: registering someone is not a power
   * beyond what they could grant themselves by signing up directly, and the
   * account starts exactly where a self-registration would.
   */
  app.post("/leads/:id/convert", async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const lead = (await q.bare.get(id)) as any;
    if (!lead) throw notFound("Лид не найден");
    if (lead.platform_user_id) throw conflict("ALREADY_CONVERTED", "Лид уже зарегистрирован на платформе");
    if (!lead.email) {
      throw badRequest("EMAIL_REQUIRED", "Нужен email — добавьте его в карточке перед переводом в пользователя");
    }
    if (await q.userByEmail.get(lead.email)) {
      throw conflict("EMAIL_TAKEN", "Пользователь с таким email уже зарегистрирован на платформе");
    }

    const tempPassword = generateTempPassword();
    const hash = await hashPassword(tempPassword);
    const userId = newId();
    const ts = now();
    const accountNumber = await newAccountNumber();
    const starting = toScaled(config.startingBalance);

    await tx(async () => {
      await q.insUser.run({ id: userId, email: lead.email, hash, name: lead.full_name, accountNumber, ts });
      await q.insAccount.run(userId, starting, ts);
      await q.insLedgerDeposit.run({ id: newId(), userId, amt: starting, ts });
      await q.linkLead.run(userId, ts, id);
      await audit({ actorId: req.user.sub, targetUserId: userId, action: "CRM_LEAD_CONVERTED",
        meta: { leadId: id }, ip: req.ip });
    });

    return reply.code(201).send({
      lead: sLeadDetail((await q.one.get(id)) as any),
      // Shown exactly once. Relay it to the client through whatever channel
      // the affiliate relationship uses (phone, the same messenger) — the
      // account demands its own password on first login regardless.
      temporaryPassword: tempPassword,
    });
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
