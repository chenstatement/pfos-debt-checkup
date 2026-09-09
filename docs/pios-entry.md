# 陈述式科技 · PIOS 总入口

## 目标与实现边界

根地址 `https://chenshushi.tech/` 展示陈述式科技与歪墙 Shawn 的个人 PIOS
系统入口，PFOS 是其中一个子项目。保留原 Vercel 项目、域名、财务计算、
浏览器数据与存储键，不迁移数据，不增加统一登录或后台。

| 地址 | 职责 |
| --- | --- |
| `/` | PIOS 个人入口，不挂载财务 AppProvider、不读取财务存储 |
| `/pfos` | 原 PFOS 欢迎页、风险声明及录入入口 |
| `/wizard`、`/dashboard`、`/debts`、`/cashflow`、`/risk`、`/actions`、`/settings` | 保留原业务路由和原访问约束 |
| `/debts/:id`、`/negotiation/:debtId`、`/runway` | 保留原详情与测算路由 |

PFOS 内部返回欢迎页及未同意声明时的跳转，统一指向 `/pfos`。
访问 `/pfos`、旧业务路径及同域名内导航时，继续读取既有浏览器记录。
不能把部署成功理解为跨设备数据同步；PFOS 仍为原有本地存储架构。

## 子系统入口证据

- PFOS：本站 `/pfos`。
- Family Health：Sites 已确认 `https://family-health-console.shawn-chan.chatgpt.site`，保持原私有权限。
- 昨今明后：Sites 已确认 `https://yesterday-today-tomorrow.shawn-chan.chatgpt.site`，保持原私有权限。
- Thinking Engine、VLE、Movement Engine、DNOS：保留系统介绍，地址待接入；不推断其开发状态。

私有入口只放链接和用途介绍，不嵌入其记录、密钥或鉴权绕过信息。
首页无模型调用、分析追踪、外部字体和新依赖。

## 发布前核验与回退

基准提交：`8edf1506a494eb12efda8f8df0b2601e96c7cf83`。
修改前正式域名返回的 JS/CSS 文件名与该提交本地构建产物一致。
GitHub 关联两个 Vercel 项目：`pfos-debt`、`pfos-debt-checkup`；仓库
CLAUDE.md 指定正式域名对应 `pfos-debt`。发布后同时核验状态与正式域名
实际返回的新资源，不能只用另一项目的成功状态作为证明。

原项目基线：生产构建通过；87 个测试中 86 个通过，DNOS 导出联调测试
因相邻 DNOS 仓库文件缺失失败；TypeScript 完整检查存在既有错误。
本次不修改算法、财务存储或伪造缺失依赖，不删除测试使结果变绿。
集成后须比较失败项是否相同，并单独验证新入口与路由。

本次集成验证：新增入口/隐私/旧路径的 11 项 SSR 测试通过；生产构建通过。
既有 DNOS 相邻依赖失败保持不变；完整 TypeScript 输出与基线逐字一致，
没有新增类型错误。浏览器视觉与真实点击验收未执行，不将 SSR 等同于 E2E。

若入口出现回归，撤回本次入口提交并沿用原 Vercel 发布流程；无需恢复
数据库或修改 DNS。禁止强制重置分支，避免覆盖后续变更。

## 协作记录

Sol 提供初版方案；Astra 复核目标与发布边界；Luna 生成前端集成候选；
主代理审核、测试、提交与核验发布。当前环境 CC 不可调用，未使用 CC。
取得原仓库后，停止扩展独立候选站，以原项目作为正式交付代码源。
