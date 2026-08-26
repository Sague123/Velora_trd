import * as Sentry from "@sentry/react";
import { ApiError } from "./api";

/**
 * Browser-side error reporting. Same two rules as the server's
 * (server/src/lib/monitoring.ts): it is entirely optional — with no
 * VITE_SENTRY_DSN the app behaves identically and errors go to the console —
 * and nothing identifying leaves the page.
 *
 * The filtering below matters more here than on the server. A trading UI
 * generates a constant background of *expected* failures: a rejected order, a
 * dropped connection on a train, an expired token. Reporting those would bury
 * the one real bug in ten thousand rows of normal life, so only genuinely
 * unexpected errors are sent.
 */

const DSN = import.meta.env.VITE_SENTRY_DSN as string | undefined;

/** Errors that are part of normal operation, not defects. */
function isExpected(error: unknown): boolean {
  if (error instanceof ApiError) {
    // Network drops and anything the API deliberately answered with (validation,
    // auth, business rules) are the system working, not breaking. A 5xx is not.
    return error.status === 0 || (error.status >= 400 && error.status < 500);
  }
  if (error instanceof Error) {
    // Chunk-load failures after a redeploy: the user reloads and it's gone.
    return /Loading chunk|Failed to fetch dynamically imported module|NetworkError/i.test(error.message);
  }
  return false;
}

export function initMonitoring(): void {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    // No session replay and no tracing: both are heavy, both cost free-tier
    // quota, and a replay of a trading screen is a recording of someone's
    // positions and balance.
    integrations: [],
    tracesSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event, hint) {
      if (isExpected(hint?.originalException)) return null;
      // The URL can carry a symbol or an id; the query string never needs to go.
      if (event.request?.url) event.request.url = event.request.url.split("?")[0];
      return event;
    },
  });
}

/** Reports an unexpected client-side failure. Expected ones are dropped. */
export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (isExpected(error)) return;
  console.error(error, context ?? "");
  if (!DSN) return;
  Sentry.withScope((scope) => {
    if (context) scope.setContext("detail", context);
    Sentry.captureException(error);
  });
}

/** Ties reports to an account id — never an email or a name. */
export function identifyUser(userId: string | null): void {
  if (!DSN) return;
  Sentry.setUser(userId ? { id: userId } : null);
}
