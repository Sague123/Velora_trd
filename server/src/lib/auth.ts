import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db, newId, now } from "../db.js";
import { config } from "../config.js";

const BCRYPT_ROUNDS = 12;
export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

/** Refresh tokens are stored hashed — a database leak must not yield usable tokens. */
const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

export interface AccessClaims { sub: string; role: string; email: string }
export interface UserRow {
  id: string; email: string; name: string; role: string; status: string;
  password_hash: string; created_at: string; last_login_at: string | null;
}

const insToken = db.prepare(`
  INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip, created_at)
  VALUES (@id, @userId, @tokenHash, @expiresAt, @userAgent, @ip, @createdAt)
`);
const selToken = db.prepare(`
  SELECT rt.*, u.id AS u_id, u.email AS u_email, u.name AS u_name, u.role AS u_role, u.status AS u_status,
         u.avatar AS u_avatar, u.account_number AS u_account_number,
         u.email_verified AS u_email_verified, u.totp_enabled AS u_totp_enabled
  FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id WHERE rt.token_hash = ?
`);
const revokeOne = db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL");
const revokeByHash = db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL");
const revokeUserAll = db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL");

export async function issueTokens(
  app: FastifyInstance,
  user: { id: string; role: string; email: string },
  ctx: { userAgent?: string; ip?: string } = {}
) {
  const accessToken = app.jwt.sign(
    { sub: user.id, role: user.role, email: user.email } satisfies AccessClaims,
    { expiresIn: config.accessTtl }
  );
  const raw = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + config.refreshTtlDays * 864e5);
  await insToken.run({
    id: newId(),
    userId: user.id,
    tokenHash: sha256(raw),
    expiresAt: expiresAt.toISOString(),
    userAgent: ctx.userAgent?.slice(0, 255) ?? null,
    ip: ctx.ip ?? null,
    createdAt: now(),
  });
  return { accessToken, refreshToken: raw, refreshExpiresAt: expiresAt };
}

/**
 * Rotation: the presented token is revoked and replaced. Presenting an already
 * revoked token means it leaked, so every session for that user is dropped.
 */
export async function rotateRefreshToken(
  app: FastifyInstance,
  raw: string,
  ctx: { userAgent?: string; ip?: string } = {}
) {
  const row = (await selToken.get(sha256(raw))) as any;
  if (!row) return null;

  if (row.revoked_at) {
    await revokeUserAll.run(now(), row.user_id);
    return null;
  }
  if (new Date(row.expires_at) < new Date()) return null;
  if (row.u_status !== "ACTIVE") return null;

  await revokeOne.run(now(), row.id);
  // Same shape /login and /register return, so a page that reloads through
  // /refresh never sees a user object missing fields it had a moment ago.
  const user = {
    id: row.u_id, email: row.u_email, name: row.u_name, role: row.u_role,
    avatar: row.u_avatar ?? null, accountNumber: row.u_account_number ?? null,
    emailVerified: row.u_email_verified === true, totpEnabled: row.u_totp_enabled === true,
  };
  const tokens = await issueTokens(app, user, ctx);
  return { tokens, user };
}

export const revokeRefreshToken = (raw: string) => revokeByHash.run(now(), sha256(raw));
export const revokeAllForUser = (userId: string) => revokeUserAll.run(now(), userId);
// Both already return Promises via the async .run() adapter — callers that
// need to wait for the revoke to land should `await` them; a few fire-and-
// forget call sites (logout, password change) intentionally don't.
