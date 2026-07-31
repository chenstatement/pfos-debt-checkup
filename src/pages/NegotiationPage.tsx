import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { formatFenAsYuan, yuanToFen } from '../domain/money'
import { NEGOTIATION_CHECKLIST_TEMPLATE } from '../domain/constants'
import type { CommunicationRecord, NegotiationChecklistItem } from '../domain/types'

export default function NegotiationPage() {
  const { debtId } = useParams<{ debtId: string }>()
  const navigate = useNavigate()
  const { data, negotiationData, saveNegotiationData } = useApp()

  const debt = data.debts.find(d => d.id === debtId)
  if (!debt) {
    return (
      <div className="max-w-lg mx-auto px-5 py-12 text-center">
        <p className="text-pfos-text-muted">债务记录未找到</p>
        <button onClick={() => navigate('/debts')} className="mt-3 text-pfos-accent font-medium">返回</button>
      </div>
    )
  }

  // ── State (persisted to store) ─────────────────────────────

  const saved = negotiationData[debtId!]
  const checklist = saved?.checklist?.length
    ? saved.checklist as NegotiationChecklistItem[]
    : NEGOTIATION_CHECKLIST_TEMPLATE.map(item => ({ ...item, status: 'missing' as const }))
  const communications = saved?.communications || []
  const hardshipSummary = saved?.hardship || ''

  const [showCommForm, setShowCommForm] = useState(false)
  const [commForm, setCommForm] = useState({
    channel: 'official_phone' as CommunicationRecord['channel'],
    contactedAt: new Date().toISOString().slice(0, 16),
    contactParty: '',
    summary: '',
    referenceNumber: '',
    promisedFollowUpDate: '',
  })

  // Offer comparison
  const [showOfferCompare, setShowOfferCompare] = useState(false)
  const [offerInput, setOfferInput] = useState({
    newMonthlyPayment: '',
    newFirstPaymentDate: '',
    newTermMonths: '',
    knownFees: '',
    hasWrittenConfirmation: false,
    userNote: '',
  })

  const toggleChecklistItem = (code: string) => {
    const updated = checklist.map(item => {
      if (item.code !== code) return item
      const next: 'missing' | 'ready' | 'not_applicable' =
        item.status === 'missing' ? 'ready' :
        item.status === 'ready' ? 'not_applicable' : 'missing'
      return { ...item, status: next }
    })
    saveNegotiationData(debtId!, { checklist: updated, hardship: hardshipSummary, communications })
  }

  const addCommunication = () => {
    if (!commForm.summary) return
    const newComms = [...communications, {
      id: `comm_${Date.now()}`,
      channel: commForm.channel,
      contactedAt: new Date(commForm.contactedAt).toISOString(),
      contactParty: commForm.contactParty || undefined,
      summary: commForm.summary,
      referenceNumber: commForm.referenceNumber || undefined,
    }]
    saveNegotiationData(debtId!, { checklist, hardship: hardshipSummary, communications: newComms })
    setCommForm({ ...commForm, summary: '', referenceNumber: '', promisedFollowUpDate: '', contactParty: '' })
    setShowCommForm(false)
  }

  const saveHardship = (text: string) => {
    saveNegotiationData(debtId!, { checklist, hardship: text, communications })
  }

  const readyCount = checklist.filter(c => c.status === 'ready').length
  const totalCount = checklist.filter(c => c.status !== 'not_applicable').length

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate(`/debts/${debtId}`)} className="text-sm text-pfos-text-muted">← 返回债务详情</button>
      <h1 className="text-xl font-bold text-pfos-text">协商准备：{debt.creditorName}</h1>

      {/* Disclaimer */}
      <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
        <p className="text-xs text-amber-800 font-medium mb-1">⚠️ 重要提示</p>
        <p className="text-xs text-amber-700 leading-relaxed">
          本功能仅帮助整理事实和信息，不承诺协商成功、不保证减免或延期。
          所有沟通应通过债权方官方渠道进行，保留书面凭证。
          最终决策由你自行负责。涉及法律问题请咨询专业律师。
        </p>
      </div>

      {/* Checklist */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-pfos-text">材料检查表</h3>
          <span className="text-xs text-pfos-text-muted">{readyCount}/{totalCount} 项已准备</span>
        </div>
        <div className="space-y-2">
          {checklist.map(item => (
            <div key={item.code} className="flex items-center gap-2">
              <button
                onClick={() => toggleChecklistItem(item.code)}
                className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs flex-shrink-0 ${
                  item.status === 'ready' ? 'bg-pfos-low border-pfos-low text-white' :
                  item.status === 'not_applicable' ? 'bg-gray-200 border-gray-300 text-gray-500' :
                  'border-gray-300'
                }`}
              >
                {item.status === 'ready' ? '✓' : item.status === 'not_applicable' ? '—' : ''}
              </button>
              <span className={`text-xs ${item.status === 'not_applicable' ? 'text-pfos-text-muted line-through' : 'text-pfos-text'}`}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Hardship summary */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">困难说明（供沟通参考）</h3>
        <textarea
          value={hardshipSummary}
          onChange={e => saveHardship(e.target.value)}
          placeholder="简述当前收支情况、逾期原因和还款意愿。此内容仅帮助你整理思路，不会自动发送。"
          rows={4}
          className="w-full text-sm border border-pfos-border rounded-lg px-3 py-2 resize-none"
        />
      </div>

      {/* Communication records */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-pfos-text">沟通记录</h3>
          <button onClick={() => setShowCommForm(!showCommForm)} className="text-xs text-pfos-accent font-medium">
            + 添加记录
          </button>
        </div>

        {showCommForm && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-2">
            <select
              value={commForm.channel}
              onChange={e => setCommForm({ ...commForm, channel: e.target.value as any })}
              className="w-full text-xs border rounded px-2 py-1.5"
            >
              <option value="official_phone">官方电话</option>
              <option value="official_app">官方App</option>
              <option value="email">邮件</option>
              <option value="branch">线下网点</option>
              <option value="other">其他</option>
            </select>
            <input type="datetime-local" value={commForm.contactedAt} onChange={e => setCommForm({ ...commForm, contactedAt: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <input type="text" placeholder="联系对象（可选）" value={commForm.contactParty} onChange={e => setCommForm({ ...commForm, contactParty: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <input type="text" placeholder="沟通摘要 *" value={commForm.summary} onChange={e => setCommForm({ ...commForm, summary: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <input type="text" placeholder="参考编号（可选）" value={commForm.referenceNumber} onChange={e => setCommForm({ ...commForm, referenceNumber: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <button onClick={addCommunication} className="w-full py-1.5 bg-pfos-accent text-white rounded text-xs font-medium">保存记录</button>
          </div>
        )}

        {communications.length === 0 ? (
          <p className="text-xs text-pfos-text-muted text-center py-3">暂无沟通记录</p>
        ) : (
          <div className="space-y-2">
            {communications.map(comm => (
              <div key={comm.id} className="p-2 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-xs text-pfos-text-muted">
                  <span>{comm.channel === 'official_phone' ? '📞 电话' : comm.channel === 'email' ? '📧 邮件' : comm.channel === 'branch' ? '🏢 网点' : comm.channel === 'official_app' ? '📱 App' : '其他'}</span>
                  <span>{new Date(comm.contactedAt).toLocaleDateString('zh-CN')}</span>
                </div>
                <p className="text-xs text-pfos-text mt-1">{comm.summary}</p>
                {comm.referenceNumber && <p className="text-[10px] text-pfos-text-muted">编号：{comm.referenceNumber}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offer comparison */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-pfos-text">新方案比较</h3>
          <button onClick={() => setShowOfferCompare(!showOfferCompare)} className="text-xs text-pfos-accent font-medium">
            {showOfferCompare ? '取消' : '录入新方案'}
          </button>
        </div>

        {showOfferCompare && (
          <div className="space-y-2">
            <p className="text-xs text-pfos-text-muted">
              如果你收到了债权方的新方案，可以在此比较现金流变化。系统仅做数学比较，不判断方案好坏。
            </p>
            <input type="number" placeholder="新月还款额（元）" value={offerInput.newMonthlyPayment} onChange={e => setOfferInput({ ...offerInput, newMonthlyPayment: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <input type="date" placeholder="新首次付款日" value={offerInput.newFirstPaymentDate} onChange={e => setOfferInput({ ...offerInput, newFirstPaymentDate: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <input type="number" placeholder="期数（可选）" value={offerInput.newTermMonths} onChange={e => setOfferInput({ ...offerInput, newTermMonths: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" />
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={offerInput.hasWrittenConfirmation} onChange={e => setOfferInput({ ...offerInput, hasWrittenConfirmation: e.target.checked })} />
              <span className="text-xs text-pfos-text-muted">是否已取得书面确认</span>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
              <p className="text-xs text-blue-700">
                📊 当前月度还款：¥{formatFenAsYuan(debt.currentAmountDueFen)}<br />
                {offerInput.newMonthlyPayment && <>新方案月还款：¥{formatFenAsYuan(yuanToFen(offerInput.newMonthlyPayment))}<br /></>}
                <span className="text-[10px] text-blue-500">系统仅比较现金流变化，不判断方案是否"合法"或"最优"。</span>
              </p>
            </div>
          </div>
        )}

        {!showOfferCompare && (
          <p className="text-xs text-pfos-text-muted text-center py-3">
            如果你收到了新方案，可以在此录入并比较对未来现金流的影响。
          </p>
        )}
      </div>
    </div>
  )
}
