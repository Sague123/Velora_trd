import "dotenv/config";

function secret(name: string, devFallback: string): string {
  const v = process.env[name] ?? devFallback;
  if (process.env.NODE_ENV === "production" && (v === devFallback || v.startsWith("change-me"))) {
    throw new Error(`${name} holds a placeholder value — refusing to start in production`);
  }
  return v;
}

export const config = {
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
} as const;
