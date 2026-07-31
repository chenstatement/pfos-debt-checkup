---
phase: 01-pfos-mvp
reviewed: 2026-07-29T16:30:11Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - src/App.tsx
  - src/main.tsx
  - src/vite-env.d.ts
  - src/store/AppContext.tsx
  - src/components/DisclaimerFooter.tsx
  - src/domain/constants.ts
  - src/domain/index.ts
  - src/domain/money.ts
  - src/domain/schema.ts
  - src/domain/types.ts
  - src/engine/actionPlan.ts
  - src/engine/dataQuality.ts
  - src/engine/debtPriority.ts
  - src/engine/index.ts
  - src/engine/nowcast.ts
  - src/engine/report.ts
  - src/engine/riskEngine.ts
  - src/engine/__tests__/money.test.ts
  - src/engine/__tests__/nowcast.test.ts
  - src/engine/__tests__/riskEngine.test.ts
  - src/pages/ActionCenterPage.tsx
  - src/pages/CashflowPage.tsx
  - src/pages/DashboardPage.tsx
  - src/pages/DebtDetailPage.tsx
  - src/pages/DebtListPage.tsx
  - src/pages/NegotiationPage.tsx
  - src/pages/ReportPage.tsx
  - src/pages/RiskPage.tsx
  - src/pages/SettingsPage.tsx
  - src/pages/WeeklyReviewPage.tsx
  - src/pages/WelcomePage.tsx
  - src/pages/WizardPage.tsx
  - package.json
  - README.md
findings:
  critical: 8
  warning: 8
  info: 2
  total: 18
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-07-29T16:30:11Z  
**Depth:** standard  
**Files Reviewed:** 34  
**Status:** issues_found

## Summary

PFOS-v2 currently cannot be accepted as a Phase 1 MVP. The money-in-fen foundation and basic daily ledger are useful, and all 44 Vitest assertions pass, but the production TypeScript build fails. More importantly, the real UI-to-engine data path omits or invents dates and amounts, so the advertised 90-day daily forecast, DNOS assessment, and “current most important action” can be materially wrong.

The comparison baseline was `C:\Users\chens\Desktop\AG+RD\PFOS决策\PIOS-PFOS-DNOS-第一阶段技术开发文档.md`. The mature implementation in `D:\氛围编程\PFOS` was also sampled, especially its wizard, dated income/expense/debt inputs, protected cash, asset step, and draft persistence. Although several engine files were mechanically ported, those mature input and persistence capabilities were not carried into the v2 user flow.

Verification:

- `npm run build`: **failed** with TypeScript errors in the nowcast contracts, negotiation checklist state, and stress-level setter.
- `npm test -- --run`: **passed**, 3 suites / 44 tests.
- No source file was modified by this review.

## Critical Issues

### CR-01: Production build fails

**Files:** `src/engine/nowcast.ts:34-57`, `src/engine/report.ts:69`, `src/pages/NegotiationPage.tsx:25-57`, `src/pages/WizardPage.tsx:199-203`

**Issue:** `npm run build` fails. `IncomeInput.amount` and `ExpenseInput.amount` are required even when `amountFen` is supplied, so both the report adapter and nowcast tests fail type checking. The negotiation checklist is inferred as permanently having status `"missing"`, making transitions to `"ready"` or `"not_applicable"` invalid. The stress-level state is inferred as the union `1|2|3|4|5`, but the mapped value is a plain `number`.

**Fix:** Make legacy yuan fields optional and validate that at least one of `amount`/`amountFen` is present, explicitly type checklist state as `NegotiationChecklistItem[]`, and type the mapped stress values as `Array<1|2|3|4|5>`. Keep `npm run build` as a required acceptance gate.

### CR-02: The UI-to-nowcast pipeline omits real inputs and fabricates recurrence dates

**Files:** `src/pages/WizardPage.tsx:73-89`, `src/pages/WizardPage.tsx:248-260`, `src/pages/WizardPage.tsx:313-325`, `src/engine/report.ts:68-83`, `src/engine/nowcast.ts:345-378`

**Issue:** The primary form stores “monthly fixed income” and “monthly necessary expense” in `profile`, but `generateFullReport` calculates the forecast and aggregates only from `data.incomes` and `data.expenses`. If the user fills the required-looking monthly fields and skips the optional list additions, all income and essential expense are omitted from the forecast.

