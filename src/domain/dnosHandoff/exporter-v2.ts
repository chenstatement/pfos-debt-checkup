import canonicalize from 'canonicalize'
import { v4 as uuidv4 } from 'uuid'
import type { DebtAccount } from '../types'
import {
  DNOS_HANDOFF_V2_SCHEMA_VERSION,
  type PfosDnosCalculationSnapshotV2,
  type PfosDnosExportV2ErrorCode,
  type PfosDnosExportV2Result,
  type PfosDnosExporterV2Input,
  type PfosDnosHandoffV2,
} from './contract-v2'

function isSafeFen(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000_000
}

function fen(value: unknown): number { return isSafeFen(value) ? value : 0 }
function resultError(code: PfosDnosExportV2ErrorCode, message: string, missingFields: string[] = []): PfosDnosExportV2Result { return { ok: false, code, message, missingFields } }
function activeDebts(debts: DebtAccount[]) { return debts.filter((debt) => debt.deletedAt === undefined && debt.status !== 'closed').sort((a, b) => a.id.localeCompare(b.id)) }
function isoDate(value: unknown): string | null { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null }
async function sha256(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function hasSensitiveValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveValue)
  if (!value || typeof value !== 'object') return typeof value === 'string' && [/(?<!\d)1[3-9]\d{9}(?!\d)/, /\b\d{17}[0-9Xx]\b/, /\b\d{16,19}\b/, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, /(?:[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|C:\\Users\\)/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/].some((pattern) => pattern.test(value))
  return Object.values(value).some(hasSensitiveValue)
}
function daysBetween(start: string | undefined, end: string): number {
  if (!start) return 0
  const from = Date.parse(`${start}T00:00:00Z`)
  const to = Date.parse(`${end}T00:00:00Z`)
  return Number.isFinite(from) && Number.isFinite(to) ? Math.max(0, Math.floor((to - from) / 86_400_000)) : 0
}
function mapDebtType(type: DebtAccount['debtType']): string {
  return ({ online_microloan: 'microloan', personal_borrowing: 'private_loan', installment: 'installment_purchase', secured_loan: 'secured_mortgage' } as Record<string, string>)[type] || type
}
function confidence(value: DebtAccount['dataConfidence']): 'document_verified' | 'institution_confirmed' | 'self_reported' | 'estimated' | 'unknown' {
  return value === 'confirmed' ? 'self_reported' : value
}

