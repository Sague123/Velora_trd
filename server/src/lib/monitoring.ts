import * as Sentry from "@sentry/node";
import { config } from "../config.js";

/**
 * Error reporting and operational alerting.
 *
 * Two rules shape this file. First, monitoring is optional: with no
 * SENTRY_DSN set every function here still runs and every error still reaches
 * the server log, because a platform that needs a third-party SaaS to boot is
 * a platform with an extra way to fail. Second, nothing that identifies a
 * person or authorises a request may leave the building — Sentry gets the
 * shape of a failure, never the payload that caused it.
 */

let enabled = false;

export function initMonitoring(): void {
  if (!config.sentryDsn) {
    console.log("[monitoring] SENTRY_DSN not set — errors go to the log only");
    return;
  }
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    tracesSampleRate: config.sentryTracesSampleRate,
    // Default PII collection is off: request bodies carry passwords, TOTP
    // codes, KYC document numbers and bearer tokens, and none of that has any
    // business in an error tracker.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          for (const h of ["authorization", "cookie", "x-forwarded-for"]) delete event.request.headers[h];
        }
      }
      return event;
    },
  });
  enabled = true;
  console.log(`[monitoring] Sentry enabled (env=${config.env})`);
}

export interface ErrorContext {
  /** Where the failure happened — "engine.strategy", "route.orders", … */
  scope: string;
  /** Non-identifying detail: ids, symbols, counts. Never bodies or secrets. */
  extra?: Record<string, unknown>;
  /** Attributing an error to an account makes a report actionable without
   * carrying the account's email or name into the tracker. */
  userId?: string;
}

/** Reports an unexpected failure. Always logs; reports upstream when enabled. */
export function captureError(err: unknown, ctx: ErrorContext): void {
  console.error(`[${ctx.scope}]`, err, ctx.extra ?? "");
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("scope", ctx.scope);
    if (ctx.userId) scope.setUser({ id: ctx.userId });
    if (ctx.extra) scope.setContext("detail", ctx.extra as Record<string, unknown>);
    Sentry.captureException(err);
  });
}

/** Reports an operational condition that is not an exception — a feed that
 * stopped updating, a bot parked after repeated failures. */
export function captureAlert(message: string, ctx: ErrorContext & { level?: "warning" | "error" }): void {
  const level = ctx.level ?? "warning";
  console[level === "error" ? "error" : "warn"](`[${ctx.scope}] ${message}`, ctx.extra ?? "");
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("scope", ctx.scope);
    scope.setLevel(level);
    if (ctx.extra) scope.setContext("detail", ctx.extra as Record<string, unknown>);
    Sentry.captureMessage(message);
  });
}

export const monitoringEnabled = () => enabled;

/** Flushes buffered events on shutdown — a crash report that never left the
 * process is worse than useless, because it looks like nothing happened. */
export const flushMonitoring = (timeoutMs = 2000): Promise<boolean> =>
  enabled ? Sentry.flush(timeoutMs) : Promise.resolve(true);
