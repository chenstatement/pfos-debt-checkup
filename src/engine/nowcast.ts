/**
 * PFOS Nowcast Engine — 90-Day Daily Precision Cashflow Projection
 *
 * Ported from existing PFOS nowcast.js, adapted to:
 * - TypeScript with full type safety
 * - MoneyFen (integer fen) instead of floating-point
 * - Rule version tracking
 *
 * Core value: answers "On October 15th, will I have enough cash
 * to cover the credit card payment AND rent?"
 */

import type { ISODate, MoneyFen, DailyForecastPoint, ForecastSnapshot, CashflowEvent } from '../domain/types'
import { addFen, subFen, gapFen, sumFen } from '../domain/money'
import { RULE_VERSION, THRESHOLDS } from '../domain/constants'

// ── Configuration ──────────────────────────────────────────

const DEFAULT_HORIZON = THRESHOLDS.FORECAST_HORIZON_DAYS // 90 days
const SAFETY_MONTHS = 1

// ── Internal Event Model ───────────────────────────────────

interface DayEvent {
  type: string
  direction: 'in' | 'out'
  label: string
  amountFen: MoneyFen
  annualRateBps?: number
  debtId?: string
  assetId?: string
}

interface IncomeInput {
  id?: string
  source?: string
  label?: string
  amount?: number   // monthly amount in YUAN (legacy, prefer amountFen)
  amountFen?: MoneyFen
  dayOfMonth?: number
  recurring?: boolean
  oneTimeDate?: string
  certainty?: 'confirmed' | 'likely' | 'uncertain'
}

interface ExpenseInput {
  id?: string
  category?: string
  label?: string
  amount?: number
  amountFen?: MoneyFen
  dayOfMonth?: number
  recurring?: boolean
  oneTimeDate?: string
  essential?: boolean
  deferrable?: boolean
}

interface DebtInput {
  id?: string
  platform?: string
  creditorName?: string
  monthlyPayment?: number
  currentDueAmount?: number
  currentDueAmountFen?: MoneyFen
  currentAmountDueFen?: MoneyFen   // DebtAccount compat
  outstandingPrincipalFen?: MoneyFen
  monthlyPaymentFen?: MoneyFen
  annualRate?: number
  annualRateBps?: number
  dueDay?: number
  nextDueDate?: string
  overdue?: boolean
  termKnown?: boolean
  termRemaining?: number
  status?: string
  overdueSince?: string
  expectedRepayDate?: string       // for overdue: single payment on this date
}

interface AssetInput {
  id?: string
  type?: string
  label?: string
  amount?: number
  liquid?: boolean
  ownership?: string
  realizableAmount?: number
  realizableAmountFen?: MoneyFen
  availableDate?: string
  availabilityKnown?: boolean
  pledged?: boolean
  essentialUse?: boolean
}

interface NowcastOptions {
  horizonDays?: number
  startDate?: ISODate
  snapshot?: {
    availableCash?: number | null | string
    availableCashFen?: MoneyFen
    protectedCash?: number
    protectedCashFen?: MoneyFen
    asOfDate?: ISODate
  }
}

export interface NowcastResult {
  dailyLedger: DailyForecastPoint[]
  runwayDays: number
  dangerDays: ISODate[]
  collisionDays: { date: ISODate; payments: { label: string; amountFen: MoneyFen }[]; balanceFen: MoneyFen }[]
  worstDay: { date: ISODate; balanceFen: MoneyFen } | null
  firstGapDate: ISODate | null
  firstGapAmountFen: MoneyFen
  maxGapAmountFen: MoneyFen
  maxGapDate: ISODate | null
  safetyThresholdFen: MoneyFen
  totalInflowFen: MoneyFen
  totalOutflowFen: MoneyFen
  horizonDays: number
  todayBalanceFen: MoneyFen
  startingCashFen: MoneyFen
  protectedCashFen: MoneyFen
  gap30dFen: MoneyFen
  gap60dFen: MoneyFen
  gap90dFen: MoneyFen
}

