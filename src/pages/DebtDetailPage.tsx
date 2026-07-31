import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatFenAsYuan, yuanToFen } from '../domain/money'
import { DEBT_TYPE_LABELS, DEBT_STATUS_LABELS, RISK_REASON_LABELS } from '../domain/constants'
import { generateFullReport } from '../engine/report'
import { getPriorityExplanation } from '../engine/debtPriority'
import type { DebtType, DebtStatus, RepaymentMethod } from '../domain/types'
import { debtAccountSchema } from '../domain/schema'

export default function DebtDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, updateDebt, archiveDebt } = useApp()

  const debt = data.debts.find(d => d.id === id)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    creditorName: debt?.creditorName || '',
    debtType: debt?.debtType || 'credit_card' as DebtType,
    principalYuan: debt ? formatFenAsYuan(debt.outstandingPrincipalFen) : '',
    dueAmountYuan: debt ? formatFenAsYuan(debt.currentAmountDueFen) : '',
    dueDate: debt?.nextDueDate || '',
    annualRateStr: debt?.annualRateBps ? (debt.annualRateBps / 100).toFixed(2) : '',
    status: debt?.status || 'normal' as DebtStatus,
    hasCollateral: debt?.hasCollateral || false,
    hasGuarantor: debt?.hasGuarantor || false,
    hasCoBorrower: debt?.hasCoBorrower || false,
    repaymentMethod: debt?.repaymentMethod || 'unknown' as RepaymentMethod,
    dataConfidence: debt?.dataConfidence || 'confirmed' as 'confirmed' | 'estimated' | 'unknown',
  })
  const [editError, setEditError] = useState('')

  if (!debt) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">债务记录未找到</p>
        <button onClick={() => navigate('/debts')} className="mt-3 text-pfos-accent font-medium">返回列表</button>
      </div>
    )
  }

  const activeDebts = data.debts.filter(d => !d.deletedAt && d.status !== 'closed')
  const report = activeDebts.length > 0 ? generateFullReport({
    profile: data.profile,
    incomes: data.incomes,
    expenses: data.expenses,
    debts: activeDebts,
    startDate: data.dataAsOf,
  }) : null

  const assessment = report?.riskAssessments.find(a => a.debtId === debt.id)
  const explanation = assessment ? getPriorityExplanation({ ...debt, assessment, _sortKey: 0 } as any) : '暂无评估'

  const startEditing = () => {
    setEditForm({
      creditorName: debt.creditorName,
      debtType: debt.debtType,
      principalYuan: formatFenAsYuan(debt.outstandingPrincipalFen),
      dueAmountYuan: formatFenAsYuan(debt.currentAmountDueFen),
      dueDate: debt.nextDueDate,
      annualRateStr: debt.annualRateBps ? (debt.annualRateBps / 100).toFixed(2) : '',
      status: debt.status,
      hasCollateral: debt.hasCollateral,
      hasGuarantor: debt.hasGuarantor,
      hasCoBorrower: debt.hasCoBorrower,
      repaymentMethod: debt.repaymentMethod,
      dataConfidence: debt.dataConfidence,
    })
    setEditError('')
    setEditing(true)
  }

  const handleSave = () => {
    // Validate
    if (!editForm.creditorName.trim()) { setEditError('请输入债权方名称'); return }
    if (!editForm.principalYuan || parseFloat(editForm.principalYuan) <= 0) { setEditError('本金必须大于0'); return }

    // Check for likely duplicate
    const similar = data.debts.filter(d =>
      d.id !== debt.id && !d.deletedAt &&
      d.creditorName === editForm.creditorName.trim() &&
      Math.abs(d.outstandingPrincipalFen - yuanToFen(editForm.principalYuan)) < yuanToFen(1) // within 1 CNY
    )
    if (similar.length > 0 && !confirm('检测到同名且金额相近的债务，可能重复。确定保存？')) return

    // Confirm large amounts
    const principalFen = yuanToFen(editForm.principalYuan)
    if (principalFen > 1_000_000_00 && !confirm(`本金超过 ¥10,000.00，请确认金额无误`)) return

    // Detect overdue
    const today = new Date().toISOString().split('T')[0]
    let finalStatus = editForm.status
    let overdueSince = debt.overdueSince
    if (editForm.dueDate < today && finalStatus === 'normal') {
      finalStatus = 'overdue'
      overdueSince = editForm.dueDate
    }

    updateDebt(debt.id, {
      creditorName: editForm.creditorName.trim(),
      debtType: editForm.debtType,
      outstandingPrincipalFen: principalFen,
      currentAmountDueFen: yuanToFen(editForm.dueAmountYuan || editForm.principalYuan),
      nextDueDate: editForm.dueDate,
      annualRateBps: editForm.annualRateStr ? Math.round(parseFloat(editForm.annualRateStr) * 100) : undefined,
      status: finalStatus,
      overdueSince,
      hasCollateral: editForm.hasCollateral,
      hasGuarantor: editForm.hasGuarantor,
      hasCoBorrower: editForm.hasCoBorrower,
      repaymentMethod: editForm.repaymentMethod,
      dataConfidence: editForm.dataConfidence,
    })
    setEditing(false)
  }

  const fieldClass = "w-full text-sm border border-pfos-border rounded-lg px-3 py-2"
  const labelClass = "text-xs text-pfos-text-muted mb-0.5 block"

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/debts')} className="text-sm text-pfos-text-muted">← 返回</button>

      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold text-pfos-text">{editing ? '编辑债务' : debt.creditorName}</h1>
        {!editing && (
          <button onClick={startEditing} className="text-sm text-pfos-accent font-medium">编辑</button>
        )}
      </div>

      {editError && <p className="text-sm text-pfos-urgent bg-red-50 rounded-lg p-2">{editError}</p>}

      {!editing ? (
        <>
          {/* Display mode */}
          <div className="flex gap-2">
            <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-pfos-text">{DEBT_TYPE_LABELS[debt.debtType]}</span>
            <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-pfos-text">{DEBT_STATUS_LABELS[debt.status]}</span>
            {assessment && (
              <span className={`text-xs px-3 py-1 rounded-full font-bold text-white ${
                assessment.priority === 'P0' ? 'bg-pfos-urgent' : assessment.priority === 'P1' ? 'bg-pfos-high' :
                assessment.priority === 'P2' ? 'bg-pfos-medium' : 'bg-pfos-low'}`}>
                {assessment.priority}
              </span>
            )}
          </div>

          <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border space-y-3">
            <Row label="剩余本金" value={`¥${formatFenAsYuan(debt.outstandingPrincipalFen)}`} />
            <Row label="本期应还" value={`¥${formatFenAsYuan(debt.currentAmountDueFen)}`} bold />
            <Row label="还款日" value={debt.nextDueDate} />
            {debt.annualRateBps ? <Row label="年化利率" value={`${(debt.annualRateBps / 100).toFixed(2)}%`} /> : null}
            <Row label="还款方式" value={debt.repaymentMethod} />
            <Row label="数据来源" value={debt.dataConfidence === 'confirmed' ? '已确认' : debt.dataConfidence === 'estimated' ? '估算' : '未知'} />
          </div>

          {assessment && (
            <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
              <h3 className="text-sm font-semibold text-pfos-text mb-2">风险依据</h3>
              <p className="text-sm text-pfos-text-muted mb-2">{explanation}</p>
              <div className="flex flex-wrap gap-1">
                {assessment.reasonCodes.map(code => (
                  <span key={code} className="text-xs px-2 py-0.5 rounded bg-gray-100 text-pfos-text">{RISK_REASON_LABELS[code] || code}</span>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => navigate(`/negotiation/${debt.id}`)}
              className="flex-1 py-3 bg-pfos-accent text-white rounded-xl text-sm font-medium tap-active">协商准备</button>
            <button onClick={() => { if (confirm('确定归档？')) { archiveDebt(debt.id); navigate('/debts') } }}
              className="py-3 px-4 border border-pfos-border text-pfos-text-muted rounded-xl text-sm tap-active">归档</button>
          </div>
        </>
      ) : (
        <>
          {/* Edit mode */}
          <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border space-y-3">
            <div>
              <label className={labelClass}>债权方名称 *</label>
              <input value={editForm.creditorName} onChange={e => setEditForm({...editForm, creditorName: e.target.value})} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>债务类型</label>
              <select value={editForm.debtType} onChange={e => setEditForm({...editForm, debtType: e.target.value as DebtType})} className={fieldClass}>
                {Object.entries(DEBT_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>剩余本金（元）*</label>
              <input type="number" inputMode="decimal" value={editForm.principalYuan} onChange={e => setEditForm({...editForm, principalYuan: e.target.value})} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>本期应还金额（元）</label>
              <input type="number" inputMode="decimal" value={editForm.dueAmountYuan} onChange={e => setEditForm({...editForm, dueAmountYuan: e.target.value})} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>还款日</label>
              <input type="date" value={editForm.dueDate} onChange={e => setEditForm({...editForm, dueDate: e.target.value})} className={fieldClass} />
              {editForm.dueDate < new Date().toISOString().split('T')[0] && (
                <p className="text-xs text-amber-600 mt-1">⚠ 日期已过，将标记为逾期</p>
              )}
            </div>
            <div>
              <label className={labelClass}>年化利率（%）</label>
              <input type="number" inputMode="decimal" value={editForm.annualRateStr} onChange={e => setEditForm({...editForm, annualRateStr: e.target.value})} className={fieldClass} />
            </div>
            <div>
              <label className={labelClass}>当前状态</label>
              <select value={editForm.status} onChange={e => setEditForm({...editForm, status: e.target.value as DebtStatus})} className={fieldClass}>
                {Object.entries(DEBT_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={editForm.hasCollateral} onChange={e => setEditForm({...editForm, hasCollateral: e.target.checked})} /> 有抵押</label>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={editForm.hasGuarantor} onChange={e => setEditForm({...editForm, hasGuarantor: e.target.checked})} /> 有担保</label>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={editForm.hasCoBorrower} onChange={e => setEditForm({...editForm, hasCoBorrower: e.target.checked})} /> 有共同借款人</label>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={handleSave} className="flex-1 py-3 bg-pfos-accent text-white rounded-xl font-medium tap-active">保存</button>
            <button onClick={() => setEditing(false)} className="flex-1 py-3 border border-pfos-border text-pfos-text rounded-xl tap-active">取消</button>
          </div>
        </>
      )}
    </div>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-sm text-pfos-text-muted">{label}</span>
      <span className={`text-sm ${bold ? 'font-bold text-pfos-high' : 'text-pfos-text'}`}>{value}</span>
    </div>
  )
}
