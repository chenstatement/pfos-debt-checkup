import { useState, useMemo } from 'react'
import { formatFenAsYuan } from '../domain/money'
import { aggregateMonthly } from '../engine/nowcast'
import StickyHeader from '../components/StickyHeader'
import type { FullReport } from '../engine/report'

function dayOfWeek(iso: string) { return ['日','一','二','三','四','五','六'][new Date(iso).getDay()] }
function fmtShort(iso: string) { const [,m,d] = iso.split('-'); return `${parseInt(m)}/${parseInt(d)}` }

export default function CashflowPage({ report }: { report: FullReport | null }) {
  const [showAll, setShowAll] = useState(false)
  const [sel, setSel] = useState<string | null>(null)

  const monthly = useMemo(() => report ? aggregateMonthly(report.nowcast.dailyLedger) : [], [report])

  if (!report) return (
    <div>
      <StickyHeader title="现金流预测" />
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center" style={{ background: '#F2F2F7' }}>
        <p className="text-[#8E8E93] text-[15px]">请先完成数据录入</p>
      </div>
    </div>
  )

  const { nowcast } = report
  const { dailyLedger, runwayDays, safetyThresholdFen, startingCashFen, collisionDays } = nowcast
  const today = new Date().toISOString().split('T')[0]
  const visibleDays = showAll ? dailyLedger : dailyLedger.slice(0, 30)
  const eventDays = visibleDays.filter(d => d.events && d.events.length > 0)

  return (
    <div className="min-h-screen safe-bottom" style={{ background: '#F2F2F7' }}>
      <div className="max-w-md mx-auto px-5 pt-6 pb-8 space-y-5">
        <StickyHeader title="现金流预测" />

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="apple-card text-center py-5">
            <p className="text-[12px] mb-1" style={{ color: '#8E8E93' }}>起点现金</p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: '#1C1C1E' }}>{formatFenAsYuan(startingCashFen)}</p>
          </div>
          <div className="apple-card text-center py-5">
            <p className="text-[12px] mb-1" style={{ color: '#8E8E93' }}>预计断流</p>
            <p className="text-2xl font-bold tracking-tight" style={{ color: runwayDays >= 60 ? '#34C759' : runwayDays >= 30 ? '#FF9500' : '#FF3B30' }}>
              {nowcast.firstGapDate || '>90天'}
            </p>
          </div>
        </div>

        {/* Gap alert — only if critical */}
        {nowcast.firstGapDate && runwayDays <= 30 && (
          <div className="rounded-xl p-4 text-[13px]" style={{ background: 'rgba(255,149,0,0.06)', color: '#B37400' }}>
            预计 {nowcast.firstGapDate} 首次出现资金缺口，至少缺 {formatFenAsYuan(nowcast.firstGapAmountFen)}
          </div>
        )}

        {/* Collision days */}
        {collisionDays.slice(0, 2).map((c: any, i: number) => (
          <div key={i} className="rounded-xl p-4 text-[13px]" style={{ background: 'rgba(255,149,0,0.04)', color: '#B37400' }}>
            {c.date}（周{dayOfWeek(c.date)}）还款碰撞：{c.payments.map((p: any) => `${p.label} ${formatFenAsYuan(p.amountFen)}`).join(' + ')}
          </div>
        ))}

        {/* Daily timeline — event days only */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[15px] font-semibold text-[#1C1C1E]">日级明细</h3>
            <button onClick={() => setShowAll(!showAll)} className="text-[13px] font-medium" style={{ color: '#007AFF' }}>
              {showAll ? '显示30天' : `全部${dailyLedger.length}天`}
            </button>
          </div>

          {eventDays.length > 0 ? (
            <div className="apple-card p-0 overflow-hidden">
              {eventDays.map((d: any, i: number) => {
                const isToday = d.date === today
                const isSel = sel === d.date
                const net = d.inflowFen - d.outflowFen
                const balanceOk = d.closingBalanceFen >= safetyThresholdFen
                return (
                  <div key={d.date}>
                    <div onClick={() => setSel(isSel ? null : d.date)}
                         className="flex items-center gap-3 px-5 py-3 cursor-pointer transition-colors hover:bg-[rgba(0,0,0,0.01)]"
                         style={{ borderBottom: i < eventDays.length - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
                      <div className="w-12 shrink-0">
                        <p className="text-[12px] font-semibold" style={{ color: isToday ? '#007AFF' : '#8E8E93' }}>{fmtShort(d.date)}</p>
                        <p className="text-[10px]" style={{ color: '#C7C7CC' }}>周{dayOfWeek(d.date)}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        {d.events.map((e: any, ei: number) => (
                          <p key={ei} className="text-[13px] truncate" style={{ color: e.direction === 'inflow' ? '#34C759' : '#1C1C1E' }}>
                            {e.label} <span className="font-medium">{e.direction === 'inflow' ? '+' : '-'}{formatFenAsYuan(e.amountFen)}</span>
                          </p>
                        ))}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[14px] font-semibold tracking-tight" style={{ color: balanceOk ? '#1C1C1E' : '#FF3B30' }}>
                          {formatFenAsYuan(d.closingBalanceFen)}
                        </p>
                        <p className="text-[11px]" style={{ color: net >= 0 ? '#34C759' : '#8E8E93' }}>
                          {net >= 0 ? '+' : ''}{formatFenAsYuan(net)}
                        </p>
                      </div>
                    </div>
                    {/* Expanded detail */}
                    {isSel && (
                      <div className="px-5 pb-4 pt-1" style={{ background: 'rgba(0,122,255,0.02)' }}>
                        {d.events.map((e: any, ei: number) => (
                          <div key={ei} className="flex justify-between py-1.5 text-[13px]">
                            <span className="text-[#1C1C1E]">
                              {e.type === 'asset_realization' ? '💰' : e.direction === 'inflow' ? '📥' : '📤'} {e.label}
                            </span>
                            <span className="font-semibold" style={{ color: e.direction === 'inflow' ? '#34C759' : '#FF3B30' }}>
                              {e.direction === 'inflow' ? '+' : '-'}{formatFenAsYuan(e.amountFen)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="apple-card text-center py-8 text-[14px] text-[#8E8E93]">未来{visibleDays.length}天内无收支事件</div>
          )}
        </div>

        {/* Monthly summary */}
        <div className="apple-card p-0 overflow-hidden">
          <h3 className="text-[15px] font-semibold text-[#1C1C1E] px-5 py-4" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>月度汇总</h3>
          {monthly.map((m: any) => (
            <div key={m.month} className="px-5 py-3" style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
              <div className="flex justify-between mb-1">
                <span className="text-[13px] font-medium text-[#1C1C1E]">{m.month}</span>
                <span className="text-[13px] font-semibold" style={{ color: m.netFlowFen >= 0 ? '#34C759' : '#FF3B30' }}>{m.netFlowFen >= 0 ? '+' : ''}{formatFenAsYuan(m.netFlowFen)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-[#8E8E93]">
                <span>入 {formatFenAsYuan(m.inflowFen)} · 出 {formatFenAsYuan(m.outflowFen)}</span>
                <span>余额 {formatFenAsYuan(m.endBalanceFen)}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] text-center px-4" style={{ color: '#C7C7CC' }}>安全线 {formatFenAsYuan(safetyThresholdFen)} · 不确定收入与协商减免不计入</p>
      </div>
    </div>
  )
}