// ── Main Entry Point ───────────────────────────────────────

export function generateNowcast(
  incomes: IncomeInput[] = [],
  expenses: ExpenseInput[] = [],
  debts: DebtInput[] = [],
  assets: AssetInput[] = [],
  options: NowcastOptions = {}
): NowcastResult {
  const horizon = options.horizonDays || DEFAULT_HORIZON
  const startDate = options.startDate || todayISO()
  const snapshot = options.snapshot || {}

  // ── Starting cash ─────────────────────────────────────────
  let startingCashFen: MoneyFen

  if (snapshot.availableCashFen !== undefined && snapshot.availableCashFen !== null) {
    startingCashFen = snapshot.availableCashFen
  } else if (snapshot.availableCash !== '' && snapshot.availableCash != null && Number.isFinite(Number(snapshot.availableCash))) {
    startingCashFen = Math.round(Number(snapshot.availableCash) * 100) // Legacy: yuan -> fen
  } else {
    // Fall back to immediately liquid assets (legacy behavior)
    startingCashFen = assets
      .filter(a =>
        (a.liquid || a.type === 'cash' || a.type === 'deposit') &&
        !a.pledged && !a.essentialUse &&
        a.ownership !== 'consent_required' &&
        (!a.availableDate || a.availableDate <= startDate)
      )
      .reduce((s, a) => {
        if (a.realizableAmountFen !== undefined) return addFen(s, a.realizableAmountFen)
        return addFen(s, Math.round((a.realizableAmount || a.amount || 0) * 100))
      }, 0 as MoneyFen)
  }

  // ── Safety threshold ──────────────────────────────────────
  const monthlyBasicLivingFen = expenses
    .filter(e => e.recurring !== false && e.essential !== false)
    .reduce((s, e) => {
      if (e.amountFen !== undefined) return addFen(s, e.amountFen)
      return addFen(s, Math.round((e.amount || 0) * 100))
    }, 0 as MoneyFen)

  const protectedCashFen = snapshot.protectedCashFen ?? Math.round((snapshot.protectedCash || 0) * 100)
  const safetyThresholdFen = Math.max(monthlyBasicLivingFen * SAFETY_MONTHS, protectedCashFen)

  // ── Build daily ledger ────────────────────────────────────
  const dailyLedger: DailyForecastPoint[] = []
  let runningBalanceFen = startingCashFen

  for (let day = 0; day < horizon; day++) {
    const currentDate = addDays(startDate, day)
    const dayEvents = expandDayEvents(
      currentDate, startDate, incomes, expenses, debts, assets,
      snapshot.availableCashFen !== undefined || (snapshot.availableCash != null && snapshot.availableCash !== '')
    )

    const inflowFen = sumFen(dayEvents.filter(e => e.direction === 'in').map(e => e.amountFen))
    const outflowFen = sumFen(dayEvents.filter(e => e.direction === 'out').map(e => e.amountFen))

    runningBalanceFen = addFen(runningBalanceFen, subFen(inflowFen, outflowFen))

    // Convert dayEvents to storable ForecastEvent format
    const forecastEvents = dayEvents.map(e => ({
      type: e.type,
      direction: (e.direction === 'in' ? 'inflow' : 'outflow') as 'inflow' | 'outflow',
      label: e.label,
      amountFen: e.amountFen,
      debtId: e.debtId,
      assetId: e.assetId,
    }))

    dailyLedger.push({
      date: currentDate,
      openingBalanceFen: subFen(runningBalanceFen, subFen(inflowFen, outflowFen)),
      inflowFen,
      outflowFen,
      closingBalanceFen: runningBalanceFen,
      events: forecastEvents,
      eventIds: dayEvents.map(e => e.debtId || e.assetId || '').filter(Boolean),
    })
  }

  // ── Derived metrics ───────────────────────────────────────

  // Runway & first gap
  let runwayDays = horizon
  let firstGapDate: ISODate | null = null
  let firstGapAmountFen: MoneyFen = 0

  for (let i = 0; i < dailyLedger.length; i++) {
    if (dailyLedger[i].closingBalanceFen < 0) {
      runwayDays = i
      firstGapDate = dailyLedger[i].date
      firstGapAmountFen = gapFen(dailyLedger[i].closingBalanceFen)
      break
    }
  }

  // Danger days
  const dangerDays = dailyLedger
    .filter(d => d.closingBalanceFen < safetyThresholdFen)
    .map(d => d.date)

  // Collision days (2+ debt payments on same day — detected during expansion)
  // We re-detect from the ledger events
  const collisionDays: NowcastResult['collisionDays'] = []
  const seenCollisionDates = new Set<string>()

  for (const d of dailyLedger) {
    if (seenCollisionDates.has(d.date)) continue
    // Re-expand to find collision
    const events = expandDayEvents(
      d.date, startDate, incomes, expenses, debts, assets,
      snapshot.availableCashFen !== undefined || (snapshot.availableCash != null && snapshot.availableCash !== '')
    )
    const debtPayments = events.filter(e => e.type === 'debt_payment')
    if (debtPayments.length >= 2) {
      seenCollisionDates.add(d.date)
      collisionDays.push({
        date: d.date,
        payments: debtPayments.map(e => ({ label: e.label, amountFen: e.amountFen })),
        balanceFen: d.closingBalanceFen,
      })
    }
  }

  // Worst day
  let worstDay: NowcastResult['worstDay'] = null
  let minBalanceFen = Infinity
  for (const d of dailyLedger) {
    if (d.closingBalanceFen < minBalanceFen) {
      minBalanceFen = d.closingBalanceFen
      worstDay = { date: d.date, balanceFen: d.closingBalanceFen }
    }
  }

  const maxGapAmountFen = worstDay && worstDay.balanceFen < 0 ? gapFen(worstDay.balanceFen) : 0
  const maxGapDate = maxGapAmountFen > 0 ? worstDay?.date ?? null : null

  // Totals
  const totalInflowFen = sumFen(dailyLedger.map(d => d.inflowFen))
  const totalOutflowFen = sumFen(dailyLedger.map(d => d.outflowFen))

  // Gap calculations for 30/60/90 day windows
  const gap30dFen = computeWindowGap(dailyLedger, 30)
  const gap60dFen = computeWindowGap(dailyLedger, 60)
  const gap90dFen = computeWindowGap(dailyLedger, 90)

  const todayBalanceFen = dailyLedger.length > 0 ? dailyLedger[0].closingBalanceFen : startingCashFen

  return {
    dailyLedger,
    runwayDays,
    dangerDays,
    collisionDays,
    worstDay,
    firstGapDate,
    firstGapAmountFen,
    maxGapAmountFen,
    maxGapDate,
    safetyThresholdFen,
    totalInflowFen,
    totalOutflowFen,
    horizonDays: horizon,
    todayBalanceFen,
    startingCashFen,
    protectedCashFen,
    gap30dFen,
    gap60dFen,
    gap90dFen,
  }
}