export async function exportDnosHandoffV2(input: PfosDnosExporterV2Input, options: { packageId?: string; exportedAt?: string; sourceAppVersion?: string; sourceRuleVersion?: string } = {}): Promise<PfosDnosExportV2Result> {
  if (!input.consent?.id || !input.consent.acceptedAt || input.consent.revokedAt) return resultError('CONSENT_REQUIRED', '请先确认未撤回的 PFOS 数据用途授权。', ['consent'])
  if (!isSafeFen(input.profile.availableCashFen)) return resultError('AVAILABLE_CASH_REQUIRED', '缺少可用现金数据。', ['cashflow.available_cash_fen'])
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataAsOf)) return resultError('INVALID_DATE', '数据截止日期格式无效。', ['data_as_of'])
  const debts = activeDebts(input.debts)
  if (debts.length === 0) return resultError('ACTIVE_DEBT_REQUIRED', '至少需要一笔未结清债务。', ['debts'])
  const necessaryExpense = fen(input.profile.essentialMonthlyExpenseFen) || input.expenses.filter((item) => item.essential !== false).reduce((sum, item) => sum + fen(item.amountFen), 0)
  if (!isSafeFen(necessaryExpense)) return resultError('ESSENTIAL_EXPENSE_REQUIRED', '缺少必要支出数据。', ['cashflow.necessary_monthly_expense_fen'])
  if (hasSensitiveValue(input.incomes) || hasSensitiveValue(input.expenses) || hasSensitiveValue(input.assets) || hasSensitiveValue(input.householdObligations)) return resultError('PII_VALUE_SUSPECTED', '输入的自由字段疑似含有隐私值，已拒绝导出。', ['business_detail.free_text'])

  const packageId = options.packageId || uuidv4()
  const fixedIncome = fen(input.profile.fixedMonthlyIncomeFen)
  const variableIncome = fen(input.profile.variableMonthlyIncomeFen)
  const monthlyIncome = fixedIncome + variableIncome
  const monthlyDebtDue = debts.reduce((sum, debt) => sum + fen(debt.monthlyPaymentFen ?? debt.currentAmountDueFen), 0)
  const monthlyNetBeforeDebt = monthlyIncome - necessaryExpense
  const protectedCash = Math.min(fen(input.profile.protectedCashFen), fen(input.profile.availableCashFen))
  const missingFields: Record<string, unknown>[] = []
  const necessaryExpenseItems = input.expenses.filter((item) => item.essential !== false)
  const necessaryExpenseBreakdownTotal = necessaryExpenseItems.reduce((sum, item) => sum + fen(item.amountFen), 0)
  if (monthlyIncome === 0) missingFields.push({ path: '/cashflow/floor_monthly_income_fen', reason_code: 'not_collected', severity: 'blocking', blocks: ['offer_acceptance', 'client_ready_report'], acquisition_code: 'RETURN_TO_PFOS' })
  if (input.profile.fixedMonthlyIncomeFen === undefined && input.incomes.length === 0) missingFields.push({ path: '/income_streams', reason_code: 'not_collected', severity: 'blocking', blocks: ['baseline'], acquisition_code: 'RETURN_TO_PFOS' })
  if (input.expenses.length === 0) missingFields.push({ path: '/expense_items', reason_code: 'not_collected', severity: 'important', blocks: ['baseline'], acquisition_code: 'RETURN_TO_PFOS' })
  if (necessaryExpenseItems.length > 0 && necessaryExpenseBreakdownTotal !== necessaryExpense) missingFields.push({ path: '/cashflow/necessary_expense_breakdown', reason_code: 'conflicting_sources', severity: 'important', blocks: ['baseline'], acquisition_code: 'RETURN_TO_PFOS' })
  const entityRefs = new Map<string, string>()
  const debtsPayload = debts.map((debt, index) => {
    const entityRef = entityRefs.get(debt.creditorName) || `ENTITY_${String(entityRefs.size + 1).padStart(3, '0')}`
    entityRefs.set(debt.creditorName, entityRef)
    const overdueDays = debt.status === 'overdue' ? daysBetween(debt.overdueSince, input.dataAsOf) : 0
    const delinquencyState = debt.status === 'overdue' ? (overdueDays <= 30 ? 'days_1_30' : overdueDays <= 90 ? 'days_31_90' : 'days_91_plus') : 'current'
    return {
      debt_ref: `DEBT_${String(index + 1).padStart(3, '0')}`,
      source_debt_ref: debt.id,
      creditor_ref: entityRef,
      debt_type: mapDebtType(debt.debtType),
      data_confidence: confidence(debt.dataConfidence),
      entity_roles: [{ entity_ref: entityRef, role: 'legal_lender', entity_kind: debt.debtType === 'personal_borrowing' ? 'private_individual' : 'organization', organization_name: debt.debtType === 'personal_borrowing' ? null : debt.creditorName.trim() || null, brand_name: debt.creditorName.trim() || null, verification_status: debt.dataConfidence === 'confirmed' ? 'contract_check_required' : 'unknown', evidence_refs: [] }],
      product: { brand_name: debt.creditorName.trim() || null, product_name: null, product_code: null, product_identification_status: 'brand_only' },
      contract: { contract_ref: null, contract_version_ref: null, started_on: null, matures_on: null, repayment_method: debt.repaymentMethod, term_remaining_months: debt.termRemaining ?? null, contract_status: debt.dataConfidence === 'confirmed' ? 'present_incomplete' : 'missing' },
      amounts: { principal_outstanding_fen: fen(debt.outstandingPrincipalFen), regular_interest_outstanding_fen: null, penalty_interest_outstanding_fen: null, fees_outstanding_fen: null, total_claimed_balance_fen: fen(debt.outstandingPrincipalFen || debt.currentAmountDueFen), current_amount_due_fen: fen(debt.currentAmountDueFen), scheduled_monthly_due_fen: fen(debt.monthlyPaymentFen ?? debt.currentAmountDueFen), annual_contract_rate_bps: debt.annualRateBps ?? null, annualized_total_cost_bps: null, penalty_rate_bps: null, rate_basis: debt.annualRateBps === undefined ? 'unknown' : 'contract_nominal', amount_breakdown_status: 'unknown', amount_as_of: input.dataAsOf },
      schedule: { next_due_date: isoDate(debt.nextDueDate), due_day: debt.dueDay ?? null, scheduled_end_date: null, payment_schedule_status: debt.nextDueDate ? 'partial' : 'unknown' },
      account_state: { delinquency_state: delinquencyState, delinquency_days: overdueDays, collection_stage: 'unknown', legal_stage: 'unknown', next_legal_deadline: null, credit_reporting_state: 'unknown' },
      security: { secured: debt.hasCollateral, collateral_ref: null, collateral_type: debt.hasCollateral ? 'unknown' : null, collateral_essential_use: debt.affectsEssentialLiving ?? null, collateral_realizable_value_fen: null, guaranteed: debt.hasGuarantor || debt.hasCoBorrower, guarantee_kind: debt.hasCoBorrower ? 'co_borrower' : debt.hasGuarantor ? 'unknown' : null },
      evidence_refs: [],
    }
  })
  const cashflow = {
    floor_monthly_income_fen: fixedIncome,
    expected_variable_monthly_income_fen: variableIncome,
    upside_monthly_income_fen: 0,
    necessary_monthly_expense_fen: necessaryExpense,
    available_cash_fen: fen(input.profile.availableCashFen),
    protected_cash_fen: protectedCash,
    income_status: monthlyIncome > 0 ? (variableIncome > 0 ? 'reduced' : 'active') : 'interrupted',
    income_change_effective_date: null,
    income_evidence_status: monthlyIncome > 0 ? 'self_reported' : 'unknown',
    expense_evidence_status: input.expenses.length > 0 ? 'self_reported' : 'unknown',
    necessary_expense_breakdown: necessaryExpenseItems.length > 0 && necessaryExpenseBreakdownTotal === necessaryExpense ? necessaryExpenseItems.map((item) => ({ category: item.category || 'other_essential', amount_fen: fen(item.amountFen) })) : [],
  }
  const packageWithoutHash: Omit<PfosDnosHandoffV2, 'payload_hash_sha256'> = {
    package_id: packageId, schema_version: DNOS_HANDOFF_V2_SCHEMA_VERSION, data_as_of: input.dataAsOf, exported_at: options.exportedAt || new Date().toISOString(), source_app: 'PFOS-v2', source_app_version: options.sourceAppVersion || '2.2.0', source_rule_version: options.sourceRuleVersion || 'PFOS-R01-R08', currency: 'CNY', timezone: 'Asia/Shanghai', subject_ref: `SUBJECT_${packageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'LOCAL'}`,
    consent: { consent_record_ref: input.consent.id, purpose: 'internal_debt_negotiation_decision_support', document_version: input.consent.documentVersion, confirmed_at: input.consent.acceptedAt },
    decision_preferences: { preference_status: 'not_collected', repayment_intent_status: 'not_collected', primary_objective: null, secondary_objectives: [], commitment_style: 'not_collected', max_monthly_commitment_fen: null, max_upfront_payment_fen: null },
    hardship: { reason_codes: fixedIncome === 0 ? ['job_loss'] : ['none'], started_on: null, expected_recovery_on: null, evidence_status: 'not_available' },
    cashflow,
    assets: { liquid_assets_fen: input.assets.filter((item) => item.liquid).reduce((sum, item) => sum + fen(item.realizableAmountFen ?? item.amountFen), 0), essential_assets_fen: input.assets.filter((item) => item.essentialUse).reduce((sum, item) => sum + fen(item.amountFen), 0), pledged_assets_fen: input.assets.filter((item) => item.pledged).reduce((sum, item) => sum + fen(item.amountFen), 0), voluntary_disposable_assets_fen: 0, asset_data_status: input.assets.length > 0 ? 'self_reported' : 'unknown' },
    income_streams: input.incomes.map((item, index) => ({ income_ref: item.id || `INCOME_${String(index + 1).padStart(3, '0')}`, source_type: item.source || 'other', label: item.label || null, amount_fen: fen(item.amountFen), recurring: item.recurring !== false, certainty: item.certainty || 'uncertain', available_date: isoDate(item.oneTimeDate), evidence_status: item.certainty === 'confirmed' ? 'self_reported' : 'estimated' })),
    expense_items: input.expenses.map((item, index) => ({ expense_ref: item.id || `EXPENSE_${String(index + 1).padStart(3, '0')}`, category: item.category || 'other_essential', label: item.label || null, amount_fen: fen(item.amountFen), recurring: item.recurring !== false, essential: item.essential !== false, deferrable: item.deferrable === true, due_day: item.dayOfMonth || null, evidence_status: 'self_reported' })),
    asset_items: input.assets.map((item, index) => ({ asset_ref: item.id || `ASSET_${String(index + 1).padStart(3, '0')}`, type: item.type || 'other', label: item.label || null, amount_fen: fen(item.amountFen), liquid: item.liquid === true, ownership: item.ownership || 'unknown', realizable_amount_fen: fen(item.realizableAmountFen ?? item.amountFen), available_date: isoDate(item.availableDate), availability_known: item.availabilityKnown === true, pledged: item.pledged === true, essential_use: item.essentialUse === true, evidence_status: 'self_reported' })),
    household_obligations: (input.householdObligations || []).map((item, index) => ({ obligation_ref: item.id || `OBLIGATION_${String(index + 1).padStart(3, '0')}`, category: item.category, amount_fen: fen(item.amountFen), recurring: item.recurring !== false, essential: item.essential !== false, evidence_status: 'self_reported' })),
    debts: debtsPayload,
    pfos_calculations: { monthly_income_fen: monthlyIncome, monthly_essential_expense_fen: necessaryExpense, monthly_debt_due_fen: monthlyDebtDue, monthly_net_before_debt_fen: monthlyNetBeforeDebt, monthly_disposable_cash_fen: monthlyNetBeforeDebt, forecast_30d_gap_fen: null, forecast_60d_gap_fen: null, forecast_90d_gap_fen: null, calculation_version: 'PFOS-CALC-2.0', calculated_at: options.exportedAt || new Date().toISOString() } satisfies PfosDnosCalculationSnapshotV2,
    evidence_index: [],
    risk_codes: [...new Set([...(fixedIncome === 0 ? ['INCOME_INTERRUPTED'] : []), ...(monthlyNetBeforeDebt < 0 ? ['CASHFLOW_UNABLE'] : []), ...(debts.some((debt) => debt.status === 'overdue') ? ['DEBT_OVERDUE'] : []), ...(debts.some((debt) => debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower) ? ['COLLATERAL_OR_GUARANTEE'] : []), ...(missingFields.length > 0 ? ['MISSING_CRITICAL_DATA'] : [])])].sort(),
    missing_fields: missingFields,
    pii_exclusion_confirmed: true,
  }
  const canonical = canonicalize(packageWithoutHash)
  if (canonical === undefined) return resultError('INVALID_DATE', '交接包规范化失败。')
  const packageData = { ...packageWithoutHash, payload_hash_sha256: await sha256(canonical) } as PfosDnosHandoffV2
  return { ok: true, package: packageData, json: JSON.stringify(packageData, null, 2) }
}
