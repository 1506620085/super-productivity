# 使基于文件的同步在多并发客户端下可靠

> **状态：已规划**

## 当前脆弱点

单文件方案（`sync-data.json`）在多个客户端同时同步时有以下具体弱点：

### 1. 上传冲突时的有界重试

`_uploadWithMismatchFallback()`（`file-based-sync-adapter.service.ts`）最多进行 `1 + _MAX_UPLOAD_RETRIES` 次有条件尝试（`_MAX_UPLOAD_RETRIES` 当前为 `2`，共 3 次），且从不强制覆盖。在 rev 不匹配时会重新下载：若远端 rev 确实已变，则视为真正的并发写入，并**立即**抛出可重试错误（额外尝试仅用于重新下载后 rev 未变的瞬时情况）。随后的同步周期会下载并发操作并重建一致快照。这能处理在_检查时可见_的并发写入；但**不能**关闭 §5 所述的 check-then-write 竞态。

### 2. 宽竞态窗口

上传周期为：下载 → 读取状态快照 → 合并操作 → 加密 → 压缩 → 上传。这可能耗时数秒（尤其是大状态 + 归档）。该窗口内任何其他客户端上传都会导致冲突。

### 3. 每次上传都是完整状态

每次上传都包含**完整应用状态**（第 452 行：`getStateSnapshot()`）、两个归档，以及 500 条近期操作。这使文件变大、上传变慢，从而拉宽竞态窗口。

### 4. WebDAV 修订跟踪较粗

WebDAV 使用 `lastmod`（秒级精度）作为修订号。同一秒内的两次上传无法区分。文件内的 `syncVersion` 计数器可补偿，但仅当两次尝试之间实际重新下载了文件时才有效。

### 5. LocalFile 无原子 CAS（已接受的限制 — #8898）

本地文件同步没有服务端 compare-and-swap。`uploadFile()`
（`local-file-sync-base.ts`）将 rev 检查（`downloadFile` + 哈希比较）
与 `writeFile` 作为两个独立、非原子步骤，因此落在检查与写入**之间**的并发写入者不会被检测到，并可能被覆盖（经典的 TOCTOU 竞态）。这是**已接受的限制**，实践中严重度为 LOW，因为多层机制缩小了窗口或缓和了后果：

- 在同一客户端内，并发上传共享上传锁（`LockService`，
  `LOCK_NAMES.UPLOAD` — Web Locks 跨标签页，Electron/Android 上回退为进程内互斥），因此同一客户端的上传周期不会在文件上竞态。这
  **不**跨机器。（下载使用单独的锁；只有上传会写文件。）
- 跨机器争用需要多个写入者写同一文件——外部文件夹同步工具（Syncthing/Dropbox）或直接共享/网络挂载的同步文件夹。OS 级锁跨机器本来也帮不上忙。
- 在_检查时可见_的并发写入会被捕获而非覆盖：
  `_uploadWithMismatchFallback` 从不强制覆盖；rev 不匹配时会重新下载并抛出可重试错误，下一周期会重新应用并发操作。只有落在 check→write 窗口内的写入会逃脱。
- 覆盖前备份（`.bak`，#8786，尽力而为）：覆盖前将当前远端内容复制到 `.bak`，使下次下载能恢复**损坏/中断**的主文件。它**不能**恢复合法的并发覆盖，也不能恢复主文件完全丢失的情况（例如 Android 上先删除再崩溃），且 `.bak` 写入失败时非致命。

因此剩余风险窄但真实：若某写入者的写入落在另一客户端的 check→write 窗口内，其更新可能丢失——仅当该客户端本地 op-log 仍持有这些操作并在后续周期重新上传时才能恢复。这里有两个不同问题，请分开看待：

