import { db, now, tx, asBig, asNum } from "../db.js";
import { config } from "../config.js";
import { SCALE, toScaled } from "../lib/money.js";
import { postLedger } from "../lib/ledger.js";
import { captureError } from "../lib/monitoring.js";

/**
 * Interest accrual — the same shape as matching.ts and strategy.ts: a
 * server-side interval, one guarded pass, every money movement going through
 * postLedger() so the journal stays the single source of truth.
 *
 * Two decisions worth stating, because both look arbitrary until they aren't:
 *
 * Interest is paid **daily, for whole elapsed days**, driven off each account's
 * own `last_accrual_at` rather than off the tick that happens to be running.
 * That makes the payout a function of time, not of uptime: a server that was
 * down for two days pays two days on its next tick instead of silently
 * skipping them, and a tick that runs twice cannot pay twice.
 *
 * Interest is credited to the **trading balance**, not compounded into the
 * principal — the same way a real flexible-savings product pays out to a spot
 * wallet. It keeps one journal authoritative for the cash balance, and it means
 * a locked plan's payouts are spendable while the principal is still locked.
 */

export interface SavingsPlan {
  type: string;
  label: string;
  /** Annual percentage rate, e.g. 6 = 6%/year, paid in daily slices. */
  apy: number;
  /** Days the principal cannot be withdrawn for. 0 = withdraw any time. */
  lockDays: number;
  description: string;
}

/**
 * Locked plans pay more because the platform can count on the liquidity for a
 * known period — which is the entire economic argument for the lock, and the
 * reason the rate ladder is shaped this way rather than picked to look good.
 */
export const SAVINGS_PLANS: SavingsPlan[] = [
  {
    type: "FLEXIBLE", label: "Гибкий", apy: 4, lockDays: 0,
    description: "Снять можно в любой момент. Проценты начисляются каждый день на основной баланс.",
  },
  {
    type: "LOCKED_30", label: "30 дней", apy: 6, lockDays: 30,
    description: "Средства заблокированы на 30 дней. Проценты приходят на основной баланс ежедневно.",
  },
  {
    type: "LOCKED_90", label: "90 дней", apy: 8, lockDays: 90,
    description: "Максимальная ставка за самый долгий срок. Досрочное снятие недоступно.",
  },
];

export const planByType = (type: string): SavingsPlan | undefined =>
  SAVINGS_PLANS.find((p) => p.type === type);

const DAY_MS = 86_400_000;

const q = {
  accruable: db.prepare(`
    SELECT * FROM savings_accounts
    WHERE status = 'ACTIVE' AND balance_scaled > 0 AND last_accrual_at <= ?
    ORDER BY last_accrual_at
    LIMIT 1000
  `),
  byId: db.prepare("SELECT * FROM savings_accounts WHERE id = ?"),
  markAccrued: db.prepare("UPDATE savings_accounts SET last_accrual_at = ?, updated_at = ? WHERE id = ?"),
};

export interface SavingsRow {
  id: string; user_id: string; plan_type: string;
  balance_scaled: bigint; apy: number;
  locked_until: string | null; status: string;
  last_accrual_at: string; created_at: string; updated_at: string;
}

/** One day's interest on a balance, as a scaled integer. Truncation is toward
 * zero, so the platform never pays out a fraction of a unit it didn't owe. */
export function dailyInterest(balanceScaled: bigint, apy: number): bigint {
  if (balanceScaled <= 0n || apy <= 0) return 0n;
  // balance x apy / (100 x 365), done as one integer division rather than by
  // first rounding a daily rate to eight places. Rounding the rate first loses
  // ~0.002% of every payment — invisible per day, and a real shortfall across
  // a year and every account on the platform.
  return (balanceScaled * toScaled(apy)) / (SCALE * 36_500n);
}

let running = false;

export async function accrualTick() {
  if (running) return { skipped: true, accounts: 0, days: 0 };
  running = true;
  const result = { skipped: false, accounts: 0, days: 0 };

  try {
    const cutoff = new Date(Date.now() - DAY_MS).toISOString();
    for (const acc of (await q.accruable.all(cutoff)) as SavingsRow[]) {
      const since = new Date(acc.last_accrual_at).getTime();
      if (!Number.isFinite(since)) continue;
      const days = Math.floor((Date.now() - since) / DAY_MS);
      if (days < 1) continue;

      const balance = asBig(acc.balance_scaled);
      const interest = dailyInterest(balance, asNum(acc.apy)) * BigInt(days);
      // Advance by exactly the days paid — never to "now" — so the fraction of
      // a day not yet earned is still owed at the next pass.
      const nextAccrual = new Date(since + days * DAY_MS).toISOString();

      try {
        await tx(async () => {
          // Re-read inside the transaction: the account may have been closed or
          // drained between the scan and here.
          const fresh = (await q.byId.get(acc.id)) as SavingsRow | undefined;
          if (!fresh || fresh.status !== "ACTIVE") return;
          if (fresh.last_accrual_at !== acc.last_accrual_at) return; // another pass got there first

          if (interest > 0n) {
            await postLedger({
              userId: acc.user_id, type: "SAVINGS_INTEREST", amountScaled: interest,
              refType: "SAVINGS", refId: acc.id,
              note: `Проценты по накопительному счёту (${acc.plan_type}), дней: ${days}`,
            });
          }
          await q.markAccrued.run(nextAccrual, now(), acc.id);
          result.accounts++;
          result.days += days;
        });
      } catch (e) {
        captureError(e, { scope: "engine.savings", userId: acc.user_id, extra: { accountId: acc.id, days } });
      }
    }
  } finally {
    running = false;
  }

  return result;
}

export function startSavingsEngine() {
  const id = setInterval(() => {
    accrualTick().catch((e) => captureError(e, { scope: "engine.savings.tick" }));
  }, config.savingsTickMs);
  return () => clearInterval(id);
}
