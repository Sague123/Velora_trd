import crypto from "node:crypto";

/**
 * A one-time password for an account the CRM creates on someone's behalf
 * (see routes/crm.ts's lead-conversion endpoint) — never for anything a human
 * chose themselves.
 *
 * Built, not merely sampled, to satisfy the platform's own password policy
 * (routes/auth.ts: ≥10 characters, at least one letter and one digit) with
 * certainty rather than high probability: a temp password that randomly fails
 * its own server's rule would be a bug users hit by chance. No I/l/O/0/1 —
 * the same reasoning as the 2FA backup codes (lib/totp.ts): a manager may
 * read this off a screen aloud over the phone, and those five characters are
 * the ones people mishear or mistype.
 */
const LETTERS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

function randomFrom(alphabet: string, count: number): string {
  return Array.from(crypto.randomBytes(count), (b) => alphabet[b % alphabet.length]).join("");
}

/** Fisher–Yates using crypto randomness, so the digit/letter split chosen for
 * *construction* isn't visible as a fixed pattern (e.g. "always ends in
 * digits") in the final password. */
function shuffle(chars: string): string {
  const arr = chars.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomBytes(1)[0] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join("");
}

export function generateTempPassword(): string {
  // 10 letters + 4 digits = 14 characters: comfortably past the 10-char floor
  // even after accounting for the guaranteed classes.
  return shuffle(randomFrom(LETTERS, 10) + randomFrom(DIGITS, 4));
}
