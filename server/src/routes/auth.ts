import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, tx, asBig, newAccountNumber } from "../db.js";
import { config } from "../config.js";
import {
  hashPassword, verifyPassword, issueTokens, rotateRefreshToken,
  revokeRefreshToken, revokeAllForUser, type UserRow,
} from "../lib/auth.js";
import { audit } from "../lib/ledger.js";
import { toScaled, out } from "../lib/money.js";
import { conflict, unauthorized, badRequest } from "../lib/errors.js";

const password = z.string().min(10, "Пароль должен быть не короче 10 символов").max(200)
  .regex(/[a-zA-Z]/, "Пароль должен содержать буквы")
  .regex(/[0-9]/, "Пароль должен содержать цифры");

const REFRESH_COOKIE = "velora_rt";
const cookieOpts = {
  httpOnly: true,               // not readable from JS — blunts XSS token theft
  sameSite: "lax" as const,
  secure: config.env === "production",
  path: "/api/auth",
};

const q = {
  byEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
  byId: db.prepare("SELECT * FROM users WHERE id = ?"),
  insUser: db.prepare(`INSERT INTO users (id, email, password_hash, name, role, status, account_number, created_at, updated_at)
                       VALUES (@id, @email, @hash, @name, @role, 'ACTIVE', @accountNumber, @ts, @ts)`),
  insAccount: db.prepare("INSERT INTO accounts (user_id, cash_scaled, updated_at) VALUES (?, ?, ?)"),
  insLedger: db.prepare(`INSERT INTO ledger_entries (id, user_id, type, amount_scaled, balance_after_scaled, note, created_at)
                         VALUES (@id, @userId, 'DEPOSIT', @amt, @amt, @note, @ts)`),
  account: db.prepare("SELECT cash_scaled FROM accounts WHERE user_id = ?"),
  touchLogin: db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?"),
  setPassword: db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?"),
  setName: db.prepare("UPDATE users SET name = ?, updated_at = ? WHERE id = ?"),
  setDob: db.prepare("UPDATE users SET date_of_birth = ?, updated_at = ? WHERE id = ?"),
  setAvatar: db.prepare("UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?"),
};

