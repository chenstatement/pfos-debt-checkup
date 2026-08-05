/** 通用顶部标题栏 — 返回按钮 + 标题，随滚动固定 */
import { useNavigate } from 'react-router-dom'
import { createElement } from 'react'

export default function StickyHeader({
  title,
  backTo = '/',
  backLabel = '返回',
  titleIsHeading = true,
}: {
  title: string
  backTo?: string
  /** 返回按钮文字，默认"返回"。Runway 页传入 "返回 PFOS" 使目标可访问清晰 */
  backLabel?: string
  /** 标题是否作为原生 h1。默认 true（保持既有页面行为）。Runway 页传 false 避免重复 heading */
  titleIsHeading?: boolean
}) {
  const nav = useNavigate()
  const displayLabel = backLabel || '返回'

  const titleEl = titleIsHeading
    ? createElement('h1', { className: 'text-[16px] font-semibold text-[#1C1C1E]' }, title)
    : createElement('p', { className: 'text-[16px] font-semibold text-[#1C1C1E]' }, title)

  return (
    <div className="sticky top-0 z-10 safe-top"
         style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
      <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
        <button
          onClick={() => nav(backTo)}
          className="text-[15px] font-medium"
          style={{ color: '#007AFF' }}
          aria-label={`${displayLabel}${displayLabel.includes('PFOS') ? '首页' : ''}`}
        >
          ← {displayLabel}
        </button>
        {titleEl}
        <div className="w-12" />
      </div>
    </div>
  )
}
