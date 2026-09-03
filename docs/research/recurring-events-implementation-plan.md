# 重复事件实现计划

> **先阅读 `feat/rrule-epic` 上的 `rrule-epic-roadmap.md`。** 本计划是一份
> 活跃 epic 的 _设计理据_ 配套文档，而非从零开始的提案。下文所述内容在该分支上
> 大多已实现（正向/逆向 RRULE 转换器、旧客户端兼容契约、默认关闭的按设备
> 引擎开关），且该分支已解决本文仍按「开放问题」提出的若干问题。在此规划或
> 构建任何内容之前，请先去那边核对。
>
> **已于 2026-08-21 对齐：分支的原始 `rrule` 字符串设计成立** —
> 见下方 Decision 说明，了解哪些内容被取代以及为何保留。

> **修订说明（相对代码于 2026-06-02 核实）。** 经两轮相对真实代码库的多轴审查后重写。
> 原稿建立在三个错误前提与若干对同步不安全的步骤之上；随后「以原始 RRULE 字符串
> 作为模型」的修订在审查暴露出本代码库中的真实成本后再次被纠正。当前驱动本计划的
> 前提净结果为：
>
> 1. **RRULE 引擎已在仓库中。** `ical.js@2.2.1` 已在
>    `package.json` 中（是 **devDependency**，不是 `dependencies`），经懒加载
>    （`src/app/features/schedule/ical/ical-lazy-loader.ts`），并在
>    **两处** 展开 RRULE
>    （`get-relevant-events-from-ical.ts`、
>    `packages/plugin-dev/caldav-calendar-provider/src/plugin.ts`）。
>    `caldav-client.service.ts` 仅用 ical.js 解析 VTODO — 它
>    **不** 展开 RRULE。**不要添加 `rrule`（rrule.js）。** _（本点已在该
>    方向被取代：epic 添加了钉死的 `rrule@2.8.1` 作为其引擎 — 见
>    Decision 说明。）_
> 2. **标题级的「关键缺口」已经上线。** 月内第 N 个星期几
>    （#6040）、月末最后一天（#7726）、EXDATE（`deletedInstanceDates`）。更早的
>    缺口分析/行业标准研究草稿将这些标为缺失；那已过时，那些文档已并入本文
>    （见附录 A–B）。
> 3. **`TaskRepeatCfg` 是同步状态。** 模型变更必须走
>    op-log schema 迁移系统（`packages/shared-schema/src/migrations/`），
>    保持确定性 ID `rpt_${repeatCfgId}_${dueDay}` 稳定，且不破坏
>    跨版本同步。这主导了风险画像。

---

## Decision（已取代）：类型化的、与 RRULE 同构的重复模型

> **已于 2026-08-21 取代。** 现行决定以 epic 分支为准：在遗留扁平字段旁加性添加原始
> `rrule?: string`，遗留字段作为线格式永久双写。自此以下全部是被取代的
> 类型化模型计划，予以保留是因为其正确性约束
> （DTSTART/正午锚定、EXDATE 日字符串匹配、`UNTIL` 包容性、
> WKST、月锚点优先级、对等门禁、线格式重命名与
> 迁移警告）同样适用于 epic 的序列化器与引擎 —
> 只是持久化形态不同。

被取代的计划：重复 **模式** 变为单一类型化、
结构化字段 — 一个与 **RFC 5545 1:1 映射** 的可判别联合 —
取代约 14 个相互依赖的扁平字段（`repeatCycle`、`repeatEvery`、
7 个星期几布尔值、`monthlyWeekOfMonth`、`monthlyWeekday`、`monthlyLastDay`、
`quickSetting`）。

RFC-5545 **RRULE 字符串仅在边界处生成/解析**（`.ics`
导出、CalDAV）。**原始字符串绝不是持久化/同步字段。**

### 为何「拒绝原始字符串」已过时（2026-08-21 对齐）

更早的修订基于三条理由拒绝将原始 `rrule` 字符串作为规范字段。相对
`feat/rrule-epic` 实际构建的内容核对后，每条异议都被拒绝时未预见到的设计决定所回答：

- **「不可查询。」** 分支 _加性_ 添加 `rrule?: string`，并
  **永久双写遗留扁平字段** — 它们是旧客户端的线格式（roadmap，
  「Dual-engine endgame」§4）。选择器与任何字段级消费者仍持有结构化表示；没有任何东西
  被迫在投影时解析该字符串。
