import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatFenAsYuan } from '../domain/money'
import { RISK_REASON_LABELS, PRIORITY_INFO, RISK_LEVEL_INFO } from '../domain/constants'
import type { FullReport } from '../engine/report'
import type { ActionItem, DebtAccount, RiskAssessment } from '../domain/types'

// ── Helpers ───────────────────────────────────────────────────

/** Group actions into today / this week / this month buckets relative to a fixed reference date */
function groupActions(actions: ActionItem[], referenceDate: string): {
  today: ActionItem[]
  thisWeek: ActionItem[]
  thisMonth: ActionItem[]
} {
  const today: ActionItem[] = []
  const thisWeek: ActionItem[] = []
  const thisMonth: ActionItem[] = []
  const ref = new Date(referenceDate)
  ref.setHours(0, 0, 0, 0)

  for (const action of actions) {
    if (action.dueAt) {
      const dueDate = new Date(action.dueAt)
      dueDate.setHours(0, 0, 0, 0)
      const dueDays = Math.ceil((dueDate.getTime() - ref.getTime()) / (1000 * 60 * 60 * 24))
      if (dueDays <= 0) {
        today.push(action)
      } else if (dueDays <= 7) {
        thisWeek.push(action)
      } else {
        thisMonth.push(action)
      }
    } else {
      // No due date — classify by priority
      if (action.priority === 'P0') {
        today.push(action)
      } else if (action.priority === 'P1') {
        thisWeek.push(action)
      } else {
        thisMonth.push(action)
      }
    }
  }

  return { today, thisWeek, thisMonth }
}

/** Get top N debts by risk priority, mapping via active debts */
function getTopDebts(
  assessments: RiskAssessment[],
  debts: DebtAccount[],
  limit: number = 3
): { debt: DebtAccount; assessment: RiskAssessment }[] {
  const priorityOrder = ['P0', 'P1', 'P2', 'P3']
  const sorted = [...assessments].sort(
    (a, b) => priorityOrder.indexOf(a.priority) - priorityOrder.indexOf(b.priority)
  )
  const debtMap = new Map(debts.map(d => [d.id, d]))
  return sorted.slice(0, limit).flatMap(a => {
    const debt = debtMap.get(a.debtId)
    return debt ? [{ debt, assessment: a }] : []
  })
}

// ── Cashflow Sparkline SVG ────────────────────────────────────

