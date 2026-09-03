# AGENTS.md

本仓库中 AI Agent 的工作指引。Super Productivity 是基于 Angular + Electron + Capacitor 的待办与时间追踪应用。

## 仓库地图

- `src/app/features/` — 功能模块（tasks、planner、project、schedule、boards 等）；`tasks/` 是热点核心
- `src/app/root-store/` — NgRx 根 store；`meta/` 存放跨实体的 meta-reducers
- `src/app/op-log/` — operation-log 同步流水线（捕获、应用、持久化、校验）
- `src/app/pfapi/` — 底层持久化层（model/database controllers）
- `src/app/imex/` — 导入/导出与同步配置 UI
- `src/app/core/`、`core-ui/`、`ui/` — 核心服务与共享 UI 构建块；`util/` — 纯函数辅助工具
- `packages/` — workspace 包：`sync-core` + `sync-providers`（共享同步逻辑）、`shared-schema`、`super-sync-server`、`plugin-api` + `plugin-dev`
- `electron/` — Electron 主进程（测试为 `*.test.cjs`）；`android/` + `ios/` — Capacitor 壳
- `e2e/` — Playwright 套件（见 [`e2e/CLAUDE.md`](e2e/CLAUDE.md)）

## 产品原则

来自项目宣言（_Deep Work, Your Way_），只保留会影响构建决策的部分——每个功能都要权衡；当需求与原则冲突时，应提出更精简的路径：

- **避免功能膨胀：** 优先用能解决真实问题的最小改动。新 UI、设置项和同步面都是永久成本，因此先扩展已有构建块再新增，且功能只有在让用户更_快_（而非更忙）时才应上线。当范围超出问题时，提出更精简的方案，而不是默默做更大的方案——最终仍由用户决定。范围护栏：这是个人深度工作工具，不是团队管理或报表产品。
- **少噪音、多深度：** 拒绝_持续_告警、虚荣仪表盘、连续打卡与多巴胺循环。可选提醒与通知是应用核心，但任何抢注意力的东西默认关闭并保持安静（追求心流，而非摩擦）。
- **适应，而非强加：** 人们规划、追踪与复盘的方式不同，因此新行为应作为构建块交付。优先一个平静的默认，而不是新开关；仅当真实工作流确实分叉时才加设置，绝不为回避默认决策而加开关（不做 → 平静默认 → 可选设置）。
- **隐私与离线优先：** 无分析、追踪或遥测（见项目规则 → 隐私）。核心任务与时间追踪必须可完全离线使用；同步与在线集成是可选层，应优雅降级，绝非前置条件。

## 按任务必读

- 样式改动 → [`docs/styling-guide.md`](docs/styling-guide.md)
- 面向用户的功能改动 → [`docs/documentation-guide.md`](docs/documentation-guide.md)
- 同步、op-log、向量钟 → [`docs/sync-and-op-log/`](docs/sync-and-op-log/)
- 触及同步状态的 effects/reducers/批量 dispatch → [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md)
- E2E 测试 → [`e2e/CLAUDE.md`](e2e/CLAUDE.md)
- 关键决策 → [`ARCHITECTURE-DECISIONS.md`](ARCHITECTURE-DECISIONS.md)
- 评审功能或 PR → [`docs/feature-review-guide.md`](docs/feature-review-guide.md)
- 判断同步 Bug 是否真实 / 严重程度 → [`docs/sync-and-op-log/sync-severity-triage.md`](docs/sync-and-op-log/sync-severity-triage.md)

## 核心命令

**修改的每个 `.ts` 或 `.scss` 文件，在报告完成前务必运行 `npm run checkFile <filepath>`。**

