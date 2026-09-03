# 冲突日志、不相交字段自动合并与审阅 UI

LWW 冲突自动解决如何被记录（冲突日志）、何时保留两次并发编辑而非丢弃一侧（不相交字段自动合并），以及用户如何审阅发生了什么（`/sync-conflicts` 页面、横幅、徽章）。

> **当前生产状态：** 日志存储与审阅 UI 已存在，但主远程冲突处理路径目前设置了 `disableConflictJournal: true`。请将日志视为休眠的、尽力而为的审阅能力——而非当前冲突解决的完整证据。不相交字段合并与胜出方选择独立于日志发射而保持活跃。
>
> 日志也不是「无静默丢失」保证。#9073 缓解措施会把带有保留本地证据的、受支持的无待处理重叠变成普通 LWW 冲突，但[剩余的组合残留](#composition-residual-pre-existing-class)并不总能构造出安全的本地侧。此类回退既不产生冲突对象，也不产生日志行。

代码位于 `src/app/op-log/sync/`：

| 关注点                        | 文件                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| 日志数据模型 + 存储     | `conflict-journal.model.ts`, `conflict-journal.service.ts`          |
| 分类（分类法）      | `conflict-journal-emission.util.ts`                                 |
| 不相交字段自动合并      | `conflict-disjoint-merge.util.ts`, `conflict-resolution.service.ts` |
| 审阅 UI 派生 + 操作 | `sync-conflict-review.util.ts`, `sync-conflict-ui.service.ts`       |
| 横幅 / 徽章                 | `sync-conflict-banner.service.ts`                                   |
| 页面                           | `src/app/pages/sync-conflicts-page/`                                |

## 冲突日志

当发射启用时，一次 LWW 冲突自动解决会被记录为 `ConflictJournalEntry`，存放在**独立的 IndexedDB 数据库 `SUP_CONFLICT_JOURNAL`** 中——刻意与 `SUP_OPS` 分离，使日志记录绝不会触及 op-log 的 schema/版本管理或危及其数据。

契约：

- **仅观察。** 记录一条条目绝不会影响 LWW 选择了哪条操作，且每一次日志写入都会吞掉自身错误——日志失败绝不能抛回冲突解决。推论：op-log 写入与日志写入**不是原子的**。Op log 是事实来源；日志是尽力而为的记录，两者之间的崩溃可能丢失一条日志条目但绝不会丢失一条操作。永不抛出契约也覆盖读取与状态写入（`list` → `[]`，`getEntry` → `undefined`，标记 kept/flipped 被吞掉）：`list()` 在解决后通知步骤中被 await，因此日志失败只会降级徽章/审阅界面，绝不会降级同步。一个不对称点：`merged` 条目声称「两侧都保留」，因此仅在合并后的操作被持久追加**之后**才写入日志——日志可以少报一次合并，但绝不会报告未发生的合并。
- **仅本设备，永不同步。** 条目 verbatim 捕获冲突两侧的字段值与不透明 action 载荷——包括 op log 刻意丢弃的那一侧。上传它们会复活已丢弃的数据；它们也被排除在备份/导出之外（见 wiki `3.06-User-Data`）。
- **在完整数据集替换时清空。** 日志条目描述的是操作历史上的冲突；当该历史被整批替换时，条目即过时（且跨用户配置文件时还是隐私泄漏）。`BackupService.importCompleteBackup`——每一条替换路径（配置文件切换、JSON 导入、本地备份恢复、SuperSync 恢复）都会汇入的瓶颈——调用 `ConflictJournalService.clearAll()`。
- **保留策略。** 每次剪枝应用先到先绑的边界：超过 14 天的条目（`JOURNAL_RETENTION_DAYS`），然后是超出最新 200 条的任何内容（`JOURNAL_MAX_ENTRIES`）。剪枝在应用启动时运行，并在会话中从 `record()` 机会性地运行——但会话中剪枝是**按计数触发的**：仅当存储增长超过软上限 `JOURNAL_MAX_ENTRIES + JOURNAL_PRUNE_SLACK`（220）时才触发，然后剪回最新 200 条。因此长时间低流量会话（条目很少、从未越过软上限）依赖下一次应用启动来强制执行 14 天年龄边界。

