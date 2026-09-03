# SuperSync 端到端加密架构

## 概述

SuperSync 使用 **AES-256-GCM** 加密与 **Argon2id** 密钥派生实现端到端加密（E2EE）。操作载荷的加密/解密发生在客户端。服务器仍能看到[安全属性](#安全属性)中描述的明文操作信封元数据。

## 加密流程图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT A (Upload)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User Action                                                             │
│     ┌──────────────┐                                                        │
│     │ Add Task     │                                                        │
│     │ "Buy milk"   │                                                        │
│     └──────┬───────┘                                                        │
│            │                                                                │
│            ▼                                                                │
│  2. NgRx Action Dispatched                                                  │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ { type: '[Task] Add Task',                                   │        │
│     │   task: { id: 'abc123', title: 'Buy milk', ... },            │        │
│     │   meta: { isPersistent: true, entityType: 'task', ... } }    │        │
│     └──────────────────────────┬───────────────────────────────────┘        │
│                                │                                            │
│                                ▼                                            │
│  3. Operation Capture (operation-capture.meta-reducer.ts)                   │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ MultiEntityPayload {                                         │        │
│     │   actionPayload: { task: {...}, isAddToBottom: false, ... }, │        │
│     │   entityChanges: [{ entityType: 'task', entityId: 'abc123',  │        │
│     │                     changeType: 'create' }]                  │        │
│     │ }                                                            │        │
│     └──────────────────────────┬───────────────────────────────────┘        │
│                                │                                            │
│                                ▼                                            │
│  4. Encryption (operation-encryption.service.ts)                            │
│     ┌─────────────────────────────────────────────────────────────┐         │
│     │                                                             │         │
│     │  User Password: "mySecretPass123"                           │         │
│     │         │                                                   │         │
│     │         ▼                                                   │         │
│     │  ┌─────────────────┐                                        │         │
│     │  │   Argon2id      │  Key Derivation                        │         │
│     │  │   + Salt        │  (CPU/memory-hard)                     │         │
│     │  └────────┬────────┘                                        │         │
│     │           │                                                 │         │
│     │           ▼                                                 │         │
│     │  256-bit Encryption Key                                     │         │
│     │           │                                                 │         │
│     │           ▼                                                 │         │
│     │  ┌─────────────────┐                                        │         │
│     │  │   AES-256-GCM   │  Authenticated Encryption              │         │
│     │  │   + Random IV   │  (confidentiality + integrity)         │         │
│     │  └────────┬────────┘                                        │         │
│     │           │                                                 │         │
│     │           ▼                                                 │         │
│     │  Encrypted Payload (base64 string)                          │         │
│     │  "U2FsdGVkX1+abc123..."                                     │         │
│     │                                                             │         │
│     └─────────────────────────┬───────────────────────────────────┘         │
│                               │                                             │
│                               ▼                                             │
│  5. SyncOperation Ready for Upload                                          │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ { id: 'op-xyz', clientId: 'client-A',                        │        │
│     │   actionType: '[Task] Add Task',                             │        │
│     │   payload: "U2FsdGVkX1+abc123...",  ← Encrypted!             │        │
│     │   isPayloadEncrypted: true,          ← Flag set              │        │
│     │   vectorClock: { 'client-A': 5 }, ... }                      │        │
│     └──────────────────────────────────────────────────────────────┘        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPERSYNC SERVER                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Server stores encrypted payload AS-IS                                      │
│  ┌──────────────────────────────────────────────────────────────────┐       │
│  │  operations table:                                               │       │
│  │  ┌─────────┬────────────────────────────┬───────────────────┐    │       │
│  │  │ seq     │ payload                    │ is_encrypted      │    │       │
│  │  ├─────────┼────────────────────────────┼───────────────────┤    │       │
│  │  │ 42      │ "U2FsdGVkX1+abc123..."     │ true              │    │       │
│  │  └─────────┴────────────────────────────┴───────────────────┘    │       │
│  │                                                                  │       │
│  │  ⚠️  Server CANNOT read payload contents                         │       │
│  │  ⚠️  Server has NO access to encryption key                      │       │
│  └──────────────────────────────────────────────────────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                            CLIENT B (Download)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Download Operations (operation-log-download.service.ts)                 │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ Received: { payload: "U2FsdGVkX1+abc123...",                 │        │
│     │            isPayloadEncrypted: true, ... }                   │        │
│     └──────────────────────────┬───────────────────────────────────┘        │
│                                │                                            │
│                                ▼                                            │
│  2. Decryption (operation-encryption.service.ts)                            │
│     ┌─────────────────────────────────────────────────────────────┐         │
│     │                                                             │         │
│     │  User Password: "mySecretPass123"  (same as Client A)       │         │
│     │         │                                                   │         │
│     │         ▼                                                   │         │
│     │  ┌─────────────────┐                                        │         │
│     │  │   Argon2id      │  Same key derivation                   │         │
│     │  │   + Salt        │  → Same 256-bit key                    │         │
│     │  └────────┬────────┘                                        │         │
│     │           │                                                 │         │
│     │           ▼                                                 │         │
│     │  ┌─────────────────┐                                        │         │
│     │  │   AES-256-GCM   │  Decrypt + verify integrity            │         │
│     │  │   Decrypt       │                                        │         │
│     │  └────────┬────────┘                                        │         │
│     │           │                                                 │         │
│     │           ▼                                                 │         │
│     │  Original Payload (JSON)                                    │         │
│     │  { actionPayload: { task: {...} }, entityChanges: [...] }   │         │
│     │                                                             │         │
│     └─────────────────────────┬───────────────────────────────────┘         │
│                               │                                             │
│                               ▼                                             │
│  3. Convert to Action (operation-converter.util.ts)                         │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ extractActionPayload() → { task: {...}, isAddToBottom, ... } │        │
│     └──────────────────────────┬───────────────────────────────────┘        │
│                                │                                            │
│                                ▼                                            │
│  4. Dispatch Action (operation-applier.service.ts)                          │
│     ┌──────────────────────────────────────────────────────────────┐        │
│     │ { type: '[Task] Add Task',                                   │        │
│     │   task: { id: 'abc123', title: 'Buy milk', ... },            │        │
│     │   meta: { isPersistent: true, isRemote: true, ... } }        │        │
│     └──────────────────────────┬───────────────────────────────────┘        │
│                                │                                            │
│                                ▼                                            │
│  5. State Updated                                                           │
│     ┌──────────────┐                                                        │
│     │ Task appears │                                                        │
│     │ "Buy milk"   │                                                        │
│     └──────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 关键组件

### 1. OperationEncryptionService

[`OperationEncryptionService`](../../src/app/op-log/sync/operation-encryption.service.ts)
拥有操作与快照载荷加密。其当前契约不止是一次加密/解密往返：

- 上传加密 JSON 载荷，并将结果操作标记为已加密。
- 下载认证并解密密文，解析载荷，然后在返回供应用的操作之前，用已认证的载荷数据核对未认证的信封。
- LWW 目标/足迹不匹配，以及把非全状态载荷提升为全状态操作的明文 `opType`，都会失败关闭。可执行检查位于
  [`verify-decrypted-op-integrity.ts`](../../src/app/op-log/sync/verify-decrypted-op-integrity.ts)；
  其规范定义了接受的遗留与全状态形状。

### 2. 加密算法

**位置**：`packages/sync-core/src/encryption.ts` 及其
`packages/sync-core/src/encryption/` 协作者。

- **算法**：AES-256-GCM（Galois/Counter Mode）
- **密钥派生**：Argon2id（内存困难，抗 GPU 攻击）
- **Salt**：派生密码的会话加密密钥时使用随机 16 字节；在进程会话中与该缓存密钥一起复用
- **IV**：每个加密载荷使用新鲜的随机 12 字节
- **输出格式**：`salt || iv || (AES-GCM ciphertext + authTag)`（base64 编码）

会话稳定的 salt 将昂贵的 Argon2id 派生摊销到多次操作上。在该固定派生密钥下，AES-GCM 安全性依赖每个加密载荷的新鲜 IV 保持唯一。

### 3. 上传集成

[`OperationLogUploadService`](../../src/app/op-log/sync/operation-log-upload.service.ts)
通过提供者契约获取密钥，并在传输前加密操作与快照载荷。上传边界失败关闭：

- 强制要求 E2EE 的提供者（SuperSync）在没有可用密钥时不能上传待处理操作或快照。待处理工作保持未同步以待稍后加密重试，结果报告加密设置未完成。
- 配置声称启用加密但缺少密钥的文件提供者，在上传前抛出，而非回退到明文。
- 文件格式加密瓶颈在
  [`encrypt-and-compress-handler.service.ts`](../../src/app/op-log/encryption/encrypt-and-compress-handler.service.ts)
  中独立强制执行相同的无密钥/无上传规则。

回归覆盖位于
[`operation-log-upload.service.spec.ts`](../../src/app/op-log/sync/operation-log-upload.service.spec.ts)
与
[`encrypt-and-compress-handler.service.spec.ts`](../../src/app/op-log/encryption/encrypt-and-compress-handler.service.spec.ts)。

### 4. 下载集成

[`OperationLogDownloadService`](../../src/app/op-log/sync/operation-log-download.service.ts)
在应用前筛查已下载操作；上传服务对捎带操作应用相同的入站检查：

- 若 SuperSync 配置期望加密，任何明文入站操作都会拒绝其批次。这防止伪造的
  `isPayloadEncrypted=false` 标志绕过解密与所有解密后检查；聚焦所有者是
  [`assert-ops-encryption-expected.ts`](../../src/app/op-log/sync/assert-ops-encryption-expected.ts)。
- 无密钥的加密输入会引发密码恢复错误；绝不会被当作明文处理。
- 成功的 AES-GCM 认证之后是载荷解析与上述元数据/全状态检查。解密后的操作不会先释放给应用管道。

## 配置存储

加密密码/密钥仅存储在提供者的**私有配置**中；它不属于已同步的应用状态，也绝不会发送到服务器。加密意图也存储在私有配置中，但会镜像到
`globalConfig.sync.isEncryptionEnabled`，以便同步管道可以失败关闭。该意图位可能出现在操作或快照载荷内，但远程值非权威：hydration 会重新应用设备的本地值。凭据存储与提供者将意图与密钥存在性分开暴露，因此丢失的密钥不能静默地把加密配置变成明文配置。请遵循
[`credential-store.service.ts`](../../src/app/op-log/sync-providers/credential-store.service.ts)、
[`provider-types.ts`](../../packages/sync-providers/src/provider-types.ts) 以及具体的
[`SuperSyncProvider`](../../packages/sync-providers/src/super-sync/super-sync.ts)，
而不是把私有配置形状复制到新代码中。

## 安全属性

| 属性              | 保证                                                          |
| --------------------- | ------------------------------------------------------------------ |
| **机密性**   | 服务器无法读取操作载荷                              |
| **载荷完整性** | GCM 认证标签检测加密载荷的篡改            |
| **密钥安全**      | Argon2id 使密码暴力尝试昂贵             |
| **Nonce 唯一性**  | 每个加密载荷在缓存密钥下使用新鲜随机 IV |
| **前向保密**   | 不提供；IV 唯一性不是前向保密                 |
| **错误密码**    | 解密失败且操作被拒绝                     |

> **完整性范围（重要）。** 仅 `op.payload` 被加密并由 AES-GCM 认证标签覆盖。每一个其他操作字段——`actionType`、`opType`、`entityType`、`entityId`、`entityIds`、`vectorClock`、`timestamp`、`schemaVersion`、`syncImportReason`，**以及 `isPayloadEncrypted` 标志本身**——都以**明文**传输，且**未**作为 Additional Authenticated Data（AAD）绑定，因此恶意/被攻破的同步服务器或 TLS MITM 可以篡改它。作为**纵深防御**，客户端在四个篡改向量上失败关闭：
>
> - **明文注入降级：** 伪造的、带 `isPayloadEncrypted=false` 的操作会跳过解密_以及_载荷检查并按原样应用——在强制加密的客户端上任意伪造操作。`assertOpsEncryptedWhenExpected` 在加密于配置中**启用**时拒绝任何入站明文操作（下载 + 捎带）（`isEncryptionMandatory && isEncryptionEnabled()` ——配置意图，而非密钥存在性，因此在凭据丢失状态下也会失败关闭）。安全是因为启用加密会删除并以加密形式重新上传所有数据，因此不会留下合法的明文操作——这依赖于 `deleteAllData()` 移除每一个可下载明文操作的服务器契约。这是基于文件的 GHSA-vrc7 下载守卫与 GHSA-9544 _上传_ 守卫在 SuperSync 操作级的孪生。
> - **LWW `entityId` 重定向：** 对适配器支持的 LWW 更新，其中 `payload.id` 选择 reducer 应用的实体，客户端拒绝已认证的 `payload.id` 不等于 `op.entityId` 的_加密_操作（`verify-decrypted-op-integrity.ts`）。单例 LWW actions 以注册的 feature 状态整体为目标，因此像 TIME_TRACKING 的复合键这类上下文冲突 ID 没有规范的载荷 `id`。
> - **项目移动足迹注入：** 当加密的 TASK 项目移动载荷携带 `projectMoveSubTaskIds` 时，客户端要求明文 `op.entityIds` 与已认证集合 `{op.entityId} ∪ projectMoveSubTaskIds` 精确集合相等。这防止被攻破的服务器向本应有效的移动追加受害任务 ID。没有已认证足迹的合成 LWW 操作无法被该临时守卫检查；将完整信封绑定为 GCM AAD 仍是持久修复。
> - **全状态 `opType` 提升：** 在解密标记为 `SYNC_IMPORT`、`BACKUP_IMPORT` 或 `REPAIR` 的操作后，客户端在元数据能把它提升为 `loadAllData` 之前，将已认证载荷结构性校验为完整应用数据。直接与 `appDataComplete` 包装的载荷都支持。支持的遗留载荷在校验副本上迁移；已知兼容的省略（预 section 备份以及从线路快照剥离的设备本地同步间隔）仅在该副本上恢复。原件对既有操作处理管道保持不变（`assertDecryptedFullStateOpIntegrity`）。
>
> 这**不是**完整完整性。在持久修复之前仍开放：
>
> - LWW 内的 `entityType`/`actionType` 交换（id 保持相等，因此会通过）。
> - `vectorClock`/`timestamp` 重排/重放。
> - 恢复到时间点路径（`getStateAtSeq` → `importCompleteBackup`）应用服务器重建的状态而无此守卫；它本质上是服务器撰写的，且服务器对加密账户阻止它，但 E2EE 无法认证它。
>
> 已知限制：运行早于 GHSA-9544 _上传_ 守卫的应用版本的对等端仍可推送明文操作；有密钥的客户端随后会在此以篡改消息失败关闭。在再次同步之前保持旧对等端离线并更新它们。若已更新的客户端有已验证的完整副本，导出备份并使用其显式的 **Force Overwrite** 动作，用加密的干净石板全状态替换混合历史。绝不要从新鲜或不完整的客户端运行该动作。若没有已验证的完整客户端剩余，保留数据库与客户端以供事件恢复；不要跳过该行或把游标推进越过它。参见
> [`backup-and-recovery.md`](../../packages/super-sync-server/docs/backup-and-recovery.md#recovering-a-mixed-encryptedplaintext-history)。
>
> 完整保护——在信封版本迁移背后将元数据（与加密标志）绑定为 GCM AAD，并带有单调「加密地板」以阻止降级——跟踪于 **GHSA-8pxh-mgc7-gp3g**。不要在客户端决策点把明文元数据当作可信。

## 初始设置 — 密码对话框选择

在初始 SuperSync 设置期间，应用通过**探测服务器**决定显示哪个加密对话框，再打开任何对话框：

```
DialogSyncInitialCfgComponent.save()
    │
    ▼
Save config + auth
    │
    ▼
Probe server: downloadOps(0, undefined, 1)
    │
    ├─── Server has encrypted ops ──► DialogEnterEncryptionPasswordComponent
    │    (isPayloadEncrypted=true)      (enter existing password)
    │
    ├─── Server empty or ───────────► DialogEnableEncryptionComponent
    │    unencrypted ops                (create new password)
    │
    └─── Probe fails ───────────────► DialogEnableEncryptionComponent
         (network/auth error)           (fallback; sync error handling
                                         catches mismatches later)
```

这避免第二个客户端加入时令人困惑的双重提示：没有探测时，应用总会显示「创建密码」，然后在同步期间立即失败并显示「输入密码」。

**安全网：** 若探测给出错误结果（例如竞态条件），`sync-wrapper.service.ts` 中既有的 `_handleMissingPasswordDialog()` 与 `_promptSuperSyncEncryptionIfNeeded()` 会在后续同步中捕获不匹配。

## 错误密码处理

```
Client C (wrong password) tries to sync:
    │
    ▼
Download encrypted ops
    │
    ▼
Attempt decryption with wrong key
    │
    ▼
┌─────────────────────────────┐
│  DecryptError thrown        │
│  "Failed to decrypt payload"│
└─────────────────────────────┘
    │
    ▼
Operation NOT applied to state
Sync error shown in UI
```

## 快照加密

全状态操作（备份导入与修复）使用快照端点，但保留相同的失败关闭边界。上传服务在传输前校验全状态结构，在有密钥时加密载荷，且对有待处理工作但无密钥的强制加密提供者不能到达快照上传分支。下载时，加密的全状态操作仅在 AES-GCM 认证且 `assertDecryptedFullStateOpIntegrity()` 将其校验为完整应用数据（包括在校验副本上的支持遗留迁移）之后才被接受。

可执行所有者：

- 上传路由与强制密钥守卫：
  [`operation-log-upload.service.ts`](../../src/app/op-log/sync/operation-log-upload.service.ts)
- 载荷加密与解密后分发边界：
  [`operation-encryption.service.ts`](../../src/app/op-log/sync/operation-encryption.service.ts)
- 全状态完整性校验：
  [`verify-decrypted-op-integrity.ts`](../../src/app/op-log/sync/verify-decrypted-op-integrity.ts)
- 全状态回归覆盖：
  [`verify-decrypted-op-integrity.spec.ts`](../../src/app/op-log/sync/verify-decrypted-op-integrity.spec.ts)
