# Super Productivity 包

本目录包含 Super Productivity 的插件包与插件 API。

## 结构

- `plugin-api/` - 插件 API 的 TypeScript 类型定义
- `plugin-dev/` - 插件开发示例与工具
  - `api-test-plugin/` - 基础 API 测试插件
  - `procrastination-buster/` - 基于 SolidJS 的示例插件
  - `yesterday-tasks-plugin/` - 展示昨日任务的简单插件
  - `boilerplate-solid-js/` - 创建新 SolidJS 插件的模板（不参与构建）
  - `sync-md/` - Markdown 同步插件（不参与构建）

## 构建包

运行主构建流程时，所有包会自动构建：

```bash
npm run build:packages
```

该命令会：

1. 构建 plugin-api 的 TypeScript 类型定义
2. 构建需要编译的插件（例如 procrastination-buster）
3. 将插件文件复制到 `src/assets/`，以便打包进应用

## 开发

开发某个具体插件时：

```bash
cd plugin-dev/[plugin-name]
npm install
npm run dev
```

## 添加新插件

1. 在 `plugin-dev/` 下创建新目录
2. 将插件配置加入 `/packages/build-packages.js`
3. 运行 `npm run build:packages` 以测试构建

## 说明

- `boilerplate-solid-js` 与 `sync-md` 插件是开发模板，不会包含在生产构建中
- 构建过程中，插件文件会自动复制到 `src/assets/`
- 构建脚本会自动处理依赖安装
