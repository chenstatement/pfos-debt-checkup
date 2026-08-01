import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatFenAsYuan } from '../domain/money'
import type { FullReport } from '../engine/report'

export default function DashboardPage({ report }: { report: FullReport | null; activeDebts?: any[] }) {
  const navigate = useNavigate()
  const { data } = useApp()
  const [showAmounts, setShowAmounts] = useState(false)

  if (!data.consent) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F2F2F7' }}>
        <p className="text-[#8E8E93] mb-6 text-[15px]">请先完成数据录入</p>
        <button onClick={() => navigate('/')} className="apple-btn apple-btn-primary">前往录入</button>
      </div>
    )
  }

  if (!report || data.debts.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F2F2F7' }}>
        <p className="text-[#8E8E93] mb-2 text-[15px]">尚未录入债务</p>
        <p className="text-[#8E8E93] mb-6 text-[13px]">录入至少一笔债务即可生成体检报告</p>
        <button onClick={() => navigate('/wizard')} className="apple-btn apple-btn-primary">开始录入债务</button>
      </div>
    )
  }

  const { nowcast, aggregates, riskAssessments, topAction, summary } = report
  const totalDebtFen = aggregates.totalDebtPrincipalFen
  const overdueCount = aggregates.overdueCount
  const urgentCount = riskAssessments.filter(a => a.riskLevel === 'urgent').length
  const highCount = riskAssessments.filter(a => a.riskLevel === 'high').length
  const statusColor = urgentCount > 0 ? '#FF3B30' : highCount > 0 ? '#FF9500' : '#34C759'
  const statusLabel = urgentCount > 0 ? '需要立即关注' : highCount > 0 ? '建议尽快处理' : '状态可控'

  return (
    <div className="min-h-screen safe-bottom" style={{ background: '#F2F2F7' }}>
      <div className="max-w-md mx-auto px-5 pt-8 pb-8 space-y-6">

        {/* Top nav — frozen */}
        <div className="sticky top-0 z-10 safe-top -mx-5 px-5 py-3"
             style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <div className="flex justify-between items-center">
            <button onClick={() => navigate('/')} className="text-[15px] font-medium" style={{ color: '#007AFF' }}>首页</button>
            <h1 className="text-[16px] font-semibold text-[#1C1C1E]">我的债务报告</h1>
            <button onClick={() => navigate('/wizard')} className="text-[13px] px-3 py-1.5 rounded-full" style={{ color: '#007AFF', background: 'rgba(0,122,255,0.06)' }}>修改数据</button>
          </div>
        </div>

        {/* Hero */}
        <div className="text-center pt-2 pb-2">
          <p className="text-[13px] font-medium mb-2" style={{ color: '#8E8E93' }}>总负债</p>
          <p className="text-5xl font-bold tracking-tight mb-2"
             style={{ letterSpacing: '-0.03em', color: showAmounts ? '#1C1C1E' : 'transparent',
                      textShadow: showAmounts ? 'none' : '0 0 24px rgba(0,0,0,0.3)' }}
             onClick={() => setShowAmounts(!showAmounts)}>
            {showAmounts ? formatFenAsYuan(totalDebtFen) : '****'}
          </p>
          <p className="text-[13px] font-medium" style={{ color: statusColor }}>{statusLabel}</p>
          {overdueCount > 0 && <p className="text-xs mt-1" style={{ color: '#8E8E93' }}>{overdueCount} 笔已逾期</p>}
          <button onClick={() => setShowAmounts(!showAmounts)} className="text-xs mt-3 px-4 py-1.5 rounded-full" style={{ color: '#8E8E93', background: 'rgba(0,0,0,0.04)' }}>{showAmounts ? '隐藏金额' : '点击显示'}</button>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="apple-card text-center py-4 px-2">
            <p className="text-[11px] mb-1" style={{ color: '#8E8E93' }}>可用现金</p>
            <p className="text-[15px] font-semibold tracking-tight" style={{ color: '#1C1C1E' }}>
              {showAmounts ? formatFenAsYuan(data.profile.availableCashFen || 0) : '***'}
            </p>
          </div>
          <div className="apple-card text-center py-4 px-2">
            <p className="text-[11px] mb-1" style={{ color: '#8E8E93' }}>30天应还</p>
            <p className="text-[15px] font-semibold tracking-tight" style={{ color: '#1C1C1E' }}>
              {showAmounts ? formatFenAsYuan(
                nowcast.dailyLedger.slice(0, 30).reduce((s: number, d: any) =>
                  s + d.events.filter((e: any) => e.type === 'debt_payment').reduce((ss: number, ev: any) => ss + ev.amountFen, 0), 0)
              ) : '***'}
            </p>
          </div>
          <div className="apple-card text-center py-4 px-2">
            <p className="text-[11px] mb-1" style={{ color: '#8E8E93' }}>缺口日期</p>
            <p className="text-[15px] font-semibold tracking-tight" style={{ color: nowcast.firstGapDate ? '#FF9500' : '#34C759' }}>
              {nowcast.firstGapDate || '90天暂无'}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: '债务清单', path: '/debts', icon: '📋' },
            { label: '现金流预测', path: '/cashflow', icon: '📈' },
            { label: '行动计划', path: '/actions', icon: '✅' },
            { label: '风险详情', path: '/risk', icon: '⚠️' },
            { label: '体检报告', path: '/report', icon: '📄' },
            { label: '周度复盘', path: '/weekly-review', icon: '📝' },
          ].map(n => (
            <button key={n.path} onClick={() => navigate(n.path)}
                    className="apple-card text-center py-3 tap-active">
              <p className="text-xl mb-1">{n.icon}</p>
              <p className="text-[11px] font-medium" style={{ color: '#1C1C1E' }}>{n.label}</p>
            </button>
          ))}
        </div>

        {/* Top action */}
        {topAction && (
          <div className="apple-card" style={{ borderLeft: '4px solid #007AFF' }}>
            <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#007AFF' }}>下一步</p>
            <p className="text-[15px] font-semibold" style={{ color: '#1C1C1E' }}>{topAction.title}</p>
            <p className="text-[13px] mt-1 leading-relaxed" style={{ color: '#8E8E93' }}>{topAction.reason}</p>
          </div>
        )}

        {/* Summary */}
        <div className="apple-card">
          <p className="text-[11px] font-semibold mb-1.5" style={{ color: '#8E8E93' }}>财务摘要</p>
          <p className="text-[14px] leading-relaxed" style={{ color: '#6E6E73' }}>{summary}</p>
        </div>

        {/* Footer */}
        <div className="text-center space-y-1">
          <button onClick={() => navigate('/settings')} className="text-[13px]" style={{ color: '#8E8E93' }}>设置</button>
          <p className="text-[11px]" style={{ color: '#C7C7CC' }}>数据截止 {data.dataAsOf} · PFOS 债务体检</p>
        </div>

      </div>
    </div>
  )
}
