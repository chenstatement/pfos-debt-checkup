import type { ConsentRecord, DebtAccount, FinancialProfile, ISODate, ISODateTime, MoneyFen } from '../types'

export const DNOS_HANDOFF_V2_SCHEMA_VERSION = '2.0.0' as const

export interface PfosDnosIncomeV2 {
  income_ref: string
  source_type: string
  label: string | null
  amount_fen: MoneyFen
  recurring: boolean
  certainty: 'confirmed' | 'likely' | 'uncertain'
  available_date: ISODate | null
  evidence_status: 'verified' | 'self_reported' | 'estimated' | 'unknown'
}

export interface PfosDnosExpenseV2 {
  expense_ref: string
  category: string
  label: string | null
  amount_fen: MoneyFen
  recurring: boolean
  essential: boolean
  deferrable: boolean
  due_day: number | null
  evidence_status: 'verified' | 'self_reported' | 'estimated' | 'unknown'
}

export interface PfosDnosAssetV2 {
  asset_ref: string
  type: string
  label: string | null
  amount_fen: MoneyFen
  liquid: boolean
  ownership: string
  realizable_amount_fen: MoneyFen
  available_date: ISODate | null
  availability_known: boolean
  pledged: boolean
  essential_use: boolean
  evidence_status: 'verified' | 'self_reported' | 'estimated' | 'unknown'
}

export interface PfosDnosHouseholdObligationV2 {
  obligation_ref: string
  category: string
  amount_fen: MoneyFen
  recurring: boolean
  essential: boolean
  evidence_status: 'verified' | 'self_reported' | 'estimated' | 'unknown'
}

export interface PfosDnosCalculationSnapshotV2 {
  monthly_income_fen: MoneyFen
  monthly_essential_expense_fen: MoneyFen
  monthly_debt_due_fen: MoneyFen
  monthly_net_before_debt_fen: number
  monthly_disposable_cash_fen: number
  forecast_30d_gap_fen: number | null
  forecast_60d_gap_fen: number | null
  forecast_90d_gap_fen: number | null
  calculation_version: string
  calculated_at: ISODateTime
}

export interface PfosDnosHandoffV2 {
  package_id: string
  schema_version: typeof DNOS_HANDOFF_V2_SCHEMA_VERSION
  data_as_of: ISODate
  exported_at: ISODateTime
  source_app: 'PFOS-v2'
  source_app_version: string
  source_rule_version: string
  currency: 'CNY'
  timezone: 'Asia/Shanghai'
  subject_ref: string
  consent: {
    consent_record_ref: string
    purpose: 'internal_debt_negotiation_decision_support'
    document_version: string
    confirmed_at: ISODateTime
  }
  decision_preferences: Record<string, unknown>
  hardship: Record<string, unknown>
  cashflow: Record<string, unknown>
  assets: Record<string, unknown>
  income_streams: PfosDnosIncomeV2[]
  expense_items: PfosDnosExpenseV2[]
  asset_items: PfosDnosAssetV2[]
  household_obligations: PfosDnosHouseholdObligationV2[]
  debts: Record<string, unknown>[]
  pfos_calculations: PfosDnosCalculationSnapshotV2
  evidence_index: Record<string, unknown>[]
  risk_codes: string[]
  missing_fields: Record<string, unknown>[]
  pii_exclusion_confirmed: true
  payload_hash_sha256: string
}

export interface PfosDnosExporterV2Input {
  consent: ConsentRecord | null
  profile: Partial<FinancialProfile>
  incomes: Array<{
    id?: string
    source?: string
    label?: string
    amountFen: MoneyFen
    recurring?: boolean
    oneTimeDate?: ISODate
    certainty?: 'confirmed' | 'likely' | 'uncertain'
  }>
  expenses: Array<{
    id?: string
    category?: string
    label?: string
    amountFen: MoneyFen
    recurring?: boolean
    essential?: boolean
    deferrable?: boolean
    dayOfMonth?: number
  }>
  debts: DebtAccount[]
  assets: Array<{
    id?: string
    type?: string
    label?: string
    amountFen: MoneyFen
    liquid?: boolean
    ownership?: string
    realizableAmountFen?: MoneyFen
    availableDate?: ISODate
    availabilityKnown?: boolean
    pledged?: boolean
    essentialUse?: boolean
  }>
  householdObligations?: Array<{
    id?: string
    category: string
    amountFen: MoneyFen
    recurring?: boolean
    essential?: boolean
  }>
  dataAsOf: ISODate
}

export type PfosDnosExportV2ErrorCode = 'CONSENT_REQUIRED' | 'ACTIVE_DEBT_REQUIRED' | 'AVAILABLE_CASH_REQUIRED' | 'ESSENTIAL_EXPENSE_REQUIRED' | 'INVALID_DATE' | 'PII_VALUE_SUSPECTED'

export type PfosDnosExportV2Result =
  | { ok: true; package: PfosDnosHandoffV2; json: string }
  | { ok: false; code: PfosDnosExportV2ErrorCode; message: string; missingFields: string[] }
