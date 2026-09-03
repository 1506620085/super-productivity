# 备份与灾难恢复

## 架构背景

Super Productivity 使用仅追加的操作日志进行同步。每个客户端（桌面、移动、Web）在本地 IndexedDB 中保留其数据的完整副本。服务器是中继——**客户端是事实来源**，而非服务器。

这意味着灾难恢复比传统服务器权威系统更简单：只要有一台客户端设备幸存，即可恢复所有数据。

## 备份保护的内容

| 数据                                 | 存放位置                   | 为何备份                                   |
| ------------------------------------ | -------------------------- | ------------------------------------------ |
| 用户账户（邮箱、密码哈希）           | 仅服务器                   | 没有这些用户无法认证                       |
| Passkey（WebAuthn 凭证）             | 仅服务器                   | 无法重新生成                               |
| 操作日志                             | 服务器 + 所有客户端        | 若所有客户端设备丢失时的最后手段           |
| 任务/项目/标签数据                   | 由操作日志派生             | 客户端从操作重建                           |

## 备份设置

### 每日自动备份

备份脚本创建两份转储：

- **完整转储**（`supersync_*.sql.gz`）— 包含所有操作的完整数据库（活跃实例约 300MB+）
- **仅账户转储**（`supersync_accounts_*.sql.gz`）— 仅 `users` 与 `passkeys` 表（很小，<1MB）

```bash
# Run manually
./scripts/backup.sh

# Set up daily cron at 3 AM with 3-day retention
(crontab -l 2>/dev/null; echo "0 3 * * * RETENTION_DAYS=3 /path/to/scripts/backup.sh >> /var/log/supersync-backup.log 2>&1") | crontab -
```

备份保存到脚本目录旁的 `backups/`。

### 配置

| 变量             | 默认值               | 说明                                       |
| ---------------- | -------------------- | ------------------------------------------ |
| `BACKUP_DIR`     | `../backups`         | 备份文件存放位置                           |
| `RETENTION_DAYS` | `14`                 | 删除早于此天数的备份                       |
| `DB_CONTAINER`   | `supersync-postgres` | Docker 容器名                              |
| `POSTGRES_USER`  | `supersync`          | 数据库用户                                 |
| `POSTGRES_DB`    | `supersync`          | 数据库名                                   |
| `RCLONE_REMOTE`  | （空）               | 可选的 rclone 远端，用于异地上传           |

### 异地备份（可选）

```bash
# Install rclone
curl https://rclone.org/install.sh | sudo bash

# Configure a remote (e.g., Backblaze B2)
rclone config

# Run backup with upload
RCLONE_REMOTE=b2:my-bucket/supersync ./scripts/backup.sh --upload
```

## 灾难恢复

### 推荐：仅账户恢复

当至少有一台客户端设备近期在线时，这是最简单、最可靠的恢复方法。

**工作原理：**

1. 恢复仅账户转储（users + passkeys）
2. 同步数据（操作、快照）从空开始
3. 客户端重新连接时，缺口检测自动触发
4. 每个客户端将其完整状态重新上传到服务器
5. 所有客户端收敛到一致状态

**步骤：**

```bash
# 1. Restore accounts from backup
gunzip -c backups/supersync_accounts_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i supersync-postgres psql -U supersync supersync

# 2. That's it — clients will re-sync automatically when they connect
```

**为何推荐此方式：**

- 避免部分恢复时出现的 `SYNC_IMPORT_EXISTS` 冲突
- 客户端持有完整数据——它们是权威来源
- 产生干净、一致的服务器状态
- 已由 e2e 测试验证（`supersync-server-backup-revert.spec.ts`）

### 后备：完整数据库恢复

仅当**所有客户端设备均丢失**（无客户端可重新上传数据）时使用。

```bash
# 1. Stop the server
docker compose stop supersync

# 2. Drop existing data and restore the full dump
docker exec -i supersync-postgres psql -U supersync supersync \
  -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
gunzip -c backups/supersync_YYYYMMDD_HHMMSS.sql.gz | \
  docker exec -i supersync-postgres psql -U supersync supersync

# 3. Restart the server
docker compose start supersync
```

> **注意：** 数据库名（上文的 `supersync`）必须与你的部署的
> `POSTGRES_DB` 设置匹配。请检查 `.env` 或 `docker-compose.yml` 中的实际值。

**已知限制：** 若客户端在完整恢复后重新连接，服务器上已有的 `SYNC_IMPORT` 操作可能与客户端的缺口检测机制冲突（`SYNC_IMPORT_EXISTS` 错误）。要解决此问题，请使用应用中的「重置账户」功能清除服务器同步数据，然后重新同步。

### 恢复决策树

```
Server is down / data lost
├── Do any client devices still have data?
│   ├── YES → Use accounts-only restore (recommended)
│   │         Clients will re-upload automatically
│   └── NO  → Use full database restore (fallback)
│             Accept data loss since last backup
```

## 按用户恢复（单个账户被清空）

上述流程恢复的是**整台服务器**。另一种情况：某一用户的账户被清空——通常因为不良的 `SYNC_IMPORT` 将空或陈旧快照传播到其各设备——你需要将该*单个用户*回滚到某一时间点。

应用内的 **从历史恢复** 适用于未加密账户。它对端到端加密账户**无效**：服务器无法解密操作载荷，因此 `generateSnapshotAtSeq` 会抛出 `EncryptedOpsNotSupportedError`。

### 诊断加密下载失败