The detailed UI then hardcodes every recurring income to day 15 and every expense to day 1. Debt records have no separate regular monthly payment or due-day input. In the engine, later debt payments fall back to the first `currentAmountDueFen` and a default due day of 20. For example, a debt entered with first due date August 5 is projected on August 5, then September 20 and October 20.

This is a direct accuracy failure for the “daily 90-day cashflow” core value and a regression from the original PFOS wizard, which captured actual day-of-month, one-time dates, current due amount, later monthly payment, protected cash, and draft state.

**Fix:** Normalize all profile/list inputs into dated `CashflowEvent` records before calculation. Capture actual payday, expense day, one-time dates, regular debt payment, and recurring due day in the UI and domain model. Do not invent a 1st/15th/20th date when it is unknown; mark the result provisional instead. Add an integration test from wizard data through `generateFullReport`.

### CR-03: Every user is treated as having zero cash for action planning

**Files:** `src/engine/actionPlan.ts:74-76`, `src/engine/actionPlan.ts:113-121`, `src/engine/report.ts:82-114`

**Issue:** `computeAggregates` hardcodes `totalCashFen = 0`. Therefore `survivalMonths` is always zero whenever there is any outflow, regardless of the cash the user entered. This always triggers the immediate P0 “保留基本生活费” action and the emergency-fund action. A cash-rich, fully covered user can therefore be shown a false urgent top action.

**Fix:** Pass `profile.availableCashFen` (and any separately confirmed protected cash) into aggregate calculation. Add covered and uncovered test cases asserting both `survivalMonths` and absence/presence of the P0 action.

### CR-04: Latest consent is neither required nor enforced by routing

**Files:** `src/store/AppContext.tsx:128-142`, `src/pages/WelcomePage.tsx:9-12`, `src/App.tsx:46-58`

**Issue:** A single `ConsentRecord` overwrites all consent types; the welcome page records only `risk_disclosure`, not privacy and terms. `hasConsented` checks only for any non-null record and does not compare `documentVersion` to `DISCLAIMER_VERSION` or check revocation. More critically, `/wizard` and the other routes have no consent guard, so a user can open the data-entry route directly without accepting anything.

This violates the explicit acceptance rule that the latest risk and privacy disclosure must be confirmed before data entry.

**Fix:** Store separate versioned records for terms, privacy, and risk disclosure; compute consent validity from all required current versions and non-revocation. Put all data routes behind a shared route guard that redirects to the disclosure page.

### CR-05: DNOS can assign false reasons and priorities

**Files:** `src/engine/riskEngine.ts:90-118`, `src/engine/riskEngine.ts:214-224`, `src/engine/riskEngine.ts:277-303`

**Issue:** There are several correctness defects:

- A complete, low-risk debt matching no rule is still given `MISSING_CRITICAL_DATA`.
- R05 applies a global 30-day negative forecast to every active debt rather than identifying the debt(s) related to the negative date.
- R04 checks only whether any negative date occurs within seven days, not whether the balance after this debt’s payment is negative.
- P1 treats any truthy `firstNegativeDate` as relevant for a debt due within seven days, even if the forecast gap is much later.
- A past due date with status still marked `normal` can receive P0 priority while retaining low risk and the false missing-data reason.

These inconsistencies undermine the required explainability and can place unrelated debts ahead of the actual risk source.

**Fix:** Link assessments to debt-payment event IDs and inspect the daily point immediately after each debt event. Apply global R05 only to debts contributing to the negative date (or represent it as a portfolio warning). Do not add any reason when no rule matches. Normalize past dates into a “needs overdue confirmation” state before priority calculation.

### CR-06: Dashboard’s “future 30 days due” value is not a due-total

**File:** `src/pages/DashboardPage.tsx:60-65`

**Issue:** The tile displays `gap30dFen` when there is a gap; otherwise it sums `currentAmountDueFen` for every debt, regardless of due date or archive state. A cash shortfall is not the same quantity as payments due, and all-debt current dues are not necessarily within 30 days. The headline KPI can therefore show the wrong number under both branches.

**Fix:** Sum only `debt_payment` events whose scheduled dates fall within the first 30 forecast days. Display the 30-day gap as a separate metric.

### CR-07: “Saved” actions, negotiations, and weekly review data are silently lost

