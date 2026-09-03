# Sync-MD 插件 v2.0.0

一款 SuperProductivity 插件，实现 markdown 文件与项目任务之间的双向同步。

## 功能

- **双向同步**：保持 markdown 文件与 SuperProductivity 任务同步
- **批量 API 集成**：高效批量操作以提升性能
- **智能防抖**：10 秒延迟，避免活跃编辑时的冲突
- **实时监视**：文件系统监视并自动触发同步
- **任务层级**：在 markdown 中保留父子关系
- **现代架构**：基于 Solid.js UI 与模块化 TypeScript

## 快速开始

```bash
# Install dependencies
npm install

# Development mode with hot reload
npm run dev:watch

# Build for production
npm run build

# Package as plugin
npm run package
```

## 架构

### 核心组件

- `src/fileWatcherBatch.ts` - 支持批量 API 的主同步引擎
- `src/background.ts` - 插件生命周期与消息处理
- `src/App.tsx` - 用于配置的 Solid.js UI
- `src/utils/` - 可复用工具（解析器、防抖、文件操作）

### 构建系统

- `build-proper.js` - 主构建脚本
- `build-plugin.js` - 打包为可分发 ZIP
- `watch-and-build.js` - 带自动重建的开发模式

## 配置

```typescript
{
  projectId: "project-uuid",
  filePath: "/path/to/tasks.md",
  syncDirection: "fileToProject" | "projectToFile" | "bidirectional"
}
```

## Markdown 格式

```markdown
- [ ] Parent task
  - [x] <!-- sp:task-id --> Completed subtask
  - [ ] Pending subtask
```

任务通过包含唯一 ID 的 HTML 注释关联。

## 测试

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## 清理

更新后若要移除旧的/不必要的文件：

```bash
chmod +x cleanup.sh
./cleanup.sh
```
