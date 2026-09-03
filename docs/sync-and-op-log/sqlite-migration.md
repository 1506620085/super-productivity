# 原生 SQLite 操作日志迁移

**状态（2026 年 7 月）：** 基础已实现并在 CI 中测试；原生上线尚未接线。IndexedDB 仍是每个平台上的实际操作日志后端。

本文档是与 #7892 和 #7931 相关的原生 SQLite 工作的唯一状态、理由与上线契约。

## 目标与范围

在 Capacitor Android 上，关键操作日志状态目前位于 WebView IndexedDB（`SUP_OPS`）中，若 WebView 存储被驱逐则可能丢失。目标是将该数据库移到原生 iOS/Android 上的应用私有 SQLite，同时保留操作日志的原子性与恢复行为。

这不是全局存储重写：

- web/PWA 仍使用 IndexedDB；
- Electron 保留其当前持久化与轮换备份；
- 主题、凭证、OAuth 及其他小型 IndexedDB 数据库不在 #7892 关键数据范围内；以及
- 在真实设备上证明迁移与回滚之前，任何原生后端都不得成为默认。

来自 #7924/#7925 的移动本地备份保障已处于活跃状态。它们缩小了爆炸半径，但不能替代耐用的应用私有存储。

## 当前实现

### 已落地、未激活的基础

- `OpLogDbAdapter` / `OpLogTx` 定义后端中立的持久化与事务契约；`OP_LOG_DB_SCHEMA` 描述 store 与索引。
- `IndexedDbOpLogAdapter` 是生产后端。`OperationLogStoreService` 与 `ArchiveStoreService` 都通过 `OP_LOG_DB_ADAPTER_FACTORY` 获取适配器。
- Store 初始化同时支持采纳连接的 IndexedDB 适配器与自我管理的适配器：后者调用 `adapter.init()` 且不打开 WebView 数据库。
- `SqliteOpLogAdapter` 针对最小的 `SqliteDb` 接口实现该端口。它由内存翻译测试、真实的 `sql.js` 契约通过，以及 store 级集成通过覆盖。
- 共享同一物理 `SqliteDb` 的独立适配器也共享按该连接键控的 FIFO 队列，防止重叠的 `BEGIN` 语句以及语句泄漏到另一事务。
- `migrateOpLogBackend()` 将所有操作日志 store 复制到空的目标事务中，并在提交前验证操作计数、最后序列与向量时钟。它在 CI 中针对真实 IndexedDB 到 `sql.js` 得到验证。
- `local-rules/no-adapter-in-tx` 强制 SQLite 重入规则：事务回调中的代码必须使用其 `tx` 句柄，而不是在自身事务之后再入队另一次适配器调用。

### 未接线

- 项目尚未包含原生 SQLite 插件或原生 `SqliteDb` 包装。
- `OP_LOG_DB_ADAPTER_FACTORY` 在各处仍返回 `IndexedDbOpLogAdapter`。
- `migrateOpLogBackend()` 没有启动触发器或完成标记。
- 没有任何平台有 SQLite 功能标志或回退选择。
- 若 `SqliteDb.run()` 省略 `lastId`，`SqliteOpLogAdapter` 仍回退到序列 `0`；原生上线必须用正整数断言替换该无效回退。
- Capacitor 桥接、原生 SQLite 构建、生命周期行为与批量写入性能尚未在设备上验证。

已落地的 SQLite 基础不会改变当前用户的运行时存储行为。

## 不得更改的存储契约

SQLite 后端必须保留与 IndexedDB 相同的可观察保证：

1. `ops.seq` 是正的、单调分配的主键，且 `op.id` 唯一。
2. `appendWithVectorClockOverwrite()` 原子地写入操作与向量时钟。
3. 破坏性状态替换原子地写入操作、状态缓存、向量时钟、客户端 ID 与归档状态。
4. 仅当事务回调 resolve 时才提交，并在任何抛出/拒绝的操作上回滚。
5. 同一物理 SQLite 连接上的两个适配器实例彼此串行化。
6. 事务回调只使用所提供的 `OpLogTx`。重新进入公共适配器方法会等待在事务自身的队列槽之后。
7. SQLite 错误保留调用方依赖的错误语义，包括重复操作与配额失败。

原生包装必须从同一次写入返回插入的行 ID。缺失、零、非整数或另行查询的 ID 必须在成为操作序列之前失败。

## 迁移安全契约

首次原生上线必须将后端迁移视为高风险状态替换，而非尽力而为的复制：

1. 将 SQLite 选择门控在默认关闭的仅原生功能标志之后。
2. 静默操作捕获以及每一个能变更 `SUP_OPS` 的写入者。
3. 仅在 SQLite 目标为空且遗留 IndexedDB 源存在时运行。
4. 复制每一个 store，同时保留主键，包括操作序列中的空隙。
5. 在目标事务提交前至少验证操作计数、最后序列与向量时钟。任何不匹配都回滚。
6. 仅在经验证的提交之后写入完成标记。
7. 至少保留一个已发布版本期间不动 IndexedDB 源，并提供显式回退路径。
8. 绝不合并且两个非空后端。

`migrateOpLogBackend()` 实现复制与提交前验证核心。启动静默、检测、标记/回退策略与生命周期处理仍是调用方的责任。

## 剩余上线门槛

按顺序完成这些：

1. 添加原生 SQLite 依赖，以及覆盖单个应用私有数据库连接的薄 `SqliteDb` 包装。
2. 在 Android 与 iOS 上验证插入 ID、事务/错误映射、应用暂停/恢复、突然终止，以及有代表性的批量写入。
3. 为两个持久化服务提供覆盖同一物理连接的独立适配器。
4. 添加仅原生、默认关闭的提供方选择。
5. 接线启动检测、静默、`migrateOpLogBackend()`、完成标记、保留源回退，以及中断迁移恢复。
6. 用该标志 dogfood，然后进行分阶段原生上线。仅在保留源窗口与回滚证据完成后，才移除 IndexedDB 回退与过渡性的 `adoptConnection` 桥接。

不要将这些门槛的一部分扩展到非关键 IndexedDB 数据库的迁移。

## 可执行所有者与验证

| 关注点                                    | 所有者                                                     |
| ------------------------------------------ | --------------------------------------------------------- |
| 持久化端口与事务规则     | `src/app/op-log/persistence/op-log-db-adapter.ts`         |
| 后端 DI 默认                         | `src/app/op-log/persistence/op-log-db-adapter.token.ts`   |
| IndexedDB 后端                          | `src/app/op-log/persistence/indexed-db-op-log-adapter.ts` |
| SQLite 后端与共享连接队列 | `src/app/op-log/persistence/sqlite-op-log-adapter.ts`     |
| 后端迁移核心                     | `src/app/op-log/persistence/op-log-backend-migration.ts`  |
| Schema                                     | `src/app/op-log/persistence/op-log-db-schema.ts`          |

聚焦的 CI 检查：

```bash
npm run test:file src/app/op-log/persistence/sqlite-op-log-adapter.spec.ts
npm run test:file src/app/op-log/persistence/op-log-backend-migration.spec.ts
npm run test:file src/app/op-log/testing/integration/remote-apply-store-port.integration.spec.ts
```

CI 证明适配器与 SQLite 引擎语义，而非 Capacitor 桥接或设备生命周期。上线仍被阻塞，直到上述设备上门槛可复现。