**Files:** `src/pages/NegotiationPage.tsx:23-76`, `src/pages/ActionCenterPage.tsx:7-25`, `src/pages/WeeklyReviewPage.tsx:6-8`, `src/pages/WizardPage.tsx:496-498`, `src/store/AppContext.tsx:10-27`

**Issue:** Negotiation checklist changes, hardship text, communication records, new-offer inputs, completed actions, and weekly notes exist only in component state. Navigation or refresh discards them even though the UI says “保存记录” or presents them as completed work. The wizard also says “已自动保存” while its in-progress values remain local state until final submission. This is material user-data loss and a regression from the original PFOS draft autosave.

**Fix:** Add these entities to the application store with versioned local persistence and stable IDs. Save wizard drafts on each step/data change, restore them on reload, and surface storage failures instead of silently claiming success.

### CR-08: Wizard reuses incompatible quick-entry state and can create invalid debts

**Files:** `src/pages/WizardPage.tsx:98-126`, `src/pages/WizardPage.tsx:227-263`, `src/pages/WizardPage.tsx:301-328`, `src/pages/WizardPage.tsx:360-399`

**Issue:** Income, expense, and debt entry share `quickCreditor`, `quickPrincipal`, and especially `quickType`. `quickType` is declared as `DebtType`, but the income select writes `"confirmed"`, `"likely"`, or `"uncertain"` into it through a cast. If the user does not change the initially mismatched income select, the income record can receive `certainty: "credit_card"`; if the user does change it, the later debt form can receive `debtType: "confirmed"` (or another certainty value). These invalid states bypass the Zod schema and then break labels, risk interpretation, and exported data.

The same debt creator always writes `status: "normal"` even when `quickDueDate` is earlier than today, so overdue rules never activate for the most natural past-date entry path.

**Fix:** Give each step an independently typed form state, validate each submission with its corresponding Zod schema, and reset state on step changes. For debt input, derive a past-due prompt and require the user to confirm overdue/paid/rescheduled status before saving.

## Warnings

### WR-01: Risk list cannot display the assessed creditor

**File:** `src/pages/RiskPage.tsx:67-90`

**Issue:** The page searches a non-existent private `(report as any)._debts` property and leaves a placeholder ledger lookup unused. Every assessment is rendered as the generic name “债务”, so users cannot tell which debt a risk or priority applies to.

**Fix:** Include a typed debt reference/map in `FullReport`, or pass the active debts into `RiskPage`, and render creditor, due amount/date, and the exact input values used by each rule.

### WR-02: Debt editing and validation are effectively absent

**Files:** `src/pages/DebtDetailPage.tsx:106-139`, `src/pages/WizardPage.tsx:105-127`, `src/domain/schema.ts:50-73`

**Issue:** `DebtDetailPage` imports `updateDebt` but exposes no edit flow. The quick-add form accepts strings based on truthiness and never runs `debtAccountSchema`, so negative values, a past due date still labeled normal, and other inconsistent states can enter the store. There is no duplicate warning or secondary confirmation for large amounts.

**Fix:** Implement a schema-backed add/edit form, require positive numeric amounts, prompt for overdue status when the due date is past, add duplicate detection and high-amount confirmation, and persist audited field changes.

### WR-03: Forecast metadata and engine output are not deterministic

**Files:** `src/engine/nowcast.ts:524-543`, `src/engine/riskEngine.ts:184-238`, `src/engine/riskEngine.ts:340-355`, `src/engine/actionPlan.ts:240-258`

**Issue:** A 90-point ledger covers `startDate` through `startDate + 89`, but the snapshot reports `endDate = startDate + 90`. Risk/action IDs and timestamps are created from the current clock, so complete outputs differ for identical inputs. `inputVersion` is also set equal to `ruleVersion`, not an input snapshot identity.

**Fix:** Set `endDate` from the final ledger point, inject an assessment timestamp/ID factory outside the pure rules, and derive `inputVersion` from a stable canonical input hash or persisted snapshot version.

### WR-04: Privacy masking is inconsistent and local data is loaded without validation

**Files:** `src/pages/DebtDetailPage.tsx:62-80`, `src/pages/CashflowPage.tsx:27-51`, `src/pages/ReportPage.tsx:81-98`, `src/pages/WeeklyReviewPage.tsx:49-64`, `src/store/AppContext.tsx:72-83`

