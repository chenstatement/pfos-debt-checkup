import { describe, expect, it } from 'vitest'
import { RUNWAY_BASELINES } from '../../data/runwayBaselines'
import { calculateRunway, formatMonthlySpend, formatRunwayDuration, formatRunwayParts, validateCashInput } from '../runwayCalculator'

describe('runway baseline coverage', () => {
  it('contains the confirmed 19 cities + 12 representative provinces + national average', () => {
    expect(RUNWAY_BASELINES).toHaveLength(32)
    expect(RUNWAY_BASELINES.filter(b => b.regionLevel === 'city')).toHaveLength(19)
    expect(RUNWAY_BASELINES.filter(b => b.regionLevel === 'province')).toHaveLength(12)
    expect(RUNWAY_BASELINES.filter(b => b.regionLevel === 'national')).toHaveLength(1)
    expect(new Set(RUNWAY_BASELINES.map(b => b.id)).size).toBe(32)
  })

  it('has 2025 data, minimum wage and source metadata for every record', () => {
    for (const baseline of RUNWAY_BASELINES) {
      expect(baseline.dataYear).toBe(2025)
      expect(baseline.annualYuan).toBeGreaterThan(0)
      expect(baseline.minimumWageMonthlyYuan).toBeGreaterThan(0)
      expect(baseline.sourceUrl).toMatch(/^https?:\/\//)
      expect(baseline.minimumWageSourceUrl).toMatch(/^https?:\/\//)
    }
  })
})

describe('runway calculation', () => {
  const national = RUNWAY_BASELINES.find(b => b.id === 'national_urban')!

  it('uses the five confirmed tiers', () => {
    const result = calculateRunway(100000, national)
    expect(Object.keys(result.tiers)).toEqual(['flat', 'frugal', 'normal', 'comfortable', 'luxury'])
    expect(result.tiers.flat.monthlyFen).toBe(Math.round(national.minimumWageMonthlyYuan * 100 * 0.5))
    expect(result.tiers.frugal.monthlyFen).toBe(national.minimumWageMonthlyYuan * 100)
    expect(result.tiers.normal.monthlyFen).toBe(Math.round(national.annualYuan * 100 / 12))
    expect(result.tiers.comfortable.monthlyFen).toBe(Math.round(national.annualYuan * 100 * 1.3 / 12))
    expect(result.tiers.luxury.monthlyFen).toBe(Math.round(national.annualYuan * 100 * 3 / 12))
  })

  it('compares daily runway to the median 100-day rest benchmark', () => {
    const result = calculateRunway(100000, national)
    expect(result.restComparison.days).toBe(result.tiers.normal.runwayDays)
    expect(result.restComparison.medianYears).toBe(result.restComparison.days / 100)
  })
})

describe('formatting and validation', () => {
  it('formats duration and exact fen amounts', () => {
    expect(formatRunwayDuration(0)).toBe('不足1个月')
    expect(formatRunwayDuration(12)).toBe('1年')
    expect(formatRunwayDuration(14)).toBe('1年2个月')
    expect(formatRunwayParts(14)).toEqual({ years: '1年', months: '2个月' })
    expect(formatRunwayParts(0)).toEqual({ years: '不足1年', months: '不足1个月' })
    expect(formatMonthlySpend(298908)).toBe('2,989.08 元/月')
  })

  it('validates cash input boundaries and separators', () => {
    expect(validateCashInput('1,000').valid).toBe(true)
    expect(validateCashInput('¥1000.50').valid).toBe(true)
    expect(validateCashInput('1,,000').valid).toBe(false)
    expect(validateCashInput('999').valid).toBe(false)
    expect(validateCashInput('100000001').valid).toBe(false)
  })
})
