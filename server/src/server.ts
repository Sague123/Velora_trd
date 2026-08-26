import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db.js";
import { startPriceFeed } from "./engine/prices.js";
import { startEngine } from "./engine/matching.js";
import { startStrategyEngine } from "./engine/strategy.js";
import { startSavingsEngine } from "./engine/savings.js";
import { captureError, flushMonitoring } from "./lib/monitoring.js";

const app = await buildApp();
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
