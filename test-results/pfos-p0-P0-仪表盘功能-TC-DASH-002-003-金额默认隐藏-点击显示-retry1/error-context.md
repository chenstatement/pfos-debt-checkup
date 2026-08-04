# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: pfos-p0.spec.ts >> P0: 仪表盘功能 >> TC-DASH-002~003: 金额默认隐藏/点击显示
- Location: e2e\pfos-p0.spec.ts:101:3

# Error details

```
TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/wizard**" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: 🩺
      - heading "PFOS 债务体检" [level=1] [ref=e7]
      - paragraph [ref=e8]: 先看清最近哪一天可能出现资金缺口，再按风险顺序一步步把问题处理清楚。
    - generic [ref=e9]:
      - button "💰 盘点全部债务 看清欠谁、欠多少、何时还" [ref=e10] [cursor=pointer]:
        - generic [ref=e11]: 💰
        - generic [ref=e12]:
          - paragraph [ref=e13]: 盘点全部债务
          - paragraph [ref=e14]: 看清欠谁、欠多少、何时还
      - button "📈 90天现金流推演 发现资金缺口和还款碰撞日" [ref=e15] [cursor=pointer]:
        - generic [ref=e16]: 📈
        - generic [ref=e17]:
          - paragraph [ref=e18]: 90天现金流推演
          - paragraph [ref=e19]: 发现资金缺口和还款碰撞日
      - button "⚠️ 风险优先级排序 知道哪笔债务需要最先处理" [ref=e20] [cursor=pointer]:
        - generic [ref=e21]: ⚠️
        - generic [ref=e22]:
          - paragraph [ref=e23]: 风险优先级排序
          - paragraph [ref=e24]: 知道哪笔债务需要最先处理
      - button "✅ 可执行行动清单 今天、本周、本月该做什么" [ref=e25] [cursor=pointer]:
        - generic [ref=e26]: ✅
        - generic [ref=e27]:
          - paragraph [ref=e28]: 可执行行动清单
          - paragraph [ref=e29]: 今天、本周、本月该做什么
    - generic [ref=e30]:
      - paragraph [ref=e31]: ⚠️ 重要声明
      - paragraph [ref=e32]: PFOS（Personal Financial Operating System）是一个个人财务信息整理与决策辅助工具。 本工具不构成金融建议、法律服务、贷款中介或征信修复服务。所有分析结果基于用户自行录入的数据，不保证绝对准确性。 用户保留对所有财务决策的最终判断与责任。涉及具体协商、诉讼、法律问题或重大资产处置时，请咨询具备资质的专业律师或金融顾问。 本工具不会自动联系金融机构、不承诺协商结果、不代替用户作出任何具有法律或财务后果的决定。
      - paragraph [ref=e33]: 声明版本：1.0.0
    - button "开始整理全部债务" [ref=e35] [cursor=pointer]
    - paragraph [ref=e36]: 🔒 所有数据仅在本地浏览器中处理
  - contentinfo [ref=e37]:
    - paragraph [ref=e38]: 免责声明：PFOS 仅为个人财务信息分析与决策辅助工具。不构成法律意见、财务审计或信贷推荐。所有分析基于用户输入数据，不保证绝对准确。涉及具体协商、诉讼或法律问题时，请咨询专业律师。用户最终决策由其自行承担。
    - img "联系方式" [ref=e39]
```

# Test source

