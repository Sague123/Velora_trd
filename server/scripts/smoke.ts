/**
 * End-to-end smoke test against a running API.
 * Run the server first (npm run dev), then: npm run smoke
 */
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

  const instruments = await api("/api/instruments");
  check("instruments listed", instruments.body?.instruments?.length > 0);
  const btc = instruments.body.instruments.find((i: any) => i.symbol === "BTCUSDT");
  check("BTCUSDT has a price", !!btc?.price, btc);
  check("instrument exposes data source", !!btc?.source);

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
