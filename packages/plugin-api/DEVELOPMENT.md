# 插件 API 开发指南

## 面向插件开发者

### 安装

```bash
npm install @super-productivity/plugin-api
```

### TypeScript 配置

在插件项目中创建 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

### 基础插件结构

```
my-plugin/
├── src/
│   └── plugin.ts
├── dist/
│   └── plugin.js
├── manifest.json
├── index.html (optional)
├── icon.svg (optional)
├── package.json
└── tsconfig.json
```

### 开发流程

1. **编写 TypeScript 代码**，享受完整类型安全
2. **编译为 JavaScript**，供 Super Productivity 使用
3. **在 Super Productivity** 的插件系统中测试

### 示例构建脚本

加入你的 `package.json`：

```json
{
  "scripts": {
    "build": "tsc",
    "build:watch": "tsc --watch",
    "dev": "tsc --watch"
  },
  "devDependencies": {
    "@super-productivity/plugin-api": "^1.0.0",
    "typescript": "^5.0.0"
  }
}
```

### 插件模板

完整的 TypeScript 插件示例见 `example/my-plugin.ts`。

## 面向核心开发者

### 更新 API

向插件系统添加新功能时：

1. **更新 `src/types.ts`**，加入新的接口/类型
2. **更新 `src/index.ts`**，导出新类型
3. **更新 `README.md`**，补充用法示例
4. **提升包版本号**
5. **重新构建并测试**
6. **发布到 npm**

### 与主项目同步

主 Super Productivity 项目最终应从本包导入类型，而不是维护本地定义：

```typescript
// Before:
import { PluginManifest } from './plugin-api.model';

// After:
import type { PluginManifest } from '@super-productivity/plugin-api';
```

### 测试变更

1. 构建包：`npm run build`
2. 本地测试：在本目录执行 `npm link`
3. 在测试项目中：`npm link @super-productivity/plugin-api`
4. 确认类型工作正常

### 发布流程

1. 更新版本：`npm version patch|minor|major`
2. 构建：`npm run build`
3. 测试：`npm pack --dry-run`
4. 发布：`npm publish --access public`

## 可用类型参考

### 核心接口

- `PluginAPI` - 主 API 接口
- `PluginManifest` - 插件配置
- `PluginBaseCfg` - 运行时配置

### Hook 类型

- `PluginHooks` - 可用的 hook 事件
- `PluginHookHandler` - Hook 函数签名

### 数据类型

- `TaskData` - 任务信息
- `ProjectData` - 项目信息
- `TagData` - 标签信息
- `PluginCreateTaskData` - 创建任务的数据

### UI 类型

- `DialogCfg` - 对话框配置
- `DialogResult` - 对话框返回值
- `DialogButtonCfg` - 对话框按钮配置
- `SnackCfg` - 通知配置
- `NotifyCfg` - 系统通知配置
- `PluginMenuEntryCfg` - 菜单项配置
- `PluginShortcutCfg` - 键盘快捷键配置
- `PluginHeaderBtnCfg` - 顶栏按钮配置

## 最佳实践

1. **始终使用 TypeScript** 开发插件
2. **仅导入类型**，避免引入运行时依赖
3. **遵循语义化版本** 管理插件发布
4. **发布前充分测试**
5. **为其他开发者编写文档**
