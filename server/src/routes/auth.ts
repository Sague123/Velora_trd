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
import { conflict, unauthorized, badRequest, forbidden } from "../lib/errors.js";
import { encryptSecret, decryptSecret } from "../lib/crypto.js";
import { consumeBackupCode, newBackupCodes, newTotpSecret, totpQrDataUrl, totpUri, verifyTotp } from "../lib/totp.js";
import { consumeAuthToken, issueAuthToken } from "../lib/authTokens.js";
import { passwordChangedEmail, passwordResetEmail, sendMail, verificationEmail } from "../lib/mailer.js";

const password = z.string().min(10, "Пароль должен быть не короче 10 символов").max(200)
  .regex(/[a-zA-Z]/, "Пароль должен содержать буквы")
  .regex(/[0-9]/, "Пароль должен содержать цифры");

const REFRESH_COOKIE = "velora_rt";
// In production the SPA and the API are deployed as two separate services on
// different hosts (velora-frontend-*.onrender.com vs velora-api-*.onrender.com).
// onrender.com is on the Public Suffix List, so those count as different
// *sites*, which makes every API call cross-site: a SameSite=Lax cookie is
// then neither stored from the login response nor sent on the later
// /api/auth/refresh call, so every reload logged the user straight back out.
// SameSite=None fixes that, and the spec requires Secure alongside it (both
// services are HTTPS). Locally we stay on Lax, because SameSite=None without
// Secure is rejected outright over plain http://localhost.
const isCrossSite = config.env === "production";
const cookieOpts = {
  httpOnly: true,               // not readable from JS — blunts XSS token theft
  sameSite: (isCrossSite ? "none" : "lax") as "none" | "lax",
  secure: isCrossSite,
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
  setTotpSecret: db.prepare("UPDATE users SET totp_secret = ?, totp_enabled = FALSE, backup_codes = NULL, updated_at = ? WHERE id = ?"),
  enableTotp: db.prepare("UPDATE users SET totp_enabled = TRUE, backup_codes = ?, updated_at = ? WHERE id = ?"),
  disableTotp: db.prepare("UPDATE users SET totp_secret = NULL, totp_enabled = FALSE, backup_codes = NULL, updated_at = ? WHERE id = ?"),
  setBackupCodes: db.prepare("UPDATE users SET backup_codes = ?, updated_at = ? WHERE id = ?"),
  markEmailVerified: db.prepare("UPDATE users SET email_verified = TRUE, updated_at = ? WHERE id = ?"),
};

/** Shape returned alongside every access token. Kept in one place so a field
 * added here can never be present on login but missing on refresh. */
const sUser = (u: any) => ({
  id: u.id, email: u.email, name: u.name, role: u.role,
  avatar: u.avatar ?? null, accountNumber: u.account_number ?? null,
  emailVerified: u.email_verified === true,
  totpEnabled: u.totp_enabled === true,
});

/**
 * Sends the verification link. Failures are swallowed on purpose: whether an
 * email provider was reachable is not something the person registering can act
 * on, and letting it fail their registration would make an outage at Resend an
 * outage at Velora.
 */
