# SuperSync 服务器架构

SuperSync 是一个基于 PostgreSQL、需认证的中继、排序服务，以及操作日志协议的上传冲突门控。它校验操作元数据、检测向量钟冲突、为每个用户分配服务器序列号、持久化已接受的操作，并通知对端客户端。客户端拥有应用状态语义、加密密钥与解密，以及对被拒冲突的解决。

客户端与整系统上下文请从
[同步架构实地指南](../../../docs/sync-and-op-log/sync-architecture.html) 开始。

## 所有权与信任边界

- 服务器对每个用户保留的操作顺序与已接受的上传结果具有权威性，而非应用状态的语义含义。
- [`@sp/shared-schema`](../../shared-schema/src/supersync-http-contract.ts) 拥有
  HTTP 线缆契约。[`@sp/sync-core`](../../sync-core/src/) 拥有
  客户端与服务器共享的向量钟算法。
- 服务器在持久化前校验标识符、操作类型、大小、时间戳、时钟、
  schema 版本、配额与冲突元数据。
- 上传冲突在服务器侧检测并以拒绝形式返回。客户端通过产生或应用后续操作来解决。
- 所有 HTTP 同步路由需要 bearer 认证。WebSocket 端点从 `token` 查询参数验证同一完整访问、365 天的 JWT；
  它仅发送轻量级「有新操作可用」通知，载荷仍通过 HTTP 传输。

生产部署必须仅通过 HTTPS 与 WSS 暴露 HTTP 与 WebSocket 流量。每套反向代理日志配置都必须从访问日志与请求失败/错误日志中省略敏感查询值及带 token 的 `Referer` 头，且带 token 的登录/恢复页面必须发出
`Referrer-Policy: no-referrer`。
[捆绑的 Caddy 配置](../Caddyfile) 会替换完整的已记录查询后缀，从两条 Caddy 日志路径丢弃 `Referer`，并设置该响应策略；应用错误日志记录器也会替换其完整查询后缀。token 生命周期与风险见
[认证架构](./authentication.md)。

JWT 校验会查阅进程本地、有界、30 秒的账户校验与 token 版本状态缓存。认证变更会在执行写入的进程中使缓存失效，但独立副本收不到失效信号。因此多实例部署需要共享的认证失效机制（或明确接受有界的吊销延迟）；WebAuthn 仪式还需要共享挑战存储或粘性路由。捆绑的 Helm chart 仍为单副本。

## 稳定 API 面

请求与响应字段属于
[共享线缆契约](../../shared-schema/src/supersync-http-contract.ts)；请勿在此重复。

