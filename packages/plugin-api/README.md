# @super-productivity/plugin-api

用于开发 [Super Productivity](https://github.com/super-productivity/super-productivity) 插件的官方 TypeScript 类型定义。

## 安装

```bash
npm install @super-productivity/plugin-api
```

## 用法

### TypeScript 插件开发

```typescript
import type {
  PluginAPI,
  PluginManifest,
  PluginHooks,
} from '@super-productivity/plugin-api';

// Your plugin code with full type support
PluginAPI.registerHook(PluginHooks.TASK_COMPLETE, (taskData) => {
  console.log('Task completed!', taskData);

  PluginAPI.showSnack({
    msg: 'Task completed successfully!',
    type: 'SUCCESS',
    ico: 'celebration',
  });
});

// Register a header button
PluginAPI.registerHeaderButton({
  label: 'My Plugin',
  icon: 'extension',
  onClick: () => {
    PluginAPI.showIndexHtmlAsView();
  },
});

// Register a keyboard shortcut
PluginAPI.registerShortcut({
  id: 'my_shortcut',
  label: 'My Custom Shortcut',
  onExec: () => {
    PluginAPI.showSnack({
      msg: 'Shortcut executed!',
      type: 'SUCCESS',
    });
  },
});
```

### 插件清单

```json
{
  "name": "My Awesome Plugin",
  "id": "my-awesome-plugin",
  "manifestVersion": 1,
  "version": "1.0.0",
  "minSupVersion": "13.0.0",
  "description": "An awesome plugin for Super Productivity",
  "hooks": ["taskComplete", "taskUpdate"],
  "permissions": ["showSnack", "getTasks", "addTask", "showIndexHtmlAsView"],
  "iFrame": true,
  "uiKit": true,
  "icon": "icon.svg"
}
```

## 可用类型

### 核心类型

- `PluginAPI` - 主插件 API 接口
- `PluginManifest` - 插件配置
- `PluginHooks` - 可用的 hook 类型
- `PluginBaseCfg` - 运行时配置

### 数据类型

- `TaskData` - 任务信息
- `ProjectData` - 项目信息
- `TagData` - 标签信息

### UI 类型

- `DialogCfg` - 对话框配置
- `DialogResult` - 对话框返回值
- `SnackCfg` - 通知配置
- `PluginMenuEntryCfg` - 菜单项配置
- `PluginShortcutCfg` - 键盘快捷键配置

## 插件开发指南

### 1. 可用 Hooks

```typescript
enum PluginHooks {
  TASK_COMPLETE = 'taskComplete',
  TASK_UPDATE = 'taskUpdate',
  TASK_DELETE = 'taskDelete',
  FINISH_DAY = 'finishDay',
  LANGUAGE_CHANGE = 'languageChange',
  PERSISTED_DATA_CHANGED = 'persistedDataChanged',
  ACTION = 'action',
}
```

**`PERSISTED_DATA_CHANGED`** 会在宿主完成初始启动加载之后，对本插件的任何持久化数据变更触发——包括远程同步下发与批量导入。处理器不接收 payload；请再次调用 `loadSyncedData(key?)`，针对插件跟踪的任意 key 获取最新数据（作用域限于当前调用插件）。约定：插件初始化时调用 `loadSyncedData()` 获取初始状态；之后用此 hook 处理后续变更。没有注册时回放、事件中无按 key 区分，也无对快速连续变更的排序保证。处理器必须幂等。

### 2. 所需权限

根据插件需要，将这些权限加入 `manifest.json`：

- `showSnack` - 显示通知
- `notify` - 系统通知
- `showIndexHtmlAsView` - 显示插件 UI
- `openDialog` - 显示对话框
- `getTasks` - 读取任务
- `getArchivedTasks` - 读取已归档任务
- `getCurrentContextTasks` - 读取当前上下文任务
- `getSelectedTask` - 读取任务详情面板中选中的任务
- `getFocusedTask` - 读取当前聚焦的任务行（若有）
- `addTask` - 创建任务
- `getAllProjects` - 读取项目
- `addProject` - 创建项目
- `getAllTags` - 读取标签
- `addTag` - 创建标签
- `persistDataSynced` - 持久化插件数据
- `getAppState` - 只读的应用状态快照

### 3. 插件结构

```
my-plugin/
├── manifest.json
├── plugin.js
├── index.html (optional, if iFrame: true)
└── icon.svg (optional)
```

### 4. 示例插件

```javascript
// plugin.js
console.log('My Plugin initializing...', PluginAPI);

// Register hook for task completion
PluginAPI.registerHook(PluginAPI.Hooks.TASK_COMPLETE, function (taskData) {
  console.log('Task completed!', taskData);

  PluginAPI.showSnack({
    msg: '🎉 Task completed!',
    type: 'SUCCESS',
    ico: 'celebration',
  });
});

// Register header button
PluginAPI.registerHeaderButton({
  label: 'My Plugin',
  icon: 'dashboard',
  onClick: function () {
    PluginAPI.showIndexHtmlAsView();
  },
});

// Read full app state
const state = await PluginAPI.getAppState();
```

## 许可证

MIT - 详见主 Super Productivity 仓库。

## 贡献

请向主 [Super Productivity 仓库](https://github.com/super-productivity/super-productivity) 贡献。