async function sendVerification(userId: string, email: string): Promise<void> {
  const token = await issueAuthToken(userId, "EMAIL_VERIFY", config.emailTokenTtlHours * 3_600_000);
  await sendMail(verificationEmail(email, token));
}

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
    await sendVerification(id, email);
    const tokens = await issueTokens(app, user, { userAgent: req.headers["user-agent"], ip: req.ip });
    reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOpts, expires: tokens.refreshExpiresAt });
    return reply.code(201).send({ accessToken: tokens.accessToken, user: sUser(user) });
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

    // With 2FA on, the password alone buys nothing but a five-minute window in
    // which to prove the second factor: no access token, no refresh cookie, and
    // the challenge token is explicitly marked so it can never be replayed as
    // an access token (see plugins/authenticate.ts).
    if ((user as any).totp_enabled === true) {
      await audit({ actorId: user.id, targetUserId: user.id, action: "LOGIN_MFA_CHALLENGED", ip: req.ip });
      return {
        mfaRequired: true,
        mfaToken: app.jwt.sign(
          { sub: user.id, mfa: true } as any,
          { expiresIn: `${config.mfaChallengeTtlMinutes}m` }
        ),
      };
    }

    return finishLogin(app, req, reply, user);
  });

  /**
   * Second step of a 2FA login. Accepts either a current TOTP code or one of
   * the single-use backup codes — losing a phone must not mean losing the
   * account, because the support path for that (an admin switching 2FA off) is
   * a weaker link than the backup codes themselves.
   */
  app.post("/login/2fa", { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } }, async (req, reply) => {
    const body = z.object({ mfaToken: z.string(), code: z.string().min(6).max(16) }).parse(req.body);

    let claims: { sub: string; mfa?: boolean };
    try {
      claims = app.jwt.verify(body.mfaToken) as any;
    } catch {
      throw unauthorized("Срок подтверждения истёк — войдите заново");
    }
    if (!claims.mfa) throw unauthorized("Некорректный токен подтверждения");

    const user = (await q.byId.get(claims.sub)) as UserRow | undefined;
    if (!user || user.status !== "ACTIVE") throw unauthorized("Аккаунт недоступен");

    const secret = decryptSecret((user as any).totp_secret);
    const codeOk = secret ? await verifyTotp(secret, body.code) : false;

    if (!codeOk) {
      const hashes = ((user as any).backup_codes ?? []) as string[];
      const remaining = consumeBackupCode(body.code, hashes);
      if (!remaining) {
        await audit({ actorId: user.id, targetUserId: user.id, action: "LOGIN_MFA_FAILED", ip: req.ip });
        throw unauthorized("Неверный код подтверждения");
      }
      await q.setBackupCodes.run(JSON.stringify(remaining), now(), user.id);
      await audit({ actorId: user.id, targetUserId: user.id, action: "LOGIN_MFA_BACKUP_CODE_USED",
        meta: { remaining: remaining.length }, ip: req.ip });
    }

    return finishLogin(app, req, reply, user);
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
      ...sUser(user),
      status: user.status,
      dateOfBirth: (user as any).date_of_birth ?? null,
      backupCodesRemaining: (((user as any).backup_codes ?? []) as string[]).length,
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
    // After the fact, so a change nobody made is visible to the account's owner
    // immediately rather than at their next failed login.
    await sendMail(passwordChangedEmail(user.email));
    return { ok: true };
  });


  /* --------------------------- email verification -------------------------- */
  // Public: the link arrives in an inbox, and requiring a logged-in session to
  // click it would break the common case of opening mail on another device.
  app.post("/verify-email", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const userId = await consumeAuthToken(token, "EMAIL_VERIFY");
    if (!userId) throw badRequest("INVALID_TOKEN", "Ссылка недействительна или уже использована");
    await q.markEmailVerified.run(now(), userId);
    await audit({ actorId: userId, targetUserId: userId, action: "EMAIL_VERIFIED", ip: req.ip });
    return { ok: true };
  });

  app.post("/resend-verification", {
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 3, timeWindow: "10 minutes" } },
  }, async (req) => {
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    if ((user as any).email_verified === true) return { ok: true, alreadyVerified: true };
    await sendVerification(user.id, user.email);
    return { ok: true, alreadyVerified: false };
  });

  /* ---------------------------- password reset ----------------------------- */
  /**
   * Always answers the same way, whether or not the address exists. Anything
   * else turns this endpoint into an account-enumeration oracle: a public form
   * that reports which email addresses hold funds on a trading platform.
   */
  app.post("/forgot-password", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req) => {
    const { email } = z.object({ email: z.string().email().max(254) }).parse(req.body);
    const user = (await q.byEmail.get(email.toLowerCase())) as UserRow | undefined;

    if (user && user.status === "ACTIVE") {
      const token = await issueAuthToken(user.id, "PASSWORD_RESET", config.resetTokenTtlMinutes * 60_000);
      await sendMail(passwordResetEmail(user.email, token));
      await audit({ actorId: user.id, targetUserId: user.id, action: "PASSWORD_RESET_REQUESTED", ip: req.ip });
    } else {
      await audit({ action: "PASSWORD_RESET_REQUESTED_UNKNOWN", meta: { email }, ip: req.ip });
    }
    return { ok: true };
  });

  app.post("/reset-password", { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } }, async (req) => {
    const body = z.object({ token: z.string().min(1), newPassword: password }).parse(req.body);
    const userId = await consumeAuthToken(body.token, "PASSWORD_RESET");
    if (!userId) throw badRequest("INVALID_TOKEN", "Ссылка недействительна или устарела");

    const user = (await q.byId.get(userId)) as UserRow | undefined;
    if (!user || user.status !== "ACTIVE") throw badRequest("INVALID_TOKEN", "Ссылка недействительна");

    await q.setPassword.run(await hashPassword(body.newPassword), now(), userId);
    // Whoever was logged in with the old password should not stay logged in —
    // the whole reason for a reset may be that someone else was.
    await revokeAllForUser(userId);
    // Clicking a link sent to that inbox *is* proof of control of the inbox,
    // which is exactly what verification asks for. Making them do it twice
    // would be ceremony, not security.
    await q.markEmailVerified.run(now(), userId);
    await audit({ actorId: userId, targetUserId: userId, action: "PASSWORD_RESET_COMPLETED", ip: req.ip });
    await sendMail(passwordChangedEmail(user.email));
    return { ok: true };
  });

  /* ------------------------------ 2FA (TOTP) ------------------------------- */
  /**
   * Step one of enrolment: mint a secret, store it encrypted but *not* enabled,
   * and hand back the QR code. 2FA does not switch on here — an enrolment that
   * activated before the user proved their authenticator works would lock out
   * anyone who mis-scanned the code.
   */
  app.post("/2fa/setup", { preHandler: [app.authenticate] }, async (req) => {
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    if ((user as any).totp_enabled === true) {
      throw conflict("TOTP_ALREADY_ENABLED", "Двухфакторная аутентификация уже включена");
    }

    const secret = newTotpSecret();
    await q.setTotpSecret.run(encryptSecret(secret), now(), user.id);
    return {
      // Shown once, during enrolment, and never readable again afterwards.
      secret,
      otpauthUrl: totpUri(user.email, secret),
      qr: await totpQrDataUrl(user.email, secret),
    };
  });

  /** Step two: prove the authenticator is actually producing correct codes,
   * then switch 2FA on and issue the backup codes — once, in this response. */
  app.post("/2fa/enable", { preHandler: [app.authenticate] }, async (req) => {
    const { code } = z.object({ code: z.string().min(6).max(10) }).parse(req.body);
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    if ((user as any).totp_enabled === true) {
      throw conflict("TOTP_ALREADY_ENABLED", "Двухфакторная аутентификация уже включена");
    }

    const secret = decryptSecret((user as any).totp_secret);
    if (!secret) throw badRequest("TOTP_NOT_STARTED", "Сначала начните настройку 2FA");
    if (!(await verifyTotp(secret, code))) throw badRequest("INVALID_CODE", "Неверный код из приложения");

    const { codes, hashes } = newBackupCodes();
    await q.enableTotp.run(JSON.stringify(hashes), now(), user.id);
    await audit({ actorId: user.id, targetUserId: user.id, action: "TOTP_ENABLED", ip: req.ip });
    return { ok: true, backupCodes: codes };
  });

  /**
   * Turning 2FA off is a downgrade of the account's security, so it costs the
   * password *and* a current second factor. Anyone holding a stolen session
   * token has neither, which is precisely the attack this closes.
   */
  app.post("/2fa/disable", { preHandler: [app.authenticate] }, async (req) => {
    const body = z.object({ password: z.string().min(1), code: z.string().min(6).max(16) }).parse(req.body);
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    if ((user as any).totp_enabled !== true) return { ok: true };

    if (!(await verifyPassword(body.password, user.password_hash))) {
      throw badRequest("WRONG_PASSWORD", "Пароль указан неверно");
    }
    const secret = decryptSecret((user as any).totp_secret);
    const ok = (secret ? await verifyTotp(secret, body.code) : false)
      || consumeBackupCode(body.code, ((user as any).backup_codes ?? []) as string[]) !== null;
    if (!ok) throw badRequest("INVALID_CODE", "Неверный код подтверждения");

    await q.disableTotp.run(now(), user.id);
    await audit({ actorId: user.id, targetUserId: user.id, action: "TOTP_DISABLED", ip: req.ip });
    return { ok: true };
  });

  /** Regenerating invalidates every previous code — the point is to make a
   * printout that may have been seen worthless. */
  app.post("/2fa/backup-codes", { preHandler: [app.authenticate] }, async (req) => {
    const { password: pwd } = z.object({ password: z.string().min(1) }).parse(req.body);
    const user = (await q.byId.get(req.user.sub)) as UserRow | undefined;
    if (!user) throw unauthorized();
    if ((user as any).totp_enabled !== true) {
      throw forbidden("Резервные коды существуют только при включённой 2FA");
    }
    if (!(await verifyPassword(pwd, user.password_hash))) {
      throw badRequest("WRONG_PASSWORD", "Пароль указан неверно");
    }

    const { codes, hashes } = newBackupCodes();
    await q.setBackupCodes.run(JSON.stringify(hashes), now(), user.id);
    await audit({ actorId: user.id, targetUserId: user.id, action: "TOTP_BACKUP_CODES_REGENERATED", ip: req.ip });
    return { backupCodes: codes };
  });
}

/** The tail end of a successful login, shared by the one-step and two-step
 * paths so a session issued after 2FA is identical to one issued without it. */
async function finishLogin(
  app: FastifyInstance,
  req: any,
  reply: any,
  user: UserRow
) {
  await q.touchLogin.run(now(), user.id);
  await audit({ actorId: user.id, targetUserId: user.id, action: "LOGIN_SUCCESS", ip: req.ip });
  const tokens = await issueTokens(app, user, { userAgent: req.headers["user-agent"], ip: req.ip });
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...cookieOpts, expires: tokens.refreshExpiresAt });
  return { accessToken: tokens.accessToken, user: sUser(user) };
}
