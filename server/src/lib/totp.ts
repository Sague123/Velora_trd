import { generateSecret, generateURI, verify } from "otplib";
import QRCode from "qrcode";
import crypto from "node:crypto";
import { config } from "../config.js";
import { hashToken } from "./crypto.js";

/**
 * Time-based one-time passwords (RFC 6238) — the second factor.
 *
 * Standard parameters throughout (SHA-1, 6 digits, 30s period): they are what
 * Google Authenticator, 1Password, Aegis and the rest implement, and a
 * "stronger" non-standard variant that no authenticator app can enrol is not
 * stronger, it is broken.
 */

/** A fresh base32 shared secret, ready to be shown once and then encrypted. */
export const newTotpSecret = (): string => generateSecret();

/** otpauth:// URI — what the QR code encodes, and what a user can type by hand
 * if their authenticator has no camera. */
export const totpUri = (email: string, secret: string): string =>
  generateURI({ issuer: config.appName, label: email, secret });

/** The URI rendered as a data-URI PNG, so enrolment needs no image hosting. */
export const totpQrDataUrl = (email: string, secret: string): Promise<string> =>
  QRCode.toDataURL(totpUri(email, secret), { margin: 1, width: 240 });

/**
 * Checks a code against the secret, allowing one 30-second step either side.
 * Phone clocks drift and people start typing at 29 seconds past; zero tolerance
 * would reject correct codes often enough that users disable 2FA, which is a
 * worse outcome than the ~90-second window this opens.
 */
export async function verifyTotp(secret: string, token: string): Promise<boolean> {
  const cleaned = token.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = await verify({ secret, token: cleaned, epochTolerance: 30 });
    return result.valid;
  } catch {
    return false;
  }
}

/**
 * Single-use recovery codes for when the phone is lost — without them, losing a
 * device means losing the account, and the support path for that is an admin
 * turning 2FA off, which is a far weaker link than the codes themselves.
 *
 * Stored as SHA-256 hashes (see hashToken): each code carries ~50 bits of
 * randomness, so there is nothing for bcrypt's work factor to protect against,
 * and hashing ten candidates per login attempt with bcrypt would be slow enough
 * to be its own denial of service.
 */
export function newBackupCodes(count = config.backupCodeCount): { codes: string[]; hashes: string[] } {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    // Crockford-ish base32 without I/L/O/U: no character pairs a human can
    // confuse when copying a code off a printout at the worst possible moment.
    const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
    const raw = Array.from(crypto.randomBytes(10), (b) => alphabet[b % alphabet.length]).join("");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, hashes: codes.map(hashToken) };
}

/** Consumes a backup code: returns the remaining hashes if it matched, or null.
 * A code that works twice is not a backup code, it is a password. */
export function consumeBackupCode(code: string, hashes: string[]): string[] | null {
  const hash = hashToken(code.trim().toUpperCase());
  const index = hashes.indexOf(hash);
  if (index === -1) return null;
  return hashes.filter((_, i) => i !== index);
}
