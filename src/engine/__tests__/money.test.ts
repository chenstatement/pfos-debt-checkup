import { describe, it, expect } from 'vitest'
import {
  yuanToFen, fenToYuan, formatFenAsYuan,
  addFen, subFen, sumFen, gapFen, isValidFen,
} from '../../domain/money'

describe('yuanToFen', () => {
  it('converts 1 yuan to 100 fen', () => {
    expect(yuanToFen(1)).toBe(100)
  })

  it('converts 0.01 yuan to 1 fen', () => {
    expect(yuanToFen(0.01)).toBe(1)
  })

  it('converts string "123.45" to 12345 fen', () => {
    expect(yuanToFen('123.45')).toBe(12345)
  })

  it('handles 0', () => {
    expect(yuanToFen(0)).toBe(0)
  })

  it('rounds correctly: 0.005 -> 1 (round up)', () => {
    expect(yuanToFen(0.005)).toBe(1)
  })

  it('rounds correctly: 0.004 -> 0 (round down)', () => {
    expect(yuanToFen(0.004)).toBe(0)
  })
})

describe('fenToYuan', () => {
  it('converts 100 fen to 1 yuan', () => {
    expect(fenToYuan(100)).toBe(1)
  })

  it('converts 12345 fen to 123.45 yuan', () => {
    expect(fenToYuan(12345)).toBe(123.45)
  })

  it('handles 0 fen', () => {
    expect(fenToYuan(0)).toBe(0)
  })
})

describe('formatFenAsYuan', () => {
  it('formats with thousand separators', () => {
    expect(formatFenAsYuan(1234567)).toBe('12,345.67')
  })

  it('shows currency symbol when requested', () => {
    expect(formatFenAsYuan(10000, true)).toBe('¥100')
  })
})

describe('addFen', () => {
  it('adds two fen values', () => {
    expect(addFen(100, 200)).toBe(300)
  })

  it('no floating point errors for 0.1 + 0.2 equivalent', () => {
    // In floating point: 0.1 + 0.2 = 0.30000000000000004
    // In fen: 10 + 20 = 30
    expect(addFen(10, 20)).toBe(30)
  })
})

describe('subFen', () => {
  it('subtracts fen values', () => {
    expect(subFen(300, 100)).toBe(200)
  })
})

describe('sumFen', () => {
  it('sums array of fen', () => {
    expect(sumFen([100, 200, 300])).toBe(600)
  })

  it('returns 0 for empty array', () => {
    expect(sumFen([])).toBe(0)
  })
})

describe('gapFen', () => {
  it('returns 0 when balance is positive', () => {
    expect(gapFen(1000)).toBe(0)
  })

  it('returns absolute value when balance is negative', () => {
    expect(gapFen(-500)).toBe(500)
  })
})

describe('isValidFen', () => {
  it('accepts valid fen', () => {
    expect(isValidFen(100)).toBe(true)
  })

  it('rejects non-integer', () => {
    expect(isValidFen(100.5)).toBe(false)
  })

  it('rejects negative values', () => {
    expect(isValidFen(-100)).toBe(false)
  })
})
