/**
 * End-to-end smoke test against a running API.
 * Run the server first (npm run dev), then: npm run smoke
 *
 * One run registers two accounts, which is under /register's rate limit of 5
 * per 10 minutes per IP — but two runs back to back are not. The limiter keeps
 * its counters in memory, so restarting the server resets them; that is the
 * intended way to re-run this locally, rather than loosening a production rate
 * limit for the convenience of a test.
 */
import { generate } from "otplib";

const BASE = process.env.BASE ?? "http://localhost:4000";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`, detail !== undefined ? JSON.stringify(detail) : "");
  }
}

async function api(
  path: string,
  opts: { method?: string; body?: unknown; token?: string } = {}
) {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: res.status, body: json };
}

const num = (s: string | null | undefined) => Number(s ?? 0);
const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) < eps;

async function main() {
  console.log(`\nVelora smoke test → ${BASE}\n`);

  /* ---------------------------- infrastructure ---------------------------- */
  console.log("health & market data");
  const health = await api("/api/health");
  check("health responds", health.status === 200, health.body);

  check("health reports feed state", typeof health.body?.feed?.healthy === "boolean", health.body?.feed);
  check("health reports how long the feed has been down",
    typeof health.body?.feed?.unhealthyForMs === "number", health.body?.feed);

  const instruments = await api("/api/instruments");
  check("instruments listed", instruments.body?.instruments?.length > 0);
  const btc = instruments.body.instruments.find((i: any) => i.symbol === "BTCUSDT");
  check("BTCUSDT has a price", !!btc?.price, btc);
  check("instrument exposes data source", !!btc?.source);
  // A symbol is halted when its quote goes stale; the rest of this run assumes
  // BTCUSDT is tradeable, so surface that as its own check rather than letting
  // a stale-feed environment fail ten confusing checks further down.
  check("BTCUSDT is tradeable (quote is fresh)", btc?.tradeable === true, { updatedAt: btc?.updatedAt });

  const candles = await api("/api/instruments/BTCUSDT/candles?tf=1H");
  check("candles returned", candles.body?.candles?.length > 0);
  check("candles flag real vs synthetic", typeof candles.body?.real === "boolean");

  /* -------------------------------- auth ---------------------------------- */
  console.log("\nauthentication");
  const email = `test_${Date.now()}@velora.local`;
  const weak = await api("/api/auth/register", { method: "POST", body: { email, password: "short" } });
  check("weak password rejected", weak.status === 400, weak.body?.error);

  const reg = await api("/api/auth/register", {
    method: "POST",
    body: { email, password: "StrongPass2026", name: "Smoke Tester" },
  });
  check("registration succeeds", reg.status === 201, reg.body);
  const token: string = reg.body?.accessToken;
  check("access token issued", typeof token === "string" && token.length > 20);

  const dup = await api("/api/auth/register", { method: "POST", body: { email, password: "StrongPass2026" } });
  check("duplicate email rejected", dup.status === 409, dup.body?.error);

  const noAuth = await api("/api/account");
  check("protected route needs a token", noAuth.status === 401);

  const badLogin = await api("/api/auth/login", { method: "POST", body: { email, password: "WrongPass2026" } });
  check("wrong password rejected", badLogin.status === 401);

  const me = await api("/api/auth/me", { token });
  check("me returns the profile", me.body?.email === email, me.body);
  check("starting balance credited", near(num(me.body?.balance), 10000), me.body?.balance);

  /* ------------------------------- trading -------------------------------- */
  console.log("\ntrading — market order");
  const acct0 = await api("/api/account", { token });
  const cash0 = num(acct0.body.cash);

  const badQty = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", side: "BUY", type: "MARKET", qty: "-1" },
  });
  check("negative quantity rejected", badQty.status === 400, badQty.body?.error);

  const overLev = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", side: "BUY", type: "MARKET", qty: "0.01", leverage: 50 },
  });
  check("leverage above instrument cap rejected", overLev.status === 400, overLev.body?.error);

  const tooBig = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", side: "BUY", type: "MARKET", qty: "100" },
  });
  check("order beyond balance rejected", tooBig.status === 409, tooBig.body?.error);

  const acctAfterFail = await api("/api/account", { token });
  check("failed orders leave the balance untouched", near(num(acctAfterFail.body.cash), cash0),
    { before: cash0, after: acctAfterFail.body.cash });

  const buy = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", side: "BUY", type: "MARKET", qty: "0.05" },
  });
  check("market buy accepted", buy.status === 201, buy.body);
  check("position opened immediately", !!buy.body?.position?.id);
  const positionId = buy.body?.position?.id;

  const acct1 = await api("/api/account", { token });
  check("margin moved out of free cash", num(acct1.body.cash) < cash0);
  check("used margin recorded", num(acct1.body.usedMargin) > 0, acct1.body.usedMargin);
  check("equity stays near the starting value",
    Math.abs(num(acct1.body.equity) - 10000) < 200, acct1.body.equity);

  const positions = await api("/api/positions", { token });
  check("position listed", positions.body?.positions?.length === 1);
  const pos = positions.body.positions[0];
  check("position reports mark price", !!pos?.markPrice);
  check("position reports ROE", typeof pos?.roePct === "number");
  check("spot position has no liquidation price", pos?.liquidationPrice === null);

  console.log("\ntrading — leverage & liquidation price");
  const perp = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTC-PERP", side: "BUY", type: "MARKET", qty: "0.02", leverage: 20 },
  });
  check("leveraged perp order accepted", perp.status === 201, perp.body);
  check("liquidation price computed", !!perp.body?.position?.liquidationPrice);
  const entry = num(perp.body?.position?.entryPrice);
  const liq = num(perp.body?.position?.liquidationPrice);
  check("liquidation sits below a long entry", liq > 0 && liq < entry, { entry, liq });

  console.log("\ntrading — resting orders");
  const price = num(btc.price);
  const limit = await api("/api/orders", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", side: "BUY", type: "LIMIT", qty: "0.01", price: (price * 0.5).toFixed(2) },
  });
  check("limit order accepted", limit.status === 201, limit.body);
  check("limit order rests as NEW", limit.body?.order?.status === "NEW");

  const openOrders = await api("/api/orders?status=NEW", { token });
  check("open order listed", openOrders.body?.orders?.length === 1);

  const acctBeforeCancel = await api("/api/account", { token });
  const cancel = await api(`/api/orders/${limit.body.order.id}`, { token, method: "DELETE" });
  check("order cancelled", cancel.body?.order?.status === "CANCELLED", cancel.body);
  const acctAfterCancel = await api("/api/account", { token });
  check("cancelling releases the held margin",
    num(acctAfterCancel.body.cash) > num(acctBeforeCancel.body.cash));

  console.log("\ntrading — closing");
  const close = await api(`/api/positions/${positionId}/close`, { token, method: "POST" });
  check("position closed", !!close.body?.trade?.id, close.body);
  check("trade records a PnL", close.body?.trade?.pnl !== undefined);

  const trades = await api("/api/trades", { token });
  check("trade appears in history", trades.body?.trades?.length >= 1);

  const ledger = await api("/api/ledger", { token });
  check("ledger journals every movement", ledger.body?.entries?.length >= 5, ledger.body?.entries?.length);
  const types = new Set(ledger.body.entries.map((e: any) => e.type));
  check("ledger contains MARGIN_HOLD", types.has("MARGIN_HOLD"));
  check("ledger contains PNL", types.has("PNL"));
  check("ledger contains FEE", types.has("FEE"));

  const last = ledger.body.entries[0];
  const acctFinal = await api("/api/account", { token });
  check("ledger balance matches the account", near(num(last.balanceAfter), num(acctFinal.body.cash)),
    { ledger: last.balanceAfter, account: acctFinal.body.cash });

  /* -------------------------------- alerts -------------------------------- */
  console.log("\nalerts");
  const alert = await api("/api/alerts", {
    token, method: "POST",
    body: { symbol: "BTCUSDT", direction: "ABOVE", price: (price * 1.5).toFixed(2) },
  });
  check("alert created", alert.status === 201, alert.body);
  const alerts = await api("/api/alerts", { token });
  check("alert listed and pending", alerts.body?.alerts?.[0]?.firedAt === null);

  /* --------------------- authentication — 2FA and recovery ----------------- */
  console.log("\nauthentication — 2FA, verification, recovery");

  const mfaEmail = `smoke-mfa-${Date.now()}@velora.test`;
  const mfaReg = await api("/api/auth/register", {
    method: "POST", body: { email: mfaEmail, password: "SmokeTest12345", name: "MFA" },
  });
  check("new account starts unverified", mfaReg.body?.user?.emailVerified === false, mfaReg.body?.user);
  check("new account starts without 2FA", mfaReg.body?.user?.totpEnabled === false);
  const mfaToken0 = mfaReg.body?.accessToken as string;

  const setup = await api("/api/auth/2fa/setup", { token: mfaToken0, method: "POST" });
  check("2fa setup returns a secret", typeof setup.body?.secret === "string" && setup.body.secret.length >= 16);
  check("2fa setup returns a scannable QR", String(setup.body?.qr ?? "").startsWith("data:image/png;base64,"));
  const secret = setup.body.secret as string;

  const enableBad = await api("/api/auth/2fa/enable", { token: mfaToken0, method: "POST", body: { code: "000000" } });
  check("2fa rejects a wrong enrolment code", enableBad.status === 400, enableBad.body?.error);

  const stillOff = await api("/api/auth/me", { token: mfaToken0 });
  check("a failed enrolment leaves 2fa off", stillOff.body?.totpEnabled === false);

  const enable = await api("/api/auth/2fa/enable", {
    token: mfaToken0, method: "POST", body: { code: await generate({ secret }) },
  });
  check("2fa enabled with a real code", enable.status === 200, enable.body?.error);
  check("backup codes issued once", Array.isArray(enable.body?.backupCodes) && enable.body.backupCodes.length === 10,
    enable.body?.backupCodes?.length);
  const backupCode = enable.body.backupCodes[0] as string;

  const step1 = await api("/api/auth/login", { method: "POST", body: { email: mfaEmail, password: "SmokeTest12345" } });
  check("password alone no longer logs in", step1.body?.mfaRequired === true && !step1.body?.accessToken, step1.body);
  const challenge = step1.body.mfaToken as string;

  // The critical one: the challenge token is signed with the same key as an
  // access token, so if it were accepted as one, 2FA would be decorative.
  const challengeAsAccess = await api("/api/auth/me", { token: challenge });
  check("the 2fa challenge token is not an access token", challengeAsAccess.status === 401, challengeAsAccess.status);

  const wrongCode = await api("/api/auth/login/2fa", { method: "POST", body: { mfaToken: challenge, code: "000000" } });
  check("wrong second factor rejected", wrongCode.status === 401, wrongCode.body?.error);

  const step2 = await api("/api/auth/login/2fa", {
    method: "POST", body: { mfaToken: challenge, code: await generate({ secret }) },
  });
  check("correct second factor completes login", !!step2.body?.accessToken, step2.body?.error);

  // Backup codes: usable exactly once, because a code that works twice is a
  // password, not a backup code.
  const viaBackup1 = await api("/api/auth/login", { method: "POST", body: { email: mfaEmail, password: "SmokeTest12345" } });
  const usedBackup = await api("/api/auth/login/2fa", {
    method: "POST", body: { mfaToken: viaBackup1.body.mfaToken, code: backupCode },
  });
  check("a backup code completes login", !!usedBackup.body?.accessToken, usedBackup.body?.error);
  const viaBackup2 = await api("/api/auth/login", { method: "POST", body: { email: mfaEmail, password: "SmokeTest12345" } });
  const reusedBackup = await api("/api/auth/login/2fa", {
    method: "POST", body: { mfaToken: viaBackup2.body.mfaToken, code: backupCode },
  });
  check("the same backup code cannot be used twice", reusedBackup.status === 401, reusedBackup.status);

  const mfaToken = usedBackup.body.accessToken as string;
  const disableNoCode = await api("/api/auth/2fa/disable", {
    token: mfaToken, method: "POST", body: { password: "SmokeTest12345", code: "000000" },
  });
  check("disabling 2fa needs a real second factor", disableNoCode.status === 400, disableNoCode.body?.error);
  const disableWrongPw = await api("/api/auth/2fa/disable", {
    token: mfaToken, method: "POST", body: { password: "not-the-password", code: await generate({ secret }) },
  });
  check("disabling 2fa needs the password too", disableWrongPw.status === 400, disableWrongPw.body?.error);

  const badVerify = await api("/api/auth/verify-email", { method: "POST", body: { token: "not-a-real-token" } });
  check("a bogus verification link is refused", badVerify.status === 400, badVerify.body?.error);

  // Both answers must be identical — anything else turns this into a public
  // oracle for which email addresses hold funds here.
  const forgotKnown = await api("/api/auth/forgot-password", { method: "POST", body: { email: mfaEmail } });
  const forgotUnknown = await api("/api/auth/forgot-password", { method: "POST", body: { email: "nobody@velora.test" } });
  check("password reset does not reveal whether an account exists",
    forgotKnown.status === forgotUnknown.status &&
    JSON.stringify(forgotKnown.body) === JSON.stringify(forgotUnknown.body),
    { known: forgotKnown.body, unknown: forgotUnknown.body });

  const badReset = await api("/api/auth/reset-password", {
    method: "POST", body: { token: "not-a-real-token", newPassword: "AnotherPass123" },
  });
  check("a bogus reset link is refused", badReset.status === 400, badReset.body?.error);

  /* ------------------------------ strategies ------------------------------ */
  // The bot engine runs on the server (engine/strategy.ts), so it is testable
  // the same way everything else here is: create a bot over HTTP, wait for a
  // tick, and look at what actually landed on the book.
  console.log("\nstrategies (server-side bot engine)");

  const badRange = await api("/api/strategies", {
    token, method: "POST",
    body: {
      type: "GRID", symbol: "BTCUSDT",
      config: { lower: "60000", upper: "50000", levels: 4, qtyPerLevel: "0.001", leverage: 1 },
    },
  });
  check("inverted grid range rejected", badRange.status === 400, badRange.body?.error);

  const grid = await api("/api/strategies", {
    token, method: "POST",
    body: {
      type: "GRID", symbol: "BTCUSDT",
      config: {
        lower: (price * 0.9).toFixed(2), upper: (price * 1.1).toFixed(2),
        levels: 6, qtyPerLevel: "0.001", leverage: 1,
      },
    },
  });
  check("grid bot created", grid.status === 201, grid.body);
  check("new bot starts stopped", grid.body?.bot?.status === "STOPPED", grid.body?.bot?.status);
  const botId = grid.body?.bot?.id;

  const ordersBeforeStart = await api("/api/orders?status=NEW", { token });
  const restingBefore = ordersBeforeStart.body?.orders?.length ?? 0;

  const started = await api(`/api/strategies/${botId}/start`, { token, method: "POST" });
  check("bot started", started.body?.bot?.status === "RUNNING", started.body);

  // One strategy tick is 5s; give the engine two so a slow CI runner still sees it.
  await new Promise((r) => setTimeout(r, 11_000));

  const botAfterTick = await api(`/api/strategies/${botId}`, { token });
  const rungs = botAfterTick.body?.bot?.state?.gridOrders ?? [];
  check("engine armed the grid without a browser", rungs.length > 0, botAfterTick.body?.bot);
  check("grid brackets the market", rungs.some((g: any) => g.side === "BUY") && rungs.some((g: any) => g.side === "SELL"),
    rungs.map((g: any) => g.side));
  check("bot journal written", (botAfterTick.body?.logs?.length ?? 0) > 0);
  check("bot reports no errors", botAfterTick.body?.bot?.errorCount === 0, botAfterTick.body?.bot?.lastError);

  const ordersAfterStart = await api("/api/orders?status=NEW", { token });
  check("grid rungs are real resting orders",
    (ordersAfterStart.body?.orders?.length ?? 0) === restingBefore + rungs.length,
    { before: restingBefore, after: ordersAfterStart.body?.orders?.length, rungs: rungs.length });

  const stopped = await api(`/api/strategies/${botId}/stop`, { token, method: "POST" });
  check("bot stopped", stopped.body?.bot?.status === "STOPPED", stopped.body);
  const ordersAfterStop = await api("/api/orders?status=NEW", { token });
  check("stopping releases every rung it was holding",
    (ordersAfterStop.body?.orders?.length ?? 0) === restingBefore,
    ordersAfterStop.body?.orders?.length);

  const otherUsersBot = await api(`/api/strategies/${botId}`, {});
  check("bots require authentication", otherUsersBot.status === 401, otherUsersBot.status);

  const deleted = await api(`/api/strategies/${botId}`, { token, method: "DELETE" });
  check("bot deleted", deleted.body?.ok === true, deleted.body);
  const gone = await api(`/api/strategies/${botId}`, { token });
  check("deleted bot is gone", gone.status === 404, gone.status);

  /* --------------------------------- admin -------------------------------- */
  console.log("\nadmin");
  const asUser = await api("/api/admin/users", { token });
  check("regular user blocked from admin", asUser.status === 403, asUser.body?.error);

  const adminLogin = await api("/api/auth/login", {
    method: "POST", body: { email: "admin@velora.local", password: "AdminPass2026" },
  });
  check("admin logs in", adminLogin.status === 200, adminLogin.body);
  const adminToken: string = adminLogin.body?.accessToken;

  const stats = await api("/api/admin/stats", { token: adminToken });
  check("admin stats available", typeof stats.body?.users === "number", stats.body);

  const users = await api("/api/admin/users?search=test_", { token: adminToken });
  check("admin can search users", users.body?.users?.length >= 1);
  const target = users.body.users.find((u: any) => u.email === email);
  check("target user found", !!target);

  const detail = await api(`/api/admin/users/${target.id}`, { token: adminToken });
  check("admin sees the user's account", !!detail.body?.account?.equity, detail.body?.account);
  check("admin sees the user's ledger", detail.body?.ledger?.length > 0);

  const balBefore = num(detail.body.account.cash);
  const adj = await api(`/api/admin/users/${target.id}/balance`, {
    token: adminToken, method: "POST",
    body: { amount: "2500", note: "Смоук-тест: пополнение" },
  });
  check("admin credits balance", near(num(adj.body?.balance), balBefore + 2500),
    { before: balBefore, after: adj.body?.balance });

  const debit = await api(`/api/admin/users/${target.id}/balance`, {
    token: adminToken, method: "POST", body: { amount: "-500" },
  });
  check("admin debits balance", near(num(debit.body?.balance), balBefore + 2000), debit.body);

  const suspend = await api(`/api/admin/users/${target.id}`, {
    token: adminToken, method: "PATCH", body: { status: "SUSPENDED" },
  });
  check("admin suspends the user", suspend.body?.user?.status === "SUSPENDED", suspend.body);

  const blocked = await api("/api/account", { token });
  check("suspended user loses access immediately", blocked.status === 403, blocked.body?.error);

  await api(`/api/admin/users/${target.id}`, {
    token: adminToken, method: "PATCH", body: { status: "ACTIVE" },
  });
  const restored = await api("/api/account", { token });
  check("reactivated user regains access", restored.status === 200);

  const selfDemote = await api(`/api/admin/users/${adminLogin.body.user.id}`, {
    token: adminToken, method: "PATCH", body: { role: "USER" },
  });
  check("admin cannot demote themselves", selfDemote.status === 403, selfDemote.body?.error);

  const auditLog = await api("/api/admin/audit?action=BALANCE_ADJUSTED", { token: adminToken });
  check("balance changes are audited", auditLog.body?.entries?.length >= 2, auditLog.body?.total);
  check("audit names the actor", auditLog.body?.entries?.[0]?.actor === "admin@velora.local",
    auditLog.body?.entries?.[0]);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke run crashed:", e);
  process.exit(1);
});
