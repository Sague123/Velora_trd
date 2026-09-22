import type {
  CallResult, CrmPermission, LeadActivityStatus, LeadKycStatus, LeadStatus, NextActionType,
} from "../../lib/types";

/**
 * One tone per meaning, and — the part that matters — one *scale* per
 * question.
 *
 * The CRM used to carry four overlapping status scales (funnel stage, the
 * lead's own verification copy, a derived account state, and the platform's
 * KYC), which between them spent the same six hues on unrelated facts: amber
 * meant five different things depending on which column it landed in. They
 * are now one lead funnel plus three independent client fields, and each
 * scale owns its own hues.
 *
 * `crm-*` are CRM-scoped tokens that merely look green/red — the design
 * system's buy/sell stay reserved for market direction, because a green chip
 * on a trading platform reads as "long" and a sales stage must never say that.
 */
export type Tone =
  | "accent" | "warn" | "muted" | "neutral" | "grey-deep"
  | "cat-gold" | "cat-teal" | "cat-indigo" | "cat-violet" | "cat-magenta" | "cat-rose"
  | "crm-green" | "crm-red" | "crm-coral" | "crm-crimson" | "crm-deposit";

export const TONE_CLASS: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent",
  warn: "bg-warn/10 text-warn",
  muted: "bg-bg-3 text-txt-2",
  neutral: "bg-bg-3 text-txt-1",
  // The most recessive chip in the set: no fill at all, just an outline. A
  // "dead" status should sit back without dropping its text below the 4.5:1
  // floor, which is what a darker grey fill would have forced.
  "grey-deep": "border border-line text-txt-3",
  "cat-gold": "bg-cat-gold-soft text-cat-gold",
  "cat-teal": "bg-cat-teal-soft text-cat-teal",
  "cat-indigo": "bg-cat-indigo-soft text-cat-indigo",
  "cat-violet": "bg-cat-violet-soft text-cat-violet",
  "cat-magenta": "bg-cat-magenta-soft text-cat-magenta",
  "cat-rose": "bg-cat-rose-soft text-cat-rose",
  "crm-green": "bg-crm-green-soft text-crm-green",
  "crm-red": "bg-crm-red-soft text-crm-red",
  "crm-coral": "bg-crm-coral-soft text-crm-coral",
  "crm-crimson": "bg-crm-crimson-soft text-crm-crimson",
  // The only solid chip in the CRM — Deposited is the stage the desk is paid
  // to reach, so it outranks the other greens by weight rather than by hue.
  "crm-deposit": "bg-crm-deposit-fill font-semibold text-white",
};

/* ------------------------------ lead funnel ------------------------------- */

/**
 * The lead's single status, from arrival to first deposit.
 *
 * `PIPELINE_STAGES` is the path forward — each one is progress on the last,
 * and a chip reading "Call back 3/4" says how far along without needing a hue
 * nobody could rank. `TERMINAL_STATUSES` is where a lead stops, and there the
 * hue does the work, because telling one stop reason from another is exactly
 * what the desk reads that column for.
 */
export const PIPELINE_STAGES: LeadStatus[] = ["NEW", "WELCOME_CALL", "CALLBACK", "DEPOSITED"];

export const TERMINAL_STATUSES: LeadStatus[] = [
  "LOW_POTENTIAL", "NOT_INTERESTED", "WRONG_INFO", "UNDER_18",
  "HANG_UP", "NO_ANSWER", "DENY_REG", "TRASH", "LOST",
];

/** 1-based position in the funnel, or 0 for a stop reason. */
export function pipelineStep(status: LeadStatus): number {
  return PIPELINE_STAGES.indexOf(status) + 1;
}

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  WELCOME_CALL: "Welcome call",
  CALLBACK: "Call back",
  DEPOSITED: "Deposited",
  LOW_POTENTIAL: "Low potential",
  NOT_INTERESTED: "Not interested",
  WRONG_INFO: "Wrong info",
  UNDER_18: "Under 18",
  HANG_UP: "Hang up",
  NO_ANSWER: "No answer",
  DENY_REG: "Deny reg",
  TRASH: "Trash",
  LOST: "Lost",
};

