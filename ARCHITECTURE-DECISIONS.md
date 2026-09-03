# 架构决策记录（Architecture Decision Records）

本文档追踪 Super Productivity 代码库中的重要架构决策与模式。当改动影响这些模式时，请引用本文档，并在需要时更新。

它同时也是已采纳决策的**索引**：记录在别处的决策——因其足够长而独立成文，或因其作为贡献者规则被强制执行——仍必须列在 [记录于别处的决策](#记录于别处的决策) 下。

## 现行模式与决策

### 1. dueDay/dueWithTime 互斥模式

**状态**：✅ 现行（自提交 `400ca8c1`，2026-01-29）

**决策**：在新数据中，`task.dueDay` 与 `task.dueWithTime` 字段互斥。设置 `dueWithTime` 时必须清除 `dueDay`（设为 `undefined`）。读取时，`dueWithTime` 优先于 `dueDay`。

**理由**：

- 防止两字段取值冲突导致的状态不一致 Bug
- 任务排期的单一事实来源
- 更简单的状态管理

**实现**：

- **写入**：设置 `dueWithTime` 时清除 `dueDay`（在 meta-reducers 中）
- **读取**：先检查 `dueWithTime`；仅当未设置时再检查 `dueDay`（在 selectors 中）
- **遗留数据**：同时带有两字段的旧数据通过优先级模式工作（无需迁移）

**关键文件**：

- [`task.model.ts`](src/app/features/tasks/task.model.ts) - 带 JSDoc 的字段定义
- [`task-shared-scheduling.reducer.ts`](src/app/root-store/meta/task-shared-meta-reducers/task-shared-scheduling.reducer.ts) - 写入实现
- [`work-context.selectors.ts`](src/app/features/work-context/store/work-context.selectors.ts) - 读取模式
- [`planner.selectors.ts`](src/app/features/planner/store/planner.selectors.ts) - 读取模式
- [`task.selectors.ts`](src/app/features/tasks/store/task.selectors.ts) - 读取模式

**何时更新此模式**：

- 新增日期/时间排期字段
- 修改任务排期逻辑
- 处理检查到期日的任务 selectors

---

### 2. TODAY_TAG 虚拟标签模式

**状态**：✅ 现行（既有模式）

**决策**：`TODAY_TAG`（ID：`'TODAY'`）是一个**虚拟标签**，其成员关系由 `task.dueWithTime` 或 `task.dueDay` 决定，而非 `task.tagIds`。该标签的 `taskIds` 字段仅存储任务排序，不表示成员关系。

**关键不变量**：`TODAY_TAG.id` 绝不可加入 `task.tagIds`

**理由**：

- 在所有标签（虚拟与普通）上统一移动操作
- 「今天」成员关系的单一事实来源（日期字段，而非 tagIds）
- 自愈式排序（过期条目自动过滤）
- 与规划器（使用日期字段）自然集成

**相关**：使用 dueDay/dueWithTime 互斥模式（决策 #1）

**关键文件**：

- [`tag.const.ts`](src/app/features/tag/tag.const.ts) - TODAY_TAG 定义
- [`work-context.selectors.ts`](src/app/features/work-context/store/work-context.selectors.ts) - 成员关系计算
- [`task-shared-helpers.ts`](src/app/root-store/meta/task-shared-meta-reducers/task-shared-helpers.ts) - 不变量强制

**何时更新此模式**：

- 新增虚拟标签
- 修改标签成员关系逻辑
- 处理今日任务列表

---

### 3. 同步包边界方向

**状态**：✅ 现行（自 2026 年 5 月）

**决策**：Operation-log 同步代码按依赖方向拆分：
`src/app` 组合宿主特定接线，`@sp/sync-providers` 拥有打包的提供方实现，
`@sp/sync-core` 拥有与框架无关的可复用同步原语。

**理由**：

- 使可复用同步算法独立于 Angular、NgRx、应用模型与提供方实现
- 防止提供方 ID、应用 action/实体枚举、校验 schema、UI、OAuth 与平台桥泄漏进核心引擎包
- 为边界 lint 提供清晰规则：包永不导入应用代码，提供方只消费公共 sync-core 导出

**实现**：

- ESLint 拒绝包源码中的 Angular、NgRx、app、shared-schema、sync-core 深层导入以及动态导入
- `@sp/sync-core` 无运行时依赖，拥有客户端/服务端兼容路径所用的向量钟算法
- `packages/shared-schema` 为兼容性而从 `@sp/sync-core` 再导出通用向量钟算法；`@sp/sync-core` 不得导入 `@sp/shared-schema`
- `@sp/sync-providers` 依赖公共 `@sp/sync-core` 与提供方运行时辅助，而应用工厂注入凭证、平台桥、校验器、OAuth 路由与配置

**文档**：[`docs/sync-and-op-log/package-boundaries.md`](docs/sync-and-op-log/package-boundaries.md)

**关键文件**：

- [`packages/sync-core/src/index.ts`](packages/sync-core/src/index.ts) - 核心公共 API
- [`packages/sync-providers/package.json`](packages/sync-providers/package.json) - 提供方公共导出
- [`eslint.config.js`](eslint.config.js) - 包边界强制
- [`src/app/op-log/sync-providers/sync-providers.factory.ts`](src/app/op-log/sync-providers/sync-providers.factory.ts) - 应用侧提供方组合

**何时更新此模式**：

- 在应用与包之间移动同步代码
- 新增包导出或依赖
- 新增提供方实现或面向插件的提供方契约
- 更改向量钟归属或 shared-schema 兼容性

---

### 4. 通过 RepeatableRead 下的 lastSeq 行锁实现上传冲突安全

**状态**：✅ 现行（自 2026 年 5 月；批量上传引擎于 2026 年 8 月移除）

**决策**：SuperSync 上传的冲突安全来自共享的
`user_sync_state.lastSeq` 行写入（用于预留服务端序号），而非仅依赖
PostgreSQL RepeatableRead 快照隔离。

**注——批量上传引擎已删除（2026-08，#9508）**：本决策最初为批量上传引擎
（`processOperationBatch`、`prefetchLatestEntityOpsForBatch`、
`SUPERSYNC_BATCH_UPLOAD` 标志）撰写。该引擎从未在生产启用，后被删除而非上线；
串行逐 op 路径（`processOperation`）是唯一的上传引擎。下方不变量与引擎无关，
对串行路径同样适用。已删批量代码最后存在于提交 `924ddd7019`。重新开启条件：
批量引擎处理 25-op 上传约需 ~10 条 SQL，串行约 ~127 条——仅当测得生产上的
单次上传延迟或事务持锁时间成为问题时，才从该提交复活（并重新评审）。

**理由**：

- PostgreSQL RepeatableRead 不提供完整可串行化快照隔离
- 两个并发上传事务在读取同一插入前快照时，都可能通过冲突检查
- 通过一个 `user_sync_state.lastSeq` 行预留序号，迫使同一用户的被接受写入在该行锁上串行
- 因果性 `REPAIR` 快照必须证明其状态包含当前服务端前缀；同一行将该基础游标检查与后续写入串行化
- 若两次上传竞态，后写者在该行上阻塞，由事务重试路径处理序列化失败，而非静默接受冲突操作
- 串行路径分配后的冲突复查（「FIX 1.5」，2026-08 移除；最后存在于提交 `07511ab45c`）是死代码：在 RepeatableRead 下两次冲突检查都读取事务第一条语句固定的同一快照，而 `lastSeq` 自增会在复查能运行之前对任何已提交的并发上传引发序列化失败（40001）。若将隔离级别降到 REPEATABLE READ 以下，则需要恢复分配后复查。

**实现**：

- upsert 确保存在 `user_sync_state` 行（`lastSeq: 0`）；每个被接受的操作随后通过该行上的原子 `update({ lastSeq: { increment: 1 } })` 预留序号（`operation-upload.service.ts`）
- 操作插入使用 `createMany(..., skipDuplicates: true)`：丢失的重复 ID 竞态表现为 `count === 0`，在事务内处理（序号回滚，op 归类为 `DUPLICATE_OPERATION`），而不是因唯一约束错误中止整个上传；仅非 ID 唯一冲突才会中止事务
- `REPAIR` 上传将 `repairBaseServerSeq` 持久化到操作行。HTTP 处理器在配额清理前拒绝明显过时的 base，上传事务在插入前于 `SELECT ... FOR UPDATE` 下重复检查
- 携带 `lastKnownServerSeq` 的常规上传使用同一每用户行锁，在插入前拒绝落后于最新 `SYNC_IMPORT` 或 `BACKUP_IMPORT` 的上传。持久替换标记对标记存在前创建的行，从保留的操作中惰性调和。
- 该标记携带**导入**语义——它迫使过时客户端下载替换内容，然后客户端丢弃其中的并发 ops。仅导入会推进它。惰性调和回退到最新因果 `REPAIR`，纯粹作为已被裁剪删除的导入行的替身；repair 本身不是围栏，客户端会在其上重放并发工作而非丢弃
- 无标记的遗留 repair 是兼容记录，不是因果边界：它们不能驱动下载快进、快照信任、历史裁剪或服务端生成的恢复点；跨越其一的快照重放以失败关闭
- 移除或分片 `lastSeq` 写入需要用等价的每用户串行化原语替换此安全机制

**文档**：
[`packages/super-sync-server/docs/architecture.md`](packages/super-sync-server/docs/architecture.md)，
[`docs/sync-and-op-log/sync-architecture.html#transport`](docs/sync-and-op-log/sync-architecture.html#transport)

**关键文件**：

- [`packages/super-sync-server/src/sync/sync.service.ts`](packages/super-sync-server/src/sync/sync.service.ts) - 上传事务与序号原语
- [`packages/super-sync-server/prisma/schema.prisma`](packages/super-sync-server/prisma/schema.prisma) - `user_sync_state.last_seq`
- [`packages/super-sync-server/tests/integration/repair-causality.integration.spec.ts`](packages/super-sync-server/tests/integration/repair-causality.integration.spec.ts) - 真实 PostgreSQL 竞态覆盖

**何时更新此模式**：

- 更改上传冲突检测
- 更改服务端序号分配
- 更改上传操作的事务隔离级别
- 更改 repair 基础游标校验或全状态历史裁剪
- 更改状态替换上传围栏
- 引入多写者或多区域上传处理

---

### 5. 项目完成：解耦解析，而非原子多实体 Op

**状态**：✅ 现行（自 2026-06-06，分支 `feat/completing-projects-48eeb4`）

**决策**：「完成项目」是一次**普通的单实体 `PROJECT` 标志翻转**（`completeProject`，`OpType.Update`，镜像 `archiveProject` → 设置 `isDone`/`doneOn`/`isArchived`）。伴随的未完成任务解析（「移到收件箱」/「标为完成」）**先**以**普通的逐任务 actions**（`moveToOtherProject` / `updateTask isDone`）在循环中 dispatch，并配合规则 #6 的批量 dispatch flush——**不**捆绑进单个原子多实体 op。

**理由**：早期迭代将完成做成一个原子 `Batch` op（`completeProject`），在项目共享 meta-reducer 内标记/移动任务。因为该 op 有意**绕过**普通逐任务 actions，所有观察那些 actions 的系统都必须单独再学会 `completeProject`：

- **冲突检测**需要整套新的 `affectedEntities` 多实体引用特性贯穿 sync-core、同步服务器（+ Prisma 迁移）、shared-schema 与 op-log——约 1,565 LOC，而 `completeProject` 是**唯一**生产者。
- **原生提醒取消**、**issue 双向同步**、**时间块同步**与 **repeat-cfg** effects 各自需要专用的 `completeProject` 监听器，以重新推导原子 op 跳过的任务变更。

原子 op 的头条收益——整件事作为一单位撤销——从未实现：`reopenProject` 只清除项目标志；它**不会**撤销移动或撤销完成已解析任务。因此该捆绑为未兑现的撤销保证付出了巨大的横切成本。解耦使既有效应与按实体冲突检测自然触发，并总共删除约 1,750 LOC（回退 + 解耦）。接受的权衡：完成现在发出 **N+1 个 ops**（每个被解析任务一个 + 标志翻转），并存在短暂中间状态——对于罕见、由用户发起、且解析本身反正无法原子撤销的动作来说都可接受。相对旧原子 op 的一个行为细微差别：当未完成工作**移到收件箱**时，正在被追踪的任务仍保持为当前任务（它被前移而非完成——与收件箱前移意图一致）；**标为完成**路径通过既有 `autoSetNextTask$` effect 停止追踪当前任务。原子 op 在两种情况下都清除当前任务；解耦设计有意在前移场景下保留它。

**实现**：

- **Action/reducer**：`completeProject({ id, doneOn })` 在 `project.actions.ts`；`on(completeProject)` 在 `project.reducer.ts` 中翻转标志（守卫 `INBOX_PROJECT`）。`reopenProject` 仅清除标志。
- **服务**：`ProjectService.complete(id, doneOn)` dispatch 标志翻转；`moveTasksToInbox()` / `markTasksDone()` 循环普通逐任务 actions + `setTimeout(0)` flush。
- **流程**：`work-context-menu` 在调用 `complete()` **之前**解析未完成工作。
- **不要**在未重新论证上述全部下游成本的情况下，重新引入多实体 `completeProject` op 或其 `affectedEntities`。先前原子实现保留在提交 `0893a86162` 的历史中。

**关键文件**：

- [`project.actions.ts`](src/app/features/project/store/project.actions.ts)，[`project.reducer.ts`](src/app/features/project/store/project.reducer.ts)
- [`project.service.ts`](src/app/features/project/project.service.ts) — `complete` / `moveTasksToInbox` / `markTasksDone`
- [`work-context-menu.component.ts`](src/app/core-ui/work-context-menu/work-context-menu.component.ts) — `completeProject()` 流程

**何时更新此决策**：

- 新增通用批量 meta-reducer action（重新评估完成是否应采用）
- 重做完成如何解析未完成任务
- 任何再次将完成做成单个同步 op 的提案

---

### 6. Passkey 在邮箱验证前保持待定

**状态**：✅ 现行（自 2026 年 7 月）

**决策**：账户注册期间提交的 passkey 存为与精确邮箱验证令牌绑定的
`PendingPasskeyRegistration`。仅当该令牌被消费时，才提升为用户的活跃
`Passkey` 集合。

**理由**：

- WebAuthn 注册仪式证明持有凭证，而非伴随输入的邮箱地址的所有权。
- 若将提交的凭证直接存到未验证用户上，攻击者可预注册受害者地址，然后让受害者稍后的魔法链接验证激活攻击者的 passkey。
- 分开保存待定尝试可防止并发注册互相替换或激活。邮箱所有者通过消费同一注册尝试产生的链接来选择凭证。
- 邮件投递失败时，有界且会过期的待定尝试仍保留。删除共享的未验证用户可能与并发注册竞态，并使已成功投递的链接失效。

**实现**：

- Passkey 注册不存储活跃凭证，并为每个验证令牌创建一条待定行。
- 邮箱验证原子地认领未验证用户，用绑定到该令牌的凭证替换活跃 passkeys，并删除该用户其余待定尝试。
- Passkey 验证令牌仅存在于待定注册上；用户行上的验证令牌属于魔法链接注册。消费用户行令牌会验证邮箱，但会移除不可信的活跃与待定 passkeys。
- 迁移将每个未验证用户最新的遗留凭证移到待定表，并从未验证用户移除所有活跃凭证。
- 重发上限限制每个未验证账户的待定行数；行也会随验证令牌过期。

**关键文件**：

- [`auth.ts`](packages/super-sync-server/src/auth.ts)
- [`passkey.ts`](packages/super-sync-server/src/passkey.ts)
- [`schema.prisma`](packages/super-sync-server/prisma/schema.prisma)

**何时更新此模式**：

- 更改 passkey 注册或邮箱验证流程
- 向注册添加另一种凭证类型
- 更改验证令牌持久化或清理

---

### 7. 项目删除的版本化 Delete-Wins 语义

**状态**：✅ 现行（自 2026 年 7 月）

**决策**：以 schema v4 或更新创建的项目删除携带显式
`projectDeleteWins` 标记，并击败并发的项目更新。历史性、无标记的删除保留基于时间戳的 LWW 语义。

这是刻意的语义权衡：与带标记删除向量钟 CONCURRENT 的并发项目重命名或字段编辑
**会输**，无论哪边墙钟时间戳更新。删除一个另一设备正在编辑的实体优先于编辑——替代方案（时间戳 LWW）会复活空的项目壳并静默丢失其任务子树。丢失的编辑只能通过本地撤销恢复，不能通过同步。

**理由**：

- `deleteProject` 是一次用户意图，其 reducer 级联移除项目、活跃任务、笔记、分区、重复配置及相关归档数据。在该操作之后仅反转项目实体会丢数据并违反重放确定性。
- 在删除载荷中捕获每个级联实体或发出恢复侧车，会使载荷大小随项目规模增长，且仍无法安全恢复每种副作用。
- 删除是操作已表示的唯一完整、确定结果。并发重命名或项目字段编辑不得部分撤销它。
- Schema-v4 屏障使不理解此冲突策略的客户端在应用操作前停止（它们阻塞在更新 schema 门上，而非错误解析）。历史删除上**没有**载荷标记——v3→v4 空操作迁移从未添加——才是保留其时间戳-LWW 语义的原因；真正的判别器是标记，不是版本号。分类器还要求带标记删除的明文 `entityId` 匹配其经认证载荷的 `projectId`，因此被篡改/重放并改指向到存活实体的删除不能获胜。

**实现**：

- 新的 `deleteProject` actions 包含 `projectDeleteWins: true`；替换删除操作保留该载荷。
- 共享 LWW planner 接受宿主提供的 delete-wins 分类器。远程带标记删除无论时间戳都会应用。本地带标记删除替换为向量钟支配双方冲突的一个操作。
- SuperSync 保持其通用冲突协议：若首次删除上传被拒绝，既有重试路径上传因果占优的替换。基于文件的提供方使用相同的客户端 planner 与标记。
- 不要为补偿输掉的带标记项目删除而添加按任务/笔记的恢复操作或项目规模快照。

**关键文件**：

- [`task-shared.actions.ts`](src/app/root-store/meta/task-shared.actions.ts) — `PROJECT_DELETE_WINS_MARKER` 生产者
- [`conflict-resolution.ts`](packages/sync-core/src/conflict-resolution.ts)
- [`conflict-resolution.service.ts`](src/app/op-log/sync/conflict-resolution.service.ts) — delete-wins 分类器
- [`schema-version.ts`](packages/shared-schema/src/schema-version.ts)
- [`project-delete-wins-barrier-v3-to-v4.ts`](packages/shared-schema/src/migrations/project-delete-wins-barrier-v3-to-v4.ts)（注册于 [`migrations/index.ts`](packages/shared-schema/src/migrations/index.ts)）

**何时更新此模式**：

- 更改 `deleteProject` 执行的级联
- 添加另一个具有 delete-wins 冲突语义的操作
- 更改 schema 兼容性或 LWW 替换行为

---

### 8. 优先加性数据模型演进，而非 Schema 升版

**状态**：✅ 现行（自 2026 年 8 月）

**决策**：持久化与同步数据**加性**演进。按实际变更选择变更通道（见下表）。除非变更**既**无法表达为加性或派生字段，**又**会被旧客户端_误用_——而不仅仅是忽略——否则不要升高 `CURRENT_SCHEMA_VERSION`。这是 bump 策略（同步规则 10）的建设性对应物：后者说何时不升版，但不说改做什么。

| 变更内容                                                         | 通道                                                                    | 先例                                                     |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------- |
| 本地存储布局（stores、indexes、派生 meta）                       | `DB_VERSION` 阶梯——仅本地，永不传输                                     | `db-upgrade.ts` v7 播种 full-state-ops meta store        |
| 存储状态的形态（新字段、遗留键、默认值变更）                     | `loadAllData` reducer 中的读时规范化                                    | `migrateFocusModeConfig`、`migrateKeyboardConfig`        |
| 既有**已同步**字段的表示                                         | 双字段——新字段胜出，每次写入时从新字段重派生遗留字段                    | `normalizeStartOfNextDayConfig`                          |
| 操作语义                                                         | 载荷标记 / 信封，在旧客户端上惰性                                       | `LwwUpdatePayload`；v4 `projectDeleteWins` 标记          |

**理由**：

- 升版只围住_之后_发布的接收方。已发布的 v17.0.0–v18.14.0 客户端对 schema 5 及以下未迁移地应用 ops，并在 ≥ 6 时丢弃它们却仍推进游标——永久跳过。因此升版从未买到对真正在写今日数据的客户端的安全。
- 一旦任何 op 携带新版本就无法回退，并硬阻塞每个滞后的 post-v18.14.0 客户端于冻结游标。
- 遗留机群不会自行老化：桌面**没有自动更新器**（`electron/start-app.ts` 中的相关代码被注释），且更新横幅的关闭会被持久化。任何「等旧机群缩小」的策略实质是永久否定。
- 加性字段在此构造上安全：typia 使用 `createValidate`（多余属性既不拒绝也不剥离），LWW 补丁应用走 `updateOne`，浅合并保留未知键。**重命名与删除才是危险形态**——赢得冲突的旧客户端会重发缺少该字段的实体，在整个机群摧毁它——而没有任何升版能阻止，因为旧客户端无论如何都会继续写入。

**评估记录（2026-08）**：将 `CURRENT_SCHEMA_VERSION` 升到 5 被考虑并**拒绝**。候选动机均未成立：累积的可选字段/运行时默认债务无需迁移（该模式_就是_答案，见同步规则 11）；类型化 RRULE 重复模型可作为加性字段上线，同时扁平字段保持权威并重派生——见 #9664，它也纠正了该计划颠倒的跨版本门。无载荷的迁移是纯成本。

**实现**：无新机制——上表各通道均已存在并有已上线先例。

**文档**：[Bump Policy §A.7.11](docs/sync-and-op-log/operation-log-architecture.md#bump-policy--a-bump-does-not-protect-the-released-fleet)，[`persisted-model-fields.md`](docs/sync-and-op-log/persisted-model-fields.md)，`AGENTS.md` 同步规则 10 与 11

**关键文件**：

- [`schema-version.ts`](packages/shared-schema/src/schema-version.ts) — 常量及其升版警告
- [`normalize-start-of-next-day-config.ts`](src/app/features/config/normalize-start-of-next-day-config.ts) — 双字段模板
- [`global-config.reducer.ts`](src/app/features/config/store/global-config.reducer.ts) — `loadAllData` 处的读时规范化
- [`db-upgrade.ts`](src/app/op-log/persistence/db-upgrade.ts) / [`db-keys.const.ts`](src/app/op-log/persistence/db-keys.const.ts) — 仅本地版本阶梯

**何时更新此模式**：

- 变更真正需要删除或重命名已同步字段
- 升高 `CURRENT_SCHEMA_VERSION`（记录是什么赢得了升版）
- 桌面自动更新器上线——会改变本决策所依赖的机群假设

---

### 9. 日历写入位于插件中，且按提供方选择加入

**状态**：✅ 现行（记录于 2026-08；描述的边界于 2026-03 在 `3e2265fa57` / `020fd56504` 上线）

**决策**：Super Productivity 永远不是日历状态的权威。它读取日历以展示当日安排，并可写回已排期任务的_镜像_——但仅通过选择加入 `timeBlock` 契约的**插件 issue 提供方**，且仅当用户启用了该提供方的自动时间块设置时。核心代码不含日历写入路径。

今日边界：

| 表面                                                                                            | 写入？                              |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| 内置 iCal/CalDAV URL 订阅（`src/app/features/schedule/ical/`）                                  | 否——仅轮询与解析                    |
| 内置 issue 提供方（`src/app/features/issue/providers/*`）                                       | 否——无一实现 `timeBlock`            |
| 实现 `timeBlock` 的插件提供方（`google-calendar-provider`、`caldav-calendar-provider`）         | 是，当 `isAutoTimeBlock` 开启时     |

**理由**：

- **时间块是投影，不是同步实体。** `TimeBlockSyncEffects` 单向推送任务状态——排期、改期、标题、预估、完成、删除——到应用自己创建的事件。它从不把用户对该事件的编辑调和回任务，也从不触碰应用未创建的事件。即便有写入，流仍保持单向，从而避免真双向设计必须解决的同步环。
- **默认关闭，按提供方。** `isAutoTimeBlock` 是提供方配置表单上未勾选的框。写入某人的日历不应仅因集成已连接就推断（宣言：选择加入，默认安静）。
- **插件是正确归属。** 每条写入路径都需要 OAuth、按厂商的事件形态与厂商特定限流。放在 `packages/plugin-dev/` 并置于 `timeBlock` 契约之后，意味着核心不携带厂商 API 表面，坏掉的提供方降级为只读而非弄坏应用。
- **仍排除的内容。** 不把外部事件编辑调和回任务状态，不收养预先存在的日历事件，也不做按出现次的重复事件编辑（`RECURRENCE-ID`/`EXDATE`，#8148）。这些部分需要回答向量钟与 ETag 之间的冲突解析，仍未构建——见 #5001 的开放双向请求。

**实现**：

- 契约：`timeBlock: { upsertEvent, deleteEvent }` 于
  [`packages/plugin-api/src/issue-provider-types.ts`](packages/plugin-api/src/issue-provider-types.ts)
- 驱动：[`time-block-sync.effects.ts`](src/app/features/calendar-integration/time-block/time-block-sync.effects.ts)，
  注册于 [`feature-stores.module.ts`](src/app/root-store/feature-stores.module.ts)
- 手动按事件操作（改期、删除）：[`calendar-event-actions.service.ts`](src/app/features/calendar-integration/calendar-event-actions.service.ts)
- 事件本身**不是** op-log 实体——转换后的任务是带派生稳定 id 的普通任务
  （[`generate-calendar-task-id.ts`](src/app/features/calendar-integration/generate-calendar-task-id.ts)）。
  提供方_配置_会同步（`ISSUE_PROVIDER` 于
  [`entity-registry.ts`](src/app/op-log/core/entity-registry.ts)）。

**何时更新此模式**：

- 提出核心（非插件）日历写入路径——那越过本记录划定的边界
- 提出把外部事件编辑调和回任务状态（#5001）——需先写下 ETag vs 向量钟冲突故事
- 按出现次的重复编辑落地（#8148）

---

### 10. 向量钟优先于服务端实体版本化

**状态**：✅ 现行（记录于 2026-08；替代设计见 `git show 07511ab45c:docs/long-term-plans/server-side-entity-versioning.md`）

**决策**：冲突检测保持在**向量钟**上，裁剪至
`MAX_VECTOR_CLOCK_SIZE = 20`。服务端按实体版本计数器（乐观并发控制，每个中心化 API 使用的形态）已完整设计，但**不会构建**。该设计从未因维护者对其优点的否决而被拒绝——在此记录为默认拒绝，因为尚无任何东西证明其成本值得。

**理由**：

- **它要解决的问题未被观察到。** 裁剪仅在 21+ 个不同客户端 ID 触及同一时钟时丢弃因果信息。对个人深度工作工具而言这不是现实机群，而确实咬过的一个边界——导入客户端相对自身 ops 错误裁剪——已由同客户端检查处理。
- **它会使服务器成为事实来源，而不只是裁判。** SuperSync 服务器已检测冲突（`packages/super-sync-server/src/sync/conflict.ts` 中的 `detectConflict`），但通过比较_客户端_撰写的时钟——因果历史仍属客户端。实体版本化把该权威移入服务器。基于文件的提供方（WebDAV、Dropbox、本地文件）没有可运行它的服务器，因此向量钟路径无论如何必须存活，我们将维护**两套**冲突系统而非一套。
- **迁移是昂贵的一半。** 需要新服务器表、线协议变更、每个既有实体的回填，以及旧（仅时钟）与新（携带版本）客户端编辑同一实体的混合机群窗口。设计确实处理了这点——每步可独立部署且向后兼容——但「纸面上正确、跨八步、在出错会静默摧毁用户数据的子系统里」正是被权衡的成本，且目前没有任何它能救我们出的失败。
- **加密边界。** 设计假定实体版本不敏感且会落在 E2EE 之外。合理，但增加了另一条需推理的明文通道，且从未对照当前威胁模型重新推导——见
  [`supersync-encryption-architecture.md`](docs/sync-and-op-log/supersync-encryption-architecture.md)。

**实现**：未变——见
[`docs/sync-and-op-log/vector-clocks.md`](docs/sync-and-op-log/vector-clocks.md)。
服务器在冲突检测之后、存储之前裁剪。

**何时更新此模式**：

- 观察到真实机群每用户超过约 20 个不同客户端 ID，或裁剪被追溯到真实用户可见冲突（规则：从可复现问题出发）
- SuperSync 成为唯一支持的后端，移除「文件提供方无论如何都需要时钟路径」的约束

---

## 记录于别处的决策

这些与上方编号记录具有同等权威。它们在本文件之外，因为足够长而独立成文，或因其作为贡献者/Agent 规则在触碰子系统前必须阅读。保持本表完整——若你在别处记录决策，在此加一行。

| 决策                                                                                                                                                      | 所在位置                                                                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SuperSync 数据库静态加密** — 无项目托管的卷加密；LUKS 与 PostgreSQL-TDE 尝试因与 OpenVZ 不兼容而退役                                                     | [`docs/supersync-encryption-at-rest-decision.md`](docs/supersync-encryption-at-rest-decision.md)                                                                                                                                                                 |
| **Schema 版本升版策略** — 默认不升 `CURRENT_SCHEMA_VERSION`；升版从不保护已发布机群且不可回退                                                              | [`operation-log-architecture.md` §A.7.11 Bump Policy](docs/sync-and-op-log/operation-log-architecture.md#bump-policy--a-bump-does-not-protect-the-released-fleet)、[`schema-version.ts`](packages/shared-schema/src/schema-version.ts)、`AGENTS.md` 同步规则 10 |
| **持久化模型上的必填字段** — 持久化模型上的新字段为可选（`?`）加运行时默认，绝不为必填                                                                    | [`docs/sync-and-op-log/persisted-model-fields.md`](docs/sync-and-op-log/persisted-model-fields.md)、`AGENTS.md` 同步规则 11                                                                                                                                     |
| **一次用户意图 = 一个 op** — effects 注入 `LOCAL_ACTIONS`；多实体变更是 meta-reducer，不是 effect 扇出                                                     | [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md)、`AGENTS.md` 同步规则 1–3 与 6                                                                                                                             |
| **`src/app` 分层边界** — `core/` 与 `ui/` 不得导入 `features/`；lint 强制，带仅可缩小的祖父化列表                                                         | [`src/app/README.md`](src/app/README.md)、[`eslint.config.js`](eslint.config.js)（`FEATURE_LAYER_FENCE`）                                                                                                                                                         |

---

## 如何使用本文档

### 做架构变更时

1. **实现前**：检查你的改动是否影响任何现行模式
2. **实现中**：遵循已记录的模式
3. **实现后**：若你已做以下事项，更新本文档：
   - 更改了既有模式
   - 新增了架构模式
   - 做出影响未来开发的决策

### 何时新增决策

在以下情况新增决策记录：

- 决策影响多个文件/模块
- 未来开发者需要理解「为什么」而不只是「是什么」
- 模式需要在代码库中一致遵循
- 决策防止某一类特定 Bug

### 当决策变更时

**当答案本身被推翻时，不要就地改写记录的理由。** 推理历史——旧答案为何看起来正确、什么证据翻转了它——正是阻止一年后同一想法被再次提出的东西，且在 `git blame` 中不可见。应改为：

1. 将旧记录状态设为 `❌ Superseded by #N` 并**留在原处**。编号必须稳定：约 30 处代码注释按编号引用决策。
2. 将被取代记录精简为 **Decision** + **Rationale**——代码一删，其 _Implementation_ 与 _Key Files_ 立刻过时——并加一行说明何种新证据或成本使其错误。
3. 将替换写成新的编号决策，其理由点名它所取代的记录。

尚无记录被取代，因此没有完整范例。决策 #5 最接近第 2 步_内容_的模型——它记录了被拒设计、实际成本（约 1,565 LOC 横切机制仅服务单一生产者）、头条收益为何从未实现，以及保留先前实现的提交（`0893a86162`）。它本身是 `✅ Active`，不演示第 1、3 步的状态/替换机制。

这仅适用于答案变更。修正措辞、添加关键文件或澄清既有决策属于普通编辑。

### 决策记录模板

```markdown
### N. [模式/决策名称]

**Status**：✅ Active | 🚧 Draft | ⚠️ Deprecated | ❌ Superseded by #N

**Decision**：[一句话总结决策]

**Rationale**：

- [为何做出此决策？]
- [它解决什么问题？]

**Implementation**：

- [如何实现？]
- [使用的关键技术或模式]

**Documentation**：[详细文档链接]

**Key Files**：[实现此模式的主要文件列表]

**When to Update This Pattern**：[应审查/更新此模式的场景]
```

### 为何用一个文件

本日志有意**不**采用一决策一文件（`docs/adr/NNNN-*.md`）：

- 编号记录是贡献者或 Agent 的一次通读。与 [`AGENTS.md`](AGENTS.md) 中 lint 强制的规则不同，决策记录唯一的效力是被阅读——拆成 30 个文件意味着没人会全部读完。
- `docs/` 已分开 plans、long-term-plans、research、sync-and-op-log 与 wiki。再多一个位置只会让决策更难找，而不是更容易。

注意这是「一个索引，多个位置」，不是「一个文件」：[记录于别处的决策](#记录于别处的决策) 有意允许权威决策住在各自文档中。保持集中的是**入口**，使约 30 处代码内引用（`// See: ARCHITECTURE-DECISIONS.md Decision #2`）解析到同一处。

当取代链真正累积，或本文件超过约 1000 行时再重新评估。届时按**子系统**拆分，而不是一决策一文件，并保留既有编号以使那些引用仍有效。

---

## 相关文档

- [`src/app/README.md`](src/app/README.md) - 分层地图：东西在哪、哪些依赖方向被 lint 强制
- [`docs/sync-and-op-log/`](docs/sync-and-op-log/) - Operation log 架构
- [`docs/long-term-plans/`](docs/long-term-plans/) - 未来架构计划

---

## 提交引用

提交与这些模式相关的改动时，引用本文档与具体决策：

```
feat(tasks): implement feature X

Uses dueDay/dueWithTime mutual exclusivity pattern (ARCHITECTURE-DECISIONS.md #1)
```
