# 操作日志与同步文档

操作日志（Operation Log）是 SuperSync 与文件同步提供方的**唯一客户端同步管线**。持久化的 NgRx action 会更新实时投影，并被捕获为耐用操作；重启时使用经结构筛查的快照，再加上保留的操作尾部。向量时钟用于检测因果顺序与并发编辑。

```
                    Persistent NgRx action
                     ┌────────┴────────┐
                     ▼                 ▼
               NgRx reducers     operation capture
                     │                 │
                     ▼                 ▼
            runtime projection      SUP_OPS
                                  (ops, clocks,
                               checkpoints, snapshot)
                                           │
                                           ▼
                                    Sync Providers
                       ┌───────────────────┴──────────────────┐
                       ▼                                      ▼
                   SuperSync                       File providers
               (ordered op API)           (shared v2 or v3 envelopes)
```

v2/v3 信封是通用的适配器格式，并不意味着有共同的物理写入保证。Dropbox 与 OneDrive 可以强制 API 级别的 compare-and-swap（CAS），而 WebDAV/Nextcloud 仅在服务器提供强 ETag 时才具备原子性；弱 ETag 或缺失 ETag 时会退化为尽力而为的检查。LocalFile 同样存在尽力而为的读/检查/写竞态，且仅适用于单写入者/备份场景。

## 从这里开始

当前机制以这些文档所链接的可执行所有者为准。概览与历史文档解释模型，但不会覆盖代码、测试或聚焦契约。

| 你想要…                                           | 阅读                                                                                                                                                  |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 建立五分钟级的全系统心智模型          | **[sync-architecture.html](./sync-architecture.html)** — 独立的维护者现场指南；在浏览器中打开本地文件                          |
| 正确编写 effect/reducer/bulk-dispatch        | **[contributor-sync-model.md](./contributor-sync-model.md)** — 唯一不变量、drop-vs-defer 选择器规则，以及 lint 边界                    |
| 比较 SuperSync 与文件 v2/v3                       | [现场指南：传输](./sync-architecture.html#transport)                                                                                         |
| 追踪远程应用、冲突或重启恢复     | [远程应用](./sync-architecture.html#remote-apply)、[因果性](./sync-architecture.html#causality)、[重启](./sync-architecture.html#restart)   |
| 更改 SECTION 冲突/恢复行为              | [section-conflict-replay.md](./section-conflict-replay.md) — 狭义可交换性、状态投影重放，以及已发布客户端兼容契约 |
| 查找 SuperSync 场景的可执行覆盖      | [supersync-scenarios.md](./supersync-scenarios.md) — 场景到测试的索引，而非散文式规范                                                |
| 研究被拒方案或跨版本策略 | [operation-log-architecture.md](./operation-log-architecture.md) — 深层理由与历史，以及**规范性 A.7.11 schema 升级策略**        |
| 从日志导出中解码 `InvalidFilePrefixError`   | [diagnosing-invalid-file-prefix.md](./diagnosing-invalid-file-prefix.md) — `headShape`/`prefixAt` 解码表（#9627）                                |
| 判断同步缺陷是否真实及其严重程度        | [sync-severity-triage.md](./sync-severity-triage.md) — 分流规则：master 上实际交付什么、如何证明某次提交已发布、如何核实审计发现   |

## 参考文档

| 状态   | 文档                                                                       | 范围                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 概览 | [sync-architecture.html](./sync-architecture.html)                             | 高层维护者地图：本地意图、传输、崩溃安全应用、因果性、例外边界、重启恢复，以及可执行所有者 |
| 契约 | [contributor-sync-model.md](./contributor-sync-model.md)                       | 贡献者不变量：一次可重放的原子转换 = 一次 op；重放/远程 op 不得再次触发 effect                                     |
| 契约 | [section-conflict-replay.md](./section-conflict-replay.md)                     | SECTION 冲突可交换性、状态投影语义重放、原子替换，以及已发布客户端补偿                             |
| 契约 | [package-boundaries.md](./package-boundaries.md)                               | `@sp/sync-core`、`@sp/sync-providers`、应用接线的依赖/所有权边界                                                             |
| 契约 | [conflict-journal-and-review.md](./conflict-journal-and-review.md)             | 不相交字段自动合并，以及休眠的设备本地 journal/review 能力及其安全边界                                       |
| 契约 | [persisted-model-fields.md](./persisted-model-fields.md)                       | 向持久化模型添加字段：optional-plus-default 不变量、修复路径，以及潜伏的 hydration 校验失败（#8965）               |
| 契约 | [vector-clocks.md](./vector-clocks.md)                                         | 向量时钟实现、存储/修剪所有权与历史                                                                               |
| 契约 | [supersync-encryption-architecture.md](./supersync-encryption-architecture.md) | 端到端加密线上格式、密钥生命周期、完整性边界与已知限制                                                       |
| 混合    | [operation-log-architecture.md](./operation-log-architecture.md)               | 深层理由与实现历史，以及规范性 A.7.11 跨版本/schema 升级契约；易变细节以可执行所有者为准 |
| 分流   | [diagnosing-invalid-file-prefix.md](./diagnosing-invalid-file-prefix.md)       | `InvalidFilePrefixError` 日志诊断解码表（`headShape`、`prefixAt`）                                                           |
| 分流   | [sync-severity-triage.md](./sync-severity-triage.md)                           | 同步/数据丢失报告的严重程度分流：发布通道现实、已发布与否的证明、用户用语、审计发现处理                |

## 可执行场景索引

| 文档                                           | 范围                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------- |
| [supersync-scenarios.md](./supersync-scenarios.md) | 代表性场景到测试的路由；行为由可执行测试拥有 |

## 进行中的计划

| 文档                                     | 范围                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------- |
| [sqlite-migration.md](./sqlite-migration.md) | 当前原生 SQLite 耐用性理由、已落地基础、剩余上线门槛 |

## 相关

| 位置                                                                                                 | 内容                                      |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| [packages/super-sync-server/docs/architecture.md](../../packages/super-sync-server/docs/architecture.md) | 仅限 SuperSync 服务端的架构参考 |
| [packages/super-sync-server/](../../packages/super-sync-server/)                                         | SuperSync 服务端实现              |
| [ARCHITECTURE-DECISIONS.md](../../ARCHITECTURE-DECISIONS.md)                                             | 关键性的产品/数据决策          |

已退役的图表文件名仍保留为小型转发桩，以便历史链接继续解析。`operation-rules.md` 同样是兼容性指针；它不是当前行为或状态的独立来源。
