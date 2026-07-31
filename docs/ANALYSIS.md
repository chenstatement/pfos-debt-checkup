# 现有 PFOS 系统与 PIOS-PFOS-DNOS 第一阶段对比分析

> 分析日期：2026-07-29  
> 分析者：Claude Code  
> 参照文档：C:\Users\chens\Desktop\AG+RD\PFOS决策\PIOS-PFOS-DNOS-第一阶段技术开发文档.md

---

## 一、已开发 PFOS 系统概况

**位置**: `D:\氛围编程\PFOS`
**版本**: v0.2  
**技术栈**: JavaScript · React 19 · Vite 8 · Tailwind 4 · localStorage  
**核心能力**:

| 文件 | 功能 | 代码规模 |
|------|------|---------|
| `src/engine/nowcast.js` | 90天日级现金流（滚动余额、缺口日期、还款碰撞日） | ~390行 |
| `src/engine/scoring.js` | 0-100健康评分 + 9个风险因子 + 严重度分级 | ~135行 |
| `src/engine/debtPriority.js` | 多因子加权债务排序（逾期、利率、月供、平台风险、催收、近结清） | ~122行 |
| `src/engine/actionPlan.js` | 15+模板驱动的条件→行动生成器 | ~274行 |
| `src/engine/dataQuality.js` | 债务体检数据完整度评分 | ~82行 |
| `src/engine/report.js` | 统一编排所有引擎输出的报告生成器 | ~135行 |
| `src/engine/forecastProjection.js` | 1/3/6/12个月情景推演 | ~88行 |
| `src/components/Wizard.jsx` | 6步录入向导（资金→收入→支出→债务→资产→确认） | ~162行 |
| `src/store/DataContext.jsx` | 全局状态管理 + localStorage持久化 + 模块状态 | ~133行 |

**已成熟的用户能力**:
- 当前资金基准日 (`snapshot.asOfDate` + `availableCash`)
- 受保护现金 (`protectedCash`) — 生活费不用于还债
- 收入日和支出日可指定每月几号
- 债务的 `dueDay` 和 `nextDueDate` 双日期模型
- 债务逾期天数自动计算 (`overdueDays`)
- 资产步骤 — 区分流动/非流动资产，变现日期和金额
- 完整5模块决策系统集成
- 草稿自动保存/恢复 (`DRAFT_KEY` in localStorage)

---

## 二、待开发任务（文档要求）与已有系统的相同之处

### 高度对齐的模块

| 文档要求 | 现有PFOS对应 | 重合度 |
|---------|-------------|--------|
| 模块D: 90天现金流预测 | `nowcast.js` — 事件展开、逐日滚动、缺口检测、碰撞日 | **90%** |
| 模块E: 风险识别 | `scoring.js` 9因子 → 需重构为 R01-R08 | **70%** |
| 模块E: 优先级引擎 | `debtPriority.js` 多因子加权 → 需映射为 P0-P3 | **60%** |
| 模块G: 行动中心 | `actionPlan.js` 模板驱动生成 | **80%** |
| 数据完整度 | `dataQuality.js` 评分+缺失项提示 | **85%** |
| 首次体检流程 | `Wizard.jsx` 分步录入 + 草稿保存 | **70%** |
| 免责声明 | `Welcome.jsx` + `Disclaimer.jsx` — 措辞高度一致 | **80%** |

### 产品原则对齐

| 现有PFOS原则 | 文档原则 | 对齐度 |
|-------------|---------|--------|
| 规则优先于AI | 4.2 规则优先于大模型 | **100%** |
| 结构化优先于聊天 | — | 隐含对齐 |
| 先分析再建议 | 8.6 | **100%** |
| 不承诺协商成功 | 2.5、4.1 | **100%** |
| 不推荐借贷产品 | 2.5 | **100%** |
| 不制造焦虑 | 9.1 | **100%** |

---

## 三、关键差异

