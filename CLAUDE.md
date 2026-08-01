# PFOS 债务体检

个人财务梳理 H5 工具。帮助用户盘点债务、推演90天现金流、识别风险优先级、生成行动清单。

## 关键信息

- **线上地址**: https://chenshushi.tech
- **Vercel项目**: pfos-debt
- **GitHub仓库**: https://github.com/chenstatement/pfos-debt-checkup
- **默认分支**: main

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS · 纯前端localStorage · Vercel部署

## 日常命令

```bash
npm run dev          # 开发
npm test             # 引擎测试 (Vitest, ~64用例)
npx playwright test  # 浏览器E2E (Playwright, 11用例)
```

## 部署

代码改动后说"部署"，自动 commit → push → Vercel 构建 → chenshushi.tech 更新。

## 项目结构

```
src/
├── domain/       # 类型、金额(MoneyFen)、常量
├── engine/       # 纯函数: nowcast(现金流)、riskEngine(R01-R08/P0-P3)、debtPriority、actionPlan
├── store/        # AppContext (localStorage持久化)
├── pages/        # Welcome/Wizard/Dashboard/DebtList/Cashflow/Risk/Actions/Negotiation/WeeklyReview/Report/Settings
└── components/   # ConsentGuard、DisclaimerFooter
```

## 核心业务规则

- 逾期债务: 有预计还款日→单次结清；无→累计至下个还款日
- 分期债务: termRemaining含本期，catch-up消耗1期
- 资产变现: availableDate当天注入现金流
- 金额: 整数fen存储，yuanToFen/fenToYuan纯整数转换
