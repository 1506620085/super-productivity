# 安全密钥存储计划

状态：已规划（2026-07-03 修订）

本计划取代较早的仅同步凭据安全存储草图，并纳入独立的更广草稿。目标是面向所有应用管理密钥的安全存储架构：同步凭据、同步加密口令、issue 提供方 token/密码、插件配置密钥、插件 OAuth token，以及原生后台同步凭据。

修订说明（2026-07-03）：与已交付工作对齐（插件密钥存储 API #8633、设置时 E2EE 要约 #8709、E2EE 强制的 SuperSync 上传 GHSA-9v8x、issue 提供方到插件的迁移）。主要变更：同步 E2EE 包装的可移植保险库移入 V1b，使 E2EE 用户无需重新输入凭据；阻塞式兼容警告变为静默双写门控；本地配置文件存储覆盖所有平台；恢复密钥、设备配对、保险库 DEK/清单机制与推测性能力模式被砍掉；`SecretAccessContext` 被诚实 reframed 为误用防护而非安全边界；Electron 主进程日志加入脱敏/金丝雀覆盖面。

## 范围现实核对：今天实际同步了什么

在权衡取舍之前，先精确划定表面：

- 同步提供方凭据（WebDAV/Nextcloud 密码、Dropbox token、SuperSync token）以及每个提供方的 `encryptKey` **已经是设备本地的**（`sup-sync` IndexedDB，永不同步）。用户今天已在每台设备上重新输入一次。
- 插件 OAuth token（`sup-plugin-oauth`）与插件 `setSecret` 值（`sup-plugin-secrets`，已在 #8633 交付）**已经是设备本地的**。
- 唯一会同步的密钥是：七个内置 issue 提供方的密钥字段（Jira、GitLab、CalDAV、OpenProject、Redmine、Nextcloud Deck、Plainspace）以及 issue 提供方插件中 `type: 'password'` 的配置字段（GitHub、ClickUp、Gitea、Linear、Trello、Azure DevOps）。典型用户配置了 0–3 个。
- SuperSync 上传是 E2EE 强制的（GHSA-9v8x 修复），基于文件的提供方在设置时提供 E2EE（#8709），遗留未加密 SuperSync 用户会看到平静的迁移横幅（#8672）。E2EE 用户群是默认且在增长。

因此本计划扰动的「一切都通过同步到达」体验，仅限于 issue 提供方与插件凭据；对占主导的 E2EE 用户群，可移植保险库（V1b）可完整保留该体验。

## 核心取舍

将密钥移出同步状态，是以小而针对性的 UX 成本，换取把原始密钥排除在同步状态、op-log 操作、快照、备份、插件同步数据与日志之外。

有了 V1b 可移植保险库，成本仅落在**没有**同步 E2EE 的用户身上：

- **已启用同步 E2EE（默认用户群）：** issue 提供方与插件密钥进入用现有同步 E2EE 材料派生密钥加密的可移植保险库。新设备为同步本来就要输入同步口令；保险库从同一材料解锁。零新增提示，零重新输入。
- **无 E2EE 的同步：** 现有已同步密钥留在原处（见下文「无 E2EE 的同步」）；新输入的密钥变为设备本地，必须按设备重新输入。已交付的 E2EE 引导会随时间缩小该用户群，启用 E2EE 时密钥会静默迁入保险库。
- **无同步：** 无变化。

设备本地场景的 UX 缓解：

- 保持提供方元数据同步，使设置表单除缺失密钥外已预填。
- 显示清晰的每设备状态：「凭据已保存在本设备」与「本设备缺少凭据」。
- 从每个受影响的集成提供直接的重新认证/重新输入操作。

每个进入保险库或设备本地的密钥都可通过与第三方服务重新认证恢复，因此任何保险库/存储丢失的最坏情况是设备本地基线，永不造成数据丢失。

## 无 E2EE 的同步

对无 E2EE 同步的用户，不提示也不静默迁移：

- 现有已同步的集成密钥留在同步配置中未迁移。其整个任务数据集已以明文同步到同一目标；相对该目标的 token 机密性本就有限，而迁移提示恰恰是宣言所拒绝的强加决策。
- 新/替换的密钥以设备本地 `SecretRef` 值写入（永不把原始值写入同步状态），因此明文表面停止增长。
- 现有平静的 E2EE 横幅与设置时要约仍是迁移路径。当用户启用同步 E2EE 时，现有原始已同步密钥在每台升级设备上静默迁入可移植保险库。
- 固定应用密钥、静态「标准密钥」或捆绑混淆密钥只是混淆，不得用于新的同步密钥写入。若使用，仅限于一次性遗留读取/迁移兼容，并定义移除版本。

## 目标

- 将密码、访问 token、刷新 token、API 密钥与加密口令排除在 NgRx 状态、op-log 载荷、快照、常规备份、插件同步数据与诊断日志之外——渲染进程 **以及** Electron 主进程。
- 为同步 E2EE 用户保留多设备体验：除他们已输入的同步口令外无需重新输入凭据。
- 在可用处使用 OS 支持的密钥存储（V1 之后加固）。
- 明确降级平台，而非静默回退到明文。
- 以简单的空控件模型保留掩码字段 UX。
- 迁移现有明文密钥时不破坏认证、不阻塞对话框，且仅在同步 schema 变更处置于兼容门控之后。
- 增加当金丝雀密钥值出现在序列化应用状态、操作载荷、备份或日志中时会失败的测试。

## 非目标