| 维度 | 现有PFOS (v0.2) | 文档要求 (v1.0) | 差异级别 |
|------|----------------|----------------|---------|
| **语言** | JavaScript (纯JS) | TypeScript + Zod | 🟡 需迁移 |
| **金额存储** | `number` 浮点数 | `MoneyFen` 整数分 | 🔴 必须改 |
| **持久化** | localStorage (纯前端) | PostgreSQL + API (文档建议) | 🟡 第一阶段保持localStorage |
| **认证** | 无 | 会话认证 | 🟡 第一阶段可推迟 |
| **债务模型** | 10+字段（platform, principal, monthlyPayment, annualRate, dueDay, overdue） | 25+字段（新增hasCollateral, hasGuarantor, hasCoBorrower, affectsEssentialLiving, dataConfidence, repaymentMethod等） | 🟡 需扩展 |
| **风险体系** | 9因子自由组合 + urgent/high/moderate/normal | R01-R08编号规则 + P0-P3可解释优先级 | 🟡 需重构映射 |
| **协商模块** | 无 | NegotiationCase + CommunicationRecord + 方案比较 | 🔴 全新 |
| **周度复盘** | 无 | WeeklyReview | 🔴 全新 |
| **审计事件** | 无 | AuditEvent (声明确认/字段变更/导出/删除) | 🔴 全新 |
| **免责声明版本化** | 静态页脚 | 版本化ConsentRecord + 路由守卫 | 🔴 全新 |
| **资产模块** | 完整（类型、流动、变现日、金额） | 第一阶段非必需 | 🟢 可简化 |
| **信用体检** | 有（征信查询次数、逾期记录等） | 第一阶段非必需 | 🟢 可简化 |
| **月度预测** | 有（12个月情景推演） | 第一阶段聚焦90天 | 🟢 可简化 |
| **健康评分** | 0-100综合评分 | 未要求（避免了"AI分数"不可解释问题） | 已移除 |

---

## 四、是否可以利用已开发内容加快待开发任务

### 结论：可以大幅复用，预计加速 40-50%

### 具体复用策略

#### 直接移植（80-90% 复用率）

1. **`nowcast.js` → `nowcast.ts`**: 现金流算法是纯函数，核心逻辑完全可移植。主要改动：
   - `number` → `MoneyFen` (整数分)
   - 添加事件ID追踪（用于R04按还款日查余额）
   - 添加30/60/90缺口输出

2. **`dataQuality.js` → `dataQuality.ts`**: 完整度评分逻辑直接移植

3. **`actionPlan.js` → `actionPlan.ts`**: 模板驱动框架保留，替换具体文案

#### 重构映射（50-60% 复用率）

4. **`scoring.js` + `debtPriority.js` → `riskEngine.ts`**: 
   - 9因子 → R01-R08 规则编号
   - 评分 → 风险等级(low/medium/high/urgent)
   - urgent/high/moderate/normal → P0-P3
   - 权重体系保留，映射为新框架

5. **`Wizard.jsx` → `WizardPage.tsx`**: 
   - 分步框架保留
   - 新增：收入日/支出日明确输入、逾期自动检测
   - 移除：资产步骤（第一阶段非必需）、信用步骤

#### 全新开发

6. **协商模块** (`NegotiationPage.tsx`): 检查表模板、沟通记录表单、方案比较
7. **周度复盘** (`WeeklyReviewPage.tsx`): 本周事件汇总、数据新鲜度
8. **路由守卫** (`ConsentGuard.tsx`): 版本化同意检查
9. **审计事件**: 基础版本嵌入AppContext

### 实际执行情况

PFOS-v2 (`D:\氛围编程\PFOS-v2`) 已按此策略完成开发。核心引擎从现有PFOS移植并改造为TypeScript + MoneyFen，同时新增了协商、周度复盘、审计追踪等缺失模块。

### 移植过程中发现的关键教训

1. **字段名不匹配**: 现有PFOS使用`currentDueAmountFen`，新DebtAccount使用`currentAmountDueFen` — 导致现金流计算完全跳过债务支付（已在CR修复中解决）
2. **草稿保存差异**: 现有PFOS在每次数据变更时自动保存，PFOS-v2初始版本仅在最终提交时保存 — 已修复为`useEffect`自动保存
3. **现有PFOS的成熟特性未完整迁移**: 
   - `protectedCash`（受保护现金）— 已添加概念但未完整实现UI输入
   - `overdueDays`自动计算 — 已在Wizard和DebtDetail添加逾期检测
   - 资产步骤 — 第一阶段按文档要求移除了独立资产步骤

---

## 五、当前交付状态

**项目**: `D:\氛围编程\PFOS-v2`
**版本**: v1.0.0

| 检查项 | 结果 |
|--------|------|
| TypeScript编译 | ✅ 零错误 |
| 生产构建 | ✅ 47模块 |
| 单元测试 | ✅ 49/49 通过（4套件） |
| E2E场景（文档13.3节） | ✅ 5/5 通过 |
| R01-R08规则 | ✅ 全部实现 |
| P0-P3优先级 | ✅ 全部实现 |
| MoneyFen整数分 | ✅ 所有引擎 |
| 免责声明版本化 | ✅ |
| 路由守卫 | ✅ |
| 债务编辑+逾期检测 | ✅ |
| 协商准备 | ✅ |
| 周度复盘 | ✅ |
| 行动持久化 | ✅ |

### 已知限制

1. 纯localStorage（文档允许本地优先模式）
2. 第一阶段未实现资产/信用/月度预测模块
3. 无服务端API和数据库（文档18.1未确认问题默认保守策略）
4. 隐私遮罩默认隐藏但各页面一致性仍需加强
