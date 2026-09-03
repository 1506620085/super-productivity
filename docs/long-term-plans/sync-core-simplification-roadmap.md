# 同步核心简化路线图

> **状态：已规划**

**目标：** 在不破坏行为稳定性的前提下，降低同步栈的认知负担与架构耦合。

**主要焦点：** 客户端同步编排。

**为何现在做：** 同步实现功能丰富且测试充分，但编排层积累了许多边界情况。最高价值的工作是在做更广的协议或服务器重构之前，先简化控制流与边界。

---

## 目标架构

1. `SyncWrapperService` 仍作为应用/UI 边界。
2. 同步结果使用判别联合类型，而非标志位集合。
3. 全量状态流程与增量操作同步分离。
4. 提供方能力显式且更窄。

---

## 优先级

1. 用判别联合类型替换标志位集合
2. 从增量同步中抽出全量状态同步流程
3. 分解冲突解决
4. 简化提供方能力/契约（仅在确有必要时）
5. 仅在漂移成为真实维护问题时才考虑共享协议 schema

---

## 阶段 0：安全护栏

**目的：** 在行为保持型重构之前建立稳定基线。

**必需交付物：** 本阶段应产出具体产物，而非仅探索性笔记。

### 检查清单

- [ ] 识别信号最强的最小单元/集成测试套件，覆盖：
  - `src/app/imex/sync/sync-wrapper.service.ts`
  - `src/app/op-log/sync/operation-log-sync.service.ts`
  - `src/app/op-log/sync/remote-ops-processing.service.ts`
  - `src/app/op-log/sync/conflict-resolution.service.ts`
  - SuperSync 集成场景
  - 基于文件的同步集成场景
- [ ] 盘点所有当前同步结果形态与控制标志，来源：
  - `src/app/op-log/core/types/sync-results.types.ts`
  - `src/app/op-log/sync/operation-log-download.service.ts`
  - `src/app/op-log/sync/operation-log-upload.service.ts`
  - `src/app/op-log/sync/operation-log-sync.service.ts`
  - `src/app/imex/sync/sync-wrapper.service.ts`
- [ ] 为预期边界撰写简短设计说明或 ADR：
  - 全量状态同步与增量同步分开处理
  - 结果类型使用判别联合类型，而非标志位集合
- [ ] 产出 markdown 表格，列出同步结果类型与编排交接中当前使用的每个标志/可选字段
- [ ] 起草增量同步结果的第一版判别联合类型设计

### 退出标准

- [ ] 就当前同步结果与控制标志达成一致清单
- [ ] 当前标志/可选结果字段的 markdown 表格
- [ ] 判别联合类型草稿经评审并接受为起点
- [ ] 就各重构阶段的执行顺序达成一致

---

## 阶段 1：用判别联合类型替换标志位集合

**目的：** 降低分支复杂度，使控制流穷尽且显式。

**范围约束：** 本阶段仅适用于增量同步路径。全量状态结果建模应在阶段 2 抽出这些流程时最终确定。

### 范围

- `src/app/op-log/core/types/sync-results.types.ts`
- `src/app/op-log/sync/operation-log-download.service.ts`
- `src/app/op-log/sync/operation-log-upload.service.ts`
- `src/app/op-log/sync/operation-log-sync.service.ts`
- `src/app/imex/sync/sync-wrapper.service.ts`

### 检查清单

- [ ] 为以下内容定义独立结果类型：
  - 传输层下载结果
  - 传输层上传结果
  - 增量编排步骤结果
  - 增量同步会话结果
- [ ] 替换如下可选字段与组合状态标志：
  - `cancelled`
  - `serverMigrationHandled`
  - `needsFullStateUpload`
  - `localWinOpsCreated`
  - `snapshotVectorClock`
  - `hasMorePiggyback`
- [ ] 将 wrapper/编排器分支改为对 `kind` 的 `switch`
- [ ] 移除可能有多种解释的模糊布尔组合
- [ ] 在可行处加入穷尽性检查

### 建议的结果形态

- `DownloadTransportResult`
- `UploadTransportResult`
- `IncrementalSyncStepResult`
- `IncrementalSyncSessionResult`

### 退出标准

- [ ] Wrapper 与编排器代码按带标签的结果分支，而非布尔组合
- [ ] 结果类型直接编码互斥状态

---

## 阶段 2：抽出全量状态同步流程

**目的：** 从增量 op-sync 路径中移除 `SYNC_IMPORT` 及相关特殊情况。

### 范围

- `src/app/op-log/sync/operation-log-sync.service.ts`
- `src/app/op-log/sync/operation-log-download.service.ts`
- `src/app/op-log/sync/operation-log-upload.service.ts`
- `src/app/op-log/sync/server-migration.service.ts`
- `src/app/op-log/sync/sync-import-filter.service.ts`

