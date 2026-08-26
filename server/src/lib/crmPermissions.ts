import { db } from "../db.js";
import { forbidden } from "./errors.js";

/**
 * Per-manager CRM powers, beyond the base pipeline every MANAGER already has
 * (read the board, move a lead through the funnel, comment, edit its data).
 *
 * Four actions reach outside the CRM's own tables into a real person's account
 * and money, so each is opt-in and grantable only by an admin — never by a
 * manager, and never as a side effect of the MANAGER role itself:
 *
 *  IMPERSONATE     mint a one-time, read-only view of the lead's account
 *  MANAGE_ACCOUNT  suspend / reactivate the linked platform account
 *  MANAGE_BALANCE  credit or debit the linked account's cash balance
 *  MANAGE_TRADES   close a position or cancel an order on the linked account
 *
 * ADMIN bypasses this file entirely — every route that calls
 * requireCrmPermission() runs behind requireManager() first, and an admin
 * already holds every power a permission here could grant, so gating them on
 * top would just be a second copy of the same check with more ways to drift.
 */
export type CrmPermission = "IMPERSONATE" | "MANAGE_ACCOUNT" | "MANAGE_BALANCE" | "MANAGE_TRADES";

export const CRM_PERMISSIONS: CrmPermission[] = [
  "IMPERSONATE", "MANAGE_ACCOUNT", "MANAGE_BALANCE", "MANAGE_TRADES",
];

const q = {
  role: db.prepare("SELECT role, crm_permissions FROM users WHERE id = ?"),
};

/** Parses the stored column defensively: a hand-edited row or a future schema
 * change must degrade to "no permissions", never to a crash that locks every
 * manager out of the CRM. */
function parsePermissions(raw: unknown): CrmPermission[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is CrmPermission => CRM_PERMISSIONS.includes(p as CrmPermission));
}

export async function getCrmPermissions(userId: string): Promise<CrmPermission[]> {
  const row = (await q.role.get(userId)) as { role: string; crm_permissions: unknown } | undefined;
  if (!row) return [];
  if (row.role === "ADMIN") return CRM_PERMISSIONS.slice();
  return parsePermissions(row.crm_permissions);
}

/** Throws unless the caller holds `permission` — ADMIN always passes. Call
 * after requireManager() has already confirmed the caller belongs in the CRM
 * at all; this only decides which of the sensitive actions they get. */
export async function requireCrmPermission(userId: string, permission: CrmPermission): Promise<void> {
  const granted = await getCrmPermissions(userId);
  if (!granted.includes(permission)) {
    throw forbidden(`Это действие требует права ${permission} — запросите его у администратора`);
  }
}