- **「不可 diff / 不可修复。」** 同样的双写：op-log 仍 diff
  遗留字段，且 `data-repair.ts` 仍修复它们。对字符串本身，
  分支有明确策略而非静默损坏：引擎是 fail-soft
  （畸形 `rrule` → 日志 + `null`，永不抛出），`isRRuleValid`
  门控路由（无效 → 遗留回退），且已决定的遗留引擎退役后
  对无效字符串的行为是 **暂停 + 修复提示**，永不静默
  重新排程。
- **「热路径性能。」** 该异议假定展开引擎会是
  ical.js（异步、懒加载、仅正向）。分支的引擎是
  **rrule.js（`rrule@2.8.1`，精确钉死）— 同步的** — 位于专用的
  日粒度、基于 UTC 的 occurrence util（`store/rrule-occurrence.util.ts`）。
  它运行在现有同步计算器内；选择器路径不引入任何异步依赖。
  （实现细节在分支上 — roadmap 是当前机制的事实来源。）

旧推理正确权衡的那一项成本：**`rrule` 是新的根级
运行时依赖**，项目规则通常禁止。维护者主导的 epic
有意接受它，并将其当作引擎对待 —
钉死到精确版本，并以差分规约电池作为升级绊线
（设备间解析器版本漂移是重复任务生成器，
见 roadmap 的风险模型）。该取舍已决定；不要在此重新争论，
也不要解除版本钉死。

### 对目标的诚实保留（据此设计）

1. **「更小的数据模型」只是部分成立。** 模式子模型坍缩（约 14
   字段 → 1 个类型化 `recurrence` 字段），但 `TaskRepeatCfg` 仍约有 18 个字段
   （任务模板 + SP 扩展 + 跟踪是不可约的）。真正的收益是
   **不变量消除** — 可判别联合使「字段互相矛盾」
   _不可表示_，删除隐式优先级 bug 类（例如「第 N 个星期几
   锚点胜过 `monthlyLastDay`」）并缩小 `data-repair.ts`。推销这一点，
   而不是字节数。
2. **「覆盖一切」成立，减去一处例外。** RFC 5545 无法表达
   「完成 **后** N 天」，因此 `repeatFromCompletionDate`（SP 的
   差异化能力）保持为独立的非 RRULE 表示。该模型是
   「RRULE 同构 + 一处例外」，引擎保持两种模式。

---

## 类型化模型（已取代 — 作为理据记录保留）

> 已取代 — 见上方 Decision 说明。保留是因为下方的不变量
> 分析是遗留字段隐式优先级规则的最佳记录。

该草图用一个可判别联合加上结束条件，替换 `TaskRepeatCfgCopy`
（`task-repeat-cfg.model.ts` — 编辑 `TaskRepeatCfgCopy`，不是 `Readonly` 别名）
中的扁平模式字段。草图（最终命名待定）：

```typescript
type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

type RecurrencePattern =
  | { freq: 'DAILY'; interval: number }
  | { freq: 'WEEKLY'; interval: number; byDay: Weekday[] } // WKST derived, never persisted — see 1.3
  | { freq: 'MONTHLY'; interval: number; on: { monthDay: number } } // BYMONTHDAY=n
  | { freq: 'MONTHLY'; interval: number; on: { lastDay: true } } // BYMONTHDAY=-1
  | { freq: 'MONTHLY'; interval: number; on: { week: 1 | 2 | 3 | 4 | -1; day: Weekday } } // BYDAY=nDD
  | { freq: 'YEARLY'; interval: number; month: number; day: number };

type RecurrenceEnd =
  | { type: 'never' }
  | { type: 'count'; count: number } // COUNT
  | { type: 'until'; until: string }; // UNTIL — DbDateStr, inclusive end-of-day

interface RecurrenceConfigPart {
  // canonical, RRULE-isomorphic, persisted/synced:
  recurrence: RecurrencePattern;
  end: RecurrenceEnd;
  deletedInstanceDates: string[]; // wire name kept verbatim — `exDates` would be exactly the forbidden rename
  // SP carve-out — not expressible in RFC 5545:
  repeatFromCompletionDate?: boolean;
}
```

- **判别式** 是 `freq`（+ 按月的 `on` 形态）。非法组合
  （例如在 yearly cfg 上设置星期几布尔值）变为不可表示。
- **不持久化派生字段。** UI 便利项（星期几复选框行、
  「Ends」控件、`quickSetting`）在打开表单时从 `recurrence`/`end` 计算，
  并在保存时写回 — 仅视图模型。这化解了已文档化的
  formly「整模型 emit」陷阱（没有第二份表示可漂移）。
- `repeatFromCompletionDate` 选择例外引擎（见下）。

