# SuperSync 可执行场景索引

**状态：** 路由索引，而非散文式规范。

可执行测试及其实现所有者定义当前行为。本页将维护者指向每个耐用场景家族的代表性覆盖；它不试图枚举每一次时序交错，或以散文重复测试名称。

完整清单请搜索
[`e2e/tests/sync/`](../../e2e/tests/sync/)、
[`src/app/op-log/`](../../src/app/op-log/)，以及
[`packages/super-sync-server/tests/`](../../packages/super-sync-server/tests/)。

## 端到端场景

| 场景家族                                                      | 代表性可执行契约                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 基线创建、更新、删除、多客户端收敛            | [`supersync.spec.ts`](../../e2e/tests/sync/supersync.spec.ts)                                                                                                                                                                                                                                                                                                                                                                                    |
| 无操作游标推进与实时投递                       | [`supersync-no-op-sync.spec.ts`](../../e2e/tests/sync/supersync-no-op-sync.spec.ts)、[`supersync-realtime-push.spec.ts`](../../e2e/tests/sync/supersync-realtime-push.spec.ts)、[`supersync-lastseq-preservation.spec.ts`](../../e2e/tests/sync/supersync-lastseq-preservation.spec.ts)                                                                                                                                                          |
| LWW 冲突、不相交字段合并、多客户端胜者收敛 | [`supersync-lww-conflict.spec.ts`](../../e2e/tests/sync/supersync-lww-conflict.spec.ts)、[`supersync.spec.ts`](../../e2e/tests/sync/supersync.spec.ts)                                                                                                                                                                                                                                                                                           |
| 删除胜出与有序关系冲突                       | [`supersync-project-delete-conflict.spec.ts`](../../e2e/tests/sync/supersync-project-delete-conflict.spec.ts)、[`supersync-concurrent-delete-reorder.spec.ts`](../../e2e/tests/sync/supersync-concurrent-delete-reorder.spec.ts)、[`supersync-task-ordering.spec.ts`](../../e2e/tests/sync/supersync-task-ordering.spec.ts)                                                                                                                      |
| SECTION 移动/移除/重排语义重放                         | [`supersync-section-convergence.spec.ts`](../../e2e/tests/sync/supersync-section-convergence.spec.ts) 与 [SECTION 重放契约](./section-conflict-replay.md)                                                                                                                                                                                                                                                                            |
| SYNC_IMPORT 干净石板、并发导入、迟到操作         | [`supersync-import-clean-slate.spec.ts`](../../e2e/tests/sync/supersync-import-clean-slate.spec.ts)、[`supersync-concurrent-import.spec.ts`](../../e2e/tests/sync/supersync-concurrent-import.spec.ts)、[`supersync-import-other-client-ops.spec.ts`](../../e2e/tests/sync/supersync-import-other-client-ops.spec.ts)                                                                                                                            |
| 空/重置服务器迁移与中止安全                        | [`supersync-server-migration.spec.ts`](../../e2e/tests/sync/supersync-server-migration.spec.ts)、[`supersync-server-migration-abort.spec.ts`](../../e2e/tests/sync/supersync-server-migration-abort.spec.ts)、[`supersync-account-reset.spec.ts`](../../e2e/tests/sync/supersync-account-reset.spec.ts)                                                                                                                                          |
| 备份/替换恢复与崩溃续传                         | [`supersync-backup-recovery.spec.ts`](../../e2e/tests/sync/supersync-backup-recovery.spec.ts)、[`supersync-use-remote-crash-resume.spec.ts`](../../e2e/tests/sync/supersync-use-remote-crash-resume.spec.ts)、[`supersync-server-backup-revert.spec.ts`](../../e2e/tests/sync/supersync-server-backup-revert.spec.ts)                                                                                                                            |
| 加密、密码生命周期、降级/解密失败           | [`supersync-encryption.spec.ts`](../../e2e/tests/sync/supersync-encryption.spec.ts)、[`supersync-encryption-password-change.spec.ts`](../../e2e/tests/sync/supersync-encryption-password-change.spec.ts)、[`supersync-wrong-password-error.spec.ts`](../../e2e/tests/sync/supersync-wrong-password-error.spec.ts)、[`supersync-final-page-decrypt-failure-9256.spec.ts`](../../e2e/tests/sync/supersync-final-page-decrypt-failure-9256.spec.ts) |
| 重试、瞬时下载、约束与网络失败           | [`supersync-rejected-ops-transient-download-8331.spec.ts`](../../e2e/tests/sync/supersync-rejected-ops-transient-download-8331.spec.ts)、[`supersync-constraint-error-recovery.spec.ts`](../../e2e/tests/sync/supersync-constraint-error-recovery.spec.ts)、[`supersync-network-failure.spec.ts`](../../e2e/tests/sync/supersync-network-failure.spec.ts)                                                                                        |
| 压缩、快照时钟与向量时钟修剪                | [`supersync-compaction.spec.ts`](../../e2e/tests/sync/supersync-compaction.spec.ts)、[`supersync-snapshot-vector-clock.spec.ts`](../../e2e/tests/sync/supersync-snapshot-vector-clock.spec.ts)、[`supersync-vector-clock-pruning.spec.ts`](../../e2e/tests/sync/supersync-vector-clock-pruning.spec.ts)、[`supersync-vector-clock-max-size.spec.ts`](../../e2e/tests/sync/supersync-vector-clock-max-size.spec.ts)                               |
| 归档与多实体级联行为                            | [`supersync-archive-data-sync.spec.ts`](../../e2e/tests/sync/supersync-archive-data-sync.spec.ts)、[`supersync-archive-conflict.spec.ts`](../../e2e/tests/sync/supersync-archive-conflict.spec.ts)、[`supersync-cascade-delete.spec.ts`](../../e2e/tests/sync/supersync-cascade-delete.spec.ts)、[`supersync-cross-entity.spec.ts`](../../e2e/tests/sync/supersync-cross-entity.spec.ts)                                                         |
| 提供方/账户切换与迟加入                                | [`supersync-provider-switch.spec.ts`](../../e2e/tests/sync/supersync-provider-switch.spec.ts)、[`supersync-reenable-and-account-switch.spec.ts`](../../e2e/tests/sync/supersync-reenable-and-account-switch.spec.ts)、[`supersync-late-join.spec.ts`](../../e2e/tests/sync/supersync-late-join.spec.ts)、[`webdav-provider-switch.spec.ts`](../../e2e/tests/sync/webdav-provider-switch.spec.ts)                                                 |
| Schema 与遗留提供方迁移                                 | [`supersync-legacy-migration-sync.spec.ts`](../../e2e/tests/sync/supersync-legacy-migration-sync.spec.ts)、[`webdav-legacy-migration-sync.spec.ts`](../../e2e/tests/sync/webdav-legacy-migration-sync.spec.ts)                                                                                                                                                                                                                                   |

