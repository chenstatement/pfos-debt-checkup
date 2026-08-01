import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import StickyHeader from '../components/StickyHeader'
import { formatFenAsYuan } from '../domain/money'
import { DEBT_TYPE_LABELS } from '../domain/constants'
import { sortDebtsByPriority } from '../engine/debtPriority'
import { generateFullReport } from '../engine/report'
import type { DebtAccount } from '../domain/types'

export default function DebtListPage() {
  const navigate = useNavigate()
  const { data, archiveDebt } = useApp()
  const [showAmounts, setShowAmounts] = useState(false)

  const activeDebts = data.debts.filter(d => !d.deletedAt)
  const archivedDebts = data.debts.filter(d => d.deletedAt)

  // Generate report for assessment data
  const report = activeDebts.length > 0 ? generateFullReport({
    profile: data.profile,
    incomes: data.incomes,
    expenses: data.expenses,
    debts: activeDebts,
    startDate: data.dataAsOf,
  }) : null

  const assessments = report?.riskAssessments || []
  const sortedDebts = assessments.length > 0
    ? sortDebtsByPriority(activeDebts, assessments)
    : activeDebts.map(d => ({ ...d, assessment: null as any, _sortKey: 999 }))

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-3">
      <StickyHeader title="债务台账" />
      <div className="flex justify-between items-center">
        <h1 className="text-lg font-bold text-pfos-text">债务台账</h1>
        <button onClick={() => navigate('/wizard')} className="text-sm text-pfos-accent font-medium">
          + 新增
        </button>
      </div>

      <button
        onClick={() => setShowAmounts(!showAmounts)}
        className={`text-xs px-3 py-1 rounded-full self-start ${showAmounts ? 'bg-pfos-urgent/10 text-pfos-urgent' : 'bg-gray-100 text-pfos-text-muted'}`}
      >
        {showAmounts ? '隐藏金额' : '显示金额'}
      </button>

      {sortedDebts.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-pfos-text-muted">暂无债务记录</p>
          <button onClick={() => navigate('/wizard')} className="mt-3 text-pfos-accent font-medium text-sm">开始录入债务</button>
        </div>
      ) : (
        sortedDebts.map((debt: any) => (
          <div
            key={debt.id}
            onClick={() => navigate(`/debts/${debt.id}`)}
            className="apple-card cursor-pointer tap-active space-y-1.5"
          >
            {/* Row 1: Name + type + priority */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[15px] font-semibold text-[#1C1C1E]">{debt.creditorName}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.04)', color: '#8E8E93' }}>
                  {DEBT_TYPE_LABELS[debt.debtType] || debt.debtType}
                </span>
                {debt.status === 'overdue' && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>逾期</span>
                )}
              </div>
              {debt.assessment && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-bold text-white shrink-0 ml-2" style={{
                  background: debt.assessment.priority === 'P0' ? '#FF3B30' :
                    debt.assessment.priority === 'P1' ? '#FF9500' :
                    debt.assessment.priority === 'P2' ? '#007AFF' : '#34C759'
                }}>{debt.assessment.priority}</span>
              )}
            </div>

            {/* Row 2: Core amounts */}
            <div className="text-[13px] flex gap-3 flex-wrap" style={{ color: '#6E6E73' }}>
              <span>本期应还 <b style={{ color: showAmounts ? '#1C1C1E' : 'transparent', textShadow: showAmounts ? 'none' : '0 0 12px rgba(0,0,0,0.3)' }}>{showAmounts ? formatFenAsYuan(debt.currentAmountDueFen) : '****'}</b></span>
              {debt.monthlyPaymentFen > 0 && (
                <span>月供 <b style={{ color: '#1C1C1E' }}>{showAmounts ? formatFenAsYuan(debt.monthlyPaymentFen) : '****'}</b></span>
              )}
              <span>{debt.nextDueDate || '日期待填'}</span>
            </div>

            {/* Row 3: Details */}
            {(debt.outstandingPrincipalFen > 0 || debt.annualRateBps || debt.termRemaining || debt.dueDay) && (
              <div className="text-[12px] flex gap-3 flex-wrap" style={{ color: '#8E8E93' }}>
                {debt.outstandingPrincipalFen > 0 && <span>本金 {formatFenAsYuan(debt.outstandingPrincipalFen)}</span>}
                {debt.annualRateBps && <span>年化 {(debt.annualRateBps/100).toFixed(1)}%</span>}
                {debt.termRemaining > 0 && <span>剩余 {debt.termRemaining} 期</span>}
                {debt.dueDay && <span>每月{debt.dueDay}日还款</span>}
              </div>
            )}

            {/* Row 4: Overdue info */}
            {debt.status === 'overdue' && (
              <div className="text-[12px]" style={{ color: '#FF9500' }}>
                {debt.expectedRepayDate
                  ? `${debt.expectedRepayDate} 预计结清 · 之后恢复月供`
                  : '逾期累计至下个还款日 · 之后恢复月供'}
              </div>
            )}

            {/* Row 5: Risk reasons */}
            {debt.assessment?.reasonCodes?.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {debt.assessment.reasonCodes.map((code: string) => (
                  <span key={code} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(0,0,0,0.04)', color: '#8E8E93' }}>{code}</span>
                ))}
              </div>
            )}
          </div>
        ))
      )}

      {archivedDebts.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-pfos-text-muted mb-2">已归档 ({archivedDebts.length})</h2>
          {archivedDebts.map(debt => (
            <div key={debt.id} className="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-2">
              <span className="text-sm text-pfos-text-muted">{debt.creditorName}</span>
              <span className="text-xs text-pfos-text-muted ml-2">已归档</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
