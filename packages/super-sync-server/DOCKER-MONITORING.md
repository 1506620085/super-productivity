# 生产环境 Docker 监控指南

用于监控 SuperSync 生产 Docker 容器的快速参考。

## 前置条件

- Docker 容器正在运行（默认名称：`supersync-server`）
- 若使用自定义容器名：`export SUPERSYNC_CONTAINER=your-container-name`

## 快速开始

```bash
cd packages/super-sync-server

# View current storage usage (your use case!)
npm run docker:monitor:usage

# Complete monitoring suite (saves to file in container)
npm run docker:monitor:all

# Interactive shell
npm run docker:shell
```

## 常用命令

### 基础健康检查

```bash
# System vitals (CPU, memory, disk, DB)
./scripts/docker-monitor.sh stats

# Top 20 users by storage (MOST USEFUL for your current investigation)
./scripts/docker-monitor.sh usage

# Active user counts and engagement metrics
./scripts/docker-monitor.sh active-users

# Recent operations
./scripts/docker-monitor.sh ops --tail 100

# Server logs
./scripts/docker-monitor.sh logs --tail 200
./scripts/docker-monitor.sh logs --error
```

### 调查特定用户

根据你的生产数据，调查异常情况：

```bash
# User #29 with 28k operations (171 bytes avg)
./scripts/docker-monitor.sh analyze user-deep-dive --user 29
./scripts/docker-monitor.sh analyze rapid-fire --threshold 3

# User #27 with huge operations (54 KB avg)
./scripts/docker-monitor.sh analyze user-deep-dive --user 27
./scripts/docker-monitor.sh analyze large-ops --limit 20

# Compare the two
./scripts/docker-monitor.sh analyze compare-users 27 29
```

### 分析命令

```bash
# Operation size distribution
./scripts/docker-monitor.sh analyze operation-sizes
./scripts/docker-monitor.sh analyze operation-sizes --user 29

# Detect sync loops/rapid-fire
./scripts/docker-monitor.sh analyze rapid-fire --threshold 5

# Find largest operations
./scripts/docker-monitor.sh analyze large-ops --limit 50

# Timeline analysis (daily/hourly patterns)
./scripts/docker-monitor.sh analyze operation-timeline --user 29

# Operation type breakdown
./scripts/docker-monitor.sh analyze operation-types --user 29

# Snapshot analysis
./scripts/docker-monitor.sh analyze snapshot-analysis

# Export data for offline analysis
./scripts/docker-monitor.sh analyze export-ops --user 29 --limit 1000
```

### 完整监控套件

```bash
# Run all checks (takes 1-3 minutes)
./scripts/docker-monitor.sh monitor-all

# Quick mode (skip deep analysis, ~30 seconds)
./scripts/docker-monitor.sh monitor-all --quick

# Save report to file in container
./scripts/docker-monitor.sh monitor-all --save

# Focus on specific user
./scripts/docker-monitor.sh monitor-all --user 29 --save
```

### 从容器获取报告

```bash
# Copy all reports from container to host
./scripts/docker-monitor.sh get-reports ./my-reports

# Files copied:
# - monitoring-reports/*.txt (from monitor-all --save)
# - analysis-output/*.json (from export-ops)
# - usage-history.jsonl (usage tracking over time)
```

## 直接使用 Docker 命令

若你更倾向不使用封装脚本：

```bash
# Basic monitoring (uses compiled JS)
docker exec -it supersync-server node dist/scripts/monitor.js usage
docker exec -it supersync-server node dist/scripts/monitor.js stats
docker exec -it supersync-server node dist/scripts/monitor.js active-users
docker exec -it supersync-server node dist/scripts/monitor.js ops --user 29

# Analysis (requires tsx - auto-installed on first use)
docker exec -it supersync-server tsx scripts/analyze-storage.ts user-deep-dive --user 29

# Interactive shell
docker exec -it supersync-server sh

# Inside the shell:
cd /app
tsx scripts/analyze-storage.ts --help
node dist/scripts/monitor.js --help
```

## 自动化监控

在 Docker 宿主机上设置 cron 任务：

