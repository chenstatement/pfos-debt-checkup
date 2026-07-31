/**
 * PFOS 债务体检 — P0 E2E 自动化测试
 * 所有流程必须先从首页同意声明进入，避开 ConsentGuard 路由守卫
 */
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

/** 辅助：从首页同意声明 → 进入wizard第0步 */
async function startWizard(page, step = 0) {
  await page.goto(BASE)
  // 如果已经同意过，按钮文字不同
  const btn = page.locator('button', { hasText: '我已了解' })
  const continueBtn = page.locator('button', { hasText: '继续录入' })
  if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await btn.click()
  } else if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await continueBtn.click()
  }
  await page.waitForURL('**/wizard**', { timeout: 5000 })
  // 跳到目标步骤
  if (step > 0) {
    await page.goto(BASE + `/wizard?step=${step}`)
    await page.waitForTimeout(500)
  }
}

test.describe('P0: 首页与向导', () => {

  test('TC-HOME-001/004: 首页加载 → 点击开始 → 进入向导步骤1', async ({ page }) => {
    await page.goto(BASE)
    await expect(page.locator('h1')).toContainText('PFOS')
    const btn = page.locator('button', { hasText: '我已了解' })
    await btn.click()
    await page.waitForURL('**/wizard**', { timeout: 5000 })
    await expect(page.getByText('现在能动用多少钱')).toBeVisible({ timeout: 5000 })
  })

  test('TC-WIZ-001~059: 完整向导流程 → 仪表盘', async ({ page }) => {
    await startWizard(page)

    // Step 0: 可用现金
    await page.locator('input[type="text"]').first().fill('50000')
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(300)

    // Step 1: 收入 — 跳过
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(300)

    // Step 2: 支出 — 跳过
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(300)

    // Step 3: 债务
    await page.locator('input[placeholder*="平台"]').fill('测试信用卡')
    await page.locator('input[placeholder*="应还"]').fill('3000')
    const dates = page.locator('input[type="date"]')
    if (await dates.count() > 0) await dates.first().fill('2026-08-20')
    await page.locator('button', { hasText: '添加这笔债务' }).click()
    await page.waitForTimeout(400)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(300)

    // Step 4: 资产 — 跳过
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(300)

    // Step 5: 确认 → 生成
    await page.locator('button', { hasText: '生成体检报告' }).click()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })
    await expect(page.getByText('总负债')).toBeVisible()
  })
})

test.describe('P0: 仪表盘功能', () => {

  test.beforeEach(async ({ page }) => {
    await startWizard(page)
    await page.locator('input[type="text"]').first().fill('80000')
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('input[placeholder*="平台"]').fill('招行测试')
    await page.locator('input[placeholder*="应还"]').fill('5000')
    const dates = page.locator('input[type="date"]')
    if (await dates.count() > 0) await dates.first().fill('2026-08-20')
    await page.locator('button', { hasText: '添加这笔债务' }).click()
    await page.waitForTimeout(400)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '生成体检报告' }).click()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })
  })

  test('TC-DASH-002~003: 金额默认隐藏/点击显示', async ({ page }) => {
    await expect(page.getByText('点击显示')).toBeVisible({ timeout: 5000 })
    await page.getByText('点击显示').click()
    await expect(page.getByText('隐藏金额')).toBeVisible()
  })

  test('TC-DASH-006~008: 三张数据卡片', async ({ page }) => {
    await page.getByText('点击显示').click()
    await expect(page.getByText('可用现金')).toBeVisible()
    await expect(page.getByText('30天应还')).toBeVisible()
    await expect(page.getByText('缺口日期')).toBeVisible()
  })

  test('TC-DASH-009: 6个功能入口可见', async ({ page }) => {
    await expect(page.getByText('债务清单')).toBeVisible()
    await expect(page.getByText('现金流预测')).toBeVisible()
    await expect(page.getByText('行动计划')).toBeVisible()
    await expect(page.getByText('风险详情')).toBeVisible()
    await expect(page.getByText('体检报告')).toBeVisible()
    await expect(page.getByText('周度复盘')).toBeVisible()
  })

  test('TC-DASH-010: 债务清单跳转', async ({ page }) => {
    await page.getByText('债务清单').click()
    await page.waitForURL('**/debts**', { timeout: 5000 })
    await expect(page.getByText('债务台账')).toBeVisible()
  })

  test('TC-DASH-018: 修改数据 → 向导', async ({ page }) => {
    await page.getByText('修改数据').click()
    await page.waitForURL('**/wizard**', { timeout: 5000 })
  })

  test('首页 → 欢迎页', async ({ page }) => {
    await page.getByText('首页').click()
    await page.waitForURL(BASE + '/', { timeout: 5000 })
  })
})

test.describe('P0: 数据持久化', () => {

  test('TC-DATA-001: 录入后刷新数据保留', async ({ page }) => {
    await startWizard(page)
    await page.locator('input[type="text"]').first().fill('99999')
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('input[placeholder*="平台"]').fill('持久化测试')
    await page.locator('input[placeholder*="应还"]').fill('8888')
    const dates = page.locator('input[type="date"]')
    if (await dates.count() > 0) await dates.first().fill('2026-09-15')
    await page.locator('button', { hasText: '添加这笔债务' }).click()
    await page.waitForTimeout(400)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '生成体检报告' }).click()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })

    await page.reload()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })
    await page.getByText('点击显示').click()
    await expect(page.getByText('总负债')).toBeVisible()
  })
})

test.describe('P0: 债务台账', () => {

  test.beforeEach(async ({ page }) => {
    await startWizard(page)
    await page.locator('input[type="text"]').first().fill('50000')
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('input[placeholder*="平台"]').fill('招商信用卡')
    await page.locator('input[placeholder*="应还"]').fill('5000')
    const dates = page.locator('input[type="date"]')
    if (await dates.count() > 0) await dates.first().fill('2026-08-20')
    await page.locator('button', { hasText: '添加这笔债务' }).click()
    await page.waitForTimeout(400)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '下一步' }).click()
    await page.waitForTimeout(200)
    await page.locator('button', { hasText: '生成体检报告' }).click()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })
    await page.getByText('债务清单').click()
    await page.waitForURL('**/debts**', { timeout: 5000 })
  })

  test('TC-DEBT-001/006: 债务卡片显示完整', async ({ page }) => {
    await page.getByText('显示金额').click()
    await expect(page.getByText('招商信用卡')).toBeVisible()
    await expect(page.getByText('5,000')).toBeVisible()
  })

  test('TC-DEBT-002: 返回仪表盘', async ({ page }) => {
    await page.getByText('返回').click()
    await page.waitForURL('**/dashboard**', { timeout: 5000 })
  })
})