---

## 纠正后的当前状态（已上线内容）

在 `src/app/features/task-repeat-cfg/` 中核实：

| 能力                                                       | 状态           | 位置                                                                              |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------- |
| Daily / Weekly / Monthly / Yearly + `repeatEvery` 间隔     | ✅             | `get-next-repeat-occurrence.util.ts`                                              |
| 星期几选择（weekly）                                       | ✅             | 7 个布尔值，`task-repeat-cfg.model.ts`                                            |
| **月内第 N 个星期几**（「第 2 个周二」「最后一个周五」）   | ✅ #6040       | `monthlyWeekOfMonth` + `monthlyWeekday`；`get-nth-weekday-of-month.util.ts`       |
| **月末最后一天**                                           | ✅ #7726       | `monthlyLastDay`；`get-next-repeat-occurrence.util.ts:125-140` 中的月末钳制       |
| 月初第一天                                                 | ✅             | quick-setting `MONTHLY_FIRST_DAY`                                                 |
| 跳过某次 occurrence（EXDATE）                              | ✅             | `deletedInstanceDates: string[]`                                                  |
| 完成后重复                                                 | ✅（SP 独有）  | `repeatFromCompletionDate` + `getEffectiveRepeatStartDate`                        |
| 等待完成（不堆叠）                                         | ✅             | `waitForCompletion`                                                               |
| 跳过逾期实例                                               | ✅             | `skipOverdue`                                                                     |
| 暂停 / 恢复                                                | ✅             | `isPaused`                                                                        |
| 子任务模板（+ 继承 / 自动更新标志）                        | ✅             | `subTaskTemplates`、`shouldInheritSubtasks`、`disableAutoUpdateSubtasks`          |
| DST 安全计算                                               | ✅             | 全程本地正午锚定                                                                  |
| 确定性多设备 ID                                            | ✅             | `rpt_${repeatCfgId}_${dueDay}`，`get-repeatable-task-id.util.ts`                  |
| 人类可读描述                                               | ✅             | `get-task-repeat-info-text.util.ts`                                               |
| 「下次到期」预览 + 历史热力图                              | ✅             | `repeat-cfg-preview/`、`repeat-task-heatmap/`                                     |

**真正缺失（在 Phase 3 交付）：** 结束条件（`COUNT`/`UNTIL`）、
每月多日（`BYMONTHDAY=1,15`）、`.ics`/CalDAV RRULE 生成
（Phase 1）。推迟 / YAGNI：`RDATE`、`RECURRENCE-ID`、`BYWEEKNO`、`BYYEARDAY`、
亚日粒度、完整双向 `.ics` 导入。`BYSETPOS`：仅序列化器的月末钳制惯用法需要
（见 Phase-1 映射表）；通用引擎侧展开仍推迟。

---

## 引擎决定：保留同步有界引擎

> _已对齐：_ 对遗留/关闭开关的 cfg 成立；打开开关的 `rrule` cfg 路由到
> 分支的同步 rrule.js 引擎（见「为何『拒绝原始字符串』已过时」）。无论哪种方式，
> ical.js 都仅用于边界 — 下段记录了原因，且仍然成立。

**Occurrence 运行时保持现有的同步有界循环**
（`get-next-repeat-occurrence.util.ts`、`get-newest-possible-due-date.util.ts`），
改为读取新的类型化 `recurrence` 字段而非扁平字段。
ical.js **仅** 用于在导出/CalDAV 边界序列化/解析 RRULE 字符串 —
从不进入 occurrence 热路径。

后果：

- 同步选择器中无对懒加载模块的异步依赖；启动/投影路径上无约 76 KB。
- Occurrence 逻辑几乎不变（同样的 `FREQ/INTERVAL/BYxxx` 数学，新的输入
  形态），因此确定性 ID 对等风险很小，**离线
  golden-master 测试已足够 — 不需要生产环境影子模式**。
- 新的常见模式（每月多日、结束条件）是对有界引擎的小扩展。冷门 RRULE 部分
  （通用 `BYSETPOS`、`BYWEEKNO`）并非免费；推迟它们，若最终需要，
  则通过 ical.js 在热路径 _之外_ 展开那些罕见配置。

---

## Phase 1 — 类型化模型 + RRULE 序列化器 + 对等测试架

可独立交付；序列化器打通日历双向同步
roadmap 中「SP 不生成 RRULE」的关键路径项。

### 1.1 添加类型化 `recurrence`/`end` 字段（加性，尚未成为规范）

