# PFOS「不上班续航」MVP 实施规格

状态：可执行  
执行者：Claude Code CLI  
复核者：Codex  
目标站点：现有 PFOS（`https://chenshushi.tech`）  
公开路径：`/runway`

## 1. 目标与边界

在 PFOS-v2 内增加一个约 20 秒完成的轻量互动测算页，以“现金能换来多久选择权”为传播钩子，再把有真实债务、月供和家庭责任的用户引入现有 `/wizard` 债务体检。

本次必须满足：

- 不新建站点、域名、仓库或部署项目。
- `/runway` 是现有 PFOS 的公开路由，不经过 `ConsentGuard`。
- 只在浏览器内计算；金额、地区、结果均不写入 `localStorage`、URL、日志或网络请求。
- 不新增 npm 依赖，不接后端，不接定位，不要求登录或手机号。
- 不修改现有债务引擎、数据模型、设置页及 Dashboard 业务逻辑。
- 不提交、不推送、不部署；完成本地实现和验证后等待用户下达“部署”。

首版不做：分享图片、排行榜、账户体系、投资收益、通胀模型、DNOS 导流、埋点、A/B 平台。

## 2. 用户路径

```text
外部内容直接链接 /runway
或 PFOS 首页的独立入口
→ 输入可自由支配现金 + 选择常住地区
→ 同页得到节制 / 日常 / 从容三档续航
→ 查看本次使用的数据层级、来源、公式和限制
→ 点击“把债务和月供算进去”进入 /wizard
```

`/runway` 必须在 `src/App.tsx` 的外层 `Routes` 中注册，位置在 `/*` 守卫路由之前。否则未同意债务免责声明的访客会被守卫拦截。

## 3. 页面信息架构与文案

### 3.1 顶部

- 返回：`返回 PFOS`
- 眉题：`PFOS · 20秒互动测算`
- H1：`不上班续航计算器`（页面唯一原生 h1；StickyHeader 传 `titleIsHeading={false}` 避免双 h1）
- 主文案：`这不是测你能不能退休，而是看看手里的现金能为你换来多久的选择权。`
- 辅助说明：`已用10万元作为起点，你可以改成自己的金额。结果是城市平均模拟，不是辞职、投资或财务决策建议。`

### 3.2 输入

输入一：`可自由支配现金`

- 默认值：`100000`
- 说明：`指现在可以用于生活，且不影响必要还款和应急储备的现金。`
- 接受 1,000 元至 100,000,000 元，最多两位小数。
- “10万元”是默认传播起点，不是硬门槛。
- 不合法时在字段下方给出明确错误，结果区不更新。

输入二：`常住地区（首版）`

- 必须手动选择，不请求 GPS。
- 选项名称必须体现数据层级，例如 `浙江省其他地区（省级均值）`、`其他地区（全国城镇均值）`。
- 默认不选中；未选择时提示 `请选择常住地区。`

按钮：`测测这笔现金的续航`

### 3.3 结果

- 结果眉题：`所选统计口径下的城镇居民平均消费模拟`
- 主标题：`你为自己攒下了一段选择时间。`
- 以“日常过”作为视觉主结果，同时展示三档：
  - `省着过`：官方月均的 80%
  - `日常过`：官方月均的 100%
  - `从容过`：官方月均的 130%
- 每档都同时显示：格式化时长、采用的月生活消费额、系数说明。
- 趣味换算只用”日常过”结果：`恭喜，你攒下的选择时间，约等于一次性休完 X 年的”10天假期”。`
- 趣味换算旁明确显示：`按每年10天假期趣味换算；实际带薪年休假因累计工作年限等条件而异。`
- 结果提醒：`这是统计平均生活消费强度，不是你的个人真实支出。`
- 提供 `重新计算`，只清除本页组件状态，不触碰 PFOS 已有数据。

### 3.4 PFOS 转化

- 标题：`想看更接近你的真实现金流？`
- 正文：`个人实际支出可能比统计均值更长或更短——而债务还款、房贷和固定月供通常会显著缩短这些时间。把真实账目算出来，才能看清现金流。`
- 主按钮：`把债务和月供算进去`
- 点击后导航到现有 `/wizard`；后续同意流程继续由 `ConsentGuard` 负责。
- 补充：`进入现有 PFOS 债务体检；本页不收集债务明细。`