- 这不是通用密码管理器（无恢复密钥、无设备配对、无通行密钥托管——与上游服务重新认证即恢复路径）。
- 这不能在渲染进程被攻破、恶意插件、浏览器扩展、键盘记录器或注入脚本已有运行时访问后保护密钥。特别是，它**不**在应用代码与插件代码之间建立边界——见下文「诚实威胁模型」。
- 这不消除用户内容对同步 E2EE 的需求。
- 这不会使第三方 token 比其上游作用域更安全。
- 首个版本不增加原生 OS 支持存储，也不深入清理历史远端同步历史。

## 诚实威胁模型

各层级实际买到什么——面向用户与内部文档都应写成这些声明，绝不要更强：

- **V1 本地配置文件存储（`indexedDbProfile`）：** 仅本地_隔离_。密钥离开同步状态、备份、导出与日志。任何能访问该配置文件磁盘的人——或在应用源中运行的任何代码，包括插件——仍可读取它们，与今天现有的 `sup-sync`、`sup-plugin-oauth` 与 `sup-plugin-secrets` 存储完全一样。这不是静态加密声明。
- **可移植保险库：** 相对同步目标/存储提供方的集成密钥机密性，叠在同步 E2EE 之下。它继承同步 E2EE 口令的强度，除同步 E2EE 已有的离线暴力暴露外不增加新暴露（同一密钥材料今天已保护完整数据集）。恶意存储提供方仍可扣留或回滚保险库记录以及其余同步数据；机密性成立，新鲜性不成立。轮换：见「轮换」。
- **V1 之后 OS 支持存储（safeStorage/Keystore/Keychain）：** 本地设备的静态保护（磁盘被盗、其他 OS 用户）。仍无应用-对-插件分离：插件在宿主渲染进程中执行（`src/app/plugins/plugin-runner.ts`，iframe 插件为 `allow-same-origin`），因此 IPC 调用无法按调用方区分。真正的插件边界需要单独的插件进程/源隔离工作，以及按隔离调用方键控的主进程强制；本计划不应声称具备该能力。

## 当前密钥清单

### 同步提供方密钥（今天已是设备本地）

- `SyncCredentialStore` 在 `sup-sync` IndexedDB 数据库中以明文存储私有提供方配置。仅本地，永不同步。
- 密钥字段：WebDAV/Nextcloud `password` + 可选 bearer `accessToken`，Dropbox `accessToken` + `refreshToken`，SuperSync `accessToken` + `refreshToken`，以及所有提供方上的 `encryptKey`（含本地文件）。
- 注意：该存储故意只记录 `encryptKey` 长度，永不记录值。

相关文件：

- [`src/app/op-log/sync-providers/credential-store.service.ts`](../../src/app/op-log/sync-providers/credential-store.service.ts)
- [`src/app/op-log/core/types/sync.types.ts`](../../src/app/op-log/core/types/sync.types.ts)
- [`packages/sync-providers/src/super-sync/super-sync.model.ts`](../../packages/sync-providers/src/super-sync/super-sync.model.ts)
- [`packages/sync-providers/src/file-based/webdav/webdav.model.ts`](../../packages/sync-providers/src/file-based/webdav/webdav.model.ts)
- [`packages/sync-providers/src/file-based/dropbox/dropbox.ts`](../../packages/sync-providers/src/file-based/dropbox/dropbox.ts)

### Android 后台同步密钥（今天已是设备本地）

- SuperSync 访问 token 从 WebView 镜像到原生 Android 存储，用于后台同步/提醒取消。
- `BackgroundSyncCredentialStore` 使用 `EncryptedSharedPreferences`，但若加密偏好失败则回退到标准明文 `SharedPreferences`。
- 已设置 `android:allowBackup="true"`，且备份规则文件（`data_extraction_rules.xml`、`backup_rules.xml`）已存在——但它们**没有**排除 `SuperProductivitySync` 偏好文件，因此（加密或回退明文）token 存储当前会被备份。修复是每个规则文件一条 `<exclude>` 条目，而非新基础设施——见「快速胜利」。

相关文件：

- [`android/app/src/main/java/com/superproductivity/superproductivity/service/BackgroundSyncCredentialStore.kt`](../../android/app/src/main/java/com/superproductivity/superproductivity/service/BackgroundSyncCredentialStore.kt)
- [`src/app/features/android/store/android-sync-bridge.effects.ts`](../../src/app/features/android/store/android-sync-bridge.effects.ts)
- [`android/app/src/main/AndroidManifest.xml`](../../android/app/src/main/AndroidManifest.xml)

### 内置 Issue 提供方密钥（今天会同步 — V1b 主要目标）

- 内置 issue 提供方配置位于 `issueProvider` NgRx 状态中，属于 op-log 模型配置、快照、同步数据与备份的一部分。
- 密钥字段：
  - Jira: `password`
  - GitLab: `token`
  - CalDAV: `password`
  - OpenProject: `token`
  - Redmine: `api_key`
  - Nextcloud Deck: `password`
  - Plainspace: `token`
- Gitea、Trello、Linear、Azure DevOps、GitHub 与 ClickUp **不再是内置**——它们已迁到插件，其密钥是插件配置字段（下一节）。

相关文件：

- [`src/app/features/issue/issue.model.ts`](../../src/app/features/issue/issue.model.ts)
- [`src/app/features/issue/store/issue-provider.reducer.ts`](../../src/app/features/issue/store/issue-provider.reducer.ts)
- [`src/app/op-log/model/model-config.ts`](../../src/app/op-log/model/model-config.ts)
- [`src/app/op-log/backup/state-snapshot.service.ts`](../../src/app/op-log/backup/state-snapshot.service.ts)