在现有字段旁添加该联合。因为校验使用 typia
`createValidate`（容忍多余属性，**不是** `createValidateEquals` —
在 `validation-fn.ts` 中核实），读取新字段的旧客户端既不会
拒绝也不会剥离它们 — 构造上前向兼容。确认没有
`data-repair.ts` 通道删除它们，并添加前向兼容回归规约。

### 1.2 双向序列化器（类型化 ⇄ RRULE 字符串）

纯模块（例如 `task-repeat-cfg/rrule/`）。`typed → RRULE` 是简单的字符串
拼装（或 `ICAL.Recur.fromData({...}).toString()`）；`RRULE → typed`（用于 `.ics`
导入）使用 ical.js 解析。字段映射 — 必须覆盖一切：

| 类型化模型                                                                          | RRULE                                                                                                                                 |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `{freq, interval}`                                                                  | `FREQ=...;INTERVAL=...`                                                                                                               |
| WEEKLY `byDay`                                                                      | `BYDAY=MO,WE,...`（WKST：见 1.3）                                                                                                     |
| MONTHLY `on.monthDay`                                                               | `BYMONTHDAY=<n>`（n ≤ 28）；29–31 → 钳制惯用法 `BYMONTHDAY=<n>,-1;BYSETPOS=1`（SP 钳制到月末，纯 `BYMONTHDAY` 会跳过）                 |
| MONTHLY `on.lastDay`                                                                | `BYMONTHDAY=-1`                                                                                                                       |
| MONTHLY `on.{week,day}`                                                             | `BYDAY=<week><DD>`（`-1`=最后）                                                                                                       |
| YEARLY `{month, day}`                                                               | `BYMONTH=<m>;BYMONTHDAY=<d>`；2 月 29 日 → 同样的钳制惯用法（`BYMONTH=2;BYMONTHDAY=29,-1;BYSETPOS=1`，在非闰年钳制到 2 月 28 日）     |
| `end.count` / `end.until`                                                           | `COUNT=` / `UNTIL=`（日末 UTC）                                                                                                       |
| `deletedInstanceDates`                                                              | `EXDATE`（仅导出；线字段名保持原样）                                                                                                  |
| `repeatFromCompletionDate`                                                          | **不可表达** — 序列化器拒绝/标记；此类配置本质上与导出不兼容                                                                          |
| `startTime`、`remindAt`、`waitForCompletion`、`skipOverdue`、子任务标志、`order`    | SP 扩展，在 RRULE 频带之外 — 保留                                                                                                     |
| `isPaused`                                                                          | 无 RRULE 等价物 — 序列化器跳过或标记已暂停的 cfg（见下）                                                                              |
| `lastTaskCreationDay` / `lastTaskCreation`                                          | 内部创建游标，在 RRULE 频带之外 — 永不导出，也永不从导入的规则派生                                                                   |

`isPaused` 短路所有 occurrence 生成
（`store/task-repeat-cfg.selectors.ts:102,142`），因此将已暂停的 cfg 导出为
活跃 RRULE 会承诺 SP 从不创建的 occurrences。

三行 MONTHLY **并非独立** — 引擎以固定优先级解析一个锚点：
第 N 个星期几（`monthlyWeekOfMonth` + `monthlyWeekday`，
在 `get-next-repeat-occurrence.util.ts:110` 最先检查）→ `monthlyLastDay` →
startDate 的日-of-month。对携带多个锚点的 cfg 按行序列化会产出
`BYMONTHDAY=-1;BYDAY=2TU` — 在 RFC 5545 中是
**交集**，通常为空集。按该优先级顺序精确序列化一个锚点（epic 分支的
`legacyTaskRepeatCfgToRRule` switch 正是这样做的）。

### 1.3 DTSTART / 日期基准正确性（容易踩坑的部分）

- **DTSTART 是锚点日的本地正午，去掉时间分量。** 遗留
  引擎从不将 `startTime` 用于日期数学 — 它锚定在 `setHours(12,…)`
  （`get-next-repeat-occurrence.util.ts:43-45`）。非正午的 DTSTART 会使 ical.js 发出
  不同瞬时的 occurrences，可能在日/DST 边界上滚到不同的 **日历日**
  → 破坏对等并偏移 ID。`startTime` 保持为
  展开后的任务模板字段，不参与 DTSTART 日期数学。
- **EXDATE 按日字符串**，而非瞬时相等：用
  `getDbDateStr(occurrence)` 对照 `exDates` 过滤生成的 occurrences。