export const LEAD_STATUS_TONE: Record<LeadStatus, Tone> = {
  NEW: "cat-rose",
  WELCOME_CALL: "cat-teal",
  CALLBACK: "crm-green",
  DEPOSITED: "crm-deposit",
  LOW_POTENTIAL: "cat-gold",
  // Three refusals, three distinguishable reds: they are separate reasons and
  // the desk works them differently, so collapsing them to one hue would lose
  // the only thing this column is read for.
  NOT_INTERESTED: "crm-red",
  WRONG_INFO: "crm-coral",
  UNDER_18: "crm-crimson",
  // Unreachable or not a real lead: one grey, because the distinction between
  // them matters far less than the distinction from everything above.
  HANG_UP: "muted",
  NO_ANSWER: "muted",
  DENY_REG: "muted",
  TRASH: "muted",
  LOST: "grey-deep",
};

/** What each status actually means, shown on hover. Thirteen stages is more
 * than anyone keeps in their head, and a desk guessing at "Trash vs Deny reg"
 * files leads inconsistently. */
export const LEAD_STATUS_HINT: Record<LeadStatus, string> = {
  NEW: "Только попал в CRM, с ним ещё никто не работал.",
  WELCOME_CALL: "Взят в работу, сделан первый звонок.",
  CALLBACK: "Договорились созвониться — время согласовано.",
  DEPOSITED: "Внёс первый депозит. С этого момента это клиент, и дальше его описывают KYC, активность и флаг VIP.",
  LOW_POTENTIAL: "Тянет, переносит, пропускает звонки — интерес есть, но слабый.",
  NOT_INTERESTED: "Прямо сказал, что ему не интересно.",
  WRONG_INFO: "Неверные данные: имя, телефон или email не совпадают.",
  UNDER_18: "Несовершеннолетний — работать с ним нельзя. Отдельная причина, не путать с неверными данными.",
  HANG_UP: "Сбрасывает звонок.",
  NO_ANSWER: "Долго не берёт трубку.",
  DENY_REG: "Попросил удалить регистрацию.",
  TRASH: "Шутники и заведомо неправильные регистрации.",
  LOST: "Закрыт после нескольких неудачных попыток связаться.",
};

/* ----------------------------- client fields ------------------------------ */
/* Three independent axes, deliberately not one scale: a client can be
 * KYC-verified and Churned at the same time, and a VIP can be any of them. */

export const KYC_STATUS_LABEL: Record<LeadKycStatus, string> = {
  NO_KYC: "No KYC",
  WAITING: "Waiting KYC",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const KYC_STATUS_TONE: Record<LeadKycStatus, Tone> = {
  // Yellow, not red: nothing has been refused, it simply hasn't been done.
  NO_KYC: "cat-gold",
  WAITING: "warn",
  VERIFIED: "crm-green",
  REJECTED: "crm-red",
};

export const KYC_STATUS_HINT: Record<LeadKycStatus, string> = {
  NO_KYC: "Документы ещё не подавались. Это не отказ — просто шаг не сделан.",
  WAITING: "Документы поданы и ждут решения комплаенса.",
  VERIFIED: "Личность подтверждена, вывод средств доступен.",
  REJECTED: "Комплаенс отклонил документы — нужны новые.",
};

export const ACTIVITY_STATUS_LABEL: Record<LeadActivityStatus, string> = {
  ACTIVE_TRADER: "Active trader",
  LOW_TRADER: "Low trader",
  INACTIVE: "Inactive",
  CHURNED: "Churned",
};

export const ACTIVITY_STATUS_TONE: Record<LeadActivityStatus, Tone> = {
  ACTIVE_TRADER: "crm-green",
  LOW_TRADER: "muted",
  INACTIVE: "neutral",
  CHURNED: "grey-deep",
};

export const ACTIVITY_STATUS_HINT: Record<LeadActivityStatus, string> = {
  ACTIVE_TRADER: "Торгует регулярно.",
  LOW_TRADER: "Торгует редко и на небольшие суммы.",
  INACTIVE: "Давно не заходил в терминал.",
  CHURNED: "Вывел все средства и ушёл.",
};

export const VIP_LABEL = "VIP";
export const VIP_TONE: Tone = "cat-violet";
export const VIP_HINT = "Крупный клиент. Флаг независим от активности — VIP может быть и Active trader, и Churned.";

/* ------------------------------- the rest --------------------------------- */

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
