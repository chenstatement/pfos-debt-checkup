/**
 * PFOS-v2 端到端测试数据集
 *
 * 目的：用贴近真实、且覆盖已知缺陷边界的财务场景，喂入 generateFullReport，
 * 以复现 REVIEW.md（2026-07-29）登记的问题，并验证部分问题是否已在代码中修复。
 *
 * 金额单位：fen（分）。yuan(n) = n 元换算为分。
 * 基准日期 AS_OF 固定为 2026-07-30（与运行环境当前日期一致），避免依赖系统时钟。
 */

import type { DebtAccount, FinancialProfile, DebtType, RepaymentMethod, DebtStatus } from '../domain/types'

export const AS_OF = '2026-07-30'

const yuan = (n: number) => Math.round(n * 100)

let seq = 0
const uid = (prefix: string) => `${prefix}_${(++seq).toString().padStart(3, '0')}`

interface DebtSeed {
  creditorName: string
  debtType: DebtType
  outstandingPrincipalYuan: number
  currentAmountDueYuan: number
  monthlyPaymentYuan?: number
  nextDueDate: string
  dueDay?: number
  annualRateBps?: number
  repaymentMethod: RepaymentMethod
  status: DebtStatus
  overdueSince?: string
  expectedRepayDate?: string
  hasCollateral?: boolean
  hasGuarantor?: boolean
  hasCoBorrower?: boolean
  affectsEssentialLiving?: boolean
  dataConfidence?: DebtAccount['dataConfidence']
  source?: DebtAccount['source']
}

function mkDebt(seed: DebtSeed): DebtAccount {
  const now = '2026-07-30T08:00:00.000Z'
  return {
    id: uid('debt'),
    userId: 'u1',
    creditorName: seed.creditorName,
    debtType: seed.debtType,
    currency: 'CNY',
    outstandingPrincipalFen: yuan(seed.outstandingPrincipalYuan),
    currentAmountDueFen: yuan(seed.currentAmountDueYuan),
    monthlyPaymentFen: seed.monthlyPaymentYuan !== undefined ? yuan(seed.monthlyPaymentYuan) : undefined,
    nextDueDate: seed.nextDueDate,
    dueDay: seed.dueDay,
    annualRateBps: seed.annualRateBps,
    repaymentMethod: seed.repaymentMethod,
    status: seed.status,
    overdueSince: seed.overdueSince,
    expectedRepayDate: seed.expectedRepayDate,
    hasCollateral: seed.hasCollateral ?? false,
    hasGuarantor: seed.hasGuarantor ?? false,
    hasCoBorrower: seed.hasCoBorrower ?? false,
    affectsEssentialLiving: seed.affectsEssentialLiving,
    dataConfidence: seed.dataConfidence ?? 'confirmed',
    source: seed.source ?? 'manual',
    createdAt: now,
    updatedAt: now,
  }
}

function mkProfile(p: Partial<FinancialProfile>): Partial<FinancialProfile> {
  return {
    id: 'u1',
    userId: 'u1',
    availableCashFen: 0,
    fixedMonthlyIncomeFen: 0,
    essentialMonthlyExpenseFen: 0,
    paydayRules: [],
    dataAsOf: AS_OF,
    createdAt: '2026-07-30T08:00:00.000Z',
    updatedAt: '2026-07-30T08:00:00.000Z',
    ...p,
  }
}

