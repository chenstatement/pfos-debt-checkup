/**
 * Zod validation schemas for all PFOS domain entities.
 *
 * These schemas serve as the single source of truth for:
 * - Client-side form validation (React Hook Form + Zod resolver)
 * - Server-side API validation
 * - Data import/export validation
 */

import { z } from 'zod'

// ── Primitives ─────────────────────────────────────────────

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式须为 YYYY-MM-DD')
const isoDateTime = z.string().datetime()
const moneyFen = z.number().int('金额须为整数分').min(0, '金额不能为负').max(100_000_000_00, '金额超出合理范围')
const moneyFenAdjustable = z.number().int('金额须为整数分').max(100_000_000_00, '金额超出合理范围') // allows negative for adjustments

// ── Consent ────────────────────────────────────────────────

export const consentRecordSchema = z.object({
  consentType: z.enum(['terms', 'privacy', 'risk_disclosure']),
  documentVersion: z.string().min(1),
  acceptedAt: isoDateTime,
})

// ── Financial Profile ──────────────────────────────────────

export const paydayRuleSchema = z.object({
  id: z.string(),
  dayOfMonth: z.number().int().min(1).max(31).optional(),
  nextExpectedDate: isoDate.optional(),
  amountFen: moneyFen,
  confidence: z.enum(['confirmed', 'estimated']),
})

export const financialProfileSchema = z.object({
  availableCashFen: moneyFen,
  fixedMonthlyIncomeFen: moneyFen,
  variableMonthlyIncomeFen: moneyFen.optional(),
  essentialMonthlyExpenseFen: moneyFen,
  paydayRules: z.array(paydayRuleSchema).default([]),
  householdBurdenNote: z.string().optional(),
  selfReportedStressLevel: z.number().int().min(1).max(5).optional(),
  dataAsOf: isoDate,
})

// ── Debt Account ───────────────────────────────────────────

export const debtAccountSchema = z.object({
  creditorName: z.string().min(1, '请输入债权方名称').max(100),
  debtType: z.enum([
    'credit_card', 'bank_consumer_loan', 'online_microloan',
    'installment', 'secured_loan', 'personal_borrowing', 'other',
  ]),
  outstandingPrincipalFen: moneyFen,
  currentAmountDueFen: moneyFen,
  nextDueDate: isoDate,
  annualRateBps: z.number().int().min(0).max(10000).optional(), // max 100% = 10000 bps
  totalCostNote: z.string().optional(),
  repaymentMethod: z.enum([
    'equal_installment', 'minimum_payment', 'interest_first',
    'balloon', 'flexible', 'unknown',
  ]),
  status: z.enum(['normal', 'due_soon', 'overdue', 'negotiating', 'restructured', 'closed']),
  overdueSince: isoDate.optional(),
  hasCollateral: z.boolean().default(false),
  hasGuarantor: z.boolean().default(false),
  hasCoBorrower: z.boolean().default(false),
  affectsEssentialLiving: z.boolean().default(false),
  userNote: z.string().max(500).optional(),
  dataConfidence: z.enum(['confirmed', 'estimated', 'unknown']).default('confirmed'),
})

// ── Cashflow Event ─────────────────────────────────────────

export const cashflowEventSchema = z.object({
  relatedDebtId: z.string().optional(),
  eventType: z.enum([
    'opening_balance', 'income', 'essential_expense',
    'debt_payment', 'one_off_income', 'one_off_expense', 'adjustment',
  ]),
  amountFen: moneyFenAdjustable,
  direction: z.enum(['inflow', 'outflow']),
  scheduledDate: isoDate,
  actualDate: isoDate.optional(),
  status: z.enum(['planned', 'confirmed', 'completed', 'cancelled']),
  confidence: z.enum(['confirmed', 'estimated']),
  note: z.string().optional(),
})

// ── Negotiation ────────────────────────────────────────────

export const negotiationChecklistItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  status: z.enum(['missing', 'ready', 'not_applicable']),
  note: z.string().optional(),
})

export const communicationRecordSchema = z.object({
  channel: z.enum(['official_phone', 'official_app', 'email', 'branch', 'other']),
  contactedAt: isoDateTime,
  contactParty: z.string().optional(),
  summary: z.string().min(1, '请填写沟通摘要'),
  referenceNumber: z.string().optional(),
  promisedFollowUpDate: isoDate.optional(),
})

export const newOfferInputSchema = z.object({
  newMonthlyPaymentFen: moneyFen,
  newFirstPaymentDate: isoDate,
  newTermMonths: z.number().int().positive().optional(),
  knownFeesFen: moneyFen.optional(),
  hasWrittenConfirmation: z.boolean(),
  userNote: z.string().optional(),
})

// ── Action Item ────────────────────────────────────────────

export const actionItemSchema = z.object({
  relatedDebtId: z.string().optional(),
  actionCode: z.enum([
    'VERIFY_DATA', 'PREPARE_PAYMENT', 'CONTACT_CREDITOR',
    'PREPARE_NEGOTIATION', 'REVIEW_WRITTEN_TERMS',
    'SEEK_PROFESSIONAL_HELP', 'UPDATE_RESULT',
  ]),
  title: z.string().min(1),
  reason: z.string(),
  dueAt: isoDateTime.optional(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  status: z.enum(['todo', 'doing', 'done', 'skipped', 'expired']),
  steps: z.array(z.string()),
  completedAt: isoDateTime.optional(),
  completionNote: z.string().optional(),
})

// ── Weekly Review ──────────────────────────────────────────

export const weeklyReviewSchema = z.object({
  weekStartDate: isoDate,
  weekEndDate: isoDate,
  plannedPayments: z.array(z.object({
    debtId: z.string(),
    plannedFen: moneyFen,
    actualFen: moneyFen.optional(),
  })),
  actualIncomeFen: moneyFen.optional(),
  actualExpenseFen: moneyFen.optional(),
  newRisks: z.array(z.string()),
  resolvedRisks: z.array(z.string()),
  nextWeekTopEvents: z.array(z.string()),
  nextWeekTopPriority: z.string(),
  staleDataItems: z.array(z.string()),
  userNotes: z.string().optional(),
})

// ── Export type inference helpers ──────────────────────────

export type FinancialProfileInput = z.infer<typeof financialProfileSchema>
export type DebtAccountInput = z.infer<typeof debtAccountSchema>
export type CashflowEventInput = z.infer<typeof cashflowEventSchema>
export type CommunicationRecordInput = z.infer<typeof communicationRecordSchema>
export type NewOfferInputSchema = z.infer<typeof newOfferInputSchema>
export type ActionItemInput = z.infer<typeof actionItemSchema>
export type WeeklyReviewInput = z.infer<typeof weeklyReviewSchema>
