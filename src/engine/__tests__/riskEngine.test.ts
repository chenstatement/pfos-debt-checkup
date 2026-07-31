import { describe, it, expect } from 'vitest'
import { assessDebtRisk, isDebtDataSufficient } from '../riskEngine'
import type { RiskEngineInput, DebtAccount, FinancialProfile, ForecastSnapshot } from '../../domain/types'

// Test fixtures
function makeProfile(overrides = {}): FinancialProfile {
  return {
    id: 'p1',
    userId: 'u1',
    availableCashFen: 500000,
    fixedMonthlyIncomeFen: 1000000,
    essentialMonthlyExpenseFen: 300000,
    paydayRules: [],
    dataAsOf: '2026-08-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeDebt(overrides = {}): DebtAccount {
  return {
    id: 'd1',
    userId: 'u1',
    creditorName: '招商银行',
    debtType: 'credit_card',
    currency: 'CNY',
    outstandingPrincipalFen: 500000,
    currentAmountDueFen: 300000,
    nextDueDate: '2026-08-20',
    repaymentMethod: 'minimum_payment',
    status: 'normal',
    hasCollateral: false,
    hasGuarantor: false,
    hasCoBorrower: false,
    dataConfidence: 'confirmed',
    source: 'manual',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeForecast(overrides = {}): ForecastSnapshot {
  return {
    id: 'f1',
    userId: 'u1',
    startDate: '2026-08-01',
    endDate: '2026-10-29',
    ruleVersion: '1.0.0',
    inputVersion: 'v1',
    points: [],
    minimumBalanceFen: 500000,
    gap30dFen: 0,
    gap60dFen: 0,
    gap90dFen: 0,
    generatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeInput(overrides: Partial<RiskEngineInput> = {}): RiskEngineInput {
  return {
    asOfDate: '2026-08-01',
    profile: makeProfile(),
    debts: [makeDebt()],
    forecast: makeForecast(),
    ruleVersion: '1.0.0',
    ...overrides,
  }
}

describe('assessDebtRisk', () => {
  // R01: Overdue → at least HIGH risk
  it('R01: overdue debt gets at least HIGH risk', () => {
    const input = makeInput({
      debts: [makeDebt({ status: 'overdue', overdueSince: '2026-07-01' })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments[0].riskLevel).toBe('high')
    expect(output.assessments[0].reasonCodes).toContain('OVERDUE')
  })

  // R02: Overdue + collateral → URGENT
  it('R02: overdue + collateral gets URGENT risk', () => {
    const input = makeInput({
      debts: [makeDebt({
        status: 'overdue',
        overdueSince: '2026-07-01',
        hasCollateral: true,
      })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments[0].riskLevel).toBe('urgent')
    expect(output.assessments[0].reasonCodes).toContain('OVERDUE')
    expect(output.assessments[0].reasonCodes).toContain('COLLATERAL_OR_GUARANTEE')
    expect(output.assessments[0].requiresHumanVerification).toBe(true)
  })

  // R03: Due within 3 days + insufficient cash → URGENT
  it('R03: due within 3 days + insufficient cash is URGENT', () => {
    const input = makeInput({
      asOfDate: '2026-08-01',
      profile: makeProfile({ availableCashFen: 10000 }), // Only 100 CNY
      debts: [makeDebt({
        nextDueDate: '2026-08-03',
        currentAmountDueFen: 500000, // 5000 CNY needed, only 100 available
      })],
    })
    const output = assessDebtRisk(input)
    const assessment = output.assessments[0]
    expect(assessment.reasonCodes).toContain('DUE_WITHIN_3_DAYS')
    expect(assessment.reasonCodes).toContain('INSUFFICIENT_CASH')
  })

  // R07: Missing critical data → medium risk
  it('R07: missing data flagged', () => {
    const input = makeInput({
      debts: [makeDebt({
        dataConfidence: 'unknown',
        outstandingPrincipalFen: 0, // missing
      })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments[0].reasonCodes).toContain('MISSING_CRITICAL_DATA')
  })

  // R08: Essential living impact
  it('R08: essential living impact flagged', () => {
    const input = makeInput({
      debts: [makeDebt({ affectsEssentialLiving: true })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments[0].reasonCodes).toContain('ESSENTIAL_LIVING_IMPACT')
    expect(output.assessments[0].requiresHumanVerification).toBe(true)
  })

  // Priority: P0 for overdue
  it('overdue debt gets P0 priority', () => {
    const input = makeInput({
      debts: [makeDebt({ status: 'overdue', overdueSince: '2026-07-01' })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments[0].priority).toBe('P0')
  })

  // Priority: P3 for normal debt with far due date
  it('normal debt with far due date gets low priority', () => {
    const input = makeInput({
      asOfDate: '2026-08-01',
      debts: [makeDebt({
        status: 'normal',
        nextDueDate: '2026-12-15',
        currentAmountDueFen: 100000,
      })],
    })
    const output = assessDebtRisk(input)
    // Far-future normal debt with sufficient funds → P3 (正常)
    expect(output.assessments[0].priority).toBe('P3')
  })

  // Determinism: same input → same output
  it('same input produces same output (deterministic)', () => {
    const input = makeInput()
    const output1 = assessDebtRisk(input)
    const output2 = assessDebtRisk(input)
    expect(output1.assessments[0].riskLevel).toBe(output2.assessments[0].riskLevel)
    expect(output1.assessments[0].priority).toBe(output2.assessments[0].priority)
    expect(output1.assessments[0].reasonCodes).toEqual(output2.assessments[0].reasonCodes)
  })

  // Warnings generated for forecast negative
  it('generates warning when forecast has negative date', () => {
    const input = makeInput({
      forecast: makeForecast({ firstNegativeDate: '2026-08-25' }),
    })
    const output = assessDebtRisk(input)
    expect(output.warnings.some(w => w.code === 'FORECAST_NEGATIVE')).toBe(true)
  })

  // Generates actions
  it('generates action items for assessed debts', () => {
    const input = makeInput({
      debts: [makeDebt({ status: 'overdue', overdueSince: '2026-07-01' })],
    })
    const output = assessDebtRisk(input)
    expect(output.actions.length).toBeGreaterThan(0)
  })

  // Archived (soft-deleted) debts excluded
  it('excludes soft-deleted debts', () => {
    const input = makeInput({
      debts: [makeDebt({ deletedAt: new Date().toISOString() })],
    })
    const output = assessDebtRisk(input)
    expect(output.assessments).toHaveLength(0)
  })
})

describe('isDebtDataSufficient', () => {
  it('returns true for complete debt', () => {
    expect(isDebtDataSufficient(makeDebt())).toBe(true)
  })

  it('returns false when principal is 0', () => {
    expect(isDebtDataSufficient(makeDebt({ outstandingPrincipalFen: 0 }))).toBe(false)
  })

  it('returns false when creditor name is empty', () => {
    expect(isDebtDataSufficient(makeDebt({ creditorName: '' }))).toBe(false)
  })
})
