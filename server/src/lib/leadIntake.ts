import { db, newId, now } from "../db.js";

/**
 * Every USER-role account gets a CRM lead row the moment it exists — whether
 * created by self-registration (routes/auth.ts) or backfilled for accounts
 * that predate this (db.ts's migrate()). That is what makes "every customer
 * shows up in the CRM" true by construction instead of by remembering to
 * file one separately.
 *
 * Deliberately not called from routes/crm.ts's own /leads/:id/convert: that
 * endpoint promotes an *existing* lead to a platform account, so the lead row
 * is already there — inserting a second one would give the same person two
 * cards. This is only for the path that has no lead yet: someone typing their
 * own details into the register form.
 *
 * MANAGER/ADMIN accounts never get one — a CRM lists customers, not staff;
 * staff accounts are managed from the admin console's Team tab instead.
 */
const insLead = db.prepare(`
  INSERT INTO leads (id, full_name, phone, email, country, source, status,
                     verification_status, assigned_manager_id, platform_user_id,
                     created_at, updated_at)
  VALUES (@id, @fullName, NULL, @email, NULL, @source, 'NEW',
          'NOT_SUBMITTED', NULL, @platformUserId, @ts, @ts)
`);

export async function createLeadForUser(input: {
  userId: string; email: string; fullName: string; source?: string; ts?: string;
}): Promise<void> {
  await insLead.run({
    id: newId(),
    fullName: input.fullName,
    email: input.email,
    platformUserId: input.userId,
    source: input.source ?? "Самостоятельная регистрация",
    ts: input.ts ?? now(),
  });
}