### 插件密钥

今天存在三个不同的存储：

- **插件配置（同步 — V1b 目标）：** 插件 issue 提供方 schema 声明 `type: 'password'` 字段（例如 GitHub `token`、ClickUp `apiKey`），经 `PluginUserPersistenceService` 作为常规值存入同步的 `pluginUserData`。这是内置 issue 提供方泄露的插件侧孪生。
- **插件密钥存储（设备本地，已交付 #8633）：** 插件 API 上的 `setSecret`/`getSecret`/`deleteSecret`，由专用 `sup-plugin-secrets` IndexedDB 支撑。仅本地，静态明文，按插件命名空间，在插件卸载**以及**插件缓存清除时清除。这是规范的面向插件密钥存储；本计划在其之上构建，而非再加并行一套。
- **插件 OAuth token（设备本地）：** `sup-plugin-oauth` IndexedDB，仅本地，明文，在卸载/缓存清除时清除。

相关文件：

- [`src/app/plugins/secret/plugin-secret-store.ts`](../../src/app/plugins/secret/plugin-secret-store.ts)
- [`src/app/plugins/secret/plugin-secret.service.ts`](../../src/app/plugins/secret/plugin-secret.service.ts)
- [`src/app/plugins/oauth/plugin-oauth-token-store.ts`](../../src/app/plugins/oauth/plugin-oauth-token-store.ts)
- [`src/app/plugins/plugin-user-persistence.service.ts`](../../src/app/plugins/plugin-user-persistence.service.ts)
- [`src/app/plugins/plugin-config.service.ts`](../../src/app/plugins/plugin-config.service.ts)

### Electron 主进程泄露（早期草稿缺失）

- `electron/jira.ts` 通过 IPC 接收完整 Jira 配置（含 `password`），并通过 electron-log 将原始错误响应记录到磁盘。
- 渲染进程的全局错误处理器将错误对象整包转发到主进程 electron-log；字符串化的 HTTP 错误经常嵌入带 `Authorization` 头的请求配置。
- electron-log 文件持久在磁盘上，且当前没有任何掩码覆盖。

相关文件：

- [`electron/jira.ts`](../../electron/jira.ts)
- [`src/app/core/error-handler/global-error-handler.class.ts`](../../src/app/core/error-handler/global-error-handler.class.ts)

### 现有构建块（有利）

- `packages/sync-core/src/encryption*` 已提供 Argon2id KDF、AES-256-GCM（WebCrypto，带回退 `@noble/ciphers`）、版本化 KDF 参数，以及会话密钥缓存。HKDF 可通过 WebCrypto 原生可用。可移植保险库不需要新的密码学依赖。
- `src/app/imex/file-imex/privacy-export.ts` 已掩码 `password`、`token`、`apiKey`、`secret`、`authorization`、`accessToken`、`authCode`、`api_key`——但漏了 `refreshToken`、`clientSecret`/`client_secret`、`encryptKey`、`apiToken`，且是精确键、区分大小写。见「快速胜利」。
- `PluginAPI.persistDataSynced` 已只记录键长度、永不记录载荷，并用 spec 强制。
- `src/app/plugins/util/plugin-persistence-key.util.ts`（`composeId`）是分隔符安全复合 id 的参考实现。

## 快速胜利（立即交付，独立于 V1）

每一项都小、无 schema 或 UX 影响，且堵住真实漏洞：

1. 在 `data_extraction_rules.xml` 与 `backup_rules.xml` 中为 `SuperProductivitySync` 偏好文件添加 `<exclude>` 条目（KeyStore 密钥反正无法在恢复后存活，因此备份的密文最好也是死重量，最坏是明文回退泄露）。
2. 停止在 `electron/jira.ts` 中记录原始 Jira 响应；仅记录状态 + 脱敏元数据。
3. 扩展隐私导出掩码：增加 `refreshToken`、`clientSecret`、`client_secret`、`encryptKey`、`apiToken`；匹配改为不区分大小写。
4. 在将渲染进程错误转发到主进程 electron-log 之前清理或截断错误对象（丢弃请求配置/头 blob）。

## 架构

两个概念：

- `LocalSecretStore`：设备本地密钥存储。V1 在**所有**平台使用专用仅本地 IndexedDB（`indexedDbProfile`）；原生 OS 支持后端在 V1 之后以同一接口替换存储实现。
- `PortableVault`：为同步 E2EE 用户提供的、经保险库加密的同步密钥记录，作为普通 op-log 实体携带。

`SecretRef` 是元数据。只有 `SecretRef` 与非敏感元数据可存入 NgRx 状态、op-log 操作、快照、备份与插件同步数据；密钥值位于 `LocalSecretStore` 或 `PortableVault` 之后。

```ts
export interface SecretRef {
  kind: 'SecretRef';
  version: 1;
  id: string; // delimiter-safe composite, see "Slot ids"
  ownerType:
    | 'syncProvider'
    | 'issueProvider'
    | 'pluginConfig'
    | 'pluginOAuth'
    | 'nativeBackground';
  ownerId: string;
  field: string;
  storageMode: 'device' | 'portableEncrypted';
  updatedAt: number;
}

export type SecretAccessContext =
  | {
      callerType: 'app' | 'nativeBridge';
      expectedOwnerType: SecretRef['ownerType'];
      expectedOwnerId: string;
      expectedField: string;
    }
  | {
      callerType: 'plugin';
      callerId: string;
      expectedOwnerType: 'pluginConfig' | 'pluginOAuth';
      expectedOwnerId: string;
      expectedField: string;
    };

export interface LocalSecretStoreCapabilities {
  // extend these unions only when a backend actually ships (YAGNI)
  mode: 'localProfile' | 'unavailable';
  backend: 'indexedDbProfile';
  canPersistDeviceSecrets: boolean;
  canUsePortableVault: boolean;
}

export interface LocalSecretStore {
  capabilities(): Promise<LocalSecretStoreCapabilities>;
  set(
    input: SecretRefInput,
    value: string,
    context: SecretAccessContext,
  ): Promise<SecretRef>;
  useSecret<T>(
    ref: SecretRef,
    context: SecretAccessContext,
    fn: (value: string) => Promise<T>,
  ): Promise<T | null>;
  delete(ref: SecretRef, context: SecretAccessContext): Promise<void>;
  exists(ref: SecretRef, context: SecretAccessContext): Promise<boolean>;
}
```