| 方法与路径                         | 稳定用途                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/sync/ops`               | 校验并上传常规操作；响应可捎带较新的远端操作                                                           |
| `GET /api/sync/ops`                | 按每用户序列顺序下载保留的操作，含分页、缺口与完整状态元数据                                           |
| `POST /api/sync/snapshot`          | 上传完整状态的 `SYNC_IMPORT`、`BACKUP_IMPORT` 或 `REPAIR` 操作                                         |
| `GET /api/sync/status`             | 返回诊断用的序列、设备、快照年龄与配额信息；生产客户端不使用                                           |
| `DELETE /api/sync/data`            | 擦除用户的同步数据集并重置其序列状态                                                                   |
| `GET /api/sync/restore-points`     | 列出因果完整状态重放边界                                                                               |
| `GET /api/sync/restore/:serverSeq` | 在保留的序列处重建明文状态                                                                             |
| `GET /api/sync/ws`                 | 通知其他客户端有操作可用；永不流式传输操作载荷                                                         |

不存在 `GET /api/sync/snapshot` 端点。可执行路由权威为
[`sync.routes.ts`](../src/sync/sync.routes.ts) 与
[`websocket.routes.ts`](../src/sync/websocket.routes.ts)。

## 每用户排序与事务不变量

`serverSeq` 是同一用户当前同步数据集内的全序。已接受的上传在 PostgreSQL `RepeatableRead` 事务内提交。每次接受操作时对 `user_sync_state.lastSeq` 的一次原子更新预留其序列号，并串行化该用户的已接受写入者。读到同一较早快照的并发事务必须失败并重试，而不是提交冲突操作。因果性 `REPAIR` 还会锁定该行，并必须证明 `repairBaseServerSeq === lastSeq`。传入的向量钟在为存储而裁剪之前进行比较。

携带 `lastKnownServerSeq` 的常规上传使用同一行锁，将其游标与 `user_sync_state.latestStateReplacementSeq` 比较。落后于最新 `SYNC_IMPORT` 或 `BACKUP_IMPORT` 的游标会在插入任何操作之前被拒绝，且替换会被捎带，不排除其作者。可空标记在升级后从保留的操作中惰性对账；为零表示对账未发现替换。

干净开局的完整状态上传会删除先前数据集但保留 `lastSeq`，防止对现有客户端可见的序列复用。只有显式的 `DELETE /api/sync/data` 会擦除整个数据集并将序列重置为零。

该串行化机制是承重决策；参见
[ADR #4](../../../ARCHITECTURE-DECISIONS.md#4-upload-conflict-safety-via-the-lastseq-row-lock-under-repeatableread)、
[`sync.service.ts`](../src/sync/sync.service.ts) 与
[`operation-upload.service.ts`](../src/sync/services/operation-upload.service.ts)。

## 存储、保留、快照与恢复点

- `operations` 为写时追加，并非永久保留。行在保留期间不可变；清理、配额回收、干净开局替换与显式数据删除可移除它们。
- `user_sync_state` 拥有 `lastSeq`、可选的压缩快照缓存、最新因果完整状态标记，以及最新显式状态替换边界。`sync_devices` 仅用于每设备身份/元数据与最后可见跟踪。其 `lastAckedSeq` 字段为休眠的遗留 schema 状态：当前同步与保留代码既不推进也不读取它。
- 正常同步从操作行引导。`GET /ops` 可快进到最新因果完整状态操作；客户端不下载服务器缓存的快照 blob。
- 快照缓存是明文数据的可选服务器重放优化。加密的完整状态上传仍作为操作保留，但不能成为服务器可读的状态缓存。
- 恢复点是 `SYNC_IMPORT`、`BACKUP_IMPORT` 与因果性 `REPAIR` 操作。无标记的遗留 repair 不能授权快进、恢复或历史修剪。
- 默认保留期为 45 天。清理会移除陈旧设备，并可能仅移除已证明的因果完整状态边界之前的旧操作前缀，同时保留该边界及其重放尾部。边界来自操作流本身——不需要快照游标（#9688），因此仅加密与无快照的历史也会被修剪。当存在缓存的快照 BLOB 时，边界另外永不越过该行的游标（保护缓存基座的重放尾部以供恢复）；留下而无其 blob 的游标不构成上限。用户的过期前缀整段修剪或完全不修剪，因此最低存活操作保持为完整状态操作。配额回收使用单独的有界清理策略。
- 当所需重放范围包含加密操作时，服务器生成的恢复不可用。

持久化权威为
[`schema.prisma`](../prisma/schema.prisma)。保留与重放位于
[`cleanup.ts`](../src/sync/cleanup.ts)、
[`storage-quota.service.ts`](../src/sync/services/storage-quota.service.ts)、
[`snapshot.service.ts`](../src/sync/services/snapshot.service.ts) 与
[`op-replay.ts`](../src/sync/op-replay.ts)。

## E2EE 边界

启用 SuperSync E2EE 时，仅 `operation.payload` 在客户端加密。服务器没有密钥，并将该载荷存为不透明值。路由与因果元数据——包括操作与客户端 ID、动作与操作类型、实体 ID、向量钟、时间戳、schema 版本、导入原因以及加密标志——保持明文，并由校验、排序与冲突检测使用。

载荷的 AES-GCM 标签不对明文元数据做认证。因此 E2EE 提供载荷机密性与完整性，而非元数据机密性或完整操作的端到端真实性。参见
[加密架构](../../../docs/sync-and-op-log/supersync-encryption-architecture.md)。

## 可执行所有者与测试

| 关注点                       | 所有者                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 认证                         | [`api.ts`](../src/api.ts)、[`auth.ts`](../src/auth.ts)、[`passkey.ts`](../src/passkey.ts)、[`auth-cache.ts`](../src/auth-cache.ts) |
| 线缆协议                     | [`supersync-http-contract.ts`](../../shared-schema/src/supersync-http-contract.ts)                                                  |
| HTTP 与 WebSocket 路由       | [`sync.routes.ts`](../src/sync/sync.routes.ts)、[`websocket.routes.ts`](../src/sync/websocket.routes.ts)                            |
| 上传事务与顺序               | [`sync.service.ts`](../src/sync/sync.service.ts)、[`operation-upload.service.ts`](../src/sync/services/operation-upload.service.ts) |
| 冲突查找                     | [`conflict.ts`](../src/sync/conflict.ts)                                                                                            |
| 下载、缺口、快进             | [`operation-download.service.ts`](../src/sync/services/operation-download.service.ts)                                               |
| 快照与恢复                   | [`snapshot.service.ts`](../src/sync/services/snapshot.service.ts)、[`op-replay.ts`](../src/sync/op-replay.ts)                       |
| 保留与配额                   | [`cleanup.ts`](../src/sync/cleanup.ts)、[`storage-quota.service.ts`](../src/sync/services/storage-quota.service.ts)                 |
| 持久化                       | [`schema.prisma`](../prisma/schema.prisma)                                                                                          |

承重的 PostgreSQL 竞态覆盖位于
[`tests/integration/`](../tests/integration/)，尤其是 repair 因果性、干净开局原子性、冲突检测与快照向量钟套件。
