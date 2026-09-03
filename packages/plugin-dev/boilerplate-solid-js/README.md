# Super Productivity 的 Solid.js 样板插件

基于 TypeScript 的现代样板，用于使用 Solid.js 创建 Super Productivity 插件。

## 功能

- 🚀 **Solid.js** - 快速、响应式的 UI 框架
- 📘 **TypeScript** - 与 Super Productivity Plugin API 的完整类型安全
- 🎨 **Modern UI** - 简洁、响应式设计，支持深色模式
- 🔧 **Vite** - 极速开发与构建工具
- 📦 **Ready to Use** - 完整配置，涵盖全部插件功能示例

## 入门

### 前置条件

- Node.js 16+
- npm 或 yarn
- Super Productivity 8.0.0+

### 安装

1. 克隆此样板：

```bash
cd packages/plugin-dev
cp -r boilerplate-solid-js my-plugin
cd my-plugin
```

2. 安装依赖：

```bash
npm install
```

3. 更新 `src/manifest.json` 中的插件元数据：
   - 将 `id` 改为唯一标识符
   - 更新 `name`、`description` 与 `author`
   - 按需修改 `permissions` 与 `hooks`

### 开发

运行开发服务器：

```bash
npm run dev
```

这会以监视模式启动 Vite。修改后插件会自动重新构建。

### 构建

构建生产版插件：

```bash
npm run build
```

这会在 `dist/` 目录生成优化后的文件。

### 打包

创建用于分发的 ZIP 文件：

```bash
npm run package
```

这将：

1. 构建插件
2. 创建包含全部必要文件的 ZIP
3. 将 ZIP 放在根目录

### 部署（适用于带 HTML UI 的插件）

若插件有 `index.html`（用于 UI 组件、侧栏等），请改用 deploy 命令：

```bash
npm run deploy
```

这将：

1. 构建插件
2. 将所有 CSS 与 JavaScript 资源内联到 HTML 文件
3. 创建用于分发的 ZIP 文件

**说明**：任何带 HTML UI 的插件都需要 `deploy` 命令，因为 Super Productivity 以 data URL 加载插件 HTML，无法访问外部文件。inline-assets 脚本确保所有资源直接嵌入 HTML。

## 项目结构

```
src/
├── assets/          # Static assets (icons, images)
│   └── icon.svg     # Plugin icon
├── app/             # Solid.js application
│   ├── App.tsx      # Main app component
│   └── App.css      # App styles
├── utils/           # Helper utilities
│   └── useTranslate.ts  # i18n hook for translations
├── index.html       # Plugin UI entry point
├── index.ts         # UI initialization
├── plugin.ts        # Plugin logic and API integration
└── manifest.json    # Plugin metadata

i18n/                # Translation files (optional)
├── en.json          # English translations (required)
└── de.json          # German translations (example)

scripts/            # Build and utility scripts
└── build-plugin.js  # Plugin packaging script

dist/               # Build output (gitignored)
├── assets/
├── i18n/           # Copied translation files
├── index.html
├── index.js
├── plugin.js
└── manifest.json
```

## 国际化（i18n）

本样板内置多语言插件支持。

### 翻译文件

翻译文件位于 `i18n/` 目录，使用带嵌套键的 JSON 格式：

```json
{
  "APP": {
    "TITLE": "My Plugin",
    "SUBTITLE": "Description"
  },
  "BUTTONS": {
    "SAVE": "Save",
    "CANCEL": "Cancel"
  },
  "MESSAGES": {
    "SUCCESS": "Task \"{{title}}\" created!"
  }
}
```

**说明**：英语（`en.json`）为必填，并在缺少译文时作为回退。

### 在组件中使用翻译

在 Solid.js 组件中使用 `useTranslate()` hook：

```typescript
import { useTranslate } from '../utils/useTranslate';

function MyComponent() {
  const t = useTranslate();
  const [title, setTitle] = createSignal('');

  // Load translation
  createEffect(async () => {
    setTitle(await t('APP.TITLE'));
  });

  return <h1>{title()}</h1>;
}
```

**带参数**（用于插值）：

```typescript
createEffect(async () => {
  const message = await t('MESSAGES.SUCCESS', { title: 'My Task' });
  // Returns: 'Task "My Task" created!'
  setMessage(message);
});
```

### 添加新语言

1. 将语言代码加入 `manifest.json`：

```json
{
  "i18n": {
    "languages": ["en", "de", "fr"]
  }
}
```

2. 创建翻译文件（例如 `i18n/fr.json`）：

```json
{
  "APP": {
    "TITLE": "Mon Plugin"
  }
}
```

3. 重新构建插件：`npm run build`

### 翻译键格式

- 使用层级键：`APP.TITLE`、`SETTINGS.THEME`
- 使用参数插值：`"message": "Hello {{name}}"`
- 保持键名描述性且一致
- 英语是回退语言

