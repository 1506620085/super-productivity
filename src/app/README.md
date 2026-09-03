# `src/app` — 分层地图

事物所在位置以及依赖箭头指向何方。这是一张**路由表，而非规范**：代码、测试与 [`ARCHITECTURE-DECISIONS.md`](../../ARCHITECTURE-DECISIONS.md) 优先于此处任何文字。深入了解同步子系统，请从 [`docs/sync-and-op-log/README.md`](../../docs/sync-and-op-log/README.md) 开始。

## 一个用户意图，端到端

操作捕获是**元 reducer 注册表的第 1 阶段——最外层包装**，因此它在任何 reducer 变更状态_之前_读取状态。它不是 reducer 之后的步骤；它包住它们。

```
             persistent NgRx action
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
  root-store/meta                op-log/capture
  phases 2 … 8                   (phase 1, outermost:
  shared/domain                   reads pre-mutation state)
  meta-reducers                         │
        │                               ▼
        ▼                        op-log/persistence
  feature reducers               OperationLogStoreService
        │                               │
        ▼                    OP_LOG_DB_ADAPTER_FACTORY
  live projection                ┌──────┴──────┐
  (what the UI renders)          ▼             ▼
                             IndexedDB      SQLite
                                      │
                                      ▼
                    op-log/sync → op-log/sync-providers
                          (SuperSync | file-based)
```

**远程**操作以相反方向运行：`op-log/apply` 将其转换回 action，并通过相同的 reducer 重放。这就是为什么 effect 必须注入 `LOCAL_ACTIONS` 而非 `Actions`——否则重放的远程变更会再次触发本地副作用（同步规则 1）。

## 从这里开始

| 你想要…                                          | 从这里开始                                                                                                                                                        |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 更改某一功能的行为                         | `features/<name>/` — `tasks/` 是热核心                                                                                                                   |
| 更改跨越多种实体类型的状态       | `root-store/meta/task-shared-meta-reducers/` — 一次 reducer 遍历 = 一次操作（同步规则 3）                                                                          |
| 理解或重排 meta-reducer                   | [`root-store/meta/meta-reducer-registry.ts`](root-store/meta/meta-reducer-registry.ts) — 记录阶段 1、2、2.5、3、3.5、4–8，并在开发模式下违反时抛错 |
| 了解变更如何变得持久且可同步        | `op-log/capture/`，然后 `op-log/persistence/operation-log-store.service.ts`                                                                                     |
| 追踪远程变更如何被应用                  | `op-log/apply/operation-applier.service.ts`                                                                                                                     |
| 更改字节实际落地的位置                      | `op-log/persistence/` — `indexed-db-op-log-adapter.ts` / `sqlite-op-log-adapter.ts`，二者都在 `op-log-db-adapter.token.ts` 之后                                   |
| 处理同步传输、冲突或某个提供者      | `op-log/sync/`、`op-log/sync-providers/`，以及 `packages/sync-core` 与 `packages/sync-providers`                                                               |
| 更改导入/导出、备份或同步设置 UI    | `imex/`                                                                                                                                                         |
| 添加可复用、与功能无关的小组件               | `ui/`                                                                                                                                                           |
| 更改应用外壳（页头、导航、布局、快捷键）    | `core-ui/`                                                                                                                                                      |
| 添加横切服务（平台、主题、通知） | `core/`                                                                                                                                                         |
| 添加路由或顶层屏幕                     | `routes/`、`pages/`、`config/`                                                                                                                                  |
| 处理插件 API                                | `plugins/` 以及 `packages/plugin-api`                                                                                                                           |
| 添加纯辅助函数                                     | `util/`                                                                                                                                                         |

## 箭头指向何方

```
core-ui/ · pages/ · routes/     the shell — composes features
            │
            ▼
        features/               domain logic
            │
            ▼
  core/ · ui/ · util/           shared services, widgets, helpers
```

**已强制：** `core/`、`ui/` 或 `util/` 中的任何内容都不得从 `features/` 导入，无论静态还是动态 `import()`。规则及其理由见 [`eslint.config.js`](../../eslint.config.js)（搜索 `FEATURE_LAYER_FENCE`）。

**「已强制」意味着什么、不意味着什么。** 新违规会在这三个目录中处处导致 CI 失败，**但**该配置块中列出的文件除外，它们只发出警告。祖父条款按文件键控，因此已列出的文件可以继续累积更多 feature 导入而不失败。该列表只能缩小——目前为 36，已从 38 降下来。

**未强制，且目前不成立——不要把图示当成保证。** 底行放在一个框里是因为它们彼此纠缠，而非因为它们是对等层：

- `core/` 与 `ui/` 相互依赖：22 个文件 `ui → core`，4 个文件 `core → ui`。
- `util/` 不是叶子：约 29 个非规格文件向上导入（19 → `core/`，4 → `op-log/`，1 → `ui/`，外加现已隔离的 5 个 `→ features/`）。
- `core/` 在 2 个文件中向上到达 `core-ui/`，在 7 个文件中到达 `op-log/`。

## 遗留

`pfapi/` 是死代码，不是存活层。它是 pre-op-log 同步系统留下的四个已编译 `.js` 文件，其自身页头写着 `LEGACY CODE — do not modify`，且**没有任何东西导入它**——`.ts` 源中每一处 `pfapi` 提及都是注释或描述 v16.x 客户端写入的遗留磁盘 `__meta_` 格式的字符串。它甚至无法加载（`api/index.js` 需要树中不存在的模块），并被排除在 TS 构建之外，因此不会出现在任何打包产物中。尽管名称如此，它**不是**当前持久化层；当前层是 `op-log/persistence/`。

注意 `core/persistence/legacy-pf-db.service.ts` 与它无关——该服务直接读取遗留 `pf` IndexedDB，是存活的迁移代码。
