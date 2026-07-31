# PFOS-v2 数据集测试发现报告

> 生成日期：2026-07-30
> 方法：以 `src/engine/fixtures/scenarios.ts` 真实财务场景喂入 `generateFullReport`，对现金流、风险判定、行动清单、确定性做 invariant 校验。
> 执行说明：**本环境的命令通道（Bash/PowerShell）不可用，无法在此运行 vitest**。以下结论通过对 `report.ts / nowcast.ts / riskEngine.ts / actionPlan.ts / dataQuality.ts` 逐行追踪 + 数据集手算核对得出，与 `src/engine/__tests__/dataset.test.ts` 中的断言一一对应；用户可在本机 `npm test` 复现（断言失败即对应下方 `[BUG]` 项）。

---

## 1. 测试数据集概览

| 场景 | 目的 | 关键输入 |
|---|---|---|
| 场景1 典型多债家庭 | 复现 CR-02 / CR-05 / WR-02 / WR-05 | 现金 ¥10,000；工资 ¥16,000(15号)；房租 ¥5,000(1号)+生活费 ¥4,000(10号)；5 笔债（含 1 笔未填 dueDay、1 笔已过期仍 normal、1 笔影响基本生活、1 笔已结清） |
| 场景2 现金充裕可覆盖 | 验证 CR-03 是否修复 | 现金 ¥1,000,000；其余同结构但仅 1 笔小额低息债 |
| 场景3 仅填 profile 无明细 | 验证 CR-02 兜底路径残留 | 只填 `fixedMonthlyIncomeFen / essentialMonthlyExpenseFen`，incomes/expenses 留空 |

金额单位：报告内用「元」，括号内为引擎内部 fen（分）。基准日固定 `2026-07-30`。

---

## 2. 场景1：复现的缺陷

### F-01 〔CR-02〕月供日期漂移——未填 `dueDay` 的债被强行改到 20 号

- **现象**：D1（招商信用卡）`nextDueDate=2026-08-05` 但**未传 `dueDay`**。实际月供落在 `08-05 → 09-20 → 10-20`，而非用户预期的每月 5 号。
- **证据**：`nowcast.ts:394` `const paymentIndex = paymentIndexForDate(firstDueDate, date, debt.dueDay ?? 20)`——`dueDay` 缺省回退为 **20**；`getFirstFutureDueDate`（`:449-456`）同样 `Number(debt.dueDay || 20)`。`paymentIndexForDate`（`:458-464`）按「首还日 + 整数月」对齐到 `dueDay`，首还后每月被锁到 20 号。
- **期望**：首还按 `nextDueDate` 真实日（5 号），后续月供保持同月日（5 号），不臆造 20 号。
- **严重度**：高。直接破坏「90 天日级现金流」这一核心卖点，且连带制造虚假还款碰撞日（见 F-01 余波）。

### F-02 〔CR-05 / WR-02〕已过期债未被识别为逾期，反被当成未来正常还款

- **现象**：D3（网络小贷）`nextDueDate=2026-07-28` 早于基准日 `2026-07-30`，但 `status` 仍为 `normal`。引擎既不标逾期，反而把它**重新排期到未来按月还**。
- **证据**：
  - 风险侧：`riskEngine.ts:236-241` 对「status=normal 且 nextDueDate<asOf」只追加 `MISSING_CRITICAL_DATA` + `VERIFY_DATA`，**从不置为 overdue**；`computePriority`（`:292-331`）同样不识别过期。
  - 现金流侧：`nowcast.ts:387-411` 非逾期分支把过期债经 `getFirstFutureDueDate` 推到首个月可用日（本例 → `2026-08-20`）继续按月扣。
- **实际输出**：D3 评估为 `riskLevel=medium / priority=P1 / reasons=[HIGH_COST, MISSING_CRITICAL_DATA]`。
- **期望**：过期债应识别为 `overdue` → 至少 `P0`/urgent，且**不应带虚假的 `MISSING_CRITICAL_DATA`**（其本金/当期/日期/置信度均完整）。
- **严重度**：高。逾期是最高危信号，漏判会误导用户与后续协商决策。

### F-03 〔CR-05〕R05 把全局负值「平均」套到窗口内每笔债

