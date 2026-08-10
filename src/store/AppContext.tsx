import React, {
  createContext, useContext, useState, useCallback, useEffect, useRef,
  type ReactNode,
} from 'react'
import type { DebtAccount, FinancialProfile, ConsentRecord, ISODate, ISODateTime, MoneyFen } from '../domain/types'
import { DISCLAIMER_VERSION, isActiveDebt } from '../domain/constants'

// ── Application-level data ─────────────────────────────────

interface AppData {
  // Consent
  consent: ConsentRecord | null

  // Profile
  profile: Partial<FinancialProfile>

  // Incomes & Expenses (stored as simple records for UI convenience)
  incomes: IncomeRecord[]
  expenses: ExpenseRecord[]

  // Debts
  debts: DebtAccount[]

  // Assets
  assets: AssetRecord[]

  // CR-07: Persistent UI state
  completedActions: string[]                              // IDs of completed action items
  negotiationData: Record<string, NegotiationSaveData>    // per-debt negotiation state
  weeklyNotes: string                                     // saved weekly review notes
  privacyVisible: boolean                                 // global amount visibility

  // Meta
  dataAsOf: ISODate
  lastUpdated: ISODateTime | null
}

interface NegotiationSaveData {
  checklist: { code: string; label: string; status: 'missing' | 'ready' | 'not_applicable'; note?: string }[]
  hardship: string
  communications: { id: string; channel: string; contactedAt: string; contactParty?: string; summary: string; referenceNumber?: string }[]
}

interface IncomeRecord {
  id: string
  source: string
  label: string
  amountFen: MoneyFen
  dayOfMonth: number
  recurring: boolean
  oneTimeDate: string
  certainty: 'confirmed' | 'likely' | 'uncertain'
}

interface AssetRecord {
  id: string; type: string; label: string; amountFen: MoneyFen
  liquid: boolean; ownership: string; realizableAmountFen: MoneyFen
  availableDate: string; availabilityKnown: boolean
  pledged?: boolean; essentialUse?: boolean; note?: string
}

interface ExpenseRecord {
  id: string
  category: string
  label: string
  amountFen: MoneyFen
  dayOfMonth: number
  recurring: boolean
  oneTimeDate: string
  essential: boolean
  deferrable: boolean
}

const STORAGE_KEY = 'pfos_v2_user_data'

function createEmptyData(): AppData {
  return {
    consent: null,
    profile: {
      availableCashFen: 0,
      fixedMonthlyIncomeFen: 0,
      essentialMonthlyExpenseFen: 0,
      paydayRules: [],
      dataAsOf: new Date().toISOString().split('T')[0],
    },
    incomes: [],
    expenses: [],
    debts: [],
    assets: [],
    completedActions: [],
    negotiationData: {},
    weeklyNotes: '',
    privacyVisible: false,
    dataAsOf: new Date().toISOString().split('T')[0],
    lastUpdated: null,
  }
}

function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...createEmptyData(), ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return createEmptyData()
}

function saveData(data: AppData) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...data, lastUpdated: new Date().toISOString() }))
  } catch { /* quota exceeded */ }
}

// ── Context ────────────────────────────────────────────────

interface AppContextType {
  data: AppData
  // Consent
  acceptConsent: (type: ConsentRecord['consentType']) => void
  hasConsented: boolean
  // Profile
  updateProfile: (partial: Partial<FinancialProfile>) => void
  // Incomes
  addIncome: (income: IncomeRecord) => void
  updateIncome: (id: string, income: Partial<IncomeRecord>) => void
  removeIncome: (id: string) => void
  // Expenses
  addExpense: (expense: ExpenseRecord) => void
  updateExpense: (id: string, expense: Partial<ExpenseRecord>) => void
  removeExpense: (id: string) => void
  // Debts
  addDebt: (debt: DebtAccount) => void
  updateDebt: (id: string, debt: Partial<DebtAccount>) => void
  archiveDebt: (id: string) => void
  // Assets
  addAsset: (asset: AssetRecord) => void
  removeAsset: (id: string) => void
  // CR-07: Persistent action/negotiation/weekly state
  completedActions: string[]
  toggleActionComplete: (actionId: string) => void
  negotiationData: Record<string, NegotiationSaveData>
  saveNegotiationData: (debtId: string, data: Partial<NegotiationSaveData>) => void
  weeklyNotes: string
  saveWeeklyNotes: (notes: string) => void
  privacyVisible: boolean
  togglePrivacy: () => void
  // Export / Reset
  exportAllData: () => string
  resetAll: () => void
}

// isActiveDebt is now defined in domain/constants.ts and re-exported for backward compat
export { isActiveDebt }

