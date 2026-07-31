# PFOS v1.0 — Personal Financial Operating System

> **个人财务操作系统** — PIOS-PFOS-DNOS 第一阶段开发

基于 [PIOS-PFOS-DNOS 第一阶段技术开发文档](C:\Users\chens\Desktop\AG+RD\PFOS决策\PIOS-PFOS-DNOS-第一阶段技术开发文档.md) 开发。

## 当前状态：第一阶段 MVP 原型

**已通过：**
- TypeScript 编译（零错误）
- Vite 生产构建（47 模块）
- 44 项单元测试（全部通过）

**核心能力已就绪：**
- 免责声明版本追踪 + 路由守卫
- 财务画像录入（含到账日/扣款日）
- 债务台账（逾期自动检测、7 种类型）
- 90 天日级现金流预测（资金缺口、还款碰撞日）
- R01-R08 风险规则 + P0-P3 优先级
- 行动清单生成
- 协商准备（检查表、沟通记录、方案比较）
- 周度复盘
- 财务体检报告导出

**已知待改进：** 部分功能仅完成 UI 层，深度业务准确性仍需端到端验证。详见 `REVIEW.md`。

## 技术栈

- **前端**: React 19 + TypeScript + Vite 8
- **样式**: Tailwind CSS 4
- **路由**: React Router 7
- **校验**: Zod
- **测试**: Vitest（44 tests, 0 failures）
- **持久化**: 本地 localStorage（含草稿自动保存）

## 快速开始

```bash
npm install
npm run dev      # 开发服务器
npm run build    # 生产构建
npm test         # 运行测试
```

## 项目结构

```
src/
├── domain/           # 领域层：类型、Schema、常量、金额工具
│   ├── types.ts      # 核心实体（MoneyFen, DebtAccount, RiskAssessment 等）
│   ├── money.ts      # 金额fen化工具
│   ├── schema.ts     # Zod校验
│   └── constants.ts  # 规则版本 RULE_VERSION=1.0.0, 阈值, 标签
├── engine/           # 纯函数规则引擎
│   ├── nowcast.ts    # 90天逐日现金流
│   ├── riskEngine.ts # R01-R08 + P0-P3
│   ├── debtPriority.ts
│   ├── actionPlan.ts
│   ├── dataQuality.ts
│   ├── report.ts     # 编排所有引擎
│   └── __tests__/    # 3 测试套件, 44 测试
├── store/            # React Context 状态管理
│   └── AppContext.tsx
├── pages/            # 12 个页面
│   ├── WelcomePage.tsx     # 欢迎 + 免责声明确认
│   ├── WizardPage.tsx      # 5步录入向导（含自动草稿保存）
│   ├── DashboardPage.tsx   # 首页总览（含金额隐私遮罩）
│   ├── DebtListPage.tsx    # 债务台账（按P0-P3排序）
│   ├── DebtDetailPage.tsx  # 单笔债务详情 + 风险依据
│   ├── CashflowPage.tsx    # 90天现金流 + 月度汇总
│   ├── RiskPage.tsx        # 风险与优先级列表
│   ├── ActionCenterPage.tsx # 行动中心（完成/待办跟踪）
│   ├── NegotiationPage.tsx # 协商准备（检查表、沟通记录、方案比较）
│   ├── WeeklyReviewPage.tsx # 周度复盘
│   ├── ReportPage.tsx      # 体检报告 + JSON导出
│   └── SettingsPage.tsx    # 数据管理（导出/删除）
├── components/
│   ├── ConsentGuard.tsx    # 路由守卫
│   └── DisclaimerFooter.tsx
├── App.tsx
└── main.tsx
```

## 产品边界

本系统不：承诺协商成功或征信修复；替代律师/会计师/金融顾问；推荐借贷产品；自动联系金融机构；制造焦虑或虚假希望。

## License

Private. All rights reserved.
