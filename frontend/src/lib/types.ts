/** MANAGER is the sales desk: the CRM and nothing else. It is not a weaker
 * ADMIN — the two grant disjoint powers apart from CRM access. */
export type Role = "USER" | "MANAGER" | "ADMIN";
export type UserStatus = "ACTIVE" | "SUSPENDED";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  status?: UserStatus;
  balance?: string;
  createdAt?: string;
  dateOfBirth?: string | null;
  avatar?: string | null;
  accountNumber?: string | null;
  emailVerified?: boolean;
  totpEnabled?: boolean;
  kycStatus?: KycStatus;
  /** Only present on /me — how many single-use recovery codes are left. */
  backupCodesRemaining?: number;
}

/** /login answers one of three ways: a finished session, a five-minute window
 * to prove the second factor, or — for an account the CRM created on
 * someone's behalf — a window to set a real password before anything else
 * works. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
}

export interface PasswordChangeChallenge {
  passwordChangeRequired: true;
  passwordChangeToken: string;
}

export interface SavingsPlan {
  type: string;
  label: string;
  apy: number;
  lockDays: number;
  description: string;
}

export interface SavingsAccount {
  id: string;
  planType: string;
  planLabel: string;
  balance: string;
  apy: number;
  lockedUntil: string | null;
  locked: boolean;
  /** What today pays at today's balance — computed server-side so the UI
   * cannot re-derive it slightly differently. */
  dailyInterest: string;
  projectedYear: string;
  status: string;
  createdAt: string;
}

export interface SavingsOverview {
  plans: SavingsPlan[];
  accounts: SavingsAccount[];
  totalSaved: string;
  totalEarned: string;
  kycRequired: boolean;
}

export type KycStatus = "NONE" | "PENDING" | "APPROVED" | "REJECTED";
export type KycDocumentType = "PASSPORT" | "ID_CARD" | "DRIVER_LICENSE";

