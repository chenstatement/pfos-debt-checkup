import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatFenAsYuan } from '../domain/money'
import { useApp } from '../store/AppContext'
import type { FullReport } from '../engine/report'

export default function WeeklyReviewPage({ report }: { report: FullReport | null }) {
  const navigate = useNavigate()
  const { data, weeklyNotes, saveWeeklyNotes } = useApp()

  // Get current week
  const weekInfo = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay() || 7 // Sunday = 7
    const monday = new Date(now)
    monday.setDate(now.getDate() - dayOfWeek + 1)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    }
  }, [])

  // Upcoming debt payments this week
  const upcomingPayments = useMemo(() => {
    if (!report) return []
    const thisWeek = report.nowcast.dailyLedger.filter(d =>
      d.date >= weekInfo.start && d.date <= weekInfo.end
    )
    return thisWeek.filter(d => d.outflowFen > 0)
  }, [report, weekInfo])

  if (!report) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">请先完成数据录入以查看周度复盘。</p>
      </div>
    )
  }

  const { nowcast, aggregates } = report

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/dashboard')} className="text-sm text-pfos-text-muted">← 返回</button>
      <h1 className="text-lg font-bold text-pfos-text">
        周度复盘 ({weekInfo.start} ~ {weekInfo.end})
      </h1>

      {/* Weekly summary */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-3">本周财务概览</h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-pfos-text-muted">预计本周还款</p>
            <p className="font-bold text-pfos-text">
              ¥{formatFenAsYuan(upcomingPayments.reduce((s, d) => s + d.outflowFen, 0))}
            </p>
          </div>
          <div>
            <p className="text-xs text-pfos-text-muted">当前可用现金</p>
            <p className="font-bold text-pfos-text">
              ¥{formatFenAsYuan(nowcast.startingCashFen)}
            </p>
          </div>
        </div>
      </div>

      {/* Next 3 financial events */}
      {upcomingPayments.length > 0 && (
        <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
          <h3 className="text-sm font-semibold text-pfos-text mb-2">本周财务事件</h3>
          <div className="space-y-2">
            {upcomingPayments.slice(0, 5).map((day, i) => (
              <div key={i} className="flex justify-between text-xs">
                <span className="text-pfos-text">{day.date}</span>
                <span className="text-pfos-high font-medium">-¥{formatFenAsYuan(day.outflowFen)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top priority for next week */}
      {report.topAction && (
        <div className="bg-pfos-accent/5 rounded-xl p-4 border border-pfos-accent/20">
          <h3 className="text-sm font-semibold text-pfos-text mb-1">下周优先行动</h3>
          <p className="text-sm text-pfos-text">{report.topAction.title}</p>
        </div>
      )}

      {/* Stale data check */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">数据新鲜度</h3>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">数据截止日期</span>
            <span className="text-pfos-text">{data.dataAsOf}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">最后更新</span>
            <span className="text-pfos-text">{data.lastUpdated ? new Date(data.lastUpdated).toLocaleDateString('zh-CN') : '未知'}</span>
          </div>
          {data.debts.some(d => d.dataConfidence === 'unknown') && (
            <p className="text-amber-600 mt-2">⚠️ 部分债务数据标记为"未知"，建议尽快核实</p>
          )}
        </div>
      </div>

      {/* User notes */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">本周备注</h3>
        <textarea
          value={weeklyNotes}
          onChange={e => saveWeeklyNotes(e.target.value)}
          placeholder="实际收支变化、与预测的差异、需要调整的数据等..."
          rows={3}
          className="w-full text-sm border border-pfos-border rounded-lg px-3 py-2 resize-none"
        />
      </div>

      {/* Disclaimer */}
      <p className="text-xs text-pfos-text-muted text-center">
        以上信息仅供个人参考，不构成任何形式的财务建议。请基于实际情况作出判断。
      </p>
    </div>
  )
}
