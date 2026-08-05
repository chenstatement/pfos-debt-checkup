/**
 * Runway Calculator — 不上班续航核心计算引擎
 *
 * 所有金额先转换为整数分（fen），禁止浮点金额直接参与核心计算状态。
 * 纯函数，无浏览器 API 依赖，可独立单测。
 *
 * @see docs/RUNWAY_MVP_SPEC.md §5
 */

import { yuanToFen } from '../domain/money'
import type { RunwayBaseline } from '../data/runwayBaselines'

// ── Spending Tiers ──────────────────────────────────────────

export type SpendingTier = 'frugal' | 'normal' | 'comfortable'

export interface TierResult {
  tier: SpendingTier
  label: string
  /** 系数说明 */
  coefficient: string
  /** 月生活消费额（分） */
  monthlyFen: number
  /** 续航月数（向下取整） */
  runwayMonths: number
}

export interface RunwayResult {
  /** 输入现金（分） */
  cashFen: number
  /** 使用的基线数据 */
  baseline: RunwayBaseline
  /** 年消费额（分） */
  annualFen: number
  /** 三档计算结果 */
  tiers: Record<SpendingTier, TierResult>
  /** 趣味换算：10天假期组数（仅基于日常过），floor(日常过 runwayMonths × 365 ÷ 12 ÷ 10) */
  tenDayBreakBlocks: number
}

// ── Core Calculation ────────────────────────────────────────

/**
 * 根据年消费额（元）和可用现金（元）计算完整续航结果。
 *
 * @param cashYuan - 可自由支配现金（元），可以是小数
 * @param baseline - 地区基线数据
 * @returns RunwayResult
 */
export function calculateRunway(cashYuan: number, baseline: RunwayBaseline): RunwayResult {
  const cashFen = yuanToFen(cashYuan)
  const annualFen = baseline.annualYuan * 100

  const normalMonthlyFen = Math.round(annualFen / 12)
  const frugalMonthlyFen = Math.round((annualFen * 80) / 100 / 12)
  const comfortableMonthlyFen = Math.round((annualFen * 130) / 100 / 12)

  const tiers: Record<SpendingTier, TierResult> = {
    frugal: {
      tier: 'frugal',
      label: '省着过',
      coefficient: '官方月均的 80%',
      monthlyFen: frugalMonthlyFen,
      runwayMonths: calcRunwayMonths(cashFen, frugalMonthlyFen),
    },
    normal: {
      tier: 'normal',
      label: '日常过',
      coefficient: '官方月均的 100%',
      monthlyFen: normalMonthlyFen,
      runwayMonths: calcRunwayMonths(cashFen, normalMonthlyFen),
    },
    comfortable: {
      tier: 'comfortable',
      label: '从容过',
      coefficient: '官方月均的 130%',
      monthlyFen: comfortableMonthlyFen,
      runwayMonths: calcRunwayMonths(cashFen, comfortableMonthlyFen),
    },
  }

  // 趣味换算：日常档 ÷ 10天/组 → 多少组"10天假期"
  const tenDayBreakBlocks = Math.floor((tiers.normal.runwayMonths * 365) / 12 / 10)

  return { cashFen, baseline, annualFen, tiers, tenDayBreakBlocks }
}

/** 计算续航月数：floor(cashFen / monthlyFen)。monthlyFen 为 0 时返回 0 */
function calcRunwayMonths(cashFen: number, monthlyFen: number): number {
  if (monthlyFen <= 0) return 0
  return Math.floor(cashFen / monthlyFen)
}

// ── Formatting ──────────────────────────────────────────────

/**
 * 将续航月数格式化为人类可读字符串。
 * - 0 → "不足1个月"
 * - 1..11 → "X个月"
 * - 12 → "1年"
 * - 13+ → "X年Y个月"（仅展示完整年+剩余月，不显示天）
 */
export function formatRunwayDuration(months: number): string {
  if (months <= 0) return '不足1个月'
  if (months < 12) return `${months}个月`
  const years = Math.floor(months / 12)
  const remainder = months % 12
  if (remainder === 0) return `${years}年`
  return `${years}年${remainder}个月`
}

/**
 * 格式化月消费额（分）为元显示字符串。
 * 必须显示与 monthlyFen 完全一致的金额（最多两位小数，不强制整元）。
 * 例：298908分 → "2,989.08 元/月"
 */
export function formatMonthlySpend(monthlyFen: number): string {
  const absFen = Math.round(monthlyFen)
  const intPart = Math.trunc(absFen / 100)
  const fracPart = absFen % 100
  const formattedInt = intPart.toLocaleString('zh-CN')
  // Always show 2 decimal places — exact fen representation
  const formattedFrac = String(fracPart).padStart(2, '0')
  return `${formattedInt}.${formattedFrac} 元/月`
}

// ── Validation ──────────────────────────────────────────────

export const RUNWAY_CASH_MIN_YUAN = 1000
export const RUNWAY_CASH_MAX_YUAN = 100_000_000

/** 统一清洗规则：剥离可选单个前置 ¥/￥ 和合法千分位逗号 */
export function cleanCashInput(value: string): string {
  let s = value.trim()
  // Strip at most one leading ¥ or ￥
  s = s.replace(/^[¥￥]/, '')
  // Remove commas (only from valid positions — validateCashInput enforces structure)
  s = s.replace(/,/g, '')
  return s.trim()
}

export interface CashValidation {
  valid: boolean
  error?: string
}

/**
 * 校验现金输入是否在合法范围内。
 * 只允许：可选单个前置 ¥/￥、纯数字或正确三位千分位逗号、最多两位小数。
 * 拒绝：1,,000、1,00,0、¥¥1000、abc 等。
 */
export function validateCashInput(value: string): CashValidation {
  if (value.trim() === '') return { valid: false, error: '请输入可自由支配现金金额。' }

  // Strip optional single leading ¥/￥ for structural check
  const withoutSymbol = value.trim().replace(/^[¥￥]/, '')
  if (withoutSymbol === '') return { valid: false, error: '请输入有效金额。' }

  // Validate structure: digits with optional proper thousand-separator commas, optional 1-2 decimal places
  // Accept: "1000", "1,000", "1,000.50", "1000.5", "100000000"
  // Reject: "1,,000", "1,00,0", "1,000.123", "abc"
  if (!/^(\d+|\d{1,3}(,\d{3})*)(\.\d{1,2})?$/.test(withoutSymbol)) {
    return { valid: false, error: '请输入有效金额（最多两位小数）。' }
  }

  // Also reject multiple ¥/￥ symbols
  if ((value.match(/[¥￥]/g) || []).length > 1) {
    return { valid: false, error: '请输入有效金额。' }
  }

  const cleaned = cleanCashInput(value)
  const num = parseFloat(cleaned)
  if (Number.isNaN(num) || num < RUNWAY_CASH_MIN_YUAN) {
    return { valid: false, error: `最低可输入金额为 ${RUNWAY_CASH_MIN_YUAN.toLocaleString('zh-CN')} 元。` }
  }
  if (num > RUNWAY_CASH_MAX_YUAN) {
    return { valid: false, error: `最高可输入金额为 ${RUNWAY_CASH_MAX_YUAN.toLocaleString('zh-CN')} 元。` }
  }

  return { valid: true }
}

/** 将用户输入字符串解析为数值（元），使用与 validateCashInput 相同的清洗规则 */
export function parseCashYuan(value: string): number {
  const cleaned = cleanCashInput(value)
  return parseFloat(cleaned)
}
