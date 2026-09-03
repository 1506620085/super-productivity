# 操作日志架构

> **维护者路由：** 请使用
> [同步架构现场指南](./sync-architecture.html) 获取当前
> 整系统心智模型。本长文保留深层理由、
> 迁移策略与实现历史；其历史清单中的易变机制
> 可能滞后于现场指南所链接的聚焦契约与可执行所有者。

**状态：** 深层理由与迁移/实现历史；接收方
跨版本迁移已启用。
**路由审阅：** 2026 年 7 月 20 日

> **历史概览警告：** 下方介绍性清单早于
> 后来的 file-v3、冲突、恢复与服务器保留工作。所有提供者
> （SuperSync、WebDAV/Nextcloud、Dropbox、OneDrive 与 LocalFile）现已进入
> 统一的客户端操作日志管道；请用现场指南及其聚焦
> 源映射了解当前行为。

---

## 引言：核心架构

### 核心概念：事件溯源

操作日志记录可重放的状态转换，而非独立持久化每个
NgRx 模型。它受事件溯源启发，但是有界的
操作日志，而非自时间起点起的不可变历史：

- **本地恢复边界：** 启动时加载 state-cache 快照，然后重放
  保留的尾部。安全的终端全状态操作可替代该工作。
- **可变生命周期元数据：** 操作载荷是追加式的，但投递、
  应用、拒绝与重试元数据随行进度而变化。
- **有界历史：** 压缩删除已被安全快照与相关同步前沿覆盖的操作。
  `DELETE` 被记为一条操作，但它与被拒绝的败方都不是永久审计历史。

### 1. 数据如何保存（写路径）

当用户执行操作（如勾选复选框）时：

1. **Reduce：** NgRx 同步提交实时状态转换。
2. **Capture：** 捕获 meta-reducer 将持久本地 action 标记为
   pending，或在应用远程操作期间延迟它。
3. **Persist：** 非分发 effect 序列化已捕获的 actions，校验
   每条操作，并在操作日志锁下原子追加操作及其新向量钟。
4. **Schedule sync：** 仅在该持久追加之后，客户端才更新其
   pending 状态并请求上传。

Reducer 故意在异步追加之前运行。若持久化
失败，实时状态因此可能领先于持久日志；客户端呈现
重新加载动作，并阻止压缩把该幻影变更烤进
快照。打开的标签页不交换操作载荷：web 启动守卫
会阻止第二个活动实例。

### 2. 数据如何加载（读路径）

重放自起点起的_每一条_操作会太慢。我们使用 **Snapshots** 加速：

1.  **Load Snapshot：** 启动时，应用加载最新有效的 state-cache 快照。
2.  **Replay Tail：** 应用然后查询日志：「给我该快照_之后_发生的所有操作。」
3.  **Fast Forward：** 它将这些少量「尾部」操作应用到快照。现在应用已完全最新。
4.  **Hydration Optimization：** 若刚刚发生同步，我们可能直接加载新状态，完全跳过重放。

### 3. 同步如何工作

操作日志支持两类同步：

**A. SuperSync 操作传输**

- **Exchange：** 设备交换单独的 `Operations`，而非完整文件。这节省大量带宽。
- **Conflict Detection：** 因为每条操作都有 **Vector Clock**，我们可以数学证明两次变更是否并发。
  - _示例：_ 设备 A 发送「Update Title (Version 1 -> 2)」。设备 B 看到自己处于「Version 1」，因此安全应用更新。
  - _冲突：_ 若设备 B _也_做了变更且处于「Version 2」，它知道「等等，我们同时改了 Version 1！」-> **检测到冲突**。
- **Resolution：** 语义优先级与合格的不相交字段合并先运行；
  剩余冲突用 LWW 确定性解决。普通操作
  冲突不会阻塞在胜出方对话框上。被拒绝的行仅保留到
  压缩，且生产冲突日志发射当前已禁用。

**B. 文件提供者操作传输**

- 默认 v2 格式在一个 `sync-data.json` 中存储完整状态/归档基线与有界近期操作
  缓冲；每次携带操作的上传重写该单体。
- 可选加入的 v3 拆分格式使 `sync-ops.json` 成为热提交点，并仅在引导、压缩、迁移、强制上传
  或缺口恢复时重写快照/归档文件。
