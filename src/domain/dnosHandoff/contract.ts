export const DNOS_HANDOFF_SCHEMA_VERSION = '1.0.0' as const
export const DNOS_HANDOFF_PURPOSE = 'internal_debt_negotiation_decision_support' as const

export type DnosHandoffDebtType =
  | 'credit_card'
  | 'bank_consumer_loan'
  | 'online_loan'
  | 'secured_loan'
  | 'private_loan'
  | 'other'

export interface DnosHandoffDebt {
  debt_ref: string
  creditor_ref: string
  debt_type: DnosHandoffDebtType
  balance_fen: number
  monthly_due_fen: number
  annual_rate_bps: number | null
  delinquency_days: number
  secured: boolean
  guaranteed: boolean
}

export interface DnosHandoffPackage {
  package_id: string
  schema_version: typeof DNOS_HANDOFF_SCHEMA_VERSION
  exported_at: string
  source_app: 'PFOS-v2'
  source_app_version: string
  source_rule_version: string
  subject_ref: string
  consent: {
    consent_record_ref: string
    purpose: typeof DNOS_HANDOFF_PURPOSE
    confirmed_at: string
  }
  debts: DnosHandoffDebt[]
  cashflow: {
    stable_monthly_income_fen: number
    variable_monthly_income_fen: number
    necessary_monthly_expense_fen: number
    available_cash_fen: number
    income_status: 'stable' | 'unstable' | 'interrupted' | 'unknown'
  }
  assets: {
    liquid_assets_fen: number
    essential_assets_fen: number
    pledged_assets_fen: number
  }
  risk_codes: string[]
  missing_fields: string[]
  pii_exclusion_confirmed: true
  payload_hash_sha256: string
}
