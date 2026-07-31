/**
 * PFOS Domain Types — Core entities for the Personal Finance Operating System
 *
 * Phase 1 implements: FinancialProfile, DebtAccount, CashflowEvent,
 * DailyForecast, RiskAssessment, ActionItem, NegotiationCase,
 * CommunicationRecord, WeeklyReview, ConsentRecord, AuditEvent.
 *
 * MONEY STORAGE: All amounts use integer fen (分). 1 CNY = 100 fen.
 *   This eliminates floating-point rounding errors in financial calculations.
 *
 * @version 1.0.0 — PIOS-PFOS-DNOS Phase 1
 */

// ── Primitive aliases (semantic clarity) ─────────────────────

/** ISO 8601 date string: YYYY-MM-DD */
export type ISODate = string

/** ISO 8601 datetime string */
export type ISODateTime = string

/** Money amount stored as integer fen (分). 100 fen = 1 CNY */
export type MoneyFen = number

/** Supported currency — Phase 1: CNY only */
export type Currency = 'CNY'

// ── User & Consent ──────────────────────────────────────────

export interface User {
  id: string
  timezone: string
  currency: Currency
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ConsentRecord {
  id: string
  userId: string
  consentType: 'terms' | 'privacy' | 'risk_disclosure'
  documentVersion: string
  acceptedAt: ISODateTime
  revokedAt?: ISODateTime
}

// ── Asset Entry ───────────────────────────────────────────────

export interface AssetEntry {
  id: string
  userId: string
  type: 'deposit' | 'investment' | 'liquid' | 'other'
  label: string
  amountFen: MoneyFen                  // estimated value
  liquid: boolean                      // immediately usable as cash
  ownership: 'personal' | 'family' | 'authorized' | 'consent_required'
  realizableAmountFen: MoneyFen        // conservative amount after discount/fees
  availableDate: ISODate               // date proceeds can arrive
  availabilityKnown: boolean
  pledged?: boolean
  essentialUse?: boolean
  note?: string
  createdAt: ISODateTime
}

// ── Financial Profile ───────────────────────────────────────

export interface PaydayRule {
  id: string
  dayOfMonth?: number
  nextExpectedDate?: ISODate
  amountFen: MoneyFen
  confidence: 'confirmed' | 'estimated'
}

export interface FinancialProfile {
  id: string
  userId: string
  availableCashFen: MoneyFen
  protectedCashFen?: MoneyFen          // cash reserved for living, not for debt
  fixedMonthlyIncomeFen: MoneyFen
  variableMonthlyIncomeFen?: MoneyFen
  essentialMonthlyExpenseFen: MoneyFen
  paydayRules: PaydayRule[]
  householdBurdenNote?: string
  selfReportedStressLevel?: 1 | 2 | 3 | 4 | 5
  dataAsOf: ISODate
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

// ── Debt Account ────────────────────────────────────────────

export type DebtType =
  | 'credit_card'
  | 'bank_consumer_loan'
  | 'online_microloan'
  | 'installment'
  | 'secured_loan'
  | 'personal_borrowing'
  | 'other'

export type DebtStatus =
  | 'normal'
  | 'due_soon'
  | 'overdue'
  | 'negotiating'
  | 'restructured'
  | 'closed'

export type RepaymentMethod =
  | 'equal_installment'
  | 'minimum_payment'
  | 'interest_first'
  | 'balloon'
  | 'flexible'
  | 'unknown'

export interface DebtAccount {
  id: string
  userId: string
  creditorName: string
  debtType: DebtType
  currency: Currency
  outstandingPrincipalFen: MoneyFen
  currentAmountDueFen: MoneyFen    // next payment amount (本期应还)
  monthlyPaymentFen?: MoneyFen     // regular monthly payment after this one (常规月供)
  nextDueDate: ISODate
  dueDay?: number                  // day of month payment is due (1-31)
  termKnown?: boolean              // user knows remaining term
  termRemaining?: number           // months remaining
  annualRateBps?: number          // basis points (1/100 of 1%), e.g. 1500 = 15%
  totalCostNote?: string
  repaymentMethod: RepaymentMethod
  status: DebtStatus
  overdueSince?: ISODate
  expectedRepayDate?: ISODate      // for overdue debts: when user expects to repay
  hasCollateral: boolean
  hasGuarantor: boolean
  hasCoBorrower: boolean
  affectsEssentialLiving?: boolean
  userNote?: string
  dataConfidence: 'confirmed' | 'estimated' | 'unknown'
  source: 'manual' | 'imported'
  createdAt: ISODateTime
  updatedAt: ISODateTime
  deletedAt?: ISODateTime
}

// ── Cashflow ────────────────────────────────────────────────

export type CashflowEventType =
  | 'opening_balance'
  | 'income'
  | 'essential_expense'
  | 'debt_payment'
  | 'one_off_income'
  | 'one_off_expense'
  | 'adjustment'

export interface CashflowEvent {
  id: string
  userId: string
  relatedDebtId?: string
  eventType: CashflowEventType
  amountFen: MoneyFen
  direction: 'inflow' | 'outflow'
  scheduledDate: ISODate
  actualDate?: ISODate
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled'
  confidence: 'confirmed' | 'estimated'
  note?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface ForecastEvent {
  type: string          // 'income' | 'expense' | 'debt_payment' | 'asset_realization'
  direction: 'inflow' | 'outflow'
  label: string
  amountFen: MoneyFen
  debtId?: string
  assetId?: string
}

export interface DailyForecastPoint {
  date: ISODate
  openingBalanceFen: MoneyFen
  inflowFen: MoneyFen
  outflowFen: MoneyFen
  closingBalanceFen: MoneyFen
  events: ForecastEvent[]
  eventIds: string[]
}

export interface ForecastSnapshot {
  id: string
  userId: string
  startDate: ISODate
  endDate: ISODate
  ruleVersion: string
  inputVersion: string
  points: DailyForecastPoint[]
  firstNegativeDate?: ISODate
  minimumBalanceFen: MoneyFen
  gap30dFen: MoneyFen
  gap60dFen: MoneyFen
  gap90dFen: MoneyFen
  generatedAt: ISODateTime
}

// ── Risk & Priority ─────────────────────────────────────────

export type RiskLevel = 'low' | 'medium' | 'high' | 'urgent'
export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3'

export type RiskReasonCode =
  | 'OVERDUE'
  | 'DUE_WITHIN_3_DAYS'
  | 'DUE_WITHIN_7_DAYS'
  | 'INSUFFICIENT_CASH'
  | 'FORECAST_NEGATIVE'
  | 'HIGH_COST'
  | 'COLLATERAL_OR_GUARANTEE'
  | 'ESSENTIAL_LIVING_IMPACT'
  | 'MISSING_CRITICAL_DATA'

export type ActionCode =
  | 'VERIFY_DATA'
  | 'PREPARE_PAYMENT'
  | 'CONTACT_CREDITOR'
  | 'PREPARE_NEGOTIATION'
  | 'REVIEW_WRITTEN_TERMS'
  | 'SEEK_PROFESSIONAL_HELP'
  | 'UPDATE_RESULT'

export interface RiskAssessment {
  id: string
  userId: string
  debtId: string
  riskLevel: RiskLevel
  priority: PriorityLevel
  reasonCodes: RiskReasonCode[]
  recommendedActionCodes: ActionCode[]
  requiresHumanVerification: boolean
  ruleVersion: string
  inputVersion: string
  assessedAt: ISODateTime
}

export interface RiskEngineInput {
  asOfDate: ISODate
  profile: FinancialProfile
  debts: DebtAccount[]
  forecast: ForecastSnapshot
  ruleVersion: string
}

export interface RiskEngineOutput {
  assessments: RiskAssessment[]
  actions: ActionItem[]
  warnings: RiskWarning[]
}

export interface RiskWarning {
  code: string
  message: string
  relatedEntityId?: string
}

// ── Action Items ────────────────────────────────────────────

export interface ActionItem {
  id: string
  userId: string
  relatedDebtId?: string
  actionCode: ActionCode
  title: string
  reason: string
  dueAt?: ISODateTime
  priority: PriorityLevel
  status: 'todo' | 'doing' | 'done' | 'skipped' | 'expired'
  steps: string[]
  completedAt?: ISODateTime
  completionNote?: string
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

// ── Negotiation ─────────────────────────────────────────────

export interface NegotiationChecklistItem {
  code: string
  label: string
  status: 'missing' | 'ready' | 'not_applicable'
  note?: string
}

export interface NegotiationCase {
  id: string
  userId: string
  debtId: string
  status: 'preparing' | 'contacted' | 'awaiting_reply' | 'offer_received' | 'closed'
  verifiedMonthlyAffordableFen?: MoneyFen
  hardshipSummary?: string
  checklist: NegotiationChecklistItem[]
  createdAt: ISODateTime
  updatedAt: ISODateTime
}

export interface CommunicationRecord {
  id: string
  negotiationCaseId: string
  channel: 'official_phone' | 'official_app' | 'email' | 'branch' | 'other'
  contactedAt: ISODateTime
  contactParty?: string
  summary: string
  referenceNumber?: string
  promisedFollowUpDate?: ISODate
  attachmentIds?: string[]
  createdAt: ISODateTime
}

export interface NewOfferInput {
  newMonthlyPaymentFen: MoneyFen
  newFirstPaymentDate: ISODate
  newTermMonths?: number
  knownFeesFen?: MoneyFen
  hasWrittenConfirmation: boolean
  userNote?: string
}

export interface OfferComparisonResult {
  cashflowChange90d: {
    beforeGap30dFen: MoneyFen
    afterGap30dFen: MoneyFen
    beforeGap60dFen: MoneyFen
    afterGap60dFen: MoneyFen
    beforeGap90dFen: MoneyFen
    afterGap90dFen: MoneyFen
  }
  monthlyBurdenChange: {
    beforeMonthlyFen: MoneyFen
    afterMonthlyFen: MoneyFen
    differenceFen: MoneyFen
  }
  stillHasNegativeDate: boolean
  missingCriticalInfo: string[]
  disclaimerNote: string
}

// ── Weekly Review ───────────────────────────────────────────

export interface WeeklyReview {
  id: string
  userId: string
  weekStartDate: ISODate
  weekEndDate: ISODate
  plannedPayments: { debtId: string; plannedFen: MoneyFen; actualFen?: MoneyFen }[]
  actualIncomeFen?: MoneyFen
  actualExpenseFen?: MoneyFen
  newRisks: string[]
  resolvedRisks: string[]
  nextWeekTopEvents: string[]
  nextWeekTopPriority: string
  staleDataItems: string[]
  userNotes?: string
  createdAt: ISODateTime
}

// ── Audit ───────────────────────────────────────────────────

export interface AuditEvent {
  id: string
  userId: string
  eventType: AuditEventType
  targetEntityType: string
  targetEntityId?: string
  changes: string   // JSON summary, no sensitive full data
  timestamp: ISODateTime
}

export type AuditEventType =
  | 'consent_accepted'
  | 'debt_created'
  | 'debt_updated'
  | 'debt_archived'
  | 'forecast_recalculated'
  | 'risk_rule_version_changed'
  | 'negotiation_recorded'
  | 'report_exported'
  | 'data_deletion_requested'

// ── Report ──────────────────────────────────────────────────

export interface FinancialCheckupReport {
  id: string
  userId: string
  generatedAt: ISODateTime
  dataAsOf: ISODate
  ruleVersion: string
  totalDebtFen: MoneyFen
  totalDebtCount: number
  debtByType: Record<DebtType, { count: number; totalFen: MoneyFen }>
  overdueCount: number
  availableCashFen: MoneyFen
  monthlyIncomeFen: MoneyFen
  monthlyExpenseFen: MoneyFen
  monthlyDebtPaymentFen: MoneyFen
  forecast30dDueFen: MoneyFen
  forecast60dDueFen: MoneyFen
  forecast90dDueFen: MoneyFen
  firstNegativeDate?: ISODate
  riskSummary: { urgent: number; high: number; medium: number; low: number }
  topActions: ActionItem[]
  disclaimerVersion: string
}