- **撕裂写入**（写到一半崩溃 → 部分/损坏文件）在 **Electron/桌面** 上已防止：
  `FILE_SYNC_SAVE`（`electron/local-file-sync.ts`）先写到临时文件（`flag: 'wx'`）再 `renameSync`（在 ext4/APFS/NTFS 上原子），失败时清理临时文件。**Android SAF 仍原地写入**
  （`SafBridgePlugin.writeFile` → `openOutputStream`），因此仍可能发生撕裂写入——仅部分由上文尽力而为的 `.bak` 恢复缓解（若主文件丢失而非损坏则完全无效）。原生 temp-DocumentFile + rename 可关闭此问题，但价值较低（移动端实际上是单写入者）。
- **check-then-write CAS 竞态本身**不能由原子 rename 关闭——rename 只使写入原子，不能使 read-compare-write 序列原子。可移植地关闭它需要 OS 级 CAS（`O_EXCL` / 咨询锁），而 LocalFile 各后端并非一致可用。作为已接受限制保留。

## 实践中有多严重？

**对 2 个客户端通常还算好用**，因为：

- 搭便车（piggybacking）机制在重试时合并并发上传
- 向量时钟 + LWW 能正确解决实体级冲突
- 500 条操作缓冲足以捕获并发变更
- 同步间隔（例如 5 分钟）通常提供足够间隔

**在 3+ 客户端或短同步间隔下会变脆弱**，因为单次重试不够，且大文件使上传变慢。

---

## 三级改进

### 第 1 级：加固单文件方案（小改动）

**内容**：在不改变存储模型的前提下修复最明显的弱点。

**对 `file-based-sync-adapter.service.ts` 的改动：**

1. **带指数退避的重试循环**，替代单次重试
   - 将 `_uploadWithRetry()` 替换为循环：最多尝试 3–5 次
   - 重试间加入随机退避（200ms、400ms、800ms + jitter）
   - 每次重试重新下载、重新合并、重新上传
   - 约改动 30 行

2. **上传前加锁文件**（可选，适用于支持的提供方）
   - 上传前写入带客户端 ID + 时间戳的 `sync.lock` 文件
   - 其他客户端检查锁，若较新（< 30s）则跳过/等待
   - 上传后删除锁
   - 代码库中已有先例：`migration.lock`
   - 约新增 50 行

3. **WebDAV：用 ETag 头**替代 `lastmod` 作为修订
   - 冲突检测更精确
   - 需检查 WebDAV 提供方实现

**优点**：代码改动最小，向后兼容，无需迁移
**缺点**：仍有根本限制——单文件仍是瓶颈
**可靠性提升**：在合理同步间隔（2+ 分钟）下，对 3–4 个客户端足够好

---

### 第 2 级：将操作与状态分离（中等改动）

**内容**：拆成两个文件——**状态快照**（不频繁更新）与**操作日志**（每次同步更新）。由于多数同步周期只触碰 ops 文件，争用减少。

**存储结构：**

```
sync-data.json          → 状态快照（每第 N 次同步或按需更新）
sync-ops.jsonl          → 仅追加的操作日志（每次同步更新）
sync-meta.json          → 向量时钟 + syncVersion + 元数据
```

**工作方式：**

- **上传 ops**：将新操作追加到 `sync-ops.jsonl`。比重写完整状态更小更快。
- **下载 ops**：读取 `sync-ops.jsonl`，过滤出新操作。快，因为只有 ops，没有完整状态。
- **快照更新**：定期（每第 10 次同步，或 ops 文件变大时）用当前状态重写 `sync-data.json` 并重置 `sync-ops.jsonl`。
- **冲突**：`sync-meta.json` 含 `syncVersion` 计数器。仅在上传时争用，且文件很小（上传快 → 竞态窗口小）。

**关键洞见**：多数同步周期根本无需触碰大状态文件。Ops 很小。小文件上的冲突少且解决快。

**优点**：争用显著减少，上传更小，有向后兼容的迁移路径
**缺点**：要管理三个文件而非一个；仅追加 JSONL 需要定期压缩；不支持 append 的提供方（Dropbox）需重新上传整个 ops 文件
**可靠性提升**：能很好处理 4–5+ 并发客户端

**需修改的文件：**

