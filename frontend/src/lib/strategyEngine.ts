import { apiDelete, apiGet, apiPost, ApiError } from "./api";
import { usePriceStore } from "../store/prices";
import { useStrategiesStore, type Bot, type GridBot, type MartingaleBot } from "../store/strategies";
import type { Order, Position } from "./types";
import { toast } from "../store/toast";

const MAX_ERRORS = 3;

function markPrice(symbol: string): number | null {
  const tick = usePriceStore.getState().ticks[symbol];
  return tick ? Number(tick.price) : null;
}

function fail(bot: Bot, message: string) {
  const s = useStrategiesStore.getState();
  s.log(bot.id, `⚠ ${message}`);
  const errorCount = bot.errorCount + 1;
  if (errorCount >= MAX_ERRORS) {
    s.patch(bot.id, { errorCount, status: "ERROR" });
    s.log(bot.id, `Бот остановлен после ${MAX_ERRORS} ошибок подряд`);
    toast.error(`Strategy stopped: ${bot.symbol}`, message);
  } else {
    s.patch(bot.id, { errorCount });
  }
}

/** GRID: seeds a ladder of resting LIMIT orders around the current price on
 * first run; on every tick, any tracked order that has left NEW status is
 * treated as filled and re-armed one step further out (buy low -> sell the
 * next level up, sell high -> buy the next level down). Real orders, real
 * fills, via the existing /api/orders endpoint — nothing here is simulated. */
async function stepGrid(bot: GridBot) {
  const s = useStrategiesStore.getState();

  if (bot.gridOrders.length === 0) {
    const price = markPrice(bot.symbol);
    if (price === null) return fail(bot, "Нет живой цены для инициализации сетки");
    const step = (bot.upper - bot.lower) / bot.levels;
    if (step <= 0) return fail(bot, "Верхняя граница должна быть больше нижней");

    const orders: GridBot["gridOrders"] = [];
    for (let i = 0; i <= bot.levels; i++) {
      const levelPrice = bot.lower + step * i;
      const side: "BUY" | "SELL" = levelPrice < price ? "BUY" : "SELL";
      if (Math.abs(levelPrice - price) < step * 0.1) continue; // skip the level right at market
      try {
        const res = await apiPost<{ order: Order }>("/api/orders", {
          symbol: bot.symbol, side, type: "LIMIT", qty: String(bot.qtyPerLevel),
          price: levelPrice.toFixed(8), leverage: bot.leverage,
        });
        orders.push({ orderId: res.order.id, level: i, side, price: levelPrice });
      } catch (e) {
        s.log(bot.id, `Не удалось выставить ${side} @ ${levelPrice.toFixed(4)}: ${e instanceof ApiError ? e.message : "error"}`);
      }
    }
    s.patch(bot.id, { gridOrders: orders });
    s.log(bot.id, `Сетка выставлена: ${orders.length} ордеров между ${bot.lower} и ${bot.upper}`);
    return;
  }

  const openOrders = await apiGet<{ orders: Order[] }>("/api/orders?status=NEW");
  const openIds = new Set(openOrders.orders.map((o) => o.id));
  const step = (bot.upper - bot.lower) / bot.levels;
  const remaining: GridBot["gridOrders"] = [];
  const toAdd: GridBot["gridOrders"] = [];

  for (const tracked of bot.gridOrders) {
    if (openIds.has(tracked.orderId)) {
      remaining.push(tracked);
      continue;
    }
    // no longer resting -> treat as filled, re-arm one level further out
    const nextLevel = tracked.side === "BUY" ? tracked.level + 1 : tracked.level - 1;
    const nextSide: "BUY" | "SELL" = tracked.side === "BUY" ? "SELL" : "BUY";
    const nextPrice = bot.lower + step * nextLevel;
    if (nextLevel < 0 || nextLevel > bot.levels) {
      s.log(bot.id, `${tracked.side} @ ${tracked.price.toFixed(4)} исполнен — сетка достигла края диапазона`);
      continue;
    }
    try {
      const res = await apiPost<{ order: Order }>("/api/orders", {
        symbol: bot.symbol, side: nextSide, type: "LIMIT", qty: String(bot.qtyPerLevel),
        price: nextPrice.toFixed(8), leverage: bot.leverage,
      });
      toAdd.push({ orderId: res.order.id, level: nextLevel, side: nextSide, price: nextPrice });
      s.log(bot.id, `${tracked.side} @ ${tracked.price.toFixed(4)} исполнен → выставлен ${nextSide} @ ${nextPrice.toFixed(4)}`);
    } catch (e) {
      s.log(bot.id, `Не удалось переставить ордер после исполнения: ${e instanceof ApiError ? e.message : "error"}`);
    }
  }
  s.patch(bot.id, { gridOrders: [...remaining, ...toAdd], errorCount: 0 });
}

