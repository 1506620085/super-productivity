# 已退役的静态加密实验

> **状态：** 历史性、不受支持，且与当前部署不兼容。

SuperSync 此前曾测试项目自管的 LUKS 存储与 PostgreSQL 透明数据加密。两种方式在生产 OpenVZ 环境中均不可用，因此可执行工具与运维手册已被移除，以免在仓库中留下不安全的部署路径。

实现仍可在 Git 历史中查阅：

- LUKS 工具始于 `cb2e2e65a2`，其测试/迁移支持在
  `c8bce3c8cf`。
- 安全跟进合入于 `0573468797`。
- LUKS 方案退役并归档于 `e050eb99fa`。
- PostgreSQL TDE 实验合入于 `1fdcc9a906`，并在
  `3a58044826` 回滚。

当前状态、安全边界，以及考虑替代方案的评判标准见：

- [`../../docs/encryption-at-rest.md`](../../docs/encryption-at-rest.md)
- [`../../../../docs/supersync-encryption-at-rest-decision.md`](../../../../docs/supersync-encryption-at-rest-decision.md)

任何未来的存储加密项目都需要全新设计，并在实际部署环境上完成经过演练的迁移、回滚、启动、密钥轮换、备份与恢复流程。旧实现仅为历史证据，不能作为该评审的捷径。

备份文件加密是独立于在线数据库加密的另一项控制。请遵循维护中的
[`../../docs/backup-and-recovery.md`](../../docs/backup-and-recovery.md) 指南了解
当前的备份与恢复行为。
