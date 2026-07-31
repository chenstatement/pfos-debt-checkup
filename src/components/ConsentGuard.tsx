import { Navigate } from 'react-router-dom'
import { useApp } from '../store/AppContext'
import { DISCLAIMER_VERSION } from '../domain/constants'
import type { ReactNode } from 'react'

/** Route guard: requires accepted consent at current version before data entry */
export default function ConsentGuard({ children }: { children: ReactNode }) {
  const { data } = useApp()

  const hasValidConsent =
    data.consent !== null &&
    data.consent.documentVersion === DISCLAIMER_VERSION &&
    !data.consent.revokedAt

  if (!hasValidConsent) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
