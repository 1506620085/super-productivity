# Super Productivity 插件开发指南

本文是 Super Productivity 插件系统的完整文档。本指南涵盖创建 Super Productivity 插件所需了解的全部内容。

这些文档可能并非始终完全最新。最新的 TypeScript 接口见：
[types.ts](../packages/plugin-api/src/types.ts)

个人认为弄清如何编写插件的最佳方式是查看示例插件：

- [yesterday-tasks-plugin](../packages/plugin-dev/yesterday-tasks-plugin)
- [procrastination-buster](../packages/plugin-dev/procrastination-buster)
- [api-test-plugin](../packages/plugin-dev/api-test-plugin)

若要构建复杂 UI，有可用的 SolidJS 样板：
[boilerplate-solid-js](../packages/plugin-dev/boilerplate-solid-js)

---

## 目录

- [快速开始](#快速开始)
- [插件清单](#插件清单)
- [插件类型](#插件类型)
- [可用 API 方法](#可用-api-方法)
- [最佳实践](#最佳实践)
- [安全注意事项](#安全注意事项)
- [测试你的插件](#测试你的插件)

## 快速开始

### 1. 基本插件结构

```
my-plugin/
├── manifest.json      # Plugin metadata (required)
├── plugin.js          # Host-side plugin code (optional for iframe-only plugins)
├── index.html         # UI interface (required when omitting plugin.js; requires iFrame:true in manifest)
└── icon.svg           # Plugin icon (optional)
```

需要在插件加载时进行宿主侧初始化、快捷键、页眉按钮、后台行为或宿主侧 API 处理程序的插件必须提供 `plugin.js`。仅 UI 的 iframe 插件在清单设置 `iFrame: true` 时可只附带 `manifest.json` 与 `index.html`。

### 2. 最小示例

**manifest.json：**

```json
{
  "id": "hello-world",
  "name": "Hello World Plugin",
  "version": "1.0.0",
  "description": "My first Super Productivity plugin",
  "manifestVersion": 1,
  "minSupVersion": "14.0.0",
  "hooks": [],
  "permissions": []
}
```

**plugin.js：**

```javascript
console.log('Hello World plugin loaded!');

// Show a notification
PluginAPI.showSnack({
  msg: 'Hello from my plugin!',
  type: 'SUCCESS',
});

// Demo a simple counter
await PluginAPI.setCounter('hello-count', 0);
PluginAPI.registerHeaderButton({
  label: 'Hello (Count: 0)',
  icon: 'waving_hand',
  onClick: async () => {
    const newCount = await PluginAPI.incrementCounter('hello-count');
    PluginAPI.showSnack({
      msg: `Button clicked! Count: ${newCount}`,
      type: 'INFO',
    });
  },
});
```

## 插件清单

所有插件都需要 `manifest.json` 文件，用于定义插件的元数据与配置。

请以
[`PluginManifest`](../packages/plugin-api/src/types.ts)
作为权威字段约定。特别地，`hooks` 与 `permissions`
是必填数组（未使用时用 `[]`），而 `description` 是可选的。
不要依赖安装程序刻意极简的运行时检查来推断
TypeScript 约定。

### 完整清单示例

```json
{
  "id": "my-advanced-plugin",
  "name": "My Advanced Plugin",
  "version": "2.1.0",
  "description": "An advanced plugin with UI and hooks",
  "manifestVersion": 1,
  "minSupVersion": "14.0.2",
  "icon": "icon.svg",
  "iFrame": true,
  "sidePanel": false,
  "permissions": ["getTasks", "updateTask"],
  "hooks": ["taskComplete", "taskUpdate", "currentTaskChange"]
}
```

## 插件类型

### 1. JavaScript 插件（`plugin.js`）

纯 JavaScript 插件，拥有完整 API 访问权限。**它们运行在宿主应用自身的
renderer（渲染进程）中**（通过 `new Function`），而非沙箱——插件代码与页面共享上下文，并可触及特权宿主 API，因此仅安装你信任其源码的插件
（见[安全注意事项](#安全注意事项)）。

**适用场景：**

- 需要在插件 UI（iFrame）未显示时仍执行的后台初始化
- 注册与处理键盘快捷键
- 需要监听应用 hooks/事件
- 需要以编程方式与任务/项目交互

**示例：**

```javascript
// Register multiple UI elements
PluginAPI.registerHeaderButton({
  label: 'My Button',
  icon: 'star',
  onClick: async () => {
    const tasks = await PluginAPI.getTasks();
    console.log(`You have ${tasks.length} tasks`);
  },
});

PluginAPI.registerHook(PluginAPI.Hooks.TASK_COMPLETE, (taskId) => {
  console.log(`Task ${taskId} completed!`);
});
```

### 2. HTML/Iframe 插件（`index.html`）

在 iframe 中渲染自定义 UI 的插件。iframe 的 sandbox 属性会限制
部分浏览器能力，但 `allow-same-origin` 意味着它相对宿主应用并非安全边界。

**适用场景：**

- 需要自定义 UI/可视化
- 需要展示图表、表单或复杂界面

若所有插件行为都在 `index.html` 内，仅 iframe 的插件可不需要 `plugin.js`。插件加载时，Super Productivity 会根据清单自动添加默认菜单或侧栏入口。

**重要：** Iframe 插件通过 `srcdoc` 提供，并接收经过过滤的
Plugin API 消息桥作为受支持接口。由于 iframe 是
同源的，插件代码也可直接访问父页面；不要将桥接视为强制隔离。请将内联 CSS、JavaScript 与小型资源直接写在
`index.html` 中；ZIP 中的任意额外文件不会提供给 iframe。
在应用/运行时 CSP 允许时外部 URL 可能可用，但它们不属于可移植插件约定的一部分。

**示例 index.html：**

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>My Plugin UI</title>

    <!-- CSS must be inlined. Theme variables and UI Kit are injected automatically. -->
    <style>
      body {
        padding: var(--s3);
      }

      .task-list {
        background: var(--card-bg);
        border-radius: var(--card-border-radius);
        padding: var(--s2);
        box-shadow: var(--whiteframe-shadow-2dp);
      }

      .task-item {
        padding: var(--s);
        border-bottom: 1px solid var(--divider-color);
      }
    </style>
  </head>
  <body>
    <h1>My Plugin</h1>
    <div id="content">
      <button id="loadTasks">Load Tasks</button>
      <div
        id="taskList"
        class="task-list"
      ></div>
    </div>

    <!-- JavaScript must be inlined -->
    <script>
      document.getElementById('loadTasks').addEventListener('click', async () => {
        try {
          const tasks = await PluginAPI.getTasks();
          const taskList = document.getElementById('taskList');

          taskList.innerHTML = '<h3>Your Tasks:</h3>';

          tasks.forEach((task) => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item';
            taskEl.textContent = task.title;
            taskList.appendChild(taskEl);
          });

          PluginAPI.showSnack({
            msg: `Loaded ${tasks.length} tasks`,
            type: 'SUCCESS',
          });
        } catch (error) {
          console.error('Error loading tasks:', error);
          PluginAPI.showSnack({
            msg: 'Failed to load tasks',
            type: 'ERROR',
          });
        }
      });
    </script>
  </body>
</html>
```

### 主题变量与 UI Kit

Iframe 插件会自动获得：

1. **CSS 变量** — 所有主题变量（颜色、间距、阴影、过渡）会作为 CSS 自定义属性注入到 `:root`。使用 `var(--c-primary)`、`var(--bg)`、`var(--text-color)` 等。

2. **UI Kit CSS reset** — 默认情况下，基础 HTML 元素（`button`、`input`、`select`、`textarea`、`table`、`a`、`h1`–`h6`、`p`、`code`、`pre`、`hr` 等）会样式化为与应用外观一致。注入发生在插件自有样式之前，因此你的 CSS 始终优先。

   要禁用 UI Kit，请在清单中添加 `"uiKit": false`。

**按钮变体：**

- 默认 `<button>` — 带边框的中性卡片背景按钮
- `<button class="btn-primary">` — 填充主色按钮（白色文字）
- `<button class="btn-outline">` — 透明按钮，主色边框与文字，悬停时填充

**卡片组件：**

- `<div class="card">` — 带背景、阴影、圆角与边框的卡片
- `<div class="card card-clickable">` — 增加悬停抬起效果与主色边框高亮

**工具类：**

- `.text-muted` — 弱化文字颜色（`var(--text-color-muted)`）
- `.text-primary` — 主题主色（`var(--c-primary)`）
- `.page-fade` — 淡入动画（0.3s ease）

**关键 CSS 变量：**

- `--bg`、`--bg-darker` — 背景色
- `--text-color`、`--text-color-muted` — 文字颜色
- `--c-primary`、`--c-accent`、`--c-warn` — 主题色
- `--card-bg`、`--card-shadow`、`--card-border-radius` — 卡片样式
- `--divider-color` — 边框/分隔线颜色
- `--s`、`--s2`、`--s3`、`--s4`、`--s-half`、`--s-quarter` — 间距刻度
- `--transition-standard` — 标准过渡
- `--font-primary-stack` — 应用字体栈
- `--whiteframe-shadow-1dp` 至 `--whiteframe-shadow-24dp` — 海拔阴影
- `--is-dark-theme` — 深色主题为 `1`，浅色为 `0`

## 可用 API 方法

### 数据操作

#### 任务（Tasks）

- `getTasks()` - 获取所有活动任务
- `getArchivedTasks()` - 获取已归档任务
- `getCurrentContextTasks()` - 获取当前上下文中的任务
- `getSelectedTask()` - 获取任务详情面板中选中的任务，或 `null`
- `getFocusedTask()` - 获取当前聚焦的任务行，或 `null`。焦点移到别处（包括 iframe 侧栏）时任务行焦点会清除；侧栏中需要持久任务上下文时请使用 `getSelectedTask()`。
- `addTask(task)` - 创建新任务
- `updateTask(taskId, updates)` - 更新已有任务

#### 应用状态

- `getAppState()` - 获取当前应用状态（只读；返回 `PluginAppState`）。返回数据概览可见通过 `Settings > Sync & Backup > Import/Export > Export data` 导出的 JSON 文件。示例：`const state = await PluginAPI.getAppState();`

#### 项目（Projects）

- `getAllProjects()` - 获取所有项目
- `addProject(project)` - 创建新项目
- `updateProject(projectId, updates)` - 更新项目

#### 标签（Tags）

- `getAllTags()` - 获取所有标签
- `addTag(tag)` - 创建新标签
- `updateTag(tagId, updates)` - 更新标签

#### 简单计数器（Simple Counters）

简单计数器用于跟踪轻量指标（例如每日点击或习惯），会持久化并随你的数据同步。有两个层级：**basic**（今日计数的键值对）与 **full model**（对带日期特定值的 `SimpleCounter` 实体的完整 CRUD）。

##### 基础计数器

将计数器视为今日值的简单 `{ [id: string]: number }` 映射（通过 NgRx 自动 upsert）。

| Method                                  | Description                                                                      | Example                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `getAllCounters()`                      | 获取所有计数器，形式为 `{ [id: string]: number }`                                   | `const counters = await PluginAPI.getAllCounters(); console.log(counters['my-key']);` |
| `getCounter(id)`                        | 获取某计数器的今日值（未设置则返回 `null`）                        | `const val = await PluginAPI.getCounter('daily-commits');`                            |
| `setCounter(id, value)`                 | 设置今日值（非负数字；校验 id 正则 `/^[A-Za-z0-9_-]+$/`） | `await PluginAPI.setCounter('daily-commits', 5);`                                     |
| `incrementCounter(id, incrementBy = 1)` | 递增并返回新值（下限为 0）                                     | `const newVal = await PluginAPI.incrementCounter('daily-commits', 2);`                |
| `decrementCounter(id, decrementBy = 1)` | 递减并返回新值（下限为 0）                                     | `const newVal = await PluginAPI.decrementCounter('daily-commits');`                   |
| `deleteCounter(id)`                     | 删除该计数器                                                               | `await PluginAPI.deleteCounter('daily-commits');`                                     |

**示例：**

```javascript
// Track daily commits
let commits = (await PluginAPI.getCounter('daily-commits')) ?? 0;
await PluginAPI.incrementCounter('daily-commits');
PluginAPI.showSnack({
  msg: `Commits today: ${await PluginAPI.getCounter('daily-commits')}`,
  type: 'INFO',
});
```

##### 完整 SimpleCounter 模型

高级用途：对带元数据的计数器进行完整 CRUD（标题、启用状态、通过 `countOnDay: { [date: string]: number }` 的日期特定值）。

| Method                                   | Description                                                                       | Example                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `getAllSimpleCounters()`                 | 获取全部，类型为 `SimpleCounter[]`                                                      | `const all = await PluginAPI.getAllSimpleCounters();`                 |
| `getSimpleCounter(id)`                   | 按 id 获取一个（未找到则返回 `undefined`）                                  | `const counter = await PluginAPI.getSimpleCounter('my-id');`          |
| `updateSimpleCounter(id, updates)`       | 部分更新（例如 `{ title: 'New Title', countOnDay: { '2025-11-17': 10 } }`） | `await PluginAPI.updateSimpleCounter('my-id', { isEnabled: false });` |
| `toggleSimpleCounter(id)`                | 切换 `isOn` 状态（未找到则抛错）                                         | `await PluginAPI.toggleSimpleCounter('my-id');`                       |
| `setSimpleCounterEnabled(id, isEnabled)` | 设置启用状态                                                                 | `await PluginAPI.setSimpleCounterEnabled('my-id', true);`             |
| `deleteSimpleCounter(id)`                | 按 id 删除                                                                      | `await PluginAPI.deleteSimpleCounter('my-id');`                       |
| `setSimpleCounterToday(id, value)`       | 设置今日值（YYYY-MM-DD）                                                    | `await PluginAPI.setSimpleCounterToday('my-id', 10);`                 |
| `setSimpleCounterDate(id, date, value)`  | 为特定日期设置值（校验 YYYY-MM-DD）                                | `await PluginAPI.setSimpleCounterDate('my-id', '2025-11-16', 5);`     |

**示例：**

```javascript
// Create/update a habit counter
await PluginAPI.updateSimpleCounter('habit-streak', {
  title: 'Daily Streak',
  type: 'ClickCounter',
  isEnabled: true,
  countOnDay: { '2025-11-17': 1 }, // Today's count
});
await PluginAPI.toggleSimpleCounter('habit-streak');
const counter = await PluginAPI.getSimpleCounter('habit-streak');
console.log(`Streak on: ${counter.isOn}`);
```

### UI 操作

#### 通知

```javascript
// Show snackbar notification
PluginAPI.showSnack({
  msg: 'Operation completed!',
  type: 'SUCCESS', // SUCCESS, ERROR, INFO, WARNING
  ico: 'check', // Optional Material icon
  actionStr: 'Undo', // Optional action button
  actionFn: () => console.log('Undo clicked'),
});

// System notification
PluginAPI.notify({
  title: 'Task Complete',
  body: 'Great job!',
  ico: 'done',
});
```

#### 对话框

```javascript
// Open a dialog
const result = await PluginAPI.openDialog({
  title: 'Confirm Action',
  htmlContent: '<p>Are you sure?</p>',
  buttons: [{ label: 'No' }, { label: 'Yes', color: 'primary', raised: true }],
});

if (result === 'Yes') {
  // Continue with the confirmed action
}
```

`openDialog()` 以被点击按钮的 label 完成解析。若用户未点击按钮即关闭对话框，则解析为 `undefined`。仍接受旧版字段 `content`、`okBtnLabel` 与 `cancelBtnLabel`，但新插件应使用 `htmlContent` 与 `buttons`。

宿主在渲染前会净化 `htmlContent`，按白名单重建标记。语义 HTML、原生表单控件（包括其 `id` 与值）、`class`、`data-*`、`aria-*` 以及内联布局样式会保留。会移除脚本、事件处理属性、不安全 URL、内联 `<svg>`，以及任何包含 `url(` 的 `style` 属性，因为对话框布局从不需要加载资源。白名单外的元素会被解包，因此其文本仍可见而标签本身被丢弃。

将不可信值插值进 HTML 字符串前请先转义：净化器是宿主的安全网，不能替代插件内的转义。纯文本足够时请使用 `content`。

### 注册方法（仅 plugin.js）

#### 页眉按钮

```javascript
PluginAPI.registerHeaderButton({
  id: 'my-header-btn', // Optional unique ID
  label: 'Click Me',
  icon: 'star', // Material icon name
  onClick: () => {
    console.log('Header button clicked');
  },
});
```

#### 菜单项

```javascript
PluginAPI.registerMenuEntry({
  label: 'My Plugin Action',
  icon: 'extension',
  onClick: () => {
    console.log('Menu item clicked');
  },
});
```

#### 侧栏按钮

```javascript
PluginAPI.registerSidePanelButton({
  label: 'My Panel',
  icon: 'dashboard',
  onClick: () => {
    PluginAPI.showIndexHtmlAsView();
  },
});
```

#### 键盘快捷键

```javascript
PluginAPI.registerShortcut({
  keys: 'ctrl+shift+p',
  label: 'My Plugin Shortcut',
  action: () => {
    console.log('Shortcut triggered');
  },
});
```

#### Hooks

```javascript
// Available hooks
const hooks = {
  TASK_COMPLETE: 'taskComplete',
  TASK_UPDATE: 'taskUpdate',
  TASK_DELETE: 'taskDelete',
  CURRENT_TASK_CHANGE: 'currentTaskChange',
  FINISH_DAY: 'finishDay',
  LANGUAGE_CHANGE: 'languageChange',
  PERSISTED_DATA_CHANGED: 'persistedDataChanged',
  ACTION: 'action',
};
```

`PERSISTED_DATA_CHANGED` 会在本插件的持久化数据发生变化时触发——本地写入、远程同步投递与批量导入——且是在宿主完成初始启动加载 _之后_。处理程序不接收载荷；对插件跟踪的任意 key 重新调用 `loadSyncedData(key?)` 以获取新数据。没有注册时重放，对快速变化也无保证顺序，因此处理程序必须幂等。典型模式是：插件初始化时调用一次 `loadSyncedData()`，然后订阅此 hook 以接收后续更新。

```javascript
// Register hook listener
PluginAPI.registerHook(PluginAPI.Hooks.TASK_COMPLETE, (taskId) => {
  console.log(`Task ${taskId} completed!`);
});

// Listen to Redux actions
PluginAPI.registerHook(PluginAPI.Hooks.ACTION, (action) => {
  if (action.type === 'ADD_TASK_SUCCESS') {
    console.log('New task added:', action.payload);
    // Bonus: Increment a counter on task add
    PluginAPI.incrementCounter('tasks-added-today');
  }
});
```

### 数据持久化

可通过 `persistDataSynced` 与 `loadSyncedData` API 持久化也会同步的数据。宿主侧 `plugin.js` 代码可对应仅留在本地的数据使用 `localStorage`。Iframe 插件应优先使用同步持久化 API，因为直接的 iframe 浏览器存储不属于可移植插件约定，且可能因运行时而异。

```javascript
// Save plugin data
await PluginAPI.persistDataSynced(JSON.stringify({ count: 42 }));

// Load saved data
const data = await PluginAPI.loadSyncedData();
console.log(data); // '{ count: 42 }'
```

### 密钥存储（Secret Storage）

对于凭据——IMAP/SMTP 密码、API 令牌、应用密码——请使用
`setSecret` / `getSecret` / `deleteSecret`。密钥为 **仅本地** 存储：
永不同步、导出或包含在备份中，且每个插件只能读取自己的 key。

```javascript
// Store a credential (key must be a non-empty string)
await PluginAPI.setSecret('imapPassword', 'app-password-123');

// Read it back when you need to connect
const pw = await PluginAPI.getSecret('imapPassword'); // string | null

// Remove it (e.g. when the user disconnects)
await PluginAPI.deleteSecret('imapPassword');
```

经验法则：

- **切勿** 将凭据放入 `persistDataSynced` 或 issue-provider
  配置——那些会同步到服务器并进入导出/备份。那里只保留非机密连接细节（主机、端口、用户名、过滤器），并将密码/令牌放入密钥存储。
- 密钥是 **按设备** 的：在桌面设置的值在移动端不可用，因此请提示用户在每台设备上输入凭据。（这通常也符合 IMAP 应用密码的用法。）
- 密钥目前静态未加密存储（与插件 OAuth
  令牌相同）；保证是「留在本设备，永不同步」，而非硬件级加密。不要存储你不愿意放在应用本地配置中的任何内容。
- 卸载插件时，该插件的所有密钥会自动清除。

#### Issue-provider 插件中的密钥

Issue-provider 插件获得相同的密钥 API（issue provider 是同时调用 `registerIssueProvider` 的普通插件）。你的定义回调
（`getHeaders`、`getById`、`searchIssues`、…）在插件上下文中运行，因此可直接读取密钥：

```javascript
PluginAPI.registerIssueProvider({
  // Declare only NON-secret fields here — their values are stored in the
  // synced issue-provider config:
  configFields: [
    { key: 'host', type: 'text', label: 'Host' },
    { key: 'username', type: 'text', label: 'Username' },
  ],
  // getHeaders may return a Promise, so read the credential from secret
  // storage instead of from `config`:
  async getHeaders(config) {
    const token = await PluginAPI.getSecret('apiToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  async getById(issueId, config, http) {
    /* ... http call uses the headers above ... */
  },
  // ...
});
```

宿主只向这些回调传入已同步的 `config`——没有密钥参数，且声明式 `configFields` 表单始终写入同步配置。因此请通过你自己的 UI（通过 `registerConfigHandler` 注册的配置对话框，或侧栏）收集密钥并用 `setSecret` 存储；**不要** 将凭据添加为 `configFields` 条目。

## 最佳实践

### 1. 性能

- **懒加载资源**：不要在插件初始化时加载一切
- **克制地使用资源**：避免重操作，不要保存过量数据。
- **保持轻量**：Super Productivity 不是用户系统上唯一的应用，你的插件也不是唯一的插件。

### 2. 用户体验

- **提供反馈**：显示加载状态与确认
- **不侵扰**：不要滥发通知
- **遵循应用设计**：使用注入的主题变量，并尽量保持样式精简。
- **尊重用户偏好**：检查深色模式与语言设置（若可能；否则可坚持英语）

### 3. 安全

- **请求最少权限**：只请求你需要的

### Node.js 脚本执行

带有 `"permissions": ["nodeExecution"]` 的插件可在用户允许桌面权限提示后，在 Electron 桌面应用中运行 Node.js 脚本。

内置与上传（社区）插件均可请求 `nodeExecution`。授权由 Electron **main** 进程在原生同意对话框后签发，并绑定到插件 id。对上传插件，应用无法验证清单，因此对话框会将该插件标记为未验证的第三方代码，具有 Super Productivity 无法沙箱化的完整机器访问权限，并默认 **Deny**——仅允许你信任其源码的插件。若用户拒绝，插件回到禁用状态；再次启用会重新打开提示。

按插件类型，同意处理不同：

- **上传（社区）插件：** 同意按插件 **记住一次**，保存在 main 拥有的仅本地存储中（下次启动不再询问 `Allow`）。同意 **永不同步**——在一台设备上授权不会自动授权另一台；另一台设备首次使用 node 时会重新提示。当你 **禁用**、**卸载** 或 **重新上传** 插件时，同意会自动清除（强制重新提示），因此在同一 id 下替换插件代码总会重新询问。若要在不移除插件的情况下撤销访问，只需禁用它。
- **内置插件**（例如 `sync-md`）保持按会话提示，且不持久化。

> **插件 id 约束（针对 `nodeExecution`）：** 同意授权以你的清单 `id` 为键，因此它必须是单个安全令牌——无空白、控制/双向文字字符、`:`、路径分隔符（`/`、`\`），且最多 100 个字符。推荐小写 kebab-case；点号与大写也可接受。

> **安全说明：** 已授权 `nodeExecution` 的插件可以以完整文件与系统访问权限运行任意程序。插件用于与伴随进程通信的文件/IPC 通道是开放的本地通道——将其读取的任何数据视为不可信输入（切勿对其内容 `eval`/`require`）。

```javascript
const result = await plugin.executeNodeScript({
  script: `
    const os = require('os');
    return os.hostname();
  `,
  timeout: 5000,
});

if (result.success) {
  console.log('Hostname:', result.result);
}
```

**重要 — 启动调用请使用 `plugin.onReady()`：**

`executeNodeScript` 需要 Electron IPC 桥可用。冷启动时，该桥可能在 `plugin.js` 首次运行时尚未就绪。请始终将 `executeNodeScript` 调用（以及任何其他启动初始化代码）放在 `plugin.onReady()` 内：

```javascript
// ❌ May fail on cold boot
const result = await plugin.executeNodeScript({ script: 'return true' });

// ✅ Correct — fires after the bridge is confirmed available
plugin.onReady(async () => {
  const result = await plugin.executeNodeScript({ script: 'return true' });
});
```

`plugin.onReady(fn)` 在 `plugin.js` 完全求值 **且** 应用确认 Node.js IPC 桥正在响应（带自动重试）之后触发。若重试后桥仍不可用，插件管理 UI 会显示错误，且 `onReady` 不会触发。

你也可将 `onReady` 用于应在插件脚本完成 hooks 与注册设置之后运行的任何其他启动工作——不仅限于 `nodeExecution`。

**Iframe 插件：** `PluginAPI.onReady()` 在 `index.html` 内可用。它在注册回调后的下一个微任务触发——不做 IPC 桥 ping。实践中没问题，因为 iframe 插件在用户导航时渲染（远在宿主启动之后）。Iframe API 调用在发出时仍经宿主桥；冷启动桥 ping 仅对宿主侧插件代码执行。

**用 `plugin.onUnload()` 清理：**

基于代码的插件（`plugin.js`）直接运行在应用的 renderer 中，因此它们创建的定时器与监听器在插件被禁用、重新加载或卸载时 **不会** 自动清理——你的插件启动的 `setInterval` 会一直触发，直到应用完全重新加载。请注册拆除回调自行清理：

```javascript
const intervalId = setInterval(doWork, 60000);

plugin.onUnload(() => {
  clearInterval(intervalId);
  // also: removeEventListener, speechSynthesis.cancel(), close connections, …
});
```

宿主在插件拆除开始时调用该回调，此时 Plugin API 仍可用于诸如持久化数据的调用——但不要在其中注册新的 hooks 或监听器（插件正在离开；在那里重新注册 `onUnload` 会被忽略）。返回的 Promise **不会被等待**——在任何 `await` 之前做同步清理（`clearInterval` 等），因为拆除会立即继续。再次注册会替换先前的回调，因此请注册一次并在那里完成所有清理。回调抛出的错误会被记录且不阻塞拆除。

独立于应用分发的插件应做特性检测（`if (plugin.onUnload) { ... }`）——该 hook 之前的宿主不提供它。

**Iframe 插件：** `onUnload` 存在但是空操作——宿主在卸载时卸载 iframe，定时器与监听器随之带走。不要依赖它在 iframe 中做卸载时持久化；应在数据变化时持久化。

### 4. 不要滥打日志

`console.logs` 应保持最少。

### 5. Iframe 插件：保持资源自包含

1. **优先自包含 HTML**：内联 CSS、JavaScript 与小型资源是 iframe 插件最可移植的选项

```html
<!-- Portable: Everything needed by the iframe is in index.html -->
<!DOCTYPE html>
<html>
  <head>
    <style>
      /* All styles here */
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script>
      // All JavaScript here
    </script>
  </body>
</html>
```

## 安全注意事项

### 执行模型与信任

插件相对宿主 **并非** 强沙箱——安装插件意味着信任其代码访问你的数据：

- JavaScript（`plugin.js`）插件通过 `new Function` 在宿主应用的 renderer 中运行，与应用同一上下文。它们可触及特权宿主 API（包括在桌面上的 `window.ea`）。
- Iframe 插件以 `allow-same-origin` sandbox 标志渲染（打包的 `file://` 桌面构建需要它才能绘制 UI）。由于同源，它们可直接读取 `window.parent.ea`，因此 `postMessage` 桥是便利设施，而非硬性安全边界。
- 桌面上的文件系统/进程访问通过 `executeNodeScript()`，仍由显式的 main 进程同意提示（`nodeExecution` 权限）门控。这是插件运行原生代码的唯一正式途径。
- 没有 `window.ea.exec()`：曾通过 `child_process.exec` 运行任意 shell 命令的旧 IPC（任何插件/iframe/XSS 可达，绕过 `nodeExecution` 同意）已移除。旧版 `COMMAND` 任务附件不再执行。

仅从你信任的来源安装插件，并先阅读代码。

### Iframe API 表面

Iframe 插件会获得注入到 `index.html` 的经过过滤的 `window.PluginAPI` 对象。Iframe 可使用注入的任务/项目/标签 API、对话框与通知 API、导航助手、持久化助手、计数器、action 派发、`registerHook()` 以及 `registerWorkContextHeaderButton()`。偏回调的注册方法如 `registerHeaderButton()`、`registerMenuEntry()`、`registerSidePanelButton()`、`registerShortcut()` 与 `registerConfigHandler()` 必须从宿主侧 `plugin.js` 代码注册。未注入 iframe 的 API 不可用，即使它们存在于宿主侧插件桥上。

当桌面应用授予插件 `nodeExecution` 权限时，iframe 插件的 `executeNodeScript()` 会通过宿主桥代理。

### Iframe 边界

- Iframe 插件以 `allow-same-origin` 渲染（打包的 `file://` 桌面构建需要它才能绘制 UI；不透明源 iframe 会保持空白——见 #8467）
- 由于同源，iframe 插件可直接读取 `window.parent.ea`；经过过滤的 `postMessage` 桥是预期 API，而非强制边界
- 远程资源取决于应用/运行时 CSP，不应依赖
- 恢复不透明源隔离（从 `app://` scheme 提供 renderer）另行跟踪

## 测试你的插件

### 1. 本地开发

1. 构建插件 ZIP，并从 **Settings** → **Plugins** 上传
2. 打开 DevTools（F12 或 Ctrl+Shift+i）查看控制台日志
3. 以 API Test Plugin 为参考

### 2. 调试技巧

```javascript
// Add debug logging
const DEBUG = true;

function log(...args) {
  if (DEBUG) {
    console.log('[MyPlugin]', ...args);
  }
}

// Test API methods
async function testAPI() {
  log('Testing getTasks...');
  const tasks = await PluginAPI.getTasks();
  log('Tasks:', tasks);

  log('Testing showSnack...');
  PluginAPI.showSnack({
    msg: 'API test successful!',
    type: 'SUCCESS',
  });
}
```

### 3. 常见问题

**插件未加载：**

- 检查 manifest.json 语法
- 验证 minSupVersion 兼容性
- 查看控制台错误

**API 方法失败：**

- 检查方法在当前上下文是否可用
- 验证清单中的权限
- 若 `executeNodeScript` 在启动或冷启动时失败，将初始化代码包在
  `plugin.onReady(async () => { ... })` 中——这确保在代码运行前 Node.js 桥已就绪

**Iframe 未显示：**

- 检查所有资源是否已内联
- 确认无外部依赖
- 查看控制台中的 CSP 违规

## 资源

- **Plugin API Types**：[@super-productivity/plugin-api](https://www.npmjs.com/package/@super-productivity/plugin-api)
- **Plugin Boilerplate**：[boilerplate-solid-js](../packages/plugin-dev/boilerplate-solid-js)
- **Example Plugins**：[plugin-dev](../packages/plugin-dev)
- **Community Plugins**：
  - [counter-tester-plugin](https://github.com/Mustache-Games/counter-tester-plugin) by [Mustache Dev](https://github.com/Mustache-Games)
  - [sp-reporter](https://github.com/dougcooper/sp-reporter) by [dougcooper](https://github.com/dougcooper)

## 贡献

若你创建了有用的插件，可考虑：

1. 在 reddit 或 GitHub discussions 上发帖介绍
2. 提交 PR，将其加入社区插件列表（即将推出）

祝插件开发愉快！🚀

## 附赠：用 Vibe Coding 编写插件

### 提示

- 不要在真实数据上测试！使用测试实例！（若不知道如何获取，可使用 https://test-app.super-productivity.com/）
- 尽量具体
- 勾勒插件应使用的 API
- 测试错误（`Ctrl+Shift+i` 打开控制台）并迭代直到可用。不要期望第一次就全部成功。
- 阅读代码！不要盲目信任。

### 示例

```md
Can you you write me a plugin for Super Productivity that plays a beep sound every time i click on a header button (You need to add a header button via PluginAPI.registerHeaderButton).

Here are the docs: https://github.com/super-productivity/super-productivity/blob/master/docs/plugin-development.md

Don't use any PluginAPI methods that are not listed in the guide.

Please give me the output as flat zip file to download.
```
