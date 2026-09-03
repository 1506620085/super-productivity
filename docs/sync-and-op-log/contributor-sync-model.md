# 贡献者同步模型

**在编写任何会触及已同步状态的 effect、reducer 或批量 dispatch 之前，必须先理解这一点。**

Super Productivity 通过重放操作日志（operation log）完成同步。你几乎会碰到的每一条同步正确性规则，都是同一条**不变量**的不同侧面：

> ## 每一次在重放时必须保持原子的状态转换（通常对应一个持久化 action）= 恰好一条操作。已重放的与远程操作绝不能再次触发 effects。

此处的「意图」指的是在重放期间必须保持不可分割的那次转换，而不一定是整个多步骤 UI 工作流。当工作流刻意需要保留各步正常的本地副作用以及按实体划分的冲突边界时，它可以故意组合多个独立的持久化 action。

Reducers **必须**对远程/重放操作运行（状态正是这样重建的）。Effects **绝不能**——UI 副作用（snack、声音、导航）已经在发起端客户端发生过，且工作流刻意发出的每一次持久化转换在操作日志里都已有各自的条目。在重放时再跑一遍 effects 会重复副作用，并产生与同步冲突的幻影操作。

下文即是该不变量在三个落点上的具体应用。

---

## 边界 1 — Action 边界

**Effects 注入 `LOCAL_ACTIONS`，绝不注入 `inject(Actions)`。**

`LOCAL_ACTIONS` 是过滤掉 `meta.isRemote` 之后的标准 actions 流（`src/app/util/local-actions.token.ts`）。远程/重放操作以一条 `bulkApplyOperations` action 应用；`LOCAL_ACTIONS` 保证你的 effect 只看到真正的本地用户意图。

- **所有** effects 的默认写法：`private _actions$ = inject(LOCAL_ACTIONS);`
- 唯一正当的例外使用 `ALL_ACTIONS` 并自行处理 `isRemote`：`operation-log.effects.ts`（捕获/持久化每一个 action）。你几乎肯定不会再加第二个。
- 远程 **archive** 副作用**不属于** `ALL_ACTIONS` 情形：`archive-operation-handler.effects.ts` 自身使用 `LOCAL_ACTIONS`；远程客户端上的 archive 写入/删除由 `OperationApplierService` → `ArchiveOperationHandler` 另行驱动。

✅ **由 `local-rules/no-actions-in-effects` 强制执行** — 你不可能写错；linter 会拒绝在 `*.effects.ts` 中使用 `inject(Actions)` / 导入 `Actions`。

## 边界 2 — Selector 边界

**由 selector 驱动的会改写状态的 effects 必须守卫同步窗口。选择该来源是可丢弃还是必须延迟。**

若 effect 响应的是 _selector_（store 状态）而非某个具体 _action_，就会完全绕过边界 1——它会在每一次 store 变化时触发，包括 hydration 与同步重放。两个时间窗口（首次同步前的启动阶段；同步后的重新求值窗口）会让这类 effects 带着过时的向量钟发出操作，并立即产生冲突。

- 仅当**电平/重复型**来源的下一次发射可以安全重试该工作时，才使用 `skipDuringSyncWindow()`。它会故意丢弃发射。
- 当发射是**稀疏或边沿触发**、且丢弃后无法恢复时，使用 `waitForSyncWindow()`。Store selector 通常以 `distinctUntilChanged()` 结尾，因此同步期间变化过的值在窗口关闭后可能永远不会再发射。
- **`waitForSyncWindow()` 不门控初始同步。** 它只观察 `HydrationStateService.isInSyncWindow()`，因此当该窗口已关闭时会立即放行，即便初始同步门尚未打开。`skipDuringSyncWindow()` 不同：它还会检查 `SyncTriggerService.isInitialSyncDoneSync()`。因此，必须等待启动同步的稀疏改写型 effect 需要两道门：

  ```typescript
  return this._syncTriggerService.afterInitialSyncDoneStrict$.pipe(
    first(),
    switchMap(() =>
      sparseSource$.pipe(
        // Capture all state required by the edge before deferring it.
        map((edge) => captureRequiredState(edge)),
        waitForSyncWindow(this._hydrationState, 'MyEffects:mutatingEffect$'),
        // ...perform the mutation
      ),
    ),
  );
  ```

  这是 `TaskDueEffects.createRepeatableTasksAndAddDueToday$` 与 `TaskRepeatCleanupEffects.cleanupDuplicateRepeatInstances$` 已确立的组合方式。仅当故意需要其非严格的「UI 就绪」语义时，才改用 `afterInitialSyncDoneAndDataLoadedInitially$`；任何一道门都无法提供比 `SyncTriggerService` 文档中所述故障保护更强的保证。

