# SuperSync 监控与分析工具

用于监控与分析 SuperSync 服务器存储、操作与用户模式的综合工具套件。

## 快速开始

```bash
# Run all monitoring checks
npm run monitor:all

# Run quick health check (skip deep analysis)
npm run monitor:all:quick

# Save full report to file
npm run monitor:all:save

# Focus on specific user
npm run monitor:all -- --user 29
```

## 可用工具

### 1. 基础监控（`monitor.ts`）

通用服务器健康与用户存储跟踪。

```bash
# System vitals (CPU, memory, disk, DB)
npm run monitor:dev -- stats

# Top 20 users by storage
npm run monitor:dev -- usage

# View usage history/trends
npm run monitor:dev -- usage-history --tail 20

# Active user counts and recent activity
npm run monitor:dev -- active-users
npm run monitor:dev -- active-users --threshold 5 --limit 50

# Recent operations analysis
npm run monitor:dev -- ops --tail 100
npm run monitor:dev -- ops --user 29

# View server logs
npm run monitor:dev -- logs --tail 200
npm run monitor:dev -- logs --search "error"
npm run monitor:dev -- logs --error
```

### 2. 存储分析（`analyze-storage.ts`）

用于调查存储异常与模式的深度分析。

```bash
# Analyze operation size distribution
npm run analyze-storage -- operation-sizes
npm run analyze-storage -- operation-sizes --user 29

# Temporal patterns (bursts, daily/hourly trends)
npm run analyze-storage -- operation-timeline
npm run analyze-storage -- operation-timeline --user 29

# Breakdown by operation/entity types
npm run analyze-storage -- operation-types
npm run analyze-storage -- operation-types --user 29

# Find largest operations
npm run analyze-storage -- large-ops --limit 50

# Detect rapid-fire/sync loops (>5 ops/second by default)
npm run analyze-storage -- rapid-fire --threshold 10

# Analyze snapshot patterns
npm run analyze-storage -- snapshot-analysis

# Complete deep-dive for one user
npm run analyze-storage -- user-deep-dive --user 27

# Export operations to JSON for external analysis
npm run analyze-storage -- export-ops --user 29 --limit 1000

# Compare two users
npm run analyze-storage -- compare-users 27 29
```

