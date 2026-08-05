/**
 * WizardPage — Apple-inspired multi-step data entry.
 * Steve's rules: dot progress, all fields visible, no collapsed sections, gentle tone.
 */
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { yuanToFen, fenToYuan, formatFenAsYuan } from '../domain/money'
import { DEBT_TYPE_LABELS } from '../domain/constants'
import type { DebtAccount, DebtType } from '../domain/types'

const STEPS = [
  { key: 'snapshot', label: '当前资金' },
  { key: 'income', label: '收入' },
  { key: 'expense', label: '支出' },
  { key: 'debts', label: '债务' },
  { key: 'assets', label: '资产' },
  { key: 'review', label: '确认' },
]
const DRAFT_KEY = 'pfos_v2_wizard_v3'
const todayISO = () => new Date().toISOString().split('T')[0]
let _id = 0; function uid() { return `id_${Date.now()}_${++_id}` }

// ── Shared styles ────────────────────────────────────────────
const inputCls = "w-full px-4 py-3 bg-[rgba(0,0,0,0.02)] border border-[rgba(0,0,0,0.08)] rounded-xl text-[16px] text-[#1C1C1E] outline-none focus:border-[#007AFF] focus:shadow-[0_0_0_3px_rgba(0,122,255,0.12)] transition-all placeholder:text-[rgba(0,0,0,0.2)]"
const labelCls = "block text-[13px] font-medium text-[#6E6E73] mb-1.5"
const btnPri = "w-full py-3.5 rounded-xl text-[16px] font-semibold text-white text-center transition-all active:scale-[0.98]"
const btnSec = "w-full py-3 rounded-xl text-[15px] font-medium text-[#007AFF] text-center transition-all active:scale-[0.98]"

