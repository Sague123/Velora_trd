import "dotenv/config";

/**
 * Which half of the platform this process serves.
 *
 * `public` is the one exposed to the internet: trading, auth, KYC upload and
 * the one-time support link — plus the engines. `internal` is the sales
 * desk's CRM and the admin panel, reachable only over the tunnel; it must
 * never run the engines, because a second matching tick means orders filled
 * twice and positions liquidated twice (see server.ts).
 *
 * `all` is one process serving both. That is what local development and the
 * smoke suite run, and what an unsplit deployment keeps doing — so adding
 * the split cannot silently take CRM away from anyone who has not set the
 * variable yet.
 */
export type VeloraRole = "all" | "public" | "internal";

function readRole(): VeloraRole {
  const raw = process.env.VELORA_ROLE ?? "all";
  if (raw === "all" || raw === "public" || raw === "internal") return raw;
  throw new Error(`VELORA_ROLE must be one of all|public|internal — got "${raw}"`);
}

const role = readRole();

function secret(name: string, devFallback: string): string {
  const v = process.env[name] ?? devFallback;
  if (process.env.NODE_ENV === "production" && (v === devFallback || v.startsWith("change-me"))) {
    throw new Error(`${name} holds a placeholder value — refusing to start in production`);
  }
  return v;
}

export const config = {
  role,
  /** Trading, auth, KYC upload, the support link, the price socket. */
  servesPublic: role !== "internal",
  /** CRM and the admin panel. */
  servesInternal: role !== "public",
  /** Matching, strategies, savings, price feed. Exactly one process may. */
  runsEngines: role !== "internal",

  // Postgres connection string, e.g. postgres://user:pass@host:5432/dbname.
  // No local-file fallback — a real database is required. For local dev,
  // point this at any Postgres instance (local, Docker, or a free Neon/
  // Supabase project); it doesn't have to be the same one production uses.
  databaseUrl: secret("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/velora"),
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  // Normalised on the way in: a pasted dashboard URL routinely carries a
  // trailing slash or stray whitespace, and an Origin header never has
  // either — so an otherwise-correct value would silently reject every
  // request. Empty entries are dropped for the same reason.
  corsOrigin: (process.env.CORS_ORIGIN ?? "http://localhost:5000,http://localhost:3000")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean),
  jwtSecret: secret("JWT_SECRET", "dev-only-access-secret"),
  jwtRefreshSecret: secret("JWT_REFRESH_SECRET", "dev-only-refresh-secret"),
  // Encrypts the TOTP shared secrets at rest (lib/crypto.ts). Rotating it makes
  // every enrolled authenticator unreadable, so those users must re-enrol —
  // which the code handles gracefully, but is not something to do casually.
  encryptionKey: secret("ENCRYPTION_KEY", "dev-only-encryption-key"),
  accessTtl: "15m",
  refreshTtlDays: 30,
  takerFeeBps: 4,              // 0.04% taker fee
  maintenanceMarginRatio: 0.005, // 0.5% of notional, in line with real venues
  startingBalance: "10000",
  engineTickMs: 2000,
  // How often the server re-pulls upstream (Binance) prices — this is the
  // price everything server-side (margin, PnL, TP/SL, liquidation) actually
  // trades against, so it directly bounds how current a liquidation check
  // can be, and how closely it tracks the same Binance ticks the client
  // displays. Binance's REST rate limit is generous (1200 weight/min; this
  // is ~2 calls/cycle, ~80 weight/min), so 2s is safe.
  priceRefreshMs: 2_000,
  // How often the server-side strategy engine (engine/strategy.ts) steps every
  // RUNNING bot. Slower than the matching tick on purpose: a bot step can place
  // or close real orders, and there is nothing to gain from re-evaluating a
  // grid faster than the grid can plausibly fill.
  strategyTickMs: 5_000,
  // Consecutive failing steps before a bot is parked in ERROR. Transient
  // conditions (a missing quote) are not counted — only real failures.
  botMaxConsecutiveErrors: 3,
  // How many log lines each bot keeps. Old lines are pruned as new ones land.
  botLogCap: 200,

  /* ------------------------------ monitoring ------------------------------ */
  // Sentry DSN. Empty (the default) means error reporting is off and every
  // error still reaches the server log — the platform must not require a
  // third-party service to run.
  sentryDsn: process.env.SENTRY_DSN ?? "",
  // Fraction of transactions traced. Free-tier quotas are small; errors are
  // what matter here, so performance tracing stays off unless asked for.
  sentryTracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  // The price feed is the platform's connection to reality. If it has been
  // unhealthy for longer than this, that is an incident, not a blip, and it
  // gets escalated from a debug line to an alert.
  feedUnhealthyAlertMs: Number(process.env.FEED_UNHEALTHY_ALERT_MS ?? 60_000),
  // A quote older than this is not tradeable. Opening a position against a
  // stale price is how a trader gets filled at a number the market left
  // behind minutes ago. See engine/execution.ts.
  maxQuoteAgeMs: Number(process.env.MAX_QUOTE_AGE_MS ?? 120_000),

  /* -------------------------- accounts & security ------------------------- */
  appName: "Velora",
  // Where the links in verification/reset emails point — the SPA, not the API.
  publicAppUrl: (process.env.PUBLIC_APP_URL ?? "http://localhost:5000").replace(/\/+$/, ""),
  // Transactional email. Empty key = messages are written to the log instead of
  // sent, which is exactly what local development wants.
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  mailFrom: process.env.MAIL_FROM ?? "Velora <no-reply@velora.local>",
  // A verification link is a bearer credential for an inbox; a day is plenty.
  emailTokenTtlHours: 24,
  // A reset link is a bearer credential for the whole account. Short on purpose.
  resetTokenTtlMinutes: 60,
  // How long the half-authenticated window between password and TOTP code lasts.
  mfaChallengeTtlMinutes: 5,
  // How many single-use backup codes a user gets when they enable 2FA.
  backupCodeCount: 10,

  /* ----------------------------------- KYC -------------------------------- */
  // Where identity documents live on disk. Must be outside anything a web
  // server serves: the bytes only ever leave through an authenticated API
  // call (see lib/storage.ts). Created 0700 on first use. Both processes
  // share it — public writes on submission, internal reads on review — which
  // is one reason they run on the same host.
  //
  // The default keeps local development working with no setup. In production
  // set it to a real data directory, e.g. /var/lib/velora/kyc, and include it
  // in backups: it is not in the database dump.
  kycDir: process.env.KYC_DIR ?? "./.kyc-storage",
  // Per-image ceiling after the client downscales. A phone photo of a passport
  // compresses well under this; anything larger is not a document scan.
  kycMaxImageBytes: 4 * 1024 * 1024,

  /* --------------------------------- savings ------------------------------- */
  // How often the accrual pass runs. It pays whole elapsed days, so a shorter
  // interval does not pay more often — it only shortens the wait after a
  // restart before the day that was owed gets paid.
  savingsTickMs: 15 * 60_000,
  // Withdrawing from a savings account requires a verified identity for the
  // same reason a withdrawal does: it is the door money leaves through.
  savingsRequiresKyc: process.env.SAVINGS_REQUIRES_KYC !== "false",
} as const;
