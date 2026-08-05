import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StickyHeader from '../components/StickyHeader'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_VERSION } from '../domain/constants'
import { RUNWAY_BASELINES } from '../data/runwayBaselines'
import {
  calculateRunway,
  formatRunwayDuration,
  formatMonthlySpend,
  validateCashInput,
  parseCashYuan,
} from '../engine/runwayCalculator'
import type { RunwayResult } from '../engine/runwayCalculator'

const DEFAULT_CASH = '100000'

export default function RunwayPage() {
  const navigate = useNavigate()
  const { data } = useApp()

  // ── Consent check for CTA navigation (same logic as ConsentGuard) ──
  const hasValidConsent =
    data.consent !== null &&
    data.consent.documentVersion === DISCLAIMER_VERSION &&
    !data.consent.revokedAt

  // ── Local state only — no localStorage, no URL params, no network ──
  const [cashInput, setCashInput] = useState(DEFAULT_CASH)
  const [selectedRegionId, setSelectedRegionId] = useState('')
  const [result, setResult] = useState<RunwayResult | null>(null)
  const [showMethodology, setShowMethodology] = useState(false)
  const [cashError, setCashError] = useState('')
  const [regionError, setRegionError] = useState('')
  const [hasCalculated, setHasCalculated] = useState(false)

  const resultRef = useRef<HTMLDivElement>(null)

  // ── Handlers ────────────────────────────────────────────────

  const handleCashChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCashInput(e.target.value)
    if (cashError) setCashError('')
    // A2: input changed → invalidate stale result
    if (hasCalculated) {
      setResult(null)
      setHasCalculated(false)
    }
  }, [cashError, hasCalculated])

  const handleRegionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedRegionId(e.target.value)
    if (regionError) setRegionError('')
    // A2: region changed → invalidate stale result
    if (hasCalculated) {
      setResult(null)
      setHasCalculated(false)
    }
  }, [regionError, hasCalculated])

  const handleCalculate = useCallback(() => {
    // Validate cash
    const cashValidation = validateCashInput(cashInput)
    if (!cashValidation.valid) {
      setCashError(cashValidation.error ?? '请输入有效金额。')
      setRegionError('')
      return
    }
    setCashError('')

    // Validate region
    if (!selectedRegionId) {
      setRegionError('请选择常住地区。')
      setCashError('')
      return
    }
    setRegionError('')

    const baseline = RUNWAY_BASELINES.find(b => b.id === selectedRegionId)
    if (!baseline) {
      setRegionError('所选地区数据不可用，请重新选择。')
      return
    }

    const cashYuan = parseCashYuan(cashInput)
    const calcResult = calculateRunway(cashYuan, baseline)
    setResult(calcResult)
    setHasCalculated(true)
    setShowMethodology(false)
  }, [cashInput, selectedRegionId])

  const handleReset = useCallback(() => {
    setResult(null)
    setHasCalculated(false)
    setShowMethodology(false)
    setCashError('')
    setRegionError('')
  }, [])

  const handleGoToWizard = useCallback(() => {
    if (hasValidConsent) {
      navigate('/wizard')
    } else {
      navigate('/')
    }
  }, [hasValidConsent, navigate])

  // A2: derive ALL region display from result.baseline, never from selectedBaseline
  const resultBaseline = result?.baseline ?? null

  // ── Scroll to results ───────────────────────────────────────

  useEffect(() => {
    if (hasCalculated && result && resultRef.current) {
      const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      resultRef.current.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' })
      resultRef.current.focus({ preventScroll: true })
    }
  }, [hasCalculated, result])

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen safe-bottom" style={{ background: 'linear-gradient(180deg, #F2F2F7 0%, #E8E8ED 100%)' }}>
      <StickyHeader title="不上班续航" backTo="/" backLabel="返回 PFOS" titleIsHeading={false} />

      <div className="max-w-md mx-auto px-5 py-4 space-y-6">

        {/* ── Top Section ─────────────────────────────────────── */}
        <header className="text-center space-y-3 pt-2">
          <p className="text-[13px] font-medium tracking-wide" style={{ color: '#8E8E93' }}>
            PFOS · 20秒互动测算
          </p>
          <h1 className="text-[28px] font-bold tracking-tight" style={{ color: '#1C1C1E', letterSpacing: '-0.03em' }}>
            不上班续航计算器
          </h1>
          <p className="text-[15px] leading-relaxed" style={{ color: '#6E6E73' }}>
            这不是测你能不能退休，而是看看手里的现金能为你换来多久的选择权。
          </p>
          <p className="text-[13px] leading-relaxed" style={{ color: '#8E8E93' }}>
            已用10万元作为起点，你可以改成自己的金额。结果是所选统计口径下的城镇居民平均消费模拟，不是辞职、投资或财务决策建议。
          </p>
        </header>

        {/* ── Input Section ───────────────────────────────────── */}
        <div className="apple-card space-y-5">
          {/* Cash Input */}
          <div>
            <label htmlFor="runway-cash" className="block text-[14px] font-semibold mb-2" style={{ color: '#1C1C1E' }}>
              可自由支配现金
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-medium" style={{ color: '#8E8E93' }}>
                ¥
              </span>
              <input
                id="runway-cash"
                type="text"
                inputMode="decimal"
                className="apple-input pl-8"
                value={cashInput}
                onChange={handleCashChange}
                aria-describedby={cashError ? 'cash-error' : 'cash-hint'}
                aria-invalid={!!cashError}
              />
            </div>
            <p id="cash-hint" className="text-[12px] mt-1.5" style={{ color: '#8E8E93' }}>
              指现在可以用于生活，且不影响必要还款和应急储备的现金。
            </p>
            {cashError && (
              <p id="cash-error" role="alert" className="text-[13px] mt-1.5 font-medium" style={{ color: '#FF3B30' }}>
                {cashError}
              </p>
            )}
          </div>

          {/* Region Selector */}
          <div>
            <label htmlFor="runway-region" className="block text-[14px] font-semibold mb-2" style={{ color: '#1C1C1E' }}>
              常住地区
            </label>
            <select
              id="runway-region"
              className="apple-input appearance-none"
              value={selectedRegionId}
              onChange={handleRegionChange}
              aria-describedby={regionError ? 'region-error' : undefined}
              aria-invalid={!!regionError}
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238E8E93' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat',
                backgroundPosition: 'right 16px center',
                paddingRight: '40px',
              }}
            >
              <option value="" disabled>
                请选择常住地区
              </option>
              {RUNWAY_BASELINES.map(b => (
                <option key={b.id} value={b.id}>
                  {b.optionLabel}
                </option>
              ))}
            </select>
            {regionError && (
              <p id="region-error" role="alert" className="text-[13px] mt-1.5 font-medium" style={{ color: '#FF3B30' }}>
                {regionError}
              </p>
            )}
          </div>

          {/* Calculate Button */}
          <button
            type="button"
            onClick={handleCalculate}
            className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]"
            style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}
          >
            测测这笔现金的续航
          </button>
        </div>

        {/* ── Results Section ─────────────────────────────────── */}
        <div
          ref={resultRef}
          tabIndex={-1}
          role="region"
          aria-label="计算结果"
          aria-live="polite"
          style={{ outline: 'none' }}
        >
          {hasCalculated && result && resultBaseline && (
            <div className="space-y-5">
              {/* Result Header */}
              <div className="apple-card text-center space-y-2">
                <p className="text-[12px] font-medium tracking-wide" style={{ color: '#8E8E93' }}>
                  所选统计口径下的城镇居民平均消费模拟
                </p>
                <h3 className="text-[22px] font-bold tracking-tight" style={{ color: '#1C1C1E', letterSpacing: '-0.02em' }}>
                  你为自己攒下了一段选择时间。
                </h3>
                {/* A2: read from result.baseline, not selectedBaseline */}
                <p className="text-[13px]" style={{ color: '#8E8E93' }}>
                  {resultBaseline.resultLabel}
                </p>
                {/* C9: visible stats context */}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-0.5 text-[11px] pt-1" style={{ color: '#8E8E93' }}>
                  <span>{resultBaseline.dataYear} 年统计平均</span>
                  <span>·</span>
                  <span>默认 1 人</span>
                  <span>·</span>
                  <span>无新增收入</span>
                  <span>·</span>
                  <span>未计通胀</span>
                </div>
              </div>

              {/* Three Tiers — "日常过" as visual main result */}
              <div className="space-y-3">
                {(['frugal', 'normal', 'comfortable'] as const).map((tier) => {
                  const t = result.tiers[tier]
                  const isMain = tier === 'normal'
                  return (
                    <div
                      key={tier}
                      className="apple-card flex items-center justify-between py-4 px-5"
                      style={isMain ? {
                        border: '2px solid #007AFF',
                        boxShadow: '0 4px 20px rgba(0,122,255,0.15)',
                      } : {}}
                    >
                      <div>
                        <p
                          className="text-[14px] font-semibold"
                          style={isMain ? { color: '#007AFF' } : { color: '#1C1C1E' }}
                        >
                          {t.label}
                        </p>
                        <p className="text-[12px]" style={{ color: '#8E8E93' }}>
                          {formatMonthlySpend(t.monthlyFen)} · {t.coefficient}
                        </p>
                      </div>
                      <p
                        className={`font-bold tracking-tight ${isMain ? 'text-[24px]' : 'text-[20px]'}`}
                        style={isMain ? { color: '#007AFF' } : { color: '#1C1C1E' }}
                      >
                        {formatRunwayDuration(t.runwayMonths)}
                      </p>
                    </div>
                  )
                })}
              </div>

              {/* Fun fact: 10-day break blocks */}
              <div className="apple-card space-y-1">
                <p className="text-[14px]" style={{ color: '#1C1C1E' }}>
                  恭喜，你攒下的选择时间，约等于一次性休完{' '}
                  <span className="font-bold" style={{ color: '#007AFF' }}>{result.tenDayBreakBlocks} 年的"10天假期"</span>。
                </p>
                <p className="text-[11px]" style={{ color: '#8E8E93' }}>
                  按每年10天假期趣味换算；实际带薪年休假因累计工作年限等条件而异。
                </p>
              </div>

              {/* Result notice */}
              <p className="text-[13px] text-center px-4" style={{ color: '#8E8E93' }}>
                这是统计平均生活消费强度，不是你的个人真实支出。
              </p>
            </div>
          )}
        </div>

        {/* ── PFOS Conversion (only after successful calculation) ── */}
        {hasCalculated && result && resultBaseline && (
          <div className="apple-card space-y-3" style={{ background: 'linear-gradient(135deg, rgba(0,122,255,0.04), rgba(88,86,214,0.04))' }}>
            <h3 className="text-[16px] font-bold" style={{ color: '#1C1C1E' }}>
              想看更接近你的真实现金流？
            </h3>
            <p className="text-[14px] leading-relaxed" style={{ color: '#6E6E73' }}>
              个人实际支出可能比统计均值更长或更短——而债务还款、房贷和固定月供通常会显著缩短这些时间。把真实账目算出来，才能看清现金流。
            </p>
            <button
              type="button"
              onClick={handleGoToWizard}
              className="apple-btn apple-btn-primary w-full py-3 text-[16px]"
              style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}
            >
              把债务和月供算进去
            </button>
            {!hasValidConsent && (
              <p className="text-[12px] text-center" style={{ color: '#FF9500' }}>
                未确认声明时会先返回 PFOS 首页阅读并确认。
              </p>
            )}
            <p className="text-[12px] text-center" style={{ color: '#8E8E93' }}>
              进入现有 PFOS 债务体检；本页不收集债务明细。
            </p>
          </div>
        )}

        {/* Reset button — secondary action, after conversion card */}
        {hasCalculated && result && (
          <div className="text-center">
            <button
              type="button"
              onClick={handleReset}
              className="apple-btn apple-btn-secondary"
            >
              重新计算
            </button>
          </div>
        )}

        {/* ── Methodology ──────────────────────────────────────── */}
        <div className="apple-card space-y-3">
          <button
            type="button"
            onClick={() => setShowMethodology(v => !v)}
            className="w-full flex items-center justify-between text-left"
            aria-expanded={showMethodology}
          >
            <span className="text-[15px] font-semibold" style={{ color: '#1C1C1E' }}>
              这个结果怎么算
            </span>
            <span
              className="text-[16px] transition-transform duration-200"
              style={{
                color: '#8E8E93',
                transform: showMethodology ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              ▼
            </span>
          </button>

          {showMethodology && (
            <div className="space-y-4 pt-2 text-[13px] leading-relaxed" style={{ color: '#6E6E73' }}>
              {/* Data source details — read from result.baseline when available */}
              {resultBaseline ? (
                <div className="rounded-xl p-4 space-y-1.5" style={{ background: 'rgba(0,0,0,0.02)' }}>
                  <p className="font-semibold text-[#1C1C1E] mb-1">本次使用的数据</p>
                  <p>地区：{resultBaseline.sourceRegionName}</p>
                  <p>数据层级：{
                    resultBaseline.regionLevel === 'city' ? '市级'
                    : resultBaseline.regionLevel === 'province' ? '省级'
                    : '全国'
                  }</p>
                  <p>年份：{resultBaseline.dataYear} 年</p>
                  <p>指标：{resultBaseline.metricName}</p>
                  <p>年值：{resultBaseline.annualYuan.toLocaleString('zh-CN')} 元/人/年</p>
                  <p>来源：{resultBaseline.sourceName}</p>
                  <p>发布日期：{resultBaseline.sourcePublishedAt}</p>
                  <a
                    href={resultBaseline.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block mt-1 text-[#007AFF] underline"
                  >
                    查看官方数据来源
                  </a>
                </div>
              ) : (
                <p style={{ color: '#8E8E93' }}>请先选择地区并完成计算后查看数据来源。</p>
              )}

              {/* Explicit formula */}
              <div>
                <p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>计算公式</p>
                <div className="rounded-lg p-3 space-y-0.5" style={{ background: 'rgba(0,0,0,0.03)', fontFamily: 'monospace', fontSize: '12px' }}>
                  <p>月消费额 = round(年官方值 × 系数 ÷ 12)</p>
                  <p>完整续航月数 = floor(可自由支配现金 ÷ 本档月消费额)</p>
                  <p>10天假期组数 = floor(日常过续航月数 × 365 ÷ 12 ÷ 10)</p>
                </div>
              </div>

              {/* Coefficient explanation */}
              <div>
                <p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>三档消费系数</p>
                <p>省着过 = 官方月均 × 80%</p>
                <p>日常过 = 官方月均 × 100%</p>
                <p>从容过 = 官方月均 × 130%</p>
                <p className="text-[12px]" style={{ color: '#8E8E93' }}>
                  系数是 PFOS 场景假设，不是官方统计分类。
                </p>
              </div>

              {/* Limitations */}
              <div>
                <p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>计算假设与限制</p>
                <ul className="list-disc pl-4 space-y-1">
                  <li>默认单人、无工作收入、无投资收益</li>
                  <li>静态估算，未计入通货膨胀</li>
                  <li>未纳入债务还款、实际房租/房贷</li>
                  <li>未纳入赡养抚养、社保保险、大额医疗和突发支出</li>
                  <li>统计口径既包括现金消费也包括实物消费，只能用于粗略模拟</li>
                  <li>结果仅按完整月向下取整，不精确到天</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* ── Privacy + 18+ ───────────────────────────────────── */}
        <p className="text-[12px] text-center pb-1" style={{ color: '#8E8E93' }}>
          🔒 金额和地区只在当前页面内计算，不上传、不保存；离开或刷新页面后结果消失。
        </p>
        <p className="text-[11px] text-center pb-4" style={{ color: '#8E8E93' }}>
          仅供18周岁以上用户体验。
        </p>

      </div>
    </div>
  )
}
