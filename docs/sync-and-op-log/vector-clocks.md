# 向量钟架构

## 1. 概述

向量钟跟踪的是**因果性**——「这个客户端是否知道那条操作？」——而非可能在设备间漂移的挂钟时间。它们是 Super Productivity 同步系统中冲突检测与 SYNC_IMPORT 过滤的基础。

### 核心类型

```typescript
interface VectorClock {
  [clientId: string]: number;
}
```

每个条目将客户端 ID 映射到单调递增的计数器。时钟 `{A: 5, B: 3}` 表示「该状态包含 A 的前 5 条操作与 B 的前 3 条操作」。

### 常量

| 常量                | 值 | 用途                           |
| ----------------------- | ----- | --------------------------------- |
| `MAX_VECTOR_CLOCK_SIZE` | 20    | 剪枝后时钟中的最大条目数 |

在 6 字符客户端 ID 下，20 条目时钟约 333 字节——带宽可忽略。用户需要 21+ 个唯一客户端 ID（重装/新浏览器）才会触发剪枝，对个人生产力应用而言极不可能。

---

## 2. 核心操作

三个操作——比较、合并与剪枝（`limitVectorClockSize`）——实现在通用 sync-core 包中（`packages/sync-core/src/vector-clock.ts`），客户端与服务器共用。两个操作——初始化与递增——仅客户端（`src/app/core/util/vector-clock.ts`），该文件还用空值处理与日志包装共享操作。

### 创建

```typescript
initializeVectorClock(clientId) → { [clientId]: 0 }
```

### 递增

```typescript
incrementVectorClock(clock, clientId) → { ...clock, [clientId]: clock[clientId] + 1 }
```

在接近溢出（接近 `MAX_SAFE_INTEGER`）时抛出。唯一恢复方式是 `SYNC_IMPORT` 以重置时钟。

### 比较

```typescript
compareVectorClocks(a, b) → EQUAL | LESS_THAN | GREATER_THAN | CONCURRENT
```

标准向量钟比较。缺失键视为零。

### 合并

```typescript
mergeVectorClocks(a, b) → { [key]: max(a[key], b[key]) for all keys in a ∪ b }
```

创建一个支配两个输入的新时钟。

---

## 3. 向量钟存在何处

### 每操作时钟

每条 `Operation` 携带 `vectorClock` 字段——创建该操作时的全局时钟状态。这是因果跟踪的主要机制。

### 全局时钟存储

存储在 IndexedDB（`SUP_OPS` 数据库，`vector_clock` object store）中，作为 `VectorClockEntry`：

```typescript
interface VectorClockEntry {
  clock: VectorClock; // Current global clock
  lastUpdate: number; // Timestamp of last update
}
```

全局时钟是客户端当前因果知识的**唯一事实来源**。在本地操作捕获期间，它与操作写入原子更新（通过 `appendWithVectorClockOverwrite` 的单次 IndexedDB 事务）。远程合并路径（`mergeRemoteOpClocks`）同样是单次读-合并-写事务，事务内对持久时钟做新鲜读取——绝不使用每标签页缓存——因此并发标签页不会因过时读取丢失条目。

### 快照时钟

`state_cache` 存储代表压缩时时钟的 `vectorClock`。这作为自上次快照以来未修改实体的基线。

### 实体前沿

按实体最新时钟，由 `VectorClockService.getEntityFrontier()` 按需计算。通过扫描快照之后的操作构建。用于细粒度冲突检测。

---

## 4. 向量钟生命周期（正常操作）

### 步骤 1：创建本地操作

在 `operation-log.effects.ts` 中：

1. `VectorClockService.getCurrentVectorClock()` 从 `vector_clock` store 读取全局时钟
2. `incrementVectorClock(currentClock, clientId)` 创建客户端计数器已递增的新时钟
3. 操作带着该**完整、未剪枝**时钟被创建
4. `appendWithVectorClockOverwrite(op, 'local')` 在**单次原子 IndexedDB 事务**中写入操作并更新全局时钟

**关键不变量：正常操作携带完整（未剪枝）向量钟。捕获期间不发生客户端侧剪枝。**

### 步骤 2：上传到服务器

在 `sync.service.ts`（`processOperation`）中：

