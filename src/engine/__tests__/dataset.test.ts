/**
 * PFOS-v2 数据集驱动端到端测试线束
 *
 * 将 src/engine/fixtures/scenarios.ts 中的真实场景喂入 generateFullReport，
 * 对关键 invariant 断言。断言失败 = 复现的缺陷（在测试名中以 [BUG <ID>] 标注）。
 *
 * 运行：node_modules/.bin/vitest run src/engine/__tests__/dataset.test.ts
 */

import { describe, it, beforeAll, expect } from 'vitest'
import { generateFullReport, type FullReport, type ReportInput } from '../report'
import {
  scenarioMultiDebt,
  scenarioCashRich,
  scenarioProfileOnly,
} from '../fixtures/scenarios'
import type { DebtAccount, DailyForecastPoint } from '../domain/types'

function run(scenario: typeof scenarioMultiDebt): FullReport {
  const input: ReportInput = {
    profile: scenario.profile,
    incomes: scenario.incomes,
    expenses: scenario.expenses,
    debts: scenario.debts,
  }
  return generateFullReport(input)
}

function debtEvents(ledger: DailyForecastPoint[], debtId: string): string[] {
  const dates: string[] = []
  for (const p of ledger) {
    for (const e of p.events) {
      if (e.debtId === debtId && e.type === 'debt_payment') dates.push(p.date)
    }
  }
  return dates
}

function dayOf(date: string): string {
  return date.slice(8, 10)
}

function assessmentFor(report: FullReport, debtId: string) {
  return report.riskAssessments.find(a => a.debtId === debtId)
}

function hasAction(report: FullReport, substr: string): boolean {
  return report.actionPlan.some(a => a.title.includes(substr))
}

// ── 运行前打印每个场景的实际输出，便于核对数字 ──
let R1!: FullReport
let R2!: FullReport
let R3!: FullReport

beforeAll(() => {
  R1 = run(scenarioMultiDebt)
  R2 = run(scenarioCashRich)
  R3 = run(scenarioProfileOnly)

  const dump = (name: string, r: FullReport) => {
    const nc = r.nowcast
    console.log(`\n===== ${name} =====`)
    console.log('firstNegativeDate :', nc.firstGapDate, ' gap=', (nc.firstGapAmountFen / 100).toFixed(2), '元')
    console.log('runwayDays        :', nc.runwayDays, '/', nc.horizonDays)
    console.log('collisionDays     :', nc.collisionDays.map(c => `${c.date}(${c.payments.map(p => p.label).join('+')})`))
    console.log('aggregates        :', JSON.stringify({
      income: r.aggregates.totalMonthlyIncomeFen / 100,
      expense: r.aggregates.totalMonthlyExpenseFen / 100,
      debt: r.aggregates.totalMonthlyDebtFen / 100,
      monthlyBalance: r.aggregates.monthlyBalanceFen / 100,
      survivalMonths: Number(r.aggregates.survivalMonths.toFixed(2)),
      dti: Number(r.aggregates.dti.toFixed(1)),
      overdueCount: r.aggregates.overdueCount,
    }))
    console.log('riskAssessments   :')
    for (const a of r.riskAssessments) {
      console.log(`   ${a.debtId} -> risk=${a.riskLevel} prio=${a.priority} reasons=[${a.reasonCodes.join(',')}]`)
    }
    console.log('topAction         :', r.topAction?.title ?? '（无）')
    console.log('actionPlan        :', r.actionPlan.map(a => `${a.priority}:${a.title}`))
    console.log('riskWarnings      :', r.riskWarnings.map(w => w.code))
  }
  dump(scenarioMultiDebt.name, R1)
  dump(scenarioCashRich.name, R2)
  dump(scenarioProfileOnly.name, R3)
})

