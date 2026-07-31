import { describe, it, expect } from 'vitest'
import { generateNowcast } from '../nowcast'

// Test fixtures
const makeIncome = (overrides = {}) => ({
  label: '工资',
  amountFen: 500000, // 5000 CNY
  dayOfMonth: 15,
  recurring: true,
  certainty: 'confirmed' as const,
  ...overrides,
})

const makeExpense = (overrides = {}) => ({
  label: '房租',
  amountFen: 200000, // 2000 CNY
  dayOfMonth: 1,
  recurring: true,
  essential: true,
  ...overrides,
})

const makeDebt = (overrides = {}) => ({
  id: 'debt_1',
  creditorName: '招商银行',
  debtType: 'credit_card' as const,
  currentAmountDueFen: 300000, // 3000 CNY
  monthlyPaymentFen: 300000,
  dueDay: 20,
  nextDueDate: '',
  overdue: false,
  termKnown: false,
  ...overrides,
})

describe('generateNowcast', () => {
  // Test Scenario 1: Single credit card, sufficient cash, no risk
  it('Scenario 1: sufficient cash, no gaps', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [makeIncome({ dayOfMonth: 15 })],
      [makeExpense({ dayOfMonth: 1 })],
      [makeDebt({ nextDueDate: '2026-08-20', currentAmountDueFen: 200000 })],
      [],
      { startDate, snapshot: { availableCashFen: 1000000 } } // 10000 CNY
    )

    // Should have 90 days of ledger
    expect(result.dailyLedger).toHaveLength(90)
    // Should not have negative balance
    expect(result.firstGapDate).toBeNull()
    // Runway should be full 90 days
    expect(result.runwayDays).toBe(90)
  })

  // Test Scenario 2: Multiple debts, insufficient cash within 7 days
  it('Scenario 2: insufficient cash causes gap', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [makeIncome({ dayOfMonth: 15, amountFen: 500000 })],
      [makeExpense({ dayOfMonth: 1, amountFen: 200000 })],
      [
        makeDebt({ id: 'debt_1', creditorName: '招行', nextDueDate: '2026-08-03', currentAmountDueFen: 800000 }),
        makeDebt({ id: 'debt_2', creditorName: '花呗', nextDueDate: '2026-08-05', currentAmountDueFen: 500000 }),
      ],
      [],
      { startDate, snapshot: { availableCashFen: 500000 } } // Only 5000 CNY
    )

    // Should detect a gap
    expect(result.firstGapDate).not.toBeNull()
    // Gap should occur within 7 days
    expect(result.runwayDays).toBeLessThanOrEqual(7)
  })

  // Test Scenario 3: Already overdue debt with large payment + no income
  it('Scenario 3: overdue debt with no income creates immediate gap', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [],  // no income to save the day
      [makeExpense({ dayOfMonth: 1, amountFen: 200000 })],
      [makeDebt({
        nextDueDate: '2026-08-10',
        currentAmountDueFen: 500000,  // 5000 CNY due
        overdue: true,
        status: 'overdue',
      })],
      [],
      { startDate, snapshot: { availableCashFen: 300000 } }  // Only 3000 CNY
    )

    expect(result.dailyLedger).toHaveLength(90)
    // With 3000 starting cash, 2000 expense on day 1 leaves 1000
    // 5000 payment on day 9 (Aug 10) creates -4000 gap
    expect(result.firstGapDate).not.toBeNull()
  })

  // Test Scenario 4: Collision day detection
  it('Scenario 4: detects payment collision days', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [makeIncome({ dayOfMonth: 15, amountFen: 1000000 })],
      [makeExpense({ dayOfMonth: 1, amountFen: 200000 })],
      [
        makeDebt({ id: 'debt_1', creditorName: '招行', nextDueDate: '2026-08-20', currentAmountDueFen: 200000 }),
        makeDebt({ id: 'debt_2', creditorName: '花呗', nextDueDate: '2026-08-20', currentAmountDueFen: 300000 }),
      ],
      [],
      { startDate, snapshot: { availableCashFen: 1000000 } }
    )

    expect(result.collisionDays.length).toBeGreaterThan(0)
  })

  // Edge case: no debts
  it('handles empty debt list gracefully', () => {
    const result = generateNowcast(
      [makeIncome()],
      [makeExpense()],
      [],
      [],
      { snapshot: { availableCashFen: 500000 } }
    )

    expect(result.dailyLedger).toHaveLength(90)
    expect(result.firstGapDate).toBeNull()
  })

  // Edge case: end of month date clamping
  it('clamps dates to end of month correctly', () => {
    // Feb 2026 has 28 days
    const result = generateNowcast(
      [{ label: '收入', amountFen: 100000, dayOfMonth: 31, recurring: true, certainty: 'confirmed' }],
      [],
      [],
      [],
      { startDate: '2026-02-01', snapshot: { availableCashFen: 100000 } }
    )

    expect(result.dailyLedger).toHaveLength(90)
  })

  // Test: uncertain income excluded
  it('excludes uncertain income from forecast', () => {
    const startDate = '2026-08-01'
    const resultWithUncertain = generateNowcast(
      [makeIncome({ amountFen: 1000000, certainty: 'uncertain', dayOfMonth: 10 })],
      [],
      [],
      [],
      { startDate, snapshot: { availableCashFen: 100000 } }
    )

    const totalInflow = resultWithUncertain.totalInflowFen
    expect(totalInflow).toBe(0) // Uncertain income should be excluded
  })

  // Test: closed debt excluded
  it('excludes closed debts', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [],
      [],
      [makeDebt({ nextDueDate: '2026-08-15', currentAmountDueFen: 300000, status: 'closed' })],
      [],
      { startDate, snapshot: { availableCashFen: 1000000 } }
    )

    expect(result.totalOutflowFen).toBe(0)
  })

  // Test: asset realization enters cashflow on availableDate
  it('asset realization appears in daily ledger on correct date', () => {
    const startDate = '2026-08-01'
    const assets = [{
      label: '储蓄变现',
      amountFen: 10_000_000,  // 100,000 yuan
      realizableAmountFen: 10_000_000,
      availableDate: '2026-08-02',
      availabilityKnown: true,
      ownership: 'personal',
    }]
    const result = generateNowcast(
      [makeIncome({ dayOfMonth: 15 })],
      [makeExpense({ dayOfMonth: 1 })],
      [], // no debts
      assets,
      { startDate, snapshot: { availableCashFen: 500_000 } }
    )
    // Find Aug 2 in the ledger
    const aug2 = result.dailyLedger.find(d => d.date === '2026-08-02')
    expect(aug2).toBeDefined()
    // Should have the asset realization inflow
    expect(aug2!.inflowFen).toBe(10_000_000)
    // Should have asset event in the events array
    const assetEvent = aug2!.events.find(e => e.type === 'asset_realization')
    expect(assetEvent).toBeDefined()
    expect(assetEvent!.amountFen).toBe(10_000_000)
    expect(assetEvent!.label).toContain('储蓄变现')
  })

  // Asset date within forecast window is always included
  it('includes asset when availableDate is within forecast range', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [], [], [],
      [{ label: '定期到期', amountFen: 500000, realizableAmountFen: 500000, availableDate: '2026-08-03', availabilityKnown: true, ownership: 'personal' }],
      { startDate, snapshot: { availableCashFen: 500_000 } }
    )
    const aug3 = result.dailyLedger.find(d => d.date === '2026-08-03')
    expect(aug3).toBeDefined()
    expect(aug3!.inflowFen).toBe(500000)
    const ev = aug3!.events.find(e => e.type === 'asset_realization')
    expect(ev).toBeDefined()
    expect(ev!.amountFen).toBe(500000)
  })

  // Test: 30/60/90 gap calculations
  it('calculates gap windows correctly', () => {
    const startDate = '2026-08-01'
    const result = generateNowcast(
      [],
      [makeExpense({ amountFen: 500000, dayOfMonth: 5 })],
      [],
      [],
      { startDate, snapshot: { availableCashFen: 300000 } }
    )

    // Balance should go negative on day 5
    expect(result.firstGapDate).toContain('2026-08-05')
    expect(result.gap30dFen).toBeGreaterThan(0)
  })
})
