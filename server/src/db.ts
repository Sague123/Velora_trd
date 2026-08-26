import pg from "pg";
import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { config } from "./config.js";

/**
 * Postgres via `pg`, behind a thin adapter that keeps the exact call-site
 * shape every route/engine file already uses: `db.prepare(sql).get(...)`,
 * `.all(...)`, `.run(...)` — the same as the better-sqlite3 API this project
 * started on (see git history / the original db.ts comment: "the SQL stays
 * plain enough to port to PostgreSQL when the platform outgrows a single
 * node"). The only real difference at call sites is that these now return
 * Promises, so every caller awaits them.
 *
 * Two SQLite-isms every existing prepared statement relies on are handled
 * transparently here rather than by rewriting ~2000 lines of SQL:
 *  - `@name` named placeholders (better-sqlite3 style) and bare `?`
 *    positional placeholders are both rewritten to Postgres's `$1..$n`.
 *  - int8/BIGINT columns are parsed back as native BigInt (pg's default is a
 *    string, to avoid silent precision loss) so the existing asBig/asNum
 *    helpers keep working unchanged on every scaled money/quantity column.
 */
pg.types.setTypeParser(20 /* int8 */, (v: string) => BigInt(v));

// Hosted Postgres (Render/Neon/Supabase) requires TLS but usually presents a
// cert chain `pg` won't validate out of the box; a local dev database on
// bare localhost has no TLS at all and would just fail the handshake if we
// forced it on. Providers signal "requires TLS" inconsistently — some put
// sslmode=require in the URL, most (Supabase included) just expect the
// client to know — so the reliable heuristic is host-based: anything that
// isn't literally localhost is assumed to need TLS.
const dbHost = (() => {
  try { return new URL(config.databaseUrl).hostname; } catch { return ""; }
})();
const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1" || dbHost === "::1";

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: isLocalDb ? undefined : { rejectUnauthorized: false },
});
pool.on("error", (err) => {
  // A dropped idle connection must not crash the whole process.
  console.error("[db] idle client error", err);
});

export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();

/** The client for the currently-active transaction, if any — set by tx()
 * for the duration of its callback via AsyncLocalStorage, so every query
 * issued anywhere inside that callback (including deep in a helper function
 * several calls away) transparently runs on the same connection, in the
 * same transaction, with zero change to how those queries are written. */
const txContext = new AsyncLocalStorage<pg.PoolClient>();
function currentClient(): pg.PoolClient | pg.Pool {
  return txContext.getStore() ?? pool;
}

/** Rewrites `@name` / `?` placeholders to `$1..$n` and returns how to build
 * the positional values array from a call's arguments — object-with-named-
 * keys for `@name` queries (matching better-sqlite3's `.run({...})` call
 * shape), spread positional args otherwise. */
function compile(sql: string): { text: string; named: string[] } {
  const named: string[] = [];
  let text = sql.replace(/@(\w+)/g, (_, name: string) => {
    named.push(name);
    return `$${named.length}`;
  });
  if (named.length === 0) {
    let i = 0;
    text = text.replace(/\?/g, () => `$${++i}`);
  }
  return { text, named };
}

function toParams(named: string[], args: unknown[]): unknown[] {
  if (named.length === 0) return args;
  const obj = (args[0] ?? {}) as Record<string, unknown>;
  return named.map((n) => (n in obj ? obj[n] : null));
}

export function prepare(sql: string) {
  const { text, named } = compile(sql);
  return {
    async get(...args: unknown[]): Promise<any> {
      const res = await currentClient().query(text, toParams(named, args));
      return res.rows[0];
    },
    async all(...args: unknown[]): Promise<any[]> {
      const res = await currentClient().query(text, toParams(named, args));
      return res.rows;
    },
    async run(...args: unknown[]): Promise<{ changes: number }> {
      const res = await currentClient().query(text, toParams(named, args));
      return { changes: res.rowCount ?? 0 };
    },
  };
}

export const db = {
  prepare,
  /** Multi-statement DDL with no parameters — pg's simple query protocol
   * (used automatically when a query has no params) runs every semicolon-
   * separated statement in the string, same as better-sqlite3's exec(). */
  exec: async (sql: string): Promise<void> => {
    await currentClient().query(sql);
  },
};

/** A unit of work inside a real Postgres transaction. Everything queried
 * anywhere during `fn`'s execution (see txContext above) runs on the same
 * connection inside BEGIN/COMMIT, so money moves atomically or not at all —
 * the same guarantee the original synchronous better-sqlite3 transaction
 * gave, just expressed with an async boundary instead of a sync one. */
