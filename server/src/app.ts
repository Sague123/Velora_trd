import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import websocket from "@fastify/websocket";
import { ZodError } from "zod";
import { config } from "./config.js";
import { db, migrate, asBig, asBigOrNull } from "./db.js";
import { AppError } from "./lib/errors.js";
import { MoneyError, out } from "./lib/money.js";
import authPlugin from "./plugins/authenticate.js";
import authRoutes from "./routes/auth.js";
import tradingRoutes from "./routes/trading.js";
import adminRoutes from "./routes/admin.js";
import { onPriceUpdate, allPrices, feedStatus } from "./engine/prices.js";

export async function buildApp() {
  await migrate();

  const app = Fastify({
    logger: config.env === "test" ? false : { level: "info" },
    trustProxy: true,
    bodyLimit: 256 * 1024,
  });

  // Some action endpoints take no payload; an empty body with a JSON content
  // type is a normal client behaviour and must not 400.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const raw = body as string;
    if (!raw || !raw.trim()) return done(null, {});
    try { done(null, JSON.parse(raw)); }
    catch { done(Object.assign(new Error("Malformed JSON"), { statusCode: 400 }), undefined); }
  });

  // In production, only the exact origins listed in CORS_ORIGIN are allowed.
  // In development, also accept any localhost/private-LAN origin regardless
  // of port — so the same dev server answers requests from a phone or
  // another machine on the same network without hand-editing an env var
  // every time the LAN IP changes.
  const isPrivateLanOrigin = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(origin);

  await app.register(cors, {
    origin:
      config.env === "production"
        ? config.corsOrigin
        : (origin, cb) => cb(null, !origin || config.corsOrigin.includes(origin) || isPrivateLanOrigin(origin)),
    credentials: true,
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute" });
  await app.register(websocket);
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: "VALIDATION_ERROR", message: "Проверьте корректность данных",
        details: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
    }
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    if (err instanceof MoneyError) {
      return reply.code(400).send({ error: "INVALID_AMOUNT", message: err.message });
    }
    if ((err as any).statusCode === 429) {
      return reply.code(429).send({ error: "RATE_LIMITED", message: "Слишком много запросов" });
    }
    // Framework-level client errors (malformed body, unsupported media type…)
    // keep their own status instead of being masked as a server fault.
    const status = (err as any).statusCode;
    if (typeof status === "number" && status >= 400 && status < 500) {
      return reply.code(status).send({ error: (err as any).code ?? "BAD_REQUEST", message: err.message });
    }
    // Internals never reach the client; the full error stays in the server log.
    req.log.error({ err }, "unhandled error");
    return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Внутренняя ошибка сервера" });
  });

  app.get("/api/health", async () => {
    await db.prepare("SELECT 1").get();
    return { status: "ok", env: config.env, feed: feedStatus(), time: new Date().toISOString() };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(tradingRoutes, { prefix: "/api" });
  await app.register(adminRoutes, { prefix: "/api/admin" });

  // One server-side price feed fans out to every connected client.
  app.register(async (scope) => {
    scope.get("/ws/prices", { websocket: true }, (socket) => {
      const send = () => {
        if (socket.readyState !== socket.OPEN) return;
        allPrices()
          .then((rows) => {
            if (socket.readyState !== socket.OPEN) return;
            const payload = rows.map((s: any) => ({
              symbol: s.symbol,
              price: out(asBig(s.price_scaled), 8),
              change24h: s.change_24h ?? 0,
              high24h: out(asBigOrNull(s.high_24h), 8),
              low24h: out(asBigOrNull(s.low_24h), 8),
              source: s.source,
            }));
            socket.send(JSON.stringify({ type: "prices", data: payload }));
          })
          .catch((e) => app.log.error({ err: e }, "price broadcast failed"));
      };
      send();
      const unsubscribe = onPriceUpdate(send);
      socket.on("close", () => unsubscribe());
    });
  });

  return app;
}
