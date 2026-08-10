/**
 * PFOS Action Plan Generator — Condition-based action templates
 *
 * Generates concrete, executable action items based on financial analysis.
 * Ported from existing PFOS actionPlan.js, adapted to TypeScript + MoneyFen.
 *
 * Design: Each template is a {condition, generate} pair.
 * The system evaluates all templates and collects matching actions.
 */

import type { ActionItem, PriorityLevel, DebtAccount, ISODate } from '../domain/types'
import type { NowcastResult } from './nowcast'
import { THRESHOLDS, ACTION_CODE_LABELS } from '../domain/constants'

// ── Context types ──────────────────────────────────────────

interface Aggregates {
  totalMonthlyIncomeFen: number
  totalMonthlyExpenseFen: number
  totalMonthlyDebtFen: number
  monthlyBalanceFen: number
  availableCashFen: number
  totalDebtPrincipalFen: number
  dti: number
  highInterestRatio: number
  survivalMonths: number
  hasAnyOverdue: boolean
  overdueCount: number
  maxOverdueDays: number
  platformCount: number
  chainDefaultRisk: boolean
}

interface ScoredDebtForActions extends DebtAccount {
  priorityScore?: number
  priorityLevel?: string
}

type Urgency = 'immediate' | 'today' | 'this_week' | 'this_month'

interface ActionTemplate {
  id: string
  category: string
  urgency: Urgency
  condition: (agg: Aggregates, priorityDebts: ScoredDebtForActions[], nowcast: NowcastResult | null) => boolean
  generate: (agg: Aggregates, priorityDebts: ScoredDebtForActions[], nowcast: NowcastResult | null) => { title: string; detail: string }
}

// ── Compute aggregates ─────────────────────────────────────

export function computeAggregates(
  incomes: { amountFen?: number; amount?: number; certainty?: string }[],
  expenses: { amountFen?: number; amount?: number; essential?: boolean }[],
  debts: DebtAccount[],
  availableCashFen: number = 0
): Aggregates {
  const totalMonthlyIncomeFen = incomes
    .filter(i => i.certainty !== 'uncertain')
    .reduce((s, i) => s + (i.amountFen ?? Math.round((i.amount || 0) * 100)), 0)

  const totalMonthlyExpenseFen = expenses
    .filter(e => e.essential !== false)
    .reduce((s, e) => s + (e.amountFen ?? Math.round((e.amount || 0) * 100)), 0)

  const totalMonthlyDebtFen = debts.reduce((s, d) => {
    // Prefer monthlyPaymentFen (月供); for balloon debts with no monthly payment, count 0
    if (d.monthlyPaymentFen > 0) return s + d.monthlyPaymentFen
    if (d.repaymentMethod === 'balloon') return s + 0
    return s + d.currentAmountDueFen
  }, 0)
  const monthlyBalanceFen = totalMonthlyIncomeFen - totalMonthlyExpenseFen - totalMonthlyDebtFen
  const totalDebtPrincipalFen = debts.reduce((s, d) => {
    // Use outstanding principal if available; otherwise fall back to current amount due
    return s + (d.outstandingPrincipalFen > 0 ? d.outstandingPrincipalFen : d.currentAmountDueFen)
  }, 0)
  const dti = totalMonthlyIncomeFen > 0 ? (totalMonthlyDebtFen / totalMonthlyIncomeFen) * 100 : 0

  const highInterestDebtFen = debts
    .filter(d => (d.annualRateBps || 0) >= THRESHOLDS.HIGH_COST_RATE_BPS)
    .reduce((s, d) => s + d.outstandingPrincipalFen, 0)
  const highInterestRatio = totalDebtPrincipalFen > 0 ? (highInterestDebtFen / totalDebtPrincipalFen) * 100 : 0

  const monthlyOutflowFen = totalMonthlyExpenseFen + totalMonthlyDebtFen
  const survivalMonths = monthlyOutflowFen > 0 ? availableCashFen / monthlyOutflowFen : (availableCashFen > 0 ? 99 : 0)

  const hasAnyOverdue = debts.some(d => d.status === 'overdue')
  const overdueDebts = debts.filter(d => d.status === 'overdue')
  const overdueCount = overdueDebts.length
  const maxOverdueDays = overdueDebts.reduce((max, d) => {
    if (!d.overdueSince) return max
    const days = Math.ceil((Date.now() - new Date(d.overdueSince).getTime()) / (1000 * 60 * 60 * 24))
    return Math.max(max, days)
  }, 0)

  const platformCount = new Set(debts.map(d => d.creditorName).filter(Boolean)).size
  const chainDefaultRisk = hasAnyOverdue && monthlyBalanceFen < 0

  return {
    totalMonthlyIncomeFen, totalMonthlyExpenseFen, totalMonthlyDebtFen,
    monthlyBalanceFen, availableCashFen, totalDebtPrincipalFen,
    dti, highInterestRatio, survivalMonths,
    hasAnyOverdue, overdueCount, maxOverdueDays,
    platformCount, chainDefaultRisk,
  }
}

