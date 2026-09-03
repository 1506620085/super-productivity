# 插件开发快速开始

## 方案 1：纯 JavaScript（最简单）

```bash
cd minimal-plugin
# Edit plugin.js
# Zip the files and upload
```

**优点：** 无需构建步骤，即时反馈
**缺点：** 无 TypeScript，无打包

## 方案 2：简单 TypeScript（推荐）

```bash
cd simple-typescript-plugin
npm install
npm run build
# Find plugin.zip in dist/
```

**优点：** 支持 TypeScript，构建简单
**缺点：** 限于单文件

## 方案 3：完整 TypeScript + Webpack（进阶）

```bash
cd example-plugin
npm install
npm run build
npm run package
```

**优点：** 多文件，完整工具链
**缺点：** 配置更复杂

## 我该用哪个？

- **只是试用？** → 使用 minimal-plugin
- **想要 TypeScript？** → 使用 simple-typescript-plugin
- **构建复杂插件？** → 使用 example-plugin

## 开发提示

1. 从 minimal-plugin 开始，了解 API
2. 需要类型安全时再转到 TypeScript
3. 仅在需要多个源文件时使用 webpack

## 测试插件

1. 将文件复制到 `src/assets/my-plugin/` 做本地测试
2. 或打包成 zip，通过 设置 → 插件 上传

就这些！🚀
