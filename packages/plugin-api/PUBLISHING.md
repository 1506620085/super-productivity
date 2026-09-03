# 发布 @super-productivity/plugin-api

## 概述

本包为 Super Productivity 插件开发提供 TypeScript 类型定义，并以 `@super-productivity/plugin-api` 发布到 npm。

## 发布流程

### 1. 更新版本

更新 `package.json` 中的版本号：

```bash
cd packages/plugin-api
npm version patch   # or minor/major
```

### 2. 构建包

```bash
npm run build
```

### 3. 测试构建

```bash
npm pack --dry-run
```

### 4. 发布到 npm

稳定版发布：

```bash
npm publish --access public
```

Beta 版发布：

```bash
npm publish --tag beta --access public
```

## 项目集成

### 更新主项目

更新插件 API 类型时，需要：

1. **更新本包**，加入新的类型/接口
2. **重新构建包**：`npm run build`
3. **更新主项目**，改用本包中的新类型，替代本地定义
4. **测试集成**，确保一切正常

### 在主项目中使用

主项目应从本包导入类型：

```typescript
// Instead of local imports:
// import { PluginManifest } from './plugin-api.model';

// Use the npm package:
import type { PluginManifest } from '@super-productivity/plugin-api';
```

## 包结构

```
packages/plugin-api/
├── src/
│   ├── index.ts      # Main export file
│   └── types.ts      # All type definitions
├── dist/             # Built output (generated)
├── package.json      # Package configuration
├── tsconfig.json     # TypeScript configuration
├── README.md         # User documentation
├── PUBLISHING.md     # This file
└── .npmignore        # Files to exclude from npm
```

## 维护

- 保持类型与主项目的插件系统同步
- 添加新功能时更新文档
- 发布遵循语义化版本
- 用实际插件开发验证变更

## 版本历史

- `1.0.0` - 首个版本，包含核心插件 API 类型
