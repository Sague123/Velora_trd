import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db.js";
import { badRequest } from "../lib/errors.js";
import { consumeViewToken } from "../lib/crmViewTokens.js";
import { audit } from "../lib/ledger.js";
import { accountSnapshot } from "../lib/accountSummary.js";

/**
 * The public side of the CRM's one-time support link. Deliberately its own,
 * un-gated plugin rather than a route inside `crm.ts`: everything in `crm.ts`
 * sits behind `requireManager`, and whoever opens this link is holding a
 * token, not a manager session — a support link opened by the client
 * themselves, or on a phone with no Velora session at all, must still work.
 */

const q = {
  lead: db.prepare("SELECT full_name FROM leads WHERE id = ?"),
  manager: db.prepare("SELECT name FROM users WHERE id = ?"),
};

export default async function crmViewRoutes(app: FastifyInstance) {
  app.post("/", { config: { rateLimit: { max: 20, timeWindow: "10 minutes" } } }, async (req) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const consumed = await consumeViewToken(token);
    if (!consumed) throw badRequest("INVALID_TOKEN", "Ссылка недействительна, устарела или уже открывалась");

    // The one real event here: someone's financial account was looked at.
    // Recorded the same way opening a KYC document is (routes/admin.ts) —
    // attributed to the manager who minted the link, at the moment it was
    // actually used, not just when it was issued.
    await audit({
      actorId: consumed.issuedBy, targetUserId: consumed.platformUserId,
      action: "CRM_LEAD_VIEW_TOKEN_CONSUMED",
      meta: { leadId: consumed.leadId }, ip: req.ip,
    });

    const lead = (await q.lead.get(consumed.leadId)) as { full_name: string } | undefined;
    const manager = (await q.manager.get(consumed.issuedBy)) as { name: string } | undefined;

    return {
      leadName: lead?.full_name ?? null,
      viewedBy: manager?.name ?? null,
      account: await accountSnapshot(consumed.platformUserId),
    };
  });
}
