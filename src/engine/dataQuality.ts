/**
 * Data quality assessment — evaluates completeness of user-provided financial data.
 *
 * A report may be useful before every field is known, but it must not pretend
 * to be precise. This module makes the distinction explicit and explains what
 * the user should confirm next.
 *
 * Ported from existing PFOS dataQuality.js, adapted to TypeScript + MoneyFen.
 */

import type { ISODate, MoneyFen, DebtAccount, FinancialProfile } from '../domain/types'

interface MissingItem {
  id: string
  label: string
}

interface DataQualityResult {
  score: number
  level: 'precise' | 'standard' | 'preliminary'
  label: string
  missing: MissingItem[]
  isPrecise: boolean
  explanation: string
}

export function assessFinancialData(
  profile: Partial<FinancialProfile>,
  incomes: { amountFen?: MoneyFen; amount?: number; dayOfMonth?: number; recurring?: boolean; oneTimeDate?: string }[],
  expenses: { amountFen?: MoneyFen; amount?: number; dayOfMonth?: number; recurring?: boolean; oneTimeDate?: string }[],
  debts: DebtAccount[]
): DataQualityResult {
  const missing: MissingItem[] = []
  let score = 0

  // Available cash (20 pts)
  if (profile.availableCashFen !== undefined && profile.availableCashFen >= 0) {
    score += 20
  } else {
    missing.push({ id: 'available_cash', label: '确认今天真正可以动用的现金' })
  }

  // As-of date (5 pts)
  if (profile.dataAsOf) score += 5
  else missing.push({ id: 'data_as_of', label: '确认本次测算的基准日期' })

  // Income (15 pts)
  if (incomes.length === 0) {
    missing.push({ id: 'income', label: '至少添加一笔收入来源' })
  } else {
    const hasComplete = incomes.some(i =>
      (i.amountFen && i.amountFen > 0) || (i.amount && i.amount > 0)
    )
    score += hasComplete ? 12 : 5
    if (!hasComplete) missing.push({ id: 'income_amount', label: '补全收入金额' })
    const hasDates = incomes.some(i => i.dayOfMonth || i.oneTimeDate)
    if (!hasDates) missing.push({ id: 'income_dates', label: '补全收入到账日期' })
    else score += 3
  }

  // Expenses (15 pts)
  if (expenses.length === 0) {
    missing.push({ id: 'expenses', label: '至少添加一笔必要支出' })
  } else {
    const hasComplete = expenses.some(e =>
      (e.amountFen && e.amountFen > 0) || (e.amount && e.amount > 0)
    )
    score += hasComplete ? 12 : 5
    if (!hasComplete) missing.push({ id: 'expense_amount', label: '补全必要支出金额' })
    const hasDates = expenses.some(e => e.dayOfMonth || e.oneTimeDate)
    if (!hasDates) missing.push({ id: 'expense_dates', label: '补全扣款日期' })
    else score += 3
  }

  // Debts (30 pts base + 10 bonus)
  if (debts.length === 0) {
    missing.push({ id: 'debts', label: '至少录入一笔当前债务' })
  } else {
    score += 15
    let allHaveAmounts = true
    let allHaveDates = true
    for (const d of debts) {
      if (d.outstandingPrincipalFen <= 0) allHaveAmounts = false
      if (!d.status.includes('overdue') && !d.nextDueDate) allHaveDates = false
    }
    if (allHaveAmounts) score += 10
    else missing.push({ id: 'debt_amounts', label: '确认每笔债务的剩余本金' })
    if (allHaveDates) score += 10
    else missing.push({ id: 'debt_dates', label: '确认未逾期债务的下一还款日期' })

    const unknownConfidence = debts.some(d => d.dataConfidence === 'unknown')
    if (!unknownConfidence) score += 5
    else missing.push({ id: 'debt_confidence', label: '标记估算或未确认的债务数据' })
  }

  // Assets (5 pts)
  score += 5 // assets are optional in Phase 1

  score = Math.max(0, Math.min(100, score))
  const level = missing.length === 0 && score >= 90
    ? 'precise'
    : score >= 60
      ? 'standard'
      : 'preliminary'

  const label = level === 'precise'
    ? '高完整度数据'
    : level === 'standard'
      ? '标准数据'
      : '初步数据'

  return {
    score,
    level,
    label,
    missing,
    isPrecise: level === 'precise',
    explanation: level === 'precise'
      ? '关键金额与日期已较完整，可用于90天日级推演。'
      : `当前结论基于已填写数据，仍有 ${missing.length} 项关键信息可继续确认。缺失数据不会产生虚假精确结果。`,
  }
}