### 3.5 口径与隐私

同屏提供默认展开或明显可展开的“这个结果怎么算”：

- 展示本次所选数据的地区名称、数据层级（市级/省级/全国）、2025 年、指标名称、官方年值、发布日期和官方来源链接。
- 展示三档系数，并明确系数是 PFOS 场景假设，不是官方统计分类。
- 说明默认单人、无工作收入、无投资收益、静态估算且未计通胀。
- 说明未纳入债务还款、实际房租/房贷、赡养抚养、社保保险、大额医疗和突发支出。
- 说明统计口径既包括现金消费也包括实物消费，因此只能用于粗略模拟。
- 隐私文案：`金额和地区只在当前页面内计算，不上传、不保存；离开或刷新页面后结果消失。`

## 4. 已核验的数据表

统一指标：`2025年城镇常住居民人均生活消费支出`，单位为 `元/人/年`。各来源用词可能为“消费支出”“生活消费支出”或“居民家庭人均消费支出”，页面展示时保留本条来源的指标原文。

| id | 选项标签 | 数据层级 | 官方年值 | 发布日 | 官方来源 |
|---|---|---|---:|---|---|
| `beijing` | 北京市（市级） | city | 54122 | 2026-01-21 | https://tjj.beijing.gov.cn/zxfbu/202601/t20260121_4451977.html |
| `shanghai` | 上海市（市级） | city | 57076 | 2026-03-30 | https://tjj.sh.gov.cn/tjgb/20260330/e0772941e8e041eaaad2df850b44ef98.html |
| `tianjin` | 天津市（市级） | city | 39693 | 2026-01-20 | https://tjzd.stats.gov.cn/system/2026/01/20/030241179.shtml |
| `chongqing` | 重庆市（市级） | city | 32764 | 2026-03-26 | https://tjj.cq.gov.cn/zwgk_233/fdzdgknr/tjxx/sjjd_55469/202603/t20260326_15568538_wap.html |
| `guangzhou` | 广州市（市级） | city | 51860 | 2026-05-10 | https://tjj.gz.gov.cn/zzfwzq/tjkx/content/post_10804061.html |
| `ningbo` | 宁波市（市级） | city | 55546 | 2026-02-05 | https://zjzd.stats.gov.cn/gjtjjnbdcd/zwgk/xxgkml/xxfx/dcfx/art/2026/art_9ca88a39178245f59ae0a562dfcc9805.html |
| `suzhou` | 苏州市（市级） | city | 54897 | 2026-04-30 | https://tjj.suzhou.gov.cn/sztjj/tjgb/202604/3dc4b574cabd4e86b36ec5d3280e927c.shtml |
| `wuhan` | 武汉市（市级） | city | 43233 | 2026-04-09 | https://tjj.wuhan.gov.cn/tjfw/tjgb/202604/t20260408_2750693.shtml |
| `zhejiang_other` | 浙江省其他地区（省级均值） | province | 53223 | 2026-03-04 | https://zjzd.stats.gov.cn/zwgk/zfxxgkml/tjxx/tjgb/art/2026/art_48c3c7315981425f9c25b53eab4d65d0.html |
| `jiangsu_other` | 江苏省其他地区（省级均值） | province | 43917 | 2026-02-24 | https://jszd.stats.gov.cn/TrueCMS//gjtjjjsdczd/2025cxrmshzb/content/60b80fda-ee95-4288-9972-878646d06ab1.html |
| `guangdong_other` | 广东省其他地区（省级均值） | province | 42726 | 2026-01-26 | https://gdzd.stats.gov.cn/dcsj/czjmsz/202601/t20260126_182641.html |
| `national_urban` | 其他地区（全国城镇均值） | national | 35869 | 2026-01-19 | https://www.stats.gov.cn/sj/zxfb/202601/t20260119_1962321.html |

数据结构至少保留：

