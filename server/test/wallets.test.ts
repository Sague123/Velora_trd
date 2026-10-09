import test from "node:test";
import assert from "node:assert/strict";
import { db, tx, newId, now, migrate, closeDb, asBig } from "../src/db.js";
import { postLedger, chargeFee, refundFee } from "../src/lib/ledger.js";
import { toScaled, toDecimalString } from "../src/lib/money.js";

/**
 * The two-wallet money model, against a real database.
 *
 * Everything here needs transactions, row locks and a CHECK constraint, none
 * of which can be faked — a mock would assert that the code calls the methods
 * it calls, which is not the question. The question is whether a bonus can
 * end up backing margin, whether a fee can take more than it should, whether
 * two concurrent debits can both spend the same dollar, and whether a
 * rejected order leaves anything behind. Those are properties of Postgres
 * plus this code, so they are tested together.
 *
 * CI already runs a Postgres service for the smoke suite (.github/
 * workflows/ci.yml); this uses the same DATABASE_URL.
 */

const $ = (s: string) => toScaled(s);
const show = (v: bigint) => toDecimalString(v, 2);

await migrate();

/**
 * A throwaway account, so no test can be affected by another's leftovers.
 *
 * Opened empty and funded through the journal rather than by writing the
 * balance straight into the row -- which is how a real account gets money now
 * (see routes/auth.ts), and what keeps assertJournalMatches meaningful: a
 * fixture that seeded the balance behind the journal's back would make every
 * balance in this file start out already disagreeing with it.
 */