- 两种格式都进入同一客户端操作日志管道。参见
  [Part B](#part-b-基于文件的同步) 了解当前传输契约。

### 4. 安全与自愈

校验发生在操作入口以及 Part D 中描述的
hydration/同步检查点。可修复状态可能产生全状态 `REPAIR`
操作；未修复的失败阻止会话声称成功。修复
行像其他操作一样被保留，而非作为永久审计历史。

### 5. 维护（压缩）

在 500 次持久本地追加之后，客户端_尝试_压缩。当远程 reducer/归档工作、待处理本地写入、持久化
分歧、hydration 回退或空/降级存储使快照不安全时，尝试可安全跳过。
成功的一遍写入新的 state-cache 边界，并仅删除被该边界覆盖的旧终端行；
未同步与不完整的行保留。

---

## 概览

操作日志服务**四个不同目的**：

| 目的                    | 描述                                       | 状态       |
| -------------------------- | ------------------------------------------------- | ------------ |
| **A. 本地持久化**   | 快速写入、崩溃恢复、事件溯源       | 完成 ✅  |
| **B. 基于文件的同步**     | 默认 v2 单体或可选加入的 v3 拆分文件      | 完成 ✅  |
| **C. 服务器同步**         | 上传/下载单独操作（SuperSync） | 完成 ✅¹ |
| **D. 校验与修复** | 防止损坏、自动修复无效状态     | 完成 ✅  |

> ¹ **跨版本同步**：接收方操作迁移（A.7.11）在冲突检测之前运行。剩余 caveat 是已发布的机群：v17.0.0–v18.14.0 客户端会未迁移地应用较新 schema 的操作（最高 schema 5）——见 [A.7.11 升级策略](#升级策略--升级不会保护已发布机群)。

> **✅ 迁移已启用**：迁移安全（A.7.12）、尾部操作一致性（A.7.13）与统一迁移接口（A.7.15）已实现，且存在真实迁移——`CURRENT_SCHEMA_VERSION = 4`（v1→v2 misc-to-tasks-settings 拆分；v2→v3 与 v3→v4 是语义兼容性屏障）。见 A.7 与 A.7.11 升级策略。

本文档围绕这四个目的组织。大多数复杂性在 **Part A**（本地持久化）。**Part B** 通过 `FileBasedSyncAdapter` 处理基于文件的同步。**Part C** 处理与 SuperSync 服务器的基于操作的同步。**Part D** 集成校验与自动修复。

```
Local intent ──► NgRx reducer ──► live state
      │
      └──► capture + ordered append ──► SUP_OPS
                                            │
                                            ├──► SuperSync operation transport
                                            └──► file-provider envelopes

Remote input ──► migrate/filter/resolve ──► reducers + archive side effects
                                                │
                                                └──► durable checkpoint/cursor
```

---

## 为何采用此架构：被拒绝的替代方案

操作日志**不是**偶然复杂性。它是满足一个硬性、不可协商约束的最小设计：

> **设计目标：并发多设备编辑时无静默数据丢失，
> 离线优先，且「哑」服务器无法合并**（文件提供者没有
> 服务器逻辑；SuperSync 载荷可以端到端加密并对
> 服务器不透明）。

这是架构意图满足的约束，而非声称
所有竞态都已关闭。#9073 无待处理缓解会重建保留的
并发本地操作，并将受支持的重叠交叉经
确定性 LWW 路由，但当本地侧不再保留
或无法安全分解时它无法做到。聚焦的
[冲突契约](./conflict-journal-and-review.md#composition-residual-pre-existing-class)
记载了该残留及其可能的类别级修复。

独立的先前分析（三次单独的模型审阅）针对该约束评估了每一种
更简单的方法并各自拒绝：

| 替代方案                            | 是什么                                                       | 为何拒绝                                                                                                                                                                                                                                                                          |
| -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Last-Write-Wins（全局时间戳）** | 丢弃逻辑时钟；最新挂钟写入胜出                | 用户设备时钟不可靠；并发独立字段编辑会静默互相覆盖。对个人生产力应用不可接受。（仅作为冲突解决内的_字段级_决胜存活。）                                                         |
| **Delta / 状态差异同步**            | 保持影子副本，上传变更字段，服务器浅合并 | 影子状态与水位线无原子耦合 → 同步中途崩溃会永久损坏；LWW 浅合并丢失并发独立编辑；O(N) `JSON.stringify` 差异在 10k+ 任务时冻结 UI；需要服务器侧合并，与不透明 E2EE 载荷不兼容。 |
| **全状态 / 快照同步**         | 同步整个模型文件（旧 PFAPI 模型）                     | 每次变更重新传输一切；无按实体冲突粒度；无法在离线编辑后重建意图。仅作为_引导_机制保留（快照 + 尾部重放），而非同步机制。                                                          |
| **CRDT（Yjs/Automerge 等）**         | 数学保证收敛                                      | 概念复杂度高；多数实现假设可信服务器或中继，与哑文件 + E2EE 约束冲突。Op-log 刻意_借用_基于操作的 CRDT 属性（UUID 幂等、因果排序）而无完整机制。                          |
| **服务器分配序号**   | 让服务器强加全序                              | 排序需要服务器连通性——与离线优先及无服务器的基于文件的提供者不兼容。仅作为_补充_使用（SuperSync seq 用于全局顺序；向量钟仍为基于文件/离线情形所需）。                                 |

**任何未来重新设计必须保留的后果：** 在覆盖前分类并发
独立编辑，并保持任何剩余残留显式；在无可信/合并服务器以及不透明 E2EE 载荷下工作；
在重连时干净地 rebase 离线编辑；足够长时间保留 tombstones；
通过快照 + 压缩限制增长；在冲突元数据中偏好假并发而非
假排序（在剪枝_之前_比较时钟）；扩展到
10k+ 活跃 / 20k+ 已归档任务而无主线程 O(N) 工作。

历史上唯一自认的过度工程是向量钟
剪枝_防御层_，此后已移除（见
[`vector-clocks.md`](./vector-clocks.md)）。

---

# Part A: 本地持久化

操作日志是本地持久化的持久转换日志。它类似
WAL，但 reducer 在异步捕获/追加之前运行，因此
分歧守卫是其安全契约的一部分。它提供：

1. **快速写入** - 小操作即时，对比每次变更序列化 5MB
2. **崩溃恢复** - 从已筛查的快照加上保留尾部重建
3. **有界证据** - 为恢复与调试保留近期转换，
   而非作为永久审计日志或通用撤销历史

## A.1 数据库架构

`SUP_OPS` 包含的不止单张追加式表。其当前存储与
索引由
[`OperationLogStoreService`](../../src/app/op-log/persistence/operation-log-store.service.ts)
定义，它是升级与事务边界的权威：

| 持久关注点          | 角色                                                                                                    |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| 操作行           | 保留的本地与远程操作外加可变投递/应用元数据                         |
| 状态缓存              | 带覆盖本地序号、向量钟、schema 版本与实体前沿的启动基线 |
| 时钟/客户端/元数据行   | 工作因果状态、设备身份、全状态元数据与替换/重建恢复标记    |
| 年轻/旧归档存储 | 生活在 NgRx 之外的已归档任务与时间跟踪数据                                            |

确切的操作信封由
[`@sp/sync-core`](../../packages/sync-core/src/operation.types.ts) 拥有，并在应用中于
[`operation.types.ts`](../../src/app/op-log/core/operation.types.ts) 收窄。不要把
这些接口复制进设计文档：信封与行元数据都会演变。

已同步的应用模型恢复数据生活在 `SUP_OPS` 中。提供者凭据、
冲突日志记录、插件缓存与本地 UI/浏览器设置有
单独所有者；见 [用户数据参考](../wiki/3.06-User-Data.md)。

### 远程应用检查点

已下载操作使用持久状态转换，使 reducer 状态、归档 IndexedDB 副作用、向量钟与服务器游标在崩溃后不会不一致：

1. `pending` — 远程操作已存储，但尚无 reducer-commit 检查点。
2. `archive_pending` — reducers 已提交且操作的向量钟已原子合并；归档副作用尚未完成。
3. `failed` — 归档副作用尝试失败。`retryCount` 仅计入被尝试的行，因此同批次中的后续行不消耗重试预算。
4. `applied` — reducer 与归档工作都已完成。

批量重放按操作隔离转换/reducer 异常。Reducer 成功的
子序列被检查点并接收归档副作用；普通 reducer 失败的远程
行在**同一事务**中用终端 `rejectedAt` 加上 `reducerRejectedAt` 元数据标记。
`reducerRejectedAt` 不同于普通同步拒绝：hydration 排除该行，
因为其迁移后的 reducer 效果从未进入状态。由
schema 迁移故意移除的 pending 行接收相同的终端标记。这防止一条畸形操作
终止 NgRx 的状态管道或接收归档工作，同时不创建崩溃窗口，
使启动可能将其误认为未完成的 reducer 工作。

全状态与本地操作是例外：全状态失败丢弃整个
推测性批量批次，而本地重放失败中止 hydration 而不拒绝用户
意图。当其状态从未进入 NgRx 时，任一情形都不会被终端确认。

启动恢复使幸存的 `pending` 行保持 pending，然后 hydration 通过
相同的按操作 reducer 失败收集器重放它们。成功行与 reducer 失败在归档重试或快照创建之前被持久分区。
Pending 全状态操作绝不使用直接加载捷径。在实时同步期间，全状态 reducer 失败在 reducer
检查点与服务器游标推进之前中止，因此 pending 行仍可恢复。Hydration 以禁用 reducer 分发重试
`archive_pending`/`failed` 行。普通同步在任何不完整行仍存在时拒绝下载、
上传或推进其游标。版本 8 为 reducer/归档检查点引入了降级
屏障；版本 9 类似地防止旧读取器重放
以 `reducerRejectedAt` 隔离的操作。

在远程应用窗口期间缓冲的本地 actions 保持有序，直到每条操作持久。瞬时持久化失败保持失败后缀排队并阻塞当前同步，以便稍后同步可重试。确定性无效的缓冲 action 也保持排队，但需要重新加载：其 reducer 已改变实时状态，因此丢弃它会让实时状态与持久操作日志分歧。

## A.2 写路径

```
User Action
    │
    ▼
NgRx reducer commits live state
    │
    └──► capture meta-reducer marks the local persistent action pending
              │
              └──► non-dispatching effect, ordered with concatMap
                        │
                        ├──► validate identifiers/payload
                        ├──► create operation + incremented clock
                        └──► lock + atomic operation/clock append
                                  │
                                  ├──► success: upload/compaction bookkeeping
                                  └──► failure: surface reload + fence compaction
```

### 持久 Action 模式

仅带有显式 `meta.isPersistent: true` 的 actions 进入捕获路径。
远程/重放 actions 设置 `meta.isRemote` 且绝不再捕获。在
远程应用期间，新的本地持久 actions 被缓冲并稍后追加，
时钟基于已应用的远程前沿。

契约可执行于
[`persistent-action.interface.ts`](../../src/app/op-log/core/persistent-action.interface.ts)、
[`operation-capture.meta-reducer.ts`](../../src/app/op-log/capture/operation-capture.meta-reducer.ts)
与
[`operation-log.effects.ts`](../../src/app/op-log/capture/operation-log.effects.ts)。
仅 UI 的状态与 hydration/重放管道绝不能伪装成新的用户
意图。

## A.3 读路径（Hydration）

```
App Startup
    │
    ▼
OperationLogHydratorService
    │
    ├──► Load snapshot from SUP_OPS.state_cache
    │         │
    │         └──► If no snapshot: Genesis migration from 'pf'
    │
    ├──► Run schema migration if needed
    │
    ├──► Dispatch loadAllData(snapshot, { isHydration: true })
    │
    └──► Load replay range (seq > snapshot.lastAppliedOpSeq)
              │
              ├──► If the final op carries full state and no reducer work is pending:
              │      validate and load that state directly
              │
              ├──► Otherwise: migrate operations, then replay the result
              │      (migration may transform, split, or drop obsolete rows)
              │
              └──► If replayed >10 ops and state is valid: save a new snapshot
```

### Hydration 优化

两项优化加速 hydration：

1. **直接加载安全的终端全状态**：当最后一条可重放操作是 `SYNC_IMPORT`、`BACKUP_IMPORT` 或 `REPAIR`，且该重放范围内没有行仍有 pending reducer 工作时，hydrator 校验并直接加载其全状态。Pending 工作禁用捷径，以便这些行可被重放并检查点。

2. **重放后保存快照**：在重放超过 10 条尾部操作后，保存新的状态缓存快照。这避免在后续启动时重放相同操作。

### Genesis 迁移

没有状态缓存时，hydration 先运行本地遗留迁移检查，然后
重新读取缓存。若缓存与操作日志都为空，应用
保持其正常的初始 NgRx 状态；它不会制造本文档旧版本中所示的伪快照。
遗留 `pf` 恢复仅在证明 `SUP_OPS` 既无快照也无操作行之后才被允许，且
恢复操作加快照原子提交。参见
[`operation-log-hydrator.service.ts`](../../src/app/op-log/persistence/operation-log-hydrator.service.ts)
与
[`operation-log-recovery.service.ts`](../../src/app/op-log/persistence/operation-log-recovery.service.ts)。

## A.4 压缩

### 目的

没有压缩，操作日志会无界增长。压缩：

1. 从当前 NgRx 状态创建新鲜快照
2. 删除已「烤进」快照的旧操作

### 触发

- 在 **500 次持久本地操作追加** 后的异步尝试
- 恢复缺少当前实体前沿的较旧快照
- 存储配额追加失败后的紧急尝试

### 过程

正常压缩在获取操作日志锁之前排空本地捕获。然后
在远程工作未完成、本地操作 pending 或未排空、持久化失败导致实时状态领先、hydration 以回退模式运行，或实时存储没有有意义数据时拒绝快照。
跳过是安全的，因为保留的日志仍是恢复来源。

成功时它用最新本地序号、工作
向量钟、schema 版本与实体前沿快照当前状态，重置压缩计数器，
然后仅剪枝终端、被快照覆盖且早于
保留截止的行。活跃未同步行与不完整远程行存活。
确切的守卫顺序是承重的；遵循
[`operation-log-compaction.service.ts`](../../src/app/op-log/persistence/operation-log-compaction.service.ts)
而非从散文重新实现它。

### 配置

| 设置                       | 当前值          | 含义                                                  |
| ----------------------------- | ---------------------- | -------------------------------------------------------- |
| 自动尝试             | 500 次追加            | 内存/持久计数器阈值                    |
| 正常终端行保留 | 7 天                 | 近期已同步/已拒绝证据仍可用        |
| 紧急保留           | 1 天                  | 配额失败后更激进的合格行剪枝 |
| 阶段超时                 | 25 秒             | 在过长压缩超出锁安全前中止  |
| 失败通知          | 3 次连续失败 | 呈现持续维护失败                   |

这些值集中在
[`operation-log.const.ts`](../../src/app/op-log/core/operation-log.const.ts)。

## A.5 多标签页协调

浏览器构建使用 Web Locks API 在共享 IndexedDB 上序列化命名关键区段。
Electron 与 Android WebView 是单实例，使用进程内 promise 互斥。
没有 Web Locks 的浏览器也回退到该单标签页互斥，它无法保护两个标签页。

应用**不**在活动标签页之间广播操作载荷。启动使用
`BroadcastChannel` 握手阻止第二个同源实例。该
单实例策略与 Web Locks 层是互补保障；见
[`StartupService`](../../src/app/core/startup/startup.service.ts) 与
[`LockService`](../../src/app/op-log/sync/lock.service.ts)。

## A.6 Effects 的 LOCAL_ACTIONS Token

远程/重放 actions 携带 `meta.isRemote: true`。对它们重新运行普通 effects
可能重复通知、外部调用，以及——最危险地——新的
持久 actions。因此 effects 注入
[`LOCAL_ACTIONS`](../../src/app/util/local-actions.token.ts)，它排除
远程 actions。唯一的宽流例外是操作日志捕获
effect，其自身过滤器强制执行持久化边界。

这是原子意图规则的一半。必须跨已同步切片或实体
原子重放的状态转换属于 meta-reducer，使
reducer 遍历与捕获的操作保持为一个单元；effect 扇出创建
多个可独立同步的操作。更广的工作流在其正常副作用与
按实体冲突边界重要时，可故意保持为独立持久 actions，如
[ADR #5 中的项目完成](../../ARCHITECTURE-DECISIONS.md#5-project-completion-decoupled-resolution-over-atomic-multi-entity-op)
所记载。Selector 驱动的 effects 也需要 hydration/同步守卫。规范性
贡献者规则与示例位于
[`contributor-sync-model.md`](./contributor-sync-model.md)。

---

## A.6.1 灾难恢复

### SUP_OPS 损坏

```
1. Detect: Hydration fails or returns empty/invalid state
2. Verify SUP_OPS has neither a snapshot nor any operation rows
3. Only when SUP_OPS is provably empty, check legacy 'pf' database for data
4. If found: Run recovery migration with that data
5. Otherwise: restore through sync or a user-selected backup
```

自动遗留恢复在操作日志锁下运行空性检查与遗留写入，并失败关闭。存在的快照、非空操作日志或检查错误
阻止遗留写入并传播 hydration 失败。通用 hydration catch
绝不能把较旧的 `pf` 副本放在当前 SUP_OPS 序号前沿。当允许恢复时，
恢复操作、state-cache 快照与向量钟在一次 IndexedDB
事务中提交；中断的写入不能留下声称已回滚操作的快照。

确切分支很重要：损坏但存在的快照首先回退到
保留操作重放，而遗留恢复是对可证明为空的
`SUP_OPS` 数据库的最后手段。遵循
[`operation-log-hydrator.service.ts`](../../src/app/op-log/persistence/operation-log-hydrator.service.ts)
与
[`operation-log-recovery.service.ts`](../../src/app/op-log/persistence/operation-log-recovery.service.ts)
而非把本摘要翻译成恢复代码。

## A.7 Schema 迁移

当 Super Productivity 的数据模型变更（新字段、重命名属性、重构实体）时，schema 迁移确保现有数据在应用更新后仍可用。

> **当前状态（2026-07）：** `CURRENT_SCHEMA_VERSION = 4`。存在三次迁移：v1→v2（misc-to-tasks-settings 拆分，真实载荷转换）以及两个空操作语义屏障——v2→v3（替换模式 LWW 信封）与 v3→v4（标记的项目 delete-wins）。屏障不改变存储形状；它们为理解它们的接收方门控冲突语义。在添加版本 5 之前阅读 [A.7.11 升级策略](#升级策略--升级不会保护已发布机群)。

### 配置

`CURRENT_SCHEMA_VERSION` 与 `MIN_SUPPORTED_SCHEMA_VERSION` 定义于
[`packages/shared-schema/src/schema-version.ts`](../../packages/shared-schema/src/schema-version.ts)
并由客户端迁移服务再导出。当前接收方没有
前向兼容跳过带；已发布机群例外记载于
下方升级策略。

### 核心概念

| 概念                    | 描述                                                                 |
| -------------------------- | --------------------------------------------------------------------------- |
| **Schema Version**         | 跟踪当前数据模型版本的整数（存储在操作 + 快照中）     |
| **Migration**              | 将状态从版本 N 转换到 N+1 的函数                           |
| **Snapshot Boundary**      | 迁移在加载快照时运行，创建干净的版本化检查点 |
| **Forward Compatibility**  | 较新应用可读较旧数据（通过迁移）                             |
| **Backward Compatibility** | 较旧应用接收较新操作（通过优雅降级）                   |

### 迁移触发

```
┌─────────────────────────────────────────────────────────────────────┐
│                    App Update Detected                               │
│                    (schemaVersion mismatch)                          │
└─────────────────────────────────────────────────────────────────────┘
                               │
           ┌───────────────────┼───────────────────┐
           ▼                   ▼                   ▼
    Load Snapshot         Replay Ops         Receive Remote Ops
    (older version)       (mixed versions)   (ordered remote batch)
           │                   │                   │
           ▼                   ▼                   ▼
    migrateState         migrateOperation    Screen, then migrate
    shared chain         shared chain        compatible prefix
```

### A.7.1 快照迁移（本地）

当应用启动并发现带有较旧 schema 版本的快照时：

```
App Startup (schema v1 → v2)
    │
    ▼
Load state_cache (v1 snapshot)
    │
    ▼
Detect version mismatch: snapshot.schemaVersion < CURRENT_SCHEMA_VERSION
    │
    ▼
Run migration chain: migrateV1ToV2(snapshot.state)
    │
    ▼
Dispatch loadAllData(migratedState)
    │
    ▼
Force new snapshot with schemaVersion = 2
    │
    ▼
Continue with tail ops (ops after snapshot)
```

### A.7.2 操作重放（混合版本）

日志中的操作可能有不同的 schema 版本。在重放之前，
hydrator 运行共享的操作迁移链。

一条源操作可以保持不变、被转换、展开为多条
操作，或作为过时而被丢弃。Hydrator 仅重放迁移后的
结果，并保留源操作 ID 用于持久 reducer 检查点。参见共享
[`migrate.ts`](../../packages/shared-schema/src/migrate.ts) 链与客户端
[`operation-log-hydrator.service.ts`](../../src/app/op-log/persistence/operation-log-hydrator.service.ts)
了解可执行契约。

### A.7.3 远程同步（跨版本客户端）

[`RemoteOpsProcessingService`](../../src/app/op-log/sync/remote-ops-processing.service.ts)
按传输顺序筛查已下载批次。对每条操作它首先
校验 schema 版本。无效版本、低于支持
最小值的版本、新于此客户端的版本，或迁移失败会在该操作处停止
批次。兼容前缀可完成处理；被阻塞的操作与后缀既不存储也不应用。调用方使
传输游标保持不变，以便在更新
或迁移修复后再次下载该后缀。

兼容的较旧操作在全状态过滤、冲突检测或 reducer 应用之前
经共享迁移链运行。迁移
可能转换或拆分操作；`null` 是故意的终端丢弃，
不会阻塞游标。

### A.7.4 全状态导入（SYNC_IMPORT/BACKUP_IMPORT）

全状态操作没有单独的前向兼容路径。它们
与每条其他远程操作一样通过相同的有序兼容性筛查：太新的全状态操作阻塞自身与后缀，且
调用方冻结游标。当前代码没有 `MAX_VERSION_SKIP` 分支，
也不尝试通过剥离未知字段加载较新状态。

对较旧的全状态操作，共享操作链是接收方
边界。改变持久状态形状的迁移必须通过 `migrateState` 覆盖
快照，并通过 `migrateOperation` 覆盖相关全状态或增量载荷；
替换语义仅在该操作
兼容之后运行。

### A.7.5 迁移实现

迁移定义于
[`packages/shared-schema/src/migrations/`](../../packages/shared-schema/src/migrations/)
并由共享 [`migrate.ts`](../../packages/shared-schema/src/migrate.ts)
链执行。稳定类型契约位于
[`migration.types.ts`](../../packages/shared-schema/src/migration.types.ts)：
每个 `SchemaMigration` 提供 `migrateState`，而可选的
`migrateOperation` 接受 `OperationLike` 并返回 `OperationLike`、
`OperationLike[]` 或 `null`。

**如何创建新迁移：**

1. 阅读 [A.7.11 升级策略](#升级策略--升级不会保护已发布机群)，
   并在旧客户端可安全容忍载荷标记或
   信封时避免升级。
2. 若需要升级，更新
   [`schema-version.ts`](../../packages/shared-schema/src/schema-version.ts)，添加
   下一个连续注册表条目，并声明是否需要操作迁移。
3. 测试状态迁移、适用的不变/转换/拆分/丢弃操作结果、
   保留尾部重放，以及远程游标冻结路径。

**转换迁移残留：** 接收方管道已实现，但
任何未来的字段重命名或移除仍需要具体的载荷
转换（或故意丢弃）与跨版本测试。共享链的存在
本身不会使该变更安全。

### A.7.10 遗留数据迁移

> **注意：** 遗留 PFAPI 系统已移除（2026 年 1 月）。本节记载历史迁移路径。

对从旧版本（操作日志之前）升级的用户，`ServerMigrationService` 处理迁移：

1. 在首次同步时，它检测遗留远程数据格式
2. 从遗留格式下载完整状态
3. 用导入的状态创建 `SYNC_IMPORT` 操作
4. 将新格式上传到同步提供者

**关键文件：** `src/app/op-log/sync/server-migration.service.ts`

所有未来的 schema 变更应使用上方描述的 **Schema Migration** 系统（A.7）。

### A.7.6 已实现的安全特性

**迁移安全（A.7.12）** ✅ - 迁移前创建备份；失败时回滚。

**尾部操作一致性（A.7.13）** ✅ - 尾部操作在 hydration 期间迁移以匹配当前 schema。

**统一迁移（A.7.15）** ✅ - 状态与操作迁移链接在单个 `SchemaMigration` 定义中。

### A.7.7 何时需要操作迁移？

| 变更类型          | 状态迁移   | 操作迁移                   | 示例                     |
| -------------------- | ----------------- | ------------------------------ | --------------------------- |
| 添加可选字段   | ✅（设默认值）  | ❌（旧操作只是不设置它） | `priority?: string`         |
| 重命名字段         | ✅（旧→新复制） | ✅（转换载荷）         | `estimate` → `timeEstimate` |
| 移除字段/功能 | ✅（删除它）    | ✅（丢弃操作或剥离字段）   | 移除 `pomodoro`           |
| 更改字段类型    | ✅（转换）      | ✅（在载荷中转换）        | `"1h"` → `3600`             |
| 添加实体类型      | ✅（初始化）   | ❌（不存在旧操作）          | 新 `Board` 实体          |

**经验法则：** 加法变更（新可选字段、新实体）不需要操作迁移。字段重命名/移除需要。

### A.7.8 跨版本同步

**状态：** 已实现接收方侧：兼容的远程操作在冲突检测前通过
`SchemaMigrationService.migrateOperation()`；太新的操作在迁移前被阻塞。发送方按原样上传操作。

**对较新 schema 操作的护栏：**

- 当前接收方（post-v18.14.0）：直接阻塞任何 `schemaVersion > CURRENT_SCHEMA_VERSION` 的操作，冻结下载游标，并提示应用更新。
- 已发布接收方（v17.0.0–v18.14.0）：容忍最高 `CURRENT + 3`（其 `MAX_VERSION_SKIP`），并在每会话一次警告后未迁移地应用这些操作——且它们甚至在阻塞时也推进游标，永久跳过被阻塞的操作。该机群现实驱动 A.7.11 升级策略。

**之前需要：** 任何重命名/移除字段的 schema 迁移。

### A.7.11 跨版本同步实现指南

> **状态：** 接收方侧状态与操作迁移已实现。下方
> 升级策略是规范性的。

#### 接收方契约

当前接收方契约刻意是单向的：

- 兼容的较旧操作在冲突检测前使用共享迁移链。
- 第一条太新、不支持、无效或迁移失败的操作在该点停止
  处理。其后缀不被迁移或应用，且调用方
  冻结游标。
- 当前客户端绝不前向迁移较新操作。对较旧
  已发布客户端的安全因此来自载荷级优雅降级，而非
  来自版本戳。

#### 升级策略 — 升级不会保护已发布机群

版本升级仅栅栏在升级_之后_发布的接收方。截至 2026-07：

- 从 v17.0.0 到 v18.14.0 的每个已发布客户端以 schema 2 运行，带前向兼容带（`MAX_VERSION_SKIP = 3`）：它在每会话一次警告 snack 后未迁移地应用最高 schema 5 的操作，并阻塞 schema ≥ 6——但这些客户端甚至在阻塞时也推进服务器游标，永久跳过被阻塞的操作（该丢失在稍后应用更新后仍存活）。
- Post-v18.14.0 接收方直接阻塞任何较新 schema 操作并冻结游标（响亮且无丢失）。

因此：

0. **默认：不要升级。** 升级近乎不可逆，即使「安全」也不免费：它硬阻塞每一个尚未更新的 post-v18.14.0 客户端（冻结游标）于新操作，且一旦任何操作携带新版本就无法回退——回退的客户端硬阻塞于它已写入的 v(N+1) 操作，且 USE_REMOTE 恢复路径会在其上抛出。因此升级必须挣得其成本。若旧客户端可未迁移地应用操作（信封 / 惰性标记模式），用载荷标记门控新语义并**保持 `CURRENT_SCHEMA_VERSION` 不变**。仅当变更真正需要时才升级：转换迁移（重命名/移除字段、丢弃操作）或你必须硬栅栏旧客户端的语义。**警示示例 — v4（#9009，项目 delete-wins）为仅标记变更升级，旧客户端可优雅降级：功能完全由载荷标记驱动（外加 `entityId === projectId` 认证检查）；`schemaVersion >= 4` 门仅添加狭窄的畸形操作加固，而非功能正确性。它不需要升级，却现在栅栏每一个滞后的 post-v18.14.0 客户端且无法撤销。不要重复。**
1. 新操作语义必须在旧客户端上优雅降级——见 `packages/sync-core` 中的 `LwwUpdatePayload` 信封模式（'patch' 操作通过 `updateOne` 在 pre-v3 客户端上正确应用；v4 delete-wins 标记对它们惰性）。若它们降级，在任何机群份额上升级都是_安全的_（戳是未来接收方的栅栏，而非当前接收方的保护）——但安全 ≠ 必要：若它降级，优先用标记/信封且**不**升级（见 0）。
2. 旧客户端会错误应用的变更绝不能仅靠升级发布。在已发布的 v17–v18.14 客户端仍同步时，没有任何机群百分比使其安全：一台滞后设备会静默错误应用其整个账户的操作，并用支配时钟写回结果。在 v17–v18.14 同步机群实际上灭绝之前，将此类变更视为阻塞——或重新设计为降级（选项 1）。
3. **前置条件：任何升级 PR 必须处理降级重新标记（#8770）。** 本地 hydration 没有未来版本门——`stateNeedsMigration()` 是 `version < target`——因此读取 v(N+1) 状态缓存的 vN 客户端（回滚、snap 通道滞后、旧侧载 APK）会未迁移地加载它（检查点 B 校验非致命且从不修复），且下一次快照/压缩写入将其盖上 `CURRENT_SCHEMA_VERSION`。缓存随后是 v(N+1) 形状但带 vN 标签——加法残留存活，因为 typia 的 `createValidate` 不剥离多余属性——并在重新升级时 N→N+1 迁移在已迁移状态上运行**第二次**。在 #8770 交付守卫之前（先复现，按同步变更规则），每一次迁移必须在已迁移状态上是空操作（v1→v2 通过 `hasMigratedFields` 守卫；屏障迁移按构造是空操作），且升级 PR 必须说明如何处理降级客户端。

#### 可执行来源与发布检查

遵循可执行契约，而非把其形状复制进本指南：

- 有序远程筛查与游标阻塞结果：
  [`remote-ops-processing.service.ts`](../../src/app/op-log/sync/remote-ops-processing.service.ts)
- 迁移返回类型：
  [`migration.types.ts`](../../packages/shared-schema/src/migration.types.ts)
- 共享状态与操作链：
  [`migrate.ts`](../../packages/shared-schema/src/migrate.ts)
- 当前/最小版本与代码级升级警告：
  [`schema-version.ts`](../../packages/shared-schema/src/schema-version.ts)

发布前，测试必须覆盖具体状态转换、每一个
相关操作结果（包括拆分或丢弃）、保留尾部重放，以及
不兼容操作使其后缀与游标
未触及的远程批次。

---

# Part B: 基于文件的同步

WebDAV、Nextcloud、Dropbox、OneDrive 与 LocalFile 没有操作 API。客户端因此将其文件原语适配到管道其余部分使用的同一操作同步接口。完整视觉导览位于现场指南的 [传输节](./sync-architecture.html#transport)；本部分仅记录持久格式边界及其所有者。

## B.1 两种当前线路格式

| 格式                                      | 远程文件                                                                                          | 正常携带操作的同步                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **v2 单体（默认）**                   | `sync-data.json` 外加恢复备份                                                                 | 下载已变更的单体，合并其保留操作，重建当前状态加上两个归档分区，并有条件地重写完整单体。             |
| **v3 拆分文件（可选加入「手术同步」）** | `sync-ops.json`、引用的快照代、兼容性状态/备份文件，以及 v2 墓碑 | 有条件地重写有界操作提交点。完整状态/归档快照仅在初始引导、压缩、迁移、强制上传或恢复时写入。 |

两种格式都携带向量钟、schema 版本、合成 `syncVersion`，以及
有界 `recentOps` 缓冲。该公共适配器与信封本身
不提供物理 compare-and-swap。提供者接口将其
条件写令牌称为 `rev`：读取返回它，适配器将其作为
上传的期望令牌传回。在后端提供 revision/ETag CAS 的地方它是提供者原生的，在尽力而为的回退上是合成内容哈希：

- Dropbox revisions 与 OneDrive ETags 强制原子条件替换。
- WebDAV/Nextcloud 在读取返回强 ETag 时可强制原子替换，上传将其作为 `If-Match` 发送。没有强 ETag 时，`rev` 回退到内容哈希；上传前 GET 检测已过时的写入者，但无法关闭 GET→PUT 竞态，因此并发保护是尽力而为。
- LocalFile 也使用内容哈希与无跨进程 CAS 的读/检查/写序列。它是单写入者、仅备份传输，不是安全的并多设备写入者。

在提供者强制 CAS 的地方，revision 不匹配中止写入，稍后周期在重试前下载。尽力而为的后端无法广泛保证每一次同时写入竞态都会中止。

v3 迁移对同步文件夹是单向的。它在遗留 `sync-data.json` 位置留下 v3 墓碑，使不理解拆分格式的客户端停止，而非重新创建独立的 v2 历史。

## B.2 引导、增量追赶与缺口

文件提供者不暴露服务器分配的操作游标。适配器
将文件 `syncVersion` 视为合成传输水位线，并将其作为
`latestSeq` 暴露给公共同步编排。正常携带操作的提交推进
它一次；快照替换可重置它，缺口路径会检测。它不是
提供者 `rev`/ETag，也不证明按操作排序。一次上传
可在同一新水位线下携带多条操作；稳定操作
ID 提供持久去重，而向量钟携带因果性。

1. **正常追赶：** 下载有界操作缓冲，并将每一个保留
   候选通过公共已应用 ID 与冲突管道。
2. **新鲜客户端 / 强制 seq-0：** 返回完整状态/归档基线。在 v2 中，
   该基线代表单体及其保留操作。在 v3 中，操作
   文件指向已校验的快照代；新于
   快照边界的保留操作叠加重放。
3. **缺口：** 版本重置、快照替换，或本客户端需要的被修剪操作
   发出缺口信号。调用方从 seq 0 重试并安装
   因果基线，而非假装剩余缓冲完整。
4. **提交：** 已下载的 `rev`、向量钟与期望合成
   水位线保持暂存，直到调用方确认基线与操作已
   持久应用。取消数据冲突决定不推进
   基线。

引导或缺口基线是传输状态，而非每次下载的自动新
`SYNC_IMPORT`。同步服务在操作日志/归档锁下 hydrate 基线，并记录基线
已包含哪些保留操作；仅重放该边界之外的后缀。

## B.3 归档边界

`archiveYoung` 与 `archiveOld` 是本地 IndexedDB 分区，而非独立
远程历史。完整文件基线包含两个分区；归档意图
也在操作中传递，以便另一客户端可执行相同的幂等
移动/恢复副作用。

- v2 在每次携带操作的单体上传时重新嵌入两个完整归档分区。
- v3 在写入完整快照时嵌入它们；快照之间的仅操作同步
  不重写归档文件，尽管归档操作本身携带
  确定性应用所需的数据。
- 应用远程全状态基线持有归档互斥锁并原子提交
  年轻/旧对。压缩使用相同互斥锁，因此它不能写入
  在并发替换之前读取的归档镜像。

## B.4 可执行所有者

| 契约                                                                                            | 所有者                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| v2/v3 信封、文件名、上限与快照引用                                            | [`packages/sync-providers/src/file-based-sync-data.ts`](../../packages/sync-providers/src/file-based-sync-data.ts)        |
| 格式选择、条件 IO、迁移、缺口检测、基线暂存与归档包含 | [`file-based-sync-adapter.service.ts`](../../src/app/op-log/sync-providers/file-based/file-based-sync-adapter.service.ts) |
| 基线安装与公共下载/冲突编排                                    | [`operation-log-sync.service.ts`](../../src/app/op-log/sync/operation-log-sync.service.ts)                                |
| 本地归档副作用                                                                          | [`archive-operation-handler.service.ts`](../../src/app/op-log/apply/archive-operation-handler.service.ts)                 |

---

# Part C: 服务器同步

对基于服务器的同步，操作日志就是同步机制。单独操作被上传/下载，而非完整状态快照。

## C.1 服务器同步与基于文件的同步有何不同

| 方面              | 基于文件的同步（Part B）                                           | SuperSync（Part C）                   |
| ------------------- | ------------------------------------------------------------------ | ------------------------------------ |
| 增量单元    | v2 或 v3 文件格式内的有界紧凑操作                    | 单独的保留操作       |
| 基线            | 客户端写入的完整状态/归档快照                         | 日志中的因果全状态操作   |
| 传输水位线 | 作为 `latestSeq` 暴露的合成 `syncVersion`，外加 ID 去重      | 服务器分配序号             |
| 写入竞态守卫    | 提供者 `rev`；仅当后端支持物理 CAS 时原子 | 数据库事务                 |
| 服务器可见性   | 无应用逻辑                                               | E2EE 启用时载荷不透明 |

## C.2 操作同步协议

共享端口是
[`OperationSyncCapable`](../../packages/sync-providers/src/provider-types.ts)。
其 API 与文件提供者模式刻意共享一个编排契约，
但在分页与基线行为上不同。对 SuperSync，一个正常周期：

1. 等待已接受的本地 action 捕获完成，并解析加栅栏的
   提供者/纪元对；
2. 在上传本地行之前，下载上次持久提交的服务器序号之后的有序页；
3. 迁移、过滤、冲突解决、应用并检查点每个兼容
   前缀，仅在其基线、操作、归档副作用、已应用 ID 与时钟持久之后推进游标；
4. 以有界批次上传待处理本地行，并处理按操作
   接受/拒绝结果以及任何捎带的远程操作；以及
5. 通过有界调和循环在同一周期中重新上传新合成的本地胜出操作。

不兼容操作、失败的应用或取消的全状态决定使其操作与后缀未提交，以便稍后周期再次下载它们。可执行编排位于
[`operation-log-sync.service.ts`](../../src/app/op-log/sync/operation-log-sync.service.ts)，
上传路由在
[`operation-log-upload.service.ts`](../../src/app/op-log/sync/operation-log-upload.service.ts)，
有序接收方处理在
[`remote-ops-processing.service.ts`](../../src/app/op-log/sync/remote-ops-processing.service.ts)。

## C.3 经快照端点的全状态操作

包含完整应用状态的操作（`SYNC_IMPORT`、
`BACKUP_IMPORT`、`REPAIR`）使用专用 `/api/sync/snapshot` 路由，而非
常规操作批次路由。该路由支持压缩的大 body
传输，但接受的请求仍被校验、配额检查，并作为有序日志中的全状态操作存储。

### 操作路由

```
Upload Flow
    │
    ├──► Filter: Is opType in { SYNC_IMPORT, BACKUP_IMPORT, REPAIR }?
    │         │
    │         ├──► YES: Upload via /api/sync/snapshot
    │         │         • Uses uploadSnapshot() method
    │         │         • SYNC_IMPORT → initial; BACKUP_IMPORT/REPAIR → recovery
    │         │         • Supports E2E encryption
    │         │
    │         └──► NO: Upload via /api/sync/ops (normal batched upload)
```

上传前，客户端提取并校验包装的全状态，移除
设备本地同步设置，可选加密状态，并保留
原始操作 ID、向量钟、schema 版本、干净石板/修复范围，
以及导入原因。这些字段是正确性与去重的一部分；不要
从本散文重建调用。遵循
[`OperationLogUploadService`](../../src/app/op-log/sync/operation-log-upload.service.ts)、
[`provider-types.ts`](../../packages/sync-providers/src/provider-types.ts) 中的公共提供者契约，以及
服务器的
[`snapshot handler`](../../packages/super-sync-server/src/sync/sync.routes.snapshot-handler.ts)。

### OpType 到 Reason 映射

| OpType          | Snapshot Reason | 用例                         |
| --------------- | --------------- | -------------------------------- |
| `SYNC_IMPORT`   | `initial`       | 首次同步或完整状态刷新 |
| `BACKUP_IMPORT` | `recovery`      | 从备份文件恢复       |
| `REPAIR`        | `recovery`      | 用修正状态自动修复 |

接受的上传仍是服务器日志中的因果全状态操作，因此
客户端可跳过其覆盖的前缀并应用保留的尾部。仅对明文
载荷，可选压缩缓存加速_服务器侧重放与
恢复生成_；生产客户端不下载该缓存。E2EE
载荷仍可作为操作重放，但不能填充明文服务器
缓存。

## C.4 冲突检测

客户端冲突分类将每个入站实体操作与从快照元数据、保留的已应用操作与 pending 操作构建的本地实体前沿比较。并发的 pending 本地操作直接提供正常的双侧冲突。

没有 pending 行并不自动意味着「可安全应用」。对活动实体上的并发操作，#9073 缓解重建仍与入站时钟并发的每一条保留本地操作。受支持的重叠、单实体侧成为合成冲突并经相同的确定性 LWW 路径。对易（相同内容、不相交真实字段、仅噪声变更，或正的任务时间 delta）故意不经 LWW 而应用两者。

到达顺序行为仅在客户端无法构造安全、确定性本地侧时保留：例如其证据已压缩进快照前沿、操作是多实体，或保留侧是需要补偿机制的本地 delete/archive。这些回退情形不创建冲突对象或日志行。参见
[组合残留（既有类别）](./conflict-journal-and-review.md#composition-residual-pre-existing-class)
了解剩余的组合与混合接收方限制。

可执行所有者是 `RemoteOpsProcessingService` 与
`ConflictResolutionService`；服务器上传冲突检测是第二道门，
而非上方客户端到达顺序问题的替代。

## C.5 冲突解决（LWW 自动解决）

冲突首先应用显式语义优先级与合格的不相交字段合并，然后
回退到 Last-Write-Wins（LWW），经
`ConflictResolutionService.autoResolveConflictsLWW()`。当前高层策略见
现场指南的 [因果节](./sync-architecture.html#causality)；聚焦的
[冲突日志与审阅契约](./conflict-journal-and-review.md) 拥有更易变的
合并与审阅细节。

### LWW 解决策略

1. **比较时间戳**：比较每侧的最大操作时间戳
2. **较新胜出**：时间戳较新的一侧胜出
3. **决胜**：时间戳相等时，附着于最大时间戳操作的客户端 ID 的稳定排序选择胜出方，因此本地或远程侧都可确定性胜出

胜出方选择与不相交字段合并在生产中保持活跃。冲突日志是
仅观察能力，解决不需要它：生产远程处理
路径当前设置 `disableConflictJournal: true`，因此它不发射日志条目。日志
存储与审阅 UI 因此保持休眠/不完整，而非已解决冲突的完整记录。见上方聚焦契约了解当前状态与生命周期细节。

### 当本地胜出时

当本地状态较新时，我们不能只拒绝远程操作——那会导致本地状态永不同步到服务器。取而代之：

1. **拒绝**本地与远程操作（它们现已过时）
2. **创建新的 UPDATE 操作**，带有：
   - 来自 NgRx store 的当前实体状态
   - 合并的向量钟（本地 + 远程）+ 递增
   - **保留来自本地操作的最大时间戳**（对正确 LWW 语义至关重要——使用 `Date.now()` 会在未来冲突中给予不公平优势）
3. **该新操作由当前同步周期的有界
   调和循环重新上传。** 仅当该循环
   中断、阻塞或达到其重试上限时，它才为稍后周期保持 pending。

发出警告级日志：`OpLog.warn('LWW local wins - creating update op for ${entityType}:${entityId}')`

### 被拒绝的操作

当操作被拒绝（本地或远程）时：

- 被拒绝的操作留在日志中供历史/调试
- `getUnsynced()` 排除被拒绝的操作（不会重新上传）
- 压缩最终可能删除旧的被拒绝操作

### Archive-Wins 规则

当 `moveToArchive` 操作与字段级更新（例如重命名、时间跟踪变更）冲突时，归档操作**总是胜出**，无论时间戳如何。这绕过正常的 LWW 时间戳比较，因为归档代表显式用户意图，不应被并发字段更新反转。

**理由：** 若客户端 A 归档任务且客户端 B 并发重命名它，归档必须胜出——否则，LWW 更新会通过替换其状态把已归档任务「复活」回活动存储。

**实现：** `ConflictResolutionService` 检查本地或远程侧是否包含 `TASK_SHARED_MOVE_TO_ARCHIVE` action。若是，归档侧自动胜出，并用合并的向量钟创建新的归档操作（经 `_createArchiveWinOp()`）。

这是归档复活防护的**第一层**。**第二层**是 [批量归档过滤器](../../src/app/op-log/apply/bulk-archive-filter.util.ts)，它预扫描操作批次中的归档操作，并跳过任何以同批次中正在归档的实体为目标的 LWW Update 操作。该双层防御处理 3+ 客户端场景，其中 LWW Updates 可能在同批次中于归档操作之前或之后到达。

**关键文件：**

- `src/app/op-log/sync/conflict-resolution.service.ts` — Archive-wins 检查与 `_createArchiveWinOp()`
- `src/app/op-log/apply/bulk-hydration.meta-reducer.ts` — 预扫描归档过滤

### moveToArchive 的被取代操作处理

`SupersededOperationResolverService` 将 `moveToArchive` 与 DELETE 操作一样作为特殊情况处理。当 `moveToArchive` 操作因并发冲突被服务器拒绝时，它被**用合并的向量钟重新创建**而非丢弃。

这是必要的，因为 `moveToArchive` 通过归档 reducer 从 NgRx store 移除实体，因此 `getCurrentEntityState()` 对已归档实体返回 `undefined`。没有该特殊处理，被取代操作解析器将无法重新创建操作，已归档任务会丢失。

**实现：** 在按实体处理之前，`SupersededOperationResolverService` 识别像 `moveToArchive` 这样的批量语义操作，并用原始载荷与合并向量钟重新创建它们，在 `MultiEntityPayload` 格式中保留完整任务数据。

**关键文件：** `src/app/op-log/sync/superseded-operation-resolver.service.ts`

### 单例实体 LWW 更新

`lwwUpdateMetaReducer` 根据实体的存储模式不同地处理 LWW Update actions（在本地侧赢得冲突时创建）：

| 存储模式 | 实体类型                                          | LWW Update 行为                                                             |
| --------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| **Adapter**     | TASK, PROJECT, TAG, NOTE, TASK_REPEAT_CFG 等       | 经 NgRx entity adapter（`updateOne` 或 `addOne`）的单独实体替换 |
| **Singleton**   | GLOBAL_CONFIG, TIME_TRACKING, MENU_TREE, WORK_CONTEXT | 整个 feature 状态被胜出数据替换                             |
| **Unsupported** | Map、数组、虚拟模式                          | 记为警告；不支持 LWW                                        |

对 **adapter 实体**，meta-reducer 还同步关系（例如 `projectId` 变更时的 `project.taskIds`，`tagIds` 变更时的 `tag.taskIds`，`dueDay` 变更时的 `TODAY_TAG.taskIds`，`parentId` 变更时的 `parent.subTaskIds`）。

**关键文件：** `src/app/root-store/meta/task-shared-meta-reducers/lww-update.meta-reducer.ts`

### 用户通知

自动解决后显示非阻塞 snack 通知：

- "Sync conflicts auto-resolved: X local win(s), Y remote win(s)"

## C.6 全状态过滤

当收到 `SYNC_IMPORT` 或 `BACKUP_IMPORT` 操作时，它代表显式用户动作，将**所有客户端**恢复到特定时间点。不知晓导入而创建的操作被过滤掉。

可执行所有者是
[`SyncImportFilterService`](../../src/app/op-log/sync/sync-import-filter.service.ts)，
因果分类经
[`classifyOpAgainstSyncImport`](../../packages/sync-core/src/sync-import-filter.ts) 共享。

### 没有传输栅栏时的问题

考虑此场景：

1. 客户端 A 创建 Op1、Op2（离线）
2. 客户端 B 做 SYNC_IMPORT（从备份恢复）
3. 客户端 B 将 SYNC_IMPORT 上传到服务器
4. 客户端 A 上线，上传 Op1、Op2，然后下载 SYNC_IMPORT
5. **问题**：Op1、Op2 引用被导入抹除的实体

### 显式导入/恢复语义

`SYNC_IMPORT` 与 `BACKUP_IMPORT` 建立干净石板。因果上大于或等于该边界的操作保留；被它支配的操作已被表示并丢弃。真正并发的操作也被丢弃，因为它在不知晓重置时撰写。

剪枝/重置时钟可使_导入后_操作比较为并发。分类器因此保留两种可证明情形：来自导入自身客户端的更高计数器，或携带至少导入客户端边界计数器的操作。这些是因果证明，而非时间戳猜测。最新边界按持久批次/存储顺序选择，绝不用 UUID 顺序。

### 自动修复语义

`REPAIR` 不是显式干净石板。因果上较旧的工作由其全状态表示，但并发工作通常叠加重放。对同一已下载批次中的修复，被其 `repairBaseServerSeq` 覆盖的并发前缀作为已表示而丢弃；没有该证明的遗留修复将前缀立即移到修复边界之后。并发后缀工作仍有效。

所有这些决定使用向量钟，因为问题是对全状态边界的因果知识，而非挂钟新近度。

SuperSync 还防止无效后缀进入服务器日志。携带 `lastKnownServerSeq` 的增量上传与用户序号行上的状态替换上传序列化。若其游标早于最新 `SYNC_IMPORT` 或 `BACKUP_IMPORT`，整个批次被拒绝，且在客户端重试前捎带替换。客户端侧过滤对其它提供者、保留的遗留数据与纵深防御仍必要。

参见现场指南的 [因果与冲突策略](./sync-architecture.html#causality)
了解视觉概览。

---

# Part D: 数据校验与修复

校验是分层的，但并非每个检查点都自动变更用户数据。
特别是，启动 hydration 优先显示可恢复数据，而非打开
修复对话框或静默重写它。

## D.1 校验架构

| 边界           | 运行什么                                                                                           | 失败行为                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 本地捕获      | 追加前的结构性操作载荷校验                                               | 不持久化操作；标记实时/持久分歧，呈现重新加载，并栅栏压缩                                                 |
| 快照 hydration | 结构性/缓存筛查外加 schema 迁移；匹配 schema 的快照使用信任快路径 | 迁移失败回退到保留日志重放而不覆盖完好缓存；校验错误被记录而非自动修复 |
| 尾部/完整重放   | Reducer 重放后的状态校验                                                               | 继续使用可见状态但不保存无效替换缓存                                                                         |
| 远程应用       | 活动状态校验，然后仅在需要修复时包括归档的完整状态                | 修复并重新校验；在替换实时状态前持久化 `REPAIR` 操作，或标记同步会话失败                                 |

## D.2 REPAIR 操作类型

同步后修复使用 `dataRepair()` 并重新校验结果。成功的
修复由包含已修复状态、修复摘要，以及——若可用——修复所基于的服务器序号的因果全状态 `REPAIR` 操作表示。权威载荷与摘要类型位于
[`operation.types.ts`](../../src/app/op-log/core/operation.types.ts)。

### REPAIR 操作行为

- **启动期间**：当重放范围内没有行有 pending reducer 工作时，终端 REPAIR 可使用安全的全状态直接加载捷径。否则该范围被正常迁移并重放。
- **同步期间**：REPAIR 比显式导入更窄。与其并发的操作叠加重放在已修复快照之上（包括必须移到全状态边界之后的并发前缀）。在 SuperSync 上，REPAIR 从不请求干净石板；服务器锁定用户的序号行，并仅当 `repairBaseServerSeq` 仍等于当前服务器序号时接受快照。过时修复在下载并发服务器后缀之前本地退役。
- **上传顺序**：若全状态上传失败，后续常规操作保持 pending。永久快照失败在任何远程工作已应用后由中央拒绝处理器分类。被拒绝的本地显式导入/恢复在后续同步周期中仍是持久上传屏障；增量操作仅在较新的全状态快照成功后恢复。被拒绝的远程导入是冲突解决历史，过时自动 REPAIR 被排除以便其并发后缀可下载并在仍必要时触发新鲜修复。
- **用户通知**：自动/锁内修复非阻塞；显式交互修复可能使用确认对话框。
- **保留证据**：修复行仅在正常操作保留保留它时仍可检查；它不是永久审计轨迹。

## D.3 检查点 A：载荷校验

在本地追加之前，
[`validate-operation-payload.ts`](../../src/app/op-log/validation/validate-operation-payload.ts)
检查信封与操作特定载荷结构。这刻意浅于整状态 Typia 与关系校验。
内部生成的 `REPAIR` 操作遵循其自身构造路径。

## D.4 检查点 B 与 C：Hydration 校验

当迁移运行或其 schema 戳不匹配时，hydrator 同步校验快照。匹配 schema 的缓存因启动速度被信任；这就是为何在没有迁移的情况下添加必需持久字段是危险的。在尾部或从零重放之后，校验门控替换缓存的创建。

Hydration 校验**不**调用 `dataRepair()`：启动时的原生确认可能抢焦点，且静默修复唯一可见副本比加载它并记录失败更糟。参见
[`operation-log-hydrator.service.ts`](../../src/app/op-log/persistence/operation-log-hydrator.service.ts)。

## D.5 检查点 D：同步后校验

远程处理之后，
[`RemoteOpsProcessingService`](../../src/app/op-log/sync/remote-ops-processing.service.ts)
调用 `ValidateStateService.validateAndRepairCurrentState()`。有效快路径
在无归档读取的情况下检查活动快照。若无效，它加载包括两个归档分区的完整状态，修复并重新校验它，在既有操作日志锁下写入
`REPAIR` 操作/缓存，然后才以远程 effect 抑制分发已修复替换。失败设置会话校验闩，因此同步包装器不能声称 `IN_SYNC`。

## D.6 可执行所有者

| 职责                                             | 所有者                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Typia 外加跨模型校验与修复编排 | [`validate-state.service.ts`](../../src/app/op-log/validation/validate-state.service.ts)           |
| 纯修复转换与摘要记账              | [`data-repair.ts`](../../src/app/op-log/validation/data-repair.ts)                                 |
| 持久修复操作/缓存创建与通知   | [`repair-operation.service.ts`](../../src/app/op-log/validation/repair-operation.service.ts)       |
| SuperSync 修复基序号                             | [`repair-sync-context.service.ts`](../../src/app/op-log/validation/repair-sync-context.service.ts) |

---

# 运维边界

### IndexedDB 配额耗尽

配额失败不是乐观回滚路径。Reducer 已经运行，
因此未恢复的追加使实时状态领先于日志；客户端标记
该分歧，栅栏压缩，并提供重新加载。

专门的配额分支识别原始浏览器变体，并包含
一次重试断路器外加 24 小时紧急保留策略。其当前
可达性刻意狭窄：存储将标准 Chromium
错误包装进通用持久化失败路径，而原始遗留变体到达
`emergencyCompact()`。因为该调用仍在失败写入的栈内，
pending-write 守卫当前使压缩尝试跳过。这就是为何
重试代码今日不得被描述为成功恢复；未来的
仅删除紧急压缩器会改变该边界。参见承重
注释于
[`operation-log.effects.ts`](../../src/app/op-log/capture/operation-log.effects.ts)
与
[`operation-log-compaction.service.ts`](../../src/app/op-log/persistence/operation-log-compaction.service.ts)。

### 压缩触发协调

500 操作压缩触发使用存储在 `state_cache.compactionCounter` 中的持久计数器：

- 每次原子追加递增持久计数器
- 计数器跨应用重启持久
- 成功压缩后重置计数器
- 内存镜像避免每次阈值检查时的 IndexedDB 读取

### 设备身份与遗留数据

同步 `clientId` ——
设备的稳定同步身份 —— 生活在 `SUP_OPS` `client_id` 存储中
（键 `current`）。它曾生活在遗留 `pf` 数据库中；将其存储在
`SUP_OPS` 中让破坏性流（干净石板、备份恢复）在
`runDestructiveStateReplacement` 的事务内原子轮换它，而非
手工跨数据库两阶段提交。`pf` 仍是只读、一次性
迁移源：在尚未迁移的设备上首次读取将 id
向前复制（`ClientIdService`）。clientId 不可再生成（它键控向量
钟），因此瞬时 IndexedDB 读取失败传播而非铸造
新 id。

### 活动同步期间的压缩

- 压缩与同步在操作日志锁上序列化
- 当存在任何非拒绝的 `pending` 远程行时，压缩在快照前中止
- 删除需要终端状态：已同步的 applied/遗留完成行或旧的被拒绝行
- `archive_pending` 与 `failed` 隔离行无论年龄都存活
- 紧急压缩在因 pending reducer 工作或空/降级
  实时状态而跳过时返回 `false`；调用方仅将实际写入的快照/剪枝遍视为成功

---

# Part E: 智能归档处理

应用将活动 NgRx 状态与两个 IndexedDB 归档分区分离。
`archiveYoung` 接收新归档的任务与非今日时间跟踪；
`archiveOld` 持有移过 21 天阈值的任务以及在周期性完整年轻到旧刷新期间移动的时间跟踪。

## E.1 同步归档的问题

归档分区可包含数万任务与工作日志。将它们当作总是重写的远程文件，使小的归档转换为整个历史数据集付出代价。成本取决于传输：默认 v2 文件同步仍重写该完整基线，而 SuperSync 与可选加入的 v3 文件格式通常可传输操作而不重写远程归档快照。

## E.2 新策略：确定性本地副作用

归档变更是带有确定性、幂等本地副作用的可重放操作。接收方更新其自身 IndexedDB 归档分区，而非安装单独版本化的归档数据库文件。这**不**意味着归档数据从不跨越网络：`moveToArchive` 携带接收方所需的完整任务数据，且完整文件同步基线包含两个归档分区。

| 传输             | 归档变更跨越网络的内容                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------- |
| **SuperSync**         | 归档操作载荷；无单独归档文件上传。                                                |
| **File v2（默认）** | 操作缓冲外加完整状态、`archiveYoung` 与 `archiveOld`，在重写的单体中。          |
| **File v3（可选加入）**  | 通常是 `sync-ops.json` 中的操作；在创建或替换快照时包含完整归档分区。 |

### E.3 工作流：moveToArchive

当用户归档任务时：

1.  **客户端 A（发起方）：**
    - 生成 `moveToArchive` 操作。
    - 将任务族写入 `archiveYoung`，并将非今日本地
      时间跟踪数据移出活动状态。
2.  **同步：** 操作，包括所需的完整任务数据，
    传到客户端 B。File-v2 还重写其完整归档基线。
3.  **客户端 B（远程）：**
    - 接收 `moveToArchive` 操作。
    - 执行**完全相同的逻辑**：
      - 将 action 携带的任务写入其自身的 `ArchiveYoung`。
      - 从 Active Store 移除它们。

**结果：** 两个客户端都本地应用相同的归档转换。SuperSync
不传输单独的归档文件；file v3 通常在压缩之间避免完整
归档快照重写；默认 file v2 不会。

### E.4 工作流：刷新（Young → Old）

发起客户端移动合格数据，然后用捕获的时间戳发出 `flushYoungToOld`。远程客户端在归档互斥锁下运行相同的阈值计算，并原子提交新的年轻/旧对。在操作中传递时间戳使重放独立于每个接收方的挂钟。

### E.5 幂等性要求

所有归档操作必须幂等：

| 操作            | 保证                          |
| -------------------- | ---------------------------------- |
| `moveToArchive`      | 若任务已在归档中则跳过    |
| `flushYoungToOld`    | 仅移动尚未在 Old 中的项 |
| `restoreFromArchive` | 若任务已在 Active 中则跳过     |

确切的变更与重试行为属于
[`ArchiveOperationHandler`](../../src/app/op-log/apply/archive-operation-handler.service.ts)
与 [`ArchiveService`](../../src/app/features/archive/archive.service.ts)。

## E.6 时间跟踪同步语义

时间跟踪是嵌套的 `project/tag → context ID → date → compact session`
映射。其归档边界不同于任务年龄边界：

```
Daily (finish work):
  all non-today active entries → archiveYoung

Every ~14 days (flush):
  all archiveYoung time tracking → archiveOld

Task archive flush in the same operation:
  only task families older than 21 days → archiveOld
```

全状态组装在字段级合并三个来源，优先级为
`current > archiveYoung > archiveOld`。增量同步仍基于操作；
特别是，并发正的任务时间 delta 对易并应用两者，而非
被归约为整条目 LWW。

| 职责                  | 所有者                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 状态形状                     | [`time-tracking.model.ts`](../../src/app/features/time-tracking/time-tracking.model.ts)                   |
| 全状态三源合并   | [`merge-time-tracking-states.ts`](../../src/app/features/time-tracking/merge-time-tracking-states.ts)     |
| 每日与周期性分区 | [`sort-data-to-flush.ts`](../../src/app/features/archive/util/sort-data-to-flush.ts)                      |
| 远程归档应用      | [`archive-operation-handler.service.ts`](../../src/app/op-log/apply/archive-operation-handler.service.ts) |

## E.7 归档载荷边界

[`TaskService.moveToArchive()`](../../src/app/features/tasks/task.service.ts)
持久化选定的父任务批次，然后分发一条
`moveToArchive({ tasks })` action。捕获将该持久 action 记为一条
携带选定批次完整任务载荷的操作。接收方需要
该数据，因为归档存储在 NgRx 之外，且任务可能不再
存在于其活动状态中。

没有归档特定的分块。SuperSync 的
[`DEFAULT_SYNC_CONFIG`](../../packages/super-sync-server/src/sync/sync.types.ts)
默认将每个操作载荷限制为 `20 * 1024 * 1024` 字节（20 MiB）。
足够大的归档 action 因此可能超过每操作
限制；即便低于它，一个非常大的载荷也是已知的可扩展性与失败
边界。当前代码既不拆分也不压缩该 action，且此处未指定
替换设计。

---

# Part F: 原子状态一致性

本节记载确保相关模型变更原子发生、防止同步期间状态不一致的架构原则。

## F.1 问题：Effects 创建非原子变更

当用户删除标签时，多个实体必须更新：

- 标签被删除
- 引用该标签的任务更新其 `tagIds`
- 引用该标签的 TaskRepeatCfgs 被更新或删除
- 该标签的 TimeTracking 数据被清理

若这些变更发生在单独的 NgRx effects 中：

1. 每个 effect 分发单独的 action
2. 每个 action 成为日志中的单独操作
3. 在同步期间，操作可能乱序或部分到达
4. **结果**：临时或永久状态不一致

## F.2 解决方案：用于原子变更的 Meta-Reducers

**原则**：必须作为一次原子转换重放的相关实体变更
应发生在单次 reducer 遍历中。

Meta-reducers 包装根 reducer，并可在该一次遍历中更新每一个受影响的切片。例如，
[`tag-shared.reducer.ts`](../../src/app/root-store/meta/task-shared-meta-reducers/tag-shared.reducer.ts)
拥有跨任务、重复配置与时间跟踪的标签删除清理。其测试是可执行契约；不要从本指南复制 reducer 形状。

### 使用中的 Meta-Reducers

| Meta-Reducer                      | 用途                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `tagSharedMetaReducer`            | 标签删除清理（任务、重复配置、时间跟踪） |
| `projectSharedMetaReducer`        | 项目删除清理                                 |
| `taskSharedCrudMetaReducer`       | 带标签/项目更新的任务 CRUD                       |
| `taskSharedLifecycleMetaReducer`  | 任务生命周期（归档、恢复）                        |
| `taskSharedSchedulingMetaReducer` | 带 Today 标签更新的任务调度                   |
| `plannerSharedMetaReducer`        | Planner 日管理                                   |
| `taskRepeatCfgSharedMetaReducer`  | 带任务清理的重复配置删除                 |
| `issueProviderSharedMetaReducer`  | Issue provider 更新                                   |
| `operationCaptureMetaReducer`     | 将 action 标记为待捕获（递增计数器） |

## F.3 多实体操作捕获

`OperationCaptureService` 与 `operation-capture.meta-reducer` 使用 **pending 计数器**一起工作以跟踪捕获（无位置队列——见下方注释）：

1. **Action 之后**：Meta-reducer 用该 action 调用 `OperationCaptureService.incrementPending()`
2. **Effect 处理**：Effect 经 `OperationCaptureService.extractEntityChanges()` 计算 `entityChanges`，写入操作，然后在 `finally` 中递减计数器
3. **结果**：带有 action 载荷与可选 `entityChanges[]` 数组的单条操作

`flushPendingWrites()` 轮询 `getPendingCount()` 以知道每一个已分发的 action 何时已写入。NgRx reducers 顺序处理 actions，且 effect 使用 `concatMap`，因此写入保持有序。

**为何用计数器，而非位置 FIFO 队列（#8306 / #8318）**：旧设计按 action 排队 `EntityChange[]`，并仅按位置关联 meta-reducer `push` 与 effect `shift`。若写入在其 `dequeue` 运行前抛出（例如 `LockAcquisitionTimeoutError`），条目泄漏且 `flushPendingWrites()` 永远无法到达 0——之后每一次同步都会在其 30 秒超时后失败。在 `finally` 中递减的计数器不能泄漏。`entityChanges` 现从 action 在写入路径中计算（纯函数），因此没有东西需要位置对齐。

**注意**：多数 actions 返回空 `entityChanges[]` —— action 载荷对重放已足够。仅 TIME_TRACKING 与 TASK 时间同步 actions 有从 action 载荷提取实体变更的特殊处理。该字段仍被发出（即便为 `[]`），因为 Android 后台提供者读取它，且 `isMultiEntityPayload` 守卫要求它。

```
User Action (e.g., Delete Tag)
    │
    ▼
tagSharedMetaReducer (+ other meta-reducers)
    ├──► Atomically update all related entities
    │
    ▼
Feature Reducers
    │
    ▼
operation-capture.meta-reducer
    ├──► Call OperationCaptureService.incrementPending(action)
    │         └──► Increments the pending counter
    │
    ▼
OperationLogEffects (per-action wrapper: writeOperationFromEffect)
    ├──► Call OperationCaptureService.extractEntityChanges(action)
    ├──► Create + persist single Operation with action payload
    └──► finally: OperationCaptureService.decrementPending()
```

## F.4 何时使用 Meta-Reducers 对 Effects

| 场景                                                | 模式                                  |
| ------------------------------------------------------- | ---------------------------------------- |
| 跨切片/实体的一次重放原子转换     | Meta-reducer                             |
| 独立持久工作流步骤                    | 普通 reducer action                  |
| 清理必须与删除一起重放的实体删除 | Meta-reducer                             |
| UI 通知（snackbar、声音）                      | 使用 `LOCAL_ACTIONS` 的 Effect             |
| 外部 API 调用                                      | 使用 `LOCAL_ACTIONS` 的 Effect             |
| 归档操作（异步 I/O）                          | 专用归档操作处理路径 |
| 导航/路由                                      | 使用 `LOCAL_ACTIONS` 的 Effect             |

**经验法则**：必须跨切片或实体原子重放的状态变更使用 meta-reducer。独立工作流步骤保持为普通持久 actions；effects 拥有 I/O 与 UI 副作用并使用 `LOCAL_ACTIONS`。刻意的工作流例外及其成本记载于
[贡献者同步模型](./contributor-sync-model.md#the-atomicity-rule--one-replay-atomic-transition-one-op)
与 [ADR #5](../../ARCHITECTURE-DECISIONS.md#5-project-completion-decoupled-resolution-over-atomic-multi-entity-op)。

## F.5 看板式混合模式

对实体间引用（例如 `tag.taskIds`），我们使用「看板式」模式，其中：

- **事实来源**：子实体的引用（例如 `task.tagIds`）
- **派生列表**：父实体的列表（例如 `tag.taskIds`）仅用于排序

Selectors 从事实来源重新计算成员资格，过滤过时排序
ID，保留存储顺序，并追加缺失成员。嵌套已标记任务的当前处理
很微妙；使用
[`computeOrderedTaskIdsForTag`](../../src/app/features/tag/store/tag.reducer.ts)
而非复制的实现。

## F.6 新功能指南

添加新实体或关系时：

1. **识别必须一起变更的相关实体**
2. **创建或扩展 meta-reducer** 以处理原子更新
3. **声明正确的持久元数据**（`entityType`、实体 ID、`opType`）
   并用真实 action 形状覆盖捕获/重放
4. **在 effects 中仅对副作用使用 `LOCAL_ACTIONS`**
5. **对父子列表引用考虑看板式模式**

---

# 源映射

使用现场指南的稳定
[可执行源映射](./sync-architecture.html#sources)，而非在此维护
复制的文件树。主要实现边界是
[`src/app/op-log/`](../../src/app/op-log/)、
[`packages/shared-schema/src/`](../../packages/shared-schema/src/)、
[`packages/sync-core/src/`](../../packages/sync-core/src/)、
[`packages/sync-providers/src/`](../../packages/sync-providers/src/)，以及
[`packages/super-sync-server/src/`](../../packages/super-sync-server/src/)。

# 参考

- [贡献者同步模型](./contributor-sync-model.md) - Effects、reducers、selector 守卫与批量 dispatch 的单一不变量
- [SECTION 冲突重放](./section-conflict-replay.md) - 狭窄的语义重放与已发布客户端兼容性契约
- [SuperSync 加密](./supersync-encryption-architecture.md) - 端到端加密实现与完整性边界
- [向量钟](./vector-clocks.md) - 向量钟实现细节