```bash
npm run checkFile <filepath>   # prettier + 单文件 lint
npm run prettier               # 多文件格式化
npm run lint                   # 多文件 lint
npm test                       # 全部单元测试（Jasmine/Karma，.spec.ts 与源码同目录）
npm run test:file <filepath>   # 单个 spec
npm run test:electron          # 主进程测试 — `electron/*.test.cjs`，不是 .spec.ts
                               # （tsconfig.electron.json 排除了 *.spec.ts，因此
                               #  放在 electron/ 下的 spec 会静默永不运行）
npm run e2e                    # 全部 E2E（Playwright，较慢）
npm run e2e:file <path> -- --retries=0   # 单个 E2E（约 20s/用例）；加 --grep "name" 跑单个测试
npm start                      # Electron 开发
ng serve                       # Web 开发（或 npm run startFrontend）
npm run dist                   # 生产构建（本地可用全部平台）
```

**通过 GitHub Actions 运行完整的 SuperSync 与 WebDAV E2E 套件：** 为你的分支手动触发 [`E2E Tests (Scheduled)`](.github/workflows/e2e-scheduled.yml)。应优先于本地跑完整套件；该 workflow 提供专用的 WebDAV 与分片 SuperSync 任务。可选的 `grep` 输入仅过滤 SuperSync 任务。

本地 SuperSync E2E（docker-compose）与完整 E2E 参考见 [`e2e/CLAUDE.md`](e2e/CLAUDE.md)。

## 项目规则

- **翻译：** UI 文案走 `T` / `TranslateService`。只改 `en.json`；绝不要改其他语言文件。
- **隐私：** 无分析或追踪——用户数据保持本地，除非明确同步。
- **依赖：** PR 不得向根项目的 `dependencies` 或 `devDependencies` 新增包；改用平台 API、已有包或仓库内小实现。单个插件作用域内的依赖在必要且隔离于该插件时允许。
- **Electron：** 使用 Electron 专用 API 前检查 `IS_ELECTRON`。
- **模板：** 纯 HTML，CSS/类尽量少，谨慎使用 Angular Material。见 [`docs/styling-guide.md`](docs/styling-guide.md)。
- **样式评审：** 不要为一次性场景在本地重写 Angular Material 或共享 `src/app/ui/` 组件样式。包括通过 `.mat-*`、`.mdc-*`、`button[mat-*]` 或组件内部结构在本地 SCSS 中覆盖按钮样式。优先使用已有 inputs/classes/tokens；若必须有变体，做成可复用或加入共享样式层。
- **严格 TypeScript：** 禁止 `any`（真正未知时用 `unknown`）。
- **状态：** 绝不就地修改 NgRx 状态——在 reducers 中返回新对象。优先 Signals 而非 Observables。
- **测试：** 为新服务与状态逻辑添加单元测试。
- **服务体积上限：** 任何服务不得超过 1200 行（物理行——空行与注释也算），由 `max-lines` 对 `**/*.service.ts` lint 强制执行；spec 豁免。越过上限前按职责拆分——抽出协作者、把纯逻辑移到 utils 或 `packages/`——且绝不可继续膨胀。`eslint.config.js` 中已祖父化为警告的既有违规是要还的债，不是继续加行的许可证：该列表只能缩小，不能扩大。
- **Agent 控制文件：** 除非用户在当前任务中明确要求，否则绝不修改 `AGENTS.md`、`CLAUDE.md`、`.agents/**` 或 `.codex/**`。此类改动应与产品/代码改动隔离到独立提交或 PR，并说明如何改变未来 Agent 行为。向本文件添加来自事故的规则时，只保留不变量 + 强制手段 + issue/文档指针，叙述放到 `docs/`——本文件必须保持可扫读——并给所引统计标注日期（「测于 YYYY-MM」）。
- **是否值得存在？** 对新功能，首要评审问题是它是否该存在——不是 diff 是否正确。增加的复杂度是永久的，因此举证责任在改动一方；一个正确、测得很好却不值得存在的实现仍应拒绝。把所述动机当作待验证主张，绝不当作可直接接受的上下文 → [`docs/feature-review-guide.md`](docs/feature-review-guide.md)。
- **代码评审：** 权衡改动引入的长期成本——维护负担、难逆转选择（数据形态、公共/插件 API、同步格式）、被锁定的依赖、仅在规模或跨同步客户端时才暴露的坑——而不只看眼前 diff 是否正确 → [`docs/feature-review-guide.md`](docs/feature-review-guide.md)。
- **任务组件是热点路径：** 对 `src/app/features/tasks/task/task.component.*` 的每次改动（在长可滚动列表中每个任务渲染一次）必须复查负面性能影响——避免模板中的函数/getter 调用、额外变更检测与未清理的订阅；用大型任务列表验证。

## 同步正确性规则

多数与状态相关的 PR 都会触及。编辑前请阅读链接源/文档了解完整理由。规则 1–3 与 6 是同一不变量——_一次用户意图 = 一个 op；重放/远程 op 不得再次触发 effects_——完整说明见 [`docs/sync-and-op-log/contributor-sync-model.md`](docs/sync-and-op-log/contributor-sync-model.md)。

**对同步系统的每次改动都是高风险：** 细微 Bug 可能在多设备间静默损坏或丢失用户数据，且难以恢复。仔细检查每次改动的正确性与可能失败模式（重放确定性、并发/远程编辑、向量钟冲突），并在报告完成前点明风险。

**判断同步 Bug 严重程度**（在你称之为低风险之前）：`master` 会交付给真实用户——Play 内测轨道、Snap `edge` 与 `supersync:latest` 都会从每次推送自动发布。切勿从日期或最新 tag 推断「已发布」；用 `git tag --contains` 证明。未复现的发现不等于假阴性。→ [`docs/sync-and-op-log/sync-severity-triage.md`](docs/sync-and-op-log/sync-severity-triage.md)。

**从可复现问题出发：** 对同步系统的任何改动必须以可复现失败开始——失败的测试或针对真实数据形态（fixture 或已播种 DB 状态）的脚本化 E2E 复现，而不是被 mock 的接缝。没有观察到端到端失败就加 hardening，是同步层堆积过度防御复杂度的来源；若无法先复现问题，应质疑改动，而不是堆守卫。

1. **Effects 注入 `LOCAL_ACTIONS`**，绝不注入 `Actions`（仅 op-log 捕获 effect 使用 `ALL_ACTIONS`；远程归档副作用 → `ArchiveOperationHandler`，不是 `ALL_ACTIONS`）。Lint 强制（`no-actions-in-effects`）。→ [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md)，`src/app/util/local-actions.token.ts`。
2. **优先基于 action 的 effects**；基于 selector 的 effect 需要 `skipDuringSyncWindow()`。Lint 强制（`require-hydration-guard`）。→ [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md)。
3. **多实体变更 = meta-reducer**，不是 effect 扇出（一次 reducer 遍历 = 一个 op）。→ [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md)，`src/app/root-store/meta/task-shared-meta-reducers/`。
4. **逻辑时钟：** 「今天是哪天？」通过 `DateService`（`getLogicalTodayDate`、`isToday`、`todayStr`）。纯 reducers/selectors 以参数接收 `startOfNextDayDiffMs`，并用 `isTodayWithOffset` 以保证重放确定性。原始 `DateService.startOfNextDayDiff` 为 `private`；在服务边界使用 `getStartOfNextDayDiffMs()`。
5. **`TODAY_TAG`（`'TODAY'`）是虚拟的** — 绝不加入 `task.tagIds`；成员关系来自 `task.dueWithTime` 或 `task.dueDay`。`TODAY_TAG.taskIds` 仅存储排序。→ `ARCHITECTURE-DECISIONS.md` Decision #2。
6. **批量 dispatch 循环：** 循环后 `await new Promise(r => setTimeout(r, 0))`（否则 50+ 次快速 dispatch 会丢状态）。→ [contributor-sync-model.md](docs/sync-and-op-log/contributor-sync-model.md)，`OperationApplierService.applyOperations()`。
7. **`SYNC_IMPORT` / `BACKUP_IMPORT`** 会替换状态并有意丢弃并发 ops（按向量钟为 CONCURRENT 或 LESS_THAN）——这是设计，不是 Bug。→ `SyncImportFilterService`。
8. **向量钟：** `MAX_VECTOR_CLOCK_SIZE = 20`。服务器在冲突检测之后、存储之前裁剪。→ `docs/sync-and-op-log/vector-clocks.md`。
9. **日志：** `Log.log({ id: task.id })`，绝不 `Log.log(task)` 或 `Log.log(title)` — 日志历史可导出，绝不记录用户内容。
10. **Schema 升版从不保护已发布机群，近乎不可逆，即便安全也不免费——默认不要升 `CURRENT_SCHEMA_VERSION`。** 新 op 语义必须在旧客户端上优雅降级（`LwwUpdatePayload` 信封 / 惰性标记模式）。旧客户端会误用的改动不能仅靠升版交付；旧客户端可容忍的改动根本不应靠升版交付。→ `packages/shared-schema/src/schema-version.ts`，规范性策略见 [operation-log-architecture.md](docs/sync-and-op-log/operation-log-architecture.md) §A.7.11 "Bump Policy"。
11. **持久化模型上的新 REQUIRED 字段会破坏每一个既有安装——类型写成可选（`?`）并加运行时默认值。** 用户磁盘上已有数据缺少该字段，typia 在 hydration 时会拒绝；TypeScript 只守护_新_数据，因此构建通过而每个既有安装校验失败，且失败会潜伏到无关升版把旧数据拖进迁移路径。**不要假设存在自愈。** 由 `src/app/op-log/validation/frozen-state.spec.ts` 守护——若失败，修模型，绝不修 fixture。→ 完整分析：[persisted-model-fields.md](docs/sync-and-op-log/persisted-model-fields.md)，#9125，#9124。

## 反模式

| 避免                                                                       | 改为这样做                                 |
| -------------------------------------------------------------------------- | ------------------------------------------ |
| `any` 类型                                                                 | 正确类型；真正未知时用 `unknown`           |
| 直接访问 DOM                                                               | Angular 绑定、`viewChild()`                |
| 在构造函数中产生副作用                                                     | `async` pipe 或 `toSignal`                 |
| 订阅却不清理                                                               | `takeUntilDestroyed()` 或 async pipe       |
| 新代码使用 `NgModules`                                                     | standalone components                      |
| 重新声明 Material 主题样式                                                 | 使用已有主题变量                           |
| 一次性 `.mat-*`、`.mdc-*`、`button[mat-*]` 或共享组件覆盖                  | 可复用 inputs、tokens 或共享样式           |