### 重新启用发射前的安全边界

`SUP_CONFLICT_JOURNAL` 是普通的、明文的本设备 IndexedDB。它不使用同步提供者的传输加密或 SuperSync E2EE。在保留策略、数据集替换或显式清空移除之前，已有行在本地浏览器配置文件中仍可读。

由于字段与 action 值按原样存储，一次 `ISSUE_PROVIDER` 冲突可能把 API 密钥、access/refresh token、client secret 或类似凭据持久化到该数据库，并通过审阅 UI 暴露。在为适配器形状的字段差异与不透明 action 载荷实现并测试密钥感知的排除或脱敏之前，正常生产发射必须保持禁用。仅在 UI 中隐藏值是不够的；存储的日志行本身绝不能包含密钥。

### 分类分类法

`buildConflictJournalEntry` 按优先级顺序对每次已解决冲突分类：`clock-corruption-suspected` → `delete-wins` → `delete-lost` → `noise` → `newer`/`tie`。`noise`（状态 `info`）仅当被丢弃侧只改动了 NOISE_FIELDS（`modified`、`lastModified`、`created`）时触发——即没有真正的内容丢失。其他一切为状态 `unreviewed`，并计入徽章。

### 字段差异与每侧存在性

`fieldDiffs` 是两侧已改字段的并集，每个值按原样捕获，外加 `localChanged`/`remoteChanged` 标志，记录每侧是否真正触及该字段。这些标志区分「该侧从未改过该字段」与「改成了某个值」——没有它们，并集差异会把未触及侧存为 `undefined`，而 Flip 会分发 `{ field: undefined }`，清除仅胜出方拥有的字段。标志存在之前持久化的条目缺少它们；读取方（`loserChangesFor`/`winnerChangesFor`）回退到值存在性判断，对该数据是精确的，因为操作载荷是纯 JSON，无法编码真正的 `undefined`。

### 非适配器（「不透明」）操作

并非每个持久化 action 都是适配器形状（`{ [payloadKey]: { id, changes } }` 或扁平实体）。`convertToSubTask` 持久化 `{ taskId, targetParentId, afterTaskId }`；调度/排序/高级配置 actions 有类似的领域特定形状。提取按以下顺序从两个来源解析每个操作的 delta：

1. 适配器形状的 action 载荷（`extractUpdateChanges`）；
2. 由 `OperationCaptureService` 在捕获时计算的 `entityChanges`（覆盖 TIME_TRACKING 与 `syncTimeSpent`）。

提取作用域限定于当前冲突中的实体。`entityId` 与 `entityIds` 被视为一个去重集合，即便对不一致的遗留元数据也与服务器冲突检测匹配。对于多实体操作，仅接受匹配的、`opType: UPDATE`、纯对象 delta、且无身份（`id`）字段的 `entityChanges` 条目。没有此类安全目标 delta 的多实体操作是不透明的；它绝不能借用主实体的适配器载荷，因为那样可能把一个实体的值归到另一个实体。因此，直接格式的遗留批量载荷对非主实体是不透明的。

两者皆无的操作是**不透明的**（`hasOpaqueChanges`）。不透明操作仍代表真实状态变更，因此：

- 带有不透明操作的败方侧**绝不会**被分类为 `noise`——损失会以 `unreviewed` 呈现；
- 原始 action 载荷作为 `kind: 'action'` 字段差异保留在条目中（字段 = action 类型），因此在操作本身消失后，被丢弃的变更仍可审阅；
- `kind: 'action'` 差异排除在 flip/过时计算之外——它们不是实体字段；
- 带有不透明操作的一侧**永远不符合不相交合并资格**（见下文）。

## 不相交字段自动合并

当两个客户端并发编辑同一实体但不同的（非噪声）字段时，整实体 LWW 会丢弃一侧的真实编辑。取而代之，通过合成一条合并的 UPDATE 操作来保留两侧。资格条件（`isDisjointMergeEligible` + `conflict-resolution.service.ts` 中的 archive-plan 守卫）：

