/**
 * Complex multi-debt scenarios — stress test the cashflow and risk engines.
 * 模拟真实多债家庭：信用卡、消费贷、网贷、亲友借款、分期，含逾期/未逾期/资产变现。
 */
import { describe, it, expect } from 'vitest'
import { generateFullReport } from '../report'
import type { DebtAccount } from '../../domain/types'

const NOW = '2026-07-31T00:00:00.000Z'
const START = '2026-07-29'

function d(id: string, overrides: Partial<DebtAccount>): DebtAccount {
  return {
    id, userId: 'u1', currency: 'CNY',
    creditorName: '', debtType: 'credit_card',
    outstandingPrincipalFen: 0, currentAmountDueFen: 0,
    nextDueDate: START, repaymentMethod: 'unknown', status: 'normal',
    hasCollateral: false, hasGuarantor: false, hasCoBorrower: false,
    dataConfidence: 'confirmed', source: 'manual',
    createdAt: NOW, updatedAt: NOW,
    ...overrides,
  }
}

function run(debts: DebtAccount[], assets: any[] = []) {
  return generateFullReport({
    profile: { availableCashFen: 3_000_00, dataAsOf: START },
    incomes: [{ amountFen: 12_000_00, label: '工资', dayOfMonth: 15, recurring: true, certainty: 'confirmed' }],
    expenses: [
      { amountFen: 4_000_00, label: '房租', dayOfMonth: 1, recurring: true, essential: true },
      { amountFen: 2_000_00, label: '生活', dayOfMonth: 5, recurring: true, essential: true },
    ],
    debts,
    assets,
    startDate: START,
  })
}

