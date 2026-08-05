import { useState, useCallback, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import StickyHeader from '../components/StickyHeader'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_VERSION } from '../domain/constants'
import { RUNWAY_BASELINES } from '../data/runwayBaselines'
import { calculateRunway, formatRunwayDuration, formatMonthlySpend, validateCashInput, parseCashYuan } from '../engine/runwayCalculator'
import type { RunwayResult, SpendingTier } from '../engine/runwayCalculator'

const DEFAULT_CASH = '100000'
const TIER_ORDER: SpendingTier[] = ['flat', 'frugal', 'normal', 'comfortable', 'luxury']
const GROUP_ORDER = ['一线城市', '新一线城市', '华东', '西北', '东北', '西南', '华南', '华中', '全国'] as const

export default function RunwayPage() {
  const navigate = useNavigate()
  const { data } = useApp()
  const hasValidConsent = data.consent !== null && data.consent.documentVersion === DISCLAIMER_VERSION && !data.consent.revokedAt
  const [cashInput, setCashInput] = useState(DEFAULT_CASH)
  const [selectedRegionId, setSelectedRegionId] = useState('')
  const [result, setResult] = useState<RunwayResult | null>(null)
  const [showMethodology, setShowMethodology] = useState(false)
  const [cashError, setCashError] = useState('')
  const [regionError, setRegionError] = useState('')
  const [hasCalculated, setHasCalculated] = useState(false)
  const resultRef = useRef<HTMLDivElement>(null)

  const invalidate = useCallback(() => { setResult(null); setHasCalculated(false) }, [])
  const handleCashChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => { setCashInput(e.target.value); setCashError(''); if (hasCalculated) invalidate() }, [hasCalculated, invalidate])
  const handleRegionChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => { setSelectedRegionId(e.target.value); setRegionError(''); if (hasCalculated) invalidate() }, [hasCalculated, invalidate])

  const handleCalculate = useCallback(() => {
    const cashValidation = validateCashInput(cashInput)
    if (!cashValidation.valid) { setCashError(cashValidation.error ?? '请输入有效金额。'); return }
    if (!selectedRegionId) { setRegionError('请选择常住地区。'); return }
    const baseline = RUNWAY_BASELINES.find(b => b.id === selectedRegionId)
    if (!baseline) { setRegionError('所选地区数据不可用，请重新选择。'); return }
    setCashError(''); setRegionError(''); setResult(calculateRunway(parseCashYuan(cashInput), baseline)); setHasCalculated(true); setShowMethodology(false)
  }, [cashInput, selectedRegionId])

  const handleReset = useCallback(() => { setResult(null); setHasCalculated(false); setShowMethodology(false); setCashError(''); setRegionError('') }, [])
  const handleGoToWizard = useCallback(() => { navigate(hasValidConsent ? '/wizard' : '/') }, [hasValidConsent, navigate])
  const resultBaseline = result?.baseline ?? null

  useEffect(() => {
    if (hasCalculated && result && resultRef.current) {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      resultRef.current.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); resultRef.current.focus({ preventScroll: true })
    }
  }, [hasCalculated, result])

  return (
    <div className="min-h-screen safe-bottom" style={{ background: 'linear-gradient(180deg, #F2F2F7 0%, #E8E8ED 100%)' }}>
      <StickyHeader title="不上班续航" backTo="/" backLabel="返回 PFOS" titleIsHeading={false} />
      <div className="max-w-md mx-auto px-5 py-4 space-y-6">
        <header className="text-center space-y-3 pt-2">
          <p className="text-[13px] font-medium tracking-wide" style={{ color: '#8E8E93' }}>PFOS · 20秒互动测算</p>
          <h1 className="text-[28px] font-bold tracking-tight" style={{ color: '#1C1C1E', letterSpacing: '-0.03em' }}>不上班续航计算器</h1>
          <p className="text-[15px] leading-relaxed" style={{ color: '#6E6E73' }}>输入本金和常住地区，看看现金能为你换来多久的选择时间。</p>
        </header>

        <div className="apple-card space-y-5">
          <div>
            <label htmlFor="runway-cash" className="block text-[14px] font-semibold mb-2" style={{ color: '#1C1C1E' }}>可自由支配现金</label>
            <div className="relative"><span className="absolute left-4 top-1/2 -translate-y-1/2 text-[16px] font-medium" style={{ color: '#8E8E93' }}>¥</span><input id="runway-cash" type="text" inputMode="decimal" className="apple-input pl-8" value={cashInput} onChange={handleCashChange} aria-describedby={cashError ? 'cash-error' : 'cash-hint'} aria-invalid={!!cashError} /></div>
            <p id="cash-hint" className="text-[12px] mt-1.5" style={{ color: '#8E8E93' }}>只填写现在可以用于生活、且不影响必要还款和应急储备的现金。</p>
            {cashError && <p id="cash-error" role="alert" className="text-[13px] mt-1.5 font-medium" style={{ color: '#FF3B30' }}>{cashError}</p>}
          </div>
          <div>
            <label htmlFor="runway-region" className="block text-[14px] font-semibold mb-2" style={{ color: '#1C1C1E' }}>常住地区</label>
            <select id="runway-region" className="apple-input appearance-none" value={selectedRegionId} onChange={handleRegionChange} aria-describedby={regionError ? 'region-error' : undefined} aria-invalid={!!regionError} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%238E8E93' stroke-width='1.5' fill='none'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 16px center', paddingRight: '40px' }}>
              <option value="" disabled>请选择常住地区</option>
              {GROUP_ORDER.map(group => <optgroup key={group} label={group}>{RUNWAY_BASELINES.filter(b => b.regionGroup === group).map(b => <option key={b.id} value={b.id}>{b.optionLabel}</option>)}</optgroup>)}
            </select>
            {regionError && <p id="region-error" role="alert" className="text-[13px] mt-1.5 font-medium" style={{ color: '#FF3B30' }}>{regionError}</p>}
          </div>
          <button type="button" onClick={handleCalculate} className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]" style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>测测这笔现金的续航</button>
        </div>

        <div ref={resultRef} tabIndex={-1} role="region" aria-label="计算结果" aria-live="polite" style={{ outline: 'none' }}>
          {hasCalculated && result && resultBaseline && <div className="space-y-5">
            <div className="apple-card text-center space-y-2">
              <p className="text-[12px] font-medium tracking-wide" style={{ color: '#8E8E93' }}>{resultBaseline.resultLabel}</p>
              <h3 className="text-[22px] font-bold tracking-tight" style={{ color: '#1C1C1E' }}>你为自己攒下了一段选择时间。</h3>
            </div>
            <div className="space-y-3">{TIER_ORDER.map(tier => { const t = result.tiers[tier]; const isMain = tier === 'normal'; return <div key={tier} className="apple-card flex items-center justify-between py-4 px-5" style={isMain ? { border: '2px solid #007AFF', boxShadow: '0 4px 20px rgba(0,122,255,0.15)' } : {}}><div><p className="text-[14px] font-semibold" style={{ color: isMain ? '#007AFF' : '#1C1C1E' }}>{t.label}</p><p className="text-[12px]" style={{ color: '#8E8E93' }}>{formatMonthlySpend(t.monthlyFen)} · {t.coefficient}</p></div><p className={`font-bold tracking-tight ${isMain ? 'text-[24px]' : 'text-[20px]'}`} style={{ color: isMain ? '#007AFF' : '#1C1C1E' }}>{formatRunwayDuration(t.runwayMonths)}</p></div> })}</div>
            <div className="apple-card space-y-2"><p className="text-[14px]" style={{ color: '#1C1C1E' }}>按“日常过”口径，你攒下的时间约为 <span className="font-bold" style={{ color: '#007AFF' }}>{result.restComparison.days.toLocaleString('zh-CN')} 天</span>。</p><p className="text-[12px] leading-relaxed" style={{ color: '#6E6E73' }}>以全国城镇职工加权平均全年实际休息中位值 100 天作对比，相当于约 {result.restComparison.medianYears.toFixed(1)} 个“全年休息年”。</p></div>
          </div>}
        </div>

        {hasCalculated && result && <div className="apple-card space-y-3" style={{ background: 'linear-gradient(135deg, rgba(0,122,255,0.04), rgba(88,86,214,0.04))' }}><h3 className="text-[16px] font-bold" style={{ color: '#1C1C1E' }}>想看更接近你的真实现金流？</h3><p className="text-[14px] leading-relaxed" style={{ color: '#6E6E73' }}>统计均值不能代替你的真实账目；债务、房贷和固定月供通常会显著缩短现金时间。</p><button type="button" onClick={handleGoToWizard} className="apple-btn apple-btn-primary w-full py-3 text-[16px]" style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>把债务和月供算进去</button>{!hasValidConsent && <p className="text-[12px] text-center" style={{ color: '#FF9500' }}>未确认声明时会先返回 PFOS 首页阅读并确认。</p>}<p className="text-[12px] text-center" style={{ color: '#8E8E93' }}>进入现有 PFOS 债务体检；本页不收集债务明细。</p></div>}
        {hasCalculated && <div className="text-center"><button type="button" onClick={handleReset} className="apple-btn apple-btn-secondary">重新计算</button></div>}

        <div className="apple-card space-y-3">
          <button type="button" onClick={() => setShowMethodology(v => !v)} className="w-full flex items-center justify-between text-left" aria-expanded={showMethodology}><span className="text-[15px] font-semibold" style={{ color: '#1C1C1E' }}>这个结果怎么算</span><span className="text-[16px] transition-transform duration-200" style={{ color: '#8E8E93', transform: showMethodology ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span></button>
          {showMethodology && <div className="space-y-4 pt-2 text-[13px] leading-relaxed" style={{ color: '#6E6E73' }}>
            {resultBaseline ? <div className="rounded-xl p-4 space-y-1.5" style={{ background: 'rgba(0,0,0,0.02)' }}><p className="font-semibold text-[#1C1C1E] mb-1">本次使用的数据</p><p>地区：{resultBaseline.sourceRegionName}（{resultBaseline.regionLevel === 'city' ? resultBaseline.regionGroup : resultBaseline.regionLevel === 'province' ? `${resultBaseline.regionGroup}代表省` : '全国'}）</p><p>属地口径：最低工资与官方月均消费均取上述所选地区口径</p><p>年份：{resultBaseline.dataYear} 年；指标：{resultBaseline.metricName}</p><p>官方年值：{resultBaseline.annualYuan.toLocaleString('zh-CN')} 元/人/年</p><p>最低工资：{resultBaseline.minimumWageMonthlyYuan.toLocaleString('zh-CN')} 元/月（最低档）</p><p>消费数据来源：{resultBaseline.sourceName}，发布日期 {resultBaseline.sourcePublishedAt}</p><p>最低工资来源：{resultBaseline.minimumWageSourceName}</p>{resultBaseline.dataNote && <p>备注：{resultBaseline.dataNote}</p>}<div className="flex gap-3 pt-1"><a href={resultBaseline.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#007AFF] underline">查看消费官方来源</a><a href={resultBaseline.minimumWageSourceUrl} target="_blank" rel="noopener noreferrer" className="text-[#007AFF] underline">查看最低工资表</a></div></div> : <p style={{ color: '#8E8E93' }}>请先完成计算后查看本次数据来源。</p>}
            <div><p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>计算公式</p><div className="rounded-lg p-3 space-y-0.5" style={{ background: 'rgba(0,0,0,0.03)', fontFamily: 'monospace', fontSize: '12px' }}><p>躺平过 = 最低工资 × 50%</p><p>省着过 = 最低工资 × 100%</p><p>日常过 = 官方年值 ÷ 12</p><p>从容过 = 官方月均 × 130%</p><p>奢侈过 = 官方月均 × 300%</p><p>续航月数 = floor(可自由支配现金 ÷ 本档月消费额)</p></div></div>
            <div><p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>口径说明</p><ul className="list-disc pl-4 space-y-1"><li>城市档覆盖确认的一线、新一线城市；这些城市的情景默认仍需工作，计算只表示现金覆盖时间。</li><li>省级档按华东（浙江、江苏）、西北（甘肃、陕西）、东北（吉林）、西南（四川、贵州）、华南（广东、广西）、华中（山东、河南、湖南）选择代表省。</li><li>最低工资和官方月均消费均落在所选属地口径：选城市用城市数据，选代表省用省级均值，选全国用全国城镇均值。</li><li>所有消费数据取 2025 年年度公开统计值；最低工资取 2025 年最低档。</li><li>全国最低工资为各省 2025 年最低工资标准按城镇人口加权估算，不是国家统一最低工资。</li><li>休息对比采用 PFOS 场景基准：全国城镇职工加权平均全年实际休息中位值约 100 天，不是对每个人的法定休息承诺。</li></ul></div>
            <div><p className="font-semibold mb-1" style={{ color: '#1C1C1E' }}>限制</p><ul className="list-disc pl-4 space-y-1"><li>默认单人、无工作收入、无投资收益、未计通胀。</li><li>未纳入债务还款、房租/房贷、赡养抚养、保险、医疗及突发支出。</li><li>结果按完整月向下取整，仅用于内容体验，不构成辞职、投资或财务决策建议。</li></ul></div>
          </div>}
        </div>
        <p className="text-[12px] text-center pb-1" style={{ color: '#8E8E93' }}>🔒 金额和地区只在当前页面内计算，不上传、不保存；离开或刷新页面后结果消失。</p><p className="text-[11px] text-center pb-4" style={{ color: '#8E8E93' }}>仅供18周岁以上用户体验。</p>
      </div>
    </div>
  )
}