function CashflowSparkline({
  dailyLedger,
  safetyThresholdFen,
  firstGapDate,
}: {
  dailyLedger: { date: string; closingBalanceFen: number }[]
  safetyThresholdFen: number
  firstGapDate: string | null
}) {
  if (!dailyLedger || dailyLedger.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-[13px]" style={{ color: '#8E8E93' }}>暂无现金流数据</p>
      </div>
    )
  }

  const W = 340
  const H = 130
  const PAD_L = 8
  const PAD_R = 8
  const PAD_T = 8
  const PAD_B = 20

  const balances = dailyLedger.map(d => d.closingBalanceFen)
  const minB = Math.min(...balances, 0, -safetyThresholdFen)
  const maxB = Math.max(...balances, safetyThresholdFen, 10000)
  const range = maxB - minB || 1

  const xScale = (i: number) =>
    PAD_L + (i / Math.max(dailyLedger.length - 1, 1)) * (W - PAD_L - PAD_R)
  const yScale = (v: number) =>
    H - PAD_B - ((v - minB) / range) * (H - PAD_T - PAD_B)

  const zeroY = yScale(0)
  const safetyY = yScale(safetyThresholdFen)
  const pathD =
    dailyLedger.length === 1
      ? `M${xScale(0)},${yScale(balances[0])} L${xScale(0) + 1},${yScale(balances[0])}`
      : dailyLedger
          .map((d, i) => `${i === 0 ? 'M' : 'L'}${xScale(i)},${yScale(d.closingBalanceFen)}`)
          .join(' ')

  // Area fill path: line + drop to zero + close
  const areaD =
    dailyLedger.length >= 2
      ? pathD +
        ` L${xScale(dailyLedger.length - 1)},${zeroY} L${xScale(0)},${zeroY} Z`
      : ''

  // First gap marker
  let gapX: number | null = null
  let gapY: number | null = null
  if (firstGapDate) {
    const idx = dailyLedger.findIndex(d => d.date === firstGapDate)
    if (idx >= 0) {
      gapX = xScale(idx)
      gapY = yScale(balances[idx])
    }
  }

  // X-axis labels
  const todayIdx = 0
  const endIdx = dailyLedger.length - 1

  const allSameValue = balances.every(b => b === balances[0])

  return (
    <div className="relative" aria-label="未来90天现金流曲线">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ maxHeight: 140 }}
        role="img"
        aria-label={`90天现金流曲线。${allSameValue ? '余额保持不变' : firstGapDate ? `首次缺口在${firstGapDate}` : '90天内未出现缺口'}`}
      >
        {/* Zero line */}
        <line
          x1={PAD_L}
          y1={zeroY}
          x2={W - PAD_R}
          y2={zeroY}
          stroke="#E5E5EA"
          strokeWidth={1}
          strokeDasharray="3 3"
        />

        {/* Area fill (positive = light green, negative = light red) */}
        {areaD && !allSameValue && (
          <>
            <defs>
              <clipPath id="aboveZero">
                <rect x={0} y={0} width={W} height={zeroY} />
              </clipPath>
              <clipPath id="belowZero">
                <rect x={0} y={zeroY} width={W} height={H - zeroY} />
              </clipPath>
            </defs>
            <path d={areaD} fill="rgba(52,199,89,0.08)" clipPath="url(#aboveZero)" />
            <path d={areaD} fill="rgba(255,59,48,0.06)" clipPath="url(#belowZero)" />
          </>
        )}

        {/* Safety threshold line */}
        <line
          x1={PAD_L}
          y1={safetyY}
          x2={W - PAD_R}
          y2={safetyY}
          stroke="#FF9500"
          strokeWidth={1}
          strokeDasharray="5 3"
        />

        {/* Balance curve */}
        {allSameValue ? (
          <line
            x1={PAD_L}
            y1={yScale(balances[0])}
            x2={W - PAD_R}
            y2={yScale(balances[0])}
            stroke="#007AFF"
            strokeWidth={2}
            strokeLinecap="round"
          />
        ) : (
          <path d={pathD} fill="none" stroke="#007AFF" strokeWidth={2} strokeLinejoin="round" />
        )}

        {/* First gap dot */}
        {gapX !== null && gapY !== null && (
          <>
            <circle cx={gapX} cy={gapY} r={5} fill="#FF3B30" />
            <circle cx={gapX} cy={gapY} r={9} fill="rgba(255,59,48,0.15)" />
          </>
        )}
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between mt-1 px-1">
        <span className="text-[10px]" style={{ color: '#8E8E93' }}>今天</span>
        <span className="text-[10px]" style={{ color: '#8E8E93' }}>90天</span>
      </div>
    </div>
  )
}

// ── Action Section ────────────────────────────────────────────