const AppContext = createContext<AppContextType | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(loadData)
  const isFirstRender = useRef(true)

  // Auto-save (skip first render)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    saveData(data)
  }, [data])

  const update = useCallback((updater: (prev: AppData) => AppData) => {
    setData(prev => updater(prev))
  }, [])

  // ── Consent ──────────────────────────────────────────────
  const acceptConsent = useCallback((consentType: ConsentRecord['consentType']) => {
    update(prev => ({
      ...prev,
      consent: {
        id: `consent_${Date.now()}`,
        userId: 'local_user',
        consentType,
        documentVersion: DISCLAIMER_VERSION,
        acceptedAt: new Date().toISOString(),
      },
    }))
  }, [update])

  const hasConsented = data.consent !== null

  // ── Profile ──────────────────────────────────────────────
  const updateProfile = useCallback((partial: Partial<FinancialProfile>) => {
    update(prev => ({ ...prev, profile: { ...prev.profile, ...partial } }))
  }, [update])

  // ── Incomes ──────────────────────────────────────────────
  const addIncome = useCallback((income: IncomeRecord) => {
    update(prev => ({ ...prev, incomes: [...prev.incomes, income] }))
  }, [update])

  const updateIncome = useCallback((id: string, partial: Partial<IncomeRecord>) => {
    update(prev => ({
      ...prev,
      incomes: prev.incomes.map(i => i.id === id ? { ...i, ...partial } : i),
    }))
  }, [update])

  const removeIncome = useCallback((id: string) => {
    update(prev => ({ ...prev, incomes: prev.incomes.filter(i => i.id !== id) }))
  }, [update])

  // ── Expenses ─────────────────────────────────────────────
  const addExpense = useCallback((expense: ExpenseRecord) => {
    update(prev => ({ ...prev, expenses: [...prev.expenses, expense] }))
  }, [update])

  const updateExpense = useCallback((id: string, partial: Partial<ExpenseRecord>) => {
    update(prev => ({
      ...prev,
      expenses: prev.expenses.map(e => e.id === id ? { ...e, ...partial } : e),
    }))
  }, [update])

  const removeExpense = useCallback((id: string) => {
    update(prev => ({ ...prev, expenses: prev.expenses.filter(e => e.id !== id) }))
  }, [update])

  // ── Debts ────────────────────────────────────────────────
  const addDebt = useCallback((debt: DebtAccount) => {
    update(prev => ({ ...prev, debts: [...prev.debts, debt] }))
  }, [update])

  const updateDebt = useCallback((id: string, partial: Partial<DebtAccount>) => {
    update(prev => ({
      ...prev,
      debts: prev.debts.map(d => d.id === id ? { ...d, ...partial, updatedAt: new Date().toISOString() } : d),
    }))
  }, [update])

  const archiveDebt = useCallback((id: string) => {
    update(prev => ({
      ...prev,
      debts: prev.debts.map(d =>
        d.id === id ? { ...d, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : d
      ),
    }))
  }, [update])

  // ── Assets ────────────────────────────────────────────────
  const addAsset = useCallback((asset: AssetRecord) => {
    update(prev => ({ ...prev, assets: [...prev.assets, asset] }))
  }, [update])

  const removeAsset = useCallback((id: string) => {
    update(prev => ({ ...prev, assets: prev.assets.filter(a => a.id !== id) }))
  }, [update])

  // ── CR-07: Action completion ─────────────────────────────
  const toggleActionComplete = useCallback((actionId: string) => {
    update(prev => ({
      ...prev,
      completedActions: prev.completedActions.includes(actionId)
        ? prev.completedActions.filter(id => id !== actionId)
        : [...prev.completedActions, actionId],
    }))
  }, [update])

  // ── CR-07: Negotiation data ──────────────────────────────
  const saveNegotiationData = useCallback((debtId: string, partial: Partial<NegotiationSaveData>) => {
    update(prev => ({
      ...prev,
      negotiationData: {
        ...prev.negotiationData,
        [debtId]: { ...(prev.negotiationData[debtId] || {}), ...partial } as NegotiationSaveData,
      },
    }))
  }, [update])

  // ── CR-07: Weekly notes ──────────────────────────────────
  const saveWeeklyNotes = useCallback((notes: string) => {
    update(prev => ({ ...prev, weeklyNotes: notes }))
  }, [update])

  // ── WR-04: Privacy toggle ────────────────────────────────
  const togglePrivacy = useCallback(() => {
    update(prev => ({ ...prev, privacyVisible: !prev.privacyVisible }))
  }, [update])

  // ── Export / Reset ───────────────────────────────────────
  const exportAllData = useCallback(() => {
    return JSON.stringify(data, null, 2)
  }, [data])

  const resetAll = useCallback(() => {
    setData(createEmptyData())
    localStorage.removeItem(STORAGE_KEY)
  }, [])

  const value: AppContextType = {
    data,
    acceptConsent,
    hasConsented,
    updateProfile,
    addIncome, updateIncome, removeIncome,
    addExpense, updateExpense, removeExpense,
    addDebt, updateDebt, archiveDebt,
    addAsset, removeAsset,
    completedActions: data.completedActions,
    toggleActionComplete,
    negotiationData: data.negotiationData,
    saveNegotiationData,
    weeklyNotes: data.weeklyNotes,
    saveWeeklyNotes,
    privacyVisible: data.privacyVisible,
    togglePrivacy,
    exportAllData, resetAll,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
