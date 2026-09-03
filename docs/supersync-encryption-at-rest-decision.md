# SuperSync 数据库静态加密

> **状态：** 已采纳
>
> **决策日期：** 2026-01
>
> **最后核实：** 2026-07-29

## 决策

当前 SuperSync 部署在不对 PostgreSQL 数据库文件做项目托管加密的情况下运行。仓库不提供或不支持 LUKS 或 PostgreSQL 透明数据加密部署路径。

先前实现的 LUKS 工具需要 `dm-crypt` 及其他在生产 OpenVZ 环境中不可用的主机内核能力。PostgreSQL TDE 实验在该环境中也不可行。两次尝试均已退役，而不是在活跃部署路径中留下不可测试的安全机制。

退役摘要与实现历史指针仍保留在
[`packages/super-sync-server/archive/encryption-attempts-openvz-incompatible/`](../packages/super-sync-server/archive/encryption-attempts-openvz-incompatible/)
作为历史证据。可执行文件与操作手册已移除，以免被误认为受支持的生产路径。

## 安全边界

- PostgreSQL 文件与普通数据库转储不由 SuperSync 加密。请相应保护主机、数据库凭证、文件系统、快照与备份位置。
- SuperSync 端到端加密是单独的客户端功能。启用时，操作载荷在上传前加密，但路由与因果元数据仍为明文。它不加密 PostgreSQL 卷。
- 加密的数据库备份流也与实时数据库文件加密分开。维护中的恢复流程见服务器的
  [备份与恢复指南](../packages/super-sync-server/docs/backup-and-recovery.md)。
- 不要将已归档的 LUKS 设计描述为生产就绪或作为监管合规证明。

## 后果

部署依赖访问控制与托管环境保护数据库文件。需要服务端盲内容机密性的用户应启用 SuperSync E2EE。威胁模型要求加密存储的运维方必须在基础设施层提供该属性，并自行核实备份与恢复行为。

## 重新审视条件

仅在有运维方拥有的提案时重新考虑本决策，且提案须包含：

1. 支持所选机制的部署环境；
2. 在当前 Compose/数据库布局上经过测试的迁移与回滚；
3. 启动、密钥轮换、备份与灾难恢复流程；
4. 监控与已演练的恢复测试；以及
5. 更新后的威胁模型，清晰区分载荷 E2EE、数据库文件加密与备份加密。

可行的未来方向包括迁到带基础设施托管磁盘加密的 KVM 主机，或提供静态加密的托管 PostgreSQL 服务。Git 历史中的退役实现是研究输入，不是通往批准的捷径。
