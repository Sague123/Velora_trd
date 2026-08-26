import { db, newId, now } from "../db.js";
import { hashToken, randomToken } from "./crypto.js";

/**
 * One-time, read-only support links: a manager holding the IMPERSONATE
 * permission mints one for a converted lead, and whoever opens it once sees an
 * account snapshot — never a session, never the person's password, never a
 * way to place an order or move money as them. See `db.ts`'s
 * `crm_view_tokens` table comment for why this is its own table rather than
 * reusing `auth_tokens`: that table is a credential proving control of an
 * inbox; this is authorisation a manager granted themselves for one look.
 *
 * Same single-use guarantee as every other token in this codebase: only the
 * SHA-256 of the token is stored, and consuming is one atomic
 * `UPDATE … WHERE used_at IS NULL RETURNING` so two people opening the same
 * link at once cannot both see the snapshot.
 */

const TTL_MS = 10 * 60_000;

const q = {
  insert: db.prepare(`
    INSERT INTO crm_view_tokens (id, token_hash, lead_id, platform_user_id, issued_by, expires_at, created_at)
    VALUES (@id, @hash, @leadId, @platformUserId, @issuedBy, @expiresAt, @ts)
  `),
  consume: db.prepare(`
    UPDATE crm_view_tokens SET used_at = @ts
    WHERE token_hash = @hash AND used_at IS NULL AND expires_at > @ts
    RETURNING lead_id, platform_user_id, issued_by
  `),
};

export async function issueViewToken(args: {
  leadId: string; platformUserId: string; issuedBy: string;
}): Promise<string> {
  const raw = randomToken();
  await q.insert.run({
    id: newId(), hash: hashToken(raw), leadId: args.leadId, platformUserId: args.platformUserId,
    issuedBy: args.issuedBy, expiresAt: new Date(Date.now() + TTL_MS).toISOString(), ts: now(),
  });
  return raw;
}

export interface ConsumedViewToken {
  leadId: string;
  platformUserId: string;
  issuedBy: string;
}

/** Returns what the token authorised, or null if it was wrong, expired, or
 * already used — callers must not distinguish between those to the caller. */
export async function consumeViewToken(raw: string): Promise<ConsumedViewToken | null> {
  const row = (await q.consume.get({ hash: hashToken(raw), ts: now() })) as
    | { lead_id: string; platform_user_id: string; issued_by: string }
    | undefined;
  if (!row) return null;
  return { leadId: row.lead_id, platformUserId: row.platform_user_id, issuedBy: row.issued_by };
}