// ── Day Event Expansion ────────────────────────────────────

function expandDayEvents(
  date: ISODate,
  startDate: ISODate,
  incomes: IncomeInput[],
  expenses: ExpenseInput[],
  debts: DebtInput[],
  assets: AssetInput[],
  hasSnapshotCash: boolean
): DayEvent[] {
  const events: DayEvent[] = []
  const dayNum = new Date(date).getDate()
  const daysInMonth = new Date(
    new Date(date).getFullYear(),
    new Date(date).getMonth() + 1,
    0
  ).getDate()

  // ── Income events ─────────────────────────────────────────
  for (const inc of incomes) {
    const amountFen = inc.amountFen ?? Math.round((inc.amount || 0) * 100)
    if (amountFen <= 0) continue
    if (inc.certainty === 'uncertain') continue

    if (inc.recurring === false && inc.oneTimeDate) {
      if (inc.oneTimeDate === date) {
        events.push({ type: 'income', direction: 'in', label: inc.label || inc.source || '收入', amountFen })
      }
    } else {
      const targetDay = inc.dayOfMonth || 15
      const effectiveDay = Math.min(targetDay, daysInMonth)
      if (dayNum === effectiveDay) {
        events.push({ type: 'income', direction: 'in', label: inc.label || inc.source || '收入', amountFen })
      }
    }
  }

  // ── Expense events ────────────────────────────────────────
  for (const exp of expenses) {
    const amountFen = exp.amountFen ?? Math.round((exp.amount || 0) * 100)
    if (amountFen <= 0) continue

    if (exp.recurring === false && exp.oneTimeDate) {
      if (exp.oneTimeDate === date) {
        events.push({ type: 'expense', direction: 'out', label: exp.label || exp.category || '支出', amountFen })
      }
    } else {
      const targetDay = exp.dayOfMonth || 1
      const effectiveDay = Math.min(targetDay, daysInMonth)
      if (dayNum === effectiveDay) {
        events.push({ type: 'expense', direction: 'out', label: exp.label || exp.category || '支出', amountFen })
      }
    }
  }

  // ── Debt payment events ───────────────────────────────────
  for (const debt of debts) {
    if (debt.status === 'closed') continue

    const regularAmountFen = debt.monthlyPaymentFen ?? Math.round((debt.monthlyPayment || 0) * 100)
    const firstAmountFen = debt.currentAmountDueFen ?? debt.currentDueAmountFen ?? Math.round((debt.currentDueAmount || 0) * 100)
    const effectiveFirstFen = firstAmountFen > 0 ? firstAmountFen : regularAmountFen

    // Treat as overdue if status='overdue' OR past-due normal debt (nextDueDate before report date)
    const isOverdue = debt.status === 'overdue' || (debt.status === 'normal' && !!debt.nextDueDate && debt.nextDueDate < startDate)
    const termKnown = debt.termKnown === true
    const remaining = Number(debt.termRemaining)
    const method = (debt as any).repaymentMethod || 'unknown'

    // 一次性还本付息：到期日一笔还清（本金+利息）
    if (method === 'balloon') {
      const maturityDate = debt.nextDueDate || ''
      if (maturityDate && date === maturityDate) {
        const rateBps = debt.annualRateBps ?? Math.round((debt.annualRate || 0) * 100)
        const principal = debt.outstandingPrincipalFen || effectiveFirstFen
        let totalPay = principal
        if (rateBps > 0 && termKnown && remaining > 0) {
          totalPay = principal + Math.round(principal * (rateBps / 10000) * (remaining / 12))
        }
        if (totalPay > 0) {
          events.push({
            type: 'debt_payment', direction: 'out',
            label: `${debt.creditorName || debt.platform || '债务'}(到期还本)`,
            amountFen: totalPay,
            annualRateBps: rateBps,
            debtId: debt.id,
          })
        }
      }
      continue
    }

    // 先息后本：每月利息按正常月供排程，末期加本金
    if (method === 'interest_first') {
      const rateBps = debt.annualRateBps ?? Math.round((debt.annualRate || 0) * 100)
      const principal = debt.outstandingPrincipalFen || effectiveFirstFen
      const interestFen = regularAmountFen > 0 ? regularAmountFen : (rateBps > 0 ? Math.round(principal * (rateBps / 10000) / 12) : effectiveFirstFen)
      if (interestFen <= 0) continue

      if (termKnown && remaining <= 0) continue
      const firstDueDate = getFirstFutureDueDate(debt, startDate)
      if (!firstDueDate) continue
      const effectiveDueDay = debt.dueDay ?? Number(firstDueDate.split('-')[2])
      const idx = paymentIndexForDate(firstDueDate, date, effectiveDueDay)
      if (idx < 0) continue
      if (termKnown && idx >= remaining) continue
      const sched = addMonthsClamped(firstDueDate, idx, effectiveDueDay)
      if (sched === date) {
        // 每月利息
        events.push({
          type: 'debt_payment', direction: 'out',
          label: `${debt.creditorName || debt.platform || '债务'}(月息)`,
          amountFen: interestFen,
          annualRateBps: rateBps,
          debtId: debt.id,
        })
        // 最后一期：同时还本金
        const isLast = termKnown && idx === remaining - 1
        if (isLast && principal > 0) {
          events.push({
            type: 'debt_payment', direction: 'out',
            label: `${debt.creditorName || debt.platform || '债务'}(还本)`,
            amountFen: principal,
            annualRateBps: rateBps,
            debtId: debt.id,
          })
        }
      }
      continue
    }

    if (effectiveFirstFen <= 0 && regularAmountFen <= 0) continue

    if (isOverdue) {
      // ── Overdue debt: catch-up + resume normal schedule ──
      // catchUpDate = 预计还款日 (if set) OR next calendar due date (accumulate)
      // catchUpDate: prefer user-set expectedRepayDate, but if it's in the past, fall back to next due date
      let catchUpDate = debt.expectedRepayDate || getFirstFutureDueDate(debt, startDate)
      if (catchUpDate && catchUpDate < startDate) {
        catchUpDate = getFirstFutureDueDate(debt, startDate) || startDate
      }
      if (!catchUpDate) continue

      // Calculate the accumulated catch-up amount:
      // = currentAmountDueFen (本期应还, may already include overdue) + overdue cushion
      // Use effectiveFirstFen which is the total due now
      const catchUpAmount = effectiveFirstFen

      // Catch-up payment on the specified date (or next due date if accumulating)
      if (date === catchUpDate) {
        const isEstimate = !debt.expectedRepayDate
        events.push({
          type: 'debt_payment',
          direction: 'out',
          label: `${debt.creditorName || debt.platform || '债务'}${isEstimate ? '(逾期累计)' : '(逾期结清)'}`,
          amountFen: catchUpAmount,
          annualRateBps: debt.annualRateBps ?? Math.round((debt.annualRate || 0) * 100),
          debtId: debt.id,
        })
      }

      // After catch-up: remaining = termRemaining - 1 (catch-up consumed index 0)
      // When termKnown is false, keep generating payments indefinitely (consistent with non-overdue path)
      const afterRemaining = termKnown ? remaining - 1 : Infinity
      const afterAmountFen = regularAmountFen > 0 ? regularAmountFen : effectiveFirstFen
      if (date > catchUpDate && afterAmountFen > 0 && afterRemaining > 0) {
        const resumeDueDate = getFirstFutureDueDate({...debt, nextDueDate: '', status: 'normal'}, startDate)
        if (resumeDueDate) {
          const effectiveDueDay2 = debt.dueDay ?? Number(resumeDueDate.split('-')[2])
          const idx = paymentIndexForDate(resumeDueDate, date, effectiveDueDay2)
          if (idx > 0 && idx <= afterRemaining) {
            const sched = addMonthsClamped(resumeDueDate, idx, effectiveDueDay2)
            if (sched === date) {
              events.push({
                type: 'debt_payment',
                direction: 'out',
                label: `${debt.creditorName || debt.platform || '债务'}`,
                amountFen: afterAmountFen,
                annualRateBps: debt.annualRateBps ?? Math.round((debt.annualRate || 0) * 100),
                debtId: debt.id,
              })
            }
          }
        }
      }
    } else {
      // ── Non-overdue: normal monthly schedule ──
      if (termKnown && remaining <= 0) continue

      const firstDueDate = getFirstFutureDueDate(debt, startDate)
      if (!firstDueDate) continue

      const effectiveDueDay3 = debt.dueDay ?? Number(firstDueDate.split('-')[2])
      const paymentIndex = paymentIndexForDate(firstDueDate, date, effectiveDueDay3)
      if (paymentIndex < 0) continue
      if (termKnown && paymentIndex >= remaining) continue

      const scheduledDate = addMonthsClamped(firstDueDate, paymentIndex, effectiveDueDay3)
      if (scheduledDate === date) {
        // paymentIndex 0 = first/current payment; >0 = future recurring payments
        // Only generate future payments if monthlyPaymentFen is explicitly set
        if (paymentIndex > 0 && regularAmountFen <= 0) continue
        const paymentFen = paymentIndex === 0 ? effectiveFirstFen : regularAmountFen
        events.push({
          type: 'debt_payment',
          direction: 'out',
          label: debt.creditorName || debt.platform || '债务',
          amountFen: paymentFen,
          annualRateBps: debt.annualRateBps ?? Math.round((debt.annualRate || 0) * 100),
          debtId: debt.id,
        })
      }
    }
  }

  // ── Asset realization events ──────────────────────────────
  for (const asset of assets) {
    // Use realizable amount (预计实际可到账) first; fall back to estimated value
    const amountFen = asset.realizableAmountFen ?? Math.round((asset.realizableAmount || asset.amount || 0) * 100)
    if (!Number.isFinite(amountFen) || amountFen <= 0) continue
    if (asset.availabilityKnown === false || !asset.availableDate || asset.availableDate === '') continue
    if (asset.pledged || asset.essentialUse) continue
    if (asset.availableDate === date) {
      const note = asset.ownership === 'consent_required' ? '(待授权)' : ''
      events.push({
        type: 'asset_realization',
        direction: 'in',
        label: `${asset.label || '资产'}变现${note}`,
        amountFen,
        assetId: asset.id,
      })
    }
  }

  return events
}