- **现象**：首次资金缺口由 D1（8-5 还款）引发，日期 `2026-08-05`。但 D2（银行消费贷，8-20 到期）**未参与制造该缺口**，却被打上 `FORECAST_NEGATIVE` 债级原因。
- **证据**：`riskEngine.ts:113-130` R05 仅判断「`firstNegativeDate` 存在 且 该债 30 天内到期」，不校验该债是否真的是负值来源。
- **实际输出**：D2 `riskLevel=high / priority=P2 / reasons=[FORECAST_NEGATIVE]`（虚假归因）。
- **期望**：`FORECAST_NEGATIVE` 应作为组合级预警（已在 `riskWarnings` 输出），不应逐笔贴到无关债上；债级原因应只挂到真正导致负值（或其还款后余额转负）的债。
- **严重度**：中。导致优先级排序失真，可能把真正风险源排到后面。

### F-01 余波：虚假还款碰撞日

因 F-01/F-02 把 D3 也排到每月 20 号，与 D2 重合，`nowcast.collisionDays` 出现 `08-20 / 09-20 / 10-20` 三个「碰撞日」。这些碰撞是日期编造的 artifact，而非真实多债同天到期。

### 场景1 现金流关键值（手算核对）

- 起始现金 ¥10,000；`08-01` 房租 −¥5,000 → ¥5,000；`08-05` D1 −¥6,000 → **首次缺口 −¥1,000**；`08-10` 生活费 −¥4,000 → −¥5,000（最差日）；`08-15` 工资 +¥16,000 → ¥11,000；`08-20` D2+D3 −¥5,500。
- `firstNegativeDate=2026-08-05`，`firstGapAmountFen=¥1,000`，`runwayDays=6`，`maxGap(最差)=¥5,000`。
- `aggregates`：月收入 ¥16,000、月必要支出 ¥9,000、月债还款 ¥21,500、`monthlyBalance=−¥14,500`、`dti=134%`、`survivalMonths=0.33`、平台数 4、逾期数 0。
- `topAction = 保留基本生活费`（P0，来自 `actionPlan` 模板，因 `survivalMonths<2`）。此条在「现金确实紧缺」场景下合理，**非误报**——它恰好印证 CR-03 已修复（现金未被硬编码为 0）。

---

## 3. 场景2：验证 CR-03 已修复

- **断言**：现金充裕（¥1,000,000）且可完全覆盖时，行动清单**不应**出现「保留基本生活费 / 建立应急资金 / 覆盖首次缺口」等误报紧急项；`survivalMonths` 应远大于 3；`firstGapDate` 应为 `null`。
- **追踪结果**：
  - 现金流 90 天无负值 → `firstGapDate=null`。
  - `survivalMonths = 1,000,000 / (9,000+1,000) = 100`（月）。
  - `aggregates.monthlyBalance = +¥6,000 > 0`，`dti=6.25%`。
  - `generateActionPlan` 全部模板条件均不满足 → 空；风险引擎无规则命中 → 空；**`actionPlan` 为空**，唯一债为 `P3 / low`。
- **结论**：`report.ts:98` 已把 `profile.availableCashFen` 透传 `computeAggregates`，CR-03 所述「现金硬编码为 0 致全员误报 P0」**已修复**。✅

---

## 4. 场景3：CR-02 兜底路径的残留限制

- **现象**：仅填 profile、不填明细时，必要支出被**硬编码到每月 1 号**，收入落到 `paydayRules[0].dayOfMonth`（无则 15 号）。
- **证据**：`report.ts:68-77` 兜底 `effectiveExpenses = [{amountFen, dayOfMonth:1, ...}]`、`effectiveIncomes` 用 `profile.paydayRules?.[0]?.dayOfMonth || 15`。
- **结论**：原 CR-02「profile 月字段不进入预测」已被兜底缓解，但**用户真实扣款日未知却被臆造为 1 号**仍是残留限制（INFO 级，非硬 bug）。理想做法：profile 兜底时把现金流标记为「 provisional（待补全日期）」而非给确定日。

---

## 5. 跨场景 / 确定性

### F-04 〔WR-03〕输出不确定——ID 与动作含时间戳

