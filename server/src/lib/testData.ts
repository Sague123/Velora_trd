/**
 * Which CRM rows are test data.
 *
 * The smoke suite works through the real API — it registers accounts, imports
 * leads, converts them — so everything it touches lands in the same `leads`
 * table the desk reads. Deleting those rows afterwards was never an option
 * (the suite asserts they survive), and leaving them in meant the board's
 * counters and "Всего" quietly counted "Edit Me" and "Smoke Tester" as
 * pipeline.
 *
 * So they are marked instead, at the moment they are created, by one rule
 * stated here and nowhere else:
 *
 *  - an explicit `isTest` on a CRM import (what the suite sends for a lead it
 *    creates by hand, including phone-only ones with no address to match), or
 *  - a contact address on a domain that cannot receive mail.
 *
 * The second is what catches self-registration, where nobody is around to
 * pass a flag: `lib/leadIntake.ts` files a lead for every account the moment
 * it exists, including the suite's. `velora.test` is reserved by RFC 2606 and
 * can never belong to a real client; `velora.local` is this repo's own
 * seed/demo domain. Both are addresses no customer can hold, which is what
 * makes hiding them by default safe rather than a guess about intent.
 *
 * Marking is deliberately one-way at creation: nothing re-evaluates this
 * later, so a lead a manager un-marks by hand stays un-marked.
 */

/** Domains whose mail goes nowhere, so a contact on one is never a customer. */
const TEST_DOMAINS = ["velora.test", "velora.local"];

export function looksLikeTestContact(email: string | null | undefined): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1).trim().toLowerCase();
  return TEST_DOMAINS.includes(domain);
}

/** The same rule as SQL, for the one-off backfill in db.ts's migrate(). */
export const TEST_CONTACT_SQL = TEST_DOMAINS.map((d) => `LOWER(email) LIKE '%@${d}'`).join(" OR ");