## 聚焦的客户端契约

更改单一机制时先用较小的套件：

| 机制                                       | 聚焦所有者/测试                                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 下载分页、间隙与游标计划         | [`operation-log-download.service.spec.ts`](../../src/app/op-log/sync/operation-log-download.service.spec.ts)                                                                                                                                             |
| 导入过滤与干净石板分类 | [`sync-import-filter.service.spec.ts`](../../src/app/op-log/sync/sync-import-filter.service.spec.ts)                                                                                                                                                     |
| 远程冲突/应用编排             | [`remote-ops-processing.service.spec.ts`](../../src/app/op-log/sync/remote-ops-processing.service.spec.ts)                                                                                                                                               |
| 被取代 op 替换与 SECTION 重放    | [`superseded-operation-resolver.service.spec.ts`](../../src/app/op-log/sync/superseded-operation-resolver.service.spec.ts)                                                                                                                               |
| 解密 payload/元数据完整性            | [`verify-decrypted-op-integrity.spec.ts`](../../src/app/op-log/sync/verify-decrypted-op-integrity.spec.ts)                                                                                                                                               |
| 崩溃安全应用/存储行为                 | [`service-logic.integration.spec.ts`](../../src/app/op-log/testing/integration/service-logic.integration.spec.ts)、[`remote-apply-store-port.integration.spec.ts`](../../src/app/op-log/testing/integration/remote-apply-store-port.integration.spec.ts) |

## 服务器契约

| 机制                                       | 聚焦所有者/测试                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 冲突检测与多实体查找      | [`conflict-detection.spec.ts`](../../packages/super-sync-server/tests/conflict-detection.spec.ts)、[`conflict-entity-lookup-plan.pglite.spec.ts`](../../packages/super-sync-server/tests/conflict-entity-lookup-plan.pglite.spec.ts)                                                                       |
| 原子干净石板替换                  | [`clean-slate-atomicity-sql.integration.spec.ts`](../../packages/super-sync-server/tests/integration/clean-slate-atomicity-sql.integration.spec.ts)                                                                                                                                                        |
| 间隙/重置检测                             | [`gap-detection.spec.ts`](../../packages/super-sync-server/tests/gap-detection.spec.ts)                                                                                                                                                                                                                    |
| 快照时钟与跳过优化            | [`snapshot-vector-clock-sql.integration.spec.ts`](../../packages/super-sync-server/tests/integration/snapshot-vector-clock-sql.integration.spec.ts)、[`snapshot-skip-optimization.integration.spec.ts`](../../packages/super-sync-server/tests/integration/snapshot-skip-optimization.integration.spec.ts) |
| 校验、payload 限制与服务器安全 | [`validation.service.spec.ts`](../../packages/super-sync-server/tests/validation.service.spec.ts)、[`server-security.spec.ts`](../../packages/super-sync-server/tests/server-security.spec.ts)                                                                                                             |

## 运行与扩展覆盖

用以下命令运行聚焦的客户端规格：

```bash
npm run test:file src/app/op-log/sync/<file>.spec.ts
```

对于 SuperSync 与 WebDAV E2E，优先为分支手动触发
[`E2E Tests (Scheduled)`](../../.github/workflows/e2e-scheduled.yml)。它提供专用服务与分片的 SuperSync 任务。聚焦本地命令见
[`e2e/CLAUDE.md`](../../e2e/CLAUDE.md)。

每一次同步修复都必须从针对真实操作或状态形状的可复现失败开始。先添加狭义聚焦测试，当契约跨越客户端、持久化/重启、传输或已发布版本兼容性时再添加或扩展 E2E。仅当某个耐用场景家族获得或更改其可执行所有者时，才更新本索引。
