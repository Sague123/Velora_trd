import { db, migrate, newId, now, tx, closeDb } from "./db.js";
import { config } from "./config.js";
import { hashPassword } from "./lib/auth.js";
import { toScaled } from "./lib/money.js";
import { refreshUpstream, driftSynthetic } from "./engine/prices.js";

const INSTRUMENTS = [
  { symbol: "BTCUSDT",  name: "Bitcoin",            category: "SPOT", maxLeverage: 20,   dp: 2, cgId: "bitcoin",       fx: null,  funding: 0,       seed: "64230.50" },
  { symbol: "ETHUSDT",  name: "Ethereum",           category: "SPOT", maxLeverage: 20,   dp: 2, cgId: "ethereum",      fx: null,  funding: 0,       seed: "3180.20" },
  { symbol: "SOLUSDT",  name: "Solana",             category: "SPOT", maxLeverage: 20,   dp: 2, cgId: "solana",        fx: null,  funding: 0,       seed: "142.80" },
  { symbol: "BNBUSDT",  name: "BNB",                category: "SPOT", maxLeverage: 20,   dp: 2, cgId: "binancecoin",   fx: null,  funding: 0,       seed: "590.00" },
  { symbol: "XRPUSDT",  name: "XRP",                category: "SPOT", maxLeverage: 20,   dp: 4, cgId: "ripple",        fx: null,  funding: 0,       seed: "0.6200" },
  { symbol: "ADAUSDT",  name: "Cardano",            category: "SPOT", maxLeverage: 20,   dp: 4, cgId: "cardano",       fx: null,  funding: 0,       seed: "0.4500" },
  { symbol: "DOGEUSDT", name: "Dogecoin",           category: "SPOT", maxLeverage: 20,   dp: 5, cgId: "dogecoin",      fx: null,  funding: 0,       seed: "0.12000" },
  { symbol: "AVAXUSDT", name: "Avalanche",          category: "SPOT", maxLeverage: 20,   dp: 3, cgId: "avalanche-2",   fx: null,  funding: 0,       seed: "28.500" },
  { symbol: "LINKUSDT", name: "Chainlink",          category: "SPOT", maxLeverage: 20,   dp: 3, cgId: "chainlink",     fx: null,  funding: 0,       seed: "14.200" },
  { symbol: "DOTUSDT",  name: "Polkadot",           category: "SPOT", maxLeverage: 20,   dp: 3, cgId: "polkadot",      fx: null,  funding: 0,       seed: "6.400" },
  { symbol: "LTCUSDT",  name: "Litecoin",           category: "SPOT", maxLeverage: 20,   dp: 2, cgId: "litecoin",      fx: null,  funding: 0,       seed: "82.00" },
  { symbol: "TRXUSDT",  name: "TRON",               category: "SPOT", maxLeverage: 20,   dp: 4, cgId: "tron",          fx: null,  funding: 0,       seed: "0.1200" },
  // Binance doesn't offer real stock/index data (its tokenized-equities product
  // was discontinued), so these are the legitimate "real-world-asset" pairs
  // available: PAX Gold and Tether Gold are real, actively-traded Binance spot
  // markets whose prices track physical gold — not synthetic commodity CFDs.
  // Tagged as their own COMMODITY category so they read as a distinct TradFi
  // section rather than getting lost among the crypto pairs.
  { symbol: "PAXGUSDT", name: "PAX Gold",           category: "COMMODITY", maxLeverage: 5, dp: 2, cgId: "pax-gold",      fx: null,  funding: 0, seed: "2410.00" },
  { symbol: "XAUTUSDT", name: "Tether Gold",        category: "COMMODITY", maxLeverage: 5, dp: 2, cgId: "tether-gold",   fx: null,  funding: 0, seed: "2408.00" },
  { symbol: "BTC-PERP", name: "Bitcoin Perpetual",  category: "PERP", maxLeverage: 125, dp: 2, cgId: "bitcoin",       fx: null,  funding: 0.0083,  seed: "64230.50" },
  { symbol: "ETH-PERP", name: "Ethereum Perpetual", category: "PERP", maxLeverage: 100, dp: 2, cgId: "ethereum",      fx: null,  funding: -0.0021, seed: "3180.20" },
  { symbol: "XRP-PERP", name: "XRP Perpetual",      category: "PERP", maxLeverage: 50,  dp: 4, cgId: "ripple",        fx: null,  funding: 0.0045,  seed: "0.6200" },
  { symbol: "DOGE-PERP",name: "Dogecoin Perpetual", category: "PERP", maxLeverage: 50,  dp: 5, cgId: "dogecoin",      fx: null,  funding: -0.0012, seed: "0.12000" },
];

