# 环境配置设置

本项目对环境配置采用混合方式：

- **基础配置**（production/stage 标志）在静态 TypeScript 文件中
- **密钥与动态值**从 `.env` 文件加载并转换为 TypeScript 常量

## 概览

### 静态环境文件

- `src/environments/environment.ts` - 开发配置
- `src/environments/environment.prod.ts` - 生产配置
- `src/environments/environment.stage.ts` - 预发配置

这些文件包含 `production`、`stage`、`version` 等基础配置标志。

### 动态环境变量

- `.env` - 所有环境共用的环境变量
- `src/app/config/env.generated.ts` - 自动生成的 TypeScript 常量（已 gitignore）

`.env` 文件包含不应提交到版本控制的密钥与环境相关值。

## 设置步骤

1. **创建你的 .env 文件**

   ```bash
   cp .env.example .env
   ```

2. **添加环境变量**

   ```bash
   # .env
   GOOGLE_DRIVE_TOKEN=your-token-here
   DROPBOX_API_KEY=your-api-key-here
   ```

3. **在代码中访问环境变量**

   ```typescript
   // 从生成的常量导入（类型安全！）
   import { ENV } from './app/config/env.generated';

   // 直接访问
   const googleToken = ENV.GOOGLE_DRIVE_TOKEN;

   // 或使用工具函数（带类型安全）
   import { getEnv, getEnvOrDefault } from './app/util/env';

   const googleToken = getEnv('GOOGLE_DRIVE_TOKEN');
   const dropboxKey = getEnvOrDefault('DROPBOX_API_KEY', 'default-key');
   ```

## 运行应用

npm 脚本在运行前会自动从 `.env` 生成 TypeScript 常量：

```bash
# 开发
npm run startFrontend

# 生产配置
npm run startFrontend:prod

# 预发配置
npm run startFrontend:stage
```

注意：所有命令使用同一个 `.env` 文件。环境差异由 Angular 配置（production/stage 标志）控制。

## 构建命令

构建命令在构建前也会生成常量：

```bash
# 生产构建
npm run buildFrontend:prod:es6

# 预发构建
npm run buildFrontend:stage:es6
```

## 工作原理

1. **load-env.js** 读取 `.env` 文件并生成 `src/app/config/env.generated.ts`
2. **TypeScript 常量** 在应用中导入使用（无需 process.env！）
3. **类型安全** — 工具函数使用 `keyof typeof ENV` 实现自动补全与类型检查
4. **已 gitignore** — 生成文件永不提交，密钥保持安全

## 安全说明

- 绝不要将 `.env` 文件提交到版本控制
- 生成的 `env.generated.ts` 会自动被 gitignore
- 密钥在构建时编译进包（不以环境变量形式暴露）
- 只把非敏感值加到 `.env.example`

## 添加新环境变量

1. 加到 `.env`：

   ```bash
   NEW_API_KEY=your-api-key-here
   ```

2. 运行任意 build/serve 命令时会自动生成 TypeScript 类型

3. 在代码中以完整类型安全使用：

   ```typescript
   import { ENV } from './app/config/env.generated';
   const apiKey = ENV.NEW_API_KEY;

   // 或用工具函数
   import { getEnv } from './app/util/env';
   const apiKey = getEnv('NEW_API_KEY'); // TypeScript 知道所有可用键！
   ```

## 此方式的好处

- ✅ **类型安全**：完整 TypeScript 支持与自动补全
- ✅ **无运行时依赖**：常量编译进包
- ✅ **处处可用**：无需 process.env 或特殊 webpack 配置
- ✅ **简单**：导入并使用常量即可
- ✅ **安全**：密钥留在 `.env`，永不进入版本控制