- **`UNTIL` 是包容性的日末。**
- **`WKST` = 有效 startDate 的星期几** — 或者不发出 `WKST` 并
  改为重新锚定 DTSTART，如 epic 分支所做（`getAlignedStartDate`）。
  **不是** 用户的 `firstDayOfWeek`：该设置仅用于显示
  （`src/app/core/date-time-format/custom-date-adapter.ts:19`）。引擎从
  startDate 的星期几起按滚动 7 日块计数
  （`getDiffInWeeks(startDate, d) % repeatEvery`，
  `get-next-repeat-occurrence.util.ts:88,95-96`），因此日历周的 `WKST`
  会偏移双周（`INTERVAL=2`）occurrences。反例：startDate 为周三
  2026-01-07，`INTERVAL=2`，`BYDAY=MO,FR` — SP 触发周一 01-12；`WKST=MO` 触发
  周一 01-19。

### 1.4 Occurrence 对等 golden master（门禁）

差分测试架：读取 **类型化** 字段的引擎产出
与今日读取扁平字段的引擎 **字节级相同的 occurrence 日期**，覆盖
每一种配置形态（daily、weekly 多日、`repeatEvery>1`、按日期的 monthly、
monthly 第 N 个星期几、monthly 最后一天、yearly、2 月 29 日），跨越多年窗口，
在 **两个** CI 时区中，跨越 DST 边界。限制每种形态的 occurrence 数量，以免日后
加入亚日 freq 时测试爆炸。基于完成的配置
**不在** 测试架范围内（不同引擎）。迁移以 100% 对等为门禁。序列化器往返
（`typed → RRULE → typed`）做属性测试。

---

## Phase 2 — 版本化迁移（经 op-log schema 系统）

> 纠正后的机制。**不是** `pfapi-config.js` — 该文件是
> `@deprecated LEGACY CODE`（其 `CROSS_MODEL_VERSION` 是过时的 `4.4`，且它
> `require` 一个已不存在的 `./migrate/cross-model-migrations` 路径）。

经活跃的 op-log schema 系统迁移：

- 向 `packages/shared-schema/src/migrations/` 添加 `vN → vN+1` 条目（注册表
  `index.ts`），同时提供 **`migrateState`（快照）** 与 **`migrateOperation`**
  （飞行中 ops），并提升 `CURRENT_SCHEMA_VERSION`
  （`packages/shared-schema/src/schema-version.ts`）。由
  `src/app/op-log/persistence/schema-migration.service.ts` /
  `remote-ops-processing.service.ts` 应用。转换本身是每个配置纯 O(1)
  的字符串/结构拼装 — 即使配置很多也很便宜；迁移
  **不得** 按配置展开 occurrences。
- **跨版本故事（解决旧客户端矛盾）。** _已于
  2026-08 纠正 — 见 #9664。_ 本要点的更早修订将
  **`MIN_SUPPORTED_SCHEMA_VERSION`** 命名为会把预类型化客户端推入
  `VERSION_UNSUPPORTED` 流程的「强制更新门禁」。那是反向的。
  它是应用于 _本_ 客户端读取的数据的下界
  （`remote-ops-processing.service.ts:177`、`operation-log-sync.service.ts:2318`、
  `verify-decrypted-op-integrity.ts:139`、`migrate.ts:49,115`）；发送方仅盖章
  `CURRENT_SCHEMA_VERSION`，不存在服务端客户端版本门禁。
  抬高它会卡住 **已更新** 的客户端 — 阻塞在上传前停住周期
  （`sync-wrapper.service.ts:595-606`），游标不前进，
  且 `VERSION_UNSUPPORTED` snack 故意不带补救措施
  （`remote-ops-processing.service.ts:540-546`，「更新本设备
  无济于事」）。它从不提示旧设备。**此处没有版本门禁。**

  `CURRENT_SCHEMA_VERSION` 的提升也不为 _当前已发布_
  机队提供门禁：master 在 4，因此提升落在 5 — 落在
  v17.0.0–v18.14.0 容忍带（`2 + 3`）内 — 那些客户端会应用 ops
  **而不迁移**；提升到 6 会阻塞它们但仍前进其游标，
  永久跳过这些 ops。（v18.14.0 之后的接收方 _会_ 安全阻塞，因此
  一旦该队列过期，提升才成为真正的围栏。）见
  `packages/shared-schema/src/schema-version.ts` 与
  `docs/sync-and-op-log/operation-log-architecture.md` §A.7.11。

