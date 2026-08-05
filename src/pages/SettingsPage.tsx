import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_VERSION } from '../domain/constants'

export default function SettingsPage() {
  const navigate = useNavigate()
  const { data, exportAllData, resetAll } = useApp()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

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

  const handleDelete = () => {
    if (deleteConfirmText !== '确认删除') return
    resetAll()
    setShowDeleteConfirm(false)
    setDeleteConfirmText('')
    navigate('/')
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5 safe-bottom space-y-4">
      <button onClick={() => navigate('/')} className="text-sm text-pfos-text-muted">← 返回</button>
      <h1 className="text-lg font-bold text-pfos-text">我的</h1>

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
