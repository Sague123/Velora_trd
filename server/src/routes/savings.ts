import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, tx, asBig, asNum } from "../db.js";
import { config } from "../config.js";
import { out, toScaled } from "../lib/money.js";
import { postLedger, audit } from "../lib/ledger.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { SAVINGS_PLANS, planByType, dailyInterest, type SavingsRow } from "../engine/savings.js";
import { requireApprovedKyc } from "./kyc.js";
import { sLedger } from "./serialize.js";

/**
 * Savings accounts. Every route here does exactly one thing to money: move it
 * between the trading balance and a savings principal, through postLedger(), in
 * one transaction. Interest is not paid here — engine/savings.ts owns that, on
 * the server's own schedule.
 */

const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/, "Ожидается положительное десятичное число");

// Below this a day's interest truncates to zero at every plan's rate, so the
// account would sit there earning literally nothing and look broken.
const MIN_OPENING = toScaled("10");

const q = {
  mine: db.prepare("SELECT * FROM savings_accounts WHERE user_id = ? AND status = 'ACTIVE' ORDER BY created_at"),
  one: db.prepare("SELECT * FROM savings_accounts WHERE id = ? AND user_id = ?"),
  insert: db.prepare(`
    INSERT INTO savings_accounts (id, user_id, plan_type, balance_scaled, apy, locked_until,
                                  status, last_accrual_at, created_at, updated_at)
    VALUES (@id, @userId, @planType, @balance, @apy, @lockedUntil, 'ACTIVE', @ts, @ts, @ts)
  `),
  setBalance: db.prepare("UPDATE savings_accounts SET balance_scaled = ?, updated_at = ? WHERE id = ?"),
  close: db.prepare("UPDATE savings_accounts SET balance_scaled = 0, status = 'CLOSED', updated_at = ? WHERE id = ?"),
  history: db.prepare(`
    SELECT * FROM ledger_entries
    WHERE user_id = ? AND type IN ('SAVINGS_DEPOSIT', 'SAVINGS_WITHDRAWAL', 'SAVINGS_INTEREST')
    ORDER BY created_at DESC LIMIT 100
  `),
  earnedTotal: db.prepare(`
    SELECT COALESCE(SUM(amount_scaled), 0) AS n FROM ledger_entries
    WHERE user_id = ? AND type = 'SAVINGS_INTEREST'
  `),
};

const isLocked = (row: SavingsRow): boolean =>
  !!row.locked_until && new Date(row.locked_until).getTime() > Date.now();

const sAccount = (row: SavingsRow) => {
  const balance = asBig(row.balance_scaled);
  const apy = asNum(row.apy);
  return {
    id: row.id,
    planType: row.plan_type,
    planLabel: planByType(row.plan_type)?.label ?? row.plan_type,
    balance: out(balance, 2),
    apy,
    lockedUntil: row.locked_until,
    locked: isLocked(row),
    // What today will pay, at today's balance — the number people actually
    // want from a savings screen, and one the server should compute rather
    // than leave the UI to re-derive (and get subtly wrong).
    dailyInterest: out(dailyInterest(balance, apy), 8),
    projectedYear: out(dailyInterest(balance, apy) * 365n, 2),
    status: row.status,
    createdAt: row.created_at,
  };
};

