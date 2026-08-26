import type { CrmPermission, LeadStatus, LeadVerificationStatus } from "../../lib/types";

/**
 * Human labels and the colour each status carries.
 *
 * Colour here is meaning, not decoration, and it follows the design system's
 * one hard rule about buy/sell: those two are reserved for market direction, so
 * a funnel stage never uses them. A dead lead is `sell`-shaped in the abstract,
 * but on a trading platform a red chip means "short", and it must not appear on
 * a CRM row where it could be misread at a glance.
 */
export type Tone = "accent" | "warn" | "muted" | "neutral";

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

/** Live work in accent, needs-chasing in warn, closed-out in muted. */
export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "accent",
  OLDDB: "neutral",
  CALLBACK: "warn",
  WELCOME_CALL: "accent",
  NO_ANSWER: "warn",
  WRONG_INFO: "muted",
  LOW_POTENTIAL: "muted",
  NOT_INTERESTED: "muted",
  DENY_REG: "muted",
  UNDER_18: "muted",
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
  REJECTED: "muted",
};

export const TONE_CLASS: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn/10 text-warn",
  muted: "bg-bg-3 text-txt-2",
  neutral: "bg-bg-3 text-txt-1",
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
