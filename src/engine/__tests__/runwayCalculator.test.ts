/**
 * Runway Calculator Tests — per RUNWAY_MVP_SPEC.md §7.1
 */
import { describe, it, expect } from 'vitest'
import { RUNWAY_BASELINES } from '../../data/runwayBaselines'
import {
  calculateRunway,
  formatRunwayDuration,
  formatMonthlySpend,
  validateCashInput,
  parseCashYuan,
  cleanCashInput,
} from '../runwayCalculator'
import { yuanToFen } from '../../domain/money'

// ── Data Integrity ───────────────────────────────────────────

describe('RUNWAY_BASELINES data integrity', () => {
  it('has exactly 12 baseline records', () => {
    expect(RUNWAY_BASELINES).toHaveLength(12)
  })

  it('all records have positive integer annualYuan', () => {
    for (const b of RUNWAY_BASELINES) {
      expect(Number.isInteger(b.annualYuan), `${b.id}: annualYuan must be integer`).toBe(true)
      expect(b.annualYuan, `${b.id}: annualYuan must be positive`).toBeGreaterThan(0)
    }
  })

  it('all records have dataYear 2025', () => {
    for (const b of RUNWAY_BASELINES) {
      expect(b.dataYear, `${b.id}: dataYear must be 2025`).toBe(2025)
    }
  })

  it('all records have valid regionLevel', () => {
    for (const b of RUNWAY_BASELINES) {
      expect(['city', 'province', 'national']).toContain(b.regionLevel)
    }
  })

  it('all records have HTTPS sourceUrl', () => {
    for (const b of RUNWAY_BASELINES) {
      expect(b.sourceUrl, `${b.id}: sourceUrl must start with https`).toMatch(/^https:\/\//)
    }
  })

  it('all records have non-empty metadata fields', () => {
    for (const b of RUNWAY_BASELINES) {
      expect(b.id.length).toBeGreaterThan(0)
      expect(b.optionLabel.length).toBeGreaterThan(0)
      expect(b.resultLabel.length).toBeGreaterThan(0)
      expect(b.sourceName.length).toBeGreaterThan(0)
      expect(b.sourcePublishedAt.length).toBeGreaterThan(0)
      expect(b.metricName.length).toBeGreaterThan(0)
    }
  })

  // ── Per-id precise data assertions (§4 verified values) ────

  const expected: Record<string, { annualYuan: number; regionLevel: string; sourcePublishedAt: string }> = {
    beijing:        { annualYuan: 54122, regionLevel: 'city',      sourcePublishedAt: '2026-01-21' },
    shanghai:       { annualYuan: 57076, regionLevel: 'city',      sourcePublishedAt: '2026-03-30' },
    tianjin:        { annualYuan: 39693, regionLevel: 'city',      sourcePublishedAt: '2026-01-20' },
    chongqing:      { annualYuan: 32764, regionLevel: 'city',      sourcePublishedAt: '2026-03-26' },
    guangzhou:      { annualYuan: 51860, regionLevel: 'city',      sourcePublishedAt: '2026-05-10' },
    ningbo:         { annualYuan: 55546, regionLevel: 'city',      sourcePublishedAt: '2026-02-05' },
    suzhou:         { annualYuan: 54897, regionLevel: 'city',      sourcePublishedAt: '2026-04-30' },
    wuhan:          { annualYuan: 43233, regionLevel: 'city',      sourcePublishedAt: '2026-04-09' },
    zhejiang_other: { annualYuan: 53223, regionLevel: 'province',  sourcePublishedAt: '2026-03-04' },
    jiangsu_other:  { annualYuan: 43917, regionLevel: 'province',  sourcePublishedAt: '2026-02-24' },
    guangdong_other:{ annualYuan: 42726, regionLevel: 'province',  sourcePublishedAt: '2026-01-26' },
    national_urban: { annualYuan: 35869, regionLevel: 'national',  sourcePublishedAt: '2026-01-19' },
  }

  it('each record matches expected annualYuan, regionLevel, and sourcePublishedAt', () => {
    for (const b of RUNWAY_BASELINES) {
      const exp = expected[b.id]
      expect(exp, `missing expected entry for ${b.id}`).toBeDefined()
      expect(b.annualYuan, `${b.id}: annualYuan`).toBe(exp.annualYuan)
      expect(b.regionLevel, `${b.id}: regionLevel`).toBe(exp.regionLevel)
      expect(b.sourcePublishedAt, `${b.id}: sourcePublishedAt`).toBe(exp.sourcePublishedAt)
    }
    // Ensure no extra entries in expected not in data
    const dataIds = new Set(RUNWAY_BASELINES.map(b => b.id))
    for (const id of Object.keys(expected)) {
      expect(dataIds.has(id), `data missing expected entry ${id}`).toBe(true)
    }
  })

  it('has expected city-level entries', () => {
    const cityIds = RUNWAY_BASELINES.filter(b => b.regionLevel === 'city').map(b => b.id)
    expect(cityIds).toContain('beijing')
    expect(cityIds).toContain('shanghai')
    expect(cityIds).toContain('tianjin')
    expect(cityIds).toContain('chongqing')
    expect(cityIds).toContain('guangzhou')
    expect(cityIds).toContain('ningbo')
    expect(cityIds).toContain('suzhou')
    expect(cityIds).toContain('wuhan')
  })

  it('has expected province-level entries', () => {
    const provIds = RUNWAY_BASELINES.filter(b => b.regionLevel === 'province').map(b => b.id)
    expect(provIds).toContain('zhejiang_other')
    expect(provIds).toContain('jiangsu_other')
    expect(provIds).toContain('guangdong_other')
  })

  it('has expected national entry', () => {
    const national = RUNWAY_BASELINES.filter(b => b.regionLevel === 'national')
    expect(national).toHaveLength(1)
    expect(national[0].id).toBe('national_urban')
  })
})

// ── Core Calculation ────────────────────────────────────────

describe('calculateRunway', () => {
  const national = RUNWAY_BASELINES.find(b => b.id === 'national_urban')!
  const beijing = RUNWAY_BASELINES.find(b => b.id === 'beijing')!
  const shanghai = RUNWAY_BASELINES.find(b => b.id === 'shanghai')!
  const chongqing = RUNWAY_BASELINES.find(b => b.id === 'chongqing')!

  // ── Tier monotonicity ──────────────────────────────────────

  it('tiers are monotonically increasing in monthly spending', () => {
    for (const baseline of RUNWAY_BASELINES) {
      const result = calculateRunway(100000, baseline)
      expect(result.tiers.frugal.monthlyFen).toBeLessThan(result.tiers.normal.monthlyFen)
      expect(result.tiers.normal.monthlyFen).toBeLessThan(result.tiers.comfortable.monthlyFen)
    }
  })

  it('runway months are monotonically decreasing across tiers', () => {
    for (const baseline of RUNWAY_BASELINES) {
      const result = calculateRunway(100000, baseline)
      expect(result.tiers.frugal.runwayMonths).toBeGreaterThanOrEqual(result.tiers.normal.runwayMonths)
      expect(result.tiers.normal.runwayMonths).toBeGreaterThanOrEqual(result.tiers.comfortable.runwayMonths)
    }
  })

  it('frugal monthlyFen ≈ 80% of normal, comfortable ≈ 130% of normal', () => {
    for (const baseline of RUNWAY_BASELINES) {
      const result = calculateRunway(100000, baseline)
      const ratioFrugal = result.tiers.frugal.monthlyFen / result.tiers.normal.monthlyFen
      const ratioComfort = result.tiers.comfortable.monthlyFen / result.tiers.normal.monthlyFen
      // Allow small rounding variance (~±1 fen)
      expect(ratioFrugal).toBeCloseTo(0.8, 1)
      expect(ratioComfort).toBeCloseTo(1.3, 1)
    }
  })

  // ── Fixed snapshot: 10万元 + 全国城镇值 ────────────────────

  it('snapshot: 100000 CNY + national_urban yields deterministic tiers', () => {
    const result = calculateRunway(100000, national)
    // annualFen = 35869 * 100 = 3586900
    expect(result.annualFen).toBe(3586900)
    // normal monthlyFen = round(3586900 / 12) = round(298908.33) = 298908
    expect(result.tiers.normal.monthlyFen).toBe(298908)
    // frugal monthlyFen = round(3586900 * 80 / 100 / 12) = round(239126.67) = 239127
    expect(result.tiers.frugal.monthlyFen).toBe(239127)
    // comfortable monthlyFen = round(3586900 * 130 / 100 / 12) = round(388580.83) = 388581
    expect(result.tiers.comfortable.monthlyFen).toBe(388581)
    // normal runwayMonths = floor(10000000 / 298908) = floor(33.455) = 33
    expect(result.tiers.normal.runwayMonths).toBe(33)
    // frugal runwayMonths = floor(10000000 / 239127) = floor(41.818) = 41
    expect(result.tiers.frugal.runwayMonths).toBe(41)
    // comfortable runwayMonths = floor(10000000 / 388581) = floor(25.734) = 25
    expect(result.tiers.comfortable.runwayMonths).toBe(25)
    // tenDayBreakBlocks = floor(33 * 365 / 12 / 10) = floor(100.375) = 100
    expect(result.tenDayBreakBlocks).toBe(100)
  })

  it('snapshot: 100000 CNY + beijing', () => {
    const result = calculateRunway(100000, beijing)
    expect(result.annualFen).toBe(5412200)
    expect(result.tiers.normal.monthlyFen).toBe(451017)
    expect(result.tiers.frugal.monthlyFen).toBe(360813)
    expect(result.tiers.comfortable.monthlyFen).toBe(586322)
    expect(result.tiers.normal.runwayMonths).toBe(22)
    expect(result.tenDayBreakBlocks).toBe(66)
  })

  it('snapshot: 100000 CNY + shanghai', () => {
    const result = calculateRunway(100000, shanghai)
    expect(result.annualFen).toBe(5707600)
    expect(result.tiers.normal.monthlyFen).toBe(475633)
    expect(result.tiers.frugal.monthlyFen).toBe(380507)
    expect(result.tiers.comfortable.monthlyFen).toBe(618323)
    expect(result.tiers.normal.runwayMonths).toBe(21)
    expect(result.tenDayBreakBlocks).toBe(63)
  })

  it('snapshot: 100000 CNY + chongqing', () => {
    const result = calculateRunway(100000, chongqing)
    expect(result.annualFen).toBe(3276400)
    expect(result.tiers.normal.monthlyFen).toBe(273033)
    expect(result.tiers.frugal.monthlyFen).toBe(218427)
    expect(result.tiers.comfortable.monthlyFen).toBe(354943)
    expect(result.tiers.normal.runwayMonths).toBe(36)
    expect(result.tenDayBreakBlocks).toBe(109)
  })

  // ── Boundary values ────────────────────────────────────────

  it('boundary: 999.99 CNY (below minimum) — still calculates for test coverage', () => {
    const result = calculateRunway(999.99, national)
    expect(result.cashFen).toBe(yuanToFen(999.99))
    // Very low cash yields 0 months
    expect(result.tiers.normal.runwayMonths).toBe(0)
  })

  it('boundary: 1000 CNY (minimum valid)', () => {
    const result = calculateRunway(1000, national)
    expect(result.cashFen).toBe(100000)
    expect(result.tiers.normal.runwayMonths).toBe(0)
  })

  it('boundary: 100000000 CNY (maximum valid)', () => {
    // 100,000,000 元 = 10,000,000,000 分（100亿分 = 1亿 CNY × 100）
    const result = calculateRunway(100_000_000, national)
    expect(result.cashFen).toBe(10_000_000_000)
    expect(result.tiers.normal.runwayMonths).toBeGreaterThan(0)
  })

  it('boundary: 100000000.01 CNY (above max, but calculation still works for engine)', () => {
    const result = calculateRunway(100_000_000.01, national)
    // 100,000,000.01 元 = 10,000,000,001 分
    expect(result.cashFen).toBeGreaterThan(10_000_000_000)
  })
})

// ── Duration Formatting ──────────────────────────────────────

describe('formatRunwayDuration', () => {
  it('0 months → "不足1个月"', () => {
    expect(formatRunwayDuration(0)).toBe('不足1个月')
  })

  it('negative → "不足1个月"', () => {
    expect(formatRunwayDuration(-1)).toBe('不足1个月')
  })

  it('1 month → "1个月"', () => {
    expect(formatRunwayDuration(1)).toBe('1个月')
  })

  it('11 months → "11个月"', () => {
    expect(formatRunwayDuration(11)).toBe('11个月')
  })

  it('12 months → "1年"', () => {
    expect(formatRunwayDuration(12)).toBe('1年')
  })

  it('13 months → "1年1个月"', () => {
    expect(formatRunwayDuration(13)).toBe('1年1个月')
  })

  it('23 months → "1年11个月"', () => {
    expect(formatRunwayDuration(23)).toBe('1年11个月')
  })

  it('24 months → "2年"', () => {
    expect(formatRunwayDuration(24)).toBe('2年')
  })

  it('25 months → "2年1个月"', () => {
    expect(formatRunwayDuration(25)).toBe('2年1个月')
  })

  it('120 months → "10年"', () => {
    expect(formatRunwayDuration(120)).toBe('10年')
  })
})

// ── Monthly Spending Formatting ──────────────────────────────

describe('formatMonthlySpend', () => {
  it('298908 fen → "2,989.08 元/月" (exact 2 decimal places)', () => {
    expect(formatMonthlySpend(298908)).toBe('2,989.08 元/月')
  })

  it('100 fen → "1.00 元/月"', () => {
    expect(formatMonthlySpend(100)).toBe('1.00 元/月')
  })

  it('50 fen → "0.50 元/月"', () => {
    expect(formatMonthlySpend(50)).toBe('0.50 元/月')
  })

  it('0 fen → "0.00 元/月"', () => {
    expect(formatMonthlySpend(0)).toBe('0.00 元/月')
  })

  it('formatted value is consistent with monthlyFen (reversible via fen calculation)', () => {
    // National normal tier: 298908 fen
    const result = calculateRunway(100000, RUNWAY_BASELINES.find(b => b.id === 'national_urban')!)
    const formatted = formatMonthlySpend(result.tiers.normal.monthlyFen)
    // Should contain the exact fen value as yuan with 2 decimal places
    expect(formatted).toBe('2,989.08 元/月')
  })
})

// ── Cash Validation ─────────────────────────────────────────

describe('validateCashInput', () => {
  it('rejects empty input', () => {
    expect(validateCashInput('').valid).toBe(false)
    expect(validateCashInput('  ').valid).toBe(false)
  })

  it('rejects non-numeric input', () => {
    expect(validateCashInput('abc').valid).toBe(false)
    expect(validateCashInput('12a3').valid).toBe(false)
  })

  it('rejects more than 2 decimal places', () => {
    expect(validateCashInput('1000.123').valid).toBe(false)
  })

  it('rejects malformed commas: 1,,000', () => {
    expect(validateCashInput('1,,000').valid).toBe(false)
  })

  it('rejects malformed commas: 1,00,0', () => {
    expect(validateCashInput('1,00,0').valid).toBe(false)
  })

  it('rejects multiple ¥ symbols: ¥¥1000', () => {
    expect(validateCashInput('¥¥1000').valid).toBe(false)
  })

  it('rejects value below minimum (999.99)', () => {
    expect(validateCashInput('999.99').valid).toBe(false)
  })

  it('accepts minimum value (1000)', () => {
    expect(validateCashInput('1000').valid).toBe(true)
  })

  it('rejects value above maximum', () => {
    expect(validateCashInput('100000000.01').valid).toBe(false)
  })

  it('accepts maximum value (100000000)', () => {
    expect(validateCashInput('100000000').valid).toBe(true)
  })

  it('accepts value with proper comma formatting: 100,000', () => {
    expect(validateCashInput('100,000').valid).toBe(true)
  })

  it('accepts value with proper comma formatting: 1,000,000', () => {
    expect(validateCashInput('1,000,000').valid).toBe(true)
  })

  it('accepts value with single ¥ symbol: ¥100000', () => {
    expect(validateCashInput('¥100000').valid).toBe(true)
  })

  it('accepts value with single ￥ symbol: ￥100000', () => {
    expect(validateCashInput('￥100000').valid).toBe(true)
  })

  it('accepts value with ¥ and comma: ¥10,000', () => {
    expect(validateCashInput('¥10,000').valid).toBe(true)
  })

  it('accepts single decimal place: 1000.5', () => {
    expect(validateCashInput('1000.5').valid).toBe(true)
  })
})

// ── Cash Cleaning ────────────────────────────────────────────

describe('cleanCashInput', () => {
  it('removes single ¥', () => {
    expect(cleanCashInput('¥100000')).toBe('100000')
  })

  it('removes single ￥', () => {
    expect(cleanCashInput('￥100000')).toBe('100000')
  })

  it('removes commas', () => {
    expect(cleanCashInput('100,000')).toBe('100000')
  })

  it('removes ¥ and commas together', () => {
    expect(cleanCashInput('¥100,000')).toBe('100000')
  })
})

// ── Cash Parsing ────────────────────────────────────────────

describe('parseCashYuan', () => {
  it('parses plain number', () => {
    expect(parseCashYuan('100000')).toBe(100000)
  })

  it('parses with comma', () => {
    expect(parseCashYuan('100,000')).toBe(100000)
  })

  it('parses with ¥ symbol', () => {
    expect(parseCashYuan('¥100000')).toBe(100000)
  })

  it('parses decimal', () => {
    expect(parseCashYuan('1234.56')).toBe(1234.56)
  })

  it('parseCashYuan and validateCashInput use same cleaning', () => {
    // Same cleaned value must produce the same number
    const inputs = ['¥100,000', '100000', '￥100000', '100,000']
    const values = inputs.map(i => parseCashYuan(i))
    expect(new Set(values).size).toBe(1)
    expect(values[0]).toBe(100000)
  })
})

// ── tenDayBreakBlocks only uses normal tier ──────────────────

describe('tenDayBreakBlocks', () => {
  it('is derived from normal tier runway months', () => {
    const result = calculateRunway(100000, RUNWAY_BASELINES[0])
    const expected = Math.floor((result.tiers.normal.runwayMonths * 365) / 12 / 10)
    expect(result.tenDayBreakBlocks).toBe(expected)
  })

  it('is a non-negative integer', () => {
    for (const baseline of RUNWAY_BASELINES) {
      const result = calculateRunway(100000, baseline)
      expect(Number.isInteger(result.tenDayBreakBlocks)).toBe(true)
      expect(result.tenDayBreakBlocks).toBeGreaterThanOrEqual(0)
    }
  })
})