// ── Action Templates ───────────────────────────────────────

const ACTION_TEMPLATES: ActionTemplate[] = [
  // ── Emergency / Stop Loss ──────────────────────────────────
  {
    id: 'stop_new_borrowing',
    category: '止损',
    urgency: 'immediate',
    condition: (agg) => agg.dti > 70 || agg.monthlyBalanceFen < 0,
    generate: () => ({
      title: '立即停止新增借贷',
      detail: '在现金流回正前，不再申请任何新的贷款、信用卡或分期。每新增一笔借款都会加速恶化。',
    }),
  },
  {
    id: 'preserve_cash',
    category: '止损',
    urgency: 'immediate',
    condition: (agg) => agg.survivalMonths < 2,
    generate: () => ({
      title: '保留基本生活费',
      detail: '当前现金储备不足，请优先保障基本生活支出（食物、住房、医疗、交通）。还债计划应在保障基本生活后安排。如需法律建议，请咨询专业律师。',
    }),
  },
  {
    id: 'reduce_expenses',
    category: '止损',
    urgency: 'this_week',
    condition: (agg) => agg.monthlyBalanceFen < 0,
    generate: (agg) => ({
      title: '本周内审查并压缩非必要支出',
      detail: `当前月度缺口 ¥${(Math.abs(agg.monthlyBalanceFen) / 100).toFixed(2)}，需要从支出端寻找削减空间。`,
    }),
  },

  // ── Debt Priority Actions ──────────────────────────────────
  {
    id: 'handle_overdue_first',
    category: '还债',
    urgency: 'today',
    condition: (agg, p) => p.some(b => b.status === 'overdue'),
    generate: (_agg, p) => {
      const overdueList = p.filter(b => b.status === 'overdue')
      const names = overdueList.map(b => b.creditorName).join('、')
      return {
        title: `优先处理逾期债务：${names}`,
        detail: `逾期债务共 ${overdueList.length} 笔。保持沟通记录，固定对方联系人和时间。越早处理，后果越轻。`,
      }
    },
  },
  {
    id: 'pay_high_interest',
    category: '还债',
    urgency: 'this_week',
    condition: (_agg, p) => p.some(b => b.status !== 'overdue' && (b.annualRateBps || 0) >= THRESHOLDS.HIGH_COST_RATE_BPS),
    generate: (_agg, p) => {
      const highInterest = p.filter(b => b.status !== 'overdue' && (b.annualRateBps || 0) >= THRESHOLDS.HIGH_COST_RATE_BPS)
      const top = highInterest[0]
      const rate = top.annualRateBps ? (top.annualRateBps / 100).toFixed(1) : '?'
      return {
        title: `高息债务关注：${top.creditorName}（年化 ${rate}%）`,
        detail: '高息债务的利息负担较重。你可根据自身情况，优先安排偿还高息债务，或向债权方了解是否有更低成本的还款方案。',
      }
    },
  },

  // ── Negotiation Prep ───────────────────────────────────────
  {
    id: 'prepare_negotiation',
    category: '协商',
    urgency: 'this_week',
    condition: (_agg, p) => p.some(b => b.status === 'overdue' && b.overdueSince !== undefined),
    generate: () => ({
      title: '准备协商材料',
      detail: '整理近3个月银行流水、收入证明、债务清单。了解各平台协商政策，准备好书面说明材料。',
    }),
  },
  {
    id: 'record_communications',
    category: '协商',
    urgency: 'today',
    condition: (agg) => agg.hasAnyOverdue,
    generate: () => ({
      title: '固定所有沟通记录',
      detail: '保留所有通话录音、短信截图、App消息。记录每次沟通的时间、对方姓名、核心内容。',
    }),
  },

  // ── Planning ───────────────────────────────────────────────
  {
    id: 'build_emergency_fund',
    category: '规划',
    urgency: 'this_month',
    condition: (agg) => agg.survivalMonths < THRESHOLDS.MIN_SURVIVAL_MONTHS,
    generate: () => ({
      title: '建立应急资金目标',
      detail: `建议储备至少 ${THRESHOLDS.MIN_SURVIVAL_MONTHS} 个月基本生活费作为应急资金。在还债同时，尽量留一笔备用金。`,
    }),
  },
  {
    id: 'avoid_borrow_to_pay',
    category: '止损',
    urgency: 'immediate',
    condition: (agg) => agg.platformCount >= 5,
    generate: () => ({
      title: '注意：避免新增借贷还旧债',
      detail: '你同时在多个平台有借款。新增借款偿还现有债务可能使总债务扩大。建议优先与现有债权方沟通可行的还款安排。',
    }),
  },

  // ── Nowcast-precision actions ──────────────────────────────
  {
    id: 'cover_first_gap',
    category: '规划',
    urgency: 'immediate',
    condition: (_agg, _p, nc) => !!(nc && nc.firstGapDate && nc.firstGapAmountFen > 0),
    generate: (_agg, _p, nc) => ({
      title: `${nc!.firstGapDate} 前准备至少 ¥${(nc!.firstGapAmountFen / 100).toFixed(2)}`,
      detail: '这是当前数据下第一次出现资金缺口的日期和最低补足金额。优先压缩可延期支出、确认收入到账，并在该日期前联系临近到期的债权方。不要用新的高息借款填补缺口。',
    }),
  },
  {
    id: 'runway_critical',
    category: '止损',
    urgency: 'immediate',
    condition: (_agg, _p, nc) => !!(nc && nc.runwayDays <= THRESHOLDS.URGENT_DUE_DAYS),
    generate: (_agg, _p, nc) => ({
      title: `现金流仅剩 ${nc?.runwayDays ?? 0} 天——立即采取止损措施`,
      detail: '按当前数据推演，现金即将耗尽。立即暂停所有非必要支出，联系即将到期的债务方说明情况，寻求可信渠道的短期支持。',
    }),
  },
]

