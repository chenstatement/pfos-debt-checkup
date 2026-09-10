import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_VERSION } from '../domain/constants'
import { exportDnosHandoffV2 } from '../domain/dnosHandoff/exporter-v2'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { data, exportAllData, importAllData, resetAll } = useApp()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [showDnosExportConfirm, setShowDnosExportConfirm] = useState(false)
  const [dnosExportError, setDnosExportError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showImportConfirm, setShowImportConfirm] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importMessage, setImportMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const handleExport = () => {
    const json = exportAllData()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PFOS_data_${data.dataAsOf || 'export'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleDnosExport = async () => {
    const result = await exportDnosHandoffV2(data)
    if (!result.ok) {
      setDnosExportError(`${result.message}${result.missingFields.length > 0 ? `（缺少：${result.missingFields.join('、')}）` : ''}`)
      setShowDnosExportConfirm(false)
      return
    }
    const blob = new Blob([result.json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PFOS_DNOS_handoff_complete_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    setDnosExportError(null)
    setShowDnosExportConfirm(false)
  }

  const handleImportFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportFile(file)
    setImportMessage(null)
    setShowImportConfirm(true)
    e.target.value = ''
  }

  const handleImportConfirm = () => {
    if (!importFile) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = importAllData(String(reader.result))
      setImportMessage({ ok: result.ok, text: result.message })
      setShowImportConfirm(false)
      setImportFile(null)
    }
    reader.onerror = () => {
      setImportMessage({ ok: false, text: '读取文件失败，请重试。' })
      setShowImportConfirm(false)
      setImportFile(null)
    }
    reader.readAsText(importFile)
  }

  const handleDelete = () => {
    if (deleteConfirmText !== '确认删除') return
    resetAll()
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
    navigate('/pfos')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/pfos')} className="text-sm text-pfos-text-muted">← 返回</button>
      <h1 className="text-lg font-bold text-pfos-text">我的</h1>

      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">PIOS 统一输入</h3>
        <p className="text-xs leading-relaxed text-pfos-text-muted mb-3">
          从一个对话入口进入的 PFOS 事项会先放入输入箱；你确认债务归属后，才写入本地沟通记录。
        </p>
        <button
          onClick={() => navigate('/pios-inbox')}
          className="w-full py-2.5 border border-pfos-accent text-pfos-accent rounded-xl text-sm font-medium tap-active"
        >
          打开 PIOS 输入箱
        </button>
      </div>

      {/* Data summary */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-3">数据总览</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">免责声明版本</span>
            <span className="text-pfos-text">{data.consent?.documentVersion || '未确认'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">声明确认时间</span>
            <span className="text-pfos-text">{data.consent?.acceptedAt ? new Date(data.consent.acceptedAt).toLocaleString('zh-CN') : '未确认'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">债务记录</span>
            <span className="text-pfos-text">{data.debts.filter(d => !d.deletedAt).length} 笔活跃，{data.debts.filter(d => d.deletedAt).length} 笔归档</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">收入来源</span>
            <span className="text-pfos-text">{data.incomes.length} 项</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">支出项目</span>
            <span className="text-pfos-text">{data.expenses.length} 项</span>
          </div>
          <div className="flex justify-between">
            <span className="text-pfos-text-muted">数据截止日期</span>
            <span className="text-pfos-text">{data.dataAsOf}</span>
          </div>
        </div>
      </div>

      {/* Privacy */}
      <div className="bg-pfos-surface rounded-xl p-4 border border-pfos-border">
        <h3 className="text-sm font-semibold text-pfos-text mb-2">隐私与数据</h3>
        <ul className="space-y-2 text-xs text-pfos-text-muted">
          <li>🔒 所有数据仅保存在您的浏览器本地存储中</li>
          <li>📤 不会自动上传到任何服务器</li>
          <li>🗑️ 清除浏览器数据或卸载应用将导致数据永久丢失</li>
          <li>📋 建议定期导出数据作为备份</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        <button
          onClick={handleExport}
          className="w-full py-3 bg-pfos-accent text-white rounded-xl font-medium tap-active"
        >
          导出所有数据 (JSON)
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleImportFileSelected}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full py-3 border border-pfos-accent text-pfos-accent rounded-xl font-medium tap-active"
        >
          导入数据备份 (JSON)
        </button>

        {showImportConfirm && (
          <div role="dialog" aria-label="确认导入数据备份" className="bg-pfos-surface rounded-xl p-4 border border-pfos-accent space-y-3">
            <p className="text-sm font-semibold text-pfos-text">确认导入「{importFile?.name}」？</p>
            <p className="text-xs text-pfos-text-muted">导入会用备份文件覆盖当前全部数据。建议先导出当前数据，确认无误后再导入。</p>
            <div className="flex gap-2">
              <button onClick={handleImportConfirm} className="flex-1 py-2 bg-pfos-accent text-white rounded-lg text-sm font-medium">确认导入</button>
              <button onClick={() => { setShowImportConfirm(false); setImportFile(null) }} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">取消</button>
            </div>
          </div>
        )}

        {importMessage && (
          <p role="alert" className={`text-xs ${importMessage.ok ? 'text-green-700' : 'text-red-600'}`}>{importMessage.text}</p>
        )}

        <button
          onClick={() => { setDnosExportError(null); setShowDnosExportConfirm(true) }}
          className="w-full py-3 border border-pfos-accent text-pfos-accent rounded-xl font-medium tap-active"
        >
          导出 DNOS 完整脱敏交接包
        </button>

        {showDnosExportConfirm && (
          <div role="dialog" aria-label="确认导出 DNOS 完整脱敏交接包" className="bg-pfos-surface rounded-xl p-4 border border-pfos-accent space-y-3">
            <p className="text-sm font-semibold text-pfos-text">导出前确认用途与字段范围</p>
            <p className="text-xs text-pfos-text-muted">交接包仅用于本地 DNOS 协商决策工作台，将保留债务机构、产品、金额、期限和现金流等决策所需业务信息，但排除姓名、联系方式、证件号、完整账户号和沟通原文。</p>
            <p className="text-xs text-pfos-text-muted">确认后文件会下载到本机，不会自动上传；不合格或未授权时不会生成文件。</p>
            <div className="flex gap-2">
              <button onClick={handleDnosExport} className="flex-1 py-2 bg-pfos-accent text-white rounded-lg text-sm font-medium">确认并导出</button>
              <button onClick={() => setShowDnosExportConfirm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg text-sm">取消</button>
            </div>
          </div>
        )}

        {dnosExportError && <p role="alert" className="text-xs text-red-600">{dnosExportError}</p>}

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full py-3 border border-red-300 text-red-600 rounded-xl font-medium tap-active"
          >
            删除所有数据
          </button>
        ) : (
          <div className="bg-red-50 rounded-xl p-4 border border-red-200 space-y-3">
            <p className="text-sm font-semibold text-red-700">⚠️ 确认删除所有数据？</p>
            <p className="text-xs text-red-600">此操作不可撤销。建议先导出数据备份。输入"确认删除"以继续。</p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="输入「确认删除」"
              className="w-full text-sm border border-red-300 rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleteConfirmText !== '确认删除'}
                className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-40"
              >
                确认删除
              </button>
              <button
                onClick={() => { setShowDeleteConfirm(false); setDeleteConfirmText('') }}
                className="flex-1 py-2 border border-gray-300 rounded-lg text-sm"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center">
        <p className="text-xs text-pfos-text-muted">
          PFOS v1.0 · 免责声明版本 {DISCLAIMER_VERSION}
        </p>
      </div>
    </div>
  )
}