async function cancelGridOrders(bot: GridBot) {
  for (const o of bot.gridOrders) {
    try { await apiDelete(`/api/orders/${o.orderId}`); } catch { /* may already be filled/cancelled */ }
  }
  useStrategiesStore.getState().patch(bot.id, { gridOrders: [] });
}

/** MARTINGALE: each "step" is its own real position (the backend does not
 * merge fills into one averaged position), so the bot tracks a group of
 * position ids for this symbol/side and manages them together — closing the
 * whole group on take-profit, or adding the next multiplied step on
 * drawdown. */
async function stepMartingale(bot: MartingaleBot) {
  const s = useStrategiesStore.getState();

  if (bot.positionIds.length === 0) {
    try {
      const res = await apiPost<{ order: Order; position: Position | null }>("/api/orders", {
        symbol: bot.symbol, side: bot.side, type: "MARKET", qty: String(bot.baseQty), leverage: bot.leverage,
      });
      if (res.position) {
        s.patch(bot.id, { positionIds: [res.position.id], step: 1, errorCount: 0 });
        s.log(bot.id, `Открыта стартовая позиция ${bot.side} ${bot.baseQty}`);
      }
    } catch (e) {
      fail(bot, e instanceof ApiError ? e.message : "Не удалось открыть стартовую позицию");
    }
    return;
  }

  const { positions } = await apiGet<{ positions: Position[] }>("/api/positions");
  const tracked = positions.filter((p) => bot.positionIds.includes(p.id));
  if (tracked.length === 0) {
    // all closed externally (manual close, liquidation, TP/SL) — reset the group
    s.patch(bot.id, { positionIds: [], step: 0 });
    s.log(bot.id, "Все позиции группы закрыты (вручную или по TP/SL) — цикл сброшен");
    return;
  }

  const totalMargin = tracked.reduce((sum, p) => sum + Number(p.margin), 0);
  const totalPnl = tracked.reduce((sum, p) => sum + Number(p.unrealisedPnl), 0);
  const roe = totalMargin > 0 ? (totalPnl / totalMargin) * 100 : 0;

  if (roe >= bot.takeProfitPct) {
    for (const p of tracked) {
      try { await apiPost(`/api/positions/${p.id}/close`); } catch { /* best effort */ }
    }
    s.patch(bot.id, { positionIds: [], step: 0, errorCount: 0 });
    s.log(bot.id, `Take-profit ${roe.toFixed(1)}% ROE — группа из ${tracked.length} позиций закрыта`);
    return;
  }

  if (roe <= -bot.addOnDrawdownPct && bot.step < bot.maxSteps) {
    const qty = bot.baseQty * Math.pow(bot.multiplier, bot.step);
    try {
      const res = await apiPost<{ order: Order; position: Position | null }>("/api/orders", {
        symbol: bot.symbol, side: bot.side, type: "MARKET", qty: qty.toFixed(8), leverage: bot.leverage,
      });
      if (res.position) {
        s.patch(bot.id, { positionIds: [...bot.positionIds, res.position.id], step: bot.step + 1, errorCount: 0 });
        s.log(bot.id, `Просадка ${roe.toFixed(1)}% ROE — добавлен шаг ${bot.step + 1} (${qty.toFixed(6)})`);
      }
    } catch (e) {
      fail(bot, e instanceof ApiError ? e.message : "Не удалось добавить шаг мартингейла");
    }
  }
}

export async function stopBot(bot: Bot) {
  const s = useStrategiesStore.getState();
  if (bot.type === "GRID") await cancelGridOrders(bot as GridBot);
  s.setStatus(bot.id, "STOPPED");
  s.log(bot.id, "Бот остановлен пользователем");
}

export async function runEngineTick() {
  const bots = Object.values(useStrategiesStore.getState().bots).filter((b) => b.status === "RUNNING");
  for (const bot of bots) {
    try {
      if (bot.type === "GRID") await stepGrid(bot);
      else await stepMartingale(bot);
    } catch (e) {
      fail(bot, e instanceof ApiError ? e.message : "Внутренняя ошибка тика стратегии");
    }
  }
}