- 任何一侧都没有 DELETE 操作，且计划不是 archive plan；
- 任何一侧都不包含多实体操作。解决会拒绝原始操作，因此仅合并冲突实体会静默丢弃批量操作的兄弟实体更新。不安全的部分补偿在任何 op-log 变更之前失败关闭，使本地操作保持待处理并呈现同步错误。整集远程 DELETE/archive 胜出方与重建的本地 archives 保留其既有原子路径。唯一显式可分解的遗留 action（`TASK_ROUND_TIME_SPENT`）从**当前**状态重新发出其已知的逐任务时间字段（因此后续本地编辑不会被覆盖）。当前 round-time 捕获故意发出空的 `entityChanges` 数组，因此解析器仅在验证其载荷与 ID 元数据后，才使用该 action 的静态 `timeSpent`/`timeSpentOnDay` 契约。这包括当远程 delta 可安全提取且不相交时（例如远程标题对本地舍入时间）远程胜出的冲突目标，以及非冲突兄弟。重叠目标字段仅当远程 delta 覆盖整个耦合本地字段集时才远程胜出；部分重叠或不透明远程目标 delta 则失败关闭。当前状态中缺失的兄弟不会被重建（后续删除拥有它）。任意批量 actions 不会从 `entityChanges` 拆分：关系/列表变更可能携带纯载荷形状无法证明的原子不变量；
- 任何一侧都没有不透明操作（其变更无法带入合成 delta——合并会静默丢弃它们，且两个客户端会合成不同的结果）；
- 两侧都至少改动了一个真实（非噪声）字段；
- 两侧的非噪声已改字段集不相交；
- 该实体在本批次中只有一个冲突。`detectConflicts` 按每个无按实体聚合的远程操作发出一个冲突，因此有 ≥2 个并发远程操作的实体会合成多条合并操作，其时钟互相支配——被支配的兄弟可能被取代，其字段被静默丢弃。此类实体回退到整实体 LWW（诚实拒绝；按实体聚合成一条操作是可能的未来改进）；
- 实体类型有 `RECREATE_FALLBACK`（`TASK` / `PROJECT` / `TAG` / `SIMPLE_COUNTER`）。合并操作是部分 delta，因此若它在已应用该删除的客户端上胜过并发 DELETE（被动观察者，不会经过 `_convertToLWWUpdatesIfNeeded` 中的全实体重建），`lwwUpdateMetaReducer` 的 `addOne` 重建分支必须回填为 schema 有效的实体。没有回退的类型（`NOTE` / `METRIC` / `TASK_REPEAT_CFG` / `ISSUE_PROVIDER`）会重建出无效实体，因此回退到整实体 LWW（其本地胜出操作携带完整快照）。残留：回退类型在该罕见竞态中仍可能用 `DEFAULT_*` 回填重建，与持有者分歧——与 `recreate-fallback.const.ts` 中记载的同一有界限制。

**收敛契约：** 无论哪一侧执行合并，两个客户端都必须合成字节相同的合并 **changes delta**。该 delta 是两侧非噪声字段的并集（不相交，因此不会互相覆盖），外加任一侧改动过的噪声字段，通过确定性的 `(timestamp, clientId)` 决胜解析。关键是：delta **仅**从两侧的操作派生——**不**从任一客户端的当前实体快照。完整实体快照会拖入**任一侧都未触及**的字段；若此类未触及字段在两客户端间暂时不同（普通的交错同步竞态——例如一侧已应用第三台设备的编辑而另一侧尚未），两个快照会不同，在相同的 `max(timestamp)` 下 LWW 平局，并**永久**分歧。参见 `synthesizeMergedChanges`。

**原子性 / 不再合并契约：** 合并解决恰好是一条新的 UPDATE 操作，携带**扁平 PARTIAL delta**（仅已改字段），像普通编辑一样叠在两侧历史之上——没有历史回退。`lwwUpdateMetaReducer` 通过 `updateOne`（浅合并）应用它，因此 delta 之外的字段在各自客户端上保持自己的值。由于载荷是扁平的（不是 `{ changes }` 形状），`extractUpdateChanges` 对其产生 `{}`，因此合并操作自身永远不会成为不相交合并合格：合并不会级联或在后续同步中再合并。合并解决以 `winner: 'merged'`、状态 `info`（什么都没丢弃）记入日志，并按字段记录每侧提供的值。