- **真正解决此问题的机制已在
  `feat/rrule-epic` 上构建** — 不要重新推导。遗留排程字段保持
  与新表示一并填充，作为旧客户端的线格式
  （`util/legacy-cfg-to-rrule.util.ts`），遵循 **exact-or-null 契约**：
  当规则在遗留可表达性内时，遗留字段在相同日期触发；当不可表达时
  （`COUNT`/`UNTIL`、季节性 `BYMONTH`、
  `BYWEEKNO`/`BYYEARDAY`、多日列表、联合外序数）则写入
  `LEGACY_NEVER_FIRES_FALLBACK` 哨兵 — 一个全 false 的
  `WEEKLY` cfg，每个已发布版本都会确定性地永不触发。旧
  客户端创建 **无物**，而不是在错误日期创建会同步回来的任务。
  `getAlignedStartDate` 处理 `startDate` 的双重职责：既是
  monthly/yearly 日编码，也是间隔锚点。默认关闭的
  按设备开关（`RRuleFeatureFlagService`，localStorage，永不同步）在
  epic 未完成时保持遗留引擎为权威 — 使半成品阶段安全的是该开关，
  而非 schema 门禁。
- **永不在线上重命名 `deletedInstanceDates`。** 保持同步字段名；
  `exDates` 是内存/类型化名称，`EXDATE` 是导出名称。在
  整实体 LWW 下，赢得冲突的旧客户端会重新发出不含
  重命名字段的实体，并在全机队销毁跳过列表；部分更新的
  浅合并路径是第二条销毁向量。（若更倾向保留字面
  属性名，那样做即可 — 要点是：不重命名持久化键。）

---

## Phase 3 — RRULE 原生功能

在类型化模型成为规范后，新模式是类型化联合的添加 + 小的
有界引擎扩展：

- **结束条件。** `end: {type:'count'|'until'}`，在
  occurrence 循环中作为守卫强制执行（超过边界返回 `null`）。UI「Ends」控件从
  `end` 派生，不额外持久化。标签经 `T`/`TranslateService`（仅
  `en.json`）。
- **每月多日**（`BYMONTHDAY=1,15`）等，随模型/引擎增长。

### Phase 3 测试

- 不超过 `COUNT`/`UNTIL` 的 occurrences，每种 freq，两个 CI 时区。
- **决定并测试 `COUNT` vs `exDates`：** 被跳过的实例是否消耗一次计数？
  （ical.js 在 EXDATE 前计数；SP 在生成后过滤 — 有意选择「10 个实际任务」
  vs「10 个已排程」并测试。）
- `UNTIL` 边界：结束日包含，次日排除。

---

## `repeatFromCompletionDate` 例外

不是单独的 _引擎_ — 它运行同样的 `FREQ/INTERVAL` 计算，但每个周期将
**起始日期** 重新锚定到 `lastTaskCreationDay`（`getEffectiveRepeatStartDate`）。
因此真正的风险是喂入 **错误的 DTSTART/锚点**，而非「错误引擎」：

- 它 **没有稳定的 DTSTART** → 不可用 RRULE 表达；序列化器拒绝它
  （本质上与导出不兼容）。
- 将其建模为联合变体 + `repeatFromCompletionDate` 标志；在任何固定锚点路径
  **之前** 路由到动态锚定计算。
- 诚实的代码缩减核算：仅删除固定排程管道；
  完成路径保留。

---

## 风险登记

| 风险                                                                    | 严重度      | 缓解                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 模型切换时 occurrence 日期偏移 → 实例重新键控                           | **Blocker** | 保留现有有界引擎；Phase-1 golden master 门禁迁移                                                                                  |
| 跨版本同步：旧客户端无法读取类型化模型                                  | **Blocker** | 不存在版本门禁（#9664）。按 exact-or-null 契约在线上保持遗留字段填充；对不可表达规则使用 `LEGACY_NEVER_FIRES_FALLBACK`；按设备开关门控 epic |
| 重命名 `deletedInstanceDates` 线键丢失跳过数据                          | High        | 不重命名持久化键；仅在导出时使用 `EXDATE`                                                                                        |
| `repeatFromCompletionDate` 被喂入固定 DTSTART → 变成固定日历            | High        | 在任何固定锚点路径前路由完成模式；每周期重新锚定                                                                                 |
| 错误的迁移子系统（`pfapi-config.js`）                                   | High        | 使用 `packages/shared-schema` 迁移 + `schema-migration.service.ts`                                                               |
| 异步/仅正向 ical.js 迭代导致的热路径回退                                | High        | ical.js 仅用于字符串解析/序列化；同步有界引擎保持为运行时                                                                        |
| DTSTART 携带 `startTime` → 日滚动                                       | High        | DTSTART = 锚点日本地正午；`startTime` 在展开后应用                                                                               |
| EXDATE 永不匹配（瞬时 vs 正午）                                         | Medium      | 按 `getDbDateStr` 日字符串过滤                                                                                                   |
| 双周偏移（WKST 默认）                                                   | Medium      | 由 startDate 派生的 WKST，或省略 + 重新锚定 — 见 1.3                                                                             |
| `UNTIL` 丢掉最后一天                                                    | Medium      | 包容性日末                                                                                                                       |
| ~~生产影子模式成本~~                                                    | n/a         | 不需要 — 引擎未变；离线 golden master 覆盖对等                                                                                   |
| ~~新依赖的包体积~~                                                      | n/a         | 类型化模型计划中无新依赖（epic 确实用钉死的 `rrule` — 见 Decision 说明）                                                         |