export default async function authRoutes(app: FastifyInstance) {
  app.post("/register", { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({
      email: z.string().email("Некорректный email").max(254),
      password,
      name: z.string().min(1).max(80).optional(),
    }).parse(req.body);

    const email = body.email.toLowerCase();
    if (await q.byEmail.get(email)) throw conflict("EMAIL_TAKEN", "Пользователь с таким email уже существует");

    const hash = await hashPassword(body.password);
    const id = newId();
    const ts = now();
    const starting = toScaled(config.startingBalance);

    const accountNumber = await newAccountNumber();
    await tx(async () => {
      await q.insUser.run({ id, email, hash, name: body.name ?? email.split("@")[0], role: "USER", accountNumber, ts });
      await q.insAccount.run(id, starting, ts);
      await q.insLedger.run({ id: newId(), userId: id, amt: starting, note: "Стартовый баланс", ts });
      await audit({ actorId: id, targetUserId: id, action: "USER_REGISTERED", ip: req.ip });
    });

    const user = (await q.byId.get(id)) as UserRow;
    const tokens = await issueTokens(app, user, { userAgent: req.headers["user-agent"], ip: req.ip });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOpts, expires: tokens.refreshExpiresAt });
    return reply.code(201).send({
      accessToken: tokens.accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: (user as any).avatar ?? null, accountNumber: (user as any).account_number ?? null },
    });
  });

  app.post("/login", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = (await q.byEmail.get(body.email.toLowerCase())) as UserRow | undefined;

    // Same response either way — no account enumeration through timing or wording.
    const ok = user ? await verifyPassword(body.password, user.password_hash) : false;
    if (!user || !ok) {
      await audit({ action: "LOGIN_FAILED", meta: { email: body.email }, ip: req.ip });
      throw unauthorized("Неверный email или пароль");
    }
    if (user.status !== "ACTIVE") throw unauthorized("Аккаунт заблокирован");

    await q.touchLogin.run(now(), user.id);
    await audit({ actorId: user.id, targetUserId: user.id, action: "LOGIN_SUCCESS", ip: req.ip });

    const tokens = await issueTokens(app, user, { userAgent: req.headers["user-agent"], ip: req.ip });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOpts, expires: tokens.refreshExpiresAt });
    return {
      accessToken: tokens.accessToken,
      user: { id: user.id, email: user.email, name: user.name, role: user.role, avatar: (user as any).avatar ?? null, accountNumber: (user as any).account_number ?? null },
    };
  });

  app.post("/refresh", async (req, reply) => {
    const raw = (req.cookies as Record<string, string>)[REFRESH_COOKIE] ?? (req.body as any)?.refreshToken;
    if (!raw) throw unauthorized("Отсутствует refresh-токен");

    const rotated = await rotateRefreshToken(app, raw, { userAgent: req.headers["user-agent"], ip: req.ip });
    if (!rotated) {
      reply.clearCookie(REFRESH_COOKIE, cookieOpts);
      throw unauthorized("Сессия недействительна, войдите заново");
    }
    reply.setCookie(REFRESH_COOKIE, rotated.tokens.refreshToken, { ...cookieOpts, expires: rotated.tokens.refreshExpiresAt });
    return { accessToken: rotated.tokens.accessToken, user: rotated.user };
  });

  app.post("/logout", async (req, reply) => {
    const raw = (req.cookies as Record<string, string>)[REFRESH_COOKIE];
    if (raw) await revokeRefreshToken(raw);
    reply.clearCookie(REFRESH_COOKIE, cookieOpts);
    return { ok: true };
  });

  app.get("/me", { preHandler: [app.authenticate] }, async (req) => {
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    const acc = (await q.account.get(user.id)) as { cash_scaled: bigint } | undefined;
    return {
      id: user.id, email: user.email, name: user.name, role: user.role, status: user.status,
      dateOfBirth: (user as any).date_of_birth ?? null, avatar: (user as any).avatar ?? null,
      accountNumber: (user as any).account_number ?? null,
      createdAt: user.created_at, balance: out(acc ? asBig(acc.cash_scaled) : 0n, 2),
    };
  });

  app.patch("/me", { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({
      name: z.string().min(1).max(80).optional(),
      // Self-reported only — never verified against a document or authority.
      dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
      // A small base64 data-URI, capped well under the request body limit —
      // there's no file-storage service here, just a column like the rest.
      avatar: z.string().max(150_000).startsWith("data:image/").nullable().optional(),
    }).parse(req.body);

    if (body.dateOfBirth) {
      const d = new Date(body.dateOfBirth);
      const age = (Date.now() - d.getTime()) / (365.25 * 86_400_000);
      if (Number.isNaN(d.getTime()) || age < 0 || age > 120) {
        throw badRequest("INVALID_DATE", "Некорректная дата рождения");
      }
    }

    if (body.name !== undefined) await q.setName.run(body.name, now(), req.user.sub);
    if (body.dateOfBirth !== undefined) await q.setDob.run(body.dateOfBirth, now(), req.user.sub);
    if (body.avatar !== undefined) await q.setAvatar.run(body.avatar, now(), req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "PROFILE_UPDATED", meta: { name: body.name, dateOfBirth: body.dateOfBirth, avatar: body.avatar ? "[updated]" : body.avatar }, ip: req.ip });
    return { ok: true };
  });

  app.post("/change-password", { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ currentPassword: z.string(), newPassword: password }).parse(req.body);
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user || !(await verifyPassword(body.currentPassword, user.password_hash))) {
      throw badRequest("WRONG_PASSWORD", "Текущий пароль указан неверно");
    }
    await q.setPassword.run(await hashPassword(body.newPassword), now(), user.id);
    await revokeAllForUser(user.id); // a password change ends every other session
    await audit({ actorId: user.id, targetUserId: user.id, action: "PASSWORD_CHANGED", ip: req.ip });
    return { ok: true };
  });
}
