/** 通用顶部标题栏 — 返回按钮 + 标题，随滚动固定 */
import { useNavigate } from 'react-router-dom'

export default function StickyHeader({ title, backTo = '/dashboard' }: { title: string; backTo?: string }) {
  const nav = useNavigate()
  return (
    <div className="sticky top-0 z-10 safe-top"
         style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
      <div className="max-w-md mx-auto px-5 py-3 flex items-center justify-between">
        <button onClick={() => nav(backTo)} className="text-[15px] font-medium" style={{ color: '#007AFF' }}>← 返回</button>
        <h1 className="text-[16px] font-semibold text-[#1C1C1E]">{title}</h1>
        <div className="w-12" />
      </div>
    </div>
  )
}