- 在等待之前，将边沿与处理它所需的每一份状态 combine/map 起来。窗口关闭后再处理该捕获快照；不要等待后再从无关的实时状态中重建一个已经过去的边沿。`waitForSyncWindow()` 只保留最新的待处理值，因此当每一次单独发射都必须保留时，它不是合适的操作符。
- `waitForSyncWindow()` 在 30 秒后失败开放（fail-open）：它会记录超时，即便同步窗口仍在活动也仍然发射。它能防止稀疏触发在普通短同步中丢失，但**不是**硬互斥边界。若某次改写绝不能与重放重叠，请优先使用 `LOCAL_ACTIONS` 驱动的 effect，或围绕失败关闭（fail-closed）边界重新设计，而不是依赖该操作符。
- 更窄的 `skipWhileApplyingRemoteOps()` / `HydrationStateService.isApplyingRemoteOps()` 可用于更细粒度的控制。
- **优先使用基于 action 的 effects。** 基于 selector 的 effect 是直觉上容易想到但通常错误的选择；仅在没有可键控的 action 时才采用。

✅ **由 `local-rules/require-hydration-guard` 强制执行**（既有规则）。

## 原子性规则 — 一次重放原子转换，一条操作

**跨实体变更应放在 meta-reducers 中，而不是 effects。批量 dispatch 循环需要让出。**

