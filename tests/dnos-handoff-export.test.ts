import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DebtAccount, FinancialProfile } from '../src/domain/types'
import { exportDnosHandoff, type PfosDnosExporterInput } from '../src/domain/dnosHandoff/exporter'

const profile: Partial<FinancialProfile> = {
  availableCashFen: 500000,
  fixedMonthlyIncomeFen: 0,
  variableMonthlyIncomeFen: 0,
  essentialMonthlyExpenseFen: 350000,
}

const debt = (overrides: Partial<DebtAccount> = {}): DebtAccount => ({
  id: 'debt-1', userId: 'local_user', creditorName: '测试银行', debtType: 'bank_consumer_loan', currency: 'CNY',
  outstandingPrincipalFen: 2_000_000, currentAmountDueFen: 80_000, monthlyPaymentFen: 80_000,
  nextDueDate: '2026-08-20', annualRateBps: 980, repaymentMethod: 'equal_installment', status: 'normal',
  hasCollateral: false, hasGuarantor: false, hasCoBorrower: false, source: 'manual', dataConfidence: 'confirmed',
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z', ...overrides,
})

const input = (overrides: Partial<PfosDnosExporterInput> = {}): PfosDnosExporterInput => ({
  consent: { id: 'consent-1', userId: 'local_user', consentType: 'privacy', documentVersion: '1.0.0', acceptedAt: '2026-08-09T07:58:00+08:00' },
  profile, incomes: [], expenses: [], debts: [debt()], assets: [], dataAsOf: '2026-08-09', ...overrides,
})

describe('PFOS DNOS de-identified exporter', () => {
  it('exports the minimum contract and computes a digest', async () => {
    const result = await exportDnosHandoff(input(), { packageId: '1c89992a-cbd1-4bc0-a8d2-12ad1193e315', exportedAt: '2026-08-09T08:00:00+08:00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts).toHaveLength(1)
    expect(result.package.payload_hash_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.package.debts[0].creditor_ref).toBe('CREDITOR_001')
    expect(Object.keys(result.package).sort()).toEqual([
      'assets', 'cashflow', 'consent', 'debts', 'exported_at', 'missing_fields', 'package_id',
      'payload_hash_sha256', 'pii_exclusion_confirmed', 'risk_codes', 'schema_version',
      'source_app', 'source_app_version', 'source_rule_version', 'subject_ref',
    ].sort())
    expect(Object.keys(result.package.debts[0]).sort()).toEqual([
      'annual_rate_bps', 'balance_fen', 'creditor_ref', 'debt_ref', 'debt_type',
      'delinquency_days', 'guaranteed', 'monthly_due_fen', 'secured',
    ].sort())
  })

  it('maps same and different creditor names only to local references', async () => {
    const result = await exportDnosHandoff(input({ debts: [debt(), debt({ id: 'debt-2', creditorName: '另一家机构' })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts.map((item) => item.creditor_ref)).toEqual(['CREDITOR_001', 'CREDITOR_002'])
  })

  it('maps assets, overdue days and risk codes without emitting PII', async () => {
    const result = await exportDnosHandoff(input({
      debts: [debt({ status: 'overdue', overdueSince: '2026-08-01', hasCollateral: true, hasGuarantor: true })],
      assets: [{ amountFen: 1000000, realizableAmountFen: 900000, liquid: true, essentialUse: true, pledged: true }],
    }), { exportedAt: '2026-08-09T08:00:00+08:00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts[0].delinquency_days).toBe(8)
    expect(result.package.assets).toEqual({ liquid_assets_fen: 900000, essential_assets_fen: 1000000, pledged_assets_fen: 1000000 })
    expect(result.package.risk_codes).toEqual(expect.arrayContaining(['DEBT_OVERDUE', 'COLLATERAL_OR_GUARANTEE']))
    expect(result.json).not.toContain('测试银行')
    expect(result.json).not.toContain('13800138000')
    expect(result.json).not.toContain('张三')
    expect(result.json).not.toContain('creditorName')
    expect(result.json).not.toContain('userNote')
    expect(result.json).not.toContain('communications')
  })

  it('roundtrips the PFOS export through the DNOS main-process validator', async () => {
    const result = await exportDnosHandoff(input({ debts: [debt({ userNote: '客户手机号 13800138000，姓名张三' })] }), {
      packageId: '1c89992a-cbd1-4bc0-a8d2-12ad1193e315',
      exportedAt: '2026-08-09T08:00:00+08:00',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const require = createRequire(import.meta.url)
    const { validateHandoffFile } = require(resolve(process.cwd(), '..', 'DNOS协商决策', 'electron/services/handoff-import.cjs')) as {
      validateHandoffFile: (filePath: string) => Promise<{ status: string; digest_match: boolean | null; validation_issues: string[] }>
    }
    const temp = await mkdtemp(resolve(tmpdir(), 'pfos-dnos-roundtrip-'))
    const filePath = resolve(temp, 'handoff.json')
    try {
      await writeFile(filePath, result.json)
      const imported = await validateHandoffFile(filePath)
      expect(imported.status).toBe('accepted')
      expect(imported.digest_match).toBe(true)
      expect(JSON.stringify(imported)).not.toContain('13800138000')
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('returns an explainable error without producing output when consent or required fields are absent', async () => {
    expect((await exportDnosHandoff(input({ consent: null }))).ok).toBe(false)
    expect((await exportDnosHandoff(input({ debts: [] }))).ok).toBe(false)
    expect((await exportDnosHandoff(input({ profile: { ...profile, availableCashFen: undefined } }))).ok).toBe(false)
  })

  it('keeps the original full export action and filename in SettingsPage', () => {
    const settings = readFileSync(new URL('../src/pages/SettingsPage.tsx', import.meta.url), 'utf8')
    expect(settings).toContain('exportAllData')
    expect(settings).toContain('PFOS_data_')
    expect(settings).toContain('PFOS_DNOS_handoff_')
  })
})
