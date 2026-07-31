/**
 * PFOS Constants — Rule version, thresholds, labels, and configuration.
 *
 * All thresholds are explicit and configurable.
 * Do NOT hardcode these values in UI components.
 */

// ── Rule Version ───────────────────────────────────────────

export const RULE_VERSION = '1.0.0'

// ── Thresholds ─────────────────────────────────────────────

export const THRESHOLDS = {
  /** High-cost debt: annual rate above this (in basis points) triggers HIGH_COST flag */
  HIGH_COST_RATE_BPS: 1500, // 15%

  /** Critical cost: annual rate above this (in basis points) */
  CRITICAL_COST_RATE_BPS: 2400, // 24%

  /** Days: due within this window + insufficient cash = urgent */
  URGENT_DUE_DAYS: 3,

  /** Days: due within this window + forecast negative = high risk */
  HIGH_RISK_DUE_DAYS: 7,

  /** Days: forecast window */
  FORECAST_HORIZON_DAYS: 90,

  /** Minimum survival months before triggering low-survival warning */
  MIN_SURVIVAL_MONTHS: 3,

  /** Forecast gap observation windows */
  GAP_WINDOWS: [30, 60, 90] as const,

  /** Max single transaction that doesn't need secondary confirmation (in fen) */
  SECONDARY_CONFIRM_THRESHOLD_FEN: 1_000_000_00, // 10万 CNY

  /** Max reasonable user-input amount (in fen) — above this is likely a mistake */
  MAX_REASONABLE_AMOUNT_FEN: 100_000_000_00, // 1亿 CNY
} as const

// ── Risk Reason Code Labels ────────────────────────────────

export const RISK_REASON_LABELS: Record<string, string> = {
  OVERDUE: '已逾期',
  DUE_WITHIN_3_DAYS: '3天内到期',
  DUE_WITHIN_7_DAYS: '7天内到期',
  INSUFFICIENT_CASH: '当前可用现金不足',
  FORECAST_NEGATIVE: '预测期内现金流将为负',
  HIGH_COST: '债务成本较高',
  COLLATERAL_OR_GUARANTEE: '涉及抵押、担保或共同借款人',
  ESSENTIAL_LIVING_IMPACT: '影响基本生活',
  MISSING_CRITICAL_DATA: '关键数据缺失',
}

// ── Action Code Labels ─────────────────────────────────────

export const ACTION_CODE_LABELS: Record<string, string> = {
  VERIFY_DATA: '核实数据',
  PREPARE_PAYMENT: '准备还款',
  CONTACT_CREDITOR: '联系债权方',
  PREPARE_NEGOTIATION: '准备协商材料',
  REVIEW_WRITTEN_TERMS: '复核书面条款',
  SEEK_PROFESSIONAL_HELP: '寻求专业帮助',
  UPDATE_RESULT: '更新执行结果',
}

// ── Priority Level Labels & Descriptions ───────────────────

export const PRIORITY_INFO: Record<string, { label: string; color: string; description: string }> = {
  P0: { label: '紧急', color: '#dc2626', description: '已逾期或3天内存在断裂风险，需立即核实或联系相关方' },
  P1: { label: '高优先', color: '#ea580c', description: '7天内到期、现金不足，或涉及抵押/担保/共同责任' },
  P2: { label: '关注', color: '#ca8a04', description: '30天内到期、成本较高或会导致现金流负转' },
  P3: { label: '正常', color: '#16a34a', description: '当前可按计划覆盖，保持记录和提醒' },
}

// ── Risk Level Info ────────────────────────────────────────

export const RISK_LEVEL_INFO: Record<string, { label: string; color: string }> = {
  urgent: { label: '紧急', color: '#dc2626' },
  high: { label: '高风险', color: '#ea580c' },
  medium: { label: '中等风险', color: '#ca8a04' },
  low: { label: '低风险', color: '#16a34a' },
}

// ── Debt Type Labels ───────────────────────────────────────

export const DEBT_TYPE_LABELS: Record<string, string> = {
  credit_card: '信用卡',
  bank_consumer_loan: '银行消费贷',
  online_microloan: '网络小贷',
  installment: '分期付款',
  secured_loan: '抵押/担保贷款',
  personal_borrowing: '亲友借款',
  other: '其他',
}

// ── Debt Status Labels ─────────────────────────────────────

export const DEBT_STATUS_LABELS: Record<string, string> = {
  normal: '正常',
  due_soon: '即将到期',
  overdue: '已逾期',
  negotiating: '协商中',
  restructured: '已重组',
  closed: '已结清',
}

// ── Disclaimer Version ─────────────────────────────────────

export const DISCLAIMER_VERSION = '1.0.0'

export const DISCLAIMER_TEXT = `PFOS（Personal Financial Operating System）是一个个人财务信息整理与决策辅助工具。

本工具不构成金融建议、法律服务、贷款中介或征信修复服务。所有分析结果基于用户自行录入的数据，不保证绝对准确性。

用户保留对所有财务决策的最终判断与责任。涉及具体协商、诉讼、法律问题或重大资产处置时，请咨询具备资质的专业律师或金融顾问。

本工具不会自动联系金融机构、不承诺协商结果、不代替用户作出任何具有法律或财务后果的决定。`

// ── Negotiation Checklist Template ─────────────────────────

export const NEGOTIATION_CHECKLIST_TEMPLATE = [
  { code: 'identity_docs', label: '身份证与账户信息是否齐全' },
  { code: 'loan_contract', label: '借款合同、账单与还款记录是否齐全' },
  { code: 'income_verified', label: '当前收入与必要支出是否已核实' },
  { code: 'affordable_range', label: '可承受的月度还款区间是否已计算' },
  { code: 'questions_listed', label: '希望向债权方询问的方案是否已列清' },
  { code: 'reply_recorded', label: '对方回复、工号、时间与渠道是否已记录' },
  { code: 'written_confirmation', label: '任何新方案是否取得可核实的书面信息' },
  { code: 'professional_consult', label: '是否存在需要咨询律师或正规机构的情形' },
]
