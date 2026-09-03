# 迁移编写规则

Prisma 5.x 将每次迁移包在事务中。PostgreSQL 禁止在事务块内执行
`CREATE INDEX CONCURRENTLY` / `DROP INDEX CONCURRENTLY`，因此 CONCURRENTLY 迁移总是使正常的
`prisma migrate deploy` 路径失败（P3018 / SQLSTATE 25001）。

`scripts/migrate-deploy.sh` 对此做通用恢复：在该特定失败时，它从 Prisma 输出读取失败迁移的名称，带外（无事务、逐语句）运行*该迁移自己的 `migration.sql`*，标记为已应用，然后重试。它对下文描述的锁有界 `ALTER INDEX` 形态有第二种恢复。**它不硬编码任何迁移名、索引名或 SQL 文本**——迁移仅凭其*形态*选择进入某条恢复路径。自该逻辑移入镜像以来，命名为零一直是设计目标：*主机*副本对其所知的迁移会过时并破坏部署。本副本通过镜像构建与 `prisma/migrations` 版本锁定，因此此处的名称不会以同样方式过时，但仍是静默耦合。恢复由
`tests/migrate-deploy-script.spec.ts`（行为性、端到端）与
`tests/migration-sql.spec.ts`（恢复所依赖的迁移 SQL 形态，以及无硬编码名称不变量本身）演练。

## 优先编写不需要恢复的迁移

恢复是安全网，而非快乐路径。按优先级：

1. **无 CONCURRENTLY**，若表足够小以至于短暂锁可接受。
2. **每个迁移文件仅一条 CONCURRENTLY 语句。** Prisma 将单语句迁移作为一次查询发出，Postgres *不会*将其包在隐式事务中，因此 `prisma migrate deploy` 可原生应用，无需恢复。（不要回溯拆分已应用的迁移——见下文「永不编辑已应用的迁移」。）

带外恢复成本随连续待定 CONCURRENTLY 迁移的数量及各自语句数（每语句一个 Prisma 进程）缩放，因此大量积压的部署有意更慢。

## 锁有界 `ALTER INDEX` 迁移的规则

需要对热对象持有 `ACCESS EXCLUSIVE` 锁的 DDL 必须限制其自身的锁等待。`20260720000000_disable_operation_entity_ids_gin_fastupdate` 是已验证的例子：

```sql
SET LOCAL lock_timeout = '1s';
ALTER INDEX "operations_entity_ids_gin" SET (fastupdate = off);
```

**永不要通过提高超时使此类迁移成功。** 等待中的 `ACCESS EXCLUSIVE` 请求会将该表上的每个*新*查询排在其后——实测中，一个平凡读在有人等待时从 79 ms 变为 8005 ms。那是先前故障的形态。输掉竞态的修复是多次短尝试，而不是一次长等待。

注意锁的争用比看起来更容易：规划器对任何针对该表规划的查询，会对该表的**每一个**索引取 `AccessShareLock`，持有至事务结束——因此单个触及该表的慢查询就会饿死窗口，即使它完全不使用任何索引。

迁移仅在**恰好两条语句**时原生重试——最多几秒的 `SET LOCAL lock_timeout`，然后单条 `ALTER INDEX ... SET (...)`。使重试安全的四项属性是：

1. **短边界**：最多 5 秒（`1ms`-`5000ms` 或 `1s`-`5s`）。更长的被拒绝，
   `'0'` 亦然——在 PostgreSQL 中表示*无*超时，即永远等待。
   重试无界等待正是本节要避免的故障。
2. **恰好两条语句**，因此 Postgres 将它们包在隐式事务中，锁超时会回滚迁移且无部分应用。
3. **`ALTER INDEX ... SET (reloption)`**，在重跑时幂等。
4. **无 `CONCURRENTLY`。** *单*语句迁移无隐式事务，因此构建中途的锁超时会留下 `INVALID` 索引，重试无法清除。那些保持失败即响（见下文裸 CREATE 节）。

注意仅规则 2 不够：分割器在*行末*的 `;` 处断开，因此与 `ALTER` 同行的第二条语句仍会以 `);` 结束。真正排除它的是 `ALTER` 模式以**无括号**选项列表完全锚定——`ALTER` 自己的 `)` 总是落在跨度内，因此其后不能有任何内容。

空格与关键字大小写不是承重的——门控用 `grep -Ei` 匹配，如同 CONCURRENTLY 门控。

`SET LOCAL` 与 `ALTER` 必须留在同一 Prisma 事务中，因此此类迁移永不可拆分或带外执行。

锁超时会留下失败的 Prisma 迁移记录；之后的部署只会看到 Prisma 无因的 `P3009`。部署脚本通过将失败尝试标记为已回滚并经 `prisma migrate deploy` 重试来处理任一状态，最多 10 次（一次重试不够——生产在 2026 年 7 月正是因此丢失了整次部署）。最后一次尝试后迁移留为**已回滚**，因此重新运行部署总是安全的。任何不同的 Prisma 错误会响亮失败且不自动 resolve，脚本也永不会自行将此类迁移标记为已应用。

随后的迁移在单独事务中调用 `gin_clean_pending_list`，由五分钟 `statement_timeout` 封顶。保持分离，以便在清理开始前释放 reloption 变更带来的索引锁。若清理超时，检查数据库负载，仅将该清理迁移标记为已回滚，并重新运行部署；清理调用可安全重复。

## 可恢复 CONCURRENTLY 索引迁移的规则

