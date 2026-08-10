/**
 * PFOS Report Generator — Orchestrates all engines into a unified diagnosis report.
 *
 * Ported from existing PFOS report.js, adapted to TypeScript + MoneyFen.
 */

import type { DebtAccount, FinancialProfile, ISODate, RiskAssessment, ActionItem } from '../domain/types'
import { generateNowcast, buildForecastSnapshot, type NowcastResult } from './nowcast'
import { assessDebtRisk } from './riskEngine'
import { assessFinancialData } from './dataQuality'
import { computeAggregates, generateActionPlan } from './actionPlan'
import { RULE_VERSION, RISK_LEVEL_INFO, PRIORITY_INFO, isActiveDebt } from '../domain/constants'

export interface ReportInput {
  profile: Partial<FinancialProfile>
  incomes: { amountFen?: number; amount?: number; dayOfMonth?: number; recurring?: boolean; oneTimeDate?: string; certainty?: string }[]
  expenses: { amountFen?: number; amount?: number; dayOfMonth?: number; recurring?: boolean; oneTimeDate?: string; essential?: boolean }[]
  debts: DebtAccount[]
  assets?: { amountFen?: number; amount?: number; realizableAmountFen?: number; liquid?: boolean; type?: string; availableDate?: string; availabilityKnown?: boolean; ownership?: string; pledged?: boolean; essentialUse?: boolean; label?: string }[]
  startDate?: ISODate
}

export interface FullReport {
  // Data quality
  dataQuality: ReturnType<typeof assessFinancialData>

  // Nowcast
  nowcast: NowcastResult

  // Aggregates
  aggregates: ReturnType<typeof computeAggregates>

  // Risk assessments
  riskAssessments: RiskAssessment[]

  // Risk engine output
  riskWarnings: { code: string; message: string; relatedEntityId?: string }[]

  // Action plan
  actionPlan: ActionItem[]
  topAction: ActionItem | null

  // Summary
  summary: string

  // Meta
  generatedAt: string
  ruleVersion: string
  startDate: ISODate
}

export function generateFullReport(input: ReportInput): FullReport {
  const {
    profile = {},
    incomes = [],
    expenses = [],
    debts = [],
    assets = [],
    startDate,
  } = input

  const activeDebts = debts.filter(isActiveDebt)
  const asOfDate = profile.dataAsOf || startDate || new Date().toISOString().split('T')[0]

  // ── CR-02: Ensure profile amounts are represented as income/expense events ──
  // If the user filled the profile monthly fields but didn't add list items,
  // create default events so the nowcast sees real money.
  const effectiveIncomes = incomes.length > 0 ? incomes : (
    (profile.fixedMonthlyIncomeFen && profile.fixedMonthlyIncomeFen > 0)
      ? [{ amountFen: profile.fixedMonthlyIncomeFen, label: '月度收入', dayOfMonth: profile.paydayRules?.[0]?.dayOfMonth || 15, recurring: true, certainty: 'estimated' as const }]
      : []
  )
  const effectiveExpenses = expenses.length > 0 ? expenses : (
    (profile.essentialMonthlyExpenseFen && profile.essentialMonthlyExpenseFen > 0)
      ? [{ amountFen: profile.essentialMonthlyExpenseFen, label: '必要支出', dayOfMonth: 1, recurring: true, essential: true }]
      : []
  )
  // ──────────────────────────────────────────────────────────────────────────

  // Step 1: Data quality
  const dataQuality = assessFinancialData(profile, effectiveIncomes, effectiveExpenses, activeDebts)

  // Step 2: Nowcast (90-day daily cashflow)
  const nowcast = generateNowcast(effectiveIncomes, effectiveExpenses, activeDebts, assets, {
    startDate: asOfDate,
    snapshot: {
      availableCashFen: profile.availableCashFen,
      protectedCashFen: profile.protectedCashFen || 0,
      asOfDate,
    },
  })

  // Step 3: Build forecast snapshot
  const inputVersion = `${asOfDate}_${activeDebts.length}_debts`
  const forecast = buildForecastSnapshot('', nowcast, asOfDate, inputVersion)

  // Step 4: Aggregates (CR-03: pass real cash)
  const aggregates = computeAggregates(effectiveIncomes, effectiveExpenses, activeDebts, profile.availableCashFen || 0)

  // Step 5: Risk engine (R01-R08, P0-P3)
  const fullProfile: FinancialProfile = {
    id: profile.id || '',
    userId: profile.userId || '',
    availableCashFen: profile.availableCashFen || 0,
    fixedMonthlyIncomeFen: profile.fixedMonthlyIncomeFen || 0,
    essentialMonthlyExpenseFen: profile.essentialMonthlyExpenseFen || 0,
    paydayRules: profile.paydayRules || [],
    dataAsOf: asOfDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  const riskOutput = assessDebtRisk({
    asOfDate,
    profile: fullProfile,
    debts: activeDebts,
    forecast,
    ruleVersion: RULE_VERSION,
  })

  // Step 6: Action plan
  const priorityDebts = activeDebts.map(d => {
    const assessment = riskOutput.assessments.find(a => a.debtId === d.id)
    return { ...d, priorityLevel: assessment?.priority }
  })
  const actionPlan = [
    ...riskOutput.actions,
    ...generateActionPlan(aggregates, priorityDebts, nowcast),
  ]

  // Deduplicate actions
  const seenTitles = new Set<string>()
  const uniqueActions = actionPlan.filter(a => {
    if (seenTitles.has(a.title)) return false
    seenTitles.add(a.title)
    return true
  })

  // Top action
  const topAction = uniqueActions.find(a => a.priority === 'P0') ||
    uniqueActions.find(a => a.priority === 'P1') ||
    uniqueActions[0] ||
    null

  // Step 7: Summary
  const summary = generateSummary(aggregates, nowcast, riskOutput.assessments)

  return {
    dataQuality,
    nowcast,
    aggregates,
    riskAssessments: riskOutput.assessments,
    riskWarnings: riskOutput.warnings,
    actionPlan: uniqueActions,
    topAction,
    summary,
    generatedAt: new Date().toISOString(),
    ruleVersion: RULE_VERSION,
    startDate: asOfDate,
  }
}

function generateSummary(
  agg: ReturnType<typeof computeAggregates>,
  nc: NowcastResult,
  assessments: RiskAssessment[]
): string {
  const parts: string[] = []

  // Overall
  const urgentCount = assessments.filter(a => a.riskLevel === 'urgent').length
  const highCount = assessments.filter(a => a.riskLevel === 'high').length

  if (urgentCount > 0) {
    parts.push(`当前有 ${urgentCount} 笔债务处于紧急状态，需要立即关注。`)
  } else if (highCount > 0) {
    parts.push(`当前有 ${highCount} 笔债务处于高风险状态，建议尽快处理。`)
  } else {
    parts.push('当前债务状况总体可控，保持按时记录和还款。')
  }

  // Cashflow
  if (agg.monthlyBalanceFen < 0) {
    parts.push(`每月收支缺口 ¥${(Math.abs(agg.monthlyBalanceFen) / 100).toFixed(2)}。`)
  }

  if (agg.hasAnyOverdue) {
    parts.push(`已有 ${agg.overdueCount} 笔债务逾期，最长 ${agg.maxOverdueDays} 天。`)
  }

  // Nowcast
  if (nc.runwayDays < nc.horizonDays) {
    parts.push(`按当前数据推演，${nc.firstGapDate} 可能出现首次资金缺口。`)
  }

  return parts.join('')
}
