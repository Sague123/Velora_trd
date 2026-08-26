import { config } from "../config.js";
import { captureError } from "./monitoring.js";

/**
 * Transactional email — verification links and password resets.
 *
 * Deliberately dependency-free: Resend's HTTP API is one POST, and pulling in
 * an SMTP client to make one request would be the larger commitment. With no
 * RESEND_API_KEY the message is written to the server log instead of sent,
 * which is what local development wants — the link is right there in the
 * terminal — and means no part of registration depends on an outbound mail
 * provider being reachable.
 */

export interface Mail {
  to: string;
  subject: string;
  /** Plain text. Every message here is a sentence and a link; HTML would add
   * spam-filter surface and rendering bugs for no gain. */
  text: string;
}

export async function sendMail(mail: Mail): Promise<{ sent: boolean }> {
  if (!config.resendApiKey) {
    console.log(
      `\n--- email (not sent: RESEND_API_KEY unset) ---\nto: ${mail.to}\nsubject: ${mail.subject}\n\n${mail.text}\n--- end ---\n`
    );
    return { sent: false };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: config.mailFrom, to: [mail.to], subject: mail.subject, text: mail.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Never surfaced to the caller: whether an email left the building is not
      // something the user can act on, and reporting it back would turn a
      // provider outage into a failed registration.
      captureError(new Error(`Resend responded ${res.status}`), {
        scope: "mailer", extra: { subject: mail.subject, status: res.status },
      });
      return { sent: false };
    }
    return { sent: true };
  } catch (e) {
    captureError(e, { scope: "mailer", extra: { subject: mail.subject } });
    return { sent: false };
  }
}

const link = (path: string, token: string) =>
  `${config.publicAppUrl}${path}?token=${encodeURIComponent(token)}`;

export const verificationEmail = (to: string, token: string): Mail => ({
  to,
  subject: `${config.appName}: подтвердите адрес электронной почты`,
  text: `Здравствуйте!

Чтобы подтвердить этот адрес и активировать все функции аккаунта ${config.appName}, откройте ссылку:

${link("/verify-email", token)}

Ссылка действует ${config.emailTokenTtlHours} часа. Если вы не регистрировались в ${config.appName}, просто проигнорируйте это письмо — без подтверждения ничего не произойдёт.`,
});

export const passwordResetEmail = (to: string, token: string): Mail => ({
  to,
  subject: `${config.appName}: сброс пароля`,
  text: `Мы получили запрос на сброс пароля для этого адреса.

${link("/reset-password", token)}

Ссылка действует ${config.resetTokenTtlMinutes} минут и сработает только один раз.

Если вы этого не запрашивали — ничего делать не нужно, пароль останется прежним. Но если такие письма приходят регулярно, стоит сменить пароль: кто-то знает ваш адрес и пытается им воспользоваться.`,
});

export const passwordChangedEmail = (to: string): Mail => ({
  to,
  subject: `${config.appName}: пароль изменён`,
  // Sent after the fact, so a password change nobody made is visible to the
  // account's owner immediately rather than at the next failed login.
  text: `Пароль от вашего аккаунта ${config.appName} только что был изменён, все остальные сессии завершены.

Если это были не вы — немедленно восстановите доступ через «Забыли пароль?» и включите двухфакторную аутентификацию в профиле.`,
});
