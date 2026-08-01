import { useNavigate } from 'react-router-dom'
import { formatFenAsYuan } from '../domain/money'
import { RISK_REASON_LABELS, RISK_LEVEL_INFO, PRIORITY_INFO, DEBT_TYPE_LABELS } from '../domain/constants'
import StickyHeader from '../components/StickyHeader'
import type { FullReport } from '../engine/report'
import type { DebtAccount } from '../domain/types'

export default function RiskPage({ report, activeDebts }: { report: FullReport | null; activeDebts: DebtAccount[] }) {
  const navigate = useNavigate()

  if (!report || report.riskAssessments.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">请先录入债务以查看风险评估。</p>
      </div>
    )
  }

  const { riskAssessments, riskWarnings, dataQuality } = report

  // Sort assessments by priority
  const sorted = [...riskAssessments].sort((a, b) =>
    ['P0', 'P1', 'P2', 'P3'].indexOf(a.priority) - ['P0', 'P1', 'P2', 'P3'].indexOf(b.priority)
  )

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <StickyHeader title="风险与优先级" />

      {/* Data quality */}
      <div className={`rounded-xl p-3 border ${
        dataQuality.isPrecise ? 'bg-green-50 border-green-200' :
        dataQuality.level === 'standard' ? 'bg-blue-50 border-blue-200' :
        'bg-amber-50 border-amber-200'
      }`}>
        <p className="text-xs font-medium">
          数据完整度：{dataQuality.label}（{dataQuality.score}分）
        </p>
        <p className="text-xs text-pfos-text-muted mt-1">{dataQuality.explanation}</p>
        {dataQuality.missing.length > 0 && (
          <ul className="mt-2 space-y-0.5">
            {dataQuality.missing.map(m => (
              <li key={m.id} className="text-xs text-amber-700">• {m.label}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Warnings */}
      {riskWarnings.length > 0 && (
        <div className="space-y-2">
          {riskWarnings.map((w, i) => (
            <div key={i} className="bg-pfos-urgent/5 rounded-lg p-3 border border-pfos-urgent/20">
              <p className="text-xs text-pfos-urgent">⚠️ {w.message}</p>
            </div>
          ))}
        </div>
      )}

      {/* Disclaimer */}
      <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
        <p className="text-xs text-pfos-text-muted">
          这是基于你提供的数据生成的处理优先级，不是法律或金融建议。你可以查看依据并调整计划。
        </p>
      </div>

      {/* Assessment list */}
      <div className="space-y-3">
        {sorted.map(assessment => {
          const debtData = activeDebts.find(d => d.id === assessment.debtId)
          const pInfo = PRIORITY_INFO[assessment.priority]
          const rInfo = RISK_LEVEL_INFO[assessment.riskLevel]

          return (
            <div
              key={assessment.debtId}
              onClick={() => navigate(`/debts/${assessment.debtId}`)}
              className="bg-pfos-surface rounded-xl p-4 border border-pfos-border tap-active cursor-pointer"
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{ backgroundColor: pInfo.color }}
                  >
                    {assessment.priority}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-pfos-text">{debtData?.creditorName || '未知债务'}</p>
                    <p className="text-xs text-pfos-text-muted">
                      ¥{debtData ? formatFenAsYuan(debtData.currentAmountDueFen) : '?'} · {debtData?.nextDueDate || '?'}
                    </p>
                    <p className="text-xs" style={{ color: rInfo.color }}>{rInfo.label}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
                {assessment.reasonCodes.map(code => (
                  <span key={code} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-pfos-text-muted">
                    {RISK_REASON_LABELS[code] || code}
                  </span>
                ))}
              </div>

              {assessment.requiresHumanVerification && (
                <p className="text-xs text-amber-600 mt-2">需要人工核实</p>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs text-pfos-text-muted text-center">
        规则版本：{report.ruleVersion} · 可查看每项结果的具体依据
      </p>
    </div>
  )
}
