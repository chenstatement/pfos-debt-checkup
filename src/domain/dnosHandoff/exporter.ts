import canonicalize from 'canonicalize'
import { v4 as uuidv4 } from 'uuid'
import type { DebtAccount, FinancialProfile, ISODate, ISODateTime, MoneyFen, ConsentRecord } from '../types'
import { RULE_VERSION } from '../constants'
import { DNOS_HANDOFF_PURPOSE, DNOS_HANDOFF_SCHEMA_VERSION, type DnosHandoffDebt, type DnosHandoffMissingField, type DnosHandoffPackage } from './contract'

export interface DnosExporterIncome { amountFen: MoneyFen; recurring?: boolean }
export interface DnosExporterExpense { amountFen: MoneyFen; essential?: boolean; category?: string }
export interface DnosExporterAsset { amountFen: MoneyFen; liquid?: boolean; realizableAmountFen?: MoneyFen; pledged?: boolean; essentialUse?: boolean; ownership?: string }
export interface PfosDnosExporterInput { consent: ConsentRecord | null; profile: Partial<FinancialProfile>; incomes: DnosExporterIncome[]; expenses: DnosExporterExpense[]; debts: DebtAccount[]; assets: DnosExporterAsset[]; dataAsOf: ISODate }
export interface PfosDnosExporterOptions { packageId?: string; exportedAt?: ISODateTime; sourceAppVersion?: string; sourceRuleVersion?: string }
export type PfosDnosExportErrorCode = 'CONSENT_REQUIRED' | 'ACTIVE_DEBT_REQUIRED' | 'AVAILABLE_CASH_REQUIRED' | 'ESSENTIAL_EXPENSE_REQUIRED' | 'INVALID_DATE' | 'PII_VALUE_SUSPECTED'
export type PfosDnosExportResult = { ok: true; package: DnosHandoffPackage; json: string } | { ok: false; code: PfosDnosExportErrorCode; message: string; missingFields: string[] }

function isNonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000_000 }
function toFen(value: number | undefined): number { return isNonNegativeInteger(value) ? value : 0 }
function getActiveDebts(debts: DebtAccount[]): DebtAccount[] { return debts.filter((debt) => debt.deletedAt === undefined && debt.status !== 'closed').sort((a, b) => a.id.localeCompare(b.id)) }
function mapDebtType(type: DebtAccount['debtType']): DnosHandoffDebt['debt_type'] { return ({ online_microloan: 'microloan', personal_borrowing: 'private_loan', installment: 'installment_purchase' } as Record<string, DnosHandoffDebt['debt_type']>)[type] || type as DnosHandoffDebt['debt_type'] }
function daysBetween(start: string | undefined, end: string): number { if (!start) return 0; const a = Date.parse(`${start}T00:00:00Z`); const b = Date.parse(`${end}T00:00:00Z`); return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((b - a) / 86_400_000)) : 0 }
function unique<T>(values: T[]): T[] { return [...new Set(values)] }
async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}
function hasSensitiveValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSensitiveValue)
  if (!value || typeof value !== 'object') return typeof value === 'string' && [/(?<!\d)1[3-9]\d{9}(?!\d)/, /\b\d{17}[0-9Xx]\b/, /\b\d{16,19}\b/, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/, /(?:[A-Za-z]:\\|\\\\|\/Users\/|\/home\/|C:\\Users\\)/i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/].some((pattern) => pattern.test(value))
  return Object.values(value).some(hasSensitiveValue)
}
function exportError(code: PfosDnosExportErrorCode, message: string, missingFields: string[] = []): PfosDnosExportResult { return { ok: false, code, message, missingFields } }
function missing(path: string, reason_code: DnosHandoffMissingField['reason_code'], severity: DnosHandoffMissingField['severity'], blocks: DnosHandoffMissingField['blocks'], acquisition_code: DnosHandoffMissingField['acquisition_code']): DnosHandoffMissingField { return { path, reason_code, severity, blocks, acquisition_code } }
function stablePackage(input: Omit<DnosHandoffPackage, 'payload_hash_sha256'>) {
  const clone = JSON.parse(JSON.stringify(input)) as Omit<DnosHandoffPackage, 'payload_hash_sha256'>
  clone.debts.sort((a, b) => a.debt_ref.localeCompare(b.debt_ref)); clone.debts.forEach((debt) => { debt.entity_roles.sort((a, b) => `${a.role}:${a.entity_ref}`.localeCompare(`${b.role}:${b.entity_ref}`)); debt.evidence_refs.sort() })
  clone.evidence_index.sort((a, b) => a.evidence_ref.localeCompare(b.evidence_ref)); clone.risk_codes.sort(); clone.decision_preferences.secondary_objectives.sort(); clone.missing_fields.sort((a, b) => `${a.path}:${a.reason_code}`.localeCompare(`${b.path}:${b.reason_code}`))
  return clone
}

