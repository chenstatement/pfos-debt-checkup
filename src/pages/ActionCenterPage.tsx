import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { PRIORITY_INFO, ACTION_CODE_LABELS } from '../domain/constants'
import type { FullReport } from '../engine/report'

export default function ActionCenterPage({ report }: { report: FullReport | null }) {
  const navigate = useNavigate()
  const { completedActions, toggleActionComplete } = useApp()

  if (!report || report.actionPlan.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">请先完成数据录入以生成行动清单。</p>
      </div>
    )
  }

  const sortedActions = [...report.actionPlan].sort((a, b) =>
    ['P0', 'P1', 'P2', 'P3'].indexOf(a.priority) - ['P0', 'P1', 'P2', 'P3'].indexOf(b.priority)
  )

  const activeActions = sortedActions.filter(a => !completedActions.includes(a.id))
  const doneActions = sortedActions.filter(a => completedActions.includes(a.id))

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/dashboard')} className="text-sm text-pfos-text-muted">← 返回</button>
      <h1 className="text-lg font-bold text-pfos-text">行动中心</h1>

      {/* Top action — highlighted */}
      {report.topAction && !completedActions.includes(report.topAction.id) && (
        <div className="bg-pfos-urgent/5 rounded-xl p-4 border-2 border-pfos-urgent/30">
          <p className="text-xs text-pfos-urgent font-semibold mb-1">🔴 当前最重要行动</p>
          <p className="text-sm font-bold text-pfos-text">{report.topAction.title}</p>
          <p className="text-xs text-pfos-text-muted mt-1">{report.topAction.reason}</p>
          {report.topAction.steps.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {report.topAction.steps.map((step, i) => (
                <li key={i} className="text-xs text-pfos-text-muted flex gap-1">
                  <span className="text-pfos-accent">•</span> {step}
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => toggleActionComplete(report.topAction!.id)}
            className="mt-3 w-full py-2 bg-pfos-low text-white rounded-lg text-sm font-medium tap-active"
          >
            ✓ 标记为已完成
          </button>
        </div>
      )}

      {/* Active actions */}
      {activeActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-pfos-text">待处理 ({activeActions.length})</h2>
          {activeActions.map(action => {
            const pInfo = PRIORITY_INFO[action.priority]
            return (
              <div key={action.id} className="bg-pfos-surface rounded-xl p-3 border border-pfos-border">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold"
                        style={{ backgroundColor: pInfo.color }}
                      >
                        {action.priority}
                      </span>
                      <span className="text-xs text-pfos-text-muted">
                        {ACTION_CODE_LABELS[action.actionCode] || action.actionCode}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-pfos-text mt-1">{action.title}</p>
                    <p className="text-xs text-pfos-text-muted mt-0.5">{action.reason}</p>
                  </div>
                </div>
                {action.steps.length > 0 && (
                  <ul className="mt-2 ml-4 space-y-0.5">
                    {action.steps.map((step, i) => (
                      <li key={i} className="text-xs text-pfos-text-muted list-disc">{step}</li>
                    ))}
                  </ul>
                )}
                <button
                  onClick={() => toggleActionComplete(action.id)}
                  className="mt-2 text-xs text-pfos-low font-medium"
                >
                  ✓ 完成
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Completed actions */}
      {doneActions.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-pfos-text-muted">已完成 ({doneActions.length})</h2>
          {doneActions.map(action => (
            <div key={action.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 opacity-60">
              <p className="text-sm text-pfos-text-muted line-through">{action.title}</p>
            </div>
          ))}
        </div>
      )}

      {activeActions.length === 0 && doneActions.length > 0 && (
        <div className="text-center py-8">
          <p className="text-pfos-low font-medium">👍 所有行动已完成</p>
          <p className="text-xs text-pfos-text-muted mt-1">继续保持按时记录和还款，定期查看新的行动建议。</p>
        </div>
      )}
    </div>
  )
}
