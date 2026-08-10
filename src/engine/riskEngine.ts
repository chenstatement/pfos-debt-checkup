/**
 * DNOS Risk & Priority Engine — R01-R08 Rules + P0-P3 Priority
 *
 * Implements the deterministic risk assessment and priority ranking
 * defined in Section 8.4–8.5 of the Phase 1 spec.
 *
 * KEY PRINCIPLES:
 * - All rules are pure functions
 * - Same input + same rule version → same output (deterministic)
 * - Every rule has a unique ID (R01-R08)
 * - No LLM/ML involved in core calculations
 * - Results must be traceable to input data and specific rules
 */

import type {
  ISODate, MoneyFen, RiskLevel, PriorityLevel,
  RiskReasonCode, ActionCode, RiskAssessment, ActionItem,
  RiskWarning, RiskEngineInput, RiskEngineOutput,
  FinancialProfile, DebtAccount, ForecastSnapshot,
} from '../domain/types'
import { RULE_VERSION, THRESHOLDS, isActiveDebt } from '../domain/constants'

// ── Rule Definitions (R01-R08) ────────────────────────────

interface RiskRule {
  id: string
  description: string
  check: (debt: DebtAccount, context: RuleContext) => boolean
  riskLevel: RiskLevel
  reasonCodes?: RiskReasonCode[]
  getReasonCodes?: (debt: DebtAccount) => RiskReasonCode[]
  actionCodes: ActionCode[]
  requiresHumanVerification: boolean
}

interface RuleContext {
  asOfDate: ISODate
  profile: FinancialProfile
  forecast: ForecastSnapshot
  availableCashFen: MoneyFen
}

function daysUntil(date: ISODate, asOf: ISODate): number {
  const d = new Date(date)
  const a = new Date(asOf)
  return Math.ceil((d.getTime() - a.getTime()) / (1000 * 60 * 60 * 24))
}

