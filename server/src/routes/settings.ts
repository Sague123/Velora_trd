import type { FastifyInstance } from "fastify";
import { db, now } from "../db.js";
import { audit } from "../lib/ledger.js";
import { applyPatch, normalizeSettings, settingsPatchSchema } from "../lib/userSettings.js";

const q = {
  get: db.prepare("SELECT data FROM user_settings WHERE user_id = ?"),
  upsert: db.prepare(`
    INSERT INTO user_settings (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT (user_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
  `),
};

async function load(userId: string) {
  const row = (await q.get.get(userId)) as { data: unknown } | undefined;
  return normalizeSettings(row?.data);
}

export default async function settingsRoutes(app: FastifyInstance) {
  /** Always the complete document — defaults filled in for anything unset. */
  app.get("/", { preHandler: [app.authenticate] }, async (req) => load(req.user.sub));

  /** Partial update. Returns the full, normalised result the client adopts. */
  app.patch("/", { preHandler: [app.authenticate] }, async (req) => {
    const patch = settingsPatchSchema.parse(req.body);
    const next = applyPatch(await load(req.user.sub), patch);
    await q.upsert.run(req.user.sub, JSON.stringify(next), now());
    await audit({
      actorId: req.user.sub, targetUserId: req.user.sub, action: "SETTINGS_UPDATED",
      meta: { sections: Object.keys(patch) }, ip: req.ip,
    });
    return next;
  });
}