// ════════════════════════════════════════════════════════════════════════
// 场景 1：典型多债家庭
// ════════════════════════════════════════════════════════════════════════
describe('场景1 典型多债家庭', () => {
  const D = scenarioMultiDebt.debts
  const D1 = D[0].id // 信用卡，5 号到期，未填 dueDay
  const D2 = D[1].id // 消费贷，20 号
  const D3 = D[2].id // 网络小贷，07-28 已过期但 status=normal
  const D4 = D[3].id // 亲友借款，影响基本生活
  const D5 = D[4].id // 已结清

  it('现金流：首次资金缺口应落在 2026-08-05（D1 当期还款引发）', () => {
    expect(R1.nowcast.firstGapDate).toBe('2026-08-05')
  })

  it('[BUG CR-02] D1 未填 dueDay，后续月供应仍在每月 05 号，而非漂移到 20 号', () => {
    const dates = debtEvents(R1.nowcast.dailyLedger, D1)
    const days = dates.map(dayOf)
    // 期望：08-05 / 09-05 / 10-05（每月 5 号）
    const allOnFifth = days.every(d => d === '05')
    expect({ dates, days, allOnFifth }).toEqual({ dates, days, allOnFifth: true })
  })

  it('[BUG CR-05/WR-02] D3 到期日 07-28 已早于基准日，应被识别为逾期，而非当作未来正常还款', () => {
    const a = assessmentFor(R1, D3)
    expect(a?.reasonCodes).toContain('OVERDUE')
  })

  it('[BUG CR-05] D3 数据完整，不应携带虚假的 MISSING_CRITICAL_DATA 原因', () => {
    const a = assessmentFor(R1, D3)
    expect(a?.reasonCodes).not.toContain('MISSING_CRITICAL_DATA')
  })

  it('[BUG CR-05] R05 把全局负值套用到窗口内每笔债：D2(08-20 到期) 未引发 08-05 缺口，却带上 FORECAST_NEGATIVE', () => {
    const a = assessmentFor(R1, D2)
    expect(a?.reasonCodes).not.toContain('FORECAST_NEGATIVE')
  })

  it('正确路径：D4 影响基本生活应触发 R08 (ESSENTIAL_LIVING_IMPACT) 且为高风险', () => {
    const a = assessmentFor(R1, D4)
    expect(a?.reasonCodes).toContain('ESSENTIAL_LIVING_IMPACT')
    expect(a?.riskLevel).toBe('high')
  })

  it('[修复验证 WR-05] 已结清的 D5 不应出现在风险评估与现金流中', () => {
    expect(assessmentFor(R1, D5)).toBeUndefined()
    expect(debtEvents(R1.nowcast.dailyLedger, D5).length).toBe(0)
  })

  it('[BUG WR-03] 同一输入两次运行，风险评估 ID 应稳定（当前含时间戳，不确定）', () => {
    const r1b = run(scenarioMultiDebt)
    expect(r1b.riskAssessments.map(a => a.id)).toEqual(R1.riskAssessments.map(a => a.id))
  })

  it('确定性验证：nowcast 日级账本对相同输入应完全一致', () => {
    const r1b = run(scenarioMultiDebt)
    expect(r1b.nowcast.dailyLedger).toEqual(R1.nowcast.dailyLedger)
  })
})

// ════════════════════════════════════════════════════════════════════════
// 场景 2：现金充裕可覆盖
// ════════════════════════════════════════════════════════════════════════
describe('场景2 现金充裕可覆盖', () => {
  it('[修复验证 CR-03] 现金充裕(¥100万)且可完全覆盖时，不应出现“保留基本生活费”等误报紧急行动', () => {
    expect(hasAction(R2, '保留基本生活费')).toBe(false)
    expect(R2.aggregates.survivalMonths).toBeGreaterThan(3)
  })

  it('[修复验证 CR-03] 现金流在 90 天内不应转负，firstGapDate 应为 null', () => {
    expect(R2.nowcast.firstGapDate).toBeNull()
  })

  it('正确路径：唯一一笔低息、远期、数据完整的债应为 P3/低风险，无行动项', () => {
    expect(R2.actionPlan.length).toBe(0)
    const a = R2.riskAssessments[0]
    expect(a?.priority).toBe('P3')
    expect(a?.riskLevel).toBe('low')
  })
})

// ════════════════════════════════════════════════════════════════════════
// 场景 3：仅填 profile 字段、无明细列表
// ════════════════════════════════════════════════════════════════════════
describe('场景3 仅填 profile 无明细', () => {
  it('兜底路径：必要支出被硬编码到每月 01 号（用户真实扣款日未知，属 CR-02 残留限制）', () => {
    // 扫描账本中 essential expense 出现的日期
    const essDays = R3.nowcast.dailyLedger
      .filter(p => p.events.some(e => e.type === 'expense'))
      .map(p => dayOf(p.date))
    console.log('   场景3 必要支出出现的日期:', essDays)
    expect(essDays.every(d => d === '01')).toBe(true)
  })
})