const RULES: RiskRule[] = [
  // ── R01: Already overdue ──────────────────────────────────
  {
    id: 'R01',
    description: '债务已逾期',
    check: (debt) => debt.status === 'overdue',
    riskLevel: 'high',
    reasonCodes: ['OVERDUE'],
    actionCodes: ['CONTACT_CREDITOR', 'PREPARE_PAYMENT'],
    requiresHumanVerification: false,
  },

  // ── R02: Overdue + collateral/guarantor ───────────────────
  {
    id: 'R02',
    description: '已逾期且存在抵押、担保或共同借款人',
    check: (debt) =>
      debt.status === 'overdue' &&
      (debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower),
    riskLevel: 'urgent',
    reasonCodes: ['OVERDUE', 'COLLATERAL_OR_GUARANTEE'],
    actionCodes: ['CONTACT_CREDITOR', 'SEEK_PROFESSIONAL_HELP'],
    requiresHumanVerification: true,
  },

  // ── R03: Due within 3 days + insufficient cash ────────────
  {
    id: 'R03',
    description: '3天内到期且当前可用现金不足',
    check: (debt, ctx) => {
      if (debt.status === 'overdue' || debt.status === 'closed') return false
      const days = daysUntil(debt.nextDueDate, ctx.asOfDate)
      return days >= 0 && days <= THRESHOLDS.URGENT_DUE_DAYS &&
        debt.currentAmountDueFen > ctx.availableCashFen
    },
    riskLevel: 'urgent',
    reasonCodes: ['DUE_WITHIN_3_DAYS', 'INSUFFICIENT_CASH'],
    actionCodes: ['CONTACT_CREDITOR', 'PREPARE_PAYMENT'],
    requiresHumanVerification: false,
  },

  // ── R04: Due within 7 days + forecast negative after payment ──
  {
    id: 'R04',
    description: '7天内到期且预测支付后余额为负',
    check: (debt, ctx) => {
      if (debt.status === 'overdue' || debt.status === 'closed') return false
      const days = daysUntil(debt.nextDueDate, ctx.asOfDate)
      if (days < 0 || days > THRESHOLDS.HIGH_RISK_DUE_DAYS) return false
      // Check the daily balance at the debt's due date (or the first negative within the window)
      const duePoint = ctx.forecast.points.find(p => p.date === debt.nextDueDate)
      if (duePoint && duePoint.closingBalanceFen < 0) return true
      // Fallback: if no exact match, check if any negative occurs within 7 days
      if (ctx.forecast.firstNegativeDate) {
        return daysUntil(ctx.forecast.firstNegativeDate, ctx.asOfDate) <= THRESHOLDS.HIGH_RISK_DUE_DAYS
      }
      return false
    },
    riskLevel: 'high',
    reasonCodes: ['DUE_WITHIN_7_DAYS', 'FORECAST_NEGATIVE'],
    actionCodes: ['PREPARE_PAYMENT', 'CONTACT_CREDITOR'],
    requiresHumanVerification: false,
  },

  // ── R05: Debt due within 30 days + forecast shows negative ──
  {
    id: 'R05',
    description: '30天内现金流将首次转负，且此债务在该窗口内到期',
    check: (debt, ctx) => {
      if (!ctx.forecast.firstNegativeDate) return false
      if (debt.status === 'closed') return false
      // Only flag this debt if its due date falls on or before the first negative date
      const debtDays = daysUntil(debt.nextDueDate, ctx.asOfDate)
      const gapDays = daysUntil(ctx.forecast.firstNegativeDate!, ctx.asOfDate)
      if (debtDays < 0 || gapDays > 30) return false
      return debtDays <= gapDays
    },
    riskLevel: 'high',
    reasonCodes: ['FORECAST_NEGATIVE'],
    actionCodes: ['PREPARE_PAYMENT', 'PREPARE_NEGOTIATION'],
    requiresHumanVerification: false,
  },

  // ── R06: High cost ────────────────────────────────────────
  {
    id: 'R06',
    description: '年化成本高于阈值',
    check: (debt) =>
      debt.annualRateBps !== undefined &&
      debt.annualRateBps >= THRESHOLDS.HIGH_COST_RATE_BPS,
    riskLevel: 'medium',
    reasonCodes: ['HIGH_COST'],
    actionCodes: ['PREPARE_NEGOTIATION', 'PREPARE_PAYMENT'],
    requiresHumanVerification: false,
  },

  // ── R07: Missing critical data ────────────────────────────
  {
    id: 'R07',
    description: '关键字段缺失',
    check: (debt) =>
      !debt.outstandingPrincipalFen ||
      !debt.currentAmountDueFen ||
      !debt.nextDueDate ||
      debt.dataConfidence === 'unknown',
    riskLevel: 'medium',
    reasonCodes: ['MISSING_CRITICAL_DATA'],
    actionCodes: ['VERIFY_DATA'],
    requiresHumanVerification: false,
  },

  // ── R08: Essential living impact ──────────────────────────
  {
    id: 'R08',
    description: '债务影响基本生活或共同责任',
    check: (debt) =>
      debt.affectsEssentialLiving === true ||
      debt.hasCollateral ||
      debt.hasGuarantor ||
      debt.hasCoBorrower,
    riskLevel: 'high',
    getReasonCodes: (debt: DebtAccount): RiskReasonCode[] => {
      const codes: RiskReasonCode[] = []
      if (debt.affectsEssentialLiving) codes.push('ESSENTIAL_LIVING_IMPACT')
      if (debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower) codes.push('COLLATERAL_OR_GUARANTEE')
      return codes
    },
    actionCodes: ['SEEK_PROFESSIONAL_HELP', 'CONTACT_CREDITOR'],
    requiresHumanVerification: true,
  },
]

// ── Main Entry Point ───────────────────────────────────────

