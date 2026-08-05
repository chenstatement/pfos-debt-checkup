/** 不上班能过计算引擎：金额使用整数分，规则确定且可复核。 */

import { yuanToFen } from '../domain/money'
import type { RunwayBaseline } from '../data/runwayBaselines'

export type SpendingTier = 'flat' | 'frugal' | 'normal' | 'comfortable' | 'luxury'

export interface TierResult {
  tier: SpendingTier
  label: string
  coefficient: string
  monthlyFen: number
  runwayMonths: number
  runwayDays: number
}

export interface RunwayResult {
  cashFen: number
  baseline: RunwayBaseline
  annualFen: number
  tiers: Record<SpendingTier, TierResult>
  /** 正常过档位攒下的时间，折算为全年约 100 天休息的年数。 */
  restComparison: {
    days: number
    medianYears: number
  }
  /** 兼容旧调用方：正常过能过时长折算成 10 天一组。 */
  tenDayBreakBlocks: number
}

function calcRunwayMonths(cashFen: number, monthlyFen: number): number {
  return monthlyFen > 0 ? Math.floor(cashFen / monthlyFen) : 0
}

function makeTier(
  tier: SpendingTier, label: string, coefficient: string, monthlyFen: number, cashFen: number,
): TierResult {
  const runwayMonths = calcRunwayMonths(cashFen, monthlyFen)
  return { tier, label, coefficient, monthlyFen, runwayMonths, runwayDays: Math.floor(runwayMonths * 365 / 12) }
}

export function calculateRunway(cashYuan: number, baseline: RunwayBaseline): RunwayResult {
  const cashFen = yuanToFen(Math.max(0, cashYuan))
  const annualFen = Math.round(baseline.annualYuan * 100)
  const minimumWageFen = Math.round(baseline.minimumWageMonthlyYuan * 100)
  const dailyFen = Math.round(annualFen / 365)

  const tiers: Record<SpendingTier, TierResult> = {
    flat: makeTier('flat', '躺平过', '当地最低工资的 50%', Math.round(minimumWageFen * 0.5), cashFen),
    frugal: makeTier('frugal', '省着过', '当地最低工资的 100%', minimumWageFen, cashFen),
    normal: makeTier('normal', '正常过', '城镇居民平均消费的 100%', Math.round(annualFen / 12), cashFen),
    comfortable: makeTier('comfortable', '从容过', '城镇居民平均消费的 130%', Math.round(annualFen * 1.3 / 12), cashFen),
    luxury: makeTier('luxury', '自由过', '城镇居民平均消费的 300%', Math.round(annualFen * 3 / 12), cashFen),
  }

  // The comparison is intentionally a transparent PFOS benchmark, not an official universal statistic.
  const days = tiers.normal.runwayDays
  const restComparison = {
    days,
    medianYears: days / 100,
  }

  return {
    cashFen, baseline, annualFen, tiers, restComparison,
    tenDayBreakBlocks: Math.floor(days / 10),
  }
}

export function formatRunwayDuration(months: number): string {
  if (months <= 0) return '不足1个月'
  if (months < 12) return `${months}个月`
  const years = Math.floor(months / 12)
  const remainder = months % 12
  return remainder === 0 ? `${years}年` : `${years}年${remainder}个月`
}

/** 将能过时长拆成卡片右侧的上下两行，年/月共用同一列并保持居中。 */
export function formatRunwayParts(months: number): { years: string; months: string } {
  if (months <= 0) return { years: '不足1年', months: '不足1个月' }
  if (months < 12) return { years: '不足1年', months: `${months}个月` }
  return { years: `${Math.floor(months / 12)}年`, months: `${months % 12}个月` }
}

export function formatMonthlySpend(monthlyFen: number): string {
  const absFen = Math.round(monthlyFen)
  const intPart = Math.trunc(absFen / 100)
  const fracPart = absFen % 100
  return `${intPart.toLocaleString('zh-CN')}.${String(fracPart).padStart(2, '0')} 元/月`
}

export const RUNWAY_CASH_MIN_YUAN = 1000
export const RUNWAY_CASH_MAX_YUAN = 100_000_000

export function cleanCashInput(value: string): string {
  let s = value.trim().replace(/^[¥￥]/, '')
  s = s.replace(/,/g, '')
  return s.trim()
}

export interface CashValidation { valid: boolean; error?: string }

export function validateCashInput(value: string): CashValidation {
  if (value.trim() === '') return { valid: false, error: '请输入可自由支配现金金额。' }
  const withoutSymbol = value.trim().replace(/^[¥￥]/, '')
  if (withoutSymbol === '' || !/^(\d+|\d{1,3}(,\d{3})*)(\.\d{1,2})?$/.test(withoutSymbol)) {
    return { valid: false, error: '请输入有效金额（最多两位小数）。' }
  }
  if ((value.match(/[¥￥]/g) || []).length > 1) return { valid: false, error: '请输入有效金额。' }
  const num = parseFloat(cleanCashInput(value))
  if (Number.isNaN(num) || num < RUNWAY_CASH_MIN_YUAN) return { valid: false, error: `最低可输入金额为 ${RUNWAY_CASH_MIN_YUAN.toLocaleString('zh-CN')} 元。` }
  if (num > RUNWAY_CASH_MAX_YUAN) return { valid: false, error: `最高可输入金额为 ${RUNWAY_CASH_MAX_YUAN.toLocaleString('zh-CN')} 元。` }
  return { valid: true }
}

export function parseCashYuan(value: string): number {
  return parseFloat(cleanCashInput(value))
}