function ActionSection({
  actions,
  completedActions,
  onToggle,
  referenceDate,
}: {
  actions: ActionItem[]
  completedActions: string[]
  onToggle: (id: string) => void
  referenceDate: string
}) {
  const { today, thisWeek, thisMonth } = useMemo(() => groupActions(actions, referenceDate), [actions, referenceDate])

  const groups: { label: string; color: string; items: ActionItem[] }[] = [
    { label: '今天', color: '#007AFF', items: today },
    { label: '本周', color: '#5856D6', items: thisWeek },
    { label: '本月', color: '#5B6471', items: thisMonth },
  ]

  return (
    <div className="grid gap-2.5">
      {groups.map(group => {
        if (group.items.length === 0) {
          return (
            <div
              key={group.label}
              className="flex items-center gap-2.5 min-h-[52px] py-2.5 px-3 rounded-xl border"
              style={{ background: '#fff', borderColor: 'rgba(0,0,0,0.06)' }}
            >
              <span
                className="text-[11px] font-bold text-white rounded-lg px-2 py-1.5 min-w-[36px] text-center shrink-0"
                style={{ background: group.color }}
              >
                {group.label}
              </span>
              <p className="flex-1 min-w-0 text-[13px] font-semibold leading-snug" style={{ color: '#8E8E93' }}>
                暂无新增行动
              </p>
              <span className="shrink-0 w-6 h-6" aria-hidden="true" />
            </div>
          )
        }

        return group.items.map(action => {
          const isDone = completedActions.includes(action.id)
          return (
            <div
              key={action.id}
              className="flex items-start gap-2.5 py-2.5 px-3 rounded-xl border transition-colors"
              style={{
                background: isDone ? 'rgba(52,199,89,0.04)' : '#fff',
                borderColor: isDone ? 'rgba(52,199,89,0.2)' : 'rgba(0,0,0,0.06)',
              }}
            >
              <span
                className="text-[11px] font-bold text-white rounded-lg px-2 py-1.5 min-w-[36px] text-center shrink-0"
                style={{ background: group.color }}
              >
                {group.label}
              </span>
              <div className="flex-1 min-w-0">
                <p
                  className="text-[13px] font-semibold leading-snug"
                  style={{
                    color: isDone ? '#8E8E93' : '#1C1C1E',
                    textDecoration: isDone ? 'line-through' : 'none',
                  }}
                >
                  {action.title}
                </p>
                <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#8E8E93' }}>
                  {action.reason}
                </p>
              </div>
              <button
                onClick={() => onToggle(action.id)}
                className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-colors tap-active"
                style={{
                  borderWidth: '1.5px',
                  borderStyle: 'solid',
                  borderColor: isDone ? '#34C759' : '#C7C7CC',
                  background: isDone ? '#34C759' : '#fff',
                  color: isDone ? '#fff' : 'transparent',
                }}
                aria-label={isDone ? `取消完成：${action.title}` : `标记完成：${action.title}`}
              >
                ✓
              </button>
            </div>
          )
        })
      })}
    </div>
  )
}

// ── Debt Priority Section ─────────────────────────────────────