describe('Complex multi-debt scenarios', () => {

  it('Case A: 混合场景——逾期信用卡+正常分期+亲友借款+资产变现', () => {
    const debts: DebtAccount[] = [
      // 1. 建行信用卡：1800，每月20日还款，已逾期，预计8月5日还清，剩余1期（含本期）
      d('d_ccb', {
        creditorName: '建设银行', debtType: 'credit_card',
        currentAmountDueFen: 1800_00, nextDueDate: '2026-07-20',
        dueDay: 20, status: 'overdue', overdueSince: '2026-07-20',
        expectedRepayDate: '2026-08-05', termKnown: true, termRemaining: 1,
      }),
      // 2. 金条分期：22500剩余本金，月供4500，每月10日，还剩5期，正常
      d('d_jd', {
        creditorName: '金条', debtType: 'online_microloan',
        outstandingPrincipalFen: 22500_00, currentAmountDueFen: 4500_00,
        monthlyPaymentFen: 4500_00, nextDueDate: '2026-08-10',
        dueDay: 10, termKnown: true, termRemaining: 5,
        annualRateBps: 1800, // 18%
      }),
      // 3. 招行消费贷：月供3000，每月15日，还剩8期，正常
      d('d_cmb', {
        creditorName: '招商银行', debtType: 'bank_consumer_loan',
        outstandingPrincipalFen: 20000_00, currentAmountDueFen: 3000_00,
        monthlyPaymentFen: 3000_00, nextDueDate: '2026-08-15',
        dueDay: 15, termKnown: true, termRemaining: 8,
        annualRateBps: 1200,
      }),
      // 4. 微粒贷：5000逾期，无预计还款日，让它累计到下个还款日(25日)
      d('d_wld', {
        creditorName: '微粒贷', debtType: 'online_microloan',
        currentAmountDueFen: 5000_00, nextDueDate: '2026-07-25',
        dueDay: 25, status: 'overdue', overdueSince: '2026-07-25',
        termKnown: true, termRemaining: 1,
      }),
      // 5. 亲友借款：20000，无利息，今年12月底还，正常
      d('d_friend', {
        creditorName: '表哥', debtType: 'personal_borrowing',
        outstandingPrincipalFen: 20000_00, currentAmountDueFen: 20000_00,
        nextDueDate: '2026-12-31', status: 'normal',
      }),
    ]

    const assets = [
      { label: '定期到期', amountFen: 8_000_00, realizableAmountFen: 8_000_00,
        availableDate: '2026-08-02', availabilityKnown: true, ownership: 'personal' },
    ]

    const r = run(debts, assets)

    // ── Verify cashflow events ──
    const ledger = r.nowcast.dailyLedger

    // 8月2日: 定期到期变现 8000
    const aug2 = ledger.find(d => d.date === '2026-08-02')
    const assetEv = aug2?.events.find(e => e.type === 'asset_realization')
    expect(assetEv).toBeDefined()
    expect(assetEv!.amountFen).toBe(8_000_00)

    // 8月5日: 建行逾期结清 1800
    const aug5 = ledger.find(d => d.date === '2026-08-05')
    const ccbEv = aug5?.events.find(e => e.label.includes('建设银行'))
    expect(ccbEv).toBeDefined()
    expect(ccbEv!.amountFen).toBe(1800_00)

    // 建行8月20日不应该再有还款（只有1期，catch-up已消耗）
    const aug20 = ledger.find(d => d.date === '2026-08-20')
    const ccbAug20 = aug20?.events.filter(e => e.label.includes('建设银行'))
    expect(ccbAug20?.length || 0).toBe(0)

    // 金条: 8月10日、9月10日、10月10日 (90天窗到10月27日，共3期可见)
    const jdDates = ['2026-08-10', '2026-09-10', '2026-10-10']
    jdDates.forEach(d => {
      const day = ledger.find(x => x.date === d)
      const jdEv = day?.events.find(e => e.label.includes('金条'))
      expect(jdEv, `金条应在${d}还款`).toBeDefined()
      expect(jdEv!.amountFen).toBe(4500_00)
    })
    // 2027-01-10不应该有金条（已满5期）
    const jan10 = ledger.find(d => d.date === '2027-01-10')
    const jdJan = jan10?.events.filter(e => e.label.includes('金条'))
    expect(jdJan?.length || 0).toBe(0)

    // 招行消费贷: 8期从8月15日起
    const cmbAug15 = ledger.find(d => d.date === '2026-08-15')
    const cmbEv = cmbAug15?.events.find(e => e.label.includes('招商银行'))
    expect(cmbEv).toBeDefined()
    expect(cmbEv!.amountFen).toBe(3000_00)

    // 微粒贷逾期累计到8月25日（下个还款日）
    const aug25 = ledger.find(d => d.date === '2026-08-25')
    const wldEv = aug25?.events.find(e => e.label.includes('微粒贷'))
    expect(wldEv).toBeDefined()
    expect(wldEv!.amountFen).toBe(5000_00)
    // 微粒贷只有1期，之后不应再出现
    const sep25 = ledger.find(d => d.date === '2026-09-25')
    const wldSep = sep25?.events.filter(e => e.label.includes('微粒贷'))
    expect(wldSep?.length || 0).toBe(0)

    // 表哥: 12月31日还款，但在90天窗外(10月27日止)，窗口内不可见
    const friendPayments = ledger.flatMap(d => d.events.filter(e => e.label.includes('表哥')))
    expect(friendPayments.length).toBe(0) // outside 90-day window

    // ── Verify risk assessments ──
    const ccbAssess = r.riskAssessments.find(a => a.debtId === 'd_ccb')
    expect(ccbAssess?.riskLevel).toBe('high') // R01: overdue without collateral
    expect(ccbAssess?.priority).toBe('P0')
    expect(ccbAssess?.reasonCodes).toContain('OVERDUE')

    const wldAssess = r.riskAssessments.find(a => a.debtId === 'd_wld')
    expect(wldAssess?.riskLevel).toBe('high') // R01: overdue without collateral
    expect(wldAssess?.reasonCodes).toContain('OVERDUE')

    const friendAssess = r.riskAssessments.find(a => a.debtId === 'd_friend')
    expect(friendAssess?.riskLevel).toBe('low')
  })

  it('Case B: 逾期分期——剩余12期含本期，有预计还款日', () => {
    const debts: DebtAccount[] = [
      d('d_installment', {
        creditorName: '车贷', debtType: 'installment',
        outstandingPrincipalFen: 60_000_00, currentAmountDueFen: 5000_00,
        monthlyPaymentFen: 5000_00, nextDueDate: '2026-07-15',
        dueDay: 15, status: 'overdue', overdueSince: '2026-07-15',
        expectedRepayDate: '2026-08-20', termKnown: true, termRemaining: 12,
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 8月20日: catch-up 5000 (逾期结清)
    const aug20 = ledger.find(d => d.date === '2026-08-20')
    const catchUp = aug20?.events.find(e => e.label.includes('车贷'))
    expect(catchUp).toBeDefined()
    expect(catchUp!.amountFen).toBe(5000_00)
    expect(catchUp!.label).toContain('逾期结清')

    // 之后: 9月15日、10月15日 (90天窗到10-27，可见2期)
    const remainingMonths = ['2026-09-15', '2026-10-15']
    remainingMonths.forEach(d => {
      const day = ledger.find(x => x.date === d)
      const ev = day?.events.find(e => e.label.includes('车贷'))
      expect(ev, `车贷应在${d}正常还款`).toBeDefined()
      expect(ev!.amountFen).toBe(5000_00)
      expect(ev!.label).not.toContain('逾期')
    })

    // 90天窗内：1 catch-up + 2 normal = 3次
    const allCarPayments = ledger.flatMap(d => d.events.filter(e => e.label.includes('车贷')))
    expect(allCarPayments.length).toBeGreaterThanOrEqual(3)
  })

  it('Case C: 逾期无预计日期——剩余2期（含本期）', () => {
    const debts: DebtAccount[] = [
      d('d_late', {
        creditorName: '花呗', debtType: 'online_microloan',
        currentAmountDueFen: 3000_00, monthlyPaymentFen: 3000_00,
        nextDueDate: '2026-07-10', dueDay: 10,
        status: 'overdue', overdueSince: '2026-07-10',
        termKnown: true, termRemaining: 2,
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 累计到8月10日
    const aug10 = ledger.find(d => d.date === '2026-08-10')
    const catchUp = aug10?.events.find(e => e.label.includes('花呗'))
    expect(catchUp).toBeDefined()
    expect(catchUp!.label).toContain('逾期累计')

    // 之后: 9月10日还有1期
    const sep10 = ledger.find(d => d.date === '2026-09-10')
    const normal = sep10?.events.find(e => e.label.includes('花呗'))
    expect(normal).toBeDefined()
    expect(normal!.label).not.toContain('逾期')

    // 总共2次
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('花呗')))
    expect(all.length).toBe(2)
  })

  it('Case D: 逾期2期含本期，8月5日还上期，8月30日还剩余1期（未填月供）', () => {
    const debts: DebtAccount[] = [
      d('d_jsyh', {
        creditorName: '江苏银行', debtType: 'credit_card',
        currentAmountDueFen: 2000_00, // 每期2000
        // No monthlyPaymentFen set — should fallback to currentAmountDueFen
        nextDueDate: '2026-07-30', dueDay: 30,
        status: 'overdue', overdueSince: '2026-07-30',
        expectedRepayDate: '2026-08-05',
        termKnown: true, termRemaining: 2, // 2期含本期
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 8月5日: catch-up 逾期结清 (第1期)
    const aug5 = ledger.find(d => d.date === '2026-08-05')
    const catchUp = aug5?.events.find(e => e.label.includes('江苏银行'))
    expect(catchUp).toBeDefined()
    expect(catchUp!.amountFen).toBe(2000_00)

    // 8月30日: 剩余1期正常还款 (不是9月30日！)
    const aug30 = ledger.find(d => d.date === '2026-08-30')
    const normal = aug30?.events.find(e => e.label.includes('江苏银行'))
    expect(normal, '第2期应在8月30日而非9月30日').toBeDefined()
    expect(normal!.amountFen).toBe(2000_00)
    expect(normal!.label).not.toContain('逾期')

    // 总计2次还款
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('江苏银行')))
    expect(all.length).toBe(2)
  })
})

describe('还款方式测试', () => {

  it('一次性还本付息(balloon)：到期日一笔还清本金，之前无任何月供', () => {
    const debts: DebtAccount[] = [
      d('d_balloon', {
        creditorName: '企业经营贷', debtType: 'bank_consumer_loan',
        outstandingPrincipalFen: 500_000_00,  // 50万
        currentAmountDueFen: 0,               // 平时无月供
        nextDueDate: '2026-10-15',            // 到期日
        repaymentMethod: 'balloon' as any,
        status: 'normal',
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 到期日10月15日应有一笔50万还款
    const oct15 = ledger.find(d => d.date === '2026-10-15')
    expect(oct15).toBeDefined()
    const ev = oct15!.events.find(e => e.label.includes('企业经营贷'))
    expect(ev).toBeDefined()
    expect(ev!.amountFen).toBe(500_000_00)
    expect(ev!.label).toContain('到期还本')

    // 之前9月15日不应有任何还款
    const sep15 = ledger.find(d => d.date === '2026-09-15')
    const sepEv = sep15?.events.filter(e => e.label.includes('企业经营贷'))
    expect(sepEv?.length || 0).toBe(0)

    // 之后11月15日也不应有
    const nov15 = ledger.find(d => d.date === '2026-11-15')
    const novEv = nov15?.events.filter(e => e.label.includes('企业经营贷'))
    expect(novEv?.length || 0).toBe(0)
  })

  it('先息后本(interest_first)：月息按期排程，末期末金', () => {
    const debts: DebtAccount[] = [
      d('d_interest', {
        creditorName: '抵押经营贷', debtType: 'secured_loan',
        outstandingPrincipalFen: 100_000_00,     // 10万本金
        currentAmountDueFen: 0,
        monthlyPaymentFen: 1000_00,               // 月息1000
        nextDueDate: '2026-08-15',
        dueDay: 15,
        termKnown: true, termRemaining: 3,        // 3期: 8/15, 9/15, 10/15
        repaymentMethod: 'interest_first' as any,
        status: 'normal',
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 8月15日: 月息1000 (第1期)
    const aug15 = ledger.find(d => d.date === '2026-08-15')
    const augInterest = aug15?.events.find(e => e.label.includes('抵押经营贷') && e.label.includes('月息'))
    expect(augInterest).toBeDefined()
    expect(augInterest!.amountFen).toBe(1000_00)
    const augPrincipal = aug15?.events.find(e => e.label.includes('抵押经营贷') && e.label.includes('还本'))
    expect(augPrincipal).toBeUndefined()

    // 10月15日: 月息1000 + 还本100000 (第3期=末，在90天窗内)
    const oct15 = ledger.find(d => d.date === '2026-10-15')
    expect(oct15).toBeDefined()
    const octEvents = oct15!.events.filter(e => e.label.includes('抵押经营贷'))
    expect(octEvents.length).toBe(2)

    // 总共应有3次月息+1次还本
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('抵押经营贷')))
    const interestCount = all.filter(e => e.label.includes('月息')).length
    const principalCount = all.filter(e => e.label.includes('还本')).length
    expect(interestCount).toBe(3)
    expect(principalCount).toBe(1)
  })

  it('分期等额(equal_installment)：月供按期排程，5期可见3期', () => {
    const debts: DebtAccount[] = [
      d('d_equal', {
        creditorName: '消费分期', debtType: 'installment',
        outstandingPrincipalFen: 30_000_00,
        currentAmountDueFen: 6000_00,
        monthlyPaymentFen: 6000_00,
        nextDueDate: '2026-08-10',
        dueDay: 10,
        termKnown: true, termRemaining: 5,
        repaymentMethod: 'equal_installment' as any,
        status: 'normal',
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('消费分期')))
    // 90天窗: 8/10, 9/10, 10/10 = 3次
    expect(all.length).toBe(3)
    all.forEach(ev => expect(ev.amountFen).toBe(6000_00))
  })

  it('最低还款(minimum_payment)：按月供排程', () => {
    const debts: DebtAccount[] = [
      d('d_min', {
        creditorName: '招行信用卡', debtType: 'credit_card',
        currentAmountDueFen: 2000_00,
        monthlyPaymentFen: 2000_00,
        nextDueDate: '2026-08-20',
        dueDay: 20,
        repaymentMethod: 'minimum_payment' as any,
        status: 'normal',
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('招行信用卡')))
    // 未设期数限制，90天内按月生成
    expect(all.length).toBeGreaterThanOrEqual(2)
  })

  it('一次性还本付息+利率：到期还本+利息', () => {
    const debts: DebtAccount[] = [
      d('d_balloon_int', {
        creditorName: '经营贷(含息)', debtType: 'bank_consumer_loan',
        outstandingPrincipalFen: 500_000_00,  // 50万本金
        currentAmountDueFen: 0,
        nextDueDate: '2026-10-15',            // 到期日
        annualRateBps: 1200,                   // 年化12%
        termKnown: true, termRemaining: 12,    // 12个月期限
        repaymentMethod: 'balloon' as any,
        status: 'normal',
      }),
    ]
    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger
    const oct15 = ledger.find(d => d.date === '2026-10-15')
    const ev = oct15!.events.find(e => e.label.includes('经营贷'))
    expect(ev).toBeDefined()
    // 本金50万 + 利息(50万×12%×1年=6万) = 56万
    expect(ev!.amountFen).toBe(560_000_00)
  })

  it('先息后本+利率自动算月息：每月1日付息，末期末金', () => {
    const debts: DebtAccount[] = [
      d('d_int_first', {
        creditorName: '抵押贷(先息)', debtType: 'secured_loan',
        outstandingPrincipalFen: 1_000_000_00,
        currentAmountDueFen: 0,
        monthlyPaymentFen: 0,                   // 未设月息→自动算
        nextDueDate: '2026-08-01',
        dueDay: 1,
        annualRateBps: 600,                     // 年化6%→月息0.5%=5000
        termKnown: true, termRemaining: 3,
        repaymentMethod: 'interest_first' as any,
        status: 'normal',
      }),
    ]
    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger

    // 月息自动计算: 100万×6%/12 = 5000
    const aug1 = ledger.find(d => d.date === '2026-08-01')
    const augInt = aug1?.events.find(e => e.label.includes('抵押贷') && e.label.includes('月息'))
    expect(augInt).toBeDefined()
    expect(augInt!.amountFen).toBe(5000_00)

    // 10月1日: 月息+还本 (第3期=末)
    const oct1 = ledger.find(d => d.date === '2026-10-01')
    const evts = oct1?.events.filter(e => e.label.includes('抵押贷')) || []
    expect(evts.length).toBe(2) // 月息+还本
    const principal = evts.find(e => e.label.includes('还本'))
    expect(principal).toBeDefined()
    expect(principal!.amountFen).toBe(1_000_000_00)
  })

  it('灵活还款(flexible)：未设月供则只排首期', () => {
    const debts: DebtAccount[] = [
      d('d_flex', {
        creditorName: '私人借款', debtType: 'personal_borrowing',
        currentAmountDueFen: 10_000_00,
        nextDueDate: '2026-08-15',
        repaymentMethod: 'flexible' as any,
        status: 'normal',
      }),
    ]

    const r = run(debts, [])
    const ledger = r.nowcast.dailyLedger
    const all = ledger.flatMap(d => d.events.filter(e => e.label.includes('私人借款')))
    // 未设月供，只有首期
    expect(all.length).toBe(1)
  })
})