---

## 可度量成功标准（门禁）

1. **Phase-1 对等：** 类型化字段引擎 == 扁平字段引擎，覆盖完整
   配置形态语料库、5 年窗口、两个 CI 时区；测试架在 CI 中绿灯。
2. **序列化器往返** `typed → RRULE → typed` 覆盖每一种形态
   （属性测试），含 monthly 第 N 个星期几与最后一天。
3. **无新运行时依赖**（仅 ical.js，仅边界）。_（已取代 —
   epic 有意添加了钉死的 `rrule`；见 Decision 说明。）_
4. **不重命名任何同步字段键**（`deletedInstanceDates` 保留在线上）。
5. **前向兼容：** 读取新字段的旧客户端既不报错也不
   剥离它们（回归规约）。
6. 迁移后，`repeatFromCompletionDate`、`waitForCompletion`、`skipOverdue`、
   子任务模板与跳过列表行为不变（回归规约绿灯）。
7. **Phase-3 结束条件** 随两个 CI 时区中通过的测试上线；UI
   结束状态是派生的，非持久化的。

---

## 涉及文件（已核实路径）

| 区域                                                                        | 文件                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型                                                                        | `src/app/features/task-repeat-cfg/task-repeat-cfg.model.ts`（`TaskRepeatCfgCopy`）                                                                                                                                                                                                                              |
| Occurrence 引擎（保留，改指向类型化字段）                                   | `store/get-next-repeat-occurrence.util.ts`、`store/get-newest-possible-due-date.util.ts`、`store/get-first-repeat-occurrence.util.ts`、`store/get-nth-weekday-of-month.util.ts`、`store/get-effective-repeat-start-date.util.ts`、`store/get-effective-last-task-creation-day.util.ts`                          |
| 确定性 ID（必须保持稳定）                                                   | `get-repeatable-task-id.util.ts`                                                                                                                                                                                                                                                                                |
| 选择器 / 投影                                                               | `store/task-repeat-cfg.selectors.ts`                                                                                                                                                                                                                                                                            |
| 服务 / 创建                                                                  | `task-repeat-cfg.service.ts`                                                                                                                                                                                                                                                                                    |
| 快速设置 / 对话框 UI                                                        | `dialog-edit-task-repeat-cfg/`（表单常量、quick-setting 更新、构建选项）                                                                                                                                                                                                                                        |
| 人类可读文本                                                                | `src/app/features/tasks/task-detail-panel/get-task-repeat-info-text.util.ts`                                                                                                                                                                                                                                    |
| RRULE 序列化/解析（仅边界）                                                 | `src/app/features/schedule/ical/ical-lazy-loader.ts`（复用加载器）                                                                                                                                                                                                                                              |
| 迁移（已纠正）                                                              | `packages/shared-schema/src/migrations/`（+ `index.ts`）、`packages/shared-schema/src/schema-version.ts`（`CURRENT_SCHEMA_VERSION` — 注意 `MIN_SUPPORTED_SCHEMA_VERSION` _不是_ 跨版本门禁，#9664）、`src/app/op-log/persistence/schema-migration.service.ts`                                         |
| 旧客户端线兼容（已在 `feat/rrule-epic` 上构建）                             | `src/app/features/task-repeat-cfg/util/legacy-cfg-to-rrule.util.ts`（`legacyTaskRepeatCfgToRRule`、`rruleToLegacyTaskRepeatCfg`、`LEGACY_NEVER_FIRES_FALLBACK`、`getAlignedStartDate`）、`src/app/features/config/rrule-feature-flag.service.ts`                                                                 |
| 校验 / 修复                                                                 | `src/app/op-log/validation/`（`createValidate`、`data-repair.ts`）                                                                                                                                                                                                                                               |
| 日历写入边界（注：早于 #6040/#7726/`deletedInstanceDates`）                 | [ARCHITECTURE-DECISIONS.md #9 — calendar writes live in plugins](../../ARCHITECTURE-DECISIONS.md#9-calendar-writes-live-in-plugins-behind-per-provider-opt-in)。CalDAV VEVENT 展开作为 `caldav-calendar-provider` 插件上线；按 occurrence 编辑（`RECURRENCE-ID`/`EXDATE`）仍开放，#8148 |

