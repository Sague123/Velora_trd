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

  /* ------------------------- wallet & identity gating ---------------------- */
  console.log("\nwallet & KYC gating");

  const deposit = await api("/api/account/deposit", { token, method: "POST", body: { amount: "250" } });
  check("self-service deposit works without KYC", deposit.status === 201, deposit.body);

  const kyc0 = await api("/api/kyc", { token });
  check("identity starts unverified", kyc0.body?.status === "NONE", kyc0.body?.status);
  check("kyc reports whether uploads are available", typeof kyc0.body?.uploadAvailable === "boolean");

  // Money leaving the platform is the one direction that needs identity first.
  const blockedWithdraw = await api("/api/account/withdraw", { token, method: "POST", body: { amount: "10" } });
  check("withdrawal blocked before identity is verified",
    blockedWithdraw.status === 409 && blockedWithdraw.body?.error === "KYC_REQUIRED", blockedWithdraw.body);

  /* -------------------------------- savings -------------------------------- */
  console.log("\nsavings accounts");

  const savings0 = await api("/api/savings", { token });
  check("savings plans offered", (savings0.body?.plans?.length ?? 0) >= 2, savings0.body?.plans);
  check("no savings accounts yet", savings0.body?.accounts?.length === 0);

  // Opening one takes custody of money for a period, so it sits behind the same
  // identity check as a withdrawal — and this user is not verified yet.
  const openBeforeKyc = await api("/api/savings/accounts", {
    token, method: "POST", body: { planType: "FLEXIBLE", amount: "100" },
  });
  check("savings blocked before identity is verified",
    openBeforeKyc.status === 409 && openBeforeKyc.body?.error === "KYC_REQUIRED", openBeforeKyc.body);

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

  const kycQueue = await api("/api/admin/kyc?status=PENDING", { token: adminToken });
  check("admin can read the KYC review queue", Array.isArray(kycQueue.body?.submissions), kycQueue.body);
  check("KYC queue never carries document links",
    (kycQueue.body?.submissions ?? []).every((s: any) => !("documents" in s) && !("front" in s)),
    kycQueue.body?.submissions?.[0]);

  const override = await api(`/api/admin/users/${target.id}`, {
    token: adminToken, method: "PATCH", body: { kycStatus: "APPROVED" },
  });
  check("admin can record identity verified out of band", override.status === 200, override.body);
  const afterApproval = await api("/api/kyc", { token });
  check("user sees their identity approved", afterApproval.body?.status === "APPROVED", afterApproval.body?.status);

  const allowedWithdraw = await api("/api/account/withdraw", { token, method: "POST", body: { amount: "10" } });
  check("withdrawal allowed once identity is verified", allowedWithdraw.status === 200, allowedWithdraw.body);

  const overrideAudited = await api("/api/admin/audit?action=KYC_STATUS_OVERRIDDEN", { token: adminToken });
  check("an out-of-band KYC approval is audited", (overrideAudited.body?.total ?? 0) > 0, overrideAudited.body?.total);

  // Now that identity is verified (above), the savings flow is open.
  console.log("\nsavings accounts — after verification");
  const acctBeforeSavings = (await api("/api/account", { token })).body;
  const cashBefore = num(acctBeforeSavings.cash);
  const equityBefore = num(acctBeforeSavings.equity);

  const tooSmall = await api("/api/savings/accounts", {
    token, method: "POST", body: { planType: "FLEXIBLE", amount: "1" },
  });
  check("a savings account too small to earn anything is refused", tooSmall.status === 400, tooSmall.body?.error);

  const opened = await api("/api/savings/accounts", {
    token, method: "POST", body: { planType: "FLEXIBLE", amount: "100" },
  });
  check("flexible savings account opened", opened.status === 201, opened.body);
  check("principal recorded", near(num(opened.body?.account?.balance), 100), opened.body?.account?.balance);
  check("account quotes what a day pays", num(opened.body?.account?.dailyInterest) > 0, opened.body?.account);
  const savingsId = opened.body.account.id;

  const acctWithSavings = await api("/api/account", { token });
  check("opening savings moves money out of free cash",
    near(num(acctWithSavings.body.cash), cashBefore - 100), { before: cashBefore, after: acctWithSavings.body.cash });
  check("savings shown on the account", near(num(acctWithSavings.body.savings), 100), acctWithSavings.body.savings);
  // Saving money must not make the trader's net worth appear to drop.
  check("equity is unchanged by saving", near(num(acctWithSavings.body.equity), equityBefore, 0.05),
    { before: equityBefore, after: acctWithSavings.body.equity });

  const locked = await api("/api/savings/accounts", {
    token, method: "POST", body: { planType: "LOCKED_90", amount: "50" },
  });
  check("locked plan carries a maturity date", !!locked.body?.account?.lockedUntil, locked.body?.account);
  check("locked plan reports itself locked", locked.body?.account?.locked === true);
  const earlyExit = await api(`/api/savings/accounts/${locked.body.account.id}/withdraw`, {
    token, method: "POST", body: { amount: "10" },
  });
  check("locked funds cannot be withdrawn early",
    earlyExit.status === 409 && earlyExit.body?.error === "PLAN_LOCKED", earlyExit.body);
  const topUpLocked = await api(`/api/savings/accounts/${locked.body.account.id}/deposit`, {
    token, method: "POST", body: { amount: "10" },
  });
  check("a locked plan cannot be topped up", topUpLocked.status === 409, topUpLocked.body?.error);

  const overWithdraw = await api(`/api/savings/accounts/${savingsId}/withdraw`, {
    token, method: "POST", body: { amount: "1000" },
  });
  check("cannot withdraw more than the principal", overWithdraw.status === 409, overWithdraw.body?.error);

  const partial = await api(`/api/savings/accounts/${savingsId}/withdraw`, {
    token, method: "POST", body: { amount: "40" },
  });
  check("partial withdrawal leaves the account open",
    partial.body?.closed === false && near(num(partial.body?.account?.balance), 60), partial.body?.account);

  const closed = await api(`/api/savings/accounts/${savingsId}/withdraw`, { token, method: "POST", body: {} });
  check("withdrawing everything closes the account", closed.body?.closed === true, closed.body);

  const cashAfter = num((await api("/api/account", { token })).body.cash);
  check("every unit put into savings comes back out", near(cashAfter, cashBefore - 50),
    { before: cashBefore, after: cashAfter });

  const savingsHistory = await api("/api/savings/history", { token });
  check("savings movements are journalled",
    (savingsHistory.body?.entries?.length ?? 0) >= 4, savingsHistory.body?.entries?.length);
  check("savings journal uses its own ledger types",
    (savingsHistory.body?.entries ?? []).every((e: any) => e.type.startsWith("SAVINGS_")),
    savingsHistory.body?.entries?.map((e: any) => e.type));

  /* ---------------------------------- CRM --------------------------------- */
  console.log("\nCRM — lead pipeline");

  // The sales desk is a separate role: it must reach the CRM and nothing else,
  // and a regular trader must not reach it at all.
  const crmAsTrader = await api("/api/crm/leads", { token });
  check("a regular user cannot reach the CRM", crmAsTrader.status === 403, crmAsTrader.body?.error);
  const crmAnon = await api("/api/crm/leads", {});
  check("the CRM requires authentication", crmAnon.status === 401, crmAnon.status);

  const managerEmail = `smoke-manager-${Date.now()}@velora.test`;
  const managerReg = await api("/api/auth/register", {
    method: "POST", body: { email: managerEmail, password: "SmokeManager123", name: "Smoke Manager" },
  });
  const managerId = managerReg.body?.user?.id as string;
  let managerToken = managerReg.body?.accessToken as string;

  const beforePromotion = await api("/api/crm/leads", { token: managerToken });
  check("a fresh account has no CRM access", beforePromotion.status === 403, beforePromotion.status);

  const promote = await api(`/api/admin/users/${managerId}`, {
    token: adminToken, method: "PATCH", body: { role: "MANAGER" },
  });
  check("admin can grant the MANAGER role", promote.body?.user?.role === "MANAGER", promote.body);

  // The role is read from the database on every request, not from the token,
  // so the promotion takes effect without re-issuing one.
  const afterPromotion = await api("/api/crm/leads", { token: managerToken });
  check("the MANAGER role takes effect on the existing session", afterPromotion.status === 200, afterPromotion.status);

  const adminOnCrm = await api("/api/crm/leads", { token: adminToken });
  check("admins reach the CRM too", adminOnCrm.status === 200, adminOnCrm.status);
  const managerOnAdmin = await api("/api/admin/stats", { token: managerToken });
  check("a manager cannot reach the admin console", managerOnAdmin.status === 403, managerOnAdmin.status);

  const meta = await api("/api/crm/meta", { token: managerToken });
  check("CRM publishes its funnel stages", (meta.body?.statuses ?? []).includes("WELCOME_CALL"), meta.body?.statuses);
  check("verification statuses are a separate list",
    (meta.body?.verificationStatuses ?? []).length === 4, meta.body?.verificationStatuses);

  const noContact = await api("/api/crm/leads/import", {
    token: managerToken, method: "POST", body: { fullName: "No Contact" },
  });
  check("a lead with no phone and no email is refused", noContact.status === 400, noContact.body?.error);

  const phone = `+7900${Date.now() % 10_000_000}`;
  const leadEmail = `smoke-lead-${Date.now()}@velora.test`;
  const imported = await api("/api/crm/leads/import", {
    token: managerToken, method: "POST",
    body: { fullName: "Ivan Petrov", phone, email: leadEmail, country: "RU", source: "smoke-affiliate" },
  });
  check("lead imported", imported.status === 201, imported.body);
  check("a new lead starts at NEW / NOT_SUBMITTED",
    imported.body?.lead?.status === "NEW" && imported.body?.lead?.verificationStatus === "NOT_SUBMITTED",
    imported.body?.lead);
  const leadId = imported.body.lead.id as string;

  const duplicate = await api("/api/crm/leads/import", {
    token: managerToken, method: "POST", body: { fullName: "Ivan P", phone },
  });
  check("the same phone cannot create a second card", duplicate.status === 400, duplicate.body?.error);

  // A lead whose email already belongs to a platform account links to it on
  // import, so the desk sees the real balance instead of a blank card.
  const linked = await api("/api/crm/leads/import", {
    token: managerToken, method: "POST",
    body: { fullName: "Existing Trader", email, country: "PL", source: "smoke-affiliate" },
  });
  check("an already-registered lead links to their account", !!linked.body?.lead?.platform?.userId, linked.body?.lead);
  check("the card reads the live platform balance", !!linked.body?.lead?.platform?.balance, linked.body?.lead?.platform);

  const badStatus = await api(`/api/crm/leads/${leadId}/status`, {
    token: managerToken, method: "PATCH", body: { status: "NOT_A_STAGE" },
  });
  check("an unknown funnel stage is refused", badStatus.status === 400, badStatus.body?.error);

  const moved = await api(`/api/crm/leads/${leadId}/status`, {
    token: managerToken, method: "PATCH", body: { status: "CALLBACK" },
  });
  check("status changed", moved.body?.lead?.status === "CALLBACK", moved.body);

  const verified = await api(`/api/crm/leads/${leadId}/verification`, {
    token: managerToken, method: "PATCH", body: { verificationStatus: "PENDING" },
  });
  check("verification is tracked separately from the funnel stage",
    verified.body?.lead?.verificationStatus === "PENDING" && verified.body?.lead?.status === "CALLBACK",
    verified.body?.lead);

  const assigned = await api(`/api/crm/leads/${leadId}/assign`, {
    token: managerToken, method: "PATCH", body: { managerId },
  });
  check("lead assigned to a manager", assigned.body?.lead?.assignedManager?.id === managerId, assigned.body?.lead);
  const assignToTrader = await api(`/api/crm/leads/${leadId}/assign`, {
    token: managerToken, method: "PATCH", body: { managerId: target.id },
  });
  check("a lead cannot be assigned to a non-manager", assignToTrader.status === 400, assignToTrader.body?.error);

  const comment = await api(`/api/crm/leads/${leadId}/comments`, {
    token: managerToken, method: "POST", body: { text: "Дозвонился, перезвонить вечером" },
  });
  check("comment added", comment.status === 201, comment.body);
  check("a comment names its author", comment.body?.comment?.manager?.id === managerId, comment.body?.comment);
  const emptyComment = await api(`/api/crm/leads/${leadId}/comments`, {
    token: managerToken, method: "POST", body: { text: "   " },
  });
  check("an empty comment is refused", emptyComment.status === 400, emptyComment.body?.error);
  const commentList = await api(`/api/crm/leads/${leadId}/comments`, { token: managerToken });
  check("comments listed", (commentList.body?.comments ?? []).length === 1, commentList.body?.comments?.length);

  // Every transition is logged, including the lead's very first status —
  // otherwise the timeline starts blank for a lead nobody has touched yet.
  const card = await api(`/api/crm/leads/${leadId}`, { token: managerToken });
  const transitions = (card.body?.history ?? []).map((h: any) => `${h.kind}:${h.oldStatus}>${h.newStatus}`);
  check("status change is journalled", transitions.includes("STATUS:NEW>CALLBACK"), transitions);
  check("verification change shares the same timeline",
    transitions.includes("VERIFICATION:NOT_SUBMITTED>PENDING"), transitions);
  check("the lead's creation is the first transition", transitions.includes("STATUS:null>NEW"), transitions);

  const byStatus = await api("/api/crm/leads?status=CALLBACK", { token: managerToken });
  check("filter by status", (byStatus.body?.leads ?? []).some((l: any) => l.id === leadId), byStatus.body?.total);
  const byManager = await api(`/api/crm/leads?managerId=${managerId}`, { token: managerToken });
  check("filter by assigned manager", (byManager.body?.leads ?? []).some((l: any) => l.id === leadId), byManager.body?.total);
  const byPhone = await api(`/api/crm/leads?search=${encodeURIComponent(phone.slice(-6))}`, { token: managerToken });
  check("search by phone fragment", (byPhone.body?.leads ?? []).some((l: any) => l.id === leadId), byPhone.body?.total);
  const byName = await api("/api/crm/leads?search=IVAN%20PETROV", { token: managerToken });
  check("search by name is case-insensitive", (byName.body?.leads ?? []).some((l: any) => l.id === leadId), byName.body?.total);
  const noMatch = await api("/api/crm/leads?search=zzz-nothing-matches-zzz", { token: managerToken });
  check("a search with no matches returns an empty page", noMatch.body?.total === 0, noMatch.body?.total);

  const paged = await api("/api/crm/leads?page=1&pageSize=1", { token: managerToken });
  check("pagination caps the page", (paged.body?.leads ?? []).length === 1 && paged.body?.total >= 2, paged.body?.total);

  const missing = await api("/api/crm/leads/does-not-exist", { token: managerToken });
  check("an unknown lead is a 404", missing.status === 404, missing.status);

  /* ------------------- CRM v2: edit, permissions, conversion ---------------- */
  console.log("\nCRM v2 — card editing, permissions, account actions, conversion");

  // The manager from the section above starts with no CRM permissions at all.
  const metaBefore = await api("/api/crm/meta", { token: managerToken });
  check("a manager starts with no extra CRM permissions", (metaBefore.body?.myPermissions ?? []).length === 0,
    metaBefore.body?.myPermissions);

  const cardEmail = `smoke-card-${Date.now()}@velora.test`;
  const cardPhone = `+7901${Date.now() % 10_000_000}`;
  const cardLead = await api("/api/crm/leads/import", {
    token: managerToken, method: "POST", body: { fullName: "Edit Me", phone: cardPhone },
  });
  const cardLeadId = cardLead.body.lead.id as string;

  const badEdit = await api(`/api/crm/leads/${cardLeadId}`, {
    token: managerToken, method: "PATCH", body: { phone: null, email: null },
  });
  check("clearing both contact fields is refused", badEdit.status === 400, badEdit.body?.error);

  // Before the card has an email at all — this is the one point in the run
  // where a "no email" conversion attempt is actually testing that rule and
  // not accidentally succeeding on a lead that already has one.
  const noEmailConvert = await api(`/api/crm/leads/${cardLeadId}/convert`, { token: managerToken, method: "POST" });
  check("conversion without an email on the card is refused", noEmailConvert.status === 400, noEmailConvert.body?.error);

  const edited = await api(`/api/crm/leads/${cardLeadId}`, {
    token: managerToken, method: "PATCH", body: { email: cardEmail, country: "DE", source: "smoke-edit" },
  });
  check("card fields edited", edited.body?.lead?.email === cardEmail && edited.body?.lead?.country === "DE",
    edited.body?.lead);

  const dupEdit = await api(`/api/crm/leads/${cardLeadId}`, {
    token: managerToken, method: "PATCH", body: { phone },
  });
  check("editing into another lead's phone is refused", dupEdit.status === 400, dupEdit.body?.error);

  // Every gated action refuses a manager with no permissions — checked before
  // conversion even exists, so a 403 here can only be the permission gate.
  const noPermBalance = await api(`/api/crm/leads/${cardLeadId}/account/balance`, {
    token: managerToken, method: "POST", body: { amount: "10" },
  });
  check("balance adjustment refused without MANAGE_BALANCE", noPermBalance.status === 403, noPermBalance.body?.error);
  const noPermAccount = await api(`/api/crm/leads/${cardLeadId}/account/status`, {
    token: managerToken, method: "PATCH", body: { status: "SUSPENDED" },
  });
  check("account status change refused without MANAGE_ACCOUNT", noPermAccount.status === 403, noPermAccount.body?.error);
  const noPermView = await api(`/api/crm/leads/${cardLeadId}/view-token`, { token: managerToken, method: "POST" });
  check("view-token issuance refused without IMPERSONATE", noPermView.status === 403, noPermView.body?.error);

  // A manager cannot grant themselves permissions — only the admin route can,
  // and it is already gated by requireAdmin.
  const selfGrant = await api(`/api/admin/users/${managerId}/crm-permissions`, {
    token: managerToken, method: "PATCH", body: { permissions: ["MANAGE_BALANCE"] },
  });
  check("a manager cannot grant their own CRM permissions", selfGrant.status === 403, selfGrant.status);

  const grant = await api(`/api/admin/users/${managerId}/crm-permissions`, {
    token: adminToken, method: "PATCH",
    body: { permissions: ["MANAGE_BALANCE", "MANAGE_ACCOUNT", "MANAGE_TRADES", "IMPERSONATE"] },
  });
  check("admin grants all four CRM permissions", (grant.body?.crmPermissions ?? []).length === 4, grant.body);

  const grantedOnNonManager = await api(`/api/admin/users/${target.id}/crm-permissions`, {
    token: adminToken, method: "PATCH", body: { permissions: ["MANAGE_BALANCE"] },
  });
  check("CRM permissions refused for a non-MANAGER account", grantedOnNonManager.status === 400,
    grantedOnNonManager.body?.error);

  const metaAfter = await api("/api/crm/meta", { token: managerToken });
  check("granted permissions show up on the manager's own session",
    (metaAfter.body?.myPermissions ?? []).sort().join(",") === "IMPERSONATE,MANAGE_ACCOUNT,MANAGE_BALANCE,MANAGE_TRADES",
    metaAfter.body?.myPermissions);

  // Conversion: refuses a duplicate, issues a one-time password.

  const convert = await api(`/api/crm/leads/${cardLeadId}/convert`, { token: managerToken, method: "POST" });
  check("lead converted to a platform account", convert.status === 201, convert.body);
  check("conversion issues a temporary password satisfying the password policy",
    typeof convert.body?.temporaryPassword === "string" &&
    convert.body.temporaryPassword.length >= 10 &&
    /[a-zA-Z]/.test(convert.body.temporaryPassword) &&
    /[0-9]/.test(convert.body.temporaryPassword),
    convert.body?.temporaryPassword?.length);
  const platformUserId = convert.body?.lead?.platformUserId as string;
  check("the card links to the freshly created platform account", typeof platformUserId === "string" && platformUserId.length > 0,
    platformUserId);
  const tempPassword = convert.body?.temporaryPassword as string;

  const reconvert = await api(`/api/crm/leads/${cardLeadId}/convert`, { token: managerToken, method: "POST" });
  check("converting an already-converted lead is refused", reconvert.status === 409, reconvert.body?.error);

  // The new account cannot log in normally — it must set its own password first.
  const tempLogin = await api("/api/auth/login", { method: "POST", body: { email: cardEmail, password: tempPassword } });
  check("logging in with the temp password demands a real one",
    tempLogin.body?.passwordChangeRequired === true && !tempLogin.body?.accessToken, tempLogin.body);
  const changeToken = tempLogin.body?.passwordChangeToken as string;

  const changeChallengeAsAccess = await api("/api/auth/me", { token: changeToken });
  check("the password-change challenge is not usable as an access token", changeChallengeAsAccess.status === 401,
    changeChallengeAsAccess.status);

  const badNewPassword = await api("/api/auth/complete-password-change", {
    method: "POST", body: { passwordChangeToken: changeToken, newPassword: "short" },
  });
  check("the new password still has to pass the policy", badNewPassword.status === 400, badNewPassword.body?.error);

  const completed = await api("/api/auth/complete-password-change", {
    method: "POST", body: { passwordChangeToken: changeToken, newPassword: "BrandNewClientPass2026" },
  });
  check("password change completes and logs the client in", !!completed.body?.accessToken, completed.body);
  const clientToken = completed.body?.accessToken as string;

  const oldPwLogin = await api("/api/auth/login", { method: "POST", body: { email: cardEmail, password: tempPassword } });
  check("the spent temp password no longer works", oldPwLogin.status === 401, oldPwLogin.status);
  const newPwLogin = await api("/api/auth/login", { method: "POST", body: { email: cardEmail, password: "BrandNewClientPass2026" } });
  check("the client's own new password works, no challenge this time", !!newPwLogin.body?.accessToken, newPwLogin.body);

  // Gated actions now succeed with the granted permissions.
  const credit = await api(`/api/crm/leads/${cardLeadId}/account/balance`, {
    token: managerToken, method: "POST", body: { amount: "500", note: "smoke credit" },
  });
  check("balance credited with MANAGE_BALANCE granted", credit.body?.balance === "10500.00", credit.body);
  const cardDebit = await api(`/api/crm/leads/${cardLeadId}/account/balance`, {
    token: managerToken, method: "POST", body: { amount: "-200" },
  });
  check("balance debited", cardDebit.body?.balance === "10300.00", debit.body);
  const zeroAmount = await api(`/api/crm/leads/${cardLeadId}/account/balance`, {
    token: managerToken, method: "POST", body: { amount: "0" },
  });
  check("a zero-amount adjustment is refused", zeroAmount.status === 400, zeroAmount.body?.error);

  const accountSnap = await api(`/api/crm/leads/${cardLeadId}/account`, { token: managerToken });
  check("account snapshot reflects the adjustments", accountSnap.body?.summary?.cash === "10300.00", accountSnap.body?.summary);
  check("account snapshot carries positions/orders/trades/ledger arrays",
    Array.isArray(accountSnap.body?.positions) && Array.isArray(accountSnap.body?.openOrders) &&
    Array.isArray(accountSnap.body?.trades) && Array.isArray(accountSnap.body?.ledger), accountSnap.body);

  const cardSuspend = await api(`/api/crm/leads/${cardLeadId}/account/status`, {
    token: managerToken, method: "PATCH", body: { status: "SUSPENDED" },
  });
  check("account suspended with MANAGE_ACCOUNT granted", cardSuspend.body?.status === "SUSPENDED", cardSuspend.body);
  const suspendedLogin = await api("/api/auth/login", { method: "POST", body: { email: cardEmail, password: "BrandNewClientPass2026" } });
  check("a suspended account cannot log in", suspendedLogin.status === 401, suspendedLogin.status);
  // The still-live access token is not itself revoked (revoking only touches
  // refresh tokens) — what actually blocks it is authenticate.ts re-reading
  // status from the database on every request, which is why this is 403
  // FORBIDDEN ("account blocked"), not 401 ("bad token").
  const clientAfterSuspend = await api("/api/auth/me", { token: clientToken });
  check("a suspended account's still-live access token is blocked immediately",
    clientAfterSuspend.status === 403, clientAfterSuspend.status);

  const reactivate = await api(`/api/crm/leads/${cardLeadId}/account/status`, {
    token: managerToken, method: "PATCH", body: { status: "ACTIVE" },
  });
  check("account reactivated", reactivate.body?.status === "ACTIVE", reactivate.body);

  // View token: one-time, read-only, works without any Velora session.
  const viewToken = await api(`/api/crm/leads/${cardLeadId}/view-token`, { token: managerToken, method: "POST" });
  check("view token issued with IMPERSONATE granted", typeof viewToken.body?.token === "string", viewToken.body);
  const snapshot = await api("/api/crm-view", { method: "POST", body: { token: viewToken.body.token } });
  check("view token opens a read-only account snapshot with no auth header",
    snapshot.status === 200 && snapshot.body?.account?.summary?.cash === "10300.00", snapshot.body);
  const replay = await api("/api/crm-view", { method: "POST", body: { token: viewToken.body.token } });
  check("a view token cannot be reused", replay.status === 400, replay.body?.error);
  const viewTokenAsAccess = await api("/api/auth/me", { token: viewToken.body.token });
  check("a view token is not an access token", viewTokenAsAccess.status === 401, viewTokenAsAccess.status);

  const missingPlatformUser = leadId; // never converted in the section above
  const noAccountYet = await api(`/api/crm/leads/${missingPlatformUser}/account`, { token: managerToken });
  check("an unconverted lead has no account to view", noAccountYet.status === 409, noAccountYet.body?.error);

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("smoke run crashed:", e);
  process.exit(1);
});
