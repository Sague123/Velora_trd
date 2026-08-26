import type { LeadStatus, LeadVerificationStatus } from "../../lib/types";

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
