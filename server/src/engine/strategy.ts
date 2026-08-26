import { db, newId, now, asBig, asNum } from "../db.js";
import { config } from "../config.js";
import { toScaled, out, div, mul, abs } from "../lib/money.js";
import { AppError } from "../lib/errors.js";
import { placeOrder, cancelOrder, closePositionById, type OrderRow, type PositionRow } from "./execution.js";
import { pnlFor, notional, type Side } from "./risk.js";
import { captureError } from "../lib/monitoring.js";

/**
 * The strategy engine. GRID and MARTINGALE bots used to be driven from the
 * browser (frontend/src/lib/strategyEngine.ts): a bot only traded while its
 * tab was open, a reload could re-arm it without warning, and a laptop lid
 * closing mid-cycle left a half-built grid resting on the book with margin
 * held against it. All of that was a property of *where the loop ran*, not of
 * the strategies themselves.
 *
 * So the loop moved here, next to matching.ts, and follows the same shape: a
 * fixed server-side interval, one guarded pass per tick, every mutation going
 * through the same execution.ts entry points a human trader's request goes
 * through — in-process function calls, never HTTP requests the server makes
 * to itself. A bot now keeps trading with the tab closed, the browser shut and
 * the laptop asleep, which is the only behaviour a scheduled strategy can
 * honestly claim to have.
 */

export type BotType = "GRID" | "MARTINGALE";
export type BotStatus = "RUNNING" | "STOPPED" | "ERROR";

/** Ladder rung the engine is currently holding on the book. */
export interface GridOrderRef {
  orderId: string;
  level: number;
  side: Side;
  /** decimal string — the exact price the rung was armed at */
  price: string;
}

export interface GridConfig {
  lower: string;
  upper: string;
  levels: number;
  qtyPerLevel: string;
  leverage: number;
}

export interface MartingaleConfig {
  side: Side;
  baseQty: string;
  multiplier: number;
  maxSteps: number;
  takeProfitPct: number;
  addOnDrawdownPct: number;
  leverage: number;
}

export interface GridState { gridOrders: GridOrderRef[] }
export interface MartingaleState { positionIds: string[]; step: number }