```ts
type RunwayBaseline = {
  id: string
  optionLabel: string
  resultLabel: string
  sourceRegionName: string
  regionLevel: 'city' | 'province' | 'national'
  dataYear: 2025
  annualYuan: number
  metricName: string
  sourceName: string
  sourceUrl: string
  sourcePublishedAt: string
}
```

市级选项显示“按 ×× 市城镇居民平均估算”；省级选项显示“按 ×× 省城镇居民平均估算”；全国项显示“当地暂无首版市/省数据，按全国城镇居民平均估算”。不得把省级或全国值写成具体城市平均。

## 5. 确定性计算规则

所有金额先转换为整数分；禁止把浮点金额直接作为核心计算状态。

```text
annualFen = annualYuan × 100
monthlyFen(日常过) = round(annualFen ÷ 12)
monthlyFen(省着过) = round(annualFen × 80 ÷ 100 ÷ 12)
monthlyFen(从容过) = round(annualFen × 130 ÷ 100 ÷ 12)
runwayMonths = floor(cashFen ÷ monthlyFen)
tenDayBreakBlocks = floor(日常过 runwayMonths × 365 ÷ 12 ÷ 10)
```

结果时长格式：

- `0` 月：`不足1个月`
- `1..11` 月：`X个月`
- `12` 月：`1年`
- `13` 月：`1年1个月`
- 仅按完整月向下取整，不展示虚假精确到天。

页面显示的月生活消费额必须与引擎实际除数一致，不得只在 UI 四舍五入后使用另一套数值计算。

## 6. 建议文件改动

- 新建 `src/data/runwayBaselines.ts`：数据、类型、查找函数。
- 新建 `src/engine/runwayCalculator.ts`：纯函数、无浏览器 API。
- 新建 `src/engine/__tests__/runwayCalculator.test.ts`：数据和公式测试。
- 新建 `src/pages/RunwayPage.tsx`：页面组件，仅用本地 React state。
- 修改 `src/App.tsx`：公开注册 `/runway`。
- 修改 `src/pages/WelcomePage.tsx`：增加独立的小游戏入口，不混入现有四张债务功能卡。
- 可选新建 `e2e/runway.spec.ts`；不得为此改坏现有债务 E2E。

优先复用 `.apple-card`、`.apple-btn`、`.apple-input`、现有 Apple 色值和标准 Tailwind 类；不要新增未定义的 `pfos-*` token。页面适配 375×812 和桌面宽度，不产生横向滚动。

## 7. 必须通过的测试

### 7.1 单元测试

- 12 条数据记录的年值、年份、层级、URL 均完整。
- `annualYuan` 全部为正整数，`sourceUrl` 全部是 HTTPS。
- 三档月支出按 80% / 100% / 130% 单调递增，续航月数反向单调。
- 10万元 + 全国城镇值：验证三档月支出和完整月数的确定结果。
- 10万元 + 北京值、上海值、重庆值各有固定快照断言。
- 金额边界：999.99、1000、100000000、100000000.01。
- 时长格式：0、11、12、13 月。
- 趣味年假换算只取日常档并向下取整。

### 7.2 工程门禁

```bash
npx vitest run src/engine/__tests__ --reporter=basic
npx tsc -p tsconfig.app.json --noEmit --incremental false
npm run build
```

### 7.3 浏览器验收

- 未同意债务免责声明时可直接打开 `/runway`。
- 首页独立入口可进入 `/runway`，返回首页正常。
- 默认 10 万元 + 任一地区可完成计算。
- 修改金额、地区后结果相应变化；重新计算不影响 PFOS 原有 localStorage 数据。
- 结果页明确显示市级/省级/全国口径、数据年份、官方链接、三档系数与限制条件。
- 375×812 无横向溢出，按钮、表单标签和错误信息可被键盘和读屏识别。
- 页面无金额、地区或结果网络请求；地址栏不包含输入数据。
- `/wizard`、`/dashboard`、`/settings` 原有路由及业务行为不变。

## 8. 完成汇报格式

Claude Code CLI 完成后只需汇报：

1. 改动文件；
2. 实际采用的数据与公式；
3. 三条工程门禁的原始结果摘要；
4. 未完成项或风险；
5. 明确说明未 commit、未 push、未部署。