当加密账户因解密错误同步失败时，不要假定口令全局错误：一条损坏的操作会以其同一用户可见错误拒绝整批下载。客户端会自行分类失败批次——请向受影响用户索取导出日志中的
`Encrypted operation batch could not be processed` 条目（**设置 → 日志**，普通构建）。它仅包含安全元数据：失败操作的 `serverSeq`/`opId`/失败阶段/`errorName`、已解密与已解析计数，以及 `passwordEvidence`。它永不包含口令、token、密文或已解密内容。

保守解释 `passwordEvidence`。`confirmed-for-some-operations` 表示该密钥在该次运行中至少解密了一个操作，这排除了全局错误口令，并指向所列操作。`no-operation-decrypted` **无定论**：错误口令、整段损坏或不同密钥的范围，以及完全无法运行解密的设备会产生相同形态——请逐案阅读每个失败的 `errorName`。`OperationError` 是 AES-GCM 认证失败（错误密钥或损坏数据），无 WebCrypto 的设备将同一认证失败报告为裸 `Error`（回退加密）。`InvalidCiphertextError`/`InvalidCharacterError` 表示截断或损坏的密文，`WebCryptoNotAvailableError` 是环境失败——两者都不是口令证据。

### 恢复混合加密/明文历史

启用加密的客户端若记录
`received a plaintext op while encryption is mandatory`，并非报告口令错误。它在预期仅含加密载荷的账户中发现了明文行。客户端会拒绝完整下载，既不应用其有效前缀，也不推进其持久游标。

若一台**已更新**的客户端仍持有该账户经验证的完整、当前副本，请使用受支持的客户端恢复：

1. 保持其他所有客户端离线，并原样保留该完整客户端。
2. 从该客户端导出完整备份，并作为明文用户数据加以保护。
3. 在其同步设置中，打开 **高级** 并选择 **强制覆盖**。
4. 等待加密的干净开局上传完成，再逐个更新并重新连接其他客户端。
5. 在删除备份前，在全新客户端上验证重建的数据。

强制覆盖会删除混合操作数据集，并将所选客户端的状态作为加密完整状态操作上传，同时保持服务器序列单调性。不要从全新、不完整、陈旧或修复前的客户端运行它。

**不要**通过更改 `isPayloadEncrypted`、应用或跳过该明文行、单独删除该行，或将客户端游标推进越过它来恢复。该标志与周围信封未经认证，因此这些捷径可能应用伪造数据或静默构造不完整状态。若无客户端持有经验证的完整副本，请保留客户端与数据库，先仅检查安全的行元数据，并将任何服务器侧重构视为针对隔离数据库恢复的事故恢复，而非正常同步路径。

真实形态恢复回归测试为
`e2e/tests/sync/supersync-plaintext-history-recovery-9439.spec.ts`。

`scripts/recover-user.ts` 填补了加密恢复缺口。它将用户的操作日志重放到所选 `serverSeq`，用用户的口令解密加密载荷，并写出可导入的 `AppDataComplete` JSON 文件。它对数据库是**只读**的。

> **状态：尚未针对真实加密数据验证。** 该脚本可 lint、构建，且其模块图可加载，但尚未对真实加密账户端到端运行。在事故中依赖它之前，请对已知账户（例如你自己的）验证：在最新 seq 恢复并确认实体计数与在线应用匹配。

**1. 检查** — 找到截止序列（无需加密密钥）：

```bash
DATABASE_URL=... npm run recover-user -- --user <email|id> --inspect
```

这会列出每个完整状态操作（`SYNC_IMPORT` / `BACKUP_IMPORT` / `REPAIR`）及时间戳。识别不良导入；截止为其 `serverSeq` 减 1。

**2. 恢复** — 重放到截止处并写出可导入文件：

```bash
DATABASE_URL=... RECOVER_ENCRYPT_KEY='<the user's passphrase>' \
  npm run recover-user -- --user <email|id> --target-seq <N> --out ./recovered.json
```

添加 `--dry-run` 可预览实体计数而不写入。用户通过 **设置 → 导入/导出 → 从文件导入** 导入结果文件。

**说明：**

- 加密密钥仅从 `RECOVER_ENCRYPT_KEY` 或 `--key-file` 读取——
  永不作为 CLI 参数（进程列表 / shell 历史）。
- 从开发检出运行——它需要 `ts-node` 与 Prisma 客户端，生产镜像不包含这些。将 `DATABASE_URL` 指向已恢复的转储可使运行与生产完全隔离。
- 输出文件持有用户完整的**明文**数据——通过安全通道传输，并在确认恢复后删除每一份副本。

## 主机商备份

若你的 VPS 主机商提供增量备份（例如每日快照），这些可作为额外安全网。但是：

- **不能替代 pg_dump** — 对运行中的 PostgreSQL 数据库做文件系统级备份可能不具备崩溃一致性
- **良好补充** — 它们捕获配置文件、TLS 证书、Docker 设置，以及 pg_dump 不覆盖的其他服务器状态

`pg_dump` cron + 主机商备份的组合能很好地覆盖两种场景。

## 验证备份

```bash
# Check backup exists and has reasonable size
ls -lh backups/

# Verify the dump contains valid SQL
gunzip -c backups/supersync_YYYYMMDD_HHMMSS.sql.gz | head -5

# Check cron is running
cat /var/log/supersync-backup.log
```

## E2E 测试覆盖

备份恢复场景由 `e2e/tests/sync/supersync-server-backup-revert.spec.ts` 中的自动化测试覆盖：

1. **完全数据丢失** — 服务器被清空，单一客户端恢复所有数据
2. **部分回退** — 服务器回退到较旧状态，客户端保留本地数据
3. **仅账户恢复** — 推荐恢复路径，含多客户端收敛
4. **混合加密/明文历史** — 失败关闭，然后通过加密的受信客户端强制覆盖恢复
