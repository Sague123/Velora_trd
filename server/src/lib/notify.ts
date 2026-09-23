import { db } from "../db.js";
import { captureError } from "./monitoring.js";
import { sendMail, type Mail } from "./mailer.js";
import { normalizeSettings } from "./userSettings.js";

export type NotificationEvent =
  | "orderFilled" | "slTpTriggered" | "marginWarning"
  | "newLogin" | "securityChanges" | "maintenance" | "news";

const q = {
  user: db.prepare(`SELECT u.email, s.data FROM users u
    LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`),
};

/**
 * Emails the user about an event if their Settings → Notifications allow it.
 *
 * Fire-and-forget by design: callers invoke it *after* their transaction has
 * committed and never await its outcome — a notification must not be able
 * to fail, slow down or roll back the thing it reports.
 */
export function notifyByEmail(userId: string, event: NotificationEvent, build: (to: string) => Mail): void {
  void (async () => {
    const row = (await q.user.get(userId)) as { email: string; data: unknown } | undefined;
    if (!row) return;
    // Security notices always go out: switching them off would let whoever
    // took over the account silence the one message that would reveal it.
    if (event !== "securityChanges" && !normalizeSettings(row.data).notifications[event].email) return;
    await sendMail(build(row.email));
  })().catch((e) => captureError(e, { scope: "notify", userId, extra: { event } }));
}
