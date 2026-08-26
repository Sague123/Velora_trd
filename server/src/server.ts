import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db.js";
import { startPriceFeed } from "./engine/prices.js";
import { startEngine } from "./engine/matching.js";
import { startStrategyEngine } from "./engine/strategy.js";

const app = await buildApp();
const stopFeed = startPriceFeed();
const stopEngine = startEngine();
const stopStrategies = startStrategyEngine();

function shutdown(signal: string) {
  app.log.info(`${signal} received, shutting down`);
  stopStrategies();
  stopEngine();
  stopFeed();
  app.close().then(() => closeDb()).then(() => process.exit(0));
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

try {
  await app.listen({ port: config.port, host: "0.0.0.0" });
  app.log.info(`Velora API listening on http://localhost:${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
