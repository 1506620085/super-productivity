# 数据库静态加密

> **状态：** 当前 SuperSync 部署未提供
>
> **上次验证：** 2026-07-29

SuperSync 当前不加密 PostgreSQL 数据库文件或数据库卷。先前的 LUKS 与 PostgreSQL TDE 实现在测试表明无法在生产 OpenVZ 环境中运行后已退役。

退役摘要保留在
[`../archive/encryption-attempts-openvz-incompatible/`](../archive/encryption-attempts-openvz-incompatible/)
以供历史上下文。可执行的 Compose 覆盖、脚本与运维手册已移除；Git 历史仍保留它们以供取证参考。

持久理由与重新审视标准记录于
[仓库决策](../../../docs/supersync-encryption-at-rest-decision.md)。

## 加密与未加密的内容

- 在线 PostgreSQL 文件不由本项目加密。
- 普通数据库转储不会由数据库 E2EE 自动加密。
- 当客户端启用 SuperSync 端到端加密时，客户端在上传前加密操作载荷。路由与因果元数据保持明文；参见 [服务器架构](architecture.md#e2ee-boundary)。
- 备份文件加密是独立的运维控制，不会加密在线数据库。维护中的备份与恢复流程见
  [备份与灾难恢复](backup-and-recovery.md)。

## 运维者指引

将主机、PostgreSQL 凭证、文件系统、提供商快照与备份位置作为敏感基础设施加以保护。若需要加密存储，请通过部署环境支持的基础设施层提供，例如合适虚拟机上的主机级加密或托管数据库服务。

在声称某部署具备静态加密之前，请在确切的生产拓扑上演练迁移、启动/解锁、备份、恢复、密钥轮换、监控与回滚。不要仅从加密算法或归档实现推断监管合规。