### 新模块

- [ ] `src/app/op-log/sync/full-state-sync.service.ts`
- [ ] `src/app/op-log/sync/full-state-sync.types.ts`

### 检查清单

- [ ] 将全量状态职责移到专用服务之后：
  - `SYNC_IMPORT`
  - `BACKUP_IMPORT`
  - `REPAIR`
  - 服务器迁移引导
  - 提供方切换引导
  - 加密/重置场景的干净起步流程
- [ ] 集中用于全量状态冲突决策的「有意义本地数据」检查
- [ ] 集中全量状态冲突准备与解决输入数据
- [ ] 使增量同步专注于：
  - 下载操作
  - 处理操作
  - 上传操作
  - 重试本地胜出操作
- [ ] 保持新客户端、迁移与基于文件的引导场景的现有行为

### 退出标准

- [ ] `OperationLogSyncService` 不再拥有大部分全量状态分支
- [ ] 全量状态行为实现在专用服务边界之后

---

## 阶段 3：分解冲突解决

**目的：** 降低冲突解决层的体量与策略密度。

**风险：** 本路线图中风险最高的阶段。`ConflictResolutionService` 与实体注册表、向量时钟工具、store 选择器及操作应用流程紧耦合。实现开始前本阶段可能需要自己的子计划。

### 范围

- `src/app/op-log/sync/conflict-resolution.service.ts`
- `src/app/op-log/sync/remote-ops-processing.service.ts`

### 新模块

- [ ] `src/app/op-log/sync/conflict-strategies/`

### 检查清单

- [ ] 将实体特定的 LWW 合并逻辑抽到独立策略模块
- [ ] 使主冲突解决服务负责：
  - 编排
  - 重试
  - 持久化更新
  - 批量应用协调
- [ ] 为每个策略增加聚焦测试，而非继续扩大单一巨型 spec 文件

### 退出标准

- [ ] `ConflictResolutionService` 主要是协调器
- [ ] 实体特定合并行为被隔离且更易测试
- [ ] 若依赖抽取大于预期，则存在专用子计划

---

## 阶段 4：简化提供方能力

**目的：** 在更高价值重构完成后，再考虑简化提供方契约。

**状态：** 可选的再评估阶段，非已承诺的重构。仅当阶段 1–3 表明当前提供方契约实质性加剧复杂度时再推进。

### 范围

- `src/app/op-log/sync-providers/provider.interface.ts`
- `src/app/op-log/sync-providers/file-based/file-based-sync-adapter.service.ts`
- `src/app/op-log/sync-providers/wrapped-provider.service.ts`

### 检查清单

- [ ] 评估是否应将 `OperationSyncCapable` 拆为更小能力，例如：
  - 操作传输
  - 快照传输
  - 远端重置能力
  - 序列游标存储
- [ ] 避免强迫基于文件的同步模仿服务端同步——若抽象增加复杂度而非清晰度
- [ ] 在收窄契约的同时保持基于文件的支持行为一致
- [ ] 在阶段 2 之后重新评估 wrapper/适配边界能否简化

### 退出标准

- [ ] 提供方契约更贴近实际职责
- [ ] 基于文件的同步在类型层面与 SuperSync 风格语义的耦合更少

---

## 延后工作

### 共享客户端/服务器 Schema

有用，但优先级低于客户端编排清理。

- [ ] 仅当请求/响应漂移开始造成真实 bug 或反复维护痛点时再重新评估

### 服务器分解

以后有用，但不是今天的主要瓶颈。

- [ ] 仅当服务器复杂度或部署需求实质性变化时再重新评估

---

## 建议执行顺序

1. 阶段 0
2. 阶段 1
3. 评审检查点
4. 阶段 2
5. 阶段 3
6. 重新考虑阶段 4 是否值得做

---

## 评审检查点

### 检查点 A：阶段 1 之后

- [ ] 确认结果类型更易推理
- [ ] 确认不再有模糊的结果组合

### 检查点 B：阶段 2 之后

- [ ] 确认增量同步路径明显更简单
- [ ] 确认全量状态流程已集中且更易审计

---

## 验证策略

- [ ] 每个阶段后对触及的服务运行聚焦单元测试
- [ ] 阶段 1 与 2 之后运行 op-log 同步集成测试
- [ ] 阶段 2 之后运行针对性的 SuperSync 与基于文件的 E2E 场景：
  - 新客户端
  - 提供方切换
  - 同步导入
  - 加密变更
  - 冲突解决

---

## 首个实现切片

若立即开工，从**阶段 1**开始。

原因：

- 它带来最大的认知负担降低（标志位集合 → 穷尽 switch）
- 它自然暴露控制流与结果解释纠缠之处
- 它使全量状态抽取（阶段 2）更易干净设计