完整 i18n 文档见 [插件 i18n 指南](../PLUGIN_I18N.md)。

## 插件 API 用法

### 基础设置

插件 API 通过 `plugin.ts` 中的全局 `plugin` 对象暴露：

```typescript
import { PluginInterface } from '@super-productivity/plugin-api';

declare const plugin: PluginInterface;
```

### 常用 API 方法

#### UI 注册

```typescript
// Register header button
plugin.registerHeaderButton({
  icon: 'rocket',
  tooltip: 'Open Plugin',
  action: () => plugin.showIndexHtmlAsView(),
});

// Register menu entry
plugin.registerMenuEntry({
  label: 'My Plugin',
  icon: 'rocket',
  action: () => plugin.showIndexHtmlAsView(),
});

// Register keyboard shortcut
plugin.registerShortcut({
  keys: 'ctrl+shift+m',
  label: 'Open My Plugin',
  action: () => plugin.showIndexHtmlAsView(),
});
```

#### 数据操作

```typescript
// Get tasks
const tasks = await plugin.getTasks();
const archivedTasks = await plugin.getArchivedTasks();

// Create task
const newTask = await plugin.addTask({
  title: 'New Task',
  projectId: 'project-id',
});

// Update task
await plugin.updateTask('task-id', {
  title: 'Updated Title',
  isDone: true,
});

// Get projects and tags
const projects = await plugin.getAllProjects();
const tags = await plugin.getAllTags();
```

#### 事件 Hooks

```typescript
// Task completion
plugin.on('taskComplete', (task) => {
  console.log('Task completed:', task.title);
});

// Task updates
plugin.on('taskUpdate', (task) => {
  console.log('Task updated:', task);
});

// Context changes
plugin.on('contextChange', (context) => {
  console.log('Context changed:', context);
});
```

#### 与 UI 通信

在 `plugin.ts` 中：

```typescript
plugin.onMessage('myCommand', async (data) => {
  // Handle message from UI
  return { result: 'success' };
});
```

在 Solid.js 组件中：

```typescript
const sendMessage = async (type: string, payload?: any) => {
  return new Promise((resolve) => {
    const messageId = Math.random().toString(36).substr(2, 9);

    const handler = (event: MessageEvent) => {
      if (event.data.messageId === messageId) {
        window.removeEventListener('message', handler);
        resolve(event.data.response);
      }
    };

    window.addEventListener('message', handler);
    window.parent.postMessage({ type, payload, messageId }, '*');
  });
};

// Usage
const result = await sendMessage('myCommand', { foo: 'bar' });
```

## 自定义

### 样式

样板包含：

- 用于主题的 CSS 自定义属性
- 深色模式支持
- 响应式设计
- 简洁、干净的样式

修改 `src/app/App.css` 以自定义外观。

### 添加功能

1. **新 UI 组件**：以 `.tsx` 文件加入 `src/app/`
2. **新 API 端点**：在 `src/plugin.ts` 中用 `plugin.onMessage()` 添加处理器
3. **新 Hooks**：在 `manifest.json` 中注册，并在 `plugin.ts` 中处理
4. **权限**：将所需权限加入 `manifest.json`

## 最佳实践

1. **类型安全**：始终使用 `@super-productivity/plugin-api` 中的 TypeScript 类型
2. **错误处理**：用 try-catch 包裹异步操作
3. **性能**：高效使用 Solid.js 的 signal 与 effect
4. **安全**：切勿暴露敏感数据或操作
5. **用户体验**：提供加载状态与错误反馈

## 部署

1. 构建插件：`npm run build`
2. 打包：`npm run package`
3. 将 ZIP 文件上传到 Super Productivity：
   - 打开 Super Productivity
   - 进入 设置 → 插件
   - 点击「上传插件」
   - 选择你的 ZIP 文件

## 故障排除

### 插件未加载

- 检查浏览器控制台错误
- 确认 `manifest.json` 是有效 JSON
- 确保 `minSupVersion` 与你的 Super Productivity 版本匹配

### API 调用失败

- 检查 `manifest.json` 中是否有所需权限
- 确认 Super Productivity 运行的是正确版本
- 在控制台查找错误信息

### 构建错误

- 运行 `npm run typecheck` 检查 TypeScript 错误
- 确保所有依赖已安装
- 必要时清除 `node_modules` 并重新安装

## 资源

- [Super Productivity 插件 API 文档](https://github.com/super-productivity/super-productivity)
- [Solid.js 文档](https://www.solidjs.com/docs/latest)
- [Vite 文档](https://vitejs.dev/)

## 许可证

本样板按原样提供，用于创建 Super Productivity 插件。可随意修改并按你认为合适的方式分发你的插件。
