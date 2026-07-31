/**
 * Money utilities — All amounts stored as integer fen (分).
 *
 * WHY: Floating-point arithmetic (0.1 + 0.2 = 0.30000000000000004)
 *      is unacceptable for financial calculations.
 *      Integer fen eliminates this entirely.
 *
 * Phase 1 currency: CNY only. 100 fen = 1 CNY.
 */

import type { MoneyFen } from './types'

// ── Conversion ─────────────────────────────────────────────

/** Convert yuan (元) string or number to fen (分). Integer-only arithmetic, zero floating point. */
export function yuanToFen(yuan: number | string): MoneyFen {
  const s = typeof yuan === 'string' ? yuan.replace(/,/g, '') : String(yuan)
  const parts = s.split('.')
  const intPart = (parseInt(parts[0] || '0', 10) || 0) * 100
  const fracAll = (parts[1] || '').padEnd(3, '0')  // pad to at least 3 digits for rounding
  const fracPart = parseInt(fracAll.slice(0, 2), 10) || 0
  const roundUp = parseInt(fracAll[2], 10) >= 5 ? 1 : 0  // round 3rd decimal
  return intPart + fracPart + roundUp
}

/** Convert fen (分) to yuan (元) number. Uses integer division to avoid floating point. */
export function fenToYuan(fen: MoneyFen): number {
  const f = Math.round(fen)
  const intPart = Math.trunc(f / 100)
  const fracPart = Math.abs(f % 100)
  return intPart + fracPart / 100
}

/** Format fen as a human-readable CNY string: "1,234.56" */
export function formatFenAsYuan(fen: MoneyFen, showSymbol = false): string {
  const yuan = fenToYuan(fen)
  // If value is whole yuan, omit decimals; otherwise show 2 decimal places
  const isWhole = Math.round(fen) % 100 === 0
  const formatted = yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: isWhole ? 0 : 2,
    maximumFractionDigits: 2,
  })
  return showSymbol ? `¥${formatted}` : formatted
}

/** Format fen with privacy mask option: "¥****" or "¥1,234.56" */
export function formatFenPrivate(fen: MoneyFen, visible: boolean): string {
  if (!visible) return '¥****'
  return formatFenAsYuan(fen, true)
}

// ── Arithmetic (all operate on fen) ────────────────────────

export function addFen(a: MoneyFen, b: MoneyFen): MoneyFen {
  return Math.round(a + b)
}

export function subFen(a: MoneyFen, b: MoneyFen): MoneyFen {
  return Math.round(a - b)
}

export function mulFenByRatio(fen: MoneyFen, ratio: number): MoneyFen {
  return Math.round(fen * ratio)
}

export function maxFen(a: MoneyFen, b: MoneyFen): MoneyFen {
  return Math.max(a, b)
}

export function minFen(a: MoneyFen, b: MoneyFen): MoneyFen {
  return Math.min(a, b)
}

/** Sum an array of fen amounts */
export function sumFen(values: MoneyFen[]): MoneyFen {
  return values.reduce((s, v) => addFen(s, v), 0)
}

// ── Guards ─────────────────────────────────────────────────

export const MAX_SINGLE_AMOUNT_FEN = 100_000_000_00 // 1 billion CNY in fen

/** Check if a fen value is within reasonable range */
export function isValidFen(fen: unknown): fen is MoneyFen {
  return typeof fen === 'number'
    && Number.isInteger(fen)
    && fen >= 0
    && fen <= MAX_SINGLE_AMOUNT_FEN
}

/** Gap calculation: max(0, -value) */
export function gapFen(balanceFen: MoneyFen): MoneyFen {
  return balanceFen < 0 ? Math.abs(balanceFen) : 0
}
