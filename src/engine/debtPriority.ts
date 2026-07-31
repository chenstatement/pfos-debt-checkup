/**
 * PFOS Debt Priority Engine — P0-P3 Ordering Within Same Priority Level
 *
 * When multiple debts share the same priority level, this module
 * determines the ordering based on:
 * 1. Closer due date
 * 2. Confirmed amounts before estimated
 * 3. Essential living / collateral / guarantee impact first
 * 4. Higher cost
 * 5. Larger current amount due
 *
 * Ported from existing PFOS debtPriority.js, adapted to TypeScript + MoneyFen.
 */

import type { DebtAccount, PriorityLevel, RiskAssessment } from '../domain/types'

interface ScoredDebt extends DebtAccount {
  assessment: RiskAssessment
  _sortKey: number
}

/**
 * Sort debts within each priority level by the specified ordering rules.
 * Returns a flat array of debts sorted from most to least urgent.
 */
export function sortDebtsByPriority(
  debts: DebtAccount[],
  assessments: RiskAssessment[]
): ScoredDebt[] {
  const assessmentMap = new Map(assessments.map(a => [a.debtId, a]))
  const priorityOrder: PriorityLevel[] = ['P0', 'P1', 'P2', 'P3']

  const scored: ScoredDebt[] = debts
    .filter(d => d.deletedAt === undefined)
    .map(debt => {
      const assessment = assessmentMap.get(debt.id)
      if (!assessment) {
        return {
          ...debt,
          assessment: {
            id: '', userId: debt.userId, debtId: debt.id,
            riskLevel: 'low', priority: 'P3', reasonCodes: [],
            recommendedActionCodes: [], requiresHumanVerification: false,
            ruleVersion: '', inputVersion: '', assessedAt: new Date().toISOString(),
          },
          _sortKey: 999,
        }
      }

      // Compute intra-priority sort key (lower = more urgent)
      const now = new Date()
      const dueDate = new Date(debt.nextDueDate)
      const daysUntilDue = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      let sortKey = 0

      // 1. Due date proximity (closer = more urgent = lower sortKey)
      if (daysUntilDue <= 3) sortKey -= 500
      else if (daysUntilDue <= 7) sortKey -= 300
      else if (daysUntilDue <= 30) sortKey -= 100
      else sortKey += daysUntilDue * 0.01 // further out = less urgent

      // 2. Confirmed data before estimated
      if (debt.dataConfidence === 'estimated') sortKey += 50
      if (debt.dataConfidence === 'unknown') sortKey += 100

      // 3. Essential living / collateral / guarantee impact
      if (debt.affectsEssentialLiving) sortKey -= 400
      if (debt.hasCollateral || debt.hasGuarantor || debt.hasCoBorrower) sortKey -= 300

      // 4. Higher cost
      if (debt.annualRateBps !== undefined) {
        sortKey -= debt.annualRateBps * 0.01 // higher rate = more urgent
      }

      // 5. Larger amount due
      sortKey -= debt.currentAmountDueFen * 0.00001 // larger = more urgent

      return { ...debt, assessment, _sortKey: sortKey }
    })

  // Sort: first by priority level, then by intra-priority sort key
  scored.sort((a, b) => {
    const pa = priorityOrder.indexOf(a.assessment.priority)
    const pb = priorityOrder.indexOf(b.assessment.priority)
    if (pa !== pb) return pa - pb
    return a._sortKey - b._sortKey
  })

  return scored
}

/**
 * Get a human-readable explanation for why a debt has its current priority.
 */
export function getPriorityExplanation(debt: ScoredDebt): string {
  const parts: string[] = []
  const { assessment } = debt

  if (assessment.priority === 'P0') {
    parts.push('P0（紧急）：')
    if (assessment.reasonCodes.includes('OVERDUE')) parts.push('已逾期')
    if (assessment.reasonCodes.includes('DUE_WITHIN_3_DAYS')) parts.push('3天内到期且现金不足')
  } else if (assessment.priority === 'P1') {
    parts.push('P1（高优先）：')
    if (assessment.reasonCodes.includes('DUE_WITHIN_7_DAYS')) parts.push('7天内到期')
    if (assessment.reasonCodes.includes('INSUFFICIENT_CASH')) parts.push('现金不足')
    if (assessment.reasonCodes.includes('COLLATERAL_OR_GUARANTEE')) parts.push('涉及抵押/担保/共同责任')
  } else if (assessment.priority === 'P2') {
    parts.push('P2（关注）：')
    if (assessment.reasonCodes.includes('FORECAST_NEGATIVE')) parts.push('30天内现金流将转负')
    if (assessment.reasonCodes.includes('HIGH_COST')) parts.push('债务成本较高')
  } else {
    parts.push('P3（正常）：当前可按计划覆盖')
  }

  return parts.join('')
}