// FX and CFD instruments were dropped from the catalog: Velora has no real
// candle history for them (FX/CFD "candles" were always the synthetic
// random-walk fallback), and there is no Binance market to chart them
// against either. Rather than sell a chart that can never be real, every
// remaining instrument is a Binance-backed crypto pair.
const RETIRED_SYMBOLS = ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCHF", "XAUUSD", "XAGUSD", "US500", "US100", "WTIUSD"];
const deactivateRetired = db.prepare("UPDATE instruments SET active = 0 WHERE symbol = ?");

const upsertInstrument = db.prepare(`
  INSERT INTO instruments (symbol, name, category, max_leverage, price_decimals, cg_id, fx_code, funding_rate, active)
  VALUES (@symbol, @name, @category, @maxLeverage, @dp, @cgId, @fx, @funding, 1)
  ON CONFLICT(symbol) DO UPDATE SET
    name=excluded.name, category=excluded.category, max_leverage=excluded.max_leverage,
    price_decimals=excluded.price_decimals, cg_id=excluded.cg_id, fx_code=excluded.fx_code,
    funding_rate=excluded.funding_rate
`);
const seedPrice = db.prepare(`
  INSERT INTO price_snapshots (symbol, price_scaled, source, updated_at)
  VALUES (?, ?, 'SYNTHETIC', ?) ON CONFLICT(symbol) DO NOTHING
`);
const byEmail = db.prepare("SELECT id FROM users WHERE email = ?");
const insUser = db.prepare(`INSERT INTO users (id, email, password_hash, name, role, status, created_at, updated_at)
                            VALUES (@id, @email, @hash, @name, @role, 'ACTIVE', @ts, @ts)`);
const insAccount = db.prepare("INSERT INTO accounts (user_id, cash_scaled, updated_at) VALUES (?, ?, ?)");
const insLedger = db.prepare(`INSERT INTO ledger_entries (id, user_id, type, amount_scaled, balance_after_scaled, note, created_at)
                              VALUES (@id, @userId, 'DEPOSIT', @amt, @amt, 'Стартовый баланс', @ts)`);

async function main() {
  await migrate();

  for (const i of INSTRUMENTS) {
    await upsertInstrument.run(i);
    await seedPrice.run(i.symbol, toScaled(i.seed), now());
  }
  console.log(`✓ ${INSTRUMENTS.length} instruments`);

  for (const symbol of RETIRED_SYMBOLS) await deactivateRetired.run(symbol);
  console.log(`✓ ${RETIRED_SYMBOLS.length} FX/CFD instruments deactivated (no real chart data available)`);

  const users = [
    { email: "admin@velora.local",   name: "Platform Admin", role: "ADMIN",   password: "AdminPass2026",   balance: "50000" },
    { email: "manager@velora.local", name: "Sales Manager",  role: "MANAGER", password: "ManagerPass2026", balance: "0" },
    { email: "trader@velora.local",  name: "Demo Trader",    role: "USER",    password: "TraderPass2026",  balance: config.startingBalance },
  ];

  for (const u of users) {
    if (await byEmail.get(u.email)) { console.log(`· ${u.email} already exists`); continue; }
    const hash = await hashPassword(u.password);
    const id = newId(), ts = now(), amt = toScaled(u.balance);
    await tx(async () => {
      await insUser.run({ id, email: u.email, hash, name: u.name, role: u.role, ts });
      await insAccount.run(id, amt, ts);
      await insLedger.run({ id: newId(), userId: id, amt, ts });
    });
    console.log(`✓ ${u.role.padEnd(7)} ${u.email} / ${u.password}`);
  }

  console.log("· fetching live prices…");
  const touched = await refreshUpstream();
  await driftSynthetic();
  console.log(touched.length
    ? `✓ live quotes for ${touched.length} instruments`
    : "! upstream unavailable — seeded prices kept");
  await closeDb();
}

main().catch((e) => { console.error(e); process.exit(1); });
