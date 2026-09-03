# Super Productivity 插件开发

本目录包含用于开发 Super Productivity 插件的工具与示例。

## 常用命令

```bash
# Build all plugins
npm run build

# Install dependencies for all plugins
npm run install:all

# Clean build artifacts
npm run clean:dist

# List available plugins
npm run list
```

## 入门

### 前置条件

- Node.js 18 或更高
- npm 或 yarn
- TypeScript 知识（推荐）

### 快速开始

1. **复制示例插件**：

   ```bash
   cp -r example-plugin my-plugin
   cd my-plugin
   ```

2. **安装依赖**：

   ```bash
   npm install
   ```

3. **更新插件元数据**：
   - 编辑 `manifest.json`，填写插件详情
   - 更新 `package.json` 中的插件名称与描述

4. **开始开发**：

   ```bash
   npm run dev
   ```

5. **生产构建**：
   ```bash
   npm run build
   ```

## 项目结构

```
my-plugin/
├── package.json          # NPM package configuration
├── tsconfig.json         # TypeScript configuration
├── webpack.config.js     # Build configuration
├── manifest.json         # Plugin manifest (metadata)
├── src/
│   └── index.ts         # Main plugin code
├── assets/
│   ├── index.html       # Optional UI (for iframe plugins)
│   └── icon.svg         # Plugin icon
├── scripts/
│   └── package.js       # Script to create plugin.zip
└── dist/                # Build output
    ├── plugin.js        # Compiled plugin code (optional for iframe-only plugins)
    ├── manifest.json    # Copied manifest
    └── plugin.zip       # Packaged plugin
```

## 开发流程

### 1. 本地开发

在 Super Productivity 仓库内快速开发：

```bash
# Build and install to local Super Productivity
npm run install-local

# This copies your built plugin to:
# ../../../src/assets/my-plugin/
```

然后以开发模式运行 Super Productivity 以测试插件。

### 2. 监视模式

在修改时自动持续构建插件：

```bash
npm run dev
```

### 3. 类型检查

确保代码类型安全：

```bash
npm run typecheck
```

### 4. 代码检查

检查代码质量：

```bash
npm run lint
```

## 插件 API

插件会收到全局 `PluginAPI` 对象，具备以下能力：

### 配置

- `cfg` - 当前应用配置（主题、平台、版本）

### UI 集成

- `registerMenuEntry()` - 添加菜单项
- `registerHeaderButton()` - 添加顶栏按钮
- `registerSidePanelButton()` - 添加侧栏按钮
- `registerShortcut()` - 注册键盘快捷键
- `showIndexHtmlAsView()` - 显示插件 UI

### 数据访问

- `getTasks()` - 获取全部任务
- `getArchivedTasks()` - 获取已归档任务
- `getCurrentContextTasks()` - 获取当前项目/标签任务
- `updateTask()` - 更新任务
- `addTask()` - 创建新任务
- `getAllProjects()` - 获取全部项目
- `getAllTags()` - 获取全部标签

### 用户交互

- `showSnack()` - 显示 snack bar 通知
- `notify()` - 显示系统通知
- `openDialog()` - 打开自定义对话框

### 数据持久化

- `persistDataSynced()` - 保存插件数据
- `loadSyncedData()` - 加载已保存数据

### 国际化（i18n）

- `translate(key, params?)` - 获取译文
- `formatDate(date, format)` - 按区域设置格式化日期
- `getCurrentLanguage()` - 获取当前语言代码

完整 i18n 指南见 [PLUGIN_I18N.md](PLUGIN_I18N.md)。

### Hooks

为生命周期事件注册处理器：

- `taskComplete` - 任务标记为完成
- `taskUpdate` - 任务被修改
- `taskDelete` - 任务被删除
- `currentTaskChange` - 活动任务变更
- `languageChange` - 应用语言变更
- `finishDay` - 日终

### 用法示例

```typescript
// Register a task complete handler
PluginAPI.registerHook('taskComplete', async (task) => {
  console.log('Task completed:', task);

  PluginAPI.showSnack({
    msg: `Great job completing: ${task.title}`,
    type: 'SUCCESS',
  });
});

// Add a keyboard shortcut
PluginAPI.registerShortcut({
  id: 'my-action',
  label: 'My Plugin Action',
  onExec: async () => {
    const tasks = await PluginAPI.getTasks();
    console.log(`You have ${tasks.length} tasks`);
  },
});

// Use translations (if plugin has i18n support)
const greeting = PluginAPI.translate('MESSAGES.GREETING');
const taskCount = PluginAPI.translate('TASK_COUNT', { count: tasks.length });
const dueDate = PluginAPI.formatDate(task.dueDate, 'short');
```

## 构建以供分发

### 1. 创建插件包

```bash
npm run build
npm run package
```

这会生成可分发的 `dist/plugin.zip`。

### 2. 文件大小限制