1. `ValidationService.validateOp()` 清理时钟（DoS 上限为 2.5×MAX = 50 条目）但**不**剪枝
2. `detectConflict()` 用**完整未剪枝**的入站时钟与现有实体时钟比较
3. 若接受：`limitVectorClockSize()` 在存储前剪枝到 MAX，保留上传客户端，以及（若存在）最新因果全状态作者
4. 剪枝后的时钟存入数据库

### 步骤 3：其他客户端下载

在 `operation-log-store.service.ts`（`mergeRemoteOpClocks`）中：

1. 每条已下载操作的时钟被合并进本地全局时钟
2. 对全状态操作（SYNC_IMPORT/BACKUP_IMPORT/REPAIR），全局时钟被**替换**（而非合并）为导入的时钟，然后其余操作叠加上去合并——导入时钟中不存在的既有条目**可能丢失**
3. 对非全状态下载，合并保留所有既有条目（继承新条目而不丢失既有条目）

### 关键洞见

正常操作**绝不会**在客户端侧剪枝。服务器在比较**之后**、存储**之前**剪枝。这种不对称至关重要——见[第 6 节](#6-冲突检测与解决服务器上传)了解原因。

---

## 5. 剪枝

### 为何存在剪枝

时钟随每个新客户端增长。没有边界时，使用过多设备的用户会有不断增长的时钟。剪枝将时钟限制为 `MAX_VECTOR_CLOCK_SIZE`（20）条目。

### `limitVectorClockSize` 算法

```
Input: clock, preserveClientIds[]
If entries ≤ MAX: return clock unchanged
Otherwise:
  1. Add entries from preserveClientIds first (capped at MAX)
  2. Fill remaining slots with highest-counter entries (sorted descending)
  3. Return clock with exactly MAX entries
```

实现于 `packages/sync-core/src/vector-clock.ts`。客户端侧剪枝由**存储拥有**（#9096）：`OperationLogStoreService.pruneClockForStorage` 组装保留集——当前客户端 + 最新全状态作者——且每一次持久时钟写入都经此路由。在 `src/app` 其他任何地方导入 `limitVectorClockSize` 会失败 lint（`no-restricted-imports`）；`src/app/core/util/vector-clock.ts` 中的包装器（添加日志）仅可由存储导入。

### 何时发生剪枝（穷尽列表）

| 位置                                                                                                                                                                                                                             | 何时                                                                                                             | 保留什么                            |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **服务器** `processOperation()`                                                                                                                                                                                                      | 冲突检测之后、存储之前                                                                         | 上传客户端 + 活跃全状态作者 |
| **服务器** `getOpsSinceWithSeq()`                                                                                                                                                                                                    | 聚合快照向量钟                                                                                | 请求客户端                           |
| **客户端** `OperationLogStoreService` — `calculateRemoteClockMerge`（远程合并 + reducer 检查点，事务内）                                                                                                              | 远程批次之后的持久时钟                                                                               | 当前客户端 + 最新全状态作者   |
| **客户端** `OperationLogStoreService.pruneClockForStorage` — 在 `setVectorClock`、`saveStateCache`、`commitFileSnapshotBaseline` 内；由 `SyncHydrationService` / `ServerMigrationService` 对 SYNC_IMPORT 操作时钟直接调用 | 每一次其他持久时钟写入（快照保存、压缩、hydration 恢复、sync-hydration 基线、导入） | 当前客户端 + 最新全状态作者   |
| **客户端** 调用方（快照、压缩、hydrator、sync-hydration、server-migration）                                                                                                                                                | **从不** — 它们传递原始时钟；存储负责剪枝（lint 强制）                                               | N/A                                         |
| **客户端** 存储内直接时钟写入（`appendWithVectorClockOverwrite`、`runRemoteStateReplacement`、`runDestructiveStateReplacement`、`appendRecoveryOperationAndSnapshot`）                                                      | **从不** — 按设计写入完整、最小或已由服务器剪枝的时钟                                       | N/A                                         |
| **客户端** `RepairOperationService`                                                                                                                                                                                                  | **从不** — REPAIR 发送完整时钟；服务器在冲突检测后剪枝                              | N/A                                         |
| **客户端** 正常操作捕获                                                                                                                                                                                                         | **从不**                                                                                                        | N/A                                         |
| **客户端** `SupersededOperationResolverService`                                                                                                                                                                                      | **从不**（冲突解决）                                                                                  | N/A                                         |

### 剪枝很少发生

在 MAX=20 时，用户需要 21+ 个唯一客户端 ID 才会触发剪枝。两侧都在保留自身 id 的同时保留最新因果全状态作者：服务器在存储上传操作时，客户端在每一个剪枝持久时钟的站点（#9096）。保留该边界边很重要，因为 `classifyOpAgainstSyncImport` 通过恰好一个谓词——`op.vectorClock[importAuthor] >= importCounter`——把导入后另一客户端的操作从过滤中救出，而 `limitVectorClockSize` 绝不会重新发明缺失条目，因此从客户端持久时钟中丢掉的作者会永久从每条后续操作中缺失。其他被剪枝的边仍可能导致一次额外的服务器往返（虚假 CONCURRENT → 客户端解决 → 以 >MAX 时钟重新上传 → GREATER_THAN → 接受）。

---

## 6. 冲突检测与解决（服务器上传）

### 服务器侧流程

1. 服务器查找同一实体的最新操作——**两次分别索引的查找**，一次标量 `findFirst` 加上一次在 `entity_ids` 上的原始 SQL `MATERIALIZED` CTE，取 `serverSeq` 更高者。刻意不是一个合并过滤器；见下文多实体节了解为何那曾导致故障。
2. 用**完整未剪枝**的入站时钟与现有时钟比较
3. 可能结果：
   - `GREATER_THAN` → **接受**（入站操作因果上后于现有）
   - `EQUAL` + 同一客户端 → **接受**（同一操作的重试）
   - `EQUAL` + 不同客户端 → **拒绝**（可疑的时钟复用）
   - `CONCURRENT` → **拒绝**（真冲突）
   - `LESS_THAN` → **拒绝**（已被取代）
4. 若接受：剪枝时钟，然后存储

### 客户端侧解决

当服务器拒绝操作时：

1. 客户端收到带有 `existingClock` 的拒绝
2. `SupersededOperationResolverService.resolveSupersededLocalOps()`：
   - 合并全局时钟 + 所有被取代操作的时钟 + 快照时钟 + 强制下载的额外时钟
   - 调用 `mergeAndIncrementClocks()` — **无客户端侧剪枝！**
   - 用合并后的时钟创建新的 LWW Update 操作
3. 重新上传 → 服务器比较完整合并时钟（现有 MAX+1 或更多条目）→ `GREATER_THAN` → 接受
4. 服务器在存储前剪枝合并时钟

### 关键不变量：服务器必须在比较之后剪枝

若服务器在比较前剪枝，当实体时钟已有 MAX 条目且客户端 ID 不在其中时，将无法构建支配时钟。

**安全网：** `RejectedOpsHandlerService` 按实体跟踪解决尝试。超过 `MAX_CONCURRENT_RESOLUTION_ATTEMPTS`（3）次连续失败后，操作被永久拒绝。

---

## 7. SYNC_IMPORT / BACKUP_IMPORT / REPAIR 处理

### 核心规则：干净石板语义

导入是显式用户动作，将**所有客户端**恢复到特定状态。不知晓导入的操作被**丢弃**：

| 比较     | 含义                                | 动作   |
| -------------- | -------------------------------------- | -------- |
| `GREATER_THAN` | 操作在看到导入之后创建         | **保留** |
| `EQUAL`        | 与导入相同的因果历史          | **保留** |
| `CONCURRENT`   | 操作在不知晓导入时创建 | **丢弃** |
| `LESS_THAN`    | 操作被导入支配              | **丢弃** |

即便来自未知客户端，`CONCURRENT` 操作也会被丢弃。这确保真正的「恢复到时间点」语义。

### 导入时钟如何创建

| 来源                               | 方法                   | 时钟构造                                                                       |
| ------------------------------------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| `BACKUP_IMPORT`（干净石板）        | `BackupService`          | 新时钟 `{newClientId: 1}` — 小，无剪枝问题                                |
| 服务器迁移                     | `ServerMigrationService` | 合并所有本地操作时钟 + 全局时钟 → 递增 → 剪枝到 MAX                      |
| 同步 hydration（冲突解决） | `SyncHydrationService`   | 合并本地时钟 + 状态缓存时钟 + 远程快照时钟 → 递增 → 剪枝到 MAX |
| 自动修复                          | `RepairOperationService` | 取当前全局时钟 → 递增；发送完整未剪枝时钟（服务器剪枝）      |

### 全状态操作跳过服务器冲突检测

在 `detectConflict()` 中，`opType` 为 `SYNC_IMPORT`、`BACKUP_IMPORT` 或 `REPAIR` 的操作立即返回 `{ hasConflict: false }`。这些操作替换整个状态，不操作单个实体。

### 多实体操作与服务器侧冲突检测（issue #8334）

操作可能携带 `entityIds: string[]`（批量 actions：`deleteTasks`、`moveToArchive`、`__updateMultipleTaskSimple`、round-time-spent、task-repeat-cfg/board/issue-provider 批次）。`detectConflict()` 用其所有 `entityIds` 检查**入站**操作。操作一旦存储，也必须按所有实体被**查找**——否则对非首实体的后续过时写入会找不到先前写入者，并被错误接受为无冲突。

为使该对称性成立，`operations` 行存储：

- `entity_id` — 客户端提供的标量。对批量操作，客户端将其设为 `entityIds[0]`（`operation-log.effects.ts`），但**服务器不强制** `entity_id === entityIds[0]`。它是单实体操作与多实体操作第一实体的查找键，也用于重复检测。
- `entity_ids` — **仅多实体操作**的实体集（`text[]` 列；通过 `getStoredEntityIds(op)` 填充，对单实体操作返回 `[]`）。将单实体行排除在此列之外，可使 `GIN(entity_ids)` 索引保持较小，且数组分支查找便宜。

`conflict.ts` 中的查找将请求的实体匹配为标量 `entity_id` **或** `entity_ids` 的成员：

- `detectConflictForEntity`（单个）— **两次分别索引的查找，绝不用一个合并过滤器。** 在 `{ userId, entityType, entityId }` 上按 `server_seq` 排序的标量 `findFirst`（端到端由 `(user_id, entity_type, entity_id, server_seq)` btree 服务），加上在 `entity_ids @> ARRAY[id]` 上取 `MAX(server_seq)` 的原始 SQL `MATERIALIZED` CTE，再用 `(user_id, server_seq)` 唯一键获取胜出行。

  > ⚠️ **不要把这「简化」回一条查询。** 它曾是
  > `where: { OR: [{ entityId }, { entityIds: { has: entityId } }] }` + `orderBy: { serverSeq: 'desc' }`，
  > 并在 2026-07-20 导致全面同步故障——47 个卡住的后端，最长 75 分钟，
  > 61/66 连接被占用。`OR` 跨越两个不同索引，且 GIN 无法提供
  > `server_seq` 排序，因此规划器放弃**两条**索引路径并扫描用户的
  > 历史。当实体没有匹配行时——即新任务的首次操作，最常见的上传——
  > 没有任何东西限制该扫描。Op-log 剪枝**不能**
  > 限制它；本节曾断言该假设，但它是错的。
  >
  > 明显的升级方案也坏了。两次有序的 `LIMIT 1` 查找仍使
  > 数组侧无法在 GIN 上排序。在 40k 行种子上的通用规划测量中，
  > 故障查询、朴素仅数组的 `LIMIT 1`、扁平 `MAX`、Prisma 的 `aggregate({ _max })`
  > 以及去掉 `MATERIALIZED` 的 CTE **全部**读取用户的整个实体类型切片，
  > 而交付形式为 143 blocks / 0 discarded。**816 blocks / 2500 rows
  > discarded** 数字特指故障查询，由
  > `conflict-entity-lookup-plan.pglite.spec.ts` 中的 `CANARY` 用例钉住。其他四个并非无守卫：该
  > 规范从实时 tagged template 重建数组分支，因此去掉 `MATERIALIZED`
  > 或扁平化 `MAX` 会突破 block 预算并失败（经 mutation 验证）。
  > _未_ 钉住的是它们各自的历史 block 计数。
  >
  > 在此用 `SET plan_cache_mode = force_generic_plan` 测量任何变更。Prisma 发送
  > 参数化 prepared statements；在 `auto` 下 Postgres 将前约 5 次执行作为
  > custom 规划，然后比较 generic 成本与平均 custom 成本，并**可能**切换
  > 到 generic 计划——是成本比较，不是自动切换，因此某些语句会无限期停留在
  > custom 计划上。该语句在生产上被观察到变为 generic，而
  > generic 计划看不到参数值。带字面常量的 `EXPLAIN` 又不同，
  > 会让那些坏形状每一个都看起来完美。参见
  > `packages/super-sync-server/tests/conflict-entity-lookup-plan.pglite.spec.ts` 以及
  > `packages/super-sync-server/src/sync/conflict.ts` 中 `detectConflictForEntity` 处的注释。

- `detectConflictForEntities`（多实体操作）— 覆盖两列**并集**的原始 SQL：标量分支（在 `entity_id` btree 上对每个请求 id 的 lateral top-1）`UNION ALL` 数组分支（对每个 id 用 `entity_ids @> ARRAY[id]` 探测 `GIN(entity_ids)` 索引，迁移 `20260613000001`），经 `DISTINCT ON` 去重。

  > ⚠️ 两个分支必须保持**分离**。它们曾是带
  > `entity_ids && ... OR entity_id = ANY(...)` 预过滤的一条查询，且本节曾
  > 声称该预过滤使两个索引都可用。事实相反：`OR` 跨越
  > GIN 与 `(user_id, entity_type, entity_id, server_seq)` btree，因此规划器
  > 放弃两者并切片扫描 btree——一次匹配不到任何内容的 100-id 探测读取并
  > 丢弃用户的整个切片，生产每 5–12 分钟因 `statement_timeout`
  > 取消它（#9503）。与 2026-07-20 故障相同的退化。数组
  > 分支还用匹配的 id 标记每个候选，而非通过 unnest 重新推导，
  > 否则会在宽 `entity_ids` 上二次方扇出。两条
  > 属性由 `tests/batch-conflict-plan.pglite.spec.ts` 钉住。

  > ⚠️ 数组分支**按 id** 探测（`@>`），而非按批次一次（`&&`），且任一
  > 形式都不占优——因此不要根据单一基准「优化」它。`@>` 成本为
  > `probe × (descent + matches)`；`&&` 成本为 `descent + matches × stored width`，因为
  > 它必须 unnest 每个匹配操作的数组才能知道哪些 id 匹配。在
  > PG 16.14 上测量：`&&` 在全新的 100-id 探测上快 20×（1.5M 行时 0.68 ms vs 13.5 ms），
  > 在针对 1000 条宽度 1000 的操作的 2-id 探测上则**慢 75×**（106 ms vs
  > 1.4 ms）——而 2-id 探测是模态多实体操作。交付 `@>` 是因为其
  > 项有界（探测大小分块，descent 仅随索引大小增长），而
  > `matches × width` 不受租户可控的任何东西约束。两种形式的等价性由
  > `tests/array-branch-equivalence.pglite.spec.ts` 钉住；用 Prisma 发送的方式
  > 单独绑定 id 来测量，因为一个数组参数会低估 `@>` 约 25×。

  > ⚠️ 它必须是**并集**，而非互斥的
  > `CASE WHEN cardinality(entity_ids) > 0 THEN entity_ids ELSE ARRAY[entity_id] END`
  > （本节曾文档化该形式）。服务器**不**强制
  > `entity_id === entityIds[0]`，因此多实体操作可携带不属于其自身
  > `entity_ids` 成员的标量（见 `getStoredEntityIds`）。互斥形式在数组非空时
  > 丢掉该标量，使实体对冲突查找不可见——对该实体的后续并发写入被错误接受，
  > 这是**静默数据丢失**。那就是 #8334 bug；发散标量用例是
  > `tests/integration/conflict-detection-sql.integration.spec.ts` 中的决定性测试。

**按设计仅向前：** 迁移 `20260613000000` 之前写入的行有空的 `entity_ids` 数组，因此仅能通过其标量 `entity_id`（= 第一实体）到达——经由上述批量并集的标量分支，或单实体查找的标量分支。（不是经由互斥 `CASE` 形式：那是上方警告中记载的已移除 #8334 bug，不是当前形状。）没有 `UPDATE` 回填。已存储多实体操作的实体 2..n 从未持久化且不可恢复，因此在该实体获得新写入之前对冲突检测仍不可见。该残留有界：客户端侧 LWW 不受影响（客户端持久化完整操作，且 `VectorClockService.getEntityFrontier()` 将每条操作扇出到**每一个**实体），且服务器仅从非加密操作构建权威快照（`replayOpsToState()` 在加密操作上抛出），因此预修复缺口仅可能在非加密自托管服务器上向新客户端呈现过时值。

### `SyncImportFilterService` 算法

实现于 `src/app/op-log/sync/sync-import-filter.service.ts`：

1. **找到最新全状态操作** — 已下载批次中最后一个全状态操作胜出（服务器应用顺序）；否则使用具有最大本地序号的非拒绝本地全状态条目。UUIDv7 ID 是身份，不是因果时钟，因为设备时钟可能回拨。
2. 对批次中每条非全状态操作：
   - 比较 `op.vectorClock` 与导入时钟
   - `GREATER_THAN` 或 `EQUAL` → **保留**
   - `CONCURRENT` + 与导入同一客户端 + 更高计数器 → **保留**（同客户端检查）
   - `CONCURRENT` 对自动 `REPAIR` → **保留并在修复边界之后重放**
   - 否则 → **过滤**

### 同客户端检查

若操作来自创建导入的同一客户端，且计数器更高，则它肯定是导入后操作。客户端无法创建与自身导入并发的操作——计数器单调递增。该检查始终正确且便宜（约 15 行）。

---

## 8. 关键场景（逐步追踪）

### 场景 1：双客户端同步（无冲突）

```
Initial state: Client A and B both know about each other
  A's global clock: {A: 3, B: 2}
  B's global clock: {A: 3, B: 2}

Step 1: A creates a task
  A increments: {A: 4, B: 2}
  Op carries clock: {A: 4, B: 2}
  A's global clock updated to: {A: 4, B: 2}

Step 2: A uploads
  Server compares op clock {A: 4, B: 2} vs latest entity clock (none) → no conflict
  Server stores op (no pruning needed, 2 entries < MAX)

Step 3: B downloads
  B receives op with clock {A: 4, B: 2}
  B merges into global clock: max({A: 3, B: 2}, {A: 4, B: 2}) = {A: 4, B: 2}

Step 4: B creates a task
  B increments: {A: 4, B: 3}
  B's global clock updated to: {A: 4, B: 3}
```

### 场景 2：并发修改（冲突解决）

```
Starting state: Both clients synced
  A's clock: {A: 3, B: 2}    B's clock: {A: 3, B: 2}

Step 1: Both modify the same task offline
  A creates op: {A: 4, B: 2}
  B creates op: {A: 3, B: 3}

Step 2: A uploads first → server accepts (no prior op for this entity)
  Server stores: {A: 4, B: 2}

Step 3: B uploads
  Server compares: {A: 3, B: 3} vs {A: 4, B: 2}
  A=3 < 4 (b greater), B=3 > 2 (a greater) → CONCURRENT → reject
  Server returns existingClock: {A: 4, B: 2}

Step 4: B resolves
  SupersededOperationResolverService merges:
    globalClock={A: 3, B: 3} + existingClock={A: 4, B: 2} + opClock={A: 3, B: 3}
    merged = {A: 4, B: 3}, incremented = {A: 4, B: 4}
  Creates new LWW Update op with clock {A: 4, B: 4}
  NO client-side pruning

Step 5: B re-uploads
  Server compares: {A: 4, B: 4} vs {A: 4, B: 2} → GREATER_THAN → accept
  Server stores (pruned if needed, but only 2 entries here)
```

### 场景 3：带小时钟的 SYNC_IMPORT（干净石板）

```
Step 1: Client A does BACKUP_IMPORT (full data restore)
  Creates SYNC_IMPORT op with clock: {A: 1}
  Uploads to server

Step 2: Client B has been working offline
  If B never saw A's state: B's clock: {B: 5}
  Compare: {B: 5} vs {A: 1} → CONCURRENT → filtered ✓

  If B had previously synced with A: B's clock: {A: 3, B: 5}
  Compare: {A: 3, B: 5} vs {A: 1} → GREATER_THAN → kept ✓
  (B's ops were created with knowledge beyond the import point)
```

---

## 9. 不变量

系统正确性必须成立的规则。用它们验证实现与测试。

1. **正常操作携带完整（未剪枝）向量钟。** `operation-log.effects.ts` 中无剪枝。

2. **服务器在比较之后、存储之前剪枝。** `processOperation()` 在 `detectConflict()` 成功后调用 `limitVectorClockSize()`。

3. **客户端在冲突解决期间不剪枝。** `SupersededOperationResolverService` 发送完整合并时钟；服务器在接受后剪枝。

4. **`compareVectorClocks` 在客户端与服务器上产生相同结果。** 两者都从 `@sp/sync-core` 导入。客户端包装器仅添加空值处理。

5. **全状态操作在服务器上跳过冲突检测。** `detectConflict()` 对 SYNC_IMPORT、BACKUP_IMPORT 与 REPAIR 返回 `{ hasConflict: false }`。

6. **对 SYNC_IMPORT，CONCURRENT 操作被过滤（而非保留）** — 除非被识别为遗留剪枝伪影或同客户端操作。干净石板语义——这是显式、正确的行为。

7. **远程 SYNC_IMPORT 时全局时钟被替换（而非合并）。** `mergeRemoteOpClocks()` 以导入时钟为基，再合并其余操作。这防止时钟膨胀。

8. **DoS 上限不是剪枝。** `sanitizeVectorClock()` 完全拒绝 > 2.5×MAX（50）条目的时钟——不会把它们剪小。这是校验门，不是尺寸缩减。

---

## 10. 关键文件参考

| 概念                                                     | 文件                                                                      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 核心算法（比较、合并、剪枝）                     | `packages/sync-core/src/vector-clock.ts`                                     |
| 既有 shared-schema 导入的兼容性再导出  | （已移除 — 导入现直接面向 `@sp/sync-core`）                      |
| 客户端包装器（空值处理、日志、校验）        | `src/app/core/util/vector-clock.ts`                                          |
| 全局时钟管理、实体前沿                    | `src/app/op-log/sync/vector-clock.service.ts`                                |
| 操作捕获（无剪枝、原子时钟更新）         | `src/app/op-log/capture/operation-log.effects.ts`                            |
| 时钟持久化                                           | `src/app/op-log/persistence/operation-log-store.service.ts`                  |
| 导入过滤 + 同客户端检查                        | `src/app/op-log/sync/sync-import-filter.service.ts`                          |
| 冲突解决（无剪枝、合并时钟）             | `src/app/op-log/sync/superseded-operation-resolver.service.ts`               |
| 冲突解决（LWW 逻辑、`mergeAndIncrementClocks`）  | `src/app/op-log/sync/conflict-resolution.service.ts`                         |
| SYNC_IMPORT 创建（sync hydration）                       | `src/app/op-log/persistence/sync-hydration.service.ts`                       |
| SYNC_IMPORT 创建（服务器迁移）                     | `src/app/op-log/sync/server-migration.service.ts`                            |
| REPAIR 创建                                             | `src/app/op-log/validation/repair-operation.service.ts`                      |
| 服务器：冲突检测 + 比较后剪枝         | `packages/super-sync-server/src/sync/sync.service.ts`                        |
| 服务器：DoS 上限（清理，无剪枝）                      | `packages/super-sync-server/src/sync/services/validation.service.ts`         |
| 服务器：下载优化期间的快照时钟剪枝 | `packages/super-sync-server/src/sync/services/operation-download.service.ts` |

---

## 11. 历史与理由（为何剪枝是现在这样）

当前剪枝设计背后的决策历史（先前在单独的研究文档中，现仅在 git 中）。对任何更改 `MAX_VECTOR_CLOCK_SIZE` 或剪枝顺序的人，这是承重上下文。

### 先比较再剪枝——以及证明这一点的 bug

**绝不要在用于比较之前剪枝向量钟。** 剪枝移除信息：缺失条目是模糊的——「从未知道该客户端」对「条目被剪枝」——因此预剪枝比较返回 CONCURRENT 而非 EQUAL/因果。两次独立事件确立了这一点：

- **Riak #613：** 比较前剪枝导致「兄弟爆炸」——对象累积数百个永远无法解决的兄弟，因为剪枝后的时钟总是比较为 CONCURRENT。
- **Super Productivity（2026 年 2 月）：** 在 `MAX = 10` 时，服务器比较前剪枝导致无限拒绝循环——客户端合并所有时钟 + 自身 ID（11 条目），服务器剪到 10，非共享键强制 CONCURRENT，服务器拒绝，客户端再合并，循环重复。

两个系统中的修复：比较**完整未剪枝**时钟，然后**仅在存储前**剪枝。这是 §6 与 §9 中的不变量。

### 为何 MAX = 20（10 → 30 → 20 的演变）

对 2026 年 2 月循环的原始防御是 4 层方案（宽泛的受保护客户端跟踪、感知剪枝的比较、`isLikelyPruningArtifact` 启发式、同客户端检查）——症状治疗。根因是 `MAX = 10` 太小，使剪枝频繁并与 SYNC_IMPORT 不良交互。

提交 `d70f18a94d` 将 `MAX` 从 10 提高到 30（后来减到 20——20 条目时钟约 333 字节，可忽略），并移除了宽泛跟踪与比较启发式。服务器现有一个狭窄的仅存储例外：保留最新因果全状态作者，使导入后操作保留该边界边。`isLikelyPruningArtifact` 被丢弃（已知假阳性，在 MAX = 20 时不必要）。仅剩**同客户端检查**——在冲突比较中始终数学正确（单调计数器是决定性的）且独立于 MAX。在 MAX = 20 时，剪枝需要 **21+ 个不同客户端 ID**，对个人生产力应用极罕见，因此剪枝路径实际上休眠（见 §5「剪枝很少发生」）。

### 未来选项（仅当服务器成为协调者时）

在服务器权威模型中，可通过 **Dotted Version Vectors**（绑定到服务器 vnode，而非设备）、**有界可回收客户端 ID**（需要注册/退役协议）或**周期性稳定切点 GC**（需要全对全时钟报告）在不剪枝的情况下限制时钟增长。无一适用于当前的哑中继模型。

### 未来选项：感知陈旧度的驱逐（issue #9105 — 适用于哑中继模型）

今日剪枝驱逐**最低计数器**条目，但低计数器与_重要性_相关（新鲜导入作者计数器为 1），而非与_死亡_相关——这是 #9089/#9096 保留集 bug 背后的启发式。Issue #9105 跟踪根因：客户端 ID 按安装/配置文件铸造且几乎从不退役，因此时钟只向 MAX 增长。#9105 上的决定是**搁置**修复——在 #9089/#9102 之后最坏情况是 §5 的良性额外往返——并在此记录约定方向。

若剪枝在实践中不再罕见，改为驱逐**最陈旧**条目而非最低计数器条目。与上方协调者选项不同，这适配哑中继模型且无需线路格式变更：

- **服务器：** `sync_devices` 表已按 `(userId, clientId)` 存储 `lastSeenAt`，在每次上传时更新——而上传是创建时钟条目的唯一路径。每日任务已 GC 超过 `retentionMs`（45 天）未见的行，因此登记表中的缺失可读为「最陈旧」。
- **客户端（所有提供者）：** 保持小型持久的 `clientId → last-merged-op time` 映射，在合并远程时钟处更新（`mergeRemoteOpClocks`）——每条合并操作携带其作者 ID。无需服务器支持，因此也覆盖 WebDAV / LocalFile / Dropbox。

安全概况与今日剪枝相同（条目无论如何都会被丢弃；返回的被丢弃 ID 最多付出 §5 的额外往返），但受害者选择严格更好：最近见过的 ID——例如新鲜导入作者——按定义存活，使 #9089/#9096 的保留集不变量成为_涌现_而非在每个剪枝站点手工维护（显式保留集仍作为双重保险）。陈旧度知识因节点而异，因此节点可能驱逐不同受害者；这增加时钟不对称但不增加新的失败类别——比较将缺失键视为零，且客户端已用不同保留集剪枝。

今日支持的 GC 是**全状态导入**：时钟重置仅保留 `{import author, self}`（§7），且每会话一次的剪枝 snack 引导用户使用它（先同步所有设备——导入故意丢弃并发操作，见 `SyncImportFilterService`）。

**重访触发：** 客户端剪枝将 `prunedIds` / `survivingIds` WARN 日志写入可导出的日志历史。若真实 bug 报告中出现剪枝警告——尤其是驱逐_活跃_ ID 的——将此项从搁置提升为已排期。