- `file-based-sync-adapter.service.ts` — 将上传/下载拆为仅 ops 与快照路径
- `file-based-sync.types.ts` — 新增文件类型常量、ops 文件格式
- 提供方接口 — 可能增加 `appendFile()` 方法（或不支持 append 的提供方直接重新上传 ops 文件）

---

### 第 3 级：每客户端文件（大改动，最稳健）

**内容**：每个客户端只写自己的文件。其他客户端只读。**设计上零写冲突。**

**存储结构：**

```
sp-sync/
  clients/
    <client-id-A>/
      manifest.json                 # 批次列表 + 向量时钟（未加密）
      ops/
        <timestamp>-<seq>.jsonl     # 不可变操作批次文件
      snapshot.json                  # 该客户端的状态快照（加密）
      snapshot-archive-young.json
      snapshot-archive-old.json
    <client-id-B>/
      manifest.json
      ops/
        ...
```

**工作方式：**

- **上传**：向 `clients/<myId>/ops/` 写入新批次文件，更新 `manifest.json`。永不修改其他客户端的文件。
- **下载**：对每个已知对等端，读取 `manifest.json` → 按精确路径下载新批次文件。
- **引导**：新客户端读取任一对方的 `snapshot.json` 作为初始状态，再用批次文件追赶。
- **GC**：一旦所有对等端的向量时钟显示已推进越过旧批次，客户端删除自己的旧批次文件。

**为何消除冲突：**

- 没有两个客户端会写同一文件
- 批次文件一旦写入即不可变（仅追加模型）
- `manifest.json` 是每客户端唯一可变文件，且仅所属客户端写入
- 适用于任意文件存储：WebDAV、Dropbox、LocalFile，**以及** Syncthing/Resilio

**实现**：这将是**新提供方**（不修改现有基于文件的同步），直接实现 `OperationSyncCapable`。现有 `FileBasedSyncAdapterService` 对不需要多客户端可靠性的用户保持不变。

**优点**：零争用，可扩展到任意数量客户端，可与文件夹同步工具配合
**缺点**：要管理更多文件，需要目录列表支持，实现工作量最大，需要迁移路径
**可靠性提升**：可靠处理无限并发客户端

**新文件：**

- `src/app/op-log/sync-providers/file-based/multi-client/multi-client-sync-adapter.service.ts`
- `src/app/op-log/sync-providers/file-based/multi-client/multi-client-sync.types.ts`
- `src/app/op-log/sync-providers/file-based/multi-client/multi-client-gc.service.ts`

**修改的文件：**

- `provider.const.ts` — 新提供方 ID（或现有提供方上的配置开关）
- `provider-manager.service.ts` — 注册新提供方
- `global-config.model.ts` — 多客户端模式配置
- `sync-form.const.ts` — UI 开关或独立提供方选项

---

## 建议

**第 1 级**（重试 + 退避）无论怎样都值得做——小改动即可让当前系统更稳健。

若多客户端可靠性是优先事项，**第 3 级**（每客户端文件）是正确的长期方案。它还顺带自然支持 Syncthing 兼容。第 2 级是半吊子方案，增加复杂度却不能彻底解决问题。

问题在于走 **1 → 3**（现在快速修，以后做正道）还是**直接做 3**。

---

## 第 3 级协调设计

### 是否需要 `listFiles()`？

**需要，但仅用于对等端发现**——可用清单方式最小化。

第 3 级需要 `listFiles()` 做两件事：

1. **发现对等端**：列出 `clients/` 目录以找到其他客户端 ID
2. **查找批次文件**：列出 `clients/<peerId>/ops/` 以找到新操作批次

用**每客户端清单文件**可完全消除需求 #2。每个客户端用自己的批次文件列表更新自己的 `manifest.json`。其他客户端按精确路径读取清单（`clients/<peerId>/manifest.json`）——无需目录列表。

这将 `listFiles()` 缩减为**仅对等端发现**（列出一次 `clients/` 以找新对等端）。已知对等端本地缓存。

### 协调流程（最小化 `listFiles()`）

**首次同步 / 对等端发现**（需调用一次 `listFiles()`）：