// ── Main Entry Point ────────────────────────────────────────

export function generateActionPlan(
  aggregates: Aggregates,
  priorityDebts: ScoredDebtForActions[],
  nowcast: NowcastResult | null = null
): ActionItem[] {
  const actions: ActionItem[] = []

  for (const template of ACTION_TEMPLATES) {
    if (template.condition(aggregates, priorityDebts, nowcast)) {
      const { title, detail } = template.generate(aggregates, priorityDebts, nowcast)
      actions.push({
        id: `action_${template.id}`,
        userId: '',
        actionCode: 'VERIFY_DATA', // default, will be overridden by risk engine actions
        title,
        reason: detail,
        priority: template.urgency === 'immediate' ? 'P0'
          : template.urgency === 'today' ? 'P1'
          : template.urgency === 'this_week' ? 'P2'
          : 'P3',
        status: 'todo',
        steps: [],
        createdAt: '',
        updatedAt: '',
      })
    }
  }

  // Sort by urgency
  const urgencyOrder: Record<Urgency, number> = { immediate: 0, today: 1, this_week: 2, this_month: 3 }
  actions.sort((a, b) => {
    const ua = ACTION_TEMPLATES.find(t => t.id === a.id.split('_')[1])?.urgency
    const ub = ACTION_TEMPLATES.find(t => t.id === b.id.split('_')[1])?.urgency
    return (urgencyOrder[ua as Urgency] ?? 99) - (urgencyOrder[ub as Urgency] ?? 99)
  })

  return actions
}