// ── Date helpers ───────────────────────────────────────────

function todayISO(): ISODate {
  return new Date().toISOString().split('T')[0]
}

function addDays(isoDate: ISODate, n: number): ISODate {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function getFirstFutureDueDate(debt: DebtInput, startDate: ISODate): ISODate | null {
  if (debt.nextDueDate && debt.nextDueDate >= startDate) return debt.nextDueDate
  // Preserve day-of-month from original nextDueDate even when past due
  const effectiveDueDay = debt.dueDay || (debt.nextDueDate ? Number(debt.nextDueDate.split('-')[2]) : null) || 20
  const [year, month, day] = startDate.split('-').map(Number)
  const thisMonth = makeClampedDate(year, month, effectiveDueDay)
  if (thisMonth >= startDate && day <= effectiveDueDay) return thisMonth
  return makeClampedDate(year, month + 1, effectiveDueDay)
}

function paymentIndexForDate(firstDueDate: ISODate, date: ISODate, dueDay: number): number {
  const [fy, fm] = firstDueDate.split('-').map(Number)
  const [y, m] = date.split('-').map(Number)
  const index = (y - fy) * 12 + (m - fm)
  if (index < 0) return -1
  return addMonthsClamped(firstDueDate, index, dueDay) === date ? index : -1
}

function addMonthsClamped(isoDate: ISODate, months: number, dayOverride: number): ISODate {
  const [year, month, originalDay] = isoDate.split('-').map(Number)
  // For the first payment (months=0), preserve the original due date exactly
  if (months === 0) return isoDate
  return makeClampedDate(year, month + months, Number(dayOverride || originalDay))
}

function makeClampedDate(year: number, oneBasedMonth: number, targetDay: number): ISODate {
  const d = new Date(Date.UTC(year, oneBasedMonth - 1, 1))
  const y = d.getUTCFullYear()
  const m = d.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  const day = Math.min(Math.max(Number(targetDay) || 1, 1), daysInMonth)
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

// ── Gap computation ────────────────────────────────────────

function computeWindowGap(ledger: DailyForecastPoint[], days: number): MoneyFen {
  const points = ledger.slice(0, days)
  let minBalance = 0
  for (const p of points) {
    if (p.closingBalanceFen < minBalance) minBalance = p.closingBalanceFen
  }
  return gapFen(minBalance)
}

// ── Monthly Aggregation ────────────────────────────────────

export interface MonthlyBucket {
  month: string
  inflowFen: MoneyFen
  outflowFen: MoneyFen
  netFlowFen: MoneyFen
  endBalanceFen: MoneyFen
  days: DailyForecastPoint[]
}

export function aggregateMonthly(dailyLedger: DailyForecastPoint[]): MonthlyBucket[] {
  const months: Record<string, MonthlyBucket> = {}

  for (const day of dailyLedger) {
    const monthKey = day.date.substring(0, 7)
    if (!months[monthKey]) {
      months[monthKey] = {
        month: monthKey,
        inflowFen: 0,
        outflowFen: 0,
        netFlowFen: 0,
        endBalanceFen: 0,
        days: [],
      }
    }
    months[monthKey].inflowFen = addFen(months[monthKey].inflowFen, day.inflowFen)
    months[monthKey].outflowFen = addFen(months[monthKey].outflowFen, day.outflowFen)
    months[monthKey].days.push(day)
  }

  const result = Object.values(months).sort((a, b) => a.month.localeCompare(b.month))
  for (const m of result) {
    m.netFlowFen = subFen(m.inflowFen, m.outflowFen)
    m.endBalanceFen = m.days[m.days.length - 1].closingBalanceFen
  }
  return result
}

// ── Nowcast Summary ────────────────────────────────────────

export function generateNowcastSummary(nc: NowcastResult): string {
  const parts: string[] = []

  if (nc.runwayDays >= nc.horizonDays) {
    parts.push(`按当前已填写数据，未来 ${nc.horizonDays} 天内未出现负余额。`)
  } else if (nc.runwayDays > 30) {
    parts.push(`预计在 ${nc.firstGapDate} 出现首次资金缺口。`)
  } else if (nc.runwayDays > 7) {
    parts.push(`⚠️ 预计在 ${nc.firstGapDate} 出现资金缺口，距今约 ${nc.runwayDays} 天。需要尽快增加收入或减少支出。`)
  } else if (nc.runwayDays > 0) {
    parts.push(`🔴 紧急：预计 ${nc.firstGapDate} 出现资金缺口，仅剩 ${nc.runwayDays} 天。必须立即采取止损措施。`)
  } else {
    parts.push(`🔴 当前现金已不足以覆盖所有应付账单，面临即时断流风险。`)
  }

  if (nc.collisionDays.length > 0) {
    const dates = nc.collisionDays.slice(0, 3).map(c => c.date).join('、')
    parts.push(`发现 ${nc.collisionDays.length} 个还款碰撞日（${dates}等），多笔债务同一天到期会加剧短期压力。`)
  }

  return parts.join('')
}

// ── Build Forecast Snapshot ────────────────────────────────

export function buildForecastSnapshot(
  userId: string,
  nowcast: NowcastResult,
  startDate: ISODate,
  inputVersion: string
): ForecastSnapshot {
  return {
    id: '',
    userId,
    startDate,
    endDate: nowcast.dailyLedger[nowcast.dailyLedger.length - 1]?.date || addDays(startDate, nowcast.horizonDays - 1),
    ruleVersion: RULE_VERSION,
    inputVersion,
    points: nowcast.dailyLedger,
    firstNegativeDate: nowcast.firstGapDate ?? undefined,
    minimumBalanceFen: nowcast.worstDay?.balanceFen ?? 0,
    gap30dFen: nowcast.gap30dFen,
    gap60dFen: nowcast.gap60dFen,
    gap90dFen: nowcast.gap90dFen,
    generatedAt: new Date().toISOString(),
  }
}
