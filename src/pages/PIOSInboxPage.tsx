import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import {
  fetchPfosGatewayRecords,
  gatewayRecordImportedKey,
  gatewayRecordSummary,
  type GatewayPfosRecord,
} from '../integration/piosGateway'

const IMPORTED_KEYS_STORAGE = 'pfos_pios_gateway_imported_keys'

function loadImportedKeys(): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(IMPORTED_KEYS_STORAGE) || '[]')
    return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []
  } catch {
    return []
  }
}

function saveImportedKey(key: string) {
  const keys = new Set(loadImportedKeys())
  keys.add(key)
  localStorage.setItem(IMPORTED_KEYS_STORAGE, JSON.stringify([...keys]))
}

function isPfosRecord(record: GatewayPfosRecord) {
  return record.status === 'active' && record.action === 'append_case_event'
}

export default function PIOSInboxPage() {
  const navigate = useNavigate()
  const { data, saveNegotiationData } = useApp()
  const [records, setRecords] = useState<GatewayPfosRecord[]>([])
  const [importedKeys, setImportedKeys] = useState(() => new Set(loadImportedKeys()))
  const [selectedDebt, setSelectedDebt] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null)

  const activeDebts = useMemo(
    () => data.debts.filter(debt => !debt.deletedAt && debt.status !== 'closed'),
    [data.debts],
  )

  const loadRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchPfosGatewayRecords()
      setRecords(result.filter(isPfosRecord))
      setLastLoadedAt(new Date().toLocaleString('zh-CN'))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '无法读取 PIOS Gateway')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void loadRecords() }, [loadRecords])

  const pendingRecords = records.filter(record => !importedKeys.has(gatewayRecordImportedKey(record)))

  const importRecord = (record: GatewayPfosRecord) => {
    const debtId = selectedDebt[record.module_record_id]
    if (!debtId) return
    const existing = data.negotiationData[debtId]?.communications || []
    const imported = {
      id: gatewayRecordImportedKey(record),
      channel: 'other',
      contactedAt: record.created_at,
      contactParty: 'PIOS Gateway 事项',
      summary: gatewayRecordSummary(record),
    }
    saveNegotiationData(debtId, { communications: [...existing, imported] })
    saveImportedKey(imported.id)
    setImportedKeys(previous => new Set(previous).add(imported.id))
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/settings')} className="text-sm text-pfos-text-muted">← 返回设置</button>
      <div>
        <h1 className="text-lg font-bold text-pfos-text">PIOS 输入箱</h1>
        <p className="mt-1 text-xs text-pfos-text-muted">
          这里显示 Gateway 已识别为 PFOS 事项的内容。选择具体债务并确认后，才会写入 PFOS 本地数据。
        </p>
      </div>

      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-pfos-text">待复核 {pendingRecords.length} 条</span>
          <button onClick={() => void loadRecords()} disabled={loading} className="text-xs text-pfos-accent disabled:opacity-50">
            {loading ? '读取中…' : '重新读取'}
          </button>
        </div>
        {lastLoadedAt && <p className="text-[11px] text-pfos-text-muted">上次读取：{lastLoadedAt}</p>}
        {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
        <p className="text-[11px] leading-relaxed text-pfos-text-muted">
          这一步不会自动猜测债务归属，也不会覆盖已有沟通记录。未确认的内容停留在 Gateway 输入箱。
        </p>
      </div>

      {pendingRecords.length === 0 && !loading && (
        <div className="bg-pfos-surface rounded-xl p-6 border border-pfos-border text-center text-sm text-pfos-text-muted">
          暂无待复核的 PIOS 财务事项。
        </div>
      )}

      <div className="space-y-3">
        {pendingRecords.map(record => {
          const selected = selectedDebt[record.module_record_id] || ''
          return (
            <article key={record.module_record_id} className="bg-pfos-surface rounded-xl p-4 border border-pfos-border space-y-3">
              <div>
                <p className="text-sm font-medium text-pfos-text leading-relaxed">{gatewayRecordSummary(record)}</p>
                <p className="mt-1 text-[11px] text-pfos-text-muted">收到于 {new Date(record.created_at).toLocaleString('zh-CN')} · 事件 {record.source_event_id}</p>
              </div>
              <label className="block text-xs text-pfos-text-muted">
                关联到哪笔债务？
                <select
                  value={selected}
                  onChange={event => setSelectedDebt(previous => ({ ...previous, [record.module_record_id]: event.target.value }))}
                  className="mt-1 w-full rounded-lg border border-pfos-border bg-white px-3 py-2 text-sm text-pfos-text"
                >
                  <option value="">请选择</option>
                  {activeDebts.map(debt => <option key={debt.id} value={debt.id}>{debt.creditorName || '未命名债务'}</option>)}
                </select>
              </label>
              <button
                onClick={() => importRecord(record)}
                disabled={!selected}
                className="w-full rounded-lg bg-pfos-accent py-2.5 text-sm font-medium text-white disabled:opacity-40"
              >
                确认并写入沟通记录
              </button>
            </article>
          )
        })}
      </div>
    </div>
  )
}