```bash
# Add to host crontab
crontab -e

# Daily usage snapshot at 2 AM
0 2 * * * cd /path/to/super-productivity/packages/super-sync-server && ./scripts/docker-monitor.sh usage >> /var/log/supersync-daily.log 2>&1

# Weekly full report every Sunday at 3 AM
0 3 * * 0 cd /path/to/super-productivity/packages/super-sync-server && ./scripts/docker-monitor.sh monitor-all --save

# Hourly rapid-fire detection
0 * * * * cd /path/to/super-productivity/packages/super-sync-server && ./scripts/docker-monitor.sh analyze rapid-fire >> /var/log/supersync-rapid-fire.log 2>&1
```

## 推荐调查流程

基于你当前的生产发现：

### 步骤 1：把握整体情况

```bash
./scripts/docker-monitor.sh monitor-all --save
./scripts/docker-monitor.sh get-reports ./investigation-$(date +%Y%m%d)
```

### 步骤 2：调查用户 #29（2.8 万条微小操作）

```bash
./scripts/docker-monitor.sh analyze user-deep-dive --user 29
./scripts/docker-monitor.sh analyze rapid-fire --threshold 3
./scripts/docker-monitor.sh analyze operation-timeline --user 29
```

### 步骤 3：调查用户 #27（超大操作）

```bash
./scripts/docker-monitor.sh analyze user-deep-dive --user 27
./scripts/docker-monitor.sh analyze large-ops --limit 10
```

### 步骤 4：导出数据做更深入分析

```bash
./scripts/docker-monitor.sh analyze export-ops --user 29 --limit 5000
./scripts/docker-monitor.sh analyze export-ops --user 27 --limit 1000
./scripts/docker-monitor.sh get-reports ./exports
```

## 故障排查

### 找不到容器

```bash
# List running containers
docker ps

# Set custom container name
export SUPERSYNC_CONTAINER=my-container-name
./scripts/docker-monitor.sh usage
```

### 找不到 tsx（首次使用）

脚本会在首次使用时自动在容器内全局安装 `tsx`。该安装会持续到容器被重建为止。

手动安装：

```bash
docker exec supersync-server npm install -g tsx
```

### 脚本权限被拒绝

```bash
chmod +x packages/super-sync-server/scripts/docker-monitor.sh
```

### 容器内存不足

提高 Docker 内存限制，或缩小分析范围：

```bash
# Reduce limits
./scripts/docker-monitor.sh analyze large-ops --limit 10
./scripts/docker-monitor.sh analyze export-ops --user 29 --limit 100
```

### 获取报告时找不到文件

请先运行带 `--save` 的命令：

```bash
./scripts/docker-monitor.sh monitor-all --save
./scripts/docker-monitor.sh get-reports .
```

## 性能说明

耗时取决于具体实例，目前尚未系统测量——2026-08-07 的生产运行耗时 363.8 秒，十份报告中有六份直接失败。文档约定的是成本的*形态*，而非具体时长：参见
[操作报告如何保持有界](scripts/MONITORING-README.md#how-the-operations-reports-stay-bounded)。

这些脚本使用各自的语句超时（`MONITOR_STATEMENT_TIMEOUT_MS`，默认 300000ms），而不是运维人员 `DATABASE_URL` 上的超时——后者是为同步请求路径设定的。若报告仍被取消，应首先提高该值：

```bash
docker exec -e MONITOR_STATEMENT_TIMEOUT_MS=600000 supersync-server node dist/scripts/run-all-monitoring.js
```

然后检查 `payload_bytes` 回填，之后再降低
`MONITOR_SCOPE_USERS`
（`docker exec -e MONITOR_SCOPE_USERS=25 supersync-server node dist/scripts/run-all-monitoring.js`）
——详见该文档的故障排查章节。监控连接会将自身标识为 `supersync-monitor`，`health-alert.sh` 据此知道不必因长时间运行的报告而告警。

## 安全说明

- 脚本在容器内以 `supersync` 用户运行
- 导出数据包含完整操作载荷——请妥善安全处理
- 报告中包含用户邮箱
- 请定期清理旧报告以节省磁盘空间

## 文件位置（容器内）

- 监控报告：`/app/monitoring-reports/`
- 分析导出：`/app/analysis-output/`
- 用量历史：`/app/logs/usage-history.jsonl`
- 服务器日志：`/app/logs/app.log`

## 后续步骤

收集数据后：

1. 审阅报告
2. 识别模式（同步循环、大操作等）
3. 检查受影响用户的客户端日志
4. 考虑实施修复或联系用户
5. 建立定期监控以捕获未来问题

详细命令文档见 [MONITORING-README.md](scripts/MONITORING-README.md)。