export async function tx<T>(fn: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await txContext.run(client, fn);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* connection may already be dead — nothing more to do */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function closeDb(): Promise<void> {
  await pool.end();
}

/* Row readers: BIGINT columns arrive as native BigInt (see the type parser
 * above); everything else pg already returns as number/string/boolean. */
export const asNum = (v: unknown): number => (typeof v === "bigint" ? Number(v) : Number(v ?? 0));
export const asBig = (v: unknown): bigint => (typeof v === "bigint" ? v : BigInt((v ?? 0) as any));
export const asBigOrNull = (v: unknown): bigint | null =>
  v === null || v === undefined ? null : asBig(v);
export const asBool = (v: unknown): boolean => v === true || v === 1 || v === "1";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'USER',
  status        TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  user_id     TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  cash_scaled BIGINT NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'USD',
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  user_agent TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS instruments (
  symbol         TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  category       TEXT NOT NULL,
  max_leverage   INTEGER NOT NULL DEFAULT 1,
  price_decimals INTEGER NOT NULL DEFAULT 2,
  cg_id          TEXT,
  fx_code        TEXT,
  funding_rate   DOUBLE PRECISION NOT NULL DEFAULT 0,
  active         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS price_snapshots (
  symbol       TEXT PRIMARY KEY REFERENCES instruments(symbol) ON DELETE CASCADE,
  price_scaled BIGINT NOT NULL,
  change_24h   DOUBLE PRECISION NOT NULL DEFAULT 0,
  high_24h     BIGINT,
  low_24h      BIGINT,
  volume_24h   BIGINT,
  source       TEXT NOT NULL DEFAULT 'SYNTHETIC',
  updated_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL REFERENCES instruments(symbol),
  side          TEXT NOT NULL,
  type          TEXT NOT NULL,
  qty_scaled    BIGINT NOT NULL,
  price_scaled  BIGINT NOT NULL,
  leverage      INTEGER NOT NULL DEFAULT 1,
  margin_scaled BIGINT NOT NULL,
  fee_scaled    BIGINT NOT NULL DEFAULT 0,
  tp_scaled     BIGINT,
  sl_scaled     BIGINT,
  status        TEXT NOT NULL DEFAULT 'NEW',
  filled_scaled BIGINT,
  position_id   TEXT,
  created_at    TEXT NOT NULL,
  filled_at     TEXT,
  cancelled_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS positions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol        TEXT NOT NULL REFERENCES instruments(symbol),
  side          TEXT NOT NULL,
  qty_scaled    BIGINT NOT NULL,
  entry_scaled  BIGINT NOT NULL,
  margin_scaled BIGINT NOT NULL,
  leverage      INTEGER NOT NULL DEFAULT 1,
  liq_scaled    BIGINT,
  tp_scaled     BIGINT,
  sl_scaled     BIGINT,
  status        TEXT NOT NULL DEFAULT 'OPEN',
  opened_at     TEXT NOT NULL,
  closed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_pos_user_status ON positions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_pos_status ON positions(status);

CREATE TABLE IF NOT EXISTS trades (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position_id  TEXT,
  symbol       TEXT NOT NULL REFERENCES instruments(symbol),
  side         TEXT NOT NULL,
  qty_scaled   BIGINT NOT NULL,
  entry_scaled BIGINT NOT NULL,
  exit_scaled  BIGINT NOT NULL,
  pnl_scaled   BIGINT NOT NULL,
  fee_scaled   BIGINT NOT NULL DEFAULT 0,
  close_reason TEXT NOT NULL DEFAULT 'MANUAL',
  closed_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trades_user ON trades(user_id, closed_at);

-- Append-only money journal: the account balance must always be reconstructible
-- from these rows. Nothing outside lib/ledger.ts may write to accounts.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id                   TEXT PRIMARY KEY,
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL,
  amount_scaled        BIGINT NOT NULL,
  balance_after_scaled BIGINT NOT NULL,
  ref_type             TEXT,
  ref_id               TEXT,
  note                 TEXT,
  actor_user_id        TEXT,
  created_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger_entries(user_id, created_at);

CREATE TABLE IF NOT EXISTS alerts (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL REFERENCES instruments(symbol),
  direction    TEXT NOT NULL,
  price_scaled BIGINT NOT NULL,
  fired_at     TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id);

-- Trading bots. Their engine runs server-side (engine/strategy.ts), so a bot
-- keeps trading whether or not the trader who created it has a tab open.
-- The config column is the user-supplied strategy definition and never
-- changes once created; state is engine-owned runtime bookkeeping (which grid orders are
-- currently resting, which positions belong to the open martingale group).
-- Keeping the two apart means a restart, a reload or an admin looking at the
-- row can always tell the intent from the progress.
CREATE TABLE IF NOT EXISTS bots (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  symbol      TEXT NOT NULL REFERENCES instruments(symbol),
  config      JSONB NOT NULL,
  state       JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL DEFAULT 'STOPPED',
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error  TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bots_user ON bots(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bots_status ON bots(status);

CREATE TABLE IF NOT EXISTS bot_logs (
  id      TEXT PRIMARY KEY,
  bot_id  TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
  ts      TEXT NOT NULL,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bot_logs_bot ON bot_logs(bot_id, ts);

-- Identity verification. The *_url columns hold object PATHS inside a private
-- Supabase Storage bucket, never public URLs: a passport scan reachable by URL
-- is the exact failure this design exists to prevent. Documents are only ever
-- read back through short-lived signed links (see lib/storage.ts).
--
-- Kept as a history rather than one row per user: a rejected submission and the
-- reason it was rejected must still be readable after the user submits again,
-- both to answer "why was I rejected" and because an approval decision that
-- overwrites its own evidence is not auditable.
CREATE TABLE IF NOT EXISTS kyc_submissions (
  id                  TEXT PRIMARY KEY,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  address             TEXT NOT NULL,
  document_type       TEXT NOT NULL,
  document_number     TEXT NOT NULL,
  document_front_url  TEXT NOT NULL,
  document_back_url   TEXT,
  selfie_url          TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'PENDING',
  rejection_reason    TEXT,
  reviewed_by         TEXT REFERENCES users(id),
  reviewed_at         TEXT,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kyc_user ON kyc_submissions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_kyc_status ON kyc_submissions(status, created_at);

-- Single-use, expiring, emailed credentials: email verification and password
-- reset. One table rather than two because they differ only in what the link
-- does, and a single well-tested consume-once path is worth more than two
-- similar ones. The raw token is never stored — only its SHA-256, so a
-- database leak yields no usable links (the same reasoning as refresh_tokens).
CREATE TABLE IF NOT EXISTS auth_tokens (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at    TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens(user_id, kind);

CREATE TABLE IF NOT EXISTS audit_logs (
  id             TEXT PRIMARY KEY,
  actor_id       TEXT,
  target_user_id TEXT,
  action         TEXT NOT NULL,
  meta           TEXT,
  ip             TEXT,
  created_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_user_id);
`;

async function addColumnIfMissing(table: string, column: string, ddl: string): Promise<void> {
  const res = await pool.query(
    "SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2",
    [table, column]
  );
  if (res.rowCount === 0) {
    await pool.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

function generateAccountNumber(): string {
  // 8 digits, first digit 1-9 so it never carries a misleading leading zero.
  return String(Math.floor(10_000_000 + Math.random() * 90_000_000));
}

/** Every user needs a short numeric account number for internal transfers —
 * friendlier than typing someone's email. Backfills any row still missing
 * one (fresh column, or a user created before this existed). */
async function backfillAccountNumbers(): Promise<void> {
  const missing = (await pool.query("SELECT id FROM users WHERE account_number IS NULL")).rows as { id: string }[];
  if (missing.length === 0) return;
  const taken = new Set(
    ((await pool.query("SELECT account_number FROM users WHERE account_number IS NOT NULL")).rows as { account_number: string }[])
      .map((r) => r.account_number)
  );
  for (const row of missing) {
    let candidate = generateAccountNumber();
    while (taken.has(candidate)) candidate = generateAccountNumber();
    taken.add(candidate);
    await pool.query("UPDATE users SET account_number = $1 WHERE id = $2", [candidate, row.id]);
  }
}

export async function migrate(): Promise<void> {
  await pool.query(SCHEMA);
  // Optional self-reported profile detail — informational only, never
  // verified against any document or authority.
  await addColumnIfMissing("users", "date_of_birth", "date_of_birth TEXT");
  // Small base64 data-URI avatar, capped at the API layer — no file storage
  // service exists, so this stays a plain column like everything else here.
  await addColumnIfMissing("users", "avatar", "avatar TEXT");
  // A short numeric account number — this user's "wallet number" for
  // internal transfers between Velora accounts, shown in their profile.
  await addColumnIfMissing("users", "account_number", "account_number TEXT");
  // Second factor. The shared secret is stored encrypted (lib/crypto.ts), not
  // hashed, because the server must read it back on every login to derive the
  // expected code; backup_codes holds SHA-256 hashes of the single-use recovery
  // codes as a JSON array.
  await addColumnIfMissing("users", "totp_secret", "totp_secret TEXT");
  await addColumnIfMissing("users", "totp_enabled", "totp_enabled BOOLEAN NOT NULL DEFAULT FALSE");
  await addColumnIfMissing("users", "backup_codes", "backup_codes JSONB");
  // Whether the address has been proven to belong to whoever registered it.
  await addColumnIfMissing("users", "email_verified", "email_verified BOOLEAN NOT NULL DEFAULT FALSE");
  // Denormalised from the newest kyc_submissions row so that gating a request
  // on identity is one column read rather than a subquery on every order.
  // NONE | PENDING | APPROVED | REJECTED.
  await addColumnIfMissing("users", "kyc_status", "kyc_status TEXT NOT NULL DEFAULT 'NONE'");
  await pool.query("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_number ON users(account_number)");
  await backfillAccountNumbers();
}

export async function newAccountNumber(): Promise<string> {
  let candidate = generateAccountNumber();
  while ((await pool.query("SELECT 1 FROM users WHERE account_number = $1", [candidate])).rowCount) {
    candidate = generateAccountNumber();
  }
  return candidate;
}
