import { buildApp } from "../src/app.js";
import { config } from "../src/config.js";
import { closeDb } from "../src/db.js";

/**
 * What this process actually serves, as one machine-readable line.
 *
 * Two readers. `test/role.test.ts` runs it once per VELORA_ROLE and asserts
 * the split — above all that `internal` starts no engines, a mistake that
 * otherwise surfaces only as orders filled twice and positions liquidated
 * twice, long after the deploy that caused it. And on a server,
 * `VELORA_ROLE=public npm run routes` answers "is the CRM really absent from
 * the public process?" from the process itself, rather than from a proxy
 * config that may or may not match it.
 *
 * Presence is asked per route rather than parsed out of printRoutes': the
 * tree's indentation encodes nesting, and a flat read of it silently turns
 * `/api/crm/leads/:id` into `/:id`. The answer here has to be exact.
 *
 * Output is prefixed because Fastify's logger shares stdout. Nothing
 * listens: the app is built, asked, and dropped.
 */
const SENTINELS: Record<string, { method: string; url: string }> = {
  login: { method: "POST", url: "/api/auth/login" },
  settings: { method: "GET", url: "/api/settings/" },
  instruments: { method: "GET", url: "/api/instruments" },
  candles: { method: "GET", url: "/api/instruments/:symbol/candles" },
  wallet: { method: "GET", url: "/api/spot/wallet" },
  strategies: { method: "GET", url: "/api/strategies/" },
  kyc: { method: "GET", url: "/api/kyc/" },
  savings: { method: "GET", url: "/api/savings/" },
  crmView: { method: "POST", url: "/api/crm-view/" },
  prices: { method: "GET", url: "/ws/prices" },
  crm: { method: "GET", url: "/api/crm/meta" },
  admin: { method: "GET", url: "/api/admin/stats" },
};

const app = await buildApp();
await app.ready();

const serves: Record<string, boolean> = {};
for (const [name, r] of Object.entries(SENTINELS)) serves[name] = app.hasRoute(r);

console.log("VELORA_MANIFEST " + JSON.stringify({
  role: config.role,
  runsEngines: config.runsEngines,
  serves,
}));

await app.close();
await closeDb();