**Issue:** Amount masking defaults to hidden only on dashboard/list. Detail, cashflow, report, and weekly review expose sensitive amounts immediately. Raw localStorage JSON is accepted without schema/version validation, while save/load errors are swallowed. Corrupt or stale data can produce crashes or misleading calculations.

**Fix:** Use one persisted privacy preference with hidden-by-default rendering across every financial page. Add a versioned storage schema, validation/migration, and a recoverable error state. Explain shared-device/localStorage exposure in the privacy notice.

### WR-05: Closed debts remain in totals, risk assessments, and reports

**Files:** `src/engine/report.ts:62-83`, `src/engine/riskEngine.ts:179-186`, `src/pages/ReportPage.tsx:19-43`

**Issue:** Only `deletedAt` is filtered. Debts with `status === "closed"` are skipped by the nowcast but still contribute to aggregate debt, DTI, report counts, and risk assessment. This creates cross-page inconsistencies.

**Fix:** Define one `isActiveDebt` predicate that excludes archived and closed records, and use it consistently in nowcast, aggregates, risk, pages, and export.

### WR-06: Some action copy crosses the decision-support boundary

**File:** `src/engine/actionPlan.ts:113-121`, `src/engine/actionPlan.ts:150-160`

**Issue:** The action generator states a legal-sounding hierarchy (“生存权高于偿债权”), commands “优先偿还高息债务”, and suggests moving to a lower-interest channel. This can be read as a legal conclusion or refinancing recommendation rather than a candidate plan based on user data.

**Fix:** Reframe as factual options and verification steps: protect an explicitly entered minimum-living reserve, compare candidate orderings, and ask the user to verify terms with the official creditor or a qualified professional. Do not suggest acquiring replacement credit.

### WR-07: Page routing leaves core flows hidden or unguided

**Files:** `src/App.tsx:46-58`, `src/pages/DashboardPage.tsx:123-141`

**Issue:** The financial checkup report has a route but no dashboard/navigation entry. There is no not-found route, shared authenticated/consented layout, or consistent back/home navigation on empty states. Direct navigation can expose disconnected pages with generic “please enter data” text.

**Fix:** Add a guarded application shell with the five primary navigation destinations, include the report entry, redirect unknown routes, and give every empty state a clear next step.

### WR-08: Tests pass while missing the business-critical failure modes

**Files:** `src/engine/__tests__/nowcast.test.ts:76-96`, `src/engine/__tests__/nowcast.test.ts:129-141`, `src/engine/__tests__/nowcast.test.ts:172-186`, `src/engine/__tests__/riskEngine.test.ts:162-170`

**Issue:** There are no component, integration, or end-to-end tests. The “overdue” scenario uses a future due date and does not test overdue scheduling. The month-end test asserts only ledger length. Gap tests do not assert exact 30/60/90 values. The determinism test compares only risk level, priority, and reasons, ignoring IDs, timestamps, warnings, and actions. No test covers the UI-to-report adapter, consent guard, persistence, closed-debt consistency, new-offer comparison, or report export.

**Fix:** Add the five fixed end-to-end scenarios from the technical spec plus focused boundary tests for leap years/month ends, past due dates, regular payment recurrence, exact window gaps, no-rule low-risk debt, debt-specific negative balance, stable full output, draft restoration, and saved negotiation/action/review state.

## Info

### IN-01: README overstates completion and deployability

**File:** `README.md:19-53`

**Issue:** The README marks all Phase 1 capabilities complete, claims Vercel readiness, and describes persisted consent, negotiation comparison, weekly review, and data privacy as finished. The build currently fails and several listed flows are UI-only or inaccurate.

**Fix:** Mark the project as an incomplete prototype and list known blockers until the production build and Phase 1 acceptance scenarios pass.

### IN-02: Dead placeholders and broad `any` hide broken contracts

**Files:** `src/App.tsx:25`, `src/pages/DebtListPage.tsx:28-30`, `src/pages/RiskPage.tsx:68-72`

**Issue:** `currentReport` is unused, list/detail paths cast assessment data through `any`, and the risk page contains placeholder lookups. These patterns allowed the missing debt/report contract to compile without a useful UI result.

**Fix:** Remove dead state and placeholders, export typed report view models, and enable `noUnusedLocals`/`noUnusedParameters` once existing violations are cleaned up.

---

_Reviewed: 2026-07-29T16:30:11Z_  
_Reviewer: Codex (gsd-code-reviewer)_  
_Depth: standard_
