/**
 * Runway Page E2E Tests — per RUNWAY_MVP_SPEC.md §7.3 / §C18
 */
import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

test.describe('Runway Page', () => {

  test('direct access without consent', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    // Page should load without redirecting to consent/home
    await expect(page.locator('h1')).toContainText('不上班续航计算器')
    // Input should be visible with default value
    await expect(page.locator('#runway-cash')).toHaveValue('100000')
  })

  test('home page entry navigates to /runway', async ({ page }) => {
    await page.goto(BASE)
    // Find the runway entry card
    const runwayEntry = page.locator('button', { hasText: '不上班续航计算器' })
    await expect(runwayEntry).toBeVisible()
    await runwayEntry.click()
    await page.waitForURL('**/runway', { timeout: 5000 })
    await expect(page.locator('h1')).toContainText('不上班续航计算器')
  })

  test('default 100k + national_urban produces result', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    // Select national_urban region
    await page.locator('#runway-region').selectOption('national_urban')
    // Click calculate
    await page.locator('button', { hasText: '测测这笔现金的续航' }).click()
    // Result should appear
    await expect(page.locator('text=你为自己攒下了一段选择时间')).toBeVisible({ timeout: 5000 })
    // Tiers should be visible
    await expect(page.getByText('省着过')).toBeVisible()
    await expect(page.getByText('日常过')).toBeVisible()
    await expect(page.getByText('从容过')).toBeVisible()
    // National context label
    await expect(page.getByText('当地暂无首版市/省数据，按全国城镇居民平均估算')).toBeVisible()
    // Stats disclaimer
    await expect(page.getByText('2025 年统计平均')).toBeVisible()
    await expect(page.getByText('未计通胀')).toBeVisible()
    // Fun fact: tenDayBreakBlocks
    await expect(page.getByText(/一次性休完.*10天假期/)).toBeVisible()
    // Conversion card appears after calculation
    await expect(page.getByText('想看更接近你的真实现金流？')).toBeVisible()
  })

  test('changing region after calculation invalidates old result', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    // Select region and calculate
    await page.locator('#runway-region').selectOption('national_urban')
    await page.locator('button', { hasText: '测测这笔现金的续航' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible({ timeout: 5000 })

    // Change region — result should disappear
    await page.locator('#runway-region').selectOption('beijing')
    await expect(page.getByText('你为自己攒下了一段选择时间')).not.toBeVisible({ timeout: 3000 })
    // But conversion card should also be gone
    await expect(page.getByText('想看更接近你的真实现金流？')).not.toBeVisible({ timeout: 3000 })
  })

  test('methodology shows source and assumptions', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('beijing')
    await page.locator('button', { hasText: '测测这笔现金的续航' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible({ timeout: 5000 })

    // Expand methodology
    await page.locator('button', { hasText: '这个结果怎么算' }).click()
    await expect(page.getByText('本次使用的数据')).toBeVisible()
    await expect(page.getByText('国家统计局北京调查总队')).toBeVisible()
    // Source link
    const sourceLink = page.locator('a', { hasText: '查看官方数据来源' })
    await expect(sourceLink).toBeVisible()
    // Formula
    await expect(page.getByText('完整续航月数 = floor')).toBeVisible()
    // Limitations
    await expect(page.getByText('默认单人、无工作收入、无投资收益')).toBeVisible()
  })

  test('CTA without consent redirects to home', async ({ page }) => {
    // Clear consent by going to home first (no consent means not stored)
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.locator('button', { hasText: '测测这笔现金的续航' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible({ timeout: 5000 })

    // Click CTA — should go to home since no valid consent
    const ctaBtn = page.locator('button', { hasText: '把债务和月供算进去' })
    await expect(ctaBtn).toBeVisible()
    await ctaBtn.click()
    // Should land on home page
    await page.waitForURL(BASE + '/', { timeout: 5000 })
    await expect(page.locator('h1')).toContainText('PFOS')
  })

  test('375px viewport has no horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.locator('button', { hasText: '测测这笔现金的续航' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible({ timeout: 5000 })

    // Check no horizontal scrollbar
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1) // tolerate 1px rounding
  })

  test('privacy and 18+ notice are visible', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await expect(page.getByText('仅供18周岁以上用户体验')).toBeVisible()
  })

  test('existing PFOS routes still work', async ({ page }) => {
    // Home page should load
    await page.goto(BASE)
    await expect(page.locator('h1')).toContainText('PFOS')

    // Consent then go to wizard
    const acceptBtn = page.locator('button', { hasText: '我已了解' })
    if (await acceptBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await acceptBtn.click()
      await page.waitForURL('**/wizard**', { timeout: 5000 })
      await expect(page.getByText('现在能动用多少钱')).toBeVisible({ timeout: 5000 })
    }
  })
})
