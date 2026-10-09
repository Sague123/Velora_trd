import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The public/internal split, pinned.
 *
 * The rule worth a test is not which routes are where — that is visible in
 * app.ts — but that an `internal` process starts no engines. Matching,
 * strategies and savings all write money against shared rows, so a second
 * process ticking them fills resting orders twice and liquidates positions
 * twice, and the ledger cannot tell the copies apart afterwards. The failure
 * is silent, expensive, and only shows up well after the deploy that caused
 * it — exactly the shape of thing that belongs here rather than in a review.
 *
 * Each role is asked in its own process, because config.ts reads
 * VELORA_ROLE once at module load. The child reports from the built app
 * itself (scripts/print-routes.ts), so this verifies what Fastify really
 * mounted, not what the source appears to say.
 */

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsx = path.join(serverDir, "node_modules", ".bin", "tsx");

interface Manifest {
  role: string;
  runsEngines: boolean;
  serves: Record<string, boolean>;
}

function manifestFor(role: string): Manifest {
  const out = execFileSync(tsx, ["scripts/print-routes.ts"], {
    cwd: serverDir,
    env: { ...process.env, VELORA_ROLE: role },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  // Fastify's logger shares stdout, so the manifest carries a marker.
  const line = out.split("\n").find((l) => l.startsWith("VELORA_MANIFEST "));
  assert.ok(line, `no manifest in output for role ${role}`);
  return JSON.parse(line.slice("VELORA_MANIFEST ".length)) as Manifest;
}

test("internal runs no engines — a second matching tick double-fills", () => {
  const internal = manifestFor("internal");
  assert.equal(internal.runsEngines, false);
});

test("public and all run the engines", () => {
  assert.equal(manifestFor("public").runsEngines, true);
  assert.equal(manifestFor("all").runsEngines, true);
});

test("the public process does not carry the CRM or the admin panel", () => {
  const { serves } = manifestFor("public");
  assert.equal(serves.crm, false);
  assert.equal(serves.admin, false);
  // Trading, and the one-time support link the client opens without a session.
  assert.equal(serves.wallet, true);
  assert.equal(serves.crmView, true);
  assert.equal(serves.prices, true);
});

test("the internal process carries the desk's tools and nothing public-facing", () => {
  const { serves } = manifestFor("internal");
  assert.equal(serves.crm, true);
  assert.equal(serves.admin, true);
  // Signing in, and the market data the CRM's chart picker and trade editor read.
  assert.equal(serves.login, true);
  assert.equal(serves.settings, true);
  assert.equal(serves.instruments, true);
  assert.equal(serves.candles, true);
  // The public surface is absent, including the price socket: its fan-out is
  // driven by a feed this process does not run.
  assert.equal(serves.wallet, false);
  assert.equal(serves.strategies, false);
  assert.equal(serves.kyc, false);
  assert.equal(serves.savings, false);
  assert.equal(serves.crmView, false);
  assert.equal(serves.prices, false);
});

test("all serves both halves, so an unsplit deployment keeps working", () => {
  const { serves } = manifestFor("all");
  for (const [name, present] of Object.entries(serves)) {
    assert.equal(present, true, `role=all should serve ${name}`);
  }
});

test("an unknown role is refused rather than guessed at", () => {
  assert.throws(() => manifestFor("crm"), /Command failed|VELORA_ROLE/);
});