**`SecretAccessContext` 是什么——以及不是什么：** 它是误用防护断言，捕获意外的跨所有者读取与错误接线 bug（错误的所有者类型/id/字段被拒绝；宿主按 `callerId === ownerId` 映射插件拥有的引用）。它**不是**安全边界：上下文是单一 JS 领域中调用方提供的对象，且插件在宿主渲染进程中执行，因此恶意插件可伪造 `app` 上下文或直接打开 IndexedDB。针对它的测试是 API 契约测试，不是安全测试。真正的调用方边界仅随插件进程/源隔离以及主进程强制到来，任何发行说明不得另作声称。

### 槽位 id

同步配置不得包含每设备随机密钥 id。使用来自稳定元数据的确定性槽位 id，使两台设备迁移同一提供方时铸造相同的 `SecretRef`，LWW 不会使任一侧成为孤儿。

- 对每个段做分隔符安全编码（复用/对齐 `plugin-persistence-key.util.ts` 中的 `composeId`）；插件 id 与 schema 字段名是第三方控制的字符串，因此朴素的 `v1:${ownerType}:${ownerId}:${field}` 拼接有歧义（`("a","b:c")` vs `("a:b","c")`）。
- 对照封闭枚举校验 `ownerType`。
- 孤儿 GC：定期清扫所属配置已不存在的本地存储条目，并为同步竞态留宽限期。清除集成会移除同步的 `SecretRef` 与本地/保险库值；在集成仍配置时，在一台设备上替换密钥值不得使另一设备的本地条目失效（值替换更新存储，而非同步元数据）。

### 存储模式

`device`（非 E2EE 同步与所有非同步密钥的默认）：

- 仅存储在当前设备的 `LocalSecretStore` 中。
- 其他设备显示「本设备缺少凭据」并提供重新输入。

`portableEncrypted`（启用同步 E2EE 时的默认）：

- 密钥密文作为普通 op-log 记录同步，在进入状态/op-log/快照代码之前由保险库加密（因此在线路上被同步 E2EE 双重包装）。
- 不得用于引导 SuperSync 访问 token 或同步加密口令的唯一副本——同步凭据与 `encryptKey` 保持设备本地，使保险库解锁永不依赖自身。

### 可移植保险库机制（V1b，E2EE 用户）

刻意最小化——保险库只持有少量亚 KB 记录，因此不需要通用保险库的 DEK/清单/epoch 机制：

- **密钥：** `vaultKey = HKDF-SHA-256(syncE2EEKey, salt = per-vault random salt,
info = 'super-productivity-portable-vault-v1')`。salt 是随机的，在保险库创建时铸造，并以明文元数据存入同步的保险库配置记录（salt 不是密钥）。永不直接使用同步内容密钥。若 E2EE 输入是口令，它已通过现有 Argon2id KDF（与同步 E2EE 相同的实现与参数版本——无 PBKDF2 分叉，无第二个需维护的 KDF）。
- **记录：** 每个密钥用 AES-256-GCM 在 `vaultKey` 下加密，**每次加密使用新鲜的 CSPRNG nonce**（包括更新——多设备在同一密钥下加密，因此 nonce 绝不能由计数器或元数据派生），并用 AAD 绑定 `{recordId, ownerType, ownerId, field, schemaVersion, updatedAt}`。
- **同步：** 记录是普通同步实体，因此 LWW 冲突处理与删除墓碑来自现有 op-log，免费获得。无单独清单。
- **解锁：** 每当同步 E2EE 密钥可用时派生 `vaultKey`（现有会话缓存使这免费）。可选在 `LocalSecretStore` 中持久化包装副本，以便在同步解锁前访问；永不持久化明文密钥。
- **轮换：** 更改同步 E2EE 口令会派生新的 `vaultKey`（新 salt）并重新加密所有记录——在此记录数量下微不足道，且是_真正的_轮换：保留同步历史中的旧密文，仅在攻击者从未拥有旧口令派生材料时才不可解密。在文档中明确：在怀疑口令泄露后轮换保护未来记录，但攻击者已能解密的任何内容（包括旧历史）必须视为已暴露——诚实的补救是轮换第三方 token 本身，UI 应如此说明。
- **残留风险（记录，不要为此工程化）：** 恶意同步目标可将整个数据集回滚到更旧状态，连同其他一切复活已删除的保险库记录。这是现有同步信任模型（E2EE 给机密性，不给新鲜性），恢复的记录最坏是用户可在上游撤销的过期凭据。每保险库 epoch/MAC 方案不值得此处的复杂度；仅当保险库规模超出此量级时再重新评估。
- **无弱口令门控：** 同一密钥材料已保护用户完整同步数据集，因此在其下保管密钥不增加新的暴力暴露。口令强度引导属于同步 E2EE 设置，不属于保险库。

