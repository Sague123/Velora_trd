import type {
  CallResult, CrmPermission, LeadAccountStatus, LeadStatus, LeadVerificationStatus, NextActionType,
} from "../../lib/types";

/**
 * The four semantic tones plus the `cat-*` categorical palette (see
 * globals.css) — nine visually distinct hues, none of them buy-green or
 * sell-red, each pre-verified for contrast. They exist for exactly this
 * screen: a set of unrelated categories that have to be told apart at a
 * glance and carry no direction of their own.
 *
 * Colour here is meaning, not decoration, and it follows the design system's
 * one hard rule about buy/sell: those two are reserved for market direction,
 * so no funnel stage uses them. A dead lead is `sell`-shaped in the abstract,
 * but on a trading platform a red chip means "short", and it must not appear
 * on a CRM row where it could be misread.
 */
export type Tone = "accent" | "warn" | "muted" | "neutral"
  | "cat-gold" | "cat-teal" | "cat-indigo" | "cat-violet" | "cat-magenta" | "cat-rose";

/**
 * The funnel, split in two.
 *
 * `PIPELINE_STAGES` is the path a lead walks when things go well, in order —
 * each entry is progress on the previous one. `TERMINAL_STATUSES` is where a
 * lead stops. They used to be one flat list, which is what made "не отвечает"
 * sit between "перезвонить" and "приветственный звонок" with nothing saying
 * which way was forward.
 */
export const PIPELINE_STAGES: LeadStatus[] = [
  "NEW", "CONTACTED", "QUALIFIED", "CALLBACK", "WELCOME_CALL", "REGISTERED", "DEPOSITED", "ACTIVE",
];

export const TERMINAL_STATUSES: LeadStatus[] = [
  "OLDDB", "NO_ANSWER", "WRONG_INFO", "LOW_POTENTIAL", "NOT_INTERESTED", "DENY_REG", "UNDER_18", "LOST",
];

/** 1-based position in the pipeline, or 0 for a terminal outcome. A chip that
 * reads "Квалифицирован 3/8" says how far along without needing a hue nobody
 * could tell from the other seven. */
export function pipelineStep(status: LeadStatus): number {
  return PIPELINE_STAGES.indexOf(status) + 1;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Новый",
  CONTACTED: "Дозвонились",
  QUALIFIED: "Квалифицирован",
  CALLBACK: "Перезвонить",
  WELCOME_CALL: "Приветственный звонок",
  REGISTERED: "Зарегистрирован",
  DEPOSITED: "Внёс депозит",
  ACTIVE: "Активно торгует",
  OLDDB: "Старая база",
  NO_ANSWER: "Не отвечает",
  WRONG_INFO: "Неверные данные",
  LOW_POTENTIAL: "Низкий потенциал",
  NOT_INTERESTED: "Не заинтересован",
  DENY_REG: "Отказ в регистрации",
  UNDER_18: "Младше 18",
  LOST: "Потерян",
};

/**
 * Sixteen stages is far past what any palette can keep apart at a glance, so
 * hue stops trying to name the stage and names the *phase* instead — the
 * pipeline's three (первый контакт → договорённость → клиент), and one hue
 * per terminal outcome, which is where telling them apart actually pays off.
 * Inside the pipeline the step number carries the rest.
 *
 * No stage uses buy/sell: on a trading platform a red chip means "short", and
 * it must not appear on a CRM row where it could be misread at a glance.
 */
export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "accent",
  CONTACTED: "accent",
  QUALIFIED: "accent",
  CALLBACK: "warn",
  WELCOME_CALL: "warn",
  REGISTERED: "cat-teal",
  DEPOSITED: "cat-teal",
  ACTIVE: "cat-teal",
  OLDDB: "neutral",
  NO_ANSWER: "cat-gold",
  WRONG_INFO: "cat-violet",
  LOW_POTENTIAL: "cat-indigo",
  NOT_INTERESTED: "cat-magenta",
  DENY_REG: "cat-rose",
  UNDER_18: "cat-rose",
  LOST: "muted",
};

/**
 * The platform account behind the lead — deliberately its own column, because
 * a lead who said "не интересно" can still have a funded, active account, and
 * the desk needs to see both at once. Derived server-side from the account
 * relation; nothing here is a second copy of it.
 */
export const ACCOUNT_STATUS_LABEL: Record<LeadAccountStatus, string> = {
  NO_ACCOUNT: "Нет аккаунта",
  REGISTERED: "Зарегистрирован",
  KYC_PENDING: "KYC на проверке",
  KYC_VERIFIED: "KYC пройден",
  ACTIVE: "Активен",
  BLOCKED: "Заблокирован",
};

export const ACCOUNT_STATUS_TONE: Record<LeadAccountStatus, Tone> = {
  NO_ACCOUNT: "muted",
  REGISTERED: "neutral",
  KYC_PENDING: "warn",
  KYC_VERIFIED: "cat-teal",
  ACTIVE: "accent",
  BLOCKED: "cat-rose",
};

export const NEXT_ACTION_LABEL: Record<NextActionType, string> = {
  CALL: "Звонок",
  FOLLOW_UP: "Follow-up",
  KYC: "KYC",
  OTHER: "Другое",
};

export const CALL_RESULT_LABEL: Record<CallResult, string> = {
  NO_ANSWER: "Не ответил",
  BUSY: "Занято",
  CALL_BACK: "Просил перезвонить",
  INTERESTED: "Заинтересован",
  NOT_INTERESTED: "Не заинтересован",
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