全用户操作报告（`operation-sizes`、`operation-types`、`large-ops`、`rapid-fire`、
`operation-timeline` 与 `monitor -- ops`）默认采样最近最活跃的 200 个用户。
`MONITOR_SCOPE_USERS` 可移动该上限 — 需要更宽画面时提高，若报告撞上数据库
`statement_timeout` 则降低。参见 [性能说明](#性能说明)。

它是环境变量而非标志，以便也能到达套件；套件自行构建子命令行且不转发每报告标志：

```bash
MONITOR_SCOPE_USERS=500 npm run analyze-storage -- operation-sizes
MONITOR_SCOPE_USERS=25 npm run monitor:all          # applies to all six reports
```

每个报告会打印其实际测量的总体，包括匹配了多少用户，因此截断样本不会被误认为完整总体。

### 3. 完整监控套件（`run-all-monitoring.ts`）

按顺序运行所有监控与分析工具。

```bash
# Run everything
npm run monitor:all

# Quick mode (skip deep analysis)
npm run monitor:all:quick

# Save to timestamped file in monitoring-reports/
npm run monitor:all:save

# Focus on specific user
npm run monitor:all -- --user 29 --save
```

## 调查工作流

### 工作流 1：通用健康检查

```bash
npm run monitor:all:quick
```

审查：

- 系统生命体征
- 按存储量排名的顶级用户
- 操作大小分布
- 大型操作
- 快速连发检测

### 工作流 2：调查高存储用户

用户存储异常偏高（例如用户 #29 有 28k 操作）：

```bash
# Step 1: Get complete picture
npm run analyze-storage -- user-deep-dive --user 29

# Step 2: Check for rapid-fire patterns
npm run analyze-storage -- rapid-fire --threshold 3

# Step 3: Export for detailed analysis
npm run analyze-storage -- export-ops --user 29 --limit 5000
```

### 工作流 3：调查大型操作

用户操作异常偏大（例如用户 #27 平均 54KB）：

```bash
# Step 1: Find the largest operations among currently-active users.
# This is a recent sample, not a search of all history -- see Performance Notes.
npm run analyze-storage -- large-ops --limit 20

# Step 2: Analyze that user's patterns
npm run analyze-storage -- user-deep-dive --user 27

# Step 3: Compare with "normal" user
npm run analyze-storage -- compare-users 27 29
```

### 工作流 4：调查同步循环

怀疑同步循环或快速连发操作：

```bash
# Step 1: Detect rapid-fire (lower threshold)
npm run analyze-storage -- rapid-fire --threshold 3

# Step 2: Timeline analysis for affected user
npm run analyze-storage -- operation-timeline --user 29

# Step 3: Check operation types
npm run analyze-storage -- operation-types --user 29
```

### 工作流 5：月度报告

生成全面的月度存储报告：

```bash
# Generate and save full report
npm run monitor:all:save

# Review trends
npm run monitor:dev -- usage-history --tail 30
```

### 工作流 6：从操作积压中挖出

保留静默失败（参见服务器日志中的 `Cleanup [old-ops]` 警告）会留下稳态预算无法清掉的
可修剪积压：扫荡 **每天运行一次**，因此默认 25k 每天清 25k — 440 万行积压大约需要六个月，
几百万行需要数月。

```bash
npm run dry-run-old-ops-sweep     # read-only; predicts what would go
```

**在非高峰运行**：它对 `operations` 做两遍完整聚合，会驱逐线上站点依赖的页缓存。它还会略微
_过度_预测 — 它在 SQL 中镜像扫荡的跳过原因，但无法建模扫荡因数据库错误跳过的用户，而这正是
你正在挖出的深前缀队列。下方的 `N user(s) threw before their drain` 计数就是该差异。

对照该数字设定 `OLD_OPS_CLEANUP_MAX_DELETED_PER_RUN`，使积压在确定的若干个夜间清完，然后
**改回**默认值 — 永久偏高的上限会把未来的失控变成更大的失控。分步提高并观察三个信号：

- `N user(s) failed mid-drain` — **删除**批次撞上数据库 `statement_timeout`。降低
  `OLD_OPS_CLEANUP_DELETE_BATCH_SIZE`（冷读慢的主机上尝试 500–1000 而非默认 5000）；
  不要提高超时。
- `N user(s) threw before their drain` — **探测**在深前缀上超时，任何内容被删除之前。降低
  批次大小无济于事；这是需要覆盖因果边界探测的部分索引的队列（参见运维 runbook 中的故障分析与索引 SQL）。
- 连接池繁忙健康告警 — 扫荡在与真实流量竞争。

`Cleanup [old-ops]: abandoned the run after N consecutive candidate failures` 意味着故障是系统性的
（池耗尽、冷缓存、数据库宕机），而非每用户；扫荡刻意停止，而不是以每个一次超时去锤整个舰队。

之后有两件事会让人惊讶。删除数百万行会留下同样多的死元组，因此预期有 autovacuum 工作。
而且表在磁盘上 **不会**缩小 — `DELETE` 把空间还给 PostgreSQL 以供重用，而非还给 OS；只有
`VACUUM FULL` 或 `pg_repack` 会那样做，二者都需要维护窗口。无论如何转储会立即缩小，因为
`pg_dump` 只写存活行。

每日扫荡在应用启动约 10 秒后触发，然后每 24 小时一次，因此 **重启时间决定它运行的小时**。
若扫荡很重，请在安静时段重启 — 且不要在备份窗口期间。

## 输出文件

- **用量历史**：`logs/usage-history.jsonl` — 由 `monitor.ts usage` 追加
- **分析导出**：`analysis-output/` — 来自 `export-ops` 的 JSON 导出
- **完整报告**：`monitoring-reports/` — 来自 `monitor:all --save` 的带时间戳报告

## 常见需调查的模式

### 高操作计数（>10k ops）

可能原因：

- 长期用户（检查 first_op 时间戳）
- 同步循环（检查快速连发检测）
- 小操作（检查平均操作大小）

**调查**：`user-deep-dive`、`operation-timeline`、`rapid-fire`

### 大平均操作大小（>10KB）

可能原因：

- SYNC_IMPORT 操作
- 大任务附件
- 批量操作

**调查**：`large-ops`、`operation-types`，与正常用户比较

### 每秒大量操作

可能原因：

- 设备间同步循环
- 快速用户交互
- 有缺陷的客户端

**调查**：`rapid-fire`、`operation-timeline`、`user-deep-dive` 中的每设备分解

### 大快照

可能原因：

- 高操作计数触发快照
- 大状态大小

**调查**：`snapshot-analysis`，与操作计数的相关性

## 告警（health-alert.sh）

上面的报告是你去读的东西。`health-alert.sh` 是唯一会来找你的东西，而且它是
**必须安装的那一块** — `deploy.sh` 不会启动它，也没有其他东西会运行它：

```bash
(crontab -l 2>/dev/null; echo "*/5 * * * * ALERT_EMAIL=you@example.com /path/to/super-sync-server/scripts/health-alert.sh") | crontab -
```

### 仅有 cron 条目不够 — 你还需要 MTA

`ALERT_EMAIL` 加上上面的 crontab 行能让_检查_跑起来。投递其结果需要可用的 `mail` 命令，
而标准 Debian 与 Ubuntu 没有。安装 `mailutils` 或 `bsd-mailx` — 它们提供 `mail` 本身。
`msmtp` 与 `msmtp-mta` 都不行：msmtp 是传输，`msmtp-mta` 只在底下提供 `sendmail` 接口，
因此单独安装它仍会让检查失败。若 msmtp 是你的中继，请_额外_配合 `bsd-mailx` 使用。

`health-alert.sh` 每次运行都会检查该二进制，并将其缺失记录在 `.health-alert/mail-failed`，
由 `deploy.sh` 呈现。相同的标记模式承载 `.health-alert/oom-check-blind`（见下方 OOM 章节）：
意味着_检查无法运行_的条件在部署时报告，从不进入告警正文，以免它们永久保持 `PROBLEMS`
非空并禁用恢复邮件。在信任该设置之前端到端确认投递：

```bash
echo test | mail -s 'SuperSync test' you@example.com
```

排队型 MTA 在接受时退出 0，而非在投递时，因此请检查消息是否真正到达。若未到达，
`mailx` 会将未投递正文写入 cron 用户的 `~/dead.letter`。

`deploy.sh` 在每次成功部署结束时报告该确切 cron 是否存在、是否仍在完成，以及上次尝试发信
为何失败。若它说 cron 缺失，则没有任何东西在监视服务器。

若在安装 MTA _之前_ cron 已在运行，缺失二进制标记会免费给你该证明：下一次健康运行会发送一条
`SuperSync OK: Health Check Recovered` 消息并清除标记。另一顺序下健康服务器不会发信，
因此使用上面的手动测试。

`deploy.sh` 打印的 `Reason:` 行来自你的 MTA，可能点名收件人地址与中继主机 — 粘贴到 issue 前请脱敏。

### 它检查什么

| #     | 检查                                                  | 触发条件                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0,1,3 | Docker 守护进程、容器状态/健康、重启计数              | 容器宕机、不健康或崩溃循环。已停止的容器报告其退出码（`state: exited (exit 128)`）                                                                                                                                     |
| 2     | OOM 杀死（内核日志）                                  | 最近 6 分钟内有 OOM kill。需要 cron 用户能读内核日志（`systemd-journal` 或 `adm`）；否则跳过并通过下方标记报告，从不作为健康发现。即使 Docker 宕机也会运行                                                                 |
| 4     | `/health` 端点                                        | HTTP != 200                                                                                                                                                                                                            |
| 5     | 磁盘用量                                              | > 85%                                                                                                                                                                                                                  |
| 6     | 长时间运行查询                                        | 任何查询 `active` > `MAX_QUERY_SECONDS`（默认 120）                                                                                                                                                                    |
| 7     | 连接池繁忙                                            | 并发繁忙连接 ≥ `connection_limit` 的 `POOL_WARN_PCT`%（默认 75），且在 **连续两次运行** 中如此                                                                                                                         |
| 8     | 关键操作索引                                          | 非构建中的索引无效/未就绪/未上线                                                                                                                                                                                       |
| 9     | PostgreSQL 原地崩溃重启                               | postmaster 在最近 6 分钟内记录了 `all server processes terminated; reinitializing` — 在仍运行的容器内发生后端崩溃加 WAL 恢复                                                                                           |

检查 2 刻意在 Docker 门控外运行：刚 OOM 杀死了什么的主机，正是 `docker info` 最不可能应答之时。

检查 0–5 在容器或 `/health` 失败时检测中断。检查 6–8 通过应用容器检查数据库，并在服务器仍能应答时捕获前兆。当 `POSTGRES_SERVICE=` 选择外部数据库时这也有效。失败/畸形探测与缺失的 `connection_limit` 本身就是可告警问题，因此新检查不会静默变成惰性。

检查 7 计数 **繁忙** 的连接 — `active`，或持有打开事务 — 而非池已打开的连接。Prisma 在使用后保持连接打开，因此健康服务器在_占用率_上几乎始终接近 `connection_limit`，而本检查正确读低：在托管服务器上，60 个连接中有 57 个打开且为 `idle`，而探测报告 0。这就是为何告警说「繁忙」而非「饱和」— 会动的数字是并发，也是值得叫人的那个。这也意味着 `idle in transaction` 泄漏会出现在这里，但 **从不** 出现在检查 6，其年龄仅对 `active` 会话测量。计数对同步用户是数据库范围的 — 迁移器、监控器或第二副本都会计入 — 而上限是一个客户端的池上限，因此百分比可以合理地超过 100。阈值刻意是相对 `connection_limit` 的 **比率**，而非固定数字：实测稳态与病理查询上限（池大小 ÷ 最坏情况查询时长）处于同一数量级，因此绝对余量很薄，固定阈值无法在池调整大小后存活。

检查 7 也是唯一按 **持续性** 叫人的：必须在连续两次运行（约 10 分钟）中看到越界。它采样瞬时仪表，单次越界通常是一次间隔内自愈的踩踏 — 2026-08-27 早晨就这样产生了三对失败+恢复（04:00Z/06:00Z 的按小时对齐客户端同步，07:00Z 部署重启后的重连羊群）。持续耗尽仍会叫人，晚一个间隔。待定标记（`.health-alert/pool-busy-pending`）在三个间隔后过期，因此三个或更多间隔的空隙不会把两次无关尖峰焊成「持续」条件（更短的盲隙 — 两次尖峰之间的探测失败 — 仍可以，代价是一对有界误报）。

检查 8 比看起来更重要。被中断的 `CREATE INDEX CONCURRENTLY` 会留下 **对读不可用但仍在每次插入时维护** 的索引。若 `operations_entity_ids_gin` 是无效的那个，冲突查找会在每次上传时静默退化为顺序扫描，永久如此，且代码库中没有任何其他东西会报告它。

检查 9 存在是因为 PostgreSQL 在运行中的容器 **内部** 从后端崩溃恢复：postmaster 终止每个连接，重新运行 WAL 恢复，并在数秒内再次应答。`RestartCount` 保持 0，容器从不离开 `running`，而 compose 健康检查需要连续五次失败探测 — 因此检查 0–3 在结构上对其全部盲目。托管服务器在三个月内崩溃重启了 45 次才注意到第一次（[#9695](https://github.com/super-productivity/super-productivity/issues/9695)）；用户每次只看到同步失败。该检查直接读取 postgres 容器日志（应用容器探测做不到：崩溃会杀死其连接），因此当 `POSTGRES_SERVICE=` 选择外部数据库时会跳过 — 外部数据库的可用性仍通过检查 4 与 6–8 显现。

已知的迁移器与夜间备份（`backup.sh`，将其 `pg_dump` 会话标记为 `supersync-backup`）被排除在长查询检查之外 — 完整转储合理地运行数小时，按时间表触发的告警会教你忽略该渠道。二者仍计入检查 7，因此真正饿死连接池的转储仍会被抓住。当前列在 `pg_stat_progress_create_index` 中的索引，以及携带活跃迁移器所持有的确切 DDL 锁的无效索引，被排除在检查 8 之外。后者也覆盖没有进度视图条目的 `DROP INDEX CONCURRENTLY`，同时不隐藏无关的无效索引。每次迁移运行有唯一的数据库 application id；其有限的数据库/客户端超时与定向后端清理在不产生事故/恢复噪声的情况下约束被中断的 DDL。

### 告警阻尼

同一问题的重复告警按内容哈希抑制，因此计数、时长与探测的退出状态被归一化掉 — 每个不同问题你收到一封邮件，清除时另有一封恢复邮件。

除此之外，两条规则限制单个事故能有多吵。它们存在是因为一次事故通常被报告为几个不同问题：长查询使连接池饱和，健康探测随后在其后超时，且其死亡时的状态在运行间交替（124 超时、143 SIGTERM、128 exec 失败）。每一个都是不同哈希，而单槽状态文件在每次翻转时重新发信。

| 规则                                                               | 可调项                            |
| ------------------------------------------------------------------ | --------------------------------- |
| 当前事故中已发过信的问题不再发信                                   | —                                 |
| 恢复需要这么多次连续健康运行                                       | `RECOVERY_CLEAN_RUNS`（默认 2）   |

刻意 **没有** 告警邮件之间的最小间隔：归一化已折叠每个易变字段，因此真正新的哈希意味着尚无人得知的症状，而一刀切的速率上限会因无关的次要问题先发信而把磁盘 95% 或 OOM 告警压半小时。坏值时 `RECOVERY_CLEAN_RUNS` 回退到默认值而非加入 `CONFIG_PROBLEMS`：该字符串是告警正文 _也是_ 去重输入，因此那里的拼写错误会永久保持 `PROBLEMS` 非空并禁用恢复邮件 — 与 OOM 标记相同的陷阱。

状态位于 `.health-alert/`：`state`（每行一个哈希：本事故中已发过信的问题）与 `clean-runs`。

## 自动化

你可以为定期监控设置 cron 任务：

```bash
# Daily health check at 2 AM
0 2 * * * cd /path/to/super-sync-server && npm run monitor:all:quick >> logs/daily-check.log 2>&1

# Weekly full report every Sunday at 3 AM
0 3 * * 0 cd /path/to/super-sync-server && npm run monitor:all:save

# Hourly rapid-fire detection
0 * * * * cd /path/to/super-sync-server && npm run analyze-storage -- rapid-fire >> logs/rapid-fire.log 2>&1
```

## 技巧

1. **先广后窄**：先用 `monitor:all:quick`，再用具体命令下钻
2. **始终保存重要发现**：使用 `--save` 或将输出重定向到文件
3. **比较用户**：用 `compare-users` 理解什么是「正常」与异常
4. **导出做深度分析**：用 `export-ops` 获取原始数据做自定义分析
5. **观察趋势**：定期 `usage-history` 检查揭示增长模式

## 故障排除

### 「Database connection failed」

- 检查 .env 中的 DATABASE_URL
- 确保 PostgreSQL 在运行
- 验证网络访问

### 「Command not found: tsx」

- 全局安装 tsx：`npm install -g tsx`
- 或使用 npx：`npx tsx scripts/analyze-storage.ts ...`

### 「Out of memory」

- 降低 `--limit` 值
- 以快速模式运行
- 增加 Node.js 堆：`NODE_OPTIONS=--max-old-space-size=4096 npm run ...`

### `deploy.sh` 警告「OOM detection is BLIND」

OOM 检查读取 `journalctl -k`。不在 `adm`/`systemd-journal` 中的 cron 用户 —
或任何没有 systemd 的主机 — 得不到输出且 **exit 0**，因此在 2026-08-25 之前该检查
可能静默地永远不触发，而没有 OOM 告警并不证明没有 OOM。现在它会先探测可读性。

不可读的内核日志是损坏的能力，而非不健康的服务，因此记录在 `.health-alert/oom-check-blind`
并由 `deploy.sh` 与 `mail-failed` 标记一并呈现 — 刻意 **不** 加入告警正文。放在那里会
永久保持 `PROBLEMS` 非空，而 `[ -n "$PROBLEMS" ]` 门控恢复分支，因此仅缺一个组的主机上
`Health Check Recovered` 将永远无法再发送。（告警本身会继续到达：去重键是内容哈希，
因此新问题仍会改变哈希并仍会发信。）

请修复而非忽略：`sudo usermod -aG systemd-journal "$USER"`
（需要重新登录）。优先 `systemd-journal` 而非 `adm` — 它只授予日志读取而无其他，
而 `adm` 还广泛打开 `/var/log`。以 root 运行 cron 也行，但授予的远超这一次读取所需。
日志可读后标记在下次运行时自行清除。

### 「PostgreSQL canceled this query because it exceeded statement_timeout」

报告不再继承部署的 `statement_timeout`。`monitoring-db.ts` 在连接字符串上追加自己的
（`MONITOR_STATEMENT_TIMEOUT_MS`，默认 300000ms），因为部署的值是为面向用户的同步请求
定尺寸的，慢查询意味着有人在等待 — 对报告而言是错误的预算。

这也意味着监控在标准实例上是有上限的，标准实例设置了 **无**
（`statement_timeout` 是 `env.example` 中的可选恢复护栏，且 `docker-compose.yml` 刻意不打开）。
这退役了这里的旧失败形态 — 慢报告占用池连接直到有人杀死它，即 2026-07-20 事故的形态 —
代价是曾经会磨上 400 秒的标准实例报告现在会被取消。当你想要那个时再提高该变量。

应用自己的会话在标准实例上仍无上限。要结束其中一个，用
`SELECT pid, query_start, left(query, 80) FROM pg_stat_activity WHERE state = 'active'`
找到它，并用 `SELECT pg_cancel_backend(<pid>)` 停止它。监控会话将自己标识为
`application_name = 'supersync-monitor'`，这也是 `health-alert.sh` 知道不对长时间运行报告叫人的方式。

- **先检查 `payload_bytes` 回填。** 仍为 0 的行使每个大小表达式读取载荷本身，每行一次行外
  TOAST 取回，是这些报告中最大的每行成本 — 实测为回填路径的 6.5 倍块与 10.7 倍时间。
  `SELECT EXISTS (SELECT 1 FROM operations WHERE payload_bytes = 0)` 通过部分索引一次探测即可回答。
  `npm run migrate-payload-bytes` 修复它；可在线安全运行（分批、主键更新、无表锁），
  但是长回填，不是快速修复。
- **在缩小样本之前提高 `MONITOR_STATEMENT_TIMEOUT_MS`。** 这些脚本不继承运营者的请求路径超时：
  `monitoring-db.ts` 在连接字符串上追加自己的（默认 300000ms），因为按用户不等待同步定尺寸的预算
  对舰队级报告是错误的预算。若报告仍被取消，诚实的问题是它需要更久还是真正病态 —
  先提高这个，然后才削减样本，这样你才能知道是哪一个。
- 降低 `MONITOR_SCOPE_USERS`；它是约束这些报告成本的东西
  （`MONITOR_SCOPE_USERS=25 npm run monitor:all`）。
- 用 `--user <id>` 限定到一个账户 — `operation-sizes`、`operation-types`、`operation-timeline`
  与 `monitor -- ops` 支持。`large-ops` 与 `rapid-fire` 仅舰队级。
- 若报告在较小的 `MONITOR_SCOPE_USERS` 下仍慢，数据库本身负载过高 — 检查 `monitor -- stats`
  与 `health-alert.sh` 中的长查询告警。

## 开发

要添加新的分析命令：

1. 向 `scripts/analyze-storage.ts` 添加函数
2. 向 `main()` 的 switch 添加分支
3. 若应在完整套件中运行，更新 `run-all-monitoring.ts` 中的 `getMonitoringCommands()`
4. 在此文档中记录
5. **若它读取 `operations`，** 通过 `scripts/monitoring-scope.ts` 中的 `resolveOperationScope()`
   驱动它，并将其加入 `tests/monitoring-scripts.spec.ts` 中的 `ALL_USER_OPERATION_REPORTS`。
   该测试保证下方边界不会静默回退；未列在那里的新报告未受检查。

## 性能说明

墙钟时间取决于实例，且自边界重写以来未重新测量；将下方结构视为契约，而非时长。

### 操作报告如何保持有界

`ops`、`operation-sizes`、`operation-types`、`large-ops`、`rapid-fire` 与
`operation-timeline` 是读取 `operations` 的报告，该表是目前最大的。它们共享一个驱动
（`scripts/monitoring-scope.ts` 中的 `resolveOperationScope()`）：按设备心跳的
`MONITOR_SCOPE_USERS` 个最近最活跃用户，并对每个用户通过 `(user_id, server_seq)` 索引
向后读取最新操作的尾部。

**对 `operations` 的工作因此是 `users x tail`，且不随表增长。** 在 8610 账户 / 110 万操作的
fixture 上实测：200 次索引下降，约 1500 块，当操作表缩小 10 倍时保持平坦。尤其是
`monitor ops` 从 68919 块与 430 块临时溢出变为 1720 块。

_驱动_是另一回事，且刻意不声称恒定：`sync_devices` 在 `last_seen_at` 上没有索引，因此选择
前 N 是顺序扫描加 top-N 排序，与设备数线性相关。它很小（8610 账户时 72 块 / 15ms，实测）
且从不触及 `operations`，但它是下一个会绑定的项 — 在 861000 设备时是 10476 块与 1.1s。
若它曾经重要，`sync_devices (last_seen_at)` 上的索引是修复。

该边界是全部意义所在，因此编辑这些查询时请保持它：

- 从不从 `users`、`user_sync_state` 或无上限的 `sync_devices` 扫描驱动每用户尾部。那些随每次
  注册增长，包括多年前停止同步的账户。
- **每个报告解析一次** 范围，并在其语句间重用用户列表。实时心跳持续重排 `sync_devices`，
  因此每语句重新运行驱动会让同一报告的表格描述不同总体 — `operation-types` 有三张表，
  `operation-sizes` 有两张。
- 从不对表本身采样（`TABLESAMPLE SYSTEM (1)` 之类）。持续增长的表的百分之一不是边界。
- 在扫描处计算大小表达式，从不在将 `payload` 向前投影的 CTE 上计算。额外的物化遍次复制每个
  内联存储的载荷并将其溢出到临时文件（实测 20k 条 12KB 行上 46ms/559 临时块 vs 17ms/无）。
- 将 `received_at` 窗口保持在每用户尾部之外。在其内部，LIMIT 不再约束任何东西：Postgres
  会遍历用户的全部历史寻找匹配。

这些报告是近期活动的样本，而非全历史统计 — 打印的页头准确说明每个测量了哪个总体以及匹配了
多少用户。`operation-sizes`、`operation-types`、`operation-timeline` 与 `monitor -- ops`
接受 `--user <id>` 以直接读取一个账户的索引尾部而非采样舰队；`large-ops` 与 `rapid-fire` 不接受。

一项能力确实丢失了：`large-ops` 曾经采样 _全部_ 历史的 1%，因此能浮出旧异常值。它现在报告
当前活跃用户最新操作中的最大者，这回答「现在是否有东西在爆炸」而非「有史以来写过的最大行是什么」。
精确回答后者需要 `payload_bytes` 上的索引 — 为监控便利在上传热路径上永久增加写成本 —
因此刻意不做。

## 安全说明

- 导出包含完整操作载荷 — 请安全处理
- 输出包含用户邮箱 — 请注意隐私
- 加密载荷在分析中显示为已加密
- 定期清理旧报告

---

**有问题或议题？** 提交 issue 或查看主 SuperSync 文档。
