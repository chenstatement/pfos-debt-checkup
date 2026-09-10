import { useEffect, useMemo } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider } from './store/AppContext'
import { useApp, isActiveDebt } from './store/AppContext'
import { generateFullReport, type ReportInput } from './engine/report'
import ConsentGuard from './components/ConsentGuard'

// Pages & Components
import WelcomePage from './pages/WelcomePage'
import RunwayPage from './pages/RunwayPage'
import WizardPage from './pages/WizardPage'
import DashboardPage from './pages/DashboardPage'
import DebtListPage from './pages/DebtListPage'
import DebtDetailPage from './pages/DebtDetailPage'
import CashflowPage from './pages/CashflowPage'
import RiskPage from './pages/RiskPage'
import ActionCenterPage from './pages/ActionCenterPage'
import NegotiationPage from './pages/NegotiationPage'
import SettingsPage from './pages/SettingsPage'
import PIOSInboxPage from './pages/PIOSInboxPage'
import DisclaimerFooter from './components/DisclaimerFooter'
import PiosHome from './pages/PiosHome'

function GuardedRoutes() {
  const { data } = useApp()

  const report = useMemo(() => {
    const activeDebts = data.debts.filter(d => !d.deletedAt && d.status !== 'closed')
    if (activeDebts.length === 0) return null
    const profile = data.profile as ReportInput['profile']
    return generateFullReport({
      profile,
      incomes: data.incomes,
      expenses: data.expenses,
      debts: data.debts,
      assets: data.assets,
      startDate: data.dataAsOf,
    })
  }, [data])

  return (
    <Routes>
      <Route path="/dashboard" element={<DashboardPage report={report} activeDebts={data.debts} />} />
      <Route path="/debts" element={<DebtListPage />} />
      <Route path="/debts/:id" element={<DebtDetailPage />} />
      <Route path="/cashflow" element={<CashflowPage report={report} />} />
      <Route path="/risk" element={<RiskPage report={report} activeDebts={data.debts} />} />
      <Route path="/actions" element={<ActionCenterPage report={report} />} />
      <Route path="/negotiation/:debtId" element={<NegotiationPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="/pios-inbox" element={<PIOSInboxPage />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  const location = useLocation()
  useEffect(() => {
    const isPortal = location.pathname === '/'
    document.title = isPortal ? '陈述式科技 · PIOS 个人系统' : 'PFOS 债务体检'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isPortal ? '#050E17' : '#F2F2F7')
  }, [location.pathname])
  return (
    <>
      <Routes>
        <Route path="/" element={<PiosHome />} />
        <Route path="/*" element={<PfosRoutes />} />
      </Routes>
    </>
  )
}
function PfosRoutes() {
  return (
    <AppProvider>
      <div className="min-h-screen bg-pfos-bg">
        <Routes>
          <Route path="/pfos" element={<WelcomePage />} />
          <Route path="/wizard" element={<ConsentGuard><WizardPage /></ConsentGuard>} />
          <Route path="/runway" element={<RunwayPage />} />
          <Route path="/*" element={<ConsentGuard><GuardedRoutes /></ConsentGuard>} />
        </Routes>
        <DisclaimerFooter />
      </div>
    </AppProvider>
  )
}