- 插件 ZIP：最大 50MB
- 插件代码（plugin.js）：最大 10MB
- 清单：最大 100KB
- index.html：最大 100KB

### 3. 必需文件

插件 ZIP 必须包含：

- `manifest.json` - 插件元数据
- `plugin.js` - 主插件代码；除非这是带有 `iFrame: true` 与 `index.html` 的仅 iframe 插件

可选文件：

- `index.html` - iframe 插件的 UI
- `icon.svg` - 插件图标
- `i18n/*.json` - 多语言支持的翻译文件

## 发布插件

### GitHub Release（推荐）

1. 为插件创建 GitHub 仓库
2. 使用 GitHub Actions 构建发布：

```yaml
name: Build Plugin
on:
  release:
    types: [created]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: npm ci
      - run: npm run build
      - run: npm run package
      - uses: softprops/action-gh-release@v1
        with:
          files: dist/plugin.zip
```

3. 用户可从 releases 下载 `.zip` 文件

### NPM 包

也可将插件源码发布到 npm：

1. 在 `package.json` 中更新 npm scope
2. 构建插件：`npm run build`
3. 发布：`npm publish`

用户需要自行构建，或者你可以包含已构建文件。

## 测试插件

### 1. 开发模式

```bash
# Build your plugin
npm run build

# Copy to Super Productivity assets
npm run install-local

# Run Super Productivity in dev mode
cd ../../.. && npm start
```

### 2. 生产构建

1. 构建插件：`npm run package`
2. 打开 Super Productivity
3. 进入 设置 → 插件
4. 点击「上传插件」
5. 选择你的 `plugin.zip` 文件

### 3. 调试

- 打开浏览器 DevTools 查看控制台日志
- 在 Console 中检查插件错误
- 在插件代码中使用 `console.log()`
- 插件运行在主窗口上下文中

## TypeScript 开发

### 优势

1. **类型安全**：完整 IntelliSense 与编译期检查
2. **API 发现**：所有 PluginAPI 方法自动补全
3. **重构**：借助 TypeScript 安全重构
4. **文档**：IDE 内联文档

### 带类型的示例

```typescript
import type { TaskData, ProjectData } from '@super-productivity/plugin-api';

// Type-safe task handling
async function processTask(task: TaskData): Promise<void> {
  if (task.projectId) {
    const projects = await PluginAPI.getAllProjects();
    const project = projects.find((p) => p.id === task.projectId);

    if (project) {
      console.log(`Task "${task.title}" belongs to project "${project.title}"`);
    }
  }
}

// Type-safe hook registration
PluginAPI.registerHook('taskUpdate', (data: unknown) => {
  const task = data as TaskData;
  processTask(task);
});
```

## 最佳实践

1. **错误处理**：异步操作始终用 try-catch 包裹
2. **性能**：不要用重计算阻塞主线程
3. **状态管理**：用 `persistDataSynced()` 保存插件状态
4. **用户体验**：用 snack 消息提供清晰反馈
5. **权限**：只申请实际需要的权限
6. **版本兼容**：设置合适的 `minSupVersion`
7. **国际化**：添加 i18n 以覆盖更多用户（见 [PLUGIN_I18N.md](PLUGIN_I18N.md)）

## 故障排除

### 插件未加载

- 检查浏览器控制台错误
- 确认 manifest.json 是有效 JSON
- 确保所有必填字段存在
- 检查文件大小限制

### TypeScript 错误

- 运行 `npm run typecheck` 查看全部错误
- 确保已安装 `@super-productivity/plugin-api`
- 检查 tsconfig.json 设置

### 构建问题

- 删除 `dist/` 后重新构建
- 检查 webpack.config.js 是否有错误
- 确保所有依赖已安装

## 示例

### 可用示例

1. **minimal-plugin** - 最简可能插件（约 10 行）
2. **simple-typescript-plugin** - 最小工具链的 TypeScript
3. **example-plugin** - 功能完整的 webpack 示例
4. **boilerplate-solid-js** - 带 i18n 支持的现代 Solid.js 样板
5. **procrastination-buster** - 带现代 UI 的 SolidJS 插件

### 示例特性

**boilerplate-solid-js** 演示：

- 用 SolidJS 构建响应式 UI
- 用 Vite 做快速构建
- 带示例译文的国际化（i18n）支持
- 现代组件架构
- 插件与 iframe 通信
- 插件开发最佳实践

**example-plugin** 演示：

- 带 webpack 的 TypeScript 配置
- 全部 API 方法
- iframe UI 集成
- 状态持久化
- Hook 处理
- 构建配置

**procrastination-buster** 演示：

- 用 SolidJS 构建响应式 UI
- 用 Vite 做快速构建
- 现代组件架构
- 插件与 iframe 通信
- 真实使用场景

## 支持

- GitHub Issues：[Super Productivity Issues](https://github.com/super-productivity/super-productivity/issues)
- 插件 API 文档：见 `packages/plugin-api/README.md`