function DebtPrioritySection({
  topDebts,
  privacyVisible,
}: {
  topDebts: { debt: DebtAccount; assessment: RiskAssessment }[]
  privacyVisible: boolean
}) {
  if (topDebts.length === 0) {
    return <p className="text-[13px] text-center py-4" style={{ color: '#8E8E93' }}>暂无待处理债务</p>
  }

  return (
    <div className="grid gap-2">
      {topDebts.map(({ debt, assessment }, idx) => {
        const reasons = assessment.reasonCodes
          .map(code => RISK_REASON_LABELS[code] || code)
          .filter(Boolean)
        const priorityInfo = PRIORITY_INFO[assessment.priority] || PRIORITY_INFO.P3
        return (
          <div
            key={debt.id}
            className="flex items-start gap-2.5 p-3 rounded-xl"
            style={{ background: '#F7F7F9' }}
          >
            <span
              className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: '#1C1C1E' }}
            >
              {idx + 1}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold" style={{ color: '#1C1C1E' }}>
                {debt.creditorName || '未命名债务'}
              </p>
              <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#6E6E73' }}>
                {reasons.join(' · ')}
              </p>
              {privacyVisible && debt.currentAmountDueFen > 0 && (
                <p className="text-[11px] mt-0.5 font-medium" style={{ color: priorityInfo.color }}>
                  本期应还 ¥{formatFenAsYuan(debt.currentAmountDueFen)}
                </p>
              )}
            </div>
            <span
              className="text-[11px] font-semibold shrink-0 mt-0.5"
              style={{ color: priorityInfo.color }}
            >
              {priorityInfo.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main Dashboard Page ───────────────────────────────────────

export default function DashboardPage({ report }: { report: FullReport | null; activeDebts?: DebtAccount[] }) {
  const navigate = useNavigate()
  const { data, privacyVisible, togglePrivacy, completedActions, toggleActionComplete } = useApp()

  // ── Collapsible sections (02–05) ────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleSection = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── Early exits ──────────────────────────────────────────────
  if (!data.consent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F2F2F7' }}>
        <p className="text-[#8E8E93] mb-6 text-[15px]">请先完成数据录入</p>
        <button onClick={() => navigate('/')} className="apple-btn apple-btn-primary">前往录入</button>
      </div>
    )
  }

  const activeDebtCount = data.debts.filter(d => !d.deletedAt && d.status !== 'closed').length

  if (!report || activeDebtCount === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F2F2F7' }}>
        <p className="text-[#8E8E93] mb-2 text-[15px]">尚未录入债务</p>
        <p className="text-[#8E8E93] mb-6 text-[13px]">录入至少一笔债务即可生成体检报告</p>
        <button onClick={() => navigate('/wizard')} className="apple-btn apple-btn-primary">开始录入债务</button>
      </div>
    )
  }

  // ── Destructure report ───────────────────────────────────────
  const { nowcast, aggregates, riskAssessments, actionPlan, dataQuality, summary, riskWarnings } = report
  const activeDebts = data.debts.filter(d => !d.deletedAt && d.status !== 'closed')

  // ── Risk metrics ─────────────────────────────────────────────
  const p0Count = riskAssessments.filter(a => a.priority === 'P0').length
  const p1Count = riskAssessments.filter(a => a.priority === 'P1').length
  const urgentCount = riskAssessments.filter(a => a.riskLevel === 'urgent').length
  const highCount = riskAssessments.filter(a => a.riskLevel === 'high').length

  const overallRiskLevel: 'urgent' | 'high' | 'medium' | 'low' =
    urgentCount > 0 ? 'urgent' : highCount > 0 ? 'high' : p0Count + p1Count > 0 ? 'medium' : 'low'
  const statusColor = RISK_LEVEL_INFO[overallRiskLevel].color

  // ── 30-day debt due ──────────────────────────────────────────
  const due30dFen = useMemo(() => {
    return nowcast.dailyLedger.slice(0, 30).reduce(
      (s, d) =>
        s +
        d.events
          .filter(e => e.type === 'debt_payment')
          .reduce((ss, ev) => ss + ev.amountFen, 0),
      0
    )
  }, [nowcast.dailyLedger])

  // ── Top action (for conclusion) ──────────────────────────────
  const topAction = report.topAction

  // ── Top debts ────────────────────────────────────────────────
  const topDebts = useMemo(
    () => getTopDebts(riskAssessments, activeDebts, 3),
    [riskAssessments, activeDebts]
  )

  // ── Available cash from profile ──────────────────────────────
  const availableCashFen = data.profile.availableCashFen || 0

  // ── Data quality level ───────────────────────────────────────
  const qualityLabel =
    dataQuality.level === 'precise'
      ? '高完整度，可用于精确决策'
      : dataQuality.level === 'standard'
      ? '标准，可用于初步决策'
      : '初步数据，结论仅供参考'

  return (
    <div className="min-h-screen safe-bottom" style={{ background: '#F2F2F7' }}>
      <div className="max-w-md mx-auto px-4 pt-6 pb-8">

        {/* ── Top navigation (sticky) ─────────────────────────── */}
        <nav
          className="sticky top-0 z-10 -mx-4 px-4 py-3 mb-4"
          style={{
            background: 'rgba(242,242,247,0.85)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex justify-between items-center">
            <button
              onClick={() => navigate('/')}
              className="text-[15px] font-medium"
              style={{ color: '#007AFF' }}
            >
              首页
            </button>
            <h1 className="text-[16px] font-semibold" style={{ color: '#1C1C1E' }}>
              我的体检报告
            </h1>
            <button
              onClick={() => navigate('/wizard')}
              className="text-[13px] px-3 py-1.5 rounded-full"
              style={{ color: '#007AFF', background: 'rgba(0,122,255,0.06)' }}
            >
              修改数据
            </button>
          </div>
        </nav>

        {/* ── Report meta ──────────────────────────────────────── */}
        <p className="text-center text-[11px] mb-4" style={{ color: '#8E8E93' }}>
          已分析 {activeDebtCount} 笔债务　·　数据截止 {data.dataAsOf}
          {dataQuality.score != null && `　·　数据可信度 ${dataQuality.score}%`}
        </p>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  PAPER (white card containing all 6 sections)           */}
        {/* ════════════════════════════════════════════════════════ */}
        <div className="rounded-[18px] overflow-hidden" style={{ background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>

          {/* ── 01 · 你的当前结论 ──────────────────────────────── */}
          <section className="px-5 pt-5 pb-5" style={{ borderBottom: '1px solid #F2F2F7' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                01
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]" style={{ color: '#1C1C1E' }}>
                你的当前结论
              </h2>
            </div>

            {/* Risk pill + privacy toggle */}
            <div className="flex items-center justify-between mb-3">
              <span
                className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2.5 py-1.5 rounded-full"
                style={{ background: `${statusColor}15`, color: statusColor }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: statusColor }}
                />
                风险等级：{RISK_LEVEL_INFO[overallRiskLevel].label}
              </span>
              <button
                onClick={togglePrivacy}
                className="text-[12px] font-medium px-3 py-1.5 rounded-full tap-active"
                style={{ color: '#8E8E93', background: 'rgba(0,0,0,0.04)' }}
                aria-label={privacyVisible ? '隐藏金额' : '显示金额'}
              >
                {privacyVisible ? '隐藏金额' : '点击显示'}
              </button>
            </div>

            {/* Summary text */}
            <p className="text-[15px] leading-relaxed font-medium tracking-[-0.01em] mb-3" style={{ color: '#1C1C1E' }}>
              {summary || '基于当前数据，系统已完成初步分析。'}
            </p>

            {/* Key metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2.5 rounded-xl" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-1" style={{ color: '#8E8E93' }}>可用现金</p>
                <p
                  className={`text-[14px] font-bold ${privacyVisible ? '' : 'amount-masked'}`}
                  style={{ color: '#1C1C1E' }}
                >
                  {privacyVisible ? formatFenAsYuan(availableCashFen) : '****'}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-xl" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-1" style={{ color: '#8E8E93' }}>30天应还</p>
                <p
                  className={`text-[14px] font-bold ${privacyVisible ? '' : 'amount-masked'}`}
                  style={{ color: '#1C1C1E' }}
                >
                  {privacyVisible ? formatFenAsYuan(due30dFen) : '****'}
                </p>
              </div>
              <div className="text-center p-2.5 rounded-xl" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-1" style={{ color: '#8E8E93' }}>缺口日期</p>
                <p
                  className="text-[14px] font-bold"
                  style={{ color: nowcast.firstGapDate ? '#FF9500' : '#34C759' }}
                >
                  {nowcast.firstGapDate || '90天暂无'}
                </p>
              </div>
            </div>
          </section>

          {/* ── 02 · 先做这三件事 ────────────────────────────────── */}
          <section className="px-5 pt-4 pb-5" style={{ borderBottom: '1px solid #F2F2F7' }}>
            <button
              onClick={() => toggleSection('02')}
              className="flex items-center gap-2 mb-3 w-full text-left tap-active"
            >
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                02
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] flex-1" style={{ color: '#1C1C1E' }}>
                先做这三件事
              </h2>
              <span className="text-[12px] transition-transform duration-200" style={{ color: '#8E8E93', transform: collapsed.has('02') ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </button>

            {!collapsed.has('02') && (
            <>
            <ActionSection
              actions={actionPlan}
              completedActions={completedActions}
              onToggle={toggleActionComplete}
              referenceDate={data.dataAsOf}
            />

            {/* Link to full actions page */}
            {actionPlan.length > 0 && (
              <button
                onClick={() => navigate('/actions')}
                className="w-full text-center text-[12px] font-semibold pt-3"
                style={{ color: '#007AFF' }}
              >
                查看完整行动清单 →
              </button>
            )}
            </>
            )}
          </section>

          {/* ── 03 · 未来90天资金变化 ────────────────────────────── */}
          <section className="px-5 pt-4 pb-5" style={{ borderBottom: '1px solid #F2F2F7' }}>
            <button
              onClick={() => toggleSection('03')}
              className="flex items-center gap-2 mb-2 w-full text-left tap-active"
            >
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                03
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] flex-1" style={{ color: '#1C1C1E' }}>
                未来90天资金变化
              </h2>
              <span className="text-[12px] transition-transform duration-200" style={{ color: '#8E8E93', transform: collapsed.has('03') ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </button>

            {!collapsed.has('03') && (
            <>
            {/* Subtitle */}
            <p className="text-[12px] mb-3 leading-relaxed" style={{ color: '#8E8E93' }}>
              {nowcast.firstGapDate
                ? `按当前数据，${nowcast.firstGapDate} 余额首次转负。${
                    nowcast.worstDay
                      ? `${nowcast.worstDay.date} 是现金流最紧张的一天。`
                      : ''
                  }`
                : '按当前数据，90天内未出现资金缺口。'}
            </p>

            {/* Cashflow sparkline */}
            <CashflowSparkline
              dailyLedger={nowcast.dailyLedger}
              safetyThresholdFen={nowcast.safetyThresholdFen}
              firstGapDate={nowcast.firstGapDate}
            />

            {/* Summary metrics */}
            <div className="grid grid-cols-3 gap-2 mt-3">
              <div className="text-center p-2 rounded-lg" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#8E8E93' }}>总负债</p>
                <p
                  className="text-[13px] font-bold"
                  style={{ color: '#1C1C1E' }}
                >
                  {privacyVisible ? formatFenAsYuan(aggregates.totalDebtPrincipalFen) : '****'}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#8E8E93' }}>月度结余</p>
                <p
                  className="text-[13px] font-bold"
                  style={{ color: aggregates.monthlyBalanceFen < 0 ? '#FF3B30' : '#34C759' }}
                >
                  {privacyVisible
                    ? (aggregates.monthlyBalanceFen < 0 ? '-' : '') +
                      formatFenAsYuan(Math.abs(aggregates.monthlyBalanceFen))
                    : '****'}
                </p>
              </div>
              <div className="text-center p-2 rounded-lg" style={{ background: '#F6F6F8' }}>
                <p className="text-[10px] mb-0.5" style={{ color: '#8E8E93' }}>首次缺口</p>
                <p
                  className="text-[13px] font-bold"
                  style={{ color: nowcast.firstGapDate ? '#FF9500' : '#34C759' }}
                >
                  {nowcast.firstGapDate || '暂无'}
                </p>
              </div>
            </div>

            {/* Link to full cashflow */}
            <button
              onClick={() => navigate('/cashflow')}
              className="w-full text-center text-[12px] font-semibold pt-3"
              style={{ color: '#007AFF' }}
            >
              查看每日明细 →
            </button>
            </>
            )}
          </section>

          {/* ── 04 · 债务处理顺序 ────────────────────────────────── */}
          <section className="px-5 pt-4 pb-5" style={{ borderBottom: '1px solid #F2F2F7' }}>
            <button
              onClick={() => toggleSection('04')}
              className="flex items-center gap-2 mb-3 w-full text-left tap-active"
            >
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                04
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] flex-1" style={{ color: '#1C1C1E' }}>
                债务处理顺序
              </h2>
              <span className="text-[12px] transition-transform duration-200" style={{ color: '#8E8E93', transform: collapsed.has('04') ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </button>

            {!collapsed.has('04') && (
            <>
            {topDebts.length === 0 ? (
              <p className="text-[13px] text-center py-4" style={{ color: '#8E8E93' }}>
                暂无风险评估数据
              </p>
            ) : (
              <>
                <p className="text-[12px] mb-3 leading-relaxed" style={{ color: '#8E8E93' }}>
                  按紧急程度排序，优先处理以下债务。完整排序请查看风险页面。
                </p>
                <DebtPrioritySection topDebts={topDebts} privacyVisible={privacyVisible} />
              </>
            )}

            {riskAssessments.length > 0 && (
              <button
                onClick={() => navigate('/risk')}
                className="w-full text-center text-[12px] font-semibold pt-3"
                style={{ color: '#007AFF' }}
              >
                查看完整风险顺序 →
              </button>
            )}
            </>
            )}
          </section>

          {/* ── 05 · 系统为什么这样判断 ────────────────────────────── */}
          <section className="px-5 pt-4 pb-5" style={{ borderBottom: '1px solid #F2F2F7' }}>
            <button
              onClick={() => toggleSection('05')}
              className="flex items-center gap-2 mb-3 w-full text-left tap-active"
            >
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                05
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em] flex-1" style={{ color: '#1C1C1E' }}>
                系统为什么这样判断
              </h2>
              <span className="text-[12px] transition-transform duration-200" style={{ color: '#8E8E93', transform: collapsed.has('05') ? 'rotate(-90deg)' : 'rotate(0deg)' }}>
                ▼
              </span>
            </button>

            {!collapsed.has('05') && (
            <>
            {/* Risk warnings */}
            {riskWarnings.length > 0 && (
              <div className="grid gap-2 mb-3">
                {riskWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                      style={{
                        background:
                          w.code === 'FORECAST_NEGATIVE' || w.code === 'URGENT_DEBTS_EXIST'
                            ? '#FF3B30'
                            : w.code === 'DATA_INCOMPLETE'
                            ? '#FF9500'
                            : '#8E8E93',
                      }}
                    />
                    <div>
                      <p className="text-[13px] font-semibold" style={{ color: '#1C1C1E' }}>
                        {w.code === 'FORECAST_NEGATIVE'
                          ? '预测期内现金流将转负'
                          : w.code === 'URGENT_DEBTS_EXIST'
                          ? `${urgentCount} 笔债务处于紧急状态`
                          : w.code === 'DATA_INCOMPLETE'
                          ? '部分数据缺失'
                          : w.code}
                      </p>
                      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: '#6E6E73' }}>
                        {w.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Financial ledger */}
            <div className="grid grid-cols-2 gap-px rounded-xl overflow-hidden" style={{ background: '#E5E5EA', border: '1px solid #E5E5EA' }}>
              <LedgerItem label="月收入" value={aggregates.totalMonthlyIncomeFen} visible={privacyVisible} />
              <LedgerItem label="基本生活支出" value={aggregates.totalMonthlyExpenseFen} visible={privacyVisible} />
              <LedgerItem label="月债务还款" value={aggregates.totalMonthlyDebtFen} visible={privacyVisible} />
              <LedgerItem label="当前可用现金" value={availableCashFen} visible={privacyVisible} />
              <LedgerItem label="总债务本金" value={aggregates.totalDebtPrincipalFen} visible={privacyVisible} />
              <LedgerItem
                label="债务收入比"
                displayValue={`${Math.round(aggregates.dti)}%`}
                valueColor={aggregates.dti > 70 ? '#FF3B30' : aggregates.dti > 40 ? '#FF9500' : '#34C759'}
              />
              {aggregates.hasAnyOverdue && (
                <LedgerItem
                  label="最长逾期"
                  displayValue={`${aggregates.maxOverdueDays} 天`}
                  valueColor="#FF3B30"
                />
              )}
              {aggregates.platformCount > 0 && (
                <LedgerItem
                  label="涉及平台"
                  displayValue={`${aggregates.platformCount} 个`}
                />
              )}
            </div>

            {!riskWarnings.length && (
              <p className="text-[12px] text-center mt-3" style={{ color: '#8E8E93' }}>
                基于当前数据，系统通过规则引擎（R01-R08）评估风险等级和优先级。
              </p>
            )}
            </>
            )}
          </section>

          {/* ── 06 · 数据可信度与待确认项 ──────────────────────────── */}
          <section className="px-5 pt-4 pb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-extrabold tracking-wider" style={{ color: '#007AFF' }}>
                06
              </span>
              <h2 className="text-[17px] font-semibold tracking-[-0.02em]" style={{ color: '#1C1C1E' }}>
                数据可信度与待确认项
              </h2>
            </div>

            {/* Quality score */}
            <div className="flex items-center justify-between mb-1">
              <div>
                <p className="text-[14px] font-semibold" style={{ color: '#1C1C1E' }}>
                  本次报告可信度
                </p>
                <p className="text-[11px]" style={{ color: '#8E8E93' }}>
                  {qualityLabel}
                </p>
              </div>
              <span
                className="text-[22px] font-extrabold"
                style={{
                  color:
                    dataQuality.level === 'precise'
                      ? '#34C759'
                      : dataQuality.level === 'standard'
                      ? '#007AFF'
                      : '#FF9500',
                }}
              >
                {dataQuality.score}%
              </span>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full mb-3" style={{ background: '#E9E9ED' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${dataQuality.score}%`,
                  background:
                    dataQuality.level === 'precise'
                      ? '#34C759'
                      : dataQuality.level === 'standard'
                      ? '#007AFF'
                      : '#FF9500',
                }}
              />
            </div>

            {/* Missing items */}
            {dataQuality.missing.length > 0 ? (
              <>
                <p className="text-[12px] mb-2" style={{ color: '#8E8E93' }}>
                  以下信息待确认，补全后结论可能更准确：
                </p>
                <div className="grid gap-1.5">
                  {dataQuality.missing.map(item => (
                    <div
                      key={item.id}
                      className="text-[12px] flex items-start gap-2"
                      style={{ color: '#6E6E73' }}
                    >
                      <span className="shrink-0 mt-0.5" style={{ color: '#8E8E93' }}>○</span>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-[12px]" style={{ color: '#34C759' }}>
                关键数据已较为完整，当前报告可用于决策参考。
              </p>
            )}

            {/* Link to wizard */}
            {(dataQuality.level === 'preliminary' || dataQuality.missing.length > 0) && (
              <button
                onClick={() => navigate('/wizard')}
                className="w-full text-center text-[12px] font-semibold pt-3"
                style={{ color: '#007AFF' }}
              >
                继续补全并更新报告 →
              </button>
            )}
          </section>
        </div>

        {/* ════════════════════════════════════════════════════════ */}
        {/*  NOTICE & FOOTER (preserved from original)               */}
        {/* ════════════════════════════════════════════════════════ */}
        <p
          className="text-[10px] text-center px-3 py-3 leading-relaxed"
          style={{ color: '#8E8E93' }}
        >
          本报告仅基于用户提交并确认的数据生成，仅用于信息整理和决策参考，不构成法律、财务或征信处理意见。涉及还款方案、债务协商、征信异议或法律事项时，建议咨询具备相应资质的专业人士或有关机构。
        </p>

        {/* Footer — matching original layout exactly */}
        <div className="text-center space-y-1 pb-4">
          <button
            onClick={() => navigate('/settings')}
            className="text-[13px]"
            style={{ color: '#8E8E93' }}
          >
            设置
          </button>
          <p className="text-[11px]" style={{ color: '#C7C7CC' }}>
            数据截止 {data.dataAsOf} · PFOS 债务体检
          </p>
        </div>

      </div>
    </div>
  )
}

// ── Small helper component: ledger grid item ──────────────────

function LedgerItem({
  label,
  value,
  visible,
  displayValue,
  valueColor,
}: {
  label: string
  value?: number
  visible?: boolean
  displayValue?: string
  valueColor?: string
}) {
  return (
    <div className="bg-white p-2.5">
      <p className="text-[10px]" style={{ color: '#8E8E93' }}>
        {label}
      </p>
      <p
        className={`text-[13px] font-bold mt-1 ${visible === false ? '' : ''}`}
        style={{ color: valueColor || '#1C1C1E' }}
      >
        {displayValue != null
          ? displayValue
          : value != null && visible
          ? formatFenAsYuan(value)
          : '****'}
      </p>
    </div>
  )
}