export async function exportDnosHandoff(input: PfosDnosExporterInput, options: PfosDnosExporterOptions = {}): Promise<PfosDnosExportResult> {
  if (!input.consent?.id || !input.consent.acceptedAt || input.consent.revokedAt) return exportError('CONSENT_REQUIRED', '请先确认未撤回的 PFOS 数据用途授权。', ['consent'])
  if (!isNonNegativeInteger(input.profile.availableCashFen)) return exportError('AVAILABLE_CASH_REQUIRED', '缺少可用现金数据。', ['cashflow.available_cash_fen'])
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataAsOf)) return exportError('INVALID_DATE', '数据截止日期格式无效。', ['data_as_of'])
  const activeDebts = getActiveDebts(input.debts); if (activeDebts.length === 0) return exportError('ACTIVE_DEBT_REQUIRED', '至少需要一笔未结清债务。', ['debts'])
  const packageId = options.packageId || uuidv4(); const stableIncome = toFen(input.profile.fixedMonthlyIncomeFen); const expectedVariable = toFen(input.profile.variableMonthlyIncomeFen) || input.incomes.filter((income) => income.recurring === false).reduce((sum, income) => sum + toFen(income.amountFen), 0); const floorIncome = stableIncome
  const necessaryExpense = toFen(input.profile.essentialMonthlyExpenseFen) || input.expenses.filter((expense) => expense.essential !== false).reduce((sum, expense) => sum + toFen(expense.amountFen), 0); if (!isNonNegativeInteger(necessaryExpense)) return exportError('ESSENTIAL_EXPENSE_REQUIRED', '缺少必要支出数据。', ['cashflow.necessary_monthly_expense_fen'])
  const protectedCash = Math.min(toFen(input.profile.protectedCashFen), toFen(input.profile.availableCashFen)); const missingFields: DnosHandoffMissingField[] = []
  if (input.debts.some((debt) => hasSensitiveValue(debt.userNote) || hasSensitiveValue(debt.totalCostNote))) return exportError('PII_VALUE_SUSPECTED', '债务自由文本存在疑似敏感值，已拒绝导出。', ['debts.free_text'])
  if (floorIncome === 0) missingFields.push(missing('/cashflow/floor_monthly_income_fen', 'not_collected', 'blocking', ['offer_acceptance', 'client_ready_report'], 'RETURN_TO_PFOS'))
  if (input.profile.fixedMonthlyIncomeFen === undefined && input.incomes.length === 0) missingFields.push(missing('/cashflow/floor_monthly_income_fen', 'not_collected', 'blocking', ['baseline'], 'RETURN_TO_PFOS'))
  const entityRefs = new Map<string, string>(); const evidenceIndex: DnosHandoffPackage['evidence_index'] = []
  const debts: DnosHandoffDebt[] = activeDebts.map((debt, index) => {
    const entityRef = entityRefs.get(debt.creditorName) || `ENTITY_${String(entityRefs.size + 1).padStart(3, '0')}`; entityRefs.set(debt.creditorName, entityRef)
    const delinquencyDays = debt.status === 'overdue' ? daysBetween(debt.overdueSince, input.dataAsOf) : 0
    const delinquencyState = debt.status === 'overdue' ? (delinquencyDays <= 30 ? 'days_1_30' : delinquencyDays <= 90 ? 'days_31_90' : 'days_91_plus') : 'current'
    const amountAsOf = input.dataAsOf; const hasContract = debt.dataConfidence === 'confirmed'
    if (!debt.nextDueDate) missingFields.push(missing(`/debts/${index}/schedule/next_due_date`, 'not_collected', 'important', ['policy_match'], 'RETURN_TO_PFOS'))
    if (debt.annualRateBps === undefined) missingFields.push(missing(`/debts/${index}/amounts/annual_contract_rate_bps`, 'not_collected', 'important', ['policy_match'], 'RETURN_TO_PFOS'))
    if (debt.status === 'overdue' && !debt.overdueSince) missingFields.push(missing(`/debts/${index}/account_state/delinquency_days`, 'not_collected', 'blocking', ['policy_match'], 'RETURN_TO_PFOS'))
    if (!hasContract) missingFields.push(missing(`/debts/${index}/contract`, 'document_missing', 'important', ['offer_acceptance', 'client_ready_report'], 'INDEX_CONTRACT'))
    return {
      debt_ref: `DEBT_${String(index + 1).padStart(3, '0')}`, debt_type: mapDebtType(debt.debtType), data_confidence: debt.dataConfidence === 'confirmed' ? 'self_reported' : debt.dataConfidence,
      entity_roles: [{ entity_ref: entityRef, role: 'legal_lender', entity_kind: 'organization', organization_name: debt.creditorName.trim() || null, brand_name: debt.creditorName.trim() || null, verification_status: debt.dataConfidence === 'confirmed' ? 'contract_check_required' : 'unknown', evidence_refs: [] }],
      product: { brand_name: debt.creditorName.trim() || null, product_name: null, product_code: null, product_identification_status: 'brand_only' },
      contract: { contract_ref: null, contract_version_ref: null, started_on: null, matures_on: null, repayment_method: debt.repaymentMethod === 'unknown' ? 'unknown' : debt.repaymentMethod, term_remaining_months: debt.termRemaining || null, contract_status: hasContract ? 'present_incomplete' : 'missing' },
      amounts: { principal_outstanding_fen: toFen(debt.outstandingPrincipalFen), regular_interest_outstanding_fen: null, penalty_interest_outstanding_fen: null, fees_outstanding_fen: null, total_claimed_balance_fen: toFen(debt.outstandingPrincipalFen || debt.currentAmountDueFen), current_amount_due_fen: toFen(debt.currentAmountDueFen), scheduled_monthly_due_fen: toFen(debt.monthlyPaymentFen ?? debt.currentAmountDueFen), annual_contract_rate_bps: debt.annualRateBps ?? null, annualized_total_cost_bps: null, penalty_rate_bps: null, rate_basis: debt.annualRateBps === undefined ? 'unknown' : 'contract_nominal', amount_breakdown_status: 'unknown', amount_as_of: amountAsOf },
      schedule: { next_due_date: debt.nextDueDate || null, due_day: debt.dueDay || null, scheduled_end_date: null, payment_schedule_status: debt.nextDueDate ? 'partial' : 'unknown' },
      account_state: { delinquency_state: delinquencyState, delinquency_days: delinquencyDays, collection_stage: 'unknown', legal_stage: 'unknown', next_legal_deadline: null, credit_reporting_state: 'unknown' },
      security: { secured: debt.hasCollateral, collateral_ref: null, collateral_type: debt.hasCollateral ? 'unknown' : null, collateral_essential_use: debt.affectsEssentialLiving ?? null, collateral_realizable_value_fen: null, guaranteed: debt.hasGuarantor || debt.hasCoBorrower, guarantee_kind: debt.hasCoBorrower ? 'co_borrower' : debt.hasGuarantor ? 'unknown' : null }, evidence_refs: [],
    }
  })
  const riskCodes = unique([...(floorIncome === 0 ? ['INCOME_INTERRUPTED'] : []), ...(floorIncome < necessaryExpense ? ['CASHFLOW_UNABLE'] : []), ...(debts.some((debt) => debt.account_state.delinquency_days > 0) ? ['DEBT_OVERDUE'] : []), ...(debts.some((debt) => debt.security.secured || debt.security.guaranteed) ? ['COLLATERAL_OR_GUARANTEE'] : []), ...(missingFields.length > 0 ? ['MISSING_CRITICAL_DATA'] : [])]).sort()
  const packageWithoutHash: Omit<DnosHandoffPackage, 'payload_hash_sha256'> = {
    package_id: packageId, schema_version: DNOS_HANDOFF_SCHEMA_VERSION, data_as_of: input.dataAsOf, exported_at: options.exportedAt || new Date().toISOString(), source_app: 'PFOS-v2', source_app_version: options.sourceAppVersion || '2.1.0', source_rule_version: options.sourceRuleVersion || `PFOS-R01-R08@${RULE_VERSION}`, currency: 'CNY', timezone: 'Asia/Shanghai', subject_ref: `SUBJECT_${packageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'LOCAL'}`,
    consent: { consent_record_ref: 'CONSENT_001', purpose: DNOS_HANDOFF_PURPOSE, document_version: input.consent.documentVersion, confirmed_at: input.consent.acceptedAt },
    decision_preferences: { preference_status: 'not_collected', repayment_intent_status: 'not_collected', primary_objective: null, secondary_objectives: [], commitment_style: 'not_collected', max_monthly_commitment_fen: null, max_upfront_payment_fen: 0 }, hardship: { reason_codes: floorIncome === 0 ? ['job_loss'] : ['none'], started_on: null, expected_recovery_on: null, evidence_status: 'not_available' },
    cashflow: { floor_monthly_income_fen: floorIncome, expected_variable_monthly_income_fen: expectedVariable, upside_monthly_income_fen: 0, necessary_monthly_expense_fen: necessaryExpense, available_cash_fen: toFen(input.profile.availableCashFen), protected_cash_fen: protectedCash, income_status: floorIncome > 0 ? (expectedVariable > 0 ? 'reduced' : 'active') : 'interrupted', income_change_effective_date: null, income_evidence_status: floorIncome > 0 ? 'self_reported' : 'unknown', expense_evidence_status: 'self_reported' },
    assets: { liquid_assets_fen: input.assets.filter((asset) => asset.liquid).reduce((sum, asset) => sum + toFen(asset.realizableAmountFen ?? asset.amountFen), 0), essential_assets_fen: input.assets.filter((asset) => asset.essentialUse).reduce((sum, asset) => sum + toFen(asset.amountFen), 0), pledged_assets_fen: input.assets.filter((asset) => asset.pledged).reduce((sum, asset) => sum + toFen(asset.amountFen), 0), voluntary_disposable_assets_fen: 0, asset_data_status: input.assets.length > 0 ? 'self_reported' : 'unknown' }, debts, evidence_index: evidenceIndex, risk_codes: riskCodes, missing_fields: unique(missingFields), pii_exclusion_confirmed: true,
  }
  const canonical = canonicalize(stablePackage(packageWithoutHash)); if (canonical === undefined) return exportError('INVALID_DATE', '交接包规范化失败。')
  const packageData = { ...packageWithoutHash, payload_hash_sha256: await sha256Hex(canonical) } as DnosHandoffPackage
  return { ok: true, package: packageData, json: JSON.stringify(packageData, null, 2) }
}
