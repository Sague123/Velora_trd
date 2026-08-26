import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, newId, now, asNum, asBool } from "../db.js";
import { out } from "../lib/money.js";
import { audit } from "../lib/ledger.js";
import { badRequest, conflict, notFound } from "../lib/errors.js";
import { maxSafeLeverage } from "../engine/risk.js";
import {
  botLog, botLogs, stopBot, emptyState, estimatedCapital,
  type BotRow, type BotType,
} from "../engine/strategy.js";

/**
 * CRUD for trading bots. These routes only ever describe *intent* — create a
 * bot, start it, stop it, delete it. The trading itself belongs to
 * engine/strategy.ts, which steps every RUNNING bot on the server's own
 * interval; nothing here places an order, and nothing here depends on a
 * browser staying open.
 */

const decimal = z.string().regex(/^\d+(\.\d{1,8})?$/, "Ожидается положительное десятичное число");

// A ceiling on how many bots one account can own at once. Each RUNNING bot is
// work the server does every tick on that account's behalf, forever.
const MAX_BOTS_PER_USER = 20;

const gridConfig = z.object({
  lower: decimal,
  upper: decimal,
  levels: z.number().int().min(2).max(50),
  qtyPerLevel: decimal,
  leverage: z.number().int().min(1).max(125).default(1),
});

const martingaleConfig = z.object({
  side: z.enum(["BUY", "SELL"]),
  baseQty: decimal,
  // Below 1 the "martingale" shrinks instead of doubling; above 5 the step
  // sizes explode past anything a demo balance could ever cover.
  multiplier: z.number().min(1.1).max(5),
  maxSteps: z.number().int().min(1).max(10),
  takeProfitPct: z.number().min(0.1).max(500),
  addOnDrawdownPct: z.number().min(0.1).max(100),
  leverage: z.number().int().min(1).max(125).default(1),
});

const createBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("GRID"), symbol: z.string().min(1), config: gridConfig }),
  z.object({ type: z.literal("MARTINGALE"), symbol: z.string().min(1), config: martingaleConfig }),
]);

const q = {
  list: db.prepare("SELECT * FROM bots WHERE user_id = ? ORDER BY created_at DESC"),
  countForUser: db.prepare("SELECT COUNT(*) AS n FROM bots WHERE user_id = ?"),
  mine: db.prepare("SELECT * FROM bots WHERE id = ? AND user_id = ?"),
  instrument: db.prepare(`
    SELECT i.*, p.price_scaled FROM instruments i
    LEFT JOIN price_snapshots p ON p.symbol = i.symbol WHERE i.symbol = ?
  `),
  insert: db.prepare(`
    INSERT INTO bots (id, user_id, type, symbol, config, state, status, created_at, updated_at)
    VALUES (@id, @userId, @type, @symbol, @config, @state, 'STOPPED', @ts, @ts)
  `),
  setStatus: db.prepare("UPDATE bots SET status = @status, error_count = 0, last_error = NULL, updated_at = @ts WHERE id = @id"),
  remove: db.prepare("DELETE FROM bots WHERE id = ? AND user_id = ?"),
};

const sBot = (b: BotRow) => ({
  id: b.id,
  type: b.type,
  symbol: b.symbol,
  status: b.status,
  config: b.config,
  state: b.state ?? emptyState(b.type),
  errorCount: asNum(b.error_count),
  lastError: b.last_error,
  estimatedCapital: out(estimatedCapital(b.type, b.config), 2),
  createdAt: b.created_at,
  updatedAt: b.updated_at,
});

export default async function strategyRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.get("/", async (req) => ({
    bots: ((await q.list.all(req.user.sub)) as BotRow[]).map(sBot),
  }));

  app.get("/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const bot = (await q.mine.get(id, req.user.sub)) as BotRow | undefined;
    if (!bot) throw notFound("Бот не найден");
    return { bot: sBot(bot), logs: await botLogs(bot.id) };
  });

  app.post("/", async (req, reply) => {
    const body = createBody.parse(req.body);
    const symbol = body.symbol.toUpperCase();

    const ins = (await q.instrument.get(symbol)) as any;
    if (!ins || !asBool(ins.active)) throw notFound("Инструмент недоступен");

    const maxLev = asNum(ins.max_leverage);
    const safeLev = maxSafeLeverage();
    if (body.config.leverage > maxLev) {
      throw badRequest("INVALID_LEVERAGE", `Плечо для ${symbol} должно быть от 1x до ${maxLev}x`);
    }
    if (body.config.leverage > safeLev) {
      throw badRequest("UNSAFE_LEVERAGE",
        `Плечо выше ${safeLev}x приводит к мгновенной ликвидации при текущих требованиях к марже`);
    }
    if (body.type === "GRID" && !(Number(body.config.upper) > Number(body.config.lower))) {
      throw badRequest("INVALID_RANGE", "Верхняя граница диапазона должна быть выше нижней");
    }

    const count = asNum(((await q.countForUser.get(req.user.sub)) as any).n);
    if (count >= MAX_BOTS_PER_USER) {
      throw conflict("TOO_MANY_BOTS", `Больше ${MAX_BOTS_PER_USER} ботов на аккаунт создать нельзя`);
    }

    const id = newId();
    await q.insert.run({
      id, userId: req.user.sub, type: body.type, symbol,
      config: JSON.stringify(body.config),
      state: JSON.stringify(emptyState(body.type as BotType)),
      ts: now(),
    });
    await botLog(id, "Бот создан");
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "BOT_CREATED",
      meta: { id, type: body.type, symbol }, ip: req.ip });

    const bot = (await q.mine.get(id, req.user.sub)) as BotRow;
    return reply.code(201).send({ bot: sBot(bot) });
  });

  app.post("/:id/start", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const bot = (await q.mine.get(id, req.user.sub)) as BotRow | undefined;
    if (!bot) throw notFound("Бот не найден");
    if (bot.status === "RUNNING") return { bot: sBot(bot) };

    await q.setStatus.run({ id, status: "RUNNING", ts: now() });
    await botLog(id, "Бот запущен — торгует на сервере, вкладку можно закрыть");
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "BOT_STARTED", meta: { id }, ip: req.ip });
    return { bot: sBot((await q.mine.get(id, req.user.sub)) as BotRow) };
  });

  app.post("/:id/stop", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const bot = (await q.mine.get(id, req.user.sub)) as BotRow | undefined;
    if (!bot) throw notFound("Бот не найден");

    await stopBot(bot, "Бот остановлен пользователем");
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "BOT_STOPPED", meta: { id }, ip: req.ip });
    return { bot: sBot((await q.mine.get(id, req.user.sub)) as BotRow) };
  });

  app.delete("/:id", async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const bot = (await q.mine.get(id, req.user.sub)) as BotRow | undefined;
    if (!bot) throw notFound("Бот не найден");

    // Deleting must never orphan resting orders with margin held against them,
    // so the bot is always unwound first — whatever state it was left in.
    await stopBot(bot, "Бот удалён");
    // Martingale positions outlive their bot on purpose (stopBot never closes
    // them — see there). Reporting the count back lets the UI say so instead of
    // leaving the trader to discover the positions later.
    const openPositions = bot.type === "MARTINGALE"
      ? ((bot.state ?? {}) as { positionIds?: string[] }).positionIds?.length ?? 0
      : 0;
    await q.remove.run(id, req.user.sub);
    await audit({ actorId: req.user.sub, targetUserId: req.user.sub, action: "BOT_DELETED", meta: { id, openPositions }, ip: req.ip });
    return { ok: true, openPositions };
  });
}