export interface BotRow {
  id: string;
  user_id: string;
  type: BotType;
  symbol: string;
  config: any;
  state: any;
  status: BotStatus;
  error_count: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

const q = {
  runnable: db.prepare(`
    SELECT b.* FROM bots b
    JOIN users u ON u.id = b.user_id
    WHERE b.status = 'RUNNING' AND u.status = 'ACTIVE'
    ORDER BY b.created_at
    LIMIT 500
  `),
  byId: db.prepare("SELECT * FROM bots WHERE id = ?"),
  setState: db.prepare("UPDATE bots SET state = @state, updated_at = @ts WHERE id = @id"),
  setOk: db.prepare("UPDATE bots SET state = @state, error_count = 0, last_error = NULL, updated_at = @ts WHERE id = @id"),
  setError: db.prepare("UPDATE bots SET error_count = @count, last_error = @error, status = @status, updated_at = @ts WHERE id = @id"),
  setStatus: db.prepare("UPDATE bots SET status = @status, updated_at = @ts WHERE id = @id"),
  prices: db.prepare("SELECT symbol, price_scaled FROM price_snapshots"),
  ordersByIds: db.prepare("SELECT * FROM orders WHERE id = ANY(?)"),
  positionsByIds: db.prepare("SELECT * FROM positions WHERE id = ANY(?) AND status = 'OPEN'"),
  insLog: db.prepare("INSERT INTO bot_logs (id, bot_id, ts, message) VALUES (@id, @botId, @ts, @message)"),
  pruneLog: db.prepare(`
    DELETE FROM bot_logs WHERE bot_id = @botId AND ts < (
      SELECT ts FROM bot_logs WHERE bot_id = @botId ORDER BY ts DESC, id DESC LIMIT 1 OFFSET @cap
    )
  `),
  logs: db.prepare("SELECT ts, message FROM bot_logs WHERE bot_id = ? ORDER BY ts DESC, id DESC LIMIT ?"),
};

/** Appends one line to a bot's journal and trims the journal back to its cap. */
export async function botLog(botId: string, message: string): Promise<void> {
  await q.insLog.run({ id: newId(), botId, ts: now(), message });
  await q.pruneLog.run({ botId, cap: config.botLogCap });
}

export const botLogs = (botId: string, limit = config.botLogCap) => q.logs.all(botId, limit);

/* --------------------------------- GRID ---------------------------------- */

/**
 * Seeds a ladder of resting LIMIT orders around the current price on the first
 * step; on every step after that, any rung that filled is re-armed one level
 * further out (a filled buy becomes a sell one level up, a filled sell becomes
 * a buy one level down) — which is the whole of grid trading. Real orders on
 * the real book, through the same placeOrder() a manual trade uses.
 */
async function stepGrid(bot: BotRow, mark: bigint): Promise<GridState> {
  const cfg = bot.config as GridConfig;
  const state = (bot.state ?? {}) as GridState;
  const tracked = state.gridOrders ?? [];

  const lower = toScaled(cfg.lower);
  const upper = toScaled(cfg.upper);
  const qty = toScaled(cfg.qtyPerLevel);
  const step = (upper - lower) / BigInt(cfg.levels);
  const levelPrice = (i: number) => lower + step * BigInt(i);

  if (tracked.length === 0) {
    const armed: GridOrderRef[] = [];
    for (let i = 0; i <= cfg.levels; i++) {
      const price = levelPrice(i);
      // A rung sitting essentially at the market would fill instantly and turn
      // the grid into a market order, so it is left out of the initial ladder.
      if (abs(price - mark) < step / 10n) continue;
      const side: Side = price < mark ? "BUY" : "SELL";
      try {
        const { order } = await placeOrder({
          userId: bot.user_id, symbol: bot.symbol, side, type: "LIMIT",
          qtyScaled: qty, priceScaled: price, leverage: cfg.leverage,
        });
        armed.push({ orderId: order.id, level: i, side, price: out(price)! });
      } catch (e) {
        // One rung failing (say, margin ran out halfway up the ladder) must not
        // discard the rungs already on the book.
        await botLog(bot.id, `Не удалось выставить ${side} @ ${out(price, 4)}: ${describe(e)}`);
      }
    }
    if (armed.length === 0) throw new AppError(409, "GRID_EMPTY", "Не удалось выставить ни одного ордера сетки");
    await botLog(bot.id, `Сетка выставлена: ${armed.length} ордеров между ${cfg.lower} и ${cfg.upper}`);
    return { gridOrders: armed };
  }

  const rows = (await q.ordersByIds.all(tracked.map((g) => g.orderId))) as OrderRow[];
  const byId = new Map(rows.map((o) => [o.id, o]));
  const remaining: GridOrderRef[] = [];

  for (const rung of tracked) {
    const order = byId.get(rung.orderId);
    if (!order) continue;                       // deleted out from under us
    if (order.status === "NEW") { remaining.push(rung); continue; }
    if (order.status === "CANCELLED") {
      // Cancelled by hand (or by an admin) — the trader overrode the bot, so
      // the rung is dropped rather than silently re-armed against their wish.
      await botLog(bot.id, `${rung.side} @ ${Number(rung.price).toFixed(4)} отменён вручную — уровень снят с сетки`);
      continue;
    }

    const nextLevel = rung.side === "BUY" ? rung.level + 1 : rung.level - 1;
    const nextSide: Side = rung.side === "BUY" ? "SELL" : "BUY";
    if (nextLevel < 0 || nextLevel > cfg.levels) {
      await botLog(bot.id, `${rung.side} @ ${Number(rung.price).toFixed(4)} исполнен — сетка достигла края диапазона`);
      continue;
    }
    const price = levelPrice(nextLevel);
    try {
      const { order: placed } = await placeOrder({
        userId: bot.user_id, symbol: bot.symbol, side: nextSide, type: "LIMIT",
        qtyScaled: toScaled(cfg.qtyPerLevel), priceScaled: price, leverage: cfg.leverage,
      });
      remaining.push({ orderId: placed.id, level: nextLevel, side: nextSide, price: out(price)! });
      await botLog(bot.id, `${rung.side} @ ${Number(rung.price).toFixed(4)} исполнен → выставлен ${nextSide} @ ${out(price, 4)}`);
    } catch (e) {
      await botLog(bot.id, `Не удалось переставить ордер после исполнения: ${describe(e)}`);
    }
  }

  if (remaining.length === 0) {
    await botLog(bot.id, "Все уровни сетки отработали — бот остановлен");
    await q.setStatus.run({ id: bot.id, status: "STOPPED", ts: now() });
  }
  return { gridOrders: remaining };
}

/** Releases everything a grid bot is holding on the book. */
async function unwindGrid(bot: BotRow): Promise<void> {
  const state = (bot.state ?? {}) as GridState;
  for (const rung of state.gridOrders ?? []) {
    // Already filled or already cancelled is the normal case, not a failure.
    try { await cancelOrder(bot.user_id, rung.orderId); } catch { /* nothing to release */ }
  }
}

/* ------------------------------ MARTINGALE ------------------------------- */

/**
 * Each step is its own real position — the platform does not merge fills into
 * one averaged position — so the bot tracks the group of position ids it owns
 * and manages them together: close the whole group once the group's ROE hits
 * take-profit, add the next multiplied step once it hits the drawdown trigger.
 */
async function stepMartingale(bot: BotRow, mark: bigint): Promise<MartingaleState> {
  const cfg = bot.config as MartingaleConfig;
  const state = (bot.state ?? {}) as MartingaleState;
  const ids = state.positionIds ?? [];

  if (ids.length === 0) {
    const { position } = await placeOrder({
      userId: bot.user_id, symbol: bot.symbol, side: cfg.side, type: "MARKET",
      qtyScaled: toScaled(cfg.baseQty), priceScaled: 0n, leverage: cfg.leverage,
    });
    if (!position) throw new AppError(409, "NO_POSITION", "Стартовая позиция не открылась");
    await botLog(bot.id, `Открыта стартовая позиция ${cfg.side} ${cfg.baseQty}`);
    return { positionIds: [position.id], step: 1 };
  }

  const open = (await q.positionsByIds.all(ids)) as PositionRow[];
  if (open.length === 0) {
    await botLog(bot.id, "Все позиции группы закрыты (вручную, по TP/SL или ликвидацией) — цикл сброшен");
    return { positionIds: [], step: 0 };
  }

  let margin = 0n;
  let pnl = 0n;
  for (const p of open) {
    margin += asBig(p.margin_scaled);
    pnl += pnlFor(p.side as Side, asBig(p.qty_scaled), asBig(p.entry_scaled), mark);
  }
  // ROE on the group as a whole: the later steps only make sense measured
  // against the averaged entry the whole group represents.
  const roePct = margin === 0n ? 0 : Number(out(mul(div(pnl, margin), toScaled("100")), 2));

  if (roePct >= cfg.takeProfitPct) {
    for (const p of open) {
      try { await closePositionById(bot.user_id, p.id, "MANUAL"); } catch { /* raced with TP/SL */ }
    }
    await botLog(bot.id, `Take-profit ${roePct.toFixed(1)}% ROE — группа из ${open.length} позиций закрыта`);
    return { positionIds: [], step: 0 };
  }

  if (roePct <= -cfg.addOnDrawdownPct && state.step < cfg.maxSteps) {
    const qty = mul(toScaled(cfg.baseQty), toScaled(Math.pow(cfg.multiplier, state.step)));
    const { position } = await placeOrder({
      userId: bot.user_id, symbol: bot.symbol, side: cfg.side, type: "MARKET",
      qtyScaled: qty, priceScaled: 0n, leverage: cfg.leverage,
    });
    if (!position) throw new AppError(409, "NO_POSITION", "Шаг мартингейла не открылся");
    await botLog(bot.id, `Просадка ${roePct.toFixed(1)}% ROE — добавлен шаг ${state.step + 1} (${out(qty, 8)})`);
    return { positionIds: [...ids, position.id], step: state.step + 1 };
  }

  // Positions closed elsewhere drop out of the group so the next step is sized
  // against what the bot actually still owns.
  return { positionIds: open.map((p) => p.id), step: state.step };
}

/* -------------------------------- the tick -------------------------------- */

const describe = (e: unknown) =>
  e instanceof AppError ? e.message : e instanceof Error ? e.message : "неизвестная ошибка";

/** Bots already told "no quote" — so an upstream outage logs once, not forever. */
const stalled = new Set<string>();

let running = false;

export async function strategyTick() {
  if (running) return { skipped: true, stepped: 0, failed: 0 };
  running = true;
  const result = { skipped: false, stepped: 0, failed: 0 };

  try {
    const prices = new Map<string, bigint>(
      ((await q.prices.all()) as any[]).map((r) => [r.symbol, asBig(r.price_scaled)])
    );

    for (const bot of (await q.runnable.all()) as BotRow[]) {
      const mark = prices.get(bot.symbol);
      if (mark === undefined || mark <= 0n) {
        // A missing quote is an upstream problem, not the bot's fault: it waits
        // rather than burning through its error budget and parking itself.
        if (!stalled.has(bot.id)) {
          stalled.add(bot.id);
          await botLog(bot.id, `Нет котировки по ${bot.symbol} — бот ждёт восстановления фида`);
        }
        continue;
      }
      if (stalled.delete(bot.id)) await botLog(bot.id, "Котировка восстановлена — бот продолжает работу");

      try {
        const state = bot.type === "GRID"
          ? await stepGrid(bot, mark)
          : await stepMartingale(bot, mark);
        await q.setOk.run({ id: bot.id, state: JSON.stringify(state), ts: now() });
        result.stepped++;
      } catch (e) {
        result.failed++;
        const count = asNum(bot.error_count) + 1;
        const limit = config.botMaxConsecutiveErrors;
        const status: BotStatus = count >= limit ? "ERROR" : "RUNNING";
        await q.setError.run({ id: bot.id, count, error: describe(e), status, ts: now() });
        await botLog(bot.id, `⚠ ${describe(e)}`);
        if (status === "ERROR") {
          await botLog(bot.id, `Бот остановлен после ${limit} ошибок подряд`);
          captureError(e, { scope: "engine.strategy.bot", userId: bot.user_id, extra: { botId: bot.id, type: bot.type, symbol: bot.symbol } });
          // Whatever it was holding on the book is released — an ERROR bot that
          // left margin locked behind resting orders would be the worst of both.
          const fresh = (await q.byId.get(bot.id)) as BotRow | undefined;
          if (fresh && fresh.type === "GRID") await unwindGrid(fresh);
        }
      }
    }
  } finally {
    running = false;
  }

  return result;
}

/**
 * Stops a bot and releases what it holds. Grid rungs are cancelled (their
 * margin goes back); martingale positions are deliberately left open — they
 * are the trader's money in a live market, and closing them unasked would be a
 * far bigger surprise than leaving them to be closed by hand.
 */
export async function stopBot(bot: BotRow, note = "Бот остановлен"): Promise<void> {
  if (bot.type === "GRID") await unwindGrid(bot);
  await q.setStatus.run({ id: bot.id, status: "STOPPED", ts: now() });
  await q.setState.run({ id: bot.id, state: JSON.stringify(emptyState(bot.type)), ts: now() });
  stalled.delete(bot.id);
  const open = bot.type === "MARTINGALE" ? ((bot.state ?? {}) as MartingaleState).positionIds?.length ?? 0 : 0;
  await botLog(bot.id, open > 0
    ? `${note}. Открытых позиций осталось: ${open} — закройте их вручную, если нужно.`
    : note);
}

export const emptyState = (type: BotType): GridState | MartingaleState =>
  type === "GRID" ? { gridOrders: [] } : { positionIds: [], step: 0 };

/** Notional a bot could commit if every configured leg were open at once. */
export function estimatedCapital(type: BotType, cfg: any): bigint {
  if (type === "GRID") {
    const c = cfg as GridConfig;
    const mid = (toScaled(c.lower) + toScaled(c.upper)) / 2n;
    return (notional(toScaled(c.qtyPerLevel), mid) / BigInt(Math.max(1, c.leverage))) * BigInt(c.levels + 1);
  }
  const c = cfg as MartingaleConfig;
  let qty = 0n;
  for (let i = 0; i < c.maxSteps; i++) qty += mul(toScaled(c.baseQty), toScaled(Math.pow(c.multiplier, i)));
  return qty;
}

export function startStrategyEngine() {
  const id = setInterval(() => {
    strategyTick().catch((e) => captureError(e, { scope: "engine.strategy.tick" }));
  }, config.strategyTickMs);
  return () => clearInterval(id);
}