- 一次必须原子重放且触及多个实体的转换（例如删除一个标签同时从每个任务中移除它）必须是**一次 reducer 遍历**，从而成为**一条操作**。把它放进 `src/app/root-store/meta/task-shared-meta-reducers/`，而不是放在会扇出分发后续 actions 的 effect 里。基于 effect 的扇出会为一次原子转换发出 N 条操作，_并且_会在重放时再次运行（这是边界 1 的重述）。
- 不要仅仅因为工作流从一个用户手势开始，就把它折叠成一条操作。当各独立 action 的正常本地 effects 以及按实体划分的冲突边界很重要时，独立 actions 是合适的。项目完成故意先通过普通的逐任务 actions 解决任务，再翻转项目标志，接受无界的 N+1 操作计数与短暂的中间状态。这是该罕见语义例外已知的可扩展性残留，不是新的批量扇出先例；参见 [ADR #5: Project Completion](../../ARCHITECTURE-DECISIONS.md#5-project-completion-decoupled-resolution-over-atomic-multi-entity-op)。
- `store.dispatch()` 与 NgRx reducers 同步运行；仅由捕获触发的 op-log 持久化是异步的。在 50+ 次 dispatch 的循环之后，加一次循环后的 macrotask 让出，`await new Promise((r) => setTimeout(r, 0))`，以在依赖的后续 action 之前保护捕获顺序。它不会分块或限制主线程上的 reducer 工作，也不会减少 N+1 上传放大。

⚠️ `local-rules/no-multi-entity-effect`（`warn`）以启发式方式标记此问题 — 它捕获数组字面量扇出形状（`map(() => [a(), b()])`），而非每一种多实体 dispatch（例如 `of(a(), b())` 可变参数扇出会漏网）。受认可的模式是 `task-shared-meta-reducers/` 中的 reducer。

---

## 清除字段 — `undefined` 无法经线路存活 (#9776)

**绝不要依赖 `changes: { someField: undefined }` 能到达另一台设备。**
`JSON.stringify` 会从操作载荷中丢弃值为 undefined 的键（SuperSync HTTP/E2EE、基于文件的提供者、SQLite op-log — 除 IndexedDB 结构化克隆外的一切），因此按原样应用 `changes` 的 reducer 在远端会把清除重放成空操作。本地设备看起来是正确的，这正是这类 bug 能逃过测试的原因。

安全模式，按偏好顺序：

1. **在 reducer/meta-reducer 内部设置 `undefined`**，由载荷只携带 id 的专用 action 键控（例如 `TaskSharedActions.dismissReminderOnly` → reducer 中的 `remindAt: undefined`）。重放时确定性；无需序列化。
2. **从解构后的载荷字段重建 `changes`** — 被丢弃的键解构回来同样是 `undefined`（例如 `scheduleTaskWithTime`）。
3. 对于通用的 `Update<T>` actions，**在带外列出被清除的键**：action creator 通过 `clearedFieldsProps()` 添加 `clearedFields`，reducer 用 `applyClearedFields()` 恢复它们（`src/app/util/cleared-update-fields.ts`；用于 `updateTaskUi` 与 `updateTaskRepeatCfg`）。旧客户端会忽略该额外属性，因此清除在那边会降级为空操作而非破坏状态 — 无需 schema 升级。

在冲突解决侧，`createLWWUpdateOp` 除非调用方通过 `listClearedFields` 选择加入，否则绝不会列出 `clearedFields` — 目前只有不相交合并（disjoint-merge）delta 会这样做，重新声明冲突操作本身所携带的清除。从**实时状态**构建的补丁载荷（例如 `taskRelationshipPatch`）会物化意外的 `undefined` 键 — 每个根任务的 `parentId` — 且绝不能选择加入：列出它们会向接收方广播一次真正的清除（由 `conflict-resolution.disjoint-merge.spec.ts` 中的测试 (a0c) 与 `conflict-resolution.service.spec.ts` 中的关系后续固定测试钉住）。

**不要**发明带内哨兵值（`null`、`0`、标记字符串）：远程 reducers 会按原样应用载荷值，因此已发布的客户端会持久化哨兵并导致 typia 状态校验失败。

---

## 决策表 — 「我正在写一个 effect」

| 问题                                                        | 答案                                                                                                    | Linter                                           |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 是否注入 actions 流？                              | 使用 `LOCAL_ACTIONS`（不要用 `Actions`）                                                                       | ✅ `no-actions-in-effects`（error）               |
| selector 发射能否由下一次发射安全重试？ | 用 `skipDuringSyncWindow()` 丢弃它                                                                     | ✅ `require-hydration-guard`（error）             |
| selector 发射是否为稀疏/不可恢复的边沿？           | 经所需的初始同步门进入，捕获其状态，再用 `waitForSyncWindow()` 延迟 | ✅ 仅窗口守卫；初始门是约定 |
| 一次重放原子转换是否改变 **>1 个实体**？         | 做成 meta-reducer，而不是 effect                                                                     | ⚠️ `no-multi-entity-effect`（warn）               |
| 是否在 **50+ 次循环**中 dispatch？                          | 之后让出一次以保证捕获顺序；这不是批处理                                             | —（约定）                                   |

三者中有两条由机制强制执行 — 你不必死记硬背，只需理解_为什么_（文首的不变量）。

---

## 同步纪元栅栏 (#9074)

一个同步周期跨越许多 `await`；破坏性配置变更（提供者/账户切换、文件夹移动、加密启用/禁用/改密）可能落在这些间隙中的任意一处。之后，过时的周期绝不能对新的目标/纪元执行 apply、upload、acknowledge 或推进游标。

- `SyncProviderManager.syncEpoch` 是单调计数器，在每一次此类变更**完成之后**递增（以及在 `runWithSyncBlocked` 入口处；后者还会先阻断新周期，再有界地排空正在运行的周期）。首次设置（无先前配置 / 首次激活提供者）**不**递增 — 没有需要栅栏的旧目标，且递增会与新配置的首次同步竞态，导致虚假中止。
- 每一个周期在**一个同步块中读取 (provider, epoch) 对**（切换在其侧于同一同步块中交换对象并递增纪元，因此同块读取始终一致），并将纪元作为 `fenceEpoch` 贯穿传递。过早捕获 — 例如在周期声明时 — 会让切换在中间的 awaits 中完成，从而把新提供者与过时纪元交给该周期：首次切换后同步会被虚假中止。
- 提供者 I/O 集中在一处加栅栏：`getOperationSyncCapable(provider, { fenceEpoch })` 返回一个每周期委托，在每一次提供者调用前重新断言纪元。本地写入（锁闭包内的 apply、ack 持久化、hydration、迁移追加、rejected-ops 处理、rebuild resume）在调用点通过 `assertSyncEpochUnchanged` 重新断言。
- 断言失败抛出 `SyncEpochChangedError`，在每一个入口点作为**良性中止**处理（无错误 snack，`UNKNOWN_OR_CHANGED`）— 每个中止点在设计上等价于崩溃（延迟的 acks 会重新上传，落后的游标会带去重重新下载）。

**未贯穿传递的流就是未加栅栏的流**：`fenceEpoch: undefined` 会禁用断言。添加新的同步入口点时，捕获并贯穿纪元；在周期内添加新的本地写入时，在其前添加断言。刻意未贯穿的现状：`forceUploadLocalState` / USE_LOCAL/USE_REMOTE 冲突解决流（由加密标志 + 周期守卫覆盖），以及密钥恢复配置写入（仅内容，绝不能递增）。

---

## 为何如此（深入）

- **贡献者规则：** 本文档；旧的 [`operation-rules.md`](./operation-rules.md) 路径现为兼容性指针。
- **架构导览：**
  [`sync-architecture.html#local-intent`](./sync-architecture.html#local-intent)、
  [`sync-architecture.html#remote-apply`](./sync-architecture.html#remote-apply)
- **深层理由：**
  [`operation-log-architecture.md`](./operation-log-architecture.md)
- **事实来源：** `src/app/util/local-actions.token.ts`、
  `src/app/util/skip-during-sync-window.operator.ts`、
  `src/app/util/wait-for-sync-window.operator.ts`、
  `src/app/imex/sync/sync-trigger.service.ts`、
  `src/app/op-log/apply/hydration-state.service.ts`
