import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatFenAsYuan } from '../domain/money'
import { useApp } from '../store/AppContext'
import { DEBT_TYPE_LABELS, RISK_LEVEL_INFO } from '../domain/constants'
import type { FullReport } from '../engine/report'

export default function ReportPage({ report }: { report: FullReport | null }) {
  const navigate = useNavigate()
  const { data } = useApp()
  const [hideNames, setHideNames] = useState(false)

  if (!report) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">请先完成数据录入以查看财务体检报告。</p>
      </div>
    )
  }

  const { aggregates, riskAssessments } = report
  const activeDebts = data.debts.filter(d => !d.deletedAt)

  const handleExport = () => {
    const reportData = {
      title: 'PFOS 个人财务体检报告',
      generatedAt: report.generatedAt,
      dataAsOf: data.dataAsOf,
      ruleVersion: report.ruleVersion,
      disclaimer: '本报告仅为个人财务信息整理结果，不构成金融建议、法律服务或征信报告。请咨询专业人士获取针对性建议。',
      summary: report.summary,
      availableCash: formatFenAsYuan(data.profile.availableCashFen || 0),
      totalDebt: formatFenAsYuan(aggregates.totalDebtPrincipalFen),
      debtCount: activeDebts.length,
      overdueCount: aggregates.overdueCount,
      debts: activeDebts.map(d => ({
        name: hideNames ? '[已隐藏]' : d.creditorName,
        type: DEBT_TYPE_LABELS[d.debtType],
        principal: formatFenAsYuan(d.outstandingPrincipalFen),
        dueAmount: formatFenAsYuan(d.currentAmountDueFen),
        dueDate: d.nextDueDate,
        status: d.status,
        risk: riskAssessments.find(a => a.debtId === d.id)?.riskLevel || 'unknown',
        priority: riskAssessments.find(a => a.debtId === d.id)?.priority || '',
      })),
    }

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PFOS_report_${data.dataAsOf}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const riskSummary = {
    urgent: riskAssessments.filter(a => a.riskLevel === 'urgent').length,
    high: riskAssessments.filter(a => a.riskLevel === 'high').length,
    medium: riskAssessments.filter(a => a.riskLevel === 'medium').length,
    low: riskAssessments.filter(a => a.riskLevel === 'low').length,
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate('/dashboard')} className="text-sm text-pfos-text-muted">← 返回</button>
      <h1 className="text-lg font-bold text-pfos-text">财务体检报告</h1>
        <button onClick={handleExport} className="text-xs bg-pfos-accent text-white px-3 py-1.5 rounded-lg font-medium">
          导出报告
        </button>
      </div>

      <p className="text-xs text-pfos-text-muted">
        报告生成时间：{report.generatedAt} · 规则版本：{report.ruleVersion}
      </p>

      {/* Summary */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">财务摘要</h3>
        <p className="text-sm text-pfos-text leading-relaxed">{report.summary}</p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-pfos-surface rounded-xl p-3 border border-pfos-border">
          <p className="text-xs text-pfos-text-muted">总负债</p>
          <p className="text-lg font-bold text-pfos-text">¥{formatFenAsYuan(aggregates.totalDebtPrincipalFen)}</p>
        </div>
        <div className="bg-pfos-surface rounded-xl p-3 border border-pfos-border">
          <p className="text-xs text-pfos-text-muted">债务笔数</p>
          <p className="text-lg font-bold text-pfos-text">{activeDebts.length}</p>
        </div>
        <div className="bg-pfos-surface rounded-xl p-3 border border-pfos-border">
          <p className="text-xs text-pfos-text-muted">逾期笔数</p>
          <p className="text-lg font-bold text-pfos-urgent">{aggregates.overdueCount}</p>
        </div>
        <div className="bg-pfos-surface rounded-xl p-3 border border-pfos-border">
          <p className="text-xs text-pfos-text-muted">债务收入比(DTI)</p>
          <p className="text-lg font-bold text-pfos-text">{Math.round(aggregates.dti)}%</p>
        </div>
      </div>

      {/* Risk summary */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">风险分布</h3>
        <div className="flex gap-2">
          {Object.entries(riskSummary).map(([level, count]) => {
            const info = RISK_LEVEL_INFO[level]
            return (
              <div key={level} className="flex-1 text-center p-2 rounded-lg" style={{ backgroundColor: info.color + '15' }}>
                <p className="text-lg font-bold" style={{ color: info.color }}>{count}</p>
                <p className="text-[10px]" style={{ color: info.color }}>{info.label}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Debt details */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-sm font-semibold text-pfos-text">债务明细</h3>
          <button
            onClick={() => setHideNames(!hideNames)}
            className="text-[10px] text-pfos-text-muted underline"
          >
            {hideNames ? '显示名称' : '隐藏名称'}
          </button>
        </div>
        <div className="space-y-2">
          {activeDebts.map(debt => {
            const a = riskAssessments.find(ra => ra.debtId === debt.id)
            return (
              <div key={debt.id} className="flex justify-between items-center text-xs py-1.5 border-b border-gray-50">
                <div className="flex-1">
                  <span className="text-pfos-text font-medium">{hideNames ? '***' : debt.creditorName}</span>
                  <span className="text-pfos-text-muted ml-1">{DEBT_TYPE_LABELS[debt.debtType]}</span>
                </div>
                <span className="text-pfos-text">¥{formatFenAsYuan(debt.outstandingPrincipalFen)}</span>
                {a && (
                  <span className="ml-2 text-[10px] font-medium" style={{ color: RISK_LEVEL_INFO[a.riskLevel]?.color }}>
                    {a.priority}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
        <p className="text-xs text-amber-700 leading-relaxed">
          <strong>重要声明：</strong>本报告仅为个人财务信息整理结果。不构成金融建议、法律服务、征信报告或投资推荐。
          报告基于用户自行录入的数据，不保证绝对准确。报告生成时间：{report.generatedAt}，数据截止：{data.dataAsOf}。
        </p>
      </div>
    </div>
  )
}
