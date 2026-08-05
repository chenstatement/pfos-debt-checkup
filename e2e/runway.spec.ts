import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:5173'

test.describe('Runway Page', () => {
  test('direct access without consent and 32 region options', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await expect(page.getByText('PFOS · 20秒互动测算', { exact: true })).toBeVisible()
    await expect(page.locator('h1')).toHaveText('不上班能过多久测算')
    await expect(page.locator('#runway-cash')).toHaveValue('100000')
    await expect(page.locator('#runway-region optgroup')).toHaveCount(9)
    await expect(page.locator('#runway-region option')).toHaveCount(33) // placeholder + 32 records
  })

  test('正文大标题在滚动时保持吸顶', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    const heading = page.locator('h1')
    const stickyTitle = heading.locator('..')
    await expect(stickyTitle).toHaveCSS('position', 'sticky')
    await page.evaluate(() => window.scrollTo(0, 600))
    const box = await stickyTitle.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeLessThanOrEqual(4)
  })

  test('home entry and existing cards preserve consent boundary', async ({ page }) => {
    await page.goto(BASE)
    await page.getByRole('button', { name: '不上班能过多久测算工具' }).click()
    await expect(page).toHaveURL(`${BASE}/runway`)
    await page.goto(BASE)
    await page.getByRole('button', { name: /盘点全部债务/ }).click()
    await expect(page).toHaveURL(`${BASE}/debts`)
  })

  test('default 100k + national average shows five tiers and rest comparison', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.getByRole('button', { name: '测测这笔现金能过多久' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible()
    for (const label of ['躺平过', '省着过', '正常过', '从容过', '奢侈过']) await expect(page.getByText(label, { exact: true })).toBeVisible()
    await expect(page.getByText(/全年实际休息中位值 100 天/)).toBeVisible()
  })

  test('changing input invalidates old result', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.getByRole('button', { name: '测测这笔现金能过多久' }).click()
    await expect(page.getByText('你为自己攒下了一段选择时间')).toBeVisible()
    await page.locator('#runway-region').selectOption('zhejiang')
    await expect(page.getByText('你为自己攒下了一段选择时间')).not.toBeVisible()
  })

  test('methodology contains data source and all definitions', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.getByRole('button', { name: '测测这笔现金能过多久' }).click()
    await page.getByRole('button', { name: '这个结果怎么算' }).click()
    await expect(page.getByText('本次使用的数据')).toBeVisible()
    await expect(page.getByText('躺平过 = 最低工资 × 50%')).toBeVisible()
    await expect(page.getByText(/全国最低工资为各省 2025 年最低工资标准按城镇人口加权估算/)).toBeVisible()
    await expect(page.getByText(/查看消费官方来源/)).toBeVisible()
    await expect(page.getByText('查看最低工资表')).toBeVisible()
  })

  test('CTA without consent returns to home', async ({ page }) => {
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.getByRole('button', { name: '测测这笔现金能过多久' }).click()
    await page.getByRole('button', { name: '把债务和月供算进去' }).click()
    await expect(page).toHaveURL(`${BASE}/`)
  })

  test('375px viewport has no horizontal overflow and privacy notice', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(`${BASE}/runway`)
    await page.locator('#runway-region').selectOption('national_urban')
    await page.getByRole('button', { name: '测测这笔现金能过多久' }).click()
    const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }))
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1)
    await expect(page.getByText('仅供18周岁以上用户体验')).toBeVisible()
  })
})
