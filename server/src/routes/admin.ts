import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, now, tx, asBig, asBigOrNull, asNum } from "../db.js";
import { config } from "../config.js";
import { out, toScaled, pctOf } from "../lib/money.js";
import { pnlFor, type Side } from "../engine/risk.js";
import { postLedger, audit } from "../lib/ledger.js";
import { closePositionById, cancelOrder, markPrice } from "../engine/execution.js";
import { revokeAllForUser, hashPassword } from "../lib/auth.js";
import { badRequest, notFound, forbidden, conflict } from "../lib/errors.js";
import { signedUrlFor, storageConfigured } from "../lib/storage.js";
import { CRM_PERMISSIONS, type CrmPermission } from "../lib/crmPermissions.js";
import { sOrder, sPosition, sTrade, sLedger } from "./serialize.js";

const money = z.string().regex(/^-?\d+(\.\d{1,8})?$/, "Ожидается десятичное число");

/**
 * Every route here is admin-gated and every mutation writes an audit row.
 * Admin actions on user money are deliberately noisy: they are the highest-risk
 * operations in the system and must always be attributable to a named actor.
 */
const q = {
  counts: {
    users: db.prepare("SELECT COUNT(*) AS n FROM users"),
    active: db.prepare("SELECT COUNT(*) AS n FROM users WHERE status = 'ACTIVE'"),
    positions: db.prepare("SELECT COUNT(*) AS n FROM positions WHERE status = 'OPEN'"),
    orders: db.prepare("SELECT COUNT(*) AS n FROM orders WHERE status = 'NEW'"),
  },
  sums: db.prepare("SELECT COALESCE(SUM(pnl_scaled),0) AS pnl, COALESCE(SUM(fee_scaled),0) AS fee, COUNT(*) AS n FROM trades"),
  totalCash: db.prepare("SELECT COALESCE(SUM(cash_scaled),0) AS n FROM accounts"),
  listUsers: db.prepare(`
    SELECT u.id, u.email, u.name, u.role, u.status, u.created_at, u.last_login_at,
           COALESCE(a.cash_scaled, 0) AS cash_scaled,
           (SELECT COUNT(*) FROM positions p WHERE p.user_id = u.id AND p.status='OPEN') AS open_positions,
           (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS trade_count
    FROM users u LEFT JOIN accounts a ON a.user_id = u.id
    WHERE (@status::text = 'ALL' OR u.status = @status)
      AND (@search::text IS NULL OR u.email LIKE @like OR u.name LIKE @like)
    ORDER BY u.created_at DESC LIMIT @limit OFFSET @offset
  `),
  countUsers: db.prepare(`
    SELECT COUNT(*) AS n FROM users u
    WHERE (@status::text = 'ALL' OR u.status = @status)
      AND (@search::text IS NULL OR u.email LIKE @like OR u.name LIKE @like)
  `),
  user: db.prepare("SELECT * FROM users WHERE id = ?"),
  account: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  positions: db.prepare("SELECT * FROM positions WHERE user_id = ? AND status = 'OPEN'"),
  orders: db.prepare("SELECT * FROM orders WHERE user_id = ? AND status = 'NEW' ORDER BY created_at DESC LIMIT 50"),
  trades: db.prepare("SELECT * FROM trades WHERE user_id = ? ORDER BY closed_at DESC LIMIT 50"),
  ledger: db.prepare("SELECT * FROM ledger_entries WHERE user_id = ? ORDER BY created_at DESC LIMIT 100"),
  updUser: db.prepare("UPDATE users SET name = ?, status = ?, role = ?, updated_at = ? WHERE id = ?"),
  setCrmPermissions: db.prepare("UPDATE users SET crm_permissions = ?, updated_at = ? WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?"),
  audit: db.prepare(`
    SELECT a.*, actor.email AS actor_email, target.email AS target_email
    FROM audit_logs a
    LEFT JOIN users actor ON actor.id = a.actor_id
    LEFT JOIN users target ON target.id = a.target_user_id
    WHERE (@action::text IS NULL OR a.action = @action)
      AND (@target::text IS NULL OR a.target_user_id = @target)
    ORDER BY a.created_at DESC LIMIT @limit OFFSET @offset
  `),
  auditCount: db.prepare(`
    SELECT COUNT(*) AS n FROM audit_logs a
    WHERE (@action::text IS NULL OR a.action = @action) AND (@target::text IS NULL OR a.target_user_id = @target)
  `),
  updInstrument: db.prepare("UPDATE instruments SET active = ?, max_leverage = ? WHERE symbol = ?"),
  instrument: db.prepare("SELECT * FROM instruments WHERE symbol = ?"),
  kycList: db.prepare(`
    SELECT k.*, u.email, u.name AS user_name
    FROM kyc_submissions k JOIN users u ON u.id = k.user_id
    WHERE (@status::text = 'ALL' OR k.status = @status)
    ORDER BY k.created_at ASC LIMIT @limit OFFSET @offset
  `),
  kycCount: db.prepare("SELECT COUNT(*) AS n FROM kyc_submissions k WHERE (@status::text = 'ALL' OR k.status = @status)"),
  kycOne: db.prepare(`
    SELECT k.*, u.email, u.name AS user_name
    FROM kyc_submissions k JOIN users u ON u.id = k.user_id WHERE k.id = ?
  `),
  kycReview: db.prepare(`
    UPDATE kyc_submissions SET status = @status, rejection_reason = @reason,
                               reviewed_by = @reviewer, reviewed_at = @ts
    WHERE id = @id AND status = 'PENDING'
    RETURNING user_id
  `),
  setKycStatus: db.prepare("UPDATE users SET kyc_status = ?, updated_at = ? WHERE id = ?"),
};

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.requireAdmin);

  app.get("/stats", async () => {
    const sums = (await q.sums.get()) as any;
    return {
      users: asNum((await q.counts.users.get() as any).n),
      activeUsers: asNum((await q.counts.active.get() as any).n),
      openPositions: asNum((await q.counts.positions.get() as any).n),
      openOrders: asNum((await q.counts.orders.get() as any).n),
      closedTrades: asNum(sums.n),
      totalCash: out(asBig((await q.totalCash.get() as any).n), 2),
      totalRealisedPnl: out(asBig(sums.pnl), 2),
      totalFees: out(asBig(sums.fee), 2),
    };
  });

  app.get("/users", async (req) => {
    const p = z.object({
      search: z.string().optional(),
      status: z.enum(["ACTIVE", "SUSPENDED", "ALL"]).default("ALL"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    const args = {
      status: p.status, search: p.search ?? null, like: p.search ? `%${p.search}%` : null,
      limit: p.pageSize, offset: (p.page - 1) * p.pageSize,
    };
    const total = asNum((await q.countUsers.get(args) as any).n);
    const rows = (await q.listUsers.all(args)) as any[];

    return {
      total, page: p.page, pageSize: p.pageSize,
      users: rows.map((u) => ({
        id: u.id, email: u.email, name: u.name, role: u.role, status: u.status,
        balance: out(asBig(u.cash_scaled), 2),
        openPositions: asNum(u.open_positions), trades: asNum(u.trade_count),
        createdAt: u.created_at, lastLoginAt: u.last_login_at,
      })),
    };
  });

  app.get("/users/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = (await q.user.get(id)) as any;
    if (!user) throw notFound("Пользователь не найден");

    const acc = (await q.account.get(id)) as any;
    const positions = (await q.positions.all(id)) as any[];
    const trades = (await q.trades.all(id)) as any[];
    const cash = acc ? asBig(acc.cash_scaled) : 0n;
    const usedMargin = positions.reduce((s, p) => s + asBig(p.margin_scaled), 0n);
    let unrealised = 0n;
    for (const p of positions) {
      const mark = (await markPrice(p.symbol)) ?? asBig(p.entry_scaled);
      unrealised += pnlFor(p.side as Side, asBig(p.qty_scaled), asBig(p.entry_scaled), mark);
    }
    const realised = trades.reduce((s, t) => s + asBig(t.pnl_scaled), 0n);

    const positionsOut = await Promise.all(
      positions.map(async (p) => sPosition(p, (await markPrice(p.symbol)) ?? asBig(p.entry_scaled)))
    );

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role,
        status: user.status, kycStatus: user.kyc_status ?? "NONE",
        emailVerified: user.email_verified === true,
        crmPermissions: (user.crm_permissions ?? []) as string[],
        createdAt: user.created_at, lastLoginAt: user.last_login_at },
      account: {
        cash: out(cash, 2), usedMargin: out(usedMargin, 2),
        unrealisedPnl: out(unrealised, 2), realisedPnl: out(realised, 2),
        equity: out(cash + usedMargin + unrealised, 2),
        marginUsagePct: pctOf(usedMargin, cash + usedMargin + unrealised),
      },
      positions: positionsOut,
      orders: ((await q.orders.all(id)) as any[]).map(sOrder),
      trades: trades.map(sTrade),
      ledger: ((await q.ledger.all(id)) as any[]).map(sLedger),
    };
  });

  app.patch("/users/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      name: z.string().min(1).max(80).optional(),
      status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
      role: z.enum(["USER", "MANAGER", "ADMIN"]).optional(),
      // Identity verified through some channel other than an upload — in
      // person, or against a document already on file. Heavily audited,
      // because it is a way to grant money-moving access without evidence
      // attached to it.
      kycStatus: z.enum(["NONE", "PENDING", "APPROVED", "REJECTED"]).optional(),
    }).parse(req.body);

    const user = (await q.user.get(id)) as any;
    if (!user) throw notFound("Пользователь не найден");
    const demotingSelf = body.role !== undefined && body.role !== "ADMIN";
    if (id === req.user.sub && (demotingSelf || body.status === "SUSPENDED")) {
      // Stops an admin locking the whole team out by demoting themselves. Any
      // role other than ADMIN counts as a demotion now that MANAGER exists.
      throw forbidden("Нельзя понизить или заблокировать собственный аккаунт");
    }

    const next = { name: body.name ?? user.name, status: body.status ?? user.status, role: body.role ?? user.role };
    await q.updUser.run(next.name, next.status, next.role, now(), id);
    if (body.kycStatus) {
      await q.setKycStatus.run(body.kycStatus, now(), id);
      await audit({ actorId: req.user.sub, targetUserId: id, action: "KYC_STATUS_OVERRIDDEN",
        meta: { from: user.kyc_status ?? "NONE", to: body.kycStatus }, ip: req.ip });
    }
    if (next.status === "SUSPENDED") await revokeAllForUser(id);
    await audit({ actorId: req.user.sub, targetUserId: id, action: "USER_UPDATED", meta: body, ip: req.ip });
    return { user: { id, ...next, email: user.email } };
  });

  /**
   * Grants or revokes the sensitive CRM powers — never a side effect of
   * setting someone's role to MANAGER, always its own explicit, audited act.
   * Meaningless (and refused) for anyone who isn't a MANAGER: a USER has no
   * CRM to act in, and ADMIN already holds every one of these unconditionally.
   */
  app.patch("/users/:id/crm-permissions", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ permissions: z.array(z.enum(CRM_PERMISSIONS as [CrmPermission, ...CrmPermission[]])) })
      .parse(req.body);

    const user = (await q.user.get(id)) as any;
    if (!user) throw notFound("Пользователь не найден");
    if (user.role !== "MANAGER") {
      throw badRequest("NOT_A_MANAGER", "Права CRM можно выдать только пользователю с ролью MANAGER");
    }

    // De-duplicated and stored in the fixed canonical order, so the audit
    // trail and the admin UI don't disagree about what "the same set" looks
    // like just because of the order they arrived in the request body.
    const unique = CRM_PERMISSIONS.filter((p) => body.permissions.includes(p));
    await q.setCrmPermissions.run(JSON.stringify(unique), now(), id);
    await audit({ actorId: req.user.sub, targetUserId: id, action: "CRM_PERMISSIONS_CHANGED",
      meta: { from: user.crm_permissions ?? [], to: unique }, ip: req.ip });

    return { crmPermissions: unique };
  });

  app.post("/users/:id/reset-password", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ newPassword: z.string().min(10).max(200) }).parse(req.body);
    if (!(await q.user.get(id))) throw notFound("Пользователь не найден");
    await q.setPassword.run(await hashPassword(body.newPassword), now(), id);
    await revokeAllForUser(id);
    await audit({ actorId: req.user.sub, targetUserId: id, action: "ADMIN_PASSWORD_RESET", ip: req.ip });
    return { ok: true };
  });

  app.post("/users/:id/balance", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ amount: money, note: z.string().max(200).optional() }).parse(req.body);

    const amount = toScaled(body.amount); // signed: "500" credits, "-500" debits
    if (amount === 0n) throw badRequest("ZERO_AMOUNT", "Сумма не может быть нулевой");
    if (!(await q.user.get(id))) throw notFound("Пользователь не найден");

    const balanceAfter = await tx(async () => {
      const b = await postLedger({
        userId: id, type: "ADMIN_ADJUSTMENT", amountScaled: amount,
        note: body.note ?? "Корректировка баланса администратором", actorUserId: req.user.sub,
      });
      await audit({ actorId: req.user.sub, targetUserId: id, action: "BALANCE_ADJUSTED",
        meta: { amount: body.amount, note: body.note }, ip: req.ip });
      return b;
    });

    return { balance: out(balanceAfter, 2) };
  });

  app.post("/users/:userId/positions/:positionId/close", async (req) => {
    const { userId, positionId } = z.object({ userId: z.string(), positionId: z.string() }).parse(req.params);
    const trade = await closePositionById(userId, positionId, "ADMIN", req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "ADMIN_CLOSED_POSITION",
      meta: { positionId, pnl: out(trade.pnl_scaled, 2) }, ip: req.ip });
    return { trade: sTrade(trade) };
  });

  app.delete("/users/:userId/orders/:orderId", async (req) => {
    const { userId, orderId } = z.object({ userId: z.string(), orderId: z.string() }).parse(req.params);
    const order = await cancelOrder(userId, orderId, req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: userId, action: "ADMIN_CANCELLED_ORDER", meta: { orderId }, ip: req.ip });
    return { order: sOrder(order) };
  });

  app.get("/audit", async (req) => {
    const p = z.object({
      action: z.string().optional(),
      targetUserId: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query);

    const args = { action: p.action ?? null, target: p.targetUserId ?? null,
      limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
    return {
      total: asNum((await q.auditCount.get(args) as any).n),
      entries: ((await q.audit.all(args)) as any[]).map((r) => ({
        id: r.id, action: r.action, actor: r.actor_email ?? null, target: r.target_email ?? null,
        meta: r.meta ? JSON.parse(r.meta) : null, ip: r.ip, createdAt: r.created_at,
      })),
    };
  });

  /* ---------------------------------- KYC --------------------------------- */
  /**
   * The review queue. Oldest first: a verification queue worked newest-first
   * leaves the people who have waited longest waiting indefinitely.
   *
   * The list carries no document links at all — signing three URLs per row for
   * a page nobody has opened yet would put dozens of live links to identity
   * documents into one response. They are minted one submission at a time,
   * below, when a reviewer actually opens it.
   */
  app.get("/kyc", async (req) => {
    const p = z.object({
      status: z.enum(["PENDING", "APPROVED", "REJECTED", "ALL"]).default("PENDING"),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(25),
    }).parse(req.query);

    const args = { status: p.status, limit: p.pageSize, offset: (p.page - 1) * p.pageSize };
    return {
      total: asNum(((await q.kycCount.get(args)) as any).n),
      page: p.page, pageSize: p.pageSize,
      storageConfigured: storageConfigured(),
      submissions: ((await q.kycList.all(args)) as any[]).map((k) => ({
        id: k.id, userId: k.user_id, email: k.email, userName: k.user_name,
        fullName: k.full_name, documentType: k.document_type,
        status: k.status, rejectionReason: k.rejection_reason ?? null,
        reviewedAt: k.reviewed_at ?? null, createdAt: k.created_at,
      })),
    };
  });

  /** One submission, with freshly signed links valid for a few minutes. */
  app.get("/kyc/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const k = (await q.kycOne.get(id)) as any;
    if (!k) throw notFound("Заявка не найдена");

    // Opening someone's identity documents is itself an event worth recording:
    // "who looked at this passport, and when" is a question that gets asked.
    await audit({ actorId: req.user.sub, targetUserId: k.user_id, action: "KYC_DOCUMENTS_VIEWED",
      meta: { submissionId: id }, ip: req.ip });

    const [front, back, selfie] = await Promise.all([
      signedUrlFor(k.document_front_url),
      signedUrlFor(k.document_back_url),
      signedUrlFor(k.selfie_url),
    ]);

    return {
      submission: {
        id: k.id, userId: k.user_id, email: k.email, userName: k.user_name,
        fullName: k.full_name, address: k.address,
        documentType: k.document_type, documentNumber: k.document_number,
        status: k.status, rejectionReason: k.rejection_reason ?? null,
        reviewedAt: k.reviewed_at ?? null, createdAt: k.created_at,
      },
      // Short-lived and single-purpose; they expire on their own within minutes.
      documents: { front, back, selfie, expiresInSec: config.kycSignedUrlTtlSec },
    };
  });

  app.post("/kyc/:id/review", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({
      decision: z.enum(["APPROVE", "REJECT"]),
      // A rejection the applicant cannot act on is just a dead end, so the
      // reason is mandatory and goes back to them verbatim.
      reason: z.string().min(3).max(500).optional(),
    }).parse(req.body);

    if (body.decision === "REJECT" && !body.reason) {
      throw badRequest("REASON_REQUIRED", "Укажите причину отклонения — она будет показана пользователю");
    }

    const status = body.decision === "APPROVE" ? "APPROVED" : "REJECTED";
    // Conditional on status = 'PENDING', so two admins clicking at once cannot
    // both record a decision.
    const reviewed = (await q.kycReview.get({
      id, status, reason: body.decision === "REJECT" ? body.reason : null,
      reviewer: req.user.sub, ts: now(),
    })) as { user_id: string } | undefined;
    if (!reviewed) throw conflict("NOT_PENDING", "Заявка уже рассмотрена");

    await q.setKycStatus.run(status, now(), reviewed.user_id);
    await audit({ actorId: req.user.sub, targetUserId: reviewed.user_id,
      action: body.decision === "APPROVE" ? "KYC_APPROVED" : "KYC_REJECTED",
      meta: { submissionId: id, reason: body.reason ?? null }, ip: req.ip });

    return { ok: true, status };
  });

  app.patch("/instruments/:symbol", async (req) => {
    const { symbol } = z.object({ symbol: z.string() }).parse(req.params);
    const body = z.object({
      active: z.boolean().optional(),
      maxLeverage: z.number().int().min(1).max(125).optional(),
    }).parse(req.body);

    const ins = (await q.instrument.get(symbol.toUpperCase())) as any;
    if (!ins) throw notFound("Инструмент не найден");
    const active = body.active === undefined ? asNum(ins.active) : body.active ? 1 : 0;
    const maxLev = body.maxLeverage ?? asNum(ins.max_leverage);
    await q.updInstrument.run(active, maxLev, ins.symbol);
    await audit({ actorId: req.user.sub, action: "INSTRUMENT_UPDATED", meta: { symbol, ...body }, ip: req.ip });
    return { instrument: { symbol: ins.symbol, active: active === 1, maxLeverage: maxLev } };
  });
}
