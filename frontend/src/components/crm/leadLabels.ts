import type { CrmPermission, LeadStatus, LeadVerificationStatus } from "../../lib/types";

/**
 * Human labels and the colour each status carries.
 *
 * Colour here is meaning, not decoration, and it follows the design system's
 * one hard rule about buy/sell: those two are reserved for market direction, so
 * a funnel stage never uses them. A dead lead is `sell`-shaped in the abstract,
 * but on a trading platform a red chip means "short", and it must not appear on
 * a CRM row where it could be misread at a glance.
 *
 * Ten funnel stages is more than the four semantic tones (accent/warn/muted/
 * neutral) can tell apart at a glance, which used to leave four unrelated dead
 * ends (WRONG_INFO, LOW_POTENTIAL, NOT_INTERESTED, DENY_REG) sharing one grey
 * "muted" chip — indistinguishable in the list. The `cat-*` tones below (see
 * globals.css) exist for exactly this: nine visually distinct hues, none of
 * them buy-green or sell-red, each pre-verified for contrast. Two statuses
 * that are genuinely the same *kind* of dead end still share a tone on purpose
 * — DENY_REG and UNDER_18 are both a hard compliance stop, not a judgement
 * call the desk made, and colour should say so.
 */
export type Tone = "accent" | "warn" | "muted" | "neutral"
  | "cat-gold" | "cat-teal" | "cat-indigo" | "cat-violet" | "cat-magenta" | "cat-rose";

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Новый",
  OLDDB: "Старая база",
  CALLBACK: "Перезвонить",
  WELCOME_CALL: "Приветственный звонок",
  NO_ANSWER: "Не отвечает",
  WRONG_INFO: "Неверные данные",
  LOW_POTENTIAL: "Низкий потенциал",
  NOT_INTERESTED: "Не заинтересован",
  DENY_REG: "Отказ в регистрации",
  UNDER_18: "Младше 18",
};

/** One distinct tone per stage (see the module doc above for the two that
 * intentionally share one). */
export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "accent",
  WELCOME_CALL: "cat-teal",
  CALLBACK: "warn",
  NO_ANSWER: "cat-gold",
  OLDDB: "neutral",
  LOW_POTENTIAL: "cat-indigo",
  WRONG_INFO: "cat-violet",
  NOT_INTERESTED: "cat-magenta",
  DENY_REG: "cat-rose",
  UNDER_18: "cat-rose",
};

export const VERIFICATION_LABEL: Record<LeadVerificationStatus, string> = {
  NOT_SUBMITTED: "Не подана",
  PENDING: "На проверке",
  VERIFIED: "Подтверждена",
  REJECTED: "Отклонена",
};

export const VERIFICATION_TONE: Record<LeadVerificationStatus, Tone> = {
  NOT_SUBMITTED: "neutral",
  PENDING: "warn",
  VERIFIED: "accent",
  REJECTED: "cat-rose",
};

export const TONE_CLASS: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn/10 text-warn",
  muted: "bg-bg-3 text-txt-2",
  neutral: "bg-bg-3 text-txt-1",
  "cat-gold": "bg-cat-gold-soft text-cat-gold",
  "cat-teal": "bg-cat-teal-soft text-cat-teal",
  "cat-indigo": "bg-cat-indigo-soft text-cat-indigo",
  "cat-violet": "bg-cat-violet-soft text-cat-violet",
  "cat-magenta": "bg-cat-magenta-soft text-cat-magenta",
  "cat-rose": "bg-cat-rose-soft text-cat-rose",
};

/** Text-only counterpart of TONE_CLASS, no background — for highlighting a
 * lead's name by its own status colour in the table and the card header,
 * where a full pill would be too heavy for running text. `muted`/`neutral`
 * intentionally fall back to the normal body colour: a status that reads as
 * "nothing special" should not tint the one piece of text every row leads
 * with. */
export const TONE_TEXT_CLASS: Record<Tone, string> = {
  accent: "text-accent",
  warn: "text-warn",
  muted: "text-txt-0",
  neutral: "text-txt-0",
  "cat-gold": "text-cat-gold",
  "cat-teal": "text-cat-teal",
  "cat-indigo": "text-cat-indigo",
  "cat-violet": "text-cat-violet",
  "cat-magenta": "text-cat-magenta",
  "cat-rose": "text-cat-rose",
};

/** Each power an admin can grant a manager beyond the base CRM pipeline —
 * see server/src/lib/crmPermissions.ts for why these four specifically. */
export const CRM_PERMISSION_LABEL: Record<CrmPermission, string> = {
  IMPERSONATE: "Просмотр аккаунта клиента (read-only)",
  MANAGE_ACCOUNT: "Блокировка / разблокировка аккаунта",
  MANAGE_BALANCE: "Корректировка баланса",
  MANAGE_TRADES: "Закрытие позиций и отмена ордеров",
};

export const CRM_PERMISSION_HINT: Record<CrmPermission, string> = {
  IMPERSONATE: "Одноразовая ссылка на снимок баланса, позиций и ордеров клиента — без входа в его сессию.",
  MANAGE_ACCOUNT: "Может заблокировать или разблокировать аккаунт клиента.",
  MANAGE_BALANCE: "Может зачислять и списывать средства с баланса клиента.",
  MANAGE_TRADES: "Может закрывать позиции и отменять ордера клиента.",
};
