import canonicalize from 'canonicalize'
import { v4 as uuidv4 } from 'uuid'
import type { DebtAccount, FinancialProfile, ISODate, ISODateTime, MoneyFen, ConsentRecord } from '../types'
import { RULE_VERSION } from '../constants'
import {
  DNOS_HANDOFF_PURPOSE,
  DNOS_HANDOFF_SCHEMA_VERSION,
  type DnosHandoffDebt,
  type DnosHandoffPackage,
} from './contract'

export interface DnosExporterIncome {
  amountFen: MoneyFen
  recurring?: boolean
}

export interface DnosExporterExpense {
  amountFen: MoneyFen
  essential?: boolean
}

export interface DnosExporterAsset {
  amountFen: MoneyFen
  liquid?: boolean
  realizableAmountFen?: MoneyFen
  pledged?: boolean
  essentialUse?: boolean
}

export interface PfosDnosExporterInput {
  consent: ConsentRecord | null
  profile: Partial<FinancialProfile>
  incomes: DnosExporterIncome[]
  expenses: DnosExporterExpense[]
  debts: DebtAccount[]
  assets: DnosExporterAsset[]
  dataAsOf: ISODate
}

export interface PfosDnosExporterOptions {
  packageId?: string
  exportedAt?: ISODateTime
  sourceAppVersion?: string
  sourceRuleVersion?: string
}

export type PfosDnosExportErrorCode =
  | 'CONSENT_REQUIRED'
  | 'ACTIVE_DEBT_REQUIRED'
  | 'AVAILABLE_CASH_REQUIRED'
  | 'ESSENTIAL_EXPENSE_REQUIRED'
  | 'INVALID_DATE'

export type PfosDnosExportResult =
  | { ok: true; package: DnosHandoffPackage; json: string }
  | { ok: false; code: PfosDnosExportErrorCode; message: string; missingFields: string[] }

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function toFen(value: number | undefined): number {
  return isNonNegativeInteger(value) ? value : 0
}

function getActiveDebts(debts: DebtAccount[]): DebtAccount[] {
  return debts.filter((debt) => debt.deletedAt === undefined && debt.status !== 'closed')
}

function mapDebtType(type: DebtAccount['debtType']): DnosHandoffDebt['debt_type'] {
  if (type === 'online_microloan') return 'online_loan'
  if (type === 'personal_borrowing') return 'private_loan'
  if (type === 'installment') return 'other'
  return type
}