export function assessDebtRisk(input: RiskEngineInput): RiskEngineOutput {
  const { asOfDate, profile, debts, forecast, ruleVersion } = input

  const availableCashFen = profile.availableCashFen
  const context: RuleContext = { asOfDate, profile, forecast, availableCashFen }

  const activeDebts = debts.filter(isActiveDebt)
  const assessments: RiskAssessment[] = []
  const warnings: RiskWarning[] = []
  const allActionCodes = new Set<ActionCode>()

  for (const debt of activeDebts) {
    const matchedRules: RiskRule[] = []
    const allReasonCodes: RiskReasonCode[] = []
    const allActionCodesForDebt: ActionCode[] = []
    let highestRisk: RiskLevel = 'low'
    let requiresHumanVerification = false

    for (const rule of RULES) {
      if (rule.check(debt, context)) {
        matchedRules.push(rule)
        const codes = rule.getReasonCodes ? rule.getReasonCodes(debt) : (rule.reasonCodes || [])
        allReasonCodes.push(...codes)
        allActionCodesForDebt.push(...rule.actionCodes)

        // Escalate risk level
        if (rule.riskLevel === 'urgent') highestRisk = 'urgent'
        else if (rule.riskLevel === 'high' && highestRisk !== 'urgent') highestRisk = 'high'
        else if (rule.riskLevel === 'medium' && highestRisk !== 'urgent' && highestRisk !== 'high') highestRisk = 'medium'

        if (rule.requiresHumanVerification) requiresHumanVerification = true
      }
    }

    // Deduplicate reason codes
    const uniqueReasons = [...new Set(allReasonCodes)]
    const uniqueActions = [...new Set(allActionCodesForDebt)]
    uniqueActions.forEach(a => allActionCodes.add(a))

    // CR-05: Only flag missing data when data is actually insufficient.
    // A debt with no matching risk rules and complete data is simply a normal debt.
    if (matchedRules.length === 0) {
      if (!isDebtDataSufficient(debt)) {
        uniqueReasons.push('MISSING_CRITICAL_DATA')
        uniqueActions.push('VERIFY_DATA')
        allActionCodes.add('VERIFY_DATA')
      }
      // Normal debt with no risk triggers — keep low risk, no false reasons
    }

    // ── Detect past due date with status still "normal" ──
    // Already-past due debts must be flagged as overdue regardless of data completeness
    if (debt.status === 'normal' && debt.nextDueDate < context.asOfDate) {
      uniqueReasons.push('OVERDUE')
      uniqueActions.push('PREPARE_PAYMENT')
      allActionCodes.add('PREPARE_PAYMENT')
      highestRisk = 'urgent'
      // Only add MISSING_CRITICAL_DATA when data is actually insufficient
      if (!isDebtDataSufficient(debt)) {
        uniqueReasons.push('MISSING_CRITICAL_DATA')
        uniqueActions.push('VERIFY_DATA')
        allActionCodes.add('VERIFY_DATA')
      }
    }

    // ── Compute priority (P0-P3) ────────────────────────────
    const priority = computePriority(debt, highestRisk, context)

    assessments.push({
      id: `risk_${debt.id}`,
      userId: debt.userId,
      debtId: debt.id,
      riskLevel: highestRisk,
      priority,
      reasonCodes: uniqueReasons,
      recommendedActionCodes: uniqueActions,
      requiresHumanVerification,
      ruleVersion,
      inputVersion: ruleVersion, // track input snapshot version
      assessedAt: context.asOfDate,
    })
  }

  // ── Generate actions from assessments ────────────────────
  const actions = generateActions(assessments, activeDebts, profile, asOfDate)

  // ── Generate warnings ────────────────────────────────────
  if (forecast.firstNegativeDate) {
    warnings.push({
      code: 'FORECAST_NEGATIVE',
      message: `预测显示 ${forecast.firstNegativeDate} 将出现资金缺口，缺口金额 ${forecast.gap30dFen} 分。这不是金融建议，请核实数据。`,
    })
  }

  const urgentCount = assessments.filter(a => a.riskLevel === 'urgent').length
  if (urgentCount > 0) {
    warnings.push({
      code: 'URGENT_DEBTS_EXIST',
      message: `当前有 ${urgentCount} 笔债务处于紧急状态。建议优先处理，并在必要时联系债权方或专业人士。`,
    })
  }

  if (assessments.some(a => a.reasonCodes.includes('MISSING_CRITICAL_DATA'))) {
    warnings.push({
      code: 'DATA_INCOMPLETE',
      message: '部分债务关键数据缺失，当前风险结论基于不完整数据。建议补充缺失信息以获得更准确的分析。',
    })
  }

  return { assessments, actions, warnings }
}

// ── Priority Computation (P0-P3) ───────────────────────────

function computePriority(
  debt: DebtAccount,
  riskLevel: RiskLevel,
  ctx: RuleContext
): PriorityLevel {
  // P0: Overdue status OR past-due date with status still "normal"
  if (debt.status === 'overdue') return 'P0'
  if (debt.status === 'normal' && debt.nextDueDate < ctx.asOfDate) return 'P0'

  const days = daysUntil(debt.nextDueDate, ctx.asOfDate)
  if (days <= THRESHOLDS.URGENT_DUE_DAYS && debt.currentAmountDueFen > ctx.availableCashFen) {
    return 'P0'
  }

  // P1: 7-day, insufficient cash, or collateral/guarantee
  if (days <= THRESHOLDS.HIGH_RISK_DUE_DAYS &&
    (debt.currentAmountDueFen > ctx.availableCashFen || ctx.forecast.firstNegativeDate)) {
    return 'P1'
  }
  if (debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower) {
    return 'P1'
  }

  // P2: 30-day due + high cost, or will cause negative within window
  if (days <= 30) {
    if (debt.annualRateBps !== undefined && debt.annualRateBps >= THRESHOLDS.HIGH_COST_RATE_BPS) {
      return 'P2'
    }
    if (ctx.forecast.firstNegativeDate && daysUntil(ctx.forecast.firstNegativeDate!, ctx.asOfDate) <= 30) {
      return 'P2'
    }
    // Due within 30 days but no specific risk trigger → stays P3 if cash-sufficient
    // Only escalate if cash can't cover this payment
    if (debt.currentAmountDueFen > ctx.availableCashFen) {
      return 'P2'
    }
  }

  // P3: Currently manageable
  return 'P3'
}

