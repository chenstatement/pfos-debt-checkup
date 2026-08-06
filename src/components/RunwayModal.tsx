import { useEffect, useRef, useCallback } from 'react'

interface RunwayModalProps {
  normalMonths: number
  timeDisplay: string       // e.g. "1年3个月" or "8个月" or "30年以上"
  onClose: () => void
  onViewCards: () => void
}

// ── Tier determination ──────────────────────────────────────

type Tier = 1 | 2 | 3 | 4 | 5

function getTier(months: number): Tier {
  if (months < 12) return 1
  if (months <= 35) return 2
  if (months <= 119) return 3
  if (months <= 359) return 4
  return 5
}

// ── Tier copy ───────────────────────────────────────────────

interface TierCopy {
  title: string
  subtitle: string
}

const TIER_COPY: Record<Tier, TierCopy> = {
  1: {
    title: '钱包开口了：要奋斗，要努力，你是需要加班的。',
    subtitle: '自由体验卡还不到一年，辞职按钮建议先不要乱按。',
  },
  2: {
    title: '恭喜，你获得了限时不上班体验卡。',
    subtitle: '到期能不能续费，全看钱包脸色。',
  },
  3: {
    title: '班可以不上，预算不能不算。',
    subtitle: '老板暂时只能算普通联系人。',
  },
  4: {
    title: '老板说话，可以只听重点了。',
    subtitle: '工作已经从必答题，变成了一道选择题。',
  },
  5: {
    title: '恭喜，老板终于成了可选配件。',
    subtitle: '自由不敢替你保证，但这份底气是真的。',
  },
}

// ── Component ───────────────────────────────────────────────

export default function RunwayModal({ normalMonths, timeDisplay, onClose, onViewCards }: RunwayModalProps) {
  const tier = getTier(normalMonths)
  const copy = TIER_COPY[tier]
  const touchStartY = useRef(0)
  const overlayRef = useRef<HTMLDivElement>(null)

  // ── Esc key ─────────────────────────────────────────────
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ── Swipe down (mobile) ─────────────────────────────────
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
  }, [])

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const delta = e.changedTouches[0].clientY - touchStartY.current
    if (delta > 80) onClose()
  }, [onClose])

  // ── Click overlay ───────────────────────────────────────
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }, [onClose])

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/30 backdrop-blur-sm"
      style={{ animation: 'fadeIn 200ms ease-out' }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="测算结果弹窗"
    >
      {/* ── Card ────────────────────────────────────────── */}
      <div
        className="w-full md:max-w-[440px] md:rounded-2xl rounded-t-3xl px-6 pt-8 pb-8 md:pb-8 relative space-y-5"
        style={{
          background: 'linear-gradient(180deg, #FFFFFF 0%, #F9F9FB 100%)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.10), 0 -2px 8px rgba(0,0,0,0.04)',
          animation: 'slideUp 300ms ease-out',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Swipe indicator (mobile only) */}
        <div className="md:hidden absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 rounded-full bg-[#D1D1D6]" />

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-[#8E8E93] hover:bg-black/5 transition-colors"
          aria-label="关闭"
        >
          ✕
        </button>

        {/* ── Content ──────────────────────────────────────── */}
        <p className="text-[12px] font-medium tracking-wide text-center" style={{ color: '#8E8E93' }}>
          你的测算结果
        </p>

        <p className="text-[18px] md:text-[20px] font-bold text-center leading-snug px-2"
           style={{ color: '#1C1C1E', letterSpacing: '-0.02em' }}>
          {copy.title}
        </p>

        <p className="text-[13px] text-center" style={{ color: '#8E8E93' }}>
          按正常过，你还能过
        </p>

        <p className="text-[40px] md:text-[48px] font-bold text-center tracking-tight leading-tight"
           style={{ color: '#007AFF', letterSpacing: '-0.03em' }}>
          {timeDisplay}
        </p>

        <p className="text-[14px] text-center leading-relaxed" style={{ color: '#6E6E73' }}>
          {copy.subtitle}
        </p>

        {/* ── Actions ──────────────────────────────────────── */}
        <button
          onClick={onViewCards}
          className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]"
          style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}
        >
          看看其他活法
        </button>

        <button
          onClick={onClose}
          className="w-full py-2 text-[14px] font-medium text-center"
          style={{ color: '#8E8E93' }}
        >
          关闭
        </button>
      </div>

      {/* ── Animations ──────────────────────────────────────── */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; }
        }
      `}</style>
    </div>
  )
}