从早期草稿砍掉（与上游重新认证覆盖恢复，「不是密码管理器」非目标适用于计划本身）：`vaultDek` 间接层、经认证的清单、保险库 epoch、包装器集、宽限期重包装、`recoveryKey`、`devicePairing`、通行密钥托管、保险库导出/导入。

## 平台后端

### V1 — 本地配置文件存储（所有平台）

到处一个后端：专用仅本地 IndexedDB 存放密钥值，与同步模型数据分离，在 Electron、浏览器/PWA 与 Android/iOS Capacitor 上 alike。

理由：`sup-sync` 已在每个平台的明文 IndexedDB 中存储 WebDAV 密码与 `encryptKey`，因此拒绝移动端/Web 上 issue token 使用同一层级什么也保护不了，却会使 V1b 成为移动端拦路虎（集成每次会话死亡或要求重新输入）。统一后端也完全删除 V1 中仅会话/不可用 UX 状态。在 Web 上，IndexedDB 驱逐风险与应用数据本身相同——不会更差。

- 仅在同步应用状态中存储 `SecretRef` 元数据；值在本地 DB。
- 不通过常规应用流程同步、备份、记录或导出此数据库。
- 保留 `LocalSecretStore` 接口，以便原生后端日后替换存储实现而无需第二次数据模型迁移。
- 对 `pluginConfig` 拥有的值，用现有 `sup-plugin-secrets` 数据库支撑存储（宿主保留的键命名空间），而非第二个插件密钥表面——其卸载与缓存清除时的按插件清除会自动适用。决策记录于下文。

### V1 之后 — Electron `safeStorage`

主进程 IPC 作为唯一桥接；买到静态 OS 钥匙串保护，并使密钥离开渲染进程可读的配置文件 DB。它**不**买到插件分离（见诚实威胁模型）。

- `electron/ipc-handlers/local-secret-store.ts`，在 `electron/ipc-handler.ts` 中注册；在 `electron/preload.ts` + `electron/electronAPI.d.ts` 中提供窄 preload 方法（`localSecretStoreSet/Resolve/Delete/Capabilities`）。
- 在主进程中使用 `safeStorage.encryptString()`/`decryptString()`；加密 blob 放在 `app.getPath('userData')` 下的小文件/db。
- Linux `basic_text` 后端不得成为静默明文等价回退：要求显式降级同意或提供仅会话。在升级且存在遗留明文凭据时，显示显式选择，而非静默删除。

### V1 之后 — Android

- 原生 `LocalSecretStore`，由 `AndroidKeyStore` 中的 AES-GCM 密钥支撑；密文在私有应用存储中。无明文 `SharedPreferences` 回退——「加密存储」或「不持久化」。
- 快速胜利的备份排除必须在原生密钥写入之前落地；扩展以覆盖新的密钥存储文件。KeyStore 密钥可能无法在恢复后存活，因此恢复的密文视为不可用并触发重新认证。
- 替换当前 `BackgroundSyncCredentialStore` 明文回退。

### V1 之后 — iOS

- 通过原生 Capacitor 桥接使用 Keychain Services；设备本地可访问性类（`kSecAttrSynchronizable=false`；`whenUnlockedThisDeviceOnly`，或仅在后台任务需要时使用 `afterFirstUnlockThisDeviceOnly`）；显式访问组。
- Keychain 条目可在卸载后存活：在首次运行设置期间检测并清除过期 token。

### Web/PWA 说明

- V1 使用与其他地方相同的 `indexedDbProfile` 层级（本地隔离，诚实标注）。
- 若将来需要更强的浏览器方案，「仅会话」意味着仅内存中的服务状态——永不使用 `sessionStorage`、`localStorage`、`window.name` 或 `BroadcastChannel`（浏览器会为会话恢复将 `sessionStorage` 持久化到磁盘）。为这些汇点增加金丝雀测试。
- 永不声称浏览器存储等同于 OS 钥匙串存储。

## 数据流

### 表单

密钥字段使用初始**空控件**，并带每设备提示（「凭据已保存在本设备」/「本设备缺少」）：

- 未触碰或已清空的控件 → `unchanged`（脏状态跟踪免费给出「打了又撤销」的折叠）；
- 已输入值 → `replace`（值进入保险库/本地存储；仅分发新的 `SecretRef`）；
- 显式移除操作 → `clear`（存储条目与同步引用被移除）。

模型中永不存在掩码哨兵（`********`），因此无需哨兵拒绝层。表单模型绝不可向 NgRx 发出密钥值；在分发任何持久化动作之前完成保险库/本地存储写入。

### 运行时解析

服务尽可能晚地解析凭据：

1. 从 NgRx 或提供方私有配置加载公开配置。
2. 通过 `LocalSecretStore` / `PortableVault` 与 `SecretAccessContext` 解析所需 `SecretRef` 值。
3. 构建短生命周期运行时配置对象，用于请求。
4. 永不分发、持久化或记录已解析对象。当已解析密钥必须跨越 IPC（例如经 Electron 主进程的 Jira）时，接收侧也是脱敏表面的一部分。

### 插件配置