// ── Action Generation ──────────────────────────────────────

function generateActions(
  assessments: RiskAssessment[],
  debts: DebtAccount[],
  _profile: FinancialProfile,
  now: string
): ActionItem[] {
  const actions: ActionItem[] = []
  const debtMap = new Map(debts.map(d => [d.id, d]))

  for (const assessment of assessments) {
    const debt = debtMap.get(assessment.debtId)
    if (!debt) continue

    for (const actionCode of assessment.recommendedActionCodes) {
      const action = buildAction(assessment, debt, actionCode, now)
      if (action) actions.push(action)
    }
  }

  // Deduplicate by title
  const seen = new Set<string>()
  return actions.filter(a => {
    const key = a.title
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function buildAction(
  assessment: RiskAssessment,
  debt: DebtAccount,
  actionCode: ActionCode,
  now: string
): ActionItem | null {
  const base = {
    id: `action_${debt.id}_${actionCode}`,
    userId: debt.userId,
    relatedDebtId: debt.id,
    actionCode,
    priority: assessment.priority,
    status: 'todo' as const,
    steps: [] as string[],
    createdAt: now,
    updatedAt: now,
  }

  switch (actionCode) {
    case 'VERIFY_DATA':
      return {
        ...base,
        title: `核实债务数据：${debt.creditorName}`,
        reason: assessment.reasonCodes.includes('MISSING_CRITICAL_DATA')
          ? '关键数据缺失，无法准确评估风险'
          : '建议核实数据以确保分析准确',
        steps: ['核对剩余本金', '确认本期应还金额', '确认还款日期'],
      }
    case 'PREPARE_PAYMENT':
      return {
        ...base,
        title: `准备还款：${debt.creditorName}`,
        reason: `本期应还 ¥${(debt.currentAmountDueFen / 100).toFixed(2)}，到期日 ${debt.nextDueDate}`,
        steps: ['确认还款金额', '确保还款账户余额充足', '设置还款提醒'],
      }
    case 'CONTACT_CREDITOR':
      return {
        ...base,
        title: `联系债权方：${debt.creditorName}`,
        reason: assessment.riskLevel === 'urgent'
          ? '紧急：债务已逾期或即将逾期，建议立即联系债权方说明情况'
          : '建议提前与债权方沟通，了解可行的还款安排',
        steps: ['查找官方客服电话或渠道', '准备债务信息', '记录沟通内容'],
      }
    case 'PREPARE_NEGOTIATION':
      return {
        ...base,
        title: `准备协商材料：${debt.creditorName}`,
        reason: '整理收入、支出和负债信息，为可能的协商做准备',
        steps: ['整理近3个月银行流水', '准备收入证明', '列出可承受的还款区间'],
      }
    case 'REVIEW_WRITTEN_TERMS':
      return {
        ...base,
        title: `复核书面条款：${debt.creditorName}`,
        reason: '涉及新方案时，务必取得并复核书面确认',
        steps: ['获取书面协议', '仔细阅读条款', '确认金额、期限和费用'],
      }
    case 'SEEK_PROFESSIONAL_HELP':
      return {
        ...base,
        title: `考虑专业咨询：${debt.creditorName}`,
        reason: '涉及抵押、担保或共同责任，建议咨询专业人士',
        steps: ['评估是否需要律师协助', '查找正规法律援助渠道', '准备相关文件'],
      }
    case 'UPDATE_RESULT':
      return {
        ...base,
        title: `更新执行结果：${debt.creditorName}`,
        reason: '记录实际还款或协商结果，保持数据准确',
        steps: ['记录实际还款金额和日期', '更新债务状态', '记录任何新约定'],
      }
    default:
      return null
  }
}

// ── Public helpers ─────────────────────────────────────────

/** Check if a single debt's data is sufficient for reliable risk assessment */
export function isDebtDataSufficient(debt: DebtAccount): boolean {
  return !!(
    debt.outstandingPrincipalFen > 0 &&
    debt.currentAmountDueFen > 0 &&
    debt.nextDueDate &&
    debt.creditorName
  )
}

/** Get the single most urgent action from a list */
export function getTopAction(actions: ActionItem[]): ActionItem | null {
  const priorityOrder: PriorityLevel[] = ['P0', 'P1', 'P2', 'P3']
  const sorted = [...actions].sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
  )
  return sorted[0] || null
}