function daysBetween(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00Z`)
  const endTime = Date.parse(`${end}T00:00:00Z`)
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0
  return Math.max(0, Math.floor((endTime - startTime) / 86_400_000))
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function exportError(
  code: PfosDnosExportErrorCode,
  message: string,
  missingFields: string[] = [],
): PfosDnosExporterResult {
  return { ok: false, code, message, missingFields }
}

export async function exportDnosHandoff(
  input: PfosDnosExporterInput,
  options: PfosDnosExporterOptions = {},
): Promise<PfosDnosExportResult> {
  if (!input.consent?.id || !input.consent.acceptedAt) {
    return exportError('CONSENT_REQUIRED', '请先确认 PFOS 数据用途授权后再导出 DNOS 交接包。', ['consent'])
  }
  if (!isNonNegativeInteger(input.profile.availableCashFen)) {
    return exportError('AVAILABLE_CASH_REQUIRED', '缺少可用现金数据，无法形成可复核的交接包。', ['profile.availableCashFen'])
  }
  if (!isNonNegativeInteger(input.profile.essentialMonthlyExpenseFen)) {
    return exportError('ESSENTIAL_EXPENSE_REQUIRED', '缺少必要支出数据，无法形成可持续性基线。', ['profile.essentialMonthlyExpenseFen'])
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataAsOf)) {
    return exportError('INVALID_DATE', '数据截止日期格式无效。', ['dataAsOf'])
  }

  const activeDebts = getActiveDebts(input.debts)
  if (activeDebts.length === 0) {
    return exportError('ACTIVE_DEBT_REQUIRED', '至少需要一笔未结清债务才能生成 DNOS 交接包。', ['debts'])
  }

  const packageId = options.packageId || uuidv4()

  const stableIncome = toFen(input.profile.fixedMonthlyIncomeFen) ||
    input.incomes.filter((income) => income.recurring !== false).reduce((sum, income) => sum + toFen(income.amountFen), 0)
  const variableIncome = toFen(input.profile.variableMonthlyIncomeFen) ||
    input.incomes.filter((income) => income.recurring === false).reduce((sum, income) => sum + toFen(income.amountFen), 0)
  const necessaryExpense = toFen(input.profile.essentialMonthlyExpenseFen)
  const availableCash = toFen(input.profile.availableCashFen)
  const monthlyDebtDue = activeDebts.reduce((sum, debt) => sum + toFen(debt.monthlyPaymentFen ?? debt.currentAmountDueFen), 0)
  const incomeStatus = stableIncome > 0
    ? (variableIncome > 0 ? 'unstable' : 'stable')
    : (variableIncome > 0 ? 'unstable' : 'interrupted')

  const missingFields: string[] = []
  if (stableIncome === 0 && variableIncome === 0) missingFields.push('cashflow.income')
  if (input.profile.fixedMonthlyIncomeFen === undefined && input.incomes.length === 0) missingFields.push('profile.fixedMonthlyIncomeFen')

  const creditorRefs = new Map<string, string>()
  const debts: DnosHandoffDebt[] = activeDebts.map((debt, index) => {
    const creditorName = debt.creditorName.trim()
    if (!creditorRefs.has(creditorName)) creditorRefs.set(creditorName, `CREDITOR_${String(creditorRefs.size + 1).padStart(3, '0')}`)
    if (debt.annualRateBps === undefined) missingFields.push(`debts.${index}.annual_rate_bps`)
    if (debt.status === 'overdue' && !debt.overdueSince) missingFields.push(`debts.${index}.overdue_since`)
    return {
      debt_ref: `DEBT_${String(index + 1).padStart(3, '0')}`,
      creditor_ref: creditorRefs.get(creditorName) || `CREDITOR_${String(index + 1).padStart(3, '0')}`,
      debt_type: mapDebtType(debt.debtType),
      balance_fen: toFen(debt.outstandingPrincipalFen),
      monthly_due_fen: toFen(debt.monthlyPaymentFen ?? debt.currentAmountDueFen),
      annual_rate_bps: debt.annualRateBps ?? null,
      delinquency_days: debt.status === 'overdue' && debt.overdueSince ? daysBetween(debt.overdueSince, input.dataAsOf) : 0,
      secured: debt.hasCollateral,
      guaranteed: debt.hasGuarantor || debt.hasCoBorrower,
    }
  })

  const riskCodes = new Set<string>()
  if (incomeStatus === 'interrupted') riskCodes.add('INCOME_INTERRUPTED')
  if (stableIncome + variableIncome < necessaryExpense + monthlyDebtDue) riskCodes.add('CASHFLOW_UNABLE')
  if (activeDebts.some((debt) => debt.status === 'overdue')) riskCodes.add('DEBT_OVERDUE')
  if (activeDebts.some((debt) => debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower)) riskCodes.add('COLLATERAL_OR_GUARANTEE')
  if (missingFields.length > 0) riskCodes.add('MISSING_CRITICAL_DATA')

  const packageWithoutHash = {
    package_id: packageId,
    schema_version: DNOS_HANDOFF_SCHEMA_VERSION,
    exported_at: options.exportedAt || new Date().toISOString(),
    source_app: 'PFOS-v2' as const,
    source_app_version: options.sourceAppVersion || '1.0.0',
    source_rule_version: options.sourceRuleVersion || `PFOS-R01-R08@${RULE_VERSION}`,
    subject_ref: `SUBJECT_${packageId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 12) || 'LOCAL'}`,
    consent: {
      consent_record_ref: 'CONSENT_001',
      purpose: DNOS_HANDOFF_PURPOSE,
      confirmed_at: input.consent.acceptedAt,
    },
    debts,
    cashflow: {
      stable_monthly_income_fen: stableIncome,
      variable_monthly_income_fen: variableIncome,
      necessary_monthly_expense_fen: necessaryExpense,
      available_cash_fen: availableCash,
      income_status: incomeStatus,
    },
    assets: {
      liquid_assets_fen: input.assets.filter((asset) => asset.liquid).reduce((sum, asset) => sum + toFen(asset.realizableAmountFen ?? asset.amountFen), 0),
      essential_assets_fen: input.assets.filter((asset) => asset.essentialUse).reduce((sum, asset) => sum + toFen(asset.amountFen), 0),
      pledged_assets_fen: input.assets.filter((asset) => asset.pledged).reduce((sum, asset) => sum + toFen(asset.amountFen), 0),
    },
    risk_codes: [...riskCodes],
    missing_fields: unique(missingFields),
    pii_exclusion_confirmed: true as const,
  }

  const canonical = canonicalize(packageWithoutHash)
  if (canonical === undefined) return exportError('INVALID_DATE', '交接包规范化失败，未生成文件。')
  const packageData: DnosHandoffPackage = {
    ...packageWithoutHash,
    payload_hash_sha256: await sha256Hex(canonical),
  }
  return { ok: true, package: packageData, json: JSON.stringify(packageData, null, 2) }
}