- 带 `type: 'password'` 的插件 JSON-schema 字段由宿主拦截：同步插件配置存储 `SecretRef` 值；实际值位于 `sup-plugin-secrets` 支撑的存储（设备模式）或可移植保险库（E2EE 模式）。
- `PluginAPI.getConfig()` 返回配置元数据与 `SecretRef` 值，永不返回已解析密钥。解析通过窄的 `PluginAPI.useSecret(ref, fn)`，宿主断言 `callerId === ownerId`（误用防护；其未声称内容见诚实威胁模型）。
- 已交付的 `setSecret`/`getSecret`/`deleteSecret` API 对插件管理的密钥保持原样；schema-`password` 拦截是宿主管理的补充，共享同一存储与清除生命周期。
- `persistDataSynced` 仍为非密钥存储：载荷日志已移除并用 spec 强制；增加注册表金丝雀，使注册的密钥值在测试中被拒绝。
- 插件 OAuth token 迁移延后；V1 仅为脱敏/金丝雀检查注册这些值。

### 同步提供方配置（保持设备本地；延后加固）

`sup-sync` 中的提供方私有配置（密码、token、`encryptKey`）在 V1 中不变——它已是仅本地，不驱动同步泄露风险。V1 之后，将其移到 OS 支持的 `LocalSecretStore` 后端之后。V1 仍为所有这些字段注册脱敏与金丝雀检查，使它们永不新出现在 op-log 载荷、快照、备份、日志或导出中。

## 迁移策略

### 阶段 0 — 注册表、脱敏、守卫（与 V1a 一起）

- 按领域的敏感路径类型化注册表：同步提供方私有配置、内置 issue 提供方字段、已迁移的 GitHub/ClickUp 插件配置、插件 schema `password` 字段、插件 OAuth token 记录、插件 `setSecret` 值。
- 一个由注册表支撑的 `redactSecrets(value)`，用于日志记录、日志导出、隐私导出、崩溃/错误附加数据、插件/配置载荷日志，**以及 Electron 主进程**（electron-log 写入、转发的渲染进程错误、`electron/jira.ts`）。
- 脱敏键集包括 `apiKey`、`api_key`、`apiToken`、`refreshToken`、`clientSecret`、`client_secret`、`encryptKey`、`authorization`、大小写变体，以及嵌套插件配置密码字段。
- 扫描快照、操作载荷、备份以及渲染进程与主进程日志输出以查找金丝雀密钥值的金丝雀测试辅助；当注册金丝雀出现在持久化动作载荷中时使测试失败的 op-log 捕获守卫。
- 备份导入、远端同步水合、文件同步快照下载、全量状态尾部操作水合、状态缓存写入与 `loadAllData` 使用的预持久化 `AppDataComplete` 清理器。显式处理 `SYNC_IMPORT` / `BACKUP_IMPORT` 替换语义：在导入/水合期间阻塞并发密钥写入，重新运行清理器，若导入替换了引用则重新发出确定性 `SecretRef` 元数据（引用不得在本地条目成为孤儿时丢失）。
- 迁移标记仅存在于本地配置文件存储，永不进入同步状态。
- 退出标准（可证伪）：所有新产生的序列化输出中零原始注册密钥命中——当前状态、持久化动作、op-log 条目、快照、备份、渲染进程与主进程日志、隐私导出、插件同步数据。旧历史/备份可能仍含密钥直至延后清理；V1 警告而非声称已清除。

### V1a — 兼容性与护栏（单独交付，无 schema 破坏）

- 阶段 0 的全部内容。
- 所有平台上带 `indexedDbProfile` 后端的 `LocalSecretStore`。
- 容忍 SecretRef 的读取器，在不覆盖的情况下保留未知/不支持的 `SecretRef` 值。
- 双写管线（见下文门控）置于标志之后，暗中运行。
- 此版本已为 E2EE 用户捕获大部分实用价值（其远端载荷本来就是密文）：本地产物——备份、导出、日志——停止泄露。尽早独立交付。

### V1b — 同步密钥迁移 + 可移植保险库

迁移内置 issue 提供方密钥、插件 schema `password` 字段，以及遗留已迁移的 GitHub/ClickUp 配置；在同一版本交付可移植保险库，使 E2EE 用户永不重新输入凭据，且日后无需第二次 schema/兼容事件。

**过渡 = 静默双写，无阻塞对话框：**

1. 升级客户端同时写入 `SecretRef`（+ 保险库/本地值）与遗留原始字段。过渡期间同步可见安全性不变（原始字段本来就在）；UX 成本为零。
2. 仅当该账户的兼容门控清除时才剥离原始字段（见下）。剥离是自动且静默的。
3. 若剥离**之后**经同步到达原始密钥（落伍旧客户端写入），将其清理进保险库/本地存储，并展示一次性、非阻塞提示：该凭据可能存在于同步历史/备份中，可轮换。永不静默吞掉该事件，也永不阻塞同步。

**兼容门控，按传输拆分（旧客户端无法发出新信号，因此信号缺失绝非证明——故用双写 + 清理，而非信任）：**

- SuperSync：服务器对 op 上传强制的 `minClientVersion`——唯一硬仲裁者。不依赖向量时钟条目（有界、可修剪）。
- 基于文件的同步（WebDAV/Dropbox/本地）：实证验证当前已发布客户端在同步格式版本提升时是否拒绝写入。若会，则格式提升即门控；若忽略未知版本，则记录基于文件的同步**无硬门控**，并无限期依赖双写 + 接收时清理 + 轮换提示（改为在长弃用窗口后剥离原始字段）。

**迁移机制：**

