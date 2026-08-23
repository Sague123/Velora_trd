import { db, tx, now, asBig, asBigOrNull } from "../db.js";
import { config } from "../config.js";
import { fillRestingOrder, closePositionRow, type OrderRow, type PositionRow } from "./execution.js";
import { shouldFill, exitReason, isLiquidated, type Side } from "./risk.js";

/**
 * The engine tick. Runs server-side on a fixed interval so resting orders,
 * stops and liquidations fire whether or not the trader has a tab open — the
 * behaviour any real exchange must have.
 */
const q = {
  restingOrders: db.prepare("SELECT * FROM orders WHERE status = 'NEW' LIMIT 500"),
  openPositions: db.prepare("SELECT * FROM positions WHERE status = 'OPEN' LIMIT 1000"),
  order: db.prepare("SELECT * FROM orders WHERE id = ?"),
  position: db.prepare("SELECT * FROM positions WHERE id = ?"),
  prices: db.prepare("SELECT symbol, price_scaled FROM price_snapshots"),
  pendingAlerts: db.prepare("SELECT * FROM alerts WHERE fired_at IS NULL LIMIT 500"),
  fireAlert: db.prepare("UPDATE alerts SET fired_at = ? WHERE id = ?"),
};

let running = false;

export async function tick() {
  if (running) return { skipped: true, filled: 0, closed: 0, liquidated: 0, alerts: 0 };
  running = true;
  const result = { skipped: false, filled: 0, closed: 0, liquidated: 0, alerts: 0 };

  try {
    const prices = new Map<string, bigint>(
      ((await q.prices.all()) as any[]).map((r) => [r.symbol, asBig(r.price_scaled)])
    );
    if (!prices.size) return result;

    // 1. Resting orders
    for (const order of (await q.restingOrders.all()) as OrderRow[]) {
      const mark = prices.get(order.symbol);
      if (mark === undefined) continue;
      if (!shouldFill(order.type as "LIMIT" | "STOP", order.side as Side, asBig(order.price_scaled), mark)) continue;
      try {
        await tx(async () => {
          // Re-read inside the transaction: the order may have been cancelled.
          const fresh = (await q.order.get(order.id)) as OrderRow | undefined;
          if (!fresh || fresh.status !== "NEW") return;
          await fillRestingOrder(fresh);
          result.filled++;
        });
      } catch (e) {
        console.error("[engine] fill failed", order.id, e);
      }
    }

    // 2. Open positions — liquidation takes priority over TP/SL
    for (const pos of (await q.openPositions.all()) as PositionRow[]) {
      const mark = prices.get(pos.symbol);
      if (mark === undefined) continue;
      const side = pos.side as Side;
      const liq = asBigOrNull(pos.liq_scaled);

      let reason: "LIQUIDATION" | "TAKE_PROFIT" | "STOP_LOSS" | null = null;
      if (isLiquidated(side, liq, mark)) reason = "LIQUIDATION";
      else reason = exitReason(side, mark, asBigOrNull(pos.tp_scaled), asBigOrNull(pos.sl_scaled));
      if (!reason) continue;

      try {
        await tx(async () => {
          const fresh = (await q.position.get(pos.id)) as PositionRow | undefined;
          if (!fresh || fresh.status !== "OPEN") return;
          const exitAt = reason === "LIQUIDATION" ? (asBigOrNull(fresh.liq_scaled) ?? mark) : mark;
          await closePositionRow(fresh, exitAt, reason!);
          if (reason === "LIQUIDATION") result.liquidated++;
          else result.closed++;
        });
      } catch (e) {
        console.error("[engine] close failed", pos.id, e);
      }
    }

    // 3. Price alerts
    for (const alert of (await q.pendingAlerts.all()) as any[]) {
      const mark = prices.get(alert.symbol);
      if (mark === undefined) continue;
      const target = asBig(alert.price_scaled);
      const hit = alert.direction === "ABOVE" ? mark >= target : mark <= target;
      if (!hit) continue;
      await q.fireAlert.run(now(), alert.id);
      result.alerts++;
    }
  } finally {
    running = false;
  }

  return result;
}

export function startEngine() {
  const id = setInterval(() => {
    tick().catch((e) => console.error("[engine] tick error", e));
  }, config.engineTickMs);
  return () => clearInterval(id);
}