1. `listFiles('clients/')` → 发现对等端目录
2. 本地存储已知对等端 ID（localStorage）
3. 读取每个对等端的 `manifest.json` → 获取其批次文件 + 向量时钟
4. 按精确路径下载批次文件 → 应用操作
5. 若在引导：读取任一对方的 `snapshot.json` 作为初始状态

**正常同步周期**（无需 `listFiles()`）：

1. **上传**：写入新批次文件 → 更新自己的 `manifest.json`
2. **下载**：对每个已知对等端，读取 `manifest.json` → 下载新批次文件
3. **定期发现**：偶尔 `listFiles('clients/')`（每第 N 个周期）以找新对等端

### 能否完全避免 `listFiles()`？

**考虑过的替代方案：**

1. **用户配置的对等端**：用户手动输入设备 ID。对 2–3 台设备可行，但 UX 差。
2. **每客户端注册文件**：每个客户端写入 `register/<myId>.json`。仍需列出 `register/` 才能找对等端。
3. **共享注册表文件**：一个列出所有对等端的 `peers.json`。又回到我们试图避免的共享可变文件问题。

**结论**：`listFiles()` 是最干净的方案。缺失的实现很琐碎：

- **Electron**：添加 `ipcMain.handle(IPC_FILE_SYNC_LIST_FILES, ...)`，配合 `fs.readdirSync()` — 约 10 行
- **Android SAF**：在 Capacitor 插件中调用 `DocumentFile.listFiles()` — 自然的 SAF 能力

实现 `listFiles()` 远比设计避开它的发现机制简单。

### 目录创建要求

第 3 级需要存在 `clients/<id>/ops/` 目录：

- **WebDAV**：上传时通过 MKCOL 自动创建父目录（已实现）
- **Dropbox**：`create_folder_v2` API（Dropbox API 已可用）
- **Electron**：`fs.mkdirSync(path, { recursive: true })` — 加入 IPC handler
- **Android SAF**：`DocumentFile.createDirectory()` — 加入 Capacitor 插件

### 按提供方的第 3 级前置条件

| 前置条件                      | WebDAV       | Dropbox                  | Electron                          | Android                        |
| ----------------------------- | ------------ | ------------------------ | --------------------------------- | ------------------------------ |
| `listFiles()`                 | 已有         | 已有                     | **需要 IPC handler**（约 10 行）  | **需要实现**                   |
| 目录创建                    | 自动 (MKCOL) | 需调用 `createDir()`     | 需调用 `mkdirSync()`              | 需调用 `createDirectory()`     |
| 向子目录 `uploadFile()`       | 可用         | 可用                     | 可用                              | 可用                           |
| 从子目录 `downloadFile()`     | 可用         | 可用                     | 可用                              | 可用                           |

---

## 额外发现

### 已解决：搭便车已移除（commit 6ec885cce2）

搭便车已从基于文件的同步适配器中移除。远端操作现在仅通过下一同步周期的 `downloadOps()` 发现，消除了过期搭便车 bug，并简化了上传路径。

### 未使用的校验和字段

`FileBasedSyncData` 已有未使用的 `checksum?: string` 字段（`file-based-sync.types.ts` 第 83 行）。可在任一级改进中用于完整性校验。

### 野外已证实

近期 commit `87d884ed17`（「fix(sync): prevent recurring task duplication across clients」）证实多客户端同步问题是用户真实遇到的，而非仅理论。

### Electron LocalFile 也缺少 `listFiles()`

IPC 事件 `FILE_SYNC_LIST_FILES` 已在 `ipc-events.const.ts:46` 定义，并在 `preload.ts:47-48` 暴露，但 Electron 主进程中**没有 `ipcMain.handle()` 实现**。因此 Android SAF 与 Electron LocalFile 都缺少 `listFiles()`。

### 目录创建因提供方而异

- **WebDAV**：上传时通过 MKCOL 自动创建父目录（`webdav-api.ts` 第 314–345 行）
- **Dropbox 与 LocalFile**：不会自动创建目录——父目录不存在时上传失败