// ── 场景 1：典型多债家庭（含逾期未标记 / dueDay 缺失 / 高息 / 影响基本生活 / 已结清）──
export const scenarioMultiDebt = {
  name: '典型多债家庭',
  profile: mkProfile({
    availableCashFen: yuan(10000),
    protectedCashFen: yuan(3000),
    fixedMonthlyIncomeFen: yuan(16000),
    essentialMonthlyExpenseFen: yuan(9000),
    paydayRules: [{ id: uid('pay'), dayOfMonth: 15, amountFen: yuan(16000), confidence: 'confirmed' }],
  }),
  incomes: [
    { id: uid('inc'), label: '工资', amountFen: yuan(16000), dayOfMonth: 15, recurring: true, certainty: 'confirmed' },
  ],
  expenses: [
    { id: uid('exp'), label: '房租', amountFen: yuan(5000), dayOfMonth: 1, recurring: true, essential: true },
    { id: uid('exp'), label: '生活费', amountFen: yuan(4000), dayOfMonth: 10, recurring: true, essential: true },
  ],
  debts: [
    // D1 信用卡：5 号到期，但未填 dueDay → 后续月供应落在 20 号（CR-02 日期编造）
    mkDebt({
      creditorName: '招商信用卡',
      debtType: 'credit_card',
      outstandingPrincipalYuan: 60000,
      currentAmountDueYuan: 6000,
      monthlyPaymentYuan: 6000,
      nextDueDate: '2026-08-05',
      annualRateBps: 1800,
      repaymentMethod: 'minimum_payment',
      status: 'normal',
    }),
    // D2 银行消费贷：20 号到期，dueDay 正确
    mkDebt({
      creditorName: '银行消费贷',
      debtType: 'bank_consumer_loan',
      outstandingPrincipalYuan: 30000,
      currentAmountDueYuan: 3500,
      monthlyPaymentYuan: 3500,
      nextDueDate: '2026-08-20',
      dueDay: 20,
      annualRateBps: 1200,
      repaymentMethod: 'equal_installment',
      status: 'normal',
    }),
    // D3 网络小贷：28 号已过期（< AS_OF）但 status 仍 normal → 未被识别为逾期（CR-05 / WR-02）
    mkDebt({
      creditorName: '网络小贷',
      debtType: 'online_microloan',
      outstandingPrincipalYuan: 8000,
      currentAmountDueYuan: 2000,
      monthlyPaymentYuan: 2000,
      nextDueDate: '2026-07-28',
      annualRateBps: 3600, // 36% 超高息
      repaymentMethod: 'flexible',
      status: 'normal',
    }),
    // D4 亲友借款：影响基本生活 + 大额 → 应触发 R08（正确路径示范）
    mkDebt({
      creditorName: '亲友借款',
      debtType: 'personal_borrowing',
      outstandingPrincipalYuan: 20000,
      currentAmountDueYuan: 10000,
      monthlyPaymentYuan: 10000,
      nextDueDate: '2026-09-15',
      dueDay: 15,
      annualRateBps: 0,
      repaymentMethod: 'flexible',
      status: 'normal',
      affectsEssentialLiving: true,
    }),
    // D5 已结清：应从所有计算中被排除（WR-05）
    mkDebt({
      creditorName: '已结清示例贷',
      debtType: 'installment',
      outstandingPrincipalYuan: 0,
      currentAmountDueYuan: 0,
      nextDueDate: '2026-06-01',
      repaymentMethod: 'equal_installment',
      status: 'closed',
    }),
  ],
}

// ── 场景 2：现金充裕、可完全覆盖（检验 CR-03 现金硬编码是否修复）──
export const scenarioCashRich = {
  name: '现金充裕可覆盖',
  profile: mkProfile({
    availableCashFen: yuan(1000000), // ¥100 万
    fixedMonthlyIncomeFen: yuan(16000),
    essentialMonthlyExpenseFen: yuan(9000),
    paydayRules: [{ id: uid('pay'), dayOfMonth: 15, amountFen: yuan(16000), confidence: 'confirmed' }],
  }),
  incomes: [
    { id: uid('inc'), label: '工资', amountFen: yuan(16000), dayOfMonth: 15, recurring: true, certainty: 'confirmed' },
  ],
  expenses: [
    { id: uid('exp'), label: '房租', amountFen: yuan(5000), dayOfMonth: 1, recurring: true, essential: true },
    { id: uid('exp'), label: '生活费', amountFen: yuan(4000), dayOfMonth: 10, recurring: true, essential: true },
  ],
  debts: [
    mkDebt({
      creditorName: '小额消费贷',
      debtType: 'bank_consumer_loan',
      outstandingPrincipalYuan: 10000,
      currentAmountDueYuan: 1000,
      monthlyPaymentYuan: 1000,
      nextDueDate: '2026-08-15',
      dueDay: 15,
      annualRateBps: 1200,
      repaymentMethod: 'equal_installment',
      status: 'normal',
    }),
  ],
}

// ── 场景 3：仅填 profile 字段、无明细列表（检验 CR-02 兜底路径的日期硬编码）──
export const scenarioProfileOnly = {
  name: '仅填 profile 无明细',
  profile: mkProfile({
    availableCashFen: yuan(10000),
    fixedMonthlyIncomeFen: yuan(16000),
    essentialMonthlyExpenseFen: yuan(9000),
    paydayRules: [{ id: uid('pay'), dayOfMonth: 10, amountFen: yuan(16000), confidence: 'confirmed' }],
  }),
  incomes: [], // 故意留空，走兜底
  expenses: [], // 故意留空，走兜底
  debts: [
    mkDebt({
      creditorName: '信用卡',
      debtType: 'credit_card',
      outstandingPrincipalYuan: 30000,
      currentAmountDueYuan: 3000,
      monthlyPaymentYuan: 3000,
      nextDueDate: '2026-08-10',
      dueDay: 10,
      annualRateBps: 1800,
      repaymentMethod: 'minimum_payment',
      status: 'normal',
    }),
  ],
}

export const allScenarios = [scenarioMultiDebt, scenarioCashRich, scenarioProfileOnly]