- 确定性槽位 id（见「槽位 id」）使跨设备迁移幂等；相同元数据上的 LWW 不会使任一侧的值成为孤儿。
- E2EE 用户：现有原始已同步密钥静默迁入可移植保险库；任何持有同步口令的设备无需重新输入。
- 非 E2EE 用户：现有已同步密钥保持未迁移（见「无 E2EE 的同步」）；新/替换密钥变为设备本地引用。
- 遗留 GitHub/ClickUp reducer 迁移不得将原始字段复制到插件配置；原始值进入存储，引用进入配置。
- 存储写入失败时，仅在其原始遗留源中保留遗留值，以便下次启动幂等重试；永不通过 NgRx、持久化动作、导入、备份或同步状态重新持久化原始值。
- 在设备迁移成功且门控已剥离同步原始字段之后：删除明文遗留值，保留一两个版本的兼容读取，永不再次写入明文。

### 延后 — 仅本地密钥加固

`sup-sync` 私有配置、`sup-plugin-oauth`、`sup-plugin-secrets` 值，以及 Android 后台同步镜像，在 V1 之后平台加固阶段移到 OS 支持后端之后（相同迁移流：标记 → 存储写入 → 替换/移除遗留 → 仅在成功后清除明文）。

### 延后 — 历史数据清理

旧本地 op 日志、远端历史、快照与备份可能包含先前存储的密钥。V1 防止新泄露并警告；清理是后续工作：

- 在支持处重写/清除 `OPS`、`STATE_CACHE` 当前/备份、`IMPORT_BACKUP`、`PROFILE_DATA`、文件同步 `sync-data.json.state` + `recentOps`，以及远端 SuperSync 快照/操作；门控清除后压缩本地 op 日志；为基于文件的同步强制上传已剥离快照。
- 对 SuperSync，验证保留/压缩是否限制旧原始载荷；若否，记录服务端历史可能保留遗留密钥。
- 发行说明：新备份不再包含原始凭据；较旧备份、复制的同步文件与保留历史可能仍包含——删除/保护旧备份文件，并在可能已暴露时轮换第三方 token。

## 错误处理

| 场景                              | 处理                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 设备本地条目缺失                  | 「本设备缺少凭据」+ 直接重新输入/重新认证操作                                                                                      |
| 本地配置文件存储不可用            | 将受影响集成标为在本设备缺失/只读；永不写入原始回退状态                                                                            |
| 本地条目损坏                      | 不自动删除 `SecretRef`；提供重连/替换以及不含密钥的诊断导出                                                                        |
| 迁移中途失败                      | 仅在原始遗留源中保留遗留值以供重试；不通过 NgRx、op-log、备份或同步状态重新持久化                                                  |
| 同步期间密钥查找失败              | 停止同步并请求凭据；不覆盖或禁用配置                                                                                               |
| 剥离后到达原始密钥                | 清理进存储/保险库；一次性非阻塞轮换提示；永不阻塞同步                                                                              |
| 保险库记录 AAD/解密失败           | 视为缺失（非损坏配置）；提供重新输入；记录脱敏诊断                                                                                 |
| V1 之后 OS 支持存储不可用         | 仅会话（内存）或显式降级模式；Linux `basic_text` 需要显式同意，永不静默明文等价                                                    |

## 备份与恢复规则

- 常规应用备份对设备本地密钥仅包含 `SecretRef` + 提供方元数据，对保险库密钥包含可移植保险库密文（与保险库本身相同的离线暴露）——永不包含明文值。
- 在新设备上恢复备份时，集成显示为「已配置，缺少凭据」（设备本地）或解锁同步后可用（保险库），并带直接重新认证操作。
- V1 之后平台备份在解密密钥与设备绑定时排除原生密钥密文（Android 规则按快速胜利/原生阶段）。

## UX 要求

- V1 设置每个集成恰好需要两种状态：「凭据已保存在本设备」与「本设备缺少」（外加少见的「存储不可用」）。E2EE 同步设备上的保险库凭据直接可用，完全不需要状态芯片。
- V1 中无阻塞升级对话框、无迁移提示、无同意模态。唯一新增用户可见文本是每设备状态提示与一次性剥离后轮换提示。
- 重新认证显式且按提供方；失败的密钥查找永不静默禁用同步或覆盖配置。
- 设置文档明确说明：同步提供方凭据与加密口令有意按设备；集成凭据仅在启用同步 E2EE 时在加密保险库内旅行。
- 发行说明必须说明新备份不再包含原始集成凭据，而较旧备份/同步历史可能仍包含先前保存的值，并给出轮换建议。

## 安全不变量

V1a 护栏不变量：

- 对注册表覆盖的路径，持久化动作捕获、op-log 操作、`BACKUP_IMPORT`、`SYNC_IMPORT`、状态缓存、水合载荷、插件同步数据、`persistDataSynced` 载荷、渲染进程日志、**主进程日志**、错误附加数据、隐私导出或日志导出中无新的原始密钥值。
- 延后的仅本地密钥（`encryptKey`、同步 token、插件 OAuth、插件 `setSecret` 值）留在现有存储中，由注册表/金丝雀覆盖证明无新泄露路径。
- 对新的同步密钥写入无固定密钥混淆。

V1b 不变量：

- 一旦账户的剥离门控已清除，迁移的密钥永不在 NgRx 状态、动作载荷、op-log 操作、备份、插件同步数据或日志中以原始形式出现；双写期间暴露等于现状且从不超出。
- 若存储写入失败，该设备上的集成变为缺失/只读；永不写入原始回退状态。
- 解析断言声明的所有者元数据（误用防护）；调用方身份在渲染进程内**不可验证**，不作更强声称。
- 来自另一设备的 `SecretRef` 加上本地配置文件 DB 解析不出任何东西；这是隔离声明，不是静态加密声明。
- 明文 `vaultKey` 材料永不被同步或以未包装形式持久化；它仅存在于内存（以及现有 E2EE 会话缓存）中。
- 运行时解析的配置对象仅留在调用路径本地。

