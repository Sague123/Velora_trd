import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db.js";
import { startPriceFeed } from "./engine/prices.js";
import { startEngine } from "./engine/matching.js";
import { startStrategyEngine } from "./engine/strategy.js";
import { startSavingsEngine } from "./engine/savings.js";
import { captureError, flushMonitoring } from "./lib/monitoring.js";

/** Host part of DATABASE_URL only — never the credentials. */
function dbHost(): string {
  try { return new URL(config.databaseUrl).host; } catch { return "(unparseable DATABASE_URL)"; }
}

// Startup fails first at the database (migrations run inside buildApp). The
// raw pg error ("getaddrinfo ENOTFOUND dpg-…") doesn't say which setting is
// wrong, so name it: the host we tried and where the value comes from.
const app = await buildApp().catch((err: NodeJS.ErrnoException & { code?: string }) => {
  const unreachable = ["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET"].includes(err.code ?? "");
  const badLogin = err.code === "28P01" || err.code === "3D000"; // wrong password / no such database
  if (unreachable || badLogin) {
    console.error(
      `\n[startup] Cannot ${badLogin ? "log in to" : "reach"} the database at ${dbHost()} (${err.code}).\n` +
      "[startup] Check DATABASE_URL in the service's environment — it should be the Supabase\n" +
      "[startup] Transaction pooler string (port 6543). See DEPLOY.md §1.\n",
    );
  }
  captureError(err, { scope: "startup" });
  return flushMonitoring().finally(() => process.exit(1)) as never;
});
const stopFeed = startPriceFeed();
const stopEngine = startEngine();
const stopStrategies = startStrategyEngine();
const stopSavings = startSavingsEngine();

function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  stopSavings();
  stopStrategies();
  stopEngine();
  stopFeed();
  app.close()
    .then(() => flushMonitoring())   // a report still buffered at exit never happened
    .then(() => closeDb())
    .then(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Fastify's error handler only sees errors raised inside a request. Anything
// thrown from an engine timer or a stray promise lands here, and used to be
// invisible unless someone happened to be reading the log at the time.
process.on("unhandledRejection", (reason) => {
  captureError(reason, { scope: "process.unhandledRejection" });
});
process.on("uncaughtException", (err) => {
  captureError(err, { scope: "process.uncaughtException" });
  // An uncaught exception leaves the process in an unknown state; flush what we
  // know and let the platform restart it rather than serving from a broken one.
  flushMonitoring().finally(() => process.exit(1));
});

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Velora API listening on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