export default async function savingsRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => {
    const rows = (await q.mine.all(req.user.sub)) as SavingsRow[];
    const totals = rows.reduce((sum, r) => sum + asBig(r.balance_scaled), 0n);
    return {
      plans: SAVINGS_PLANS,
      accounts: rows.map(sAccount),
      totalSaved: out(totals, 2),
      totalEarned: out(asBig(((await q.earnedTotal.get(req.user.sub)) as any).n), 2),
      kycRequired: config.savingsRequiresKyc,
    };
  });

  /** The savings slice of the ledger, in the same shape the account history
   * already uses, so the existing table component renders it unchanged. */
  app.get("/history", async (req) => ({
    entries: ((await q.history.all(req.user.sub)) as any[]).map(sLedger),
  }));

  app.post("/accounts", async (req, reply) => {
    const body = z.object({ planType: z.string(), amount: decimal }).parse(req.body);
    const plan = planByType(body.planType);
    if (!plan) throw badRequest("UNKNOWN_PLAN", "Такого тарифа не существует");

    // Opening a savings account is the platform taking custody of money for a
    // period, so it sits behind the same identity check as a withdrawal.
    if (config.savingsRequiresKyc) await requireApprovedKyc(req.user.sub);

    const amount = toScaled(body.amount);
    if (amount < MIN_OPENING) {
      throw badRequest("AMOUNT_TOO_SMALL", `Минимальная сумма для открытия — ${out(MIN_OPENING, 2)}`);
    }

    const id = newId();
    const ts = now();
    await tx(async () => {
      // Debits cash first: postLedger refuses to overdraw, so an account can
      // never be opened with money that wasn't there.
      await postLedger({
        userId: req.user.sub, type: "SAVINGS_DEPOSIT", amountScaled: -amount,
        refType: "SAVINGS", refId: id, note: `Открытие накопительного счёта (${plan.label})`,
      });
      await q.insert.run({
        id, userId: req.user.sub, planType: plan.type, balance: amount, apy: plan.apy,
        lockedUntil: plan.lockDays > 0
          ? new Date(Date.now() + plan.lockDays * 86_400_000).toISOString()
          : null,
        ts,
      });
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "SAVINGS_OPENED",
        meta: { id, planType: plan.type, amount: body.amount }, ip: req.ip });
    });

    return reply.code(201).send({ account: sAccount((await q.one.get(id, req.user.sub)) as SavingsRow) });
  });

  app.post("/accounts/:id/deposit", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ amount: decimal }).parse(req.body);
    const account = (await q.one.get(id, req.user.sub)) as SavingsRow | undefined;
    if (!account || account.status !== "ACTIVE") throw notFound("Накопительный счёт не найден");

    // A top-up into a locked plan would either extend the existing lock over
    // money deposited later, or create two maturity dates on one account.
    // Neither is a thing a user can reason about, so it opens a new account.
    if (account.locked_until) {
      throw conflict("PLAN_LOCKED", "Пополнить срочный вклад нельзя — откройте ещё один счёт");
    }

    const amount = toScaled(body.amount);
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");

    await tx(async () => {
      await postLedger({
        userId: req.user.sub, type: "SAVINGS_DEPOSIT", amountScaled: -amount,
        refType: "SAVINGS", refId: id, note: "Пополнение накопительного счёта",
      });
      await q.setBalance.run(asBig(account.balance_scaled) + amount, now(), id);
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "SAVINGS_DEPOSIT",
        meta: { id, amount: body.amount }, ip: req.ip });
    });

    return { account: sAccount((await q.one.get(id, req.user.sub)) as SavingsRow) };
  });

  app.post("/accounts/:id/withdraw", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const body = z.object({ amount: decimal.optional() }).parse(req.body);
    const account = (await q.one.get(id, req.user.sub)) as SavingsRow | undefined;
    if (!account || account.status !== "ACTIVE") throw notFound("Накопительный счёт не найден");
    if (config.savingsRequiresKyc) await requireApprovedKyc(req.user.sub);

    if (isLocked(account)) {
      // Stated as a date, not as "locked": the only useful thing to know here
      // is when it stops being true.
      throw conflict("PLAN_LOCKED",
        `Средства заблокированы до ${new Date(account.locked_until!).toLocaleDateString("ru-RU")}`);
    }

    const balance = asBig(account.balance_scaled);
    // No amount means "all of it", which is what closing an account is.
    const amount = body.amount ? toScaled(body.amount) : balance;
    if (amount <= 0n) throw badRequest("ZERO_AMOUNT", "Сумма должна быть больше нуля");
    if (amount > balance) throw conflict("INSUFFICIENT_SAVINGS", "На накопительном счёте недостаточно средств");

    const closing = amount === balance;
    await tx(async () => {
      await postLedger({
        userId: req.user.sub, type: "SAVINGS_WITHDRAWAL", amountScaled: amount,
        refType: "SAVINGS", refId: id,
        note: closing ? "Закрытие накопительного счёта" : "Снятие с накопительного счёта",
      });
      if (closing) await q.close.run(now(), id);
      else await q.setBalance.run(balance - amount, now(), id);
      await audit({ actorId: req.user.sub, targetUserId: req.user.sub,
        action: closing ? "SAVINGS_CLOSED" : "SAVINGS_WITHDRAWAL",
        meta: { id, amount: out(amount, 2) }, ip: req.ip });
    });

    const fresh = (await q.one.get(id, req.user.sub)) as SavingsRow;
    return { account: sAccount(fresh), closed: closing };
  });
}
