# Markdown ID 检查结果

## 概述

SuperProductivity 的 sync-md 插件使用嵌入在任务备注中的 HTML 注释，跟踪 SuperProductivity 任务与对应 markdown 文件条目之间的关系。

## ID 格式

插件使用以下格式在任务备注中存储 markdown ID：

```
<!-- sp:id -->
```

其中 `id` 通常是来自 SuperProductivity 的任务 ID，从而在任务与其 markdown 表示之间建立双向链接。

## 工作原理

1. **在 Markdown 文件中**：任务同步到 markdown 时，每行任务都会包含 ID：

   ```markdown
   - [ ] <!-- sp:task-id-123 --> Task title here
   - [x] <!-- sp:task-id-456 --> Completed task
   ```

2. **在 SuperProductivity 中**：同一 ID 存储在任务的备注字段中，使同步过程能够在两个系统之间匹配任务。

## 检查脚本

已在 `/scripts/inspect-sync.ts` 创建脚本，可在 SuperProductivity 插件上下文中运行，用于：

- 统计任务总数以及带有 markdown ID 的任务数
- 查找重复 ID（潜在同步问题）
- 识别孤立 ID（markdown ID 与任务 ID 不一致）
- 按项目分组任务
- 检测格式错误的 ID 模式

### 运行检查

运行检查脚本：

1. 确保 sync-md 插件已在 SuperProductivity 中加载
2. 脚本在插件上下文中加载时会自动执行
3. 查看控制台输出以获取详细结果

### 关注点

- **未找到 ID**：若没有任务带有 markdown ID，说明尚未有任务同步到 markdown
- **重复 ID**：多个任务共享同一 markdown ID，表明存在同步问题
- **孤立 ID**：当 markdown ID 与任务 ID 不匹配时，可能是手动编辑所致
- **格式错误的 ID**：格式不正确的 ID 可能无法正常同步

## 常见模式

基于代码分析，插件使用以下模式：

1. **标准格式**：`<!-- sp:task-id -->` - 由 sync-md 插件使用
2. **旧版格式**：`(task-id)` - 用于较旧的同步逻辑（标题开头的括号）

## 故障排除

若任务未能正确同步：

1. 运行检查脚本以排查 ID 问题
2. 查找重复或格式错误的 ID
3. 检查任务的备注字段是否已填充
4. 确认 markdown 文件使用了正确的 ID 格式

## 技术细节

- ID 会被净化，仅保留：`a-zA-Z0-9_-`
- ID 注释必须精确间距：`<!-- sp:id -->`
- ID 使用正则解析：`/<!-- sp:([a-zA-Z0-9_-]+) -->/`
- 同步过程通过这些 ID 匹配任务，以确定需要更新的内容