export interface KycSubmission {
  id: string;
  status: KycStatus;
  documentType: KycDocumentType;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface KycState {
  status: KycStatus;
  emailVerified: boolean;
  /** False when document storage isn't configured — the form says so instead
   * of letting someone photograph a passport and then fail. */
  uploadAvailable: boolean;
  current: KycSubmission | null;
  history: KycSubmission[];
}

export interface KycSubmitInput {
  fullName: string;
  address: string;
  documentType: KycDocumentType;
  documentNumber: string;
  /** data: URI JPEGs, downscaled in the browser before upload. */
  documentFront: string;
  documentBack?: string;
  selfie: string;
}

export interface AdminKycRow {
  id: string;
  userId: string;
  email: string;
  userName: string;
  fullName: string;
  documentType: KycDocumentType;
  status: KycStatus;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface AdminKycListResponse {
  total: number;
  page: number;
  pageSize: number;
  storageConfigured: boolean;
  submissions: AdminKycRow[];
}

export interface AdminKycDetail {
  submission: AdminKycRow & { address: string; documentNumber: string };
  /** Signed links, valid for `expiresInSec`. Never stored, never reused. */
  documents: { front: string | null; back: string | null; selfie: string | null; expiresInSec: number };
}

export interface TotpSetup {
  /** Shown once during enrolment and never readable again. */
  secret: string;
  otpauthUrl: string;
  /** data: URI PNG of the otpauth URL. */
  qr: string;
}

export type Category = "SPOT" | "PERP" | "COMMODITY" | "FX" | "CFD";
export type PriceSource = "BINANCE" | "COINGECKO" | "ECB" | "SYNTHETIC" | "NONE";

export interface Instrument {
  symbol: string;
  name: string;
  category: Category;
  maxLeverage: number;
  priceDecimals: number;
  fundingRate: number;
  price: string | null;
  change24h: number;
  high24h: string | null;
  low24h: string | null;
  volume24h: string | null;
  source: PriceSource;
  updatedAt: string | null;
  /** False when the symbol is halted because its quote has gone stale. The
   * last known price is still shown; only trading is suspended. */
  tradeable: boolean;
}

export interface InstrumentsResponse {
  feed: { healthy: boolean; lastFetch: string | null; unhealthyForMs: number; degraded: boolean; maxQuoteAgeMs: number };
  instruments: Instrument[];
}

export interface Candle {
  t: number;
  o: string;
  h: string;
  l: string;
  c: string;
}

export interface CandlesResponse {
  symbol: string;
  tf: Timeframe;
  real: boolean;
  candles: Candle[];
}

export type Timeframe = "1m" | "5m" | "15m" | "1H" | "4H" | "1D" | "1W";

export type OrderSide = "BUY" | "SELL";
export type OrderType = "MARKET" | "LIMIT" | "STOP";
export type OrderStatus = "NEW" | "FILLED" | "CANCELLED";

export interface Order {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  qty: string;
  price: string;
  filledPrice: string | null;
  leverage: number;
  margin: string;
  fee: string;
  takeProfit: string | null;
  stopLoss: string | null;
  status: OrderStatus;
  createdAt: string;
  filledAt: string | null;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: string;
  entryPrice: string;
  markPrice: string;
  leverage: number;
  margin: string;
  liquidationPrice: string | null;
  takeProfit: string | null;
  stopLoss: string | null;
  notional: string;
  unrealisedPnl: string;
  roePct: number;
  openedAt: string;
}

export type CloseReason = "MANUAL" | "TAKE_PROFIT" | "STOP_LOSS" | "LIQUIDATION" | "ADMIN";

export interface Trade {
  id: string;
  symbol: string;
  side: OrderSide;
  qty: string;
  entryPrice: string;
  exitPrice: string;
  pnl: string;
  fee: string;
  closeReason: CloseReason;
  closedAt: string;
}

export interface Account {
  cash: string;
  usedMargin: string;
  lockedMargin: string;
  /** Principal held in savings accounts. Counted in `equity` — it is still
   * the trader's money — but not spendable until withdrawn back to cash. */
  savings: string;
  unrealisedPnl: string;
  realisedPnl: string;
  equity: string;
  marginUsagePct: number;
  openPositions: number;
  openOrders: number;
  totalTrades: number;
  winRatePct: number | null;
}

export type LedgerType =
  | "DEPOSIT" | "WITHDRAWAL" | "TRANSFER_OUT" | "TRANSFER_IN"
  | "MARGIN_HOLD" | "MARGIN_RELEASE" | "FEE" | "PNL" | "ADMIN_ADJUSTMENT"
  | "SAVINGS_DEPOSIT" | "SAVINGS_WITHDRAWAL" | "SAVINGS_INTEREST";

export interface LedgerEntry {
  id: string;
  type: LedgerType;
  amount: string;
  balanceAfter: string;
  note: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export type AlertDirection = "ABOVE" | "BELOW";

export interface Alert {
  id: string;
  symbol: string;
  direction: AlertDirection;
  price: string;
  firedAt: string | null;
  createdAt: string;
}

export interface WsPriceTick {
  symbol: string;
  price: string;
  change24h: number;
  high24h: string | null;
  low24h: string | null;
  source: PriceSource;
}

/* --------------------------------- admin --------------------------------- */

export interface AdminStats {
  users: number;
  activeUsers: number;
  openPositions: number;
  openOrders: number;
  closedTrades: number;
  totalCash: string;
  totalRealisedPnl: string;
  totalFees: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  name: string;
  role: Role;
  status: UserStatus;
  balance: string;
  openPositions: number;
  trades: number;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminUsersResponse {
  total: number;
  page: number;
  pageSize: number;
  users: AdminUserRow[];
}

export interface AdminUserDetail {
  user: {
    id: string; email: string; name: string; role: Role; status: UserStatus;
    kycStatus: KycStatus; emailVerified: boolean; crmPermissions: CrmPermission[];
    createdAt: string; lastLoginAt: string | null;
  };
  account: {
    cash: string; usedMargin: string; unrealisedPnl: string; realisedPnl: string;
    equity: string; marginUsagePct: number;
  };
  positions: Position[];
  orders: Order[];
  trades: Trade[];
  ledger: LedgerEntry[];
}

export interface AuditEntry {
  id: string;
  action: string;
  actor: string | null;
  target: string | null;
  meta: any;
  ip: string | null;
  createdAt: string;
}

export interface AuditResponse {
  total: number;
  entries: AuditEntry[];
}

/* ----------------------------- strategy bots ------------------------------ */
// Bots live on the server (server/src/engine/strategy.ts) and keep trading
// with no browser attached. Everything below mirrors what that engine stores:
// `config` is the definition the user created and never changes; `state` is
// the engine's own bookkeeping, read-only from here.

export type BotType = "GRID" | "MARTINGALE";
export type BotStatus = "RUNNING" | "STOPPED" | "ERROR";

export interface GridConfig {
  lower: string;
  upper: string;
  levels: number;
  qtyPerLevel: string;
  leverage: number;
}

export interface MartingaleConfig {
  side: OrderSide;
  baseQty: string;
  multiplier: number;
  maxSteps: number;
  takeProfitPct: number;
  addOnDrawdownPct: number;
  leverage: number;
}

export interface GridOrderRef {
  orderId: string;
  level: number;
  side: OrderSide;
  price: string;
}

export interface GridState { gridOrders: GridOrderRef[] }
export interface MartingaleState { positionIds: string[]; step: number }

interface BotBase {
  id: string;
  symbol: string;
  status: BotStatus;
  errorCount: number;
  lastError: string | null;
  estimatedCapital: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GridBot extends BotBase {
  type: "GRID";
  config: GridConfig;
  state: GridState;
}

export interface MartingaleBot extends BotBase {
  type: "MARTINGALE";
  config: MartingaleConfig;
  state: MartingaleState;
}

export type Bot = GridBot | MartingaleBot;

export interface BotLogEntry { ts: string; message: string }

export interface BotDetail {
  bot: Bot;
  logs: BotLogEntry[];
}

export type CreateBotInput =
  | { type: "GRID"; symbol: string; config: GridConfig }
  | { type: "MARTINGALE"; symbol: string; config: MartingaleConfig };

/* ----------------------------------- CRM ---------------------------------- */

export type LeadStatus =
  | "NEW" | "OLDDB" | "CALLBACK" | "WELCOME_CALL" | "NO_ANSWER"
  | "WRONG_INFO" | "LOW_POTENTIAL" | "NOT_INTERESTED" | "DENY_REG" | "UNDER_18";

/** Deliberately separate from LeadStatus: a lead can be VERIFIED and
 * NOT_INTERESTED at once, and one field could not say both. */
export type LeadVerificationStatus = "NOT_SUBMITTED" | "PENDING" | "VERIFIED" | "REJECTED";

export interface CrmManager {
  id: string;
  name: string;
  email: string;
  role?: Role;
}

export interface Lead {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  country: string | null;
  source: string | null;
  status: LeadStatus;
  verificationStatus: LeadVerificationStatus;
  assignedManager: CrmManager | null;
  /** Non-null once this lead registered on the platform. */
  platformUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Live account state, read from `users` on every request rather than copied
 * into the lead — null until the lead converts. */
export interface LeadPlatformInfo {
  userId: string;
  email: string;
  name: string;
  status: UserStatus;
  kycStatus: KycStatus;
  emailVerified: boolean;
  registeredAt: string | null;
  lastLoginAt: string | null;
  lastActionAt: string | null;
  balance: string | null;
}

export interface LeadDetail extends Lead {
  platform: LeadPlatformInfo | null;
}

export interface LeadComment {
  id: string;
  text: string;
  manager: CrmManager;
  createdAt: string;
}

export interface LeadHistoryEntry {
  id: string;
  kind: "STATUS" | "VERIFICATION";
  oldStatus: string | null;
  newStatus: string;
  manager: { id: string; name: string } | null;
  createdAt: string;
}

export interface LeadsResponse {
  total: number;
  page: number;
  pageSize: number;
  leads: Lead[];
}

/**
 * Powers beyond the base pipeline (read the board, move a lead through the
 * funnel, comment, edit its data) that every MANAGER already has. Each of
 * these reaches into a real account and real money, so an admin grants them
 * one at a time — see server/src/lib/crmPermissions.ts for the reasoning.
 */
export type CrmPermission = "IMPERSONATE" | "MANAGE_ACCOUNT" | "MANAGE_BALANCE" | "MANAGE_TRADES";

export interface CrmMeta {
  statuses: LeadStatus[];
  verificationStatuses: LeadVerificationStatus[];
  allPermissions: CrmPermission[];
  /** The calling manager's own grants — server re-checks every mutation
   * regardless, this is only for the UI to know which buttons to show. */
  myPermissions: CrmPermission[];
  managers: CrmManager[];
  /** Distinct source tags already in use, for the filter dropdown — source
   * is freeform text entered per import, not a fixed enum. */
  sources: string[];
}

export interface EditLeadInput {
  fullName?: string;
  phone?: string | null;
  email?: string | null;
  country?: string | null;
  source?: string | null;
}

export interface LeadCommentsResponse {
  total: number;
  page: number;
  pageSize: number;
  comments: LeadComment[];
}

/** The numbers half of an account snapshot — everything Account carries
 * except the trade-count/win-rate fields, which this endpoint has no reason
 * to compute for a support view. */
export type CrmAccountSummary = Omit<Account, "openPositions" | "openOrders" | "totalTrades" | "winRatePct">;

export interface CrmAccountSnapshot {
  summary: CrmAccountSummary;
  positions: Position[];
  openOrders: Order[];
  trades: Trade[];
  ledger: LedgerEntry[];
}

export interface CrmViewTokenResponse {
  token: string;
  expiresInMinutes: number;
}

/** What opening a one-time support link returns — a snapshot, not a session. */
export interface CrmViewSnapshot {
  leadName: string | null;
  viewedBy: string | null;
  account: CrmAccountSnapshot;
}

export interface ConvertLeadResponse {
  lead: LeadDetail;
  /** Shown exactly once — the server never stores or logs this value again. */
  temporaryPassword: string;
}

export interface ImportLeadInput {
  fullName: string;
  phone?: string;
  email?: string;
  country?: string;
  source?: string;
}

/* -------------------------------- errors --------------------------------- */

export interface ApiErrorBody {
  error: string;
  message: string;
  details?: unknown;
}
