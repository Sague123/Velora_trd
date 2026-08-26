import crypto from "node:crypto";
import { config } from "../config.js";

/**
 * Authenticated encryption for the handful of secrets that must be stored
 * recoverably rather than hashed.
 *
 * Passwords, refresh tokens and backup codes are all *hashed*, because nothing
 * ever needs to read them back — only to check a presented value. A TOTP shared
 * secret is different: the server has to have the actual bytes on every login
 * to derive the current code. Storing it in plaintext would mean one leaked
 * database dump hands over every second factor on the platform, which would
 * make 2FA worth roughly nothing. So it is encrypted at rest under a key that
 * lives in the environment, not in the database — a dump alone is not enough.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails loudly instead of
 * decrypting to garbage. Format on disk is `v1.<iv>.<tag>.<ciphertext>`, all
 * base64url, with the version prefix so the scheme can be rotated later
 * without guessing what an existing row was encrypted with.
 */

const ALGO = "aes-256-gcm";
const VERSION = "v1";

/** A 32-byte key from ENCRYPTION_KEY, accepting either raw base64 key material
 * or an arbitrary passphrase (hashed to length — never truncated, which would
 * silently throw away entropy). */
const key = (() => {
  const raw = config.encryptionKey;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  return crypto.createHash("sha256").update(raw, "utf8").digest();
})();

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit nonce, the GCM standard
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), enc.toString("base64url")].join(".");
}

/** Returns null rather than throwing for anything that isn't decryptable under
 * the current key — a rotated key, a corrupted row, a value written by an older
 * scheme. Callers treat that as "this second factor is unusable", which is a
 * recoverable state (disable 2FA, re-enrol), not a crash. */
export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(parts[1], "base64url"));
    decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** SHA-256, used for values that are already high-entropy random — refresh
 * tokens, email links, backup codes. bcrypt exists to make *guessable* secrets
 * expensive to attack; against 128+ bits of randomness it buys nothing and
 * costs a login's worth of latency per candidate compared. */
export const hashToken = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

/** A URL-safe random token for an emailed link. */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

/** Compares two strings without leaking their common prefix through timing. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}