## 测试策略

V1 测试：

- 带金丝雀值的 `indexedDbProfile` `LocalSecretStore` 单元测试，也在 web/Capacitor 构建目标上（到处单一后端）。
- `SecretAccessContext` 的 API 契约测试（错误所有者类型/id/字段被拒绝；插件引用仅对 `callerId === ownerId` 解析）——标注为契约测试，非安全测试。
- 槽位 id 编码测试：含分隔符的插件 id/字段名不能别名到另一槽位。
- 多设备确定性：客户端 A 与 B 迁移同一集成；同步 B 的元数据不会使 A 的值成为孤儿。
- 保险库测试：AAD 不匹配被拒绝；每次写入新鲜 nonce；口令变更重新加密记录且旧密钥材料不再解密新记录；通过会话缓存的 E2EE 材料解锁无需提示。
- 双写/门控测试：过渡写入两种形式；仅在门控信号后剥离；剥离后原始到达被清理 + 提示，同步不阻塞；兼容客户端保留 `SecretRef` 值；较旧客户端对引用的原始/空覆盖被检测并从本地存储修复。
- 空控件模型的表单测试（未触碰/已清空 → unchanged，已输入 → replace，移除 → clear）。
- 迁移测试：全新安装、现有凭据、部分迁移、失败的存储写入、启用 E2EE 触发静默保险库迁移。
- 金丝雀集成测试：持久化动作捕获、`OPS`、`BACKUP_IMPORT`、`SYNC_IMPORT`、`STATE_CACHE`、文件同步 `sync-data.json.state` + `recentOps`、SuperSync 快照上传、插件 `persistDataSynced`、日志导出、隐私导出、**electron-log 输出**（主进程 + 转发的渲染进程错误），以及任何会话模式的仅内存规则（无 `sessionStorage`/`localStorage`/`window.name` 汇点）。
- 大小写变体与嵌套键的脱敏测试（`apiKey`、`api_key`、`apiToken`、`refreshToken`、`authorization`、`clientSecret`、`client_secret`、`encryptKey`、插件密码字段）。
- E2E 冒烟：在 Electron 上配置提供方，重载，凭据可用；在新配置文件上恢复备份 → 配置存在，凭据按设计缺失/锁定；两台升级的 E2EE 客户端同步 issue 提供方，在持久化存储、op-log 文件或同步快照中零金丝雀命中，且客户端 B 无需重新输入。

延后测试：Electron `safeStorage` 不可用 / Linux `basic_text`；Android KeyStore 失败 + 备份排除元数据；iOS 钥匙串卸载后存活处理。

## 实现草图

V1 可能的新文件：

- `src/app/core/secret-storage/local-secret-store.model.ts`
- `src/app/core/secret-storage/local-secret-store.service.ts`
- `src/app/core/secret-storage/secret-registry.ts`
- `src/app/core/secret-storage/secret-migration.service.ts`
- `src/app/core/secret-storage/redact-secrets.ts`（与 `electron/` 共享）
- `src/app/core/secret-storage/portable-vault.service.ts`（V1b）

V1 可能变更的区域：

- issue 提供方配置表单与 API 服务解析
- 持久化分发前的 issue 提供方动作创建
- 插件配置服务、插件桥接（`useSecret`）、schema-password 拦截到 `sup-plugin-secrets` 支撑的存储
- 备份导入、同步水合、快照下载、状态缓存写入、隐私/日志导出
- `electron/jira.ts`、主进程日志接线（脱敏）
- 保险库记录类型的 op-log 实体注册表 + 校验（V1b）

延后：`electron/ipc-handlers/local-secret-store.ts`、Android/iOS 原生存储 + 备份规则、同步提供方私有配置迁址、插件 OAuth 存储加固。

## V1a 之前所需决策

- 遗留明文读取兼容应保留多久？
- 确认：用现有 `sup-plugin-secrets` DB 支撑 `pluginConfig` 拥有的宿主密钥（推荐——继承清除生命周期）还是在新存储中使用单独命名空间。
- 评估跳过 Electron 上的 `indexedDbProfile`、直接使用主进程 `safeStorage` 后端的成本（web/移动端无论如何保留 `indexedDbProfile`）。推荐默认：先统一 `indexedDbProfile`——一个后端、一条迁移路径，日后到 `safeStorage` 的接口交换对 `LocalSecretStore` 内部。

## V1b 之前必需

- 实现 SuperSync 服务器 `minClientVersion` 上传拒绝。
- 实证验证旧已发布客户端在基于文件的同步格式版本提升时的行为（门控存在 vs. 永久双写，见门控章节）。
- 验证 op-log 实体注册表 + typia 校验能否携带新保险库记录类型而不破坏预 V1a 客户端（若新实体种类破坏旧客户端校验，保险库记录必须排在同一双写门控之后——同一版本，有序推出）。

## 延后至 V1 之后的决策

- SuperSync 保留/压缩是否在迁移后限制旧原始密钥载荷？
- 历史清理自动化范围 vs. 文档化轮换建议。

## 参考

- Electron `safeStorage`: https://www.electronjs.org/docs/latest/api/safe-storage
- Android Keystore system: https://developer.android.com/privacy-and-security/keystore
- Android `EncryptedSharedPreferences` reference: https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences
- Apple Keychain Services: https://developer.apple.com/documentation/security/keychain-services
- MDN SubtleCrypto/Web Crypto API: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto
- 已交付插件密钥存储 (#8633): `src/app/plugins/secret/`
- 同步 E2EE 原语: `packages/sync-core/src/encryption*`