```ts
  1   | /**
  2   |  * PFOS 债务体检 — P0 E2E 自动化测试
  3   |  * 所有流程必须先从首页同意声明进入，避开 ConsentGuard 路由守卫
  4   |  */
  5   | import { test, expect } from '@playwright/test'
  6   | 
  7   | const BASE = 'http://localhost:5173'
  8   | 
  9   | /** 辅助：从首页同意声明 → 进入wizard第0步 */
  10  | async function startWizard(page, step = 0) {
  11  |   await page.goto(BASE)
  12  |   // 如果已经同意过，按钮文字不同
  13  |   const btn = page.locator('button', { hasText: '我已了解' })
  14  |   const continueBtn = page.locator('button', { hasText: '继续录入' })
  15  |   if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
  16  |     await btn.click()
  17  |   } else if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
  18  |     await continueBtn.click()
  19  |   }
> 20  |   await page.waitForURL('**/wizard**', { timeout: 5000 })
      |              ^ TimeoutError: page.waitForURL: Timeout 5000ms exceeded.
  21  |   // 跳到目标步骤
  22  |   if (step > 0) {
  23  |     await page.goto(BASE + `/wizard?step=${step}`)
  24  |     await page.waitForTimeout(500)
  25  |   }
  26  | }
  27  | 
  28  | test.describe('P0: 首页与向导', () => {
  29  | 
  30  |   test('TC-HOME-001/004: 首页加载 → 点击开始 → 进入向导步骤1', async ({ page }) => {
  31  |     await page.goto(BASE)
  32  |     await expect(page.locator('h1')).toContainText('PFOS')
  33  |     const btn = page.locator('button', { hasText: '我已了解' })
  34  |     await btn.click()
  35  |     await page.waitForURL('**/wizard**', { timeout: 5000 })
  36  |     await expect(page.getByText('现在能动用多少钱')).toBeVisible({ timeout: 5000 })
  37  |   })
  38  | 
  39  |   test('TC-WIZ-001~059: 完整向导流程 → 仪表盘', async ({ page }) => {
  40  |     await startWizard(page)
  41  | 
  42  |     // Step 0: 可用现金
  43  |     await page.locator('input[type="text"]').first().fill('50000')
  44  |     await page.locator('button', { hasText: '下一步' }).click()
  45  |     await page.waitForTimeout(300)
  46  | 
  47  |     // Step 1: 收入 — 跳过
  48  |     await page.locator('button', { hasText: '下一步' }).click()
  49  |     await page.waitForTimeout(300)
  50  | 
  51  |     // Step 2: 支出 — 跳过
  52  |     await page.locator('button', { hasText: '下一步' }).click()
  53  |     await page.waitForTimeout(300)
  54  | 
  55  |     // Step 3: 债务
  56  |     await page.locator('input[placeholder*="平台"]').fill('测试信用卡')
  57  |     await page.locator('input[placeholder*="应还"]').fill('3000')
  58  |     const dates = page.locator('input[type="date"]')
  59  |     if (await dates.count() > 0) await dates.first().fill('2026-08-20')
  60  |     await page.locator('button', { hasText: '添加这笔债务' }).click()
  61  |     await page.waitForTimeout(400)
  62  |     await page.locator('button', { hasText: '下一步' }).click()
  63  |     await page.waitForTimeout(300)
  64  | 
  65  |     // Step 4: 资产 — 跳过
  66  |     await page.locator('button', { hasText: '下一步' }).click()
  67  |     await page.waitForTimeout(300)
  68  | 
  69  |     // Step 5: 确认 → 生成
  70  |     await page.locator('button', { hasText: '生成体检报告' }).click()
  71  |     await page.waitForURL('**/dashboard**', { timeout: 5000 })
  72  |     await expect(page.getByText('总负债')).toBeVisible()
  73  |   })
  74  | })
  75  | 
  76  | test.describe('P0: 仪表盘功能', () => {
  77  | 
  78  |   test.beforeEach(async ({ page }) => {
  79  |     await startWizard(page)
  80  |     await page.locator('input[type="text"]').first().fill('80000')
  81  |     await page.locator('button', { hasText: '下一步' }).click()
  82  |     await page.waitForTimeout(200)
  83  |     await page.locator('button', { hasText: '下一步' }).click()
  84  |     await page.waitForTimeout(200)
  85  |     await page.locator('button', { hasText: '下一步' }).click()
  86  |     await page.waitForTimeout(200)
  87  |     await page.locator('input[placeholder*="平台"]').fill('招行测试')
  88  |     await page.locator('input[placeholder*="应还"]').fill('5000')
  89  |     const dates = page.locator('input[type="date"]')
  90  |     if (await dates.count() > 0) await dates.first().fill('2026-08-20')
  91  |     await page.locator('button', { hasText: '添加这笔债务' }).click()
  92  |     await page.waitForTimeout(400)
  93  |     await page.locator('button', { hasText: '下一步' }).click()
  94  |     await page.waitForTimeout(200)
  95  |     await page.locator('button', { hasText: '下一步' }).click()
  96  |     await page.waitForTimeout(200)
  97  |     await page.locator('button', { hasText: '生成体检报告' }).click()
  98  |     await page.waitForURL('**/dashboard**', { timeout: 5000 })
  99  |   })
  100 | 
  101 |   test('TC-DASH-002~003: 金额默认隐藏/点击显示', async ({ page }) => {
  102 |     await expect(page.getByText('点击显示')).toBeVisible({ timeout: 5000 })
  103 |     await page.getByText('点击显示').click()
  104 |     await expect(page.getByText('隐藏金额')).toBeVisible()
  105 |   })
  106 | 
  107 |   test('TC-DASH-006~008: 三张数据卡片', async ({ page }) => {
  108 |     await page.getByText('点击显示').click()
  109 |     await expect(page.getByText('可用现金')).toBeVisible()
  110 |     await expect(page.getByText('30天应还')).toBeVisible()
  111 |     await expect(page.getByText('缺口日期')).toBeVisible()
  112 |   })
  113 | 
  114 |   test('TC-DASH-009: 首页4个功能卡片可见', async ({ page }) => {
  115 |     await page.goto(BASE)
  116 |     await expect(page.getByText('盘点全部债务')).toBeVisible()
  117 |     await expect(page.getByText('90天现金流推演')).toBeVisible()
  118 |     await expect(page.getByText('风险优先级排序')).toBeVisible()
  119 |     await expect(page.getByText('可执行行动清单')).toBeVisible()
  120 |   })
```