async function makeAccount(real: string, bonus = "0"): Promise<string> {
  const id = newId();
  const ts = now();
  await db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at)
    VALUES (?, ?, 'x', 'Wallet Test', 'USER', 'ACTIVE', ?, ?)
  `).run(id, `wallet-${id}@velora.test`, ts, ts);
  await db.prepare(
    "INSERT INTO accounts (user_id, cash_scaled, bonus_scaled, updated_at) VALUES (?, 0, 0, ?)"
  ).run(id, ts);

  if ($(real) > 0n) {
    await tx(() => postLedger({ userId: id, type: "DEPOSIT", amountScaled: $(real) }));
  }
  if ($(bonus) > 0n) {
    await tx(() => postLedger({ userId: id, wallet: "bonus", type: "BONUS_GRANT", amountScaled: $(bonus) }));
  }
  return id;
}

async function wallets(userId: string): Promise<{ real: bigint; bonus: bigint }> {
  const row = (await db.prepare(
    "SELECT cash_scaled, bonus_scaled FROM accounts WHERE user_id = ?"
  ).get(userId)) as { cash_scaled: bigint; bonus_scaled: bigint };
  return { real: asBig(row.cash_scaled), bonus: asBig(row.bonus_scaled) };
}

/** The invariant the whole design rests on: a wallet's balance is the sum of
 * its own journal rows and nothing else. */
async function assertJournalMatches(userId: string): Promise<void> {
  const rows = (await db.prepare(`
    SELECT wallet, COALESCE(SUM(amount_scaled), 0) AS total
    FROM ledger_entries WHERE user_id = ? GROUP BY wallet
  `).all(userId)) as { wallet: string; total: bigint }[];
  const summed = { real: 0n, bonus: 0n };
  for (const r of rows) summed[r.wallet as "real" | "bonus"] = asBig(r.total);

  const held = await wallets(userId);
  assert.equal(show(summed.real), show(held.real), "real wallet drifted from its journal");
  assert.equal(show(summed.bonus), show(held.bonus), "bonus wallet drifted from its journal");
}

test("a bonus large enough covers the whole fee and real money is untouched", async () => {
  const user = await makeAccount("100", "50");
  const split = await tx(() => chargeFee({ userId: user, amountScaled: $("20"), refType: "ORDER", refId: "o1" }));

  assert.equal(show(split.fromBonus), "20.00");
  assert.equal(show(split.fromReal), "0.00");
  const w = await wallets(user);
  assert.equal(show(w.real), "100.00", "real must not be touched while bonus covers the fee");
  assert.equal(show(w.bonus), "30.00");
  await assertJournalMatches(user);
});

test("a partial bonus pays what it can and the remainder comes from real", async () => {
  const user = await makeAccount("100", "5");
  const split = await tx(() => chargeFee({ userId: user, amountScaled: $("20"), refType: "ORDER", refId: "o1" }));

  assert.equal(show(split.fromBonus), "5.00");
  assert.equal(show(split.fromReal), "15.00");
  const w = await wallets(user);
  assert.equal(show(w.real), "85.00");
  assert.equal(show(w.bonus), "0.00", "bonus is spent down to zero, never past it");
  await assertJournalMatches(user);
});

test("a fee real cannot cover is refused, and leaves nothing behind", async () => {
  const user = await makeAccount("10", "5");

  // The whole point: the margin hold and the fee are one transaction, so the
  // refusal has to take the hold back out with it. A rejected order that left
  // the margin posted would quietly freeze money for an order that does not
  // exist.
  await assert.rejects(
    tx(async () => {
      await postLedger({ userId: user, type: "MARGIN_HOLD", amountScaled: -$("8"), refType: "ORDER", refId: "o2" });
      await chargeFee({ userId: user, amountScaled: $("20"), refType: "ORDER", refId: "o2" });
    }),
    /INSUFFICIENT_FUNDS|Недостаточно/
  );

  const w = await wallets(user);
  assert.equal(show(w.real), "10.00", "the margin hold must have rolled back with the fee");
  assert.equal(show(w.bonus), "5.00", "the bonus leg must have rolled back too");
  const rows = (await db.prepare(
    "SELECT COUNT(*) AS n FROM ledger_entries WHERE user_id = ? AND ref_id = 'o2'"
  ).get(user)) as { n: bigint };
  assert.equal(Number(rows.n), 0, "a rejected order must write no journal rows at all");
});

test("a close is never refused over its fee, and may push real negative", async () => {
  const user = await makeAccount("1", "0");
  const split = await tx(() => chargeFee({
    userId: user, amountScaled: $("5"), refType: "POSITION", refId: "p1", allowNegative: true,
  }));

  assert.equal(show(split.fromReal), "5.00");
  const w = await wallets(user);
  assert.equal(show(w.real), "-4.00", "an exit must go through even when it overdraws");
  await assertJournalMatches(user);
});

test("a close with no real money still goes through on an insufficient bonus", async () => {
  const user = await makeAccount("0", "2");
  await tx(() => chargeFee({
    userId: user, amountScaled: $("5"), refType: "POSITION", refId: "p1", allowNegative: true,
  }));

  const w = await wallets(user);
  assert.equal(show(w.bonus), "0.00");
  assert.equal(show(w.real), "-3.00");
  await assertJournalMatches(user);
});

test("bonus never goes negative, whatever it is asked to pay", async () => {
  const user = await makeAccount("100", "10");
  await tx(() => chargeFee({ userId: user, amountScaled: $("40"), refType: "ORDER", refId: "o3" }));
  assert.equal(show((await wallets(user)).bonus), "0.00");

  // And a direct attempt is refused by postLedger rather than clamped, even
  // with allowNegative — the overdraft exemption is for realised losses on
  // real money, and granted money has nothing to realise.
  await assert.rejects(
    tx(() => postLedger({
      userId: user, wallet: "bonus", type: "BONUS_REVOKE", amountScaled: -$("1"), allowNegative: true,
    })),
    /INSUFFICIENT_FUNDS|бонусных/
  );
  assert.equal(show((await wallets(user)).bonus), "0.00");
});

test("a refund goes back to the wallets that paid, in the proportions they paid", async () => {
  const user = await makeAccount("100", "5");
  await tx(() => chargeFee({ userId: user, amountScaled: $("20"), refType: "ORDER", refId: "o4" }));

  // Grant more bonus in between: a refund that recomputed the split from the
  // current balance would now hand it all back as bonus, or all as real, and
  // either way the client's withdrawable money would be wrong.
  await tx(() => postLedger({ userId: user, wallet: "bonus", type: "BONUS_GRANT", amountScaled: $("1000") }));

  const back = await tx(() => refundFee({ userId: user, refType: "ORDER", refId: "o4" }));
  assert.equal(show(back.fromBonus), "5.00");
  assert.equal(show(back.fromReal), "15.00");

  const w = await wallets(user);
  assert.equal(show(w.real), "100.00", "real must be made whole for exactly what it paid");
  assert.equal(show(w.bonus), "1005.00");
  await assertJournalMatches(user);
});

test("two concurrent debits cannot both spend the same money", async () => {
  const user = await makeAccount("100", "0");

  // Without FOR UPDATE both transactions read 100, each writes 100-60, and
  // the account ends at 40 having paid out 120. The row lock makes the second
  // wait and read 40, where it is refused.
  const results = await Promise.allSettled([
    tx(() => postLedger({ userId: user, type: "WITHDRAWAL", amountScaled: -$("60") })),
    tx(() => postLedger({ userId: user, type: "WITHDRAWAL", amountScaled: -$("60") })),
  ]);

  const ok = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(ok, 1, "exactly one of two competing withdrawals may succeed");
  assert.equal(show((await wallets(user)).real), "40.00");
  await assertJournalMatches(user);
});

test("a retried request with the same key moves the money once", async () => {
  const user = await makeAccount("100", "0");
  const key = `test-${newId()}`;

  const first = await tx(() => postLedger({ userId: user, type: "DEPOSIT", amountScaled: $("25"), idemKey: key }));
  const again = await tx(() => postLedger({ userId: user, type: "DEPOSIT", amountScaled: $("25"), idemKey: key }));

  assert.equal(show(first), "125.00");
  assert.equal(show(again), "125.00", "the retry must report the first call's result");
  assert.equal(show((await wallets(user)).real), "125.00");

  const rows = (await db.prepare(
    "SELECT COUNT(*) AS n FROM ledger_entries WHERE idem_key = ?"
  ).get(key)) as { n: bigint };
  assert.equal(Number(rows.n), 1, "one key, one row");
});

test("the smallest unit the scale can hold survives a round trip", async () => {
  const user = await makeAccount("0", "0");
  // 1e-8 is one unit of the scale: anything that rounds or floats loses it.
  await tx(() => postLedger({ userId: user, type: "DEPOSIT", amountScaled: 1n }));
  const w = await wallets(user);
  assert.equal(toDecimalString(w.real, 8), "0.00000001");

  await tx(() => postLedger({ userId: user, type: "WITHDRAWAL", amountScaled: -1n }));
  assert.equal(toDecimalString((await wallets(user)).real, 8), "0.00000000");
  await assertJournalMatches(user);
});

test("a bonus grant and a revoke leave the real wallet alone", async () => {
  const user = await makeAccount("250", "0");
  await tx(() => postLedger({ userId: user, wallet: "bonus", type: "BONUS_GRANT", amountScaled: $("75") }));
  await tx(() => postLedger({ userId: user, wallet: "bonus", type: "BONUS_REVOKE", amountScaled: -$("25") }));

  const w = await wallets(user);
  assert.equal(show(w.bonus), "50.00");
  assert.equal(show(w.real), "250.00", "a bonus movement is not a balance correction");
  await assertJournalMatches(user);
});

test("withdrawing everything real leaves the bonus untouched", async () => {
  const user = await makeAccount("80", "30");
  await tx(() => postLedger({ userId: user, type: "WITHDRAWAL", amountScaled: -$("80") }));

  const w = await wallets(user);
  assert.equal(show(w.real), "0.00");
  assert.equal(show(w.bonus), "30.00", "bonus is not withdrawable, so a cash-out cannot take it");

  // And it cannot be reached by asking the real wallet for it either.
  await assert.rejects(
    tx(() => postLedger({ userId: user, type: "WITHDRAWAL", amountScaled: -$("30") })),
    /INSUFFICIENT_FUNDS|Недостаточно/
  );
  await assertJournalMatches(user);
});

test.after(async () => { await closeDb(); });
