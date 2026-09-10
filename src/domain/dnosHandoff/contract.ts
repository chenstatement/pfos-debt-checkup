export const DNOS_HANDOFF_SCHEMA_VERSION = '1.1.0' as const
export const DNOS_HANDOFF_LEGACY_SCHEMA_VERSION = '1.0.0' as const
export const DNOS_HANDOFF_PURPOSE = 'internal_debt_negotiation_decision_support' as const

export type DnosHandoffDebtType = 'credit_card' | 'bank_consumer_loan' | 'consumer_finance' | 'auto_finance' | 'microloan' | 'trust_loan' | 'secured_mortgage' | 'installment_purchase' | 'private_loan' | 'other_personal_debt' | 'unknown'
export type DnosHandoffObjective = 'stabilize_cashflow' | 'protect_credit' | 'reduce_total_cost' | 'protect_collateral' | 'legal_risk_control' | 'relationship_priority'

export interface DnosHandoffEntityRole {
  entity_ref: string
  role: 'platform_entry' | 'legal_lender' | 'credit_reporter' | 'guarantor_or_insurer' | 'post_loan_manager' | 'collection_executor' | 'assignee' | 'payment_recipient'
  entity_kind: 'organization' | 'private_individual' | 'unknown'
  organization_name: string | null
  brand_name: string | null
  verification_status: 'confirmed' | 'contract_check_required' | 'institution_confirmation_required' | 'unknown'
  evidence_refs: string[]
}

export interface DnosHandoffDebt {
  debt_ref: string
  debt_type: DnosHandoffDebtType
  data_confidence: 'document_verified' | 'institution_confirmed' | 'self_reported' | 'estimated' | 'unknown'
  entity_roles: DnosHandoffEntityRole[]
  product: { brand_name: string | null; product_name: string | null; product_code: string | null; product_identification_status: 'confirmed' | 'brand_only' | 'self_reported' | 'unknown' }
  contract: { contract_ref: string | null; contract_version_ref: string | null; started_on: string | null; matures_on: string | null; repayment_method: 'equal_installment' | 'equal_principal' | 'minimum_payment' | 'interest_first' | 'balloon' | 'revolving' | 'flexible' | 'unknown'; term_remaining_months: number | null; contract_status: 'present_complete' | 'present_incomplete' | 'missing' }
  amounts: { principal_outstanding_fen: number; regular_interest_outstanding_fen: number | null; penalty_interest_outstanding_fen: number | null; fees_outstanding_fen: number | null; total_claimed_balance_fen: number; current_amount_due_fen: number; scheduled_monthly_due_fen: number; annual_contract_rate_bps: number | null; annualized_total_cost_bps: number | null; penalty_rate_bps: number | null; rate_basis: 'contract_nominal' | 'disclosed_apr' | 'calculated' | 'unknown'; amount_breakdown_status: 'complete' | 'partial' | 'unknown'; amount_as_of: string }
  schedule: { next_due_date: string | null; due_day: number | null; scheduled_end_date: string | null; payment_schedule_status: 'complete' | 'partial' | 'unknown' }
  account_state: { delinquency_state: 'current' | 'anticipated_shortfall' | 'days_1_30' | 'days_31_90' | 'days_91_plus' | 'charged_off_or_transferred' | 'unknown'; delinquency_days: number; collection_stage: 'none' | 'reminder' | 'internal_collection' | 'external_collection' | 'demand_letter' | 'unknown'; legal_stage: 'none' | 'pre_litigation_mediation' | 'litigation' | 'arbitration' | 'judgment_or_award' | 'enforcement' | 'unknown'; next_legal_deadline: string | null; credit_reporting_state: 'current' | 'overdue_reported' | 'restructured_reported' | 'disputed' | 'not_reported' | 'unknown' }
  security: { secured: boolean; collateral_ref: string | null; collateral_type: 'primary_residence' | 'other_real_estate' | 'vehicle' | 'deposit' | 'other' | 'unknown' | null; collateral_essential_use: boolean | null; collateral_realizable_value_fen: number | null; guaranteed: boolean; guarantee_kind: 'natural_person' | 'company' | 'insurer' | 'financing_guarantee' | 'co_borrower' | 'unknown' | null }
  evidence_refs: string[]
}

export interface DnosHandoffMissingField { path: string; reason_code: 'not_collected' | 'user_unknown' | 'document_missing' | 'conflicting_sources' | 'not_applicable'; severity: 'blocking' | 'important' | 'informational'; blocks: ('baseline' | 'policy_match' | 'offer_acceptance' | 'client_ready_report')[]; acquisition_code: 'RETURN_TO_PFOS' | 'INDEX_CONTRACT' | 'INDEX_STATEMENT' | 'INDEX_CREDIT_REPORT' | 'VERIFY_INSTITUTION' | 'VERIFY_LEGAL_STAGE' | 'VERIFY_OFFICIAL_CHANNEL' | 'NO_ACTION_REQUIRED' }

export interface DnosHandoffPackage {
  package_id: string; schema_version: typeof DNOS_HANDOFF_SCHEMA_VERSION; data_as_of: string; exported_at: string; source_app: 'PFOS-v2'; source_app_version: string; source_rule_version: string; currency: 'CNY'; timezone: 'Asia/Shanghai'; subject_ref: string
  consent: { consent_record_ref: string; purpose: typeof DNOS_HANDOFF_PURPOSE; document_version: string; confirmed_at: string }
  decision_preferences: { preference_status: 'user_confirmed' | 'system_inferred_pending_confirmation' | 'not_collected'; repayment_intent_status: 'confirmed' | 'conditional' | 'not_confirmed' | 'not_collected'; primary_objective: DnosHandoffObjective | null; secondary_objectives: DnosHandoffObjective[]; commitment_style: 'conservative' | 'balanced' | 'maximum_feasible' | 'not_collected'; max_monthly_commitment_fen: number | null; max_upfront_payment_fen: number | null }
  hardship: { reason_codes: ('job_loss' | 'income_reduction' | 'illness' | 'family_burden' | 'business_failure' | 'disaster' | 'other' | 'none')[]; started_on: string | null; expected_recovery_on: string | null; evidence_status: 'document_verified' | 'self_reported' | 'not_available' | 'not_applicable' }
  cashflow: { floor_monthly_income_fen: number; expected_variable_monthly_income_fen: number; upside_monthly_income_fen: number; necessary_monthly_expense_fen: number; available_cash_fen: number; protected_cash_fen: number; income_status: 'active' | 'reduced' | 'interrupted' | 'unknown'; income_change_effective_date: string | null; income_evidence_status: 'document_verified' | 'self_reported' | 'estimated' | 'unknown'; expense_evidence_status: 'document_verified' | 'self_reported' | 'estimated' | 'unknown'; necessary_expense_breakdown?: { category: 'housing' | 'food_and_utilities' | 'healthcare' | 'dependents' | 'work_and_transport' | 'tax_and_social_security' | 'other_essential'; amount_fen: number }[] }
  assets: { liquid_assets_fen: number; essential_assets_fen: number; pledged_assets_fen: number; voluntary_disposable_assets_fen: number; asset_data_status: 'verified' | 'self_reported' | 'estimated' | 'unknown' }
  debts: DnosHandoffDebt[]; evidence_index: Array<{ evidence_ref: string; evidence_type: string; related_debt_refs: string[]; content_hash_sha256: string | null; document_date: string | null; verification_status: string; source_tier: string }>; risk_codes: string[]; missing_fields: DnosHandoffMissingField[]; pii_exclusion_confirmed: true; payload_hash_sha256: string
}