- **现象**：同一输入两次 `generateFullReport`，风险评估与动作 ID 不同。
- **证据**：`riskEngine.ts:247` ``id:`risk_${debt.id}_${now}` ``（`now=new Date().toISOString()`）；`buildAction`（`:371`）与 `actionPlan.ts:246` 用 `Date.now()`。相同输入 → 不同 ID / 不同 `assessedAt`。
- **期望**：纯规则引擎对相同输入应产生字节级一致输出（REVIEW 明确要求「Same input + same rule version → same output」）。
- **严重度**：中。破坏可复现性、缓存命中、回归对比；`inputVersion`（`report.ts:94`）也仅是 `${asOf}_${count}_debts`，非输入哈希。
- **备注**：`nowcast.dailyLedger` 本身**确定**（无时钟依赖），可放心做账本级一致性断言。

---

## 6. 正确路径（基线可信，确认引擎主体可用）

- **D4 影响基本生活** → `R08` 正确触发 `ESSENTIAL_LIVING_IMPACT`、`riskLevel=high`、`requiresHumanVerification=true`。（注：其 `priority` 仍算为 `P3`，因 `computePriority` 未纳入 R08——属优先级与风险等级不一致的小瑕疵，可后续打磨。）
- **D5 已结清** → 在 `report.ts:62` 被 `activeDebts` 过滤，不进 nowcast / 风险评估 / 聚合。**WR-05 已修复** ✅。
- 金额 fen 化、日级账本滚动、窗口 gap 计算逻辑自洽。

---

## 7. 未覆盖 / 超出本次范围（仍按 REVIEW.md 开放）

以下项属构建/页面/持久化层，数据集驱动引擎测试不直接触及，但依 `REVIEW.md` 仍待处理：

- **CR-01** 生产构建失败（`tsc -b` 类型错误）——未验证，需 `npm run build`。
- **CR-04** 同意路由未强制、版本未比对——页面/路由层。
- **CR-06** 看板「30 天到期」口径混淆 gap 与 due——页面层（引擎侧 gap/due 语义已在本次体现，但页面误用）。
- **CR-07** 协商/行动/周报数据未持久化、刷新即丢——页面/store 层。
- **CR-08** Wizard 状态串用（`quickType` 类型越界）→ 可造出 `debtType:"confirmed"` 等非法债——页面层（本次 fixture 已证明越界数据会绕过 Zod 进入引擎）。
- **WR-01/02/04/06/07/08、IN-01/IN-02**：风险列表无名、编辑校验缺失、隐私遮罩不一致、行动文案越界、路由引导缺失、测试覆盖不足、README 夸大、死代码/`any`。

---

## 8. 修复建议（反推实现路径）

| 编号 | 目标修复 | 关键落点 |
|---|---|---|
| F-01 | 月供日期不臆造：所有债在 UI/领域层捕获真实 `dueDay`；缺失时标记为 provisional，不回退 20 号 | `nowcast.ts:394,449-456`；`WizardPage` 增加 dueDay 输入 |
| F-02 | 过期债归一：首次载入即将 `nextDueDate<asOf && status=normal` 归一为「待确认逾期」状态，再算优先级；不追加虚假 `MISSING_CRITICAL_DATA` | `riskEngine.ts:236-241`、新增 `normalizeOverdue()`；`nowcast.ts:387` 分支 |
| F-03 | R05 改为组合级预警；债级 `FORECAST_NEGATIVE` 仅挂到「该债还款后当日余额转负」的债（用 `debtId` 关联 `CashflowEvent`） | `riskEngine.ts:113-130` + 关联 `forecast.points[].eventIds` |
| F-04 | 抽取 ID/时间戳工厂到引擎外部；`inputVersion` 用规范化输入哈希 | `riskEngine.ts:247,256`、`actionPlan.ts:246`、`report.ts:94` |
| CR-03/WR-05 | 已修复，保留回归测试防止回退 | `report.ts:62,98` |

---

## 9. 交付物

- `src/engine/fixtures/scenarios.ts` —— 3 个真实场景数据集（可扩展）。
- `src/engine/__tests__/dataset.test.ts` —— 数据集驱动线束；`[BUG <ID>]` 标注的断言失败即对应本文发现，可在本机 `npm test` 复现。
- 本文档 —— 证据化发现（含 file:line 与手算值）。
