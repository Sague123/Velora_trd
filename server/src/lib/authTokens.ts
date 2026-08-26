import { db, newId, now } from "../db.js";
import { hashToken, randomToken } from "./crypto.js";

/**
 * Emailed, single-use, expiring credentials. A verification link proves control
 * of an inbox; a reset link is, for sixty minutes, as good as the password. Both
 * therefore follow the same three rules, which is why they share one table and
 * one code path rather than being implemented twice:
 *
 *  1. Only the SHA-256 of the token is stored, so a database leak yields no
 *     usable links (the same argument as refresh_tokens).
 *  2. Issuing a new token of a kind invalidates that user's outstanding ones,
 *     so "reset my password" three times leaves exactly one working link.
 *  3. Consuming is atomic and once-only — a used token is marked, not deleted,
 *     so a replay is distinguishable from a token that never existed.
 */

export type AuthTokenKind = "EMAIL_VERIFY" | "PASSWORD_RESET";

const q = {
  invalidate: db.prepare(
    "UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND kind = ? AND used_at IS NULL"
  ),
  insert: db.prepare(`
    INSERT INTO auth_tokens (id, user_id, kind, token_hash, expires_at, created_at)
    VALUES (@id, @userId, @kind, @hash, @expiresAt, @ts)
  `),
  // Marks the row used and returns it in the same statement: two callers
  // presenting the same link at once cannot both win.
  consume: db.prepare(`
    UPDATE auth_tokens SET used_at = @ts
    WHERE token_hash = @hash AND kind = @kind AND used_at IS NULL AND expires_at > @ts
    RETURNING user_id
  `),
};

export async function issueAuthToken(
  userId: string,
  kind: AuthTokenKind,
  ttlMs: number
): Promise<string> {
  await q.invalidate.run(now(), userId, kind);
  const raw = randomToken();
  await q.insert.run({
    id: newId(), userId, kind, hash: hashToken(raw),
    expiresAt: new Date(Date.now() + ttlMs).toISOString(), ts: now(),
  });
  return raw;
}

/** Returns the user the token belonged to, or null if it was wrong, expired or
 * already used — the caller must not distinguish between those to the client. */
export async function consumeAuthToken(raw: string, kind: AuthTokenKind): Promise<string | null> {
  const row = (await q.consume.get({ hash: hashToken(raw), kind, ts: now() })) as
    | { user_id: string }
    | undefined;
  return row?.user_id ?? null;
}