---

## 附录 A — 竞品对比

「用户期望什么」的参考（SP 列截至 2026-06 已核实；
剩余 ❌ 是真正的目标 — 结束条件）。合并自前
`recurring-events-gap-analysis.md` / `recurring-events-industry-standards.md`。

| 功能                 | Google Calendar | Todoist | Things 3 | TickTick | Super Productivity |
| -------------------- | --------------- | ------- | -------- | -------- | ------------------ |
| 基础（D/W/M/Y）      | ✅              | ✅      | ✅       | ✅       | ✅                 |
| 每 N 间隔            | ✅              | ✅      | ✅       | ✅       | ✅                 |
| 星期几选择           | ✅              | ✅      | ✅       | ✅       | ✅                 |
| 月内第 N 个星期几    | ✅              | ✅      | ✅       | ✅       | ✅（#6040）        |
| 月末最后一天         | ✅              | ✅      | ✅       | ✅       | ✅（#7726）        |
| N 次后结束           | ✅              | ❌      | ❌       | ✅       | ❌（Phase 3）      |
| 在某日期结束         | ✅              | ❌      | ❌       | ✅       | ❌（Phase 3）      |
| 完成后               | ❌              | ✅      | ✅       | ✅       | ✅（例外）         |
| 跳过某次 occurrence  | ✅              | ✅      | ✅       | ✅       | ✅                 |
| 自然语言             | ✅              | ✅      | ❌       | ❌       | ✅（信息文本）     |
| iCal 导出            | ✅              | ✅      | ❌       | ✅       | ❌（Phase 1）      |

---

## 附录 B — RFC 5545 RRULE 参考

iCalendar 规范（RFC 5545）的 `RRULE` 属性是类型化模型所镜像、
序列化器所面向的重复标准。

**核心组件**

| 参数                | 含义                       | 取值                                                                     |
| ------------------- | -------------------------- | ------------------------------------------------------------------------ |
| **FREQ**（必需）    | 频率                       | `YEARLY`、`MONTHLY`、`WEEKLY`、`DAILY`、`HOURLY`、`MINUTELY`、`SECONDLY` |
| **INTERVAL**        | 迭代间隔                   | 正整数（默认 1）                                                         |
| **COUNT**           | occurrence 次数            | 正整数                                                                   |
| **UNTIL**           | 结束日期（时间）           | DATE 或 DATE-TIME                                                        |
| **WKST**            | 一周起始日                 | `MO`…`SU`（默认 `MO`）                                                   |

**BYxxx 部分**

| 参数           | 含义                | 取值                                               |
| -------------- | ------------------- | -------------------------------------------------- |
| **BYDAY**      | 星期几              | `MO`…`SU`，可选序数前缀（`2TU`、`-1FR`）           |
| **BYMONTH**    | 月份                | 1–12                                               |
| **BYMONTHDAY** | 月内日              | 1..31 或 -31..-1（负数为从末尾计）                 |
| **BYYEARDAY**  | 年内日              | 1..366 / -366..-1                                  |
| **BYWEEKNO**   | ISO 周编号          | 1..53 / -53..-1                                    |
| **BYSETPOS**   | 集合内位置          | 1..366 / -366..-1                                  |

`BYDAY` 序数前缀：`1MO`/`+1MO` = 第一个周一，`-1MO` = 最后一个周一，
`2TU` = 第二个周二。

**示例**

```
FREQ=DAILY;COUNT=10                         # daily, 10 times
FREQ=WEEKLY;UNTIL=20241231T235959Z;BYDAY=MO,FR
FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR       # every other week, M/W/F
FREQ=MONTHLY;BYMONTHDAY=15                   # 15th
FREQ=MONTHLY;BYMONTHDAY=-1                   # last day
FREQ=MONTHLY;BYDAY=2TU                       # 2nd Tuesday
FREQ=MONTHLY;BYDAY=-1FR                      # last Friday
```

**例外：** `EXDATE` 排除 occurrences（= SP `deletedInstanceDates`）；
`RDATE` 添加它们（推迟 — 见「真正缺失」）。