export default function WizardPage() {
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const { data, updateProfile,
    addIncome: sInc, removeIncome: dInc, addExpense: sExp, removeExpense: dExp,
    addDebt: sDebt, archiveDebt, addAsset: sAst, removeAsset: dAst,
  } = useApp()

  const saved = loadDraft()
  const jump = parseInt(sp.get('step') || '')
  const initStep = Number.isFinite(jump) ? Math.min(jump, STEPS.length - 1) : (saved?.step ?? 0)
  const [step, setStep] = useState(initStep)

  // ── Form state ─────────────────────────────────────────────
  const [snap, setSnap] = useState(saved?.snapshot ?? {
    asOfDate: data.profile.dataAsOf || todayISO(),
    availableCashYuan: data.profile.availableCashFen ? String(fenToYuan(data.profile.availableCashFen)) : '',
    protectedCashYuan: '',
    stressLevel: data.profile.selfReportedStressLevel || 3,
  })

  const [incomes, setIncomes] = useState<any[]>(saved?.incomes ?? data.incomes.map(i => ({
    id: i.id, label: i.label, amountYuan: String(fenToYuan(i.amountFen)),
    dayOfMonth: i.dayOfMonth || 15, recurring: i.recurring, oneTimeDate: '',
    certainty: i.certainty,
  })))

  const [expenses, setExpenses] = useState<any[]>(saved?.expenses ?? data.expenses.map(e => ({
    id: e.id, label: e.label, amountYuan: String(fenToYuan(e.amountFen)),
    dayOfMonth: e.dayOfMonth || 1, recurring: e.recurring, oneTimeDate: '',
    essential: e.essential, deferrable: e.deferrable || false,
  })))

  const [debts, setDebts] = useState<DebtAccount[]>(saved?.debts ?? data.debts.filter((d: any) => !d.deletedAt))
  const [assets, setAssets] = useState<any[]>(saved?.assets ?? data.assets.map((a: any) => ({
    id: a.id, type: a.type, label: a.label, amountYuan: String(fenToYuan(a.amountFen)),
    ownership: a.ownership, realizableAmountYuan: String(fenToYuan(a.realizableAmountFen)),
    availabilityKnown: a.availabilityKnown, availableDate: a.availableDate, note: a.note || '',
  })))

  // ── Autosave ──────────────────────────────────────────────
  const draft = { step, snapshot: snap, incomes, expenses, debts, assets }
  useEffect(() => { saveDraft(draft) }, [step, snap, incomes, expenses, debts, assets])

  // ── Submit ────────────────────────────────────────────────
  const submit = () => {
    updateProfile({
      availableCashFen: yuanToFen(snap.availableCashYuan || '0'),
      protectedCashFen: yuanToFen(snap.protectedCashYuan || '0'),
      fixedMonthlyIncomeFen: yuanToFen('0'), essentialMonthlyExpenseFen: yuanToFen('0'),
      selfReportedStressLevel: snap.stressLevel as 1|2|3|4|5, dataAsOf: snap.asOfDate,
    })
    const wIncIds = new Set(incomes.map((i: any) => i.id)); data.incomes.forEach((i: any) => { if (!wIncIds.has(i.id)) dInc(i.id) })
    incomes.forEach((i: any) => { if (!data.incomes.find((di: any) => di.id === i.id)) sInc({ id: i.id, source: 'salary', label: i.label, amountFen: yuanToFen(i.amountYuan), dayOfMonth: i.dayOfMonth, recurring: i.recurring, oneTimeDate: i.oneTimeDate, certainty: i.certainty }) })
    const wExpIds = new Set(expenses.map((e: any) => e.id)); data.expenses.forEach((e: any) => { if (!wExpIds.has(e.id)) dExp(e.id) })
    expenses.forEach((e: any) => { if (!data.expenses.find((de: any) => de.id === e.id)) sExp({ id: e.id, category: 'other', label: e.label, amountFen: yuanToFen(e.amountYuan), dayOfMonth: e.dayOfMonth, recurring: e.recurring, oneTimeDate: e.oneTimeDate, essential: e.essential, deferrable: e.deferrable }) })
    const wDebtIds = new Set(debts.map((d: any) => d.id)); data.debts.forEach((d: any) => { if (!d.deletedAt && !wDebtIds.has(d.id)) archiveDebt(d.id) })
    debts.forEach((d: any) => {
      if (!data.debts.find((dd: any) => dd.id === d.id && !dd.deletedAt)) sDebt(d)
    })
    data.assets.forEach((a: any) => dAst(a.id))
    assets.forEach((a: any) => sAst({ id: a.id, type: a.type, label: a.label, amountFen: yuanToFen(a.amountYuan), liquid: a.availabilityKnown && !!a.availableDate && a.availableDate <= snap.asOfDate, ownership: a.ownership, realizableAmountFen: yuanToFen(a.realizableAmountYuan || a.amountYuan), availableDate: a.availabilityKnown ? a.availableDate : '', availabilityKnown: a.availabilityKnown }))
    localStorage.removeItem(DRAFT_KEY); nav('/dashboard')
  }

  // ── Inline form fields ────────────────────────────────────
  const [ifm, setIfm] = useState({ label: '', amount: '', day: '15', recurring: true, oneTimeDate: '', certainty: 'confirmed' as any })
  const [efm, setEfm] = useState({ label: '', amount: '', day: '1', recurring: true, oneTimeDate: '', essential: true, deferrable: false })
  const [dfm, setDfm] = useState({ platform: '', debtType: 'credit_card' as DebtType, currentDue: '', monthly: '', nextDueDate: '', overdue: false, overdueDays: '', overdueAmount: '', expectedRepayDate: '', dueDay: 20, annualRate: '', termRemaining: '', termKnown: false, principal: '', collectionPressure: 'none', repayMethod: 'unknown' })
  const [afm, setAfm] = useState({ type: 'deposit', label: '', amount: '', ownership: 'personal', realizableAmount: '', availabilityKnown: true, availableDate: '', note: '' })

  const canNext = step === 0 ? parseFloat(snap.availableCashYuan) >= 0 : step === 3 ? debts.length > 0 : true

  return (
    <div className="min-h-screen safe-bottom" style={{ background: '#F2F2F7' }}>
      {/* ── Sticky header ── */}
      <div className="sticky top-0 z-10 safe-top pb-3"
           style={{ background: 'rgba(242,242,247,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="max-w-md mx-auto px-5 pt-3">
          <div className="flex justify-between items-center mb-4">
            <button onClick={() => nav('/')} className="text-[15px] font-medium" style={{ color: '#007AFF' }}>关闭</button>
            <p className="text-[13px] font-medium text-[#8E8E93]">{STEPS[step].label}</p>
            <div className="w-10" />
          </div>
          <div className="flex justify-center gap-2">
            {STEPS.map((s, i) => (
              <div key={s.key} className={`step-dot ${i <= step ? 'step-dot-active' : 'step-dot-inactive'}`} />
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-5 pb-8">

        {/* ── Step 0: Current cash ─────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="section-title">现在能动用多少钱？</h2>
            <p className="section-subtitle mb-2">不需要先整理全部流水。把今天可以使用的余额合计即可。</p>
            <div className="apple-card space-y-4">
              <div><label className={labelCls}>测算基准日期</label><input type="date" value={snap.asOfDate} onChange={e => setSnap({...snap, asOfDate: e.target.value})} className={inputCls} /></div>
              <div><label className={labelCls}>今天可以动用的全部现金</label><input type="text" inputMode="decimal" value={snap.availableCashYuan} onChange={e => setSnap({...snap, availableCashYuan: e.target.value})} placeholder="0" className={inputCls} /></div>
              <div><label className={labelCls}>其中必须留给基本生活的钱 <span className="text-[#8E8E93] font-normal">选填</span></label><input type="text" inputMode="decimal" value={snap.protectedCashYuan} onChange={e => setSnap({...snap, protectedCashYuan: e.target.value})} placeholder="0" className={inputCls} /></div>
            </div>
          </div>
        )}

        {/* ── Step 1: Income ────────────────────────────────── */}
        {step === 1 && renderListStep('收入信息', '设定每笔收入的到账日', incomes, setIncomes, ifm, setIfm, (f: any) => {
          if (!f.amount || parseFloat(f.amount) <= 0) return; if (!f.recurring && !f.oneTimeDate) return
          setIncomes((p: any) => [...p, { id: uid(), label: f.label || '收入', amountYuan: f.amount, dayOfMonth: parseInt(f.day)||15, recurring: f.recurring, oneTimeDate: f.oneTimeDate, certainty: f.certainty }])
          setIfm({ label: '', amount: '', day: '15', recurring: true, oneTimeDate: '', certainty: 'confirmed' })
        }, '元/月', true)}

        {/* ── Step 2: Expense ───────────────────────────────── */}
        {step === 2 && renderListStep('必要支出', '设定每笔支出的发生日', expenses, setExpenses, efm, setEfm, (f: any) => {
          if (!f.amount || parseFloat(f.amount) <= 0) return; if (!f.recurring && !f.oneTimeDate) return
          setExpenses((p: any) => [...p, { id: uid(), label: f.label || '支出', amountYuan: f.amount, dayOfMonth: parseInt(f.day)||1, recurring: f.recurring, oneTimeDate: f.oneTimeDate, essential: f.essential, deferrable: f.deferrable }])
          setEfm({ label: '', amount: '', day: '1', recurring: true, oneTimeDate: '', essential: true, deferrable: false })
        }, '元/月', false)}

        {/* ── Step 3: Debts ─────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="section-title">债务台账</h2>
            <p className="section-subtitle">每笔债务录入后，系统会自动计算90天现金流和风险等级。</p>
            {data.debts.filter((d: any) => !d.deletedAt).length > 0 && (
              <div className="space-y-2">
                {data.debts.filter((d: any) => !d.deletedAt).map((d: any) => (
                  <div key={d.id} className="apple-card py-3 px-4 cursor-pointer tap-active" onClick={() => nav(`/debts/${d.id}`)}>
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[15px] font-semibold text-[#1C1C1E]">{d.creditorName}</span>
                        <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,0,0,0.04)', color: '#8E8E93' }}>{DEBT_TYPE_LABELS[d.debtType]}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(0,122,255,0.06)', color: '#007AFF' }}>{{'balloon':'到期还本','interest_first':'先息后本','equal_installment':'分期','minimum_payment':'最低还款','flexible':'灵活','unknown':'未知'}[d.repaymentMethod] || '未知'}</span>
                        {d.status === 'overdue' && <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}>逾期</span>}
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setDebts((p: any) => p.filter((x: any) => x.id !== d.id)); archiveDebt(d.id) }} className="text-[#8E8E93] text-sm shrink-0 ml-2">删除</button>
                    </div>
                    <div className="text-[12px] space-y-0.5" style={{ color: '#6E6E73' }}>
                      <div className="flex gap-3">
                        <span>本期应还 <b className="text-[#1C1C1E]">{formatFenAsYuan(d.currentAmountDueFen)}</b></span>
                        {d.monthlyPaymentFen > 0 && <span>月供 <b className="text-[#1C1C1E]">{formatFenAsYuan(d.monthlyPaymentFen)}</b></span>}
                        <span>{d.nextDueDate || '日期待填'}</span>
                      </div>
                      {(d.outstandingPrincipalFen > 0 || d.annualRateBps || d.termRemaining) && (
                        <div className="flex gap-3">
                          {d.outstandingPrincipalFen > 0 && <span>本金 {formatFenAsYuan(d.outstandingPrincipalFen)}</span>}
                          {d.annualRateBps && <span>年化 {(d.annualRateBps/100).toFixed(1)}%</span>}
                          {d.termRemaining && <span>{d.termRemaining}期</span>}
                        </div>
                      )}
                      {d.status === 'overdue' && d.expectedRepayDate && (
                        <div style={{ color: '#FF9500' }}>{d.expectedRepayDate} 结清逾期{d.monthlyPaymentFen > 0 ? ` · 之后月供 ${formatFenAsYuan(d.monthlyPaymentFen)}` : ' · 无后续'}</div>
                      )}
                      {d.status === 'overdue' && !d.expectedRepayDate && (
                        <div style={{ color: '#FF9500' }}>逾期累计至下个还款日 · 之后恢复月供</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Debt form — all fields visible, no collapse */}
            <div className="apple-card space-y-3">
              <select value={dfm.debtType} onChange={e => setDfm({...dfm, debtType: e.target.value as DebtType})} className={inputCls}>
                {Object.entries(DEBT_TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="text" placeholder="平台/机构名称" value={dfm.platform} onChange={e => setDfm({...dfm, platform: e.target.value})} className={inputCls} />
              <div>
                <label className={labelCls}>还款方式</label>
                <select value={dfm.repayMethod || 'unknown'} onChange={e => setDfm({...dfm, repayMethod: e.target.value})} className={inputCls}>
                  <option value="unknown">请选择</option>
                  <option value="equal_installment">分期等额还款</option>
                  <option value="balloon">一次性还本付息</option>
                  <option value="interest_first">先息后本</option>
                  <option value="minimum_payment">最低还款额</option>
                  <option value="flexible">灵活还款</option>
                </select>
              </div>
              <input type="text" inputMode="decimal" placeholder="本期应还金额" value={dfm.currentDue} onChange={e => setDfm({...dfm, currentDue: e.target.value})} className={inputCls} />
              <input type="date" value={dfm.nextDueDate} onChange={e => { setDfm({...dfm, nextDueDate: e.target.value}); if (e.target.value) setDfm(p => ({...p, dueDay: Number(e.target.value.slice(-2))})) }} className={inputCls} />
              <input type="text" inputMode="decimal" placeholder="之后每月常规还款额（选填，不填则只计首期）" value={dfm.monthly} onChange={e => setDfm({...dfm, monthly: e.target.value})} className={inputCls} />
              <input type="text" inputMode="decimal" placeholder="剩余本金（选填）" value={dfm.principal} onChange={e => setDfm({...dfm, principal: e.target.value})} className={inputCls} />
              <input type="text" inputMode="decimal" placeholder="年化利率 %（选填）" value={dfm.annualRate} onChange={e => setDfm({...dfm, annualRate: e.target.value})} className={inputCls} />
              <div className="flex items-center gap-3">
                <input type="text" inputMode="numeric" placeholder="剩余期数（含本期）" value={dfm.termRemaining} onChange={e => setDfm({...dfm, termRemaining: e.target.value, termKnown: !!e.target.value})} className={`${inputCls} flex-1`} />
                <span className="text-[13px] text-[#8E8E93]">期</span>
              </div>
              {/* Overdue */}
              <div className="flex items-center gap-3 py-1">
                <span className="text-[14px] text-[#1C1C1E]">已逾期</span>
                <button onClick={() => setDfm({...dfm, overdue: !dfm.overdue})}
                        className={`relative w-12 h-7 rounded-full transition-colors ${dfm.overdue ? 'bg-[#FF3B30]' : 'bg-[rgba(0,0,0,0.15)]'}`}>
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${dfm.overdue ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {dfm.overdue && (
                <div className="space-y-3 rounded-xl p-4" style={{ background: 'rgba(255,59,48,0.04)' }}>
                  <div><label className={labelCls}>逾期天数</label><input type="text" inputMode="numeric" placeholder="0" value={dfm.overdueDays} onChange={e => setDfm({...dfm, overdueDays: e.target.value})} className={inputCls} /></div>
                  <div><label className={labelCls}>当前逾期总额 <span className="text-[#8E8E93] font-normal">选填</span></label><input type="text" inputMode="decimal" placeholder="0" value={dfm.overdueAmount} onChange={e => setDfm({...dfm, overdueAmount: e.target.value})} className={inputCls} /></div>
                  <div><label className={labelCls}>预计还款时间 <span className="text-[#8E8E93] font-normal">计划哪天处理这笔逾期</span></label><input type="date" value={dfm.expectedRepayDate} onChange={e => setDfm({...dfm, expectedRepayDate: e.target.value})} className={inputCls} /></div>
                </div>
              )}
              <button onClick={() => {
                const due = parseFloat(dfm.currentDue) || parseFloat(dfm.monthly) || parseFloat(dfm.overdueAmount)
                if (!dfm.platform.trim() || due <= 0) return
                const now = new Date().toISOString()
                const newDebt = {
                  id: uid(), userId: 'local_user', creditorName: dfm.platform.trim(), debtType: dfm.debtType, currency: 'CNY' as const,
                  outstandingPrincipalFen: yuanToFen(dfm.principal || '0'),
                  currentAmountDueFen: yuanToFen(dfm.currentDue || dfm.monthly || '0'),
                  monthlyPaymentFen: dfm.monthly ? yuanToFen(dfm.monthly) : undefined,
                  nextDueDate: dfm.nextDueDate || '', dueDay: dfm.dueDay,
                  termKnown: dfm.termKnown, termRemaining: dfm.termRemaining ? parseInt(dfm.termRemaining)||undefined : undefined,
                  annualRateBps: dfm.annualRate ? Math.round(parseFloat(dfm.annualRate)*100) : undefined,
                  repaymentMethod: dfm.repayMethod as any, status: dfm.overdue ? 'overdue' : 'normal',
                  overdueSince: dfm.overdue ? (dfm.nextDueDate || todayISO()) : undefined,
                  expectedRepayDate: dfm.overdue ? (dfm.expectedRepayDate || undefined) : undefined,
                  hasCollateral: false, hasGuarantor: false, hasCoBorrower: false,
                  dataConfidence: 'estimated', source: 'manual', createdAt: now, updatedAt: now,
                }
                setDebts((p: any) => [...p, newDebt])
                sDebt(newDebt)
                setDfm({ platform: '', debtType: 'credit_card', currentDue: '', monthly: '', nextDueDate: '', overdue: false, overdueDays: '', overdueAmount: '', expectedRepayDate: '', dueDay: 20, annualRate: '', termRemaining: '', termKnown: false, principal: '', collectionPressure: 'none', repayMethod: 'unknown' })
              }} disabled={!dfm.platform.trim() || !(parseFloat(dfm.currentDue) > 0 || parseFloat(dfm.monthly) > 0 || parseFloat(dfm.overdueAmount) > 0)}
                      className={btnSec} style={{ opacity: (!dfm.platform.trim() || !(parseFloat(dfm.currentDue) > 0 || parseFloat(dfm.monthly) > 0 || parseFloat(dfm.overdueAmount) > 0)) ? 0.3 : 1 }}>
                添加这笔债务
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Assets ─────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <h2 className="section-title">可用资产</h2>
            <p className="section-subtitle">未来90天可变现的资产。已经含在"可用现金"里的不要重复填写。资产到账后会进入现金流。</p>
            {assets.length > 0 && (
              <div className="space-y-2">
                {assets.map((a: any) => (
                  <div key={a.id} className="apple-card py-3 px-4 flex justify-between items-center">
                    <div>
                      <p className="text-[15px] font-semibold text-[#1C1C1E]">{a.label}</p>
                      <p className="text-[12px] text-[#8E8E93]">{parseFloat(a.amountYuan||'0').toLocaleString()} · {a.availabilityKnown && a.availableDate ? `预计 ${a.availableDate} 到账` : '到账日未确认'}</p>
                    </div>
                    <button onClick={() => setAssets((p: any) => p.filter((x: any) => x.id !== a.id))} className="text-[#8E8E93] text-sm">删除</button>
                  </div>
                ))}
              </div>
            )}
            <div className="apple-card space-y-3">
              <select value={afm.type} onChange={e => setAfm({...afm, type: e.target.value})} className={inputCls}>
                <option value="deposit">定期存款</option><option value="investment">证券/基金</option><option value="liquid">其他可变现</option><option value="other">其他</option>
              </select>
              <input type="text" placeholder="资产名称" value={afm.label} onChange={e => setAfm({...afm, label: e.target.value})} className={inputCls} />
              <input type="text" inputMode="decimal" placeholder="资产估值" value={afm.amount} onChange={e => setAfm({...afm, amount: e.target.value})} className={inputCls} />
              <input type="text" inputMode="decimal" placeholder="预计实际可到账金额（考虑折价）" value={afm.realizableAmount} onChange={e => setAfm({...afm, realizableAmount: e.target.value})} className={inputCls} />
              <select value={afm.ownership} onChange={e => setAfm({...afm, ownership: e.target.value})} className={inputCls}>
                <option value="personal">本人自主支配</option><option value="family">家庭共同资产</option><option value="authorized">已获授权</option><option value="consent_required">需他人同意</option>
              </select>
              <div className="flex items-center gap-3 py-1">
                <span className="text-[14px] text-[#1C1C1E]">能确认到账日期</span>
                <button onClick={() => setAfm({...afm, availabilityKnown: !afm.availabilityKnown})}
                        className={`relative w-12 h-7 rounded-full transition-colors ${afm.availabilityKnown ? 'bg-[#007AFF]' : 'bg-[rgba(0,0,0,0.15)]'}`}>
                  <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${afm.availabilityKnown ? 'translate-x-5' : ''}`} />
                </button>
              </div>
              {afm.availabilityKnown && <input type="date" value={afm.availableDate} onChange={e => setAfm({...afm, availableDate: e.target.value})} className={inputCls} />}
              <button onClick={() => {
                if (!afm.amount || parseFloat(afm.amount) <= 0) return; if (afm.availabilityKnown && !afm.availableDate) return
                setAssets((p: any) => [...p, { id: uid(), type: afm.type, label: afm.label || '资产', amountYuan: afm.amount, ownership: afm.ownership, realizableAmountYuan: afm.realizableAmount || afm.amount, availabilityKnown: afm.availabilityKnown, availableDate: afm.availableDate, note: afm.note }])
                setAfm({ type: 'deposit', label: '', amount: '', ownership: 'personal', realizableAmount: '', availabilityKnown: true, availableDate: '', note: '' })
              }} disabled={!afm.amount || parseFloat(afm.amount) <= 0 || (afm.availabilityKnown && !afm.availableDate)}
                      className={btnSec} style={{ opacity: (!afm.amount || parseFloat(afm.amount) <= 0 || (afm.availabilityKnown && !afm.availableDate)) ? 0.3 : 1 }}>
                添加资产项
              </button>
            </div>
          </div>
        )}

        {/* ── Step 5: Review ─────────────────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <h2 className="section-title">确认信息</h2>
            <p className="section-subtitle">检查无误后生成报告。之后仍可随时回来修改。</p>
            <div className="apple-card space-y-3">
              <Row k="可用现金" v={`${formatFenAsYuan(yuanToFen(snap.availableCashYuan || '0'))} · 生活保留 ${formatFenAsYuan(yuanToFen(snap.protectedCashYuan || '0'))}`} />
              <Row k="收入" v={`${incomes.length} 项 · 合计 ${sumFmty(incomes)}/月`} />
              <Row k="支出" v={`${expenses.length} 项 · 合计 ${sumFmty(expenses)}/月`} />
              <Row k="债务" v={`${debts.length} 笔 · 本期应还 ${formatFenAsYuan(debts.reduce((s: number, d: any) => s + d.currentAmountDueFen, 0))}`} />
              <Row k="资产" v={assets.length > 0 ? `${assets.length} 项 · ${sumFmty(assets)}` : '无'} />
            </div>
            <div className="apple-card">
              <Row k="月度结余" v={`${sumFmty(incomes)} - ${sumFmty(expenses)} - ${formatFenAsYuan(debts.reduce((s: number, d: any) => s + d.currentAmountDueFen, 0))}`} bold />
            </div>
          </div>
        )}

        {/* ── Navigation ──────────────────────────────────────── */}
        <div className="flex gap-3 mt-8">
          {step > 0 && <button onClick={() => setStep(step-1)} className="flex-1 py-3.5 rounded-xl text-[15px] font-medium text-[#1C1C1E] text-center" style={{ background: 'rgba(0,0,0,0.04)' }}>上一步</button>}
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(step+1)} disabled={!canNext}
                    className="flex-1 py-3.5 rounded-xl text-[15px] font-semibold text-white text-center transition-all active:scale-[0.98]"
                    style={{ background: canNext ? '#007AFF' : 'rgba(0,0,0,0.1)' }}>
              下一步
            </button>
          ) : (
            <button onClick={submit}
                    className="flex-1 py-3.5 rounded-xl text-[15px] font-semibold text-white text-center transition-all active:scale-[0.98]"
                    style={{ background: '#007AFF', boxShadow: '0 4px 16px rgba(0,122,255,0.3)' }}>
              生成体检报告
            </button>
          )}
        </div>
        <p className="text-center text-[12px] mt-4" style={{ color: '#C7C7CC' }}>草稿已自动保存</p>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────
function loadDraft() { try { const r = localStorage.getItem(DRAFT_KEY); return r ? JSON.parse(r) : null } catch { return null } }
function saveDraft(d: any) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)) } catch {} }

function sumFmty(items: any[]): string {
  const fen = items.reduce((s: number, i: any) => s + yuanToFen(String(i.amountYuan || '0')), 0)
  return formatFenAsYuan(fen)
}

function fmty(v: any): string { return formatFenAsYuan(yuanToFen(String(v || '0'))) }

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return <div className="flex justify-between text-[14px]"><span style={{ color: '#6E6E73' }}>{k}</span><span style={{ color: bold ? '#1C1C1E' : '#1C1C1E', fontWeight: bold ? 600 : 400 }}>{v}</span></div>
}

function renderListStep(title: string, subtitle: string, items: any[], setItems: any, form: any, setForm: any, addFn: any, unit: string, isIncome: boolean) {
  return (
    <div className="space-y-4">
      <h2 className="section-title">{title}</h2>
      <p className="section-subtitle">{subtitle}</p>
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item: any) => (
            <div key={item.id} className="apple-card py-3 px-4 flex justify-between items-center">
              <div>
                <p className="text-[15px] font-semibold text-[#1C1C1E]">{item.label}</p>
                <p className="text-[12px] text-[#8E8E93]">{item.recurring ? `每月${item.dayOfMonth}日` : `一次性 · ${item.oneTimeDate}`}{isIncome && item.certainty === 'uncertain' ? ' · 不计入预测' : ''}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-semibold text-[#1C1C1E]">{fmty(item.amountYuan)}</span>
                <button onClick={() => setItems((p: any) => p.filter((x: any) => x.id !== item.id))} className="text-[#8E8E93] text-sm ml-1">删除</button>
              </div>
            </div>
          ))}
          <p className="text-right text-[13px] font-medium text-[#6E6E73]">合计 {sumFmty(items)}{unit}</p>
        </div>
      )}
      <div className="apple-card space-y-3">
        <input type="text" placeholder="名称" value={form.label} onChange={(e: any) => setForm({...form, label: e.target.value})} className={inputCls} />
        <div className="flex gap-2"><input type="text" inputMode="decimal" placeholder="金额" value={form.amount} onChange={(e: any) => setForm({...form, amount: e.target.value})} className={`${inputCls} flex-1`} /><span className="self-center text-[13px] text-[#8E8E93]">{form.recurring ? unit : '元'}</span></div>
        <div className="flex items-center gap-3 py-1">
          <span className="text-[14px] text-[#1C1C1E]">每月固定</span>
          <button onClick={() => setForm({...form, recurring: !form.recurring})} className={`relative w-12 h-7 rounded-full transition-colors ${form.recurring ? 'bg-[#007AFF]' : 'bg-[rgba(0,0,0,0.15)]'}`}>
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.recurring ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        {form.recurring ? <DayPick v={form.day} set={(d: string) => setForm({...form, day: d})} /> : <input type="date" value={form.oneTimeDate} onChange={(e: any) => setForm({...form, oneTimeDate: e.target.value})} className={inputCls} />}
        {isIncome && <select value={form.certainty} onChange={(e: any) => setForm({...form, certainty: e.target.value})} className={inputCls}><option value="confirmed">已确认到账</option><option value="likely">大概率到账</option><option value="uncertain">不确定（不计入预测）</option></select>}
        <button onClick={() => addFn(form)} disabled={!form.amount || parseFloat(form.amount) <= 0} className={btnSec} style={{ opacity: (!form.amount || parseFloat(form.amount) <= 0) ? 0.3 : 1 }}>添加</button>
      </div>
    </div>
  )
}

function DayPick({ v, set }: { v: string; set: (d: string) => void }) {
  return (
    <div className="flex gap-2 flex-wrap items-center">
      {[1,5,10,15,20,25,28].map(d => (
        <button key={d} onClick={() => set(String(d))} className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition-colors"
                style={{ background: v === String(d) ? '#007AFF' : 'rgba(0,0,0,0.04)', color: v === String(d) ? '#FFF' : '#1C1C1E' }}>{d}日</button>
      ))}
      <input type="number" min={1} max={31} value={v} onChange={e => set(e.target.value)} className="w-14 text-center text-[13px] rounded-lg py-1.5 border border-[rgba(0,0,0,0.1)]" />
    </div>
  )
}