迁移**仅在**其 SQL 同时包含 `DROP INDEX CONCURRENTLY` 与 `CREATE INDEX CONCURRENTLY`（幂等的先删后建形态）时自动恢复。其他任何情况落入带可复制粘贴手动步骤的响亮失败，且**永不**自动标记为已应用。

1. **先删后建，幂等。** 部分/中断的并发构建（留下 `INVALID` 索引）之后的重跑必须成功：

   ```sql
   DROP INDEX CONCURRENTLY IF EXISTS "my_idx";
   CREATE INDEX CONCURRENTLY "my_idx" ON "operations"(...) WHERE ...;
   ```

   **不要**改用 `CREATE INDEX CONCURRENTLY IF NOT EXISTS`——残留的 `INVALID` 索引有正确名称但不可用，因此 `IF NOT EXISTS` 会跳过重建。

2. **每个逻辑块一条语句，以行末 `;` 终止。** 带外分割器在行以 `;` 结束时结束语句。多行语句可以（执行前折叠为一行——对索引 DDL 安全）。

3. **仅整行 `--` 注释。** 同行 SQL 后的尾随/行内注释不会被剥离。

4. **字符串字面量内无 `;`。** 分割器将任何行末 `;` 视为语句终止符。（对所有索引 DDL 成立；`WHERE op_type IN ('A', 'B')` 形式可以——无分号。）

5. **无 `BEGIN` / `COMMIT` / `DROP TABLE`。**

在运行带外 `DROP` 之前，恢复首先终止任何由先前中断部署留下的**孤儿** `CONCURRENTLY` 构建——PostgreSQL 不会注意到客户端在语句中途断开，因此被放弃的构建会保持其表锁，`DROP` 会在每次重试时卡在 `statement_timeout`。终止范围限定为本流水线在当前数据库与角色中的迁移者身份、`active` 会话，以及 `CONCURRENTLY` 查询；完整谓词、其理由与限制位于 `scripts/migrate-deploy.sh` 中的 `terminate_orphaned_concurrently_backends`——权威撰写处，先在那里更新。它使提高 `MIGRATION_TIMEOUT` 并重新运行在构建中途超时的部署能够自愈，而无需手动 `pg_terminate_backend`。迁移者连接还设置 `client_connection_check_interval`（需要 PostgreSQL 14+/Linux，见服务器 README），以便新近放弃的构建在数秒内自行取消；终止覆盖 GUC 无法检测的既有孤儿与半开连接。

竞态恢复（例如多个 Helm init-container 同时滚动）在**专用恢复咨询锁**下串行化，键 `72707370`——有别于 Prisma 自己的 migrate 锁 `72707369`（#9781）。发现锁被持有的恢复会响亮失败并给出诊断指引，而不是将持有者的**在建构建**误认为孤儿；持有者完成后重新运行部署会成功（编排器重启自然如此）。等待为 `MIGRATE_RECOVERY_LOCK_TIMEOUT` 秒（默认 30）。残留的无锁窗口——前锁迁移者版本与当前版本竞态、运维者运行打印的手动恢复语句，或在锁助手失败后降级为无锁的运行（它会响亮警告）——仍可能中止对等方的在建构建；舰队随后通过幂等的先删后建收敛，代价是一次浪费的重建。该权衡正是为何 `P1002` 咨询锁路径仍拒绝自动杀死。

由 `tests/migrate-deploy-script.spec.ts`（终止 SQL 及其顺序）与
`tests/integration/migrate-deploy-orphan-cleanup.integration.spec.ts`（真实的 `pg_terminate_backend` 定向）强制执行。

## 有意例外：裸 `CREATE INDEX CONCURRENTLY`

`20260511000000_add_entity_sequence_index` 是故意的裸
`CREATE INDEX CONCURRENTLY`，**无** `DROP`。其自身注释明确：中断构建留下 `INVALID` 索引「应响亮失败，而不是被标记为已应用的迁移」。恢复守卫要求先删后建形态，正是为了使这个（以及任何未来的裸 CREATE）**不被**自动恢复——它按门控响亮失败，确定性，这是预期行为。由 `tests/migration-sql.spec.ts`（迁移无 `DROP`）与 `tests/migrate-deploy-script.spec.ts`（裸 CREATE 被拒绝，永不标记为已应用）强制执行。

**新索引的裸 vs 先删后建。** 将裸的失败即响形态保留给*正确性关键*索引，其中中断构建应为人停止部署，而非静默重试。对于有正确回退路径的*仅性能*索引——例如 `operations_entity_ids_gin`，其冲突查找回退到标量 `entity_id`——优先可自动恢复的先删后建形态，使中断构建在下次部署时自愈，而不是卡住并需要手动恢复。**不要**回溯转换已应用的裸 CREATE——见下文。

## 永不编辑已应用的迁移

不是因为 `migrate deploy` 会抓住它。**它不会**：在 PostgreSQL 16 与 Prisma 5.22.0 上验证，`migrate deploy` 永不重读已应用迁移的文件，报告「No pending migrations to apply.」并以 0 退出，即使该文件被替换为 `DROP TABLE`。`migrate status` 也沉默；只有 `migrate dev` 通过在影子数据库上重放才会注意到。

无论如何编辑一个：每个已应用它的安装**永不执行新 SQL**，因此改装在那里的修复不会到达已运行过它的人；记录的 `checksum` 永久与文件不一致；运行 `migrate dev` 的贡献者会碰到新内容的影子数据库重放。改为发布新迁移。