### 组合残留（既有类别）

合并操作是普通的部分 UPDATE，因此后续整操作 LWW 组合需要另一次因果调和步骤。#9073 无待处理缓解现会重建保留的、可分解的重叠侧，并经确定性 LWW 路由；本地胜出方发出正常的支配性完整替换操作。

该缓解受接收方可用的证据与操作形状约束。当并发本地证据已被压缩掉或无法安全分解时（多实体、本地 delete/archive，以及合并/不透明或噪声形状的组合情形），到达顺序行为仍然存在。混合机群增加另一限制：早于替换模式 LWW 的接收方会把调和用的完整快照当补丁应用，并可能保留当前客户端清除的字段。只有成功构建合成冲突的情形才会进入日志分类；回退情形对审阅 UI 仍不可见。

类别级修复——按字段时间戳、每一次并发应用上有保证的调和操作，或携带父操作身份以便后续解决能分解合并——属于 op-log 层面的后续工作。

## 审阅 UI（`/sync-conflicts`）

入口：自动解决冲突的同步后横幅、未审阅计数徽章，以及设置 → 同步中的链接。两个视图：未审阅与历史（全部，最新优先）。

每条目操作（`SyncConflictUiService`）：

- **KEEP** 确认自动解决（`status: 'kept'`）。存在批量全部保留。
- **FLIP** 通过分发一个普通实体更新 action——与手动编辑分发的相同——重新应用被丢弃侧，使操作捕获 meta-reducer 把它变成可同步到各处的操作。没有历史回退；flip 是叠在当前状态上的全新编辑。应用前，**过时守卫**会在实体于冲突解决后被编辑过时请求确认。它检查胜出方已改字段的当前值是否偏离日志中的胜出方值，外加——**仅对远程胜出**条目——一个**仅败方**字段（flip 会写入但胜出方从未改过、因而对胜出方值不可见）的当前值是否已是 flip 将写入的值。仅败方检查限定于 `winner === 'remote'`，因为只有那时败方（本地、乐观应用）的值才留在当前状态中，给出有效的「未编辑」基线；对本地胜出，败方（远程）值从未被应用且没有基线记入日志，因此那里的 `current !== flipVal` 是正常的解决后状态，不是编辑。批量 flip 路径不显示对话框，因此它会**跳过**过时条目而非覆盖它们。

  已知缺口：对**本地胜出条目上仅败方字段**的解决后编辑尚不可检测（无日志基线），因此那里的 flip 仍可能静默覆盖它——后续需要日志中的按字段解决后基线。

**Flip 能力刻意狭窄**（`canFlip`）；其他一切返回 `unsupported`，保持条目为 `unreviewed`，并显示错误 snack——仅当真正分发了操作时，条目才会被标记为 `flipped`：

- 仅 TASK / PROJECT / NOTE / TAG（其 flip 可表达为普通 `{ id, changes }` 更新的类型）；
- 不适用于 `delete-lost` / `delete-wins`——重新应用删除或复活已删实体需要普通更新无法表达的 delete/restore 语义（推迟）；
- 当败方没有可重新应用的字段值时不行（空差异、不透明 `kind: 'action'` 差异）；
- 当败方变更触及不安全字段（`FLIP_UNSAFE_FIELDS`）时不行：带关系的字段（`projectId`、`parentId`、`subTaskIds`、`tagIds`、`taskIds`、`backlogTaskIds`、`noteIds`）由 meta-reducers 跨实体保持一致，通过裸适配器更新重新应用配对的一侧会破坏另一实体的成员列表；调度/提醒字段（`dueDay`、`dueWithTime`、`deadlineDay`、`deadlineWithTime`、`reminderId`、`remindAt`、`deadlineRemindAt`）有存在于专用流程中的不变量（互斥、TODAY_TAG 成员资格、提醒创建/取消）。

翻转的 TASK 标题以 `isIgnoreShortSyntax: true` 分发——它是日志中的字面值，不是用户输入，因此被丢弃标题中的 `#tag`/`+project`/`@schedule` 标记绝不能再解析成跨实体变更。
