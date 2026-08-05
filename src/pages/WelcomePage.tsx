import { useNavigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_TEXT, DISCLAIMER_VERSION } from '../domain/constants'

export default function WelcomePage() {
  const navigate = useNavigate()
  const { data, hasConsented, acceptConsent } = useApp()
  const hasData = data.debts.length > 0

  const handleAccept = () => {
    acceptConsent('risk_disclosure')
    navigate('/wizard')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12 safe-bottom"
         style={{ background: 'linear-gradient(180deg, #F2F2F7 0%, #E8E8ED 100%)' }}>
      {/* Hero */}
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-2xl mx-auto mb-6 flex items-center justify-center text-4xl"
             style={{ background: 'linear-gradient(135deg, #007AFF, #5856D6)', boxShadow: '0 8px 32px rgba(0,122,255,0.24)' }}>
          🩺
        </div>
        <h1 className="text-3xl font-bold mb-3 tracking-tight" style={{ color: '#1C1C1E', letterSpacing: '-0.03em' }}>
          PFOS 债务体检
        </h1>
        <p className="text-base leading-relaxed" style={{ color: '#6E6E73' }}>
          先看清最近哪一天可能出现资金缺口，<br />
          再按风险顺序一步步把问题处理清楚。
        </p>
      </div>

      {/* Feature cards */}
      <div className="w-full max-w-sm space-y-3 mb-10">
        {[
          { icon: '💰', title: '盘点全部债务', desc: '看清欠谁、欠多少、何时还', path: '/debts' },
          { icon: '📈', title: '90天现金流推演', desc: '发现资金缺口和还款碰撞日', path: '/cashflow' },
          { icon: '⚠️', title: '风险优先级排序', desc: '知道哪笔债务需要最先处理', path: '/risk' },
          { icon: '✅', title: '可执行行动清单', desc: '今天、本周、本月该做什么', path: '/actions' },
        ].map((f) => (
          <button key={f.path} type="button" onClick={() => { if (!hasConsented) acceptConsent('risk_disclosure'); navigate(f.path) }}
                  className="apple-card flex items-center gap-4 py-4 px-5 w-full text-left cursor-pointer tap-active transition-shadow hover:shadow-md">
            <span className="text-2xl">{f.icon}</span>
            <div>
              <p className="text-[15px] font-semibold text-[#1C1C1E]">{f.title}</p>
              <p className="text-[13px] text-[#8E8E93] mt-0.5">{f.desc}</p>
            </div>
          </button>
        ))}
      </div>

      {/* Disclaimer */}
      <div className="w-full max-w-sm rounded-2xl p-5 mb-8"
           style={{ background: 'rgba(255,149,0,0.06)', border: '1px solid rgba(255,149,0,0.15)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: '#FF9500' }}>⚠️ 重要声明</p>
        <p className="text-xs leading-relaxed mb-2" style={{ color: '#B37400' }}>
          {DISCLAIMER_TEXT}
        </p>
        <p className="text-[11px]" style={{ color: '#CC8800' }}>
          声明版本：{DISCLAIMER_VERSION}
        </p>
      </div>

      {/* CTA — 根据状态显示不同按钮 */}
      <div className="w-full max-w-sm space-y-3">
        {hasData ? (
          <>
            <button onClick={() => navigate('/dashboard')}
                    className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]"
                    style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
  查看我的体检报告
            </button>
            <button onClick={() => navigate('/wizard')} className="apple-btn apple-btn-secondary w-full">
  继续录入数据
            </button>
          </>
        ) : hasConsented ? (
          <button onClick={() => navigate('/wizard')}
                  className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]"
                  style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
            继续录入数据
          </button>
        ) : (
          <button onClick={handleAccept}
                  className="apple-btn apple-btn-primary w-full py-3.5 text-[17px]"
                  style={{ boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
开始整理全部债务
          </button>
        )}
      </div>

      {/* Runway entry — independent, placed after main CTA, before privacy */}
      <div className="w-full max-w-sm mt-6">
        <button type="button" onClick={() => navigate('/runway')}
                className="apple-card flex items-center gap-4 py-4 px-5 w-full text-left cursor-pointer tap-active transition-shadow hover:shadow-md"
                style={{ border: '1.5px solid rgba(0,122,255,0.2)' }}>
          <span className="text-2xl">⏳</span>
          <div>
            <p className="text-[15px] font-semibold text-[#007AFF]">不上班续航计算器</p>
            <p className="text-[13px] text-[#8E8E93] mt-0.5">20秒互动测算 · 看看现金能换来多久的选择权</p>
          </div>
          <span className="ml-auto text-[#007AFF] text-[14px]">→</span>
        </button>
      </div>

      {/* Privacy */}
      <p className="text-xs mt-8" style={{ color: '#8E8E93' }}>
        🔒 所有数据仅在本地浏览器中处理
      </p>
    </div>
  )
}
