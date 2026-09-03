# SECTION 冲突重放契约

**状态：** 活跃的同步正确性契约。

本文档拥有在服务器拒绝并发本地操作时保留 SECTION reducer 语义的狭义例外。可执行所有者为：

- `src/app/op-log/sync/section-conflict-commutativity.util.ts`
- `src/app/op-log/sync/superseded-operation-resolver.service.ts`
- `src/app/op-log/sync/superseded-operation-resolver.service.spec.ts`
- `e2e/tests/sync/supersync-section-convergence.spec.ts`

## 为何通用实体 LWW 不足够

SECTION action 编码跨分区及其 Project 或 Tag 工作上下文的有序关系。用单个实体的快照替换被拒绝的移动、移除或重排会丢失 reducer 语义：任务可能留在两个容器中、从两者消失，或在各客户端以不同顺序收敛。

因此解析器可以重放被拒绝的 SECTION 意图，而不是将其折叠为通用实体快照。这是刻意的狭义例外，并非允许重放任意被拒绝的 action。

## 准入契约

仅这些 action 家族是候选：

- `SECTION_UPDATE_ORDER`
- `SECTION_ADD_TASK`
- `SECTION_REMOVE_TASK`

仅当以下全部成立时才准入重放：

1. 被拒绝的操作有现有的实体前沿。
2. 恰好一个保留操作匹配受影响的实体/时钟前沿。
3. 该保留行是已应用、已同步、非拒绝的远程操作。
4. `areCommutingSectionOperations()` 识别出确切的成对关系。
5. 操作元数据与用于做出决定的 action payload 精确匹配。

已识别的交叉有意限于：

- 同一任务从移动源分区的移动与移除；以及
- 分区顺序更新与触及其中一个有序分区的放置/移除交叉。

缺失、模糊、畸形或不可交换的证据会保留通用 LWW 回退。切勿仅仅因为两个 action 在某个 fixture 中看起来无害就扩大识别范围。

## 基于状态的投影

已准入的意图针对一个稳定的 NgRx 快照投影，其状态完全由耐用操作表示。在幻影变更检查与快照读取之间没有 `await`；操作日志锁将后续用户 action 挡在恢复事务之后。

`projectSectionReplayAgainstState()` 返回四种结果之一：

- **replay：** 使用当前排序与锚点创建替换操作；
- **work-context-state：** 创建精确的 Project/Tag 状态补偿，以保留工作上下文排序；
- **superseded：** 当前耐用状态已使该意图过时，因此拒绝陈旧前驱而不做替换；或
- **blocked：** 该转换无法安全表示，因此保留通用 LWW 回退。

替换排序由分区顺序或工作上下文任务顺序限定范围。替换使用合并并递增的时钟，支配被拒绝与保留的前沿。在服务器执行冲突检测之前，客户端不得修剪该时钟。

解析器在一次操作日志事务中追加所有替换/补偿操作，并拒绝其陈旧前驱。崩溃不得只暴露恢复的一半。

## 已发布客户端兼容性

处于 v18.4.0–v18.4.3 兼容窗口的客户端理解 schema-4 SECTION 移除，但会忽略后续的工作上下文锚点字段。因此在需要时，语义移除会与完整的 Project/Tag LWW 替换配对，其现有 reducer 可应用该替换以收敛任务排序。

不要用 schema 升级替代此补偿。对替换 payload 的任何更改都必须对照 [`operation-log-architecture.md`](./operation-log-architecture.md#bump-policy--a-bump-does-not-protect-the-released-fleet) 中的已发布机群规则检查。

## 验证

运行聚焦的单元套件：

```bash
npm run test:file src/app/op-log/sync/superseded-operation-resolver.service.spec.ts
```

通过计划中的 SuperSync E2E 工作流运行真实客户端收敛场景，或在专用服务器环境可用时本地运行：

```bash
npm run e2e:file e2e/tests/sync/supersync-section-convergence.spec.ts -- --retries=0
```

E2E 必须继续证明并发移动、移除、重排与依赖放置会收敛并在重启后存活。
