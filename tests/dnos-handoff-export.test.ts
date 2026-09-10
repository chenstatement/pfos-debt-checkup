import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DebtAccount, FinancialProfile } from '../src/domain/types'
import { exportDnosHandoff, type PfosDnosExporterInput } from '../src/domain/dnosHandoff/exporter'
import { exportDnosHandoffV2 } from '../src/domain/dnosHandoff/exporter-v2'

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
  it('keeps the generated 1.1.0 contract schema byte-identical to the DNOS source', () => {
    const dnosRoot = resolve(process.cwd(), '..', 'DNOS协商决策')
    const sourcePath = resolve(dnosRoot, 'contracts/pfos-dnos-handoff/v1.1.0/schema.json')
    const generatedPath = resolve(process.cwd(), 'src/domain/dnosHandoff/generated/schema-1.1.0.json')
    const manifestPath = resolve(process.cwd(), 'src/domain/dnosHandoff/generated/source-manifest.json')
    const source = readFileSync(sourcePath)
    const generated = readFileSync(generatedPath)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { schema: { sha256: string } }
    expect(Buffer.compare(source, generated)).toBe(0)
    expect(createHash('sha256').update(source).digest('hex')).toBe(manifest.schema.sha256)
  })

  it('exports the 1.1.0 contract and computes a digest', async () => {
    const result = await exportDnosHandoff(input(), { packageId: '1c89992a-cbd1-4bc0-a8d2-12ad1193e315', exportedAt: '2026-08-09T08:00:00+08:00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts).toHaveLength(1)
    expect(result.package.payload_hash_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.package.schema_version).toBe('1.1.0')
    expect(result.package.debts[0].entity_roles[0].role).toBe('legal_lender')
    expect(result.package.debts[0].entity_roles[0].entity_ref).toBe('ENTITY_001')
    expect(Object.keys(result.package).sort()).toEqual([
      'assets', 'cashflow', 'consent', 'data_as_of', 'debts', 'decision_preferences', 'evidence_index', 'exported_at', 'hardship', 'missing_fields', 'package_id',
      'payload_hash_sha256', 'pii_exclusion_confirmed', 'risk_codes', 'schema_version', 'source_app', 'source_app_version', 'source_rule_version', 'subject_ref', 'currency', 'timezone',
    ].sort())
    expect(Object.keys(result.package.debts[0]).sort()).toEqual(['account_state', 'amounts', 'contract', 'data_confidence', 'debt_ref', 'debt_type', 'entity_roles', 'evidence_refs', 'product', 'schedule', 'security'].sort())
  })

  it('maps same and different creditor names only to local references', async () => {
    const result = await exportDnosHandoff(input({ debts: [debt(), debt({ id: 'debt-2', creditorName: '另一家机构' })] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts.map((item) => item.entity_roles[0].entity_ref)).toEqual(['ENTITY_001', 'ENTITY_002'])
  })

  it('maps assets, overdue days and risk codes without emitting PII', async () => {
    const result = await exportDnosHandoff(input({
      debts: [debt({ status: 'overdue', overdueSince: '2026-08-01', hasCollateral: true, hasGuarantor: true })],
      assets: [{ amountFen: 1000000, realizableAmountFen: 900000, liquid: true, essentialUse: true, pledged: true }],
    }), { exportedAt: '2026-08-09T08:00:00+08:00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.debts[0].account_state.delinquency_days).toBe(8)
    expect(result.package.assets).toMatchObject({ liquid_assets_fen: 900000, essential_assets_fen: 1000000, pledged_assets_fen: 1000000, voluntary_disposable_assets_fen: 0, asset_data_status: 'self_reported' })
    expect(result.package.risk_codes).toEqual(expect.arrayContaining(['DEBT_OVERDUE', 'COLLATERAL_OR_GUARANTEE']))
    expect(result.json).toContain('测试银行')
    expect(result.json).not.toContain('13800138000')
    expect(result.json).not.toContain('张三')
    expect(result.json).not.toContain('creditorName')
    expect(result.json).not.toContain('userNote')
    expect(result.json).not.toContain('communications')
  })

  it('roundtrips the PFOS export through the DNOS main-process validator', async () => {
    const result = await exportDnosHandoff(input(), {
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
      expect(JSON.stringify(imported)).not.toContain('raw_payload')
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  })

  it('blocks a suspected sensitive value in PFOS free text', async () => {
    const result = await exportDnosHandoff(input({ debts: [debt({ userNote: '客户手机号 13800138000，姓名张三' })] }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('PII_VALUE_SUSPECTED')
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

describe('PFOS DNOS business-complete v2 exporter', () => {
  it('exports the complete business snapshot and roundtrips through DNOS validation', async () => {
    const result = await exportDnosHandoffV2({
      consent: { id: 'consent-v2', userId: 'local_user', consentType: 'privacy', documentVersion: '1.0.0', acceptedAt: '2026-08-17T07:00:00+08:00' },
      profile: { availableCashFen: 500000, protectedCashFen: 300000, fixedMonthlyIncomeFen: 800000, variableMonthlyIncomeFen: 100000, essentialMonthlyExpenseFen: 350000 },
      incomes: [{ id: 'income-1', source: 'salary', label: '主业收入', amountFen: 800000, recurring: true, certainty: 'confirmed' }],
      expenses: [{ id: 'expense-1', category: 'housing', label: '住房', amountFen: 200000, recurring: true, essential: true, deferrable: false, dayOfMonth: 1 }, { id: 'expense-2', category: 'food_and_utilities', label: '生活', amountFen: 150000, recurring: true, essential: true, deferrable: false, dayOfMonth: 5 }],
      debts: [debt({ id: 'debt-v2', creditorName: '测试银行', status: 'overdue', overdueSince: '2026-08-10', annualRateBps: 1800 })],
      assets: [{ id: 'asset-1', type: 'deposit', label: '活期存款', amountFen: 600000, liquid: true, ownership: 'personal', realizableAmountFen: 600000, availableDate: '2026-08-17', availabilityKnown: true, pledged: false, essentialUse: false }],
      householdObligations: [{ id: 'obligation-1', category: 'dependents', amountFen: 100000, recurring: true, essential: true }],
      dataAsOf: '2026-08-17',
    }, { packageId: '6c3a7c30-6e72-4d0b-b7a4-4a0cc8ac9db0', exportedAt: '2026-08-17T07:01:00+08:00' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.package.schema_version).toBe('2.0.0')
    expect(result.package.income_streams).toHaveLength(1)
    expect(result.package.expense_items).toHaveLength(2)
    expect(result.package.asset_items).toHaveLength(1)
    expect(result.package.household_obligations).toHaveLength(1)
    expect(result.package.debts[0].creditor_ref).toBe('ENTITY_001')
    expect(result.package.pfos_calculations.monthly_debt_due_fen).toBe(80000)
    expect(result.package.payload_hash_sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(result.json).not.toContain('userNote')

    const require = createRequire(import.meta.url)
    const { validateHandoffFile } = require(resolve(process.cwd(), '..', 'DNOS协商决策', 'electron/services/handoff-import.cjs')) as { validateHandoffFile: (filePath: string) => Promise<{ status: string; digest_match: boolean | null }> }
    const temp = await mkdtemp(resolve(tmpdir(), 'pfos-dnos-v2-roundtrip-'))
    const filePath = resolve(temp, 'handoff-v2.json')
    try {
      await writeFile(filePath, result.json)
      const imported = await validateHandoffFile(filePath)
      expect(imported.status).toBe('accepted')
      expect(imported.digest_match).toBe(true)

      const dnosRoot = resolve(process.cwd(), '..', 'DNOS协商决策')
      const { createDatabase } = require(resolve(dnosRoot, 'electron/db/connection.cjs'))
      const { migrateDatabase } = require(resolve(dnosRoot, 'electron/db/migrate.cjs'))
      const { createQuarantineStore } = require(resolve(dnosRoot, 'electron/services/quarantine-store.cjs'))
      const { createCaseRepository } = require(resolve(dnosRoot, 'electron/services/case-repository.cjs'))
      const { createCaseService } = require(resolve(dnosRoot, 'electron/services/case-service.cjs'))
      const { encryptString } = require(resolve(dnosRoot, 'electron/security/crypto-envelope.cjs'))
      const connection = createDatabase({ dbPath: resolve(temp, 'dnos.sqlite') })
      const key = Buffer.alloc(32, 6)
      try {
        migrateDatabase(connection)
        const store = createQuarantineStore(connection, { encryptPayload: (value: unknown, aad: string) => JSON.stringify(encryptString(JSON.stringify(value), key, aad)) })
        const repository = createCaseRepository(connection, { key })
        const service = createCaseService(repository)
        store.persistAccepted({ packageId: result.package.package_id, schemaVersion: result.package.schema_version, sourceAppVersion: result.package.source_app_version, sourceRuleVersion: result.package.source_rule_version, payloadDigest: result.package.payload_hash_sha256, rawPayload: result.package })
        const created = service.createCaseFromAcceptedHandoff({ packageId: result.package.package_id, actorRef: 'operator-local', advisorRef: 'operator-local', reviewerRef: 'reviewer-local' })
        expect(created.caseNumber).toBe('CASE_0001')
        expect(service.getCaseWorkspace(created.caseId).debts).toHaveLength(1)
      } finally {
        connection.close()
      }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  }, 15_000)
})
