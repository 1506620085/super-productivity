# 同步包边界

**状态：** 活跃
**最后更新：** 2026 年 5 月 13 日

本说明记录操作日志同步栈所使用的包拆分。目标是让可复用的同步逻辑与框架无关，同时将 Super Productivity 领域接线留在应用中。

## 依赖方向

允许的方向：

```text
src/app
  -> @sp/sync-providers
  -> @sp/sync-core

src/app
  -> @sp/sync-core

packages/super-sync-server
  -> @sp/sync-core
  -> @sp/shared-schema
```

规则：

- `@sp/sync-core` 不得导入 Angular、NgRx、`src/app`、`@sp/shared-schema`、
  `@sp/sync-providers`，或提供方特定代码。
- `@sp/sync-providers` 只能导入公共的 `@sp/sync-core` 导出。它不得
  深层导入 `@sp/sync-core/*`、Angular、NgRx、`src/app`，或
  `@sp/shared-schema`。
- 应用可以导入这两个包，并负责 Angular 依赖注入、NgRx、Electron/Capacitor 桥接、配置 UI、OAuth 路由，以及
  Super Productivity 特定的模型接线。
- `packages/shared-schema` 拥有应用与服务器之间共享的 schema 契约与校验器。它不依赖 `@sp/sync-core`。
- `packages/super-sync-server` 同时依赖 `@sp/shared-schema`（HTTP 契约
  类型与校验 schema）与 `@sp/sync-core`（向量时钟算法）。

## 所有权

`@sp/sync-core` 拥有可复用的同步引擎原语：

- 通用操作与应用类型；
- 向量时钟比较、合并与修剪算法；
- 纯冲突、导入过滤、上传/下载、重放、压缩与前缀辅助；
- 结构性实体注册表契约；
- 面向应用的端口契约与隐私感知的 `SyncLogger` 接口。

`@sp/sync-providers` 拥有捆绑的提供方实现与提供方中立契约：

- Dropbox、OneDrive、WebDAV、Nextcloud、SuperSync 与 LocalFile 提供方类；
- 基于文件的同步信封类型与提供方响应契约；
- 提供方拥有的文件信封常量，例如 `sync-data.json` 与文件同步版本键；
- 凭证、文件适配器、平台信息、web-fetch、native-HTTP、存储与响应校验器端口；
- 提供方共享的错误类、PKCE 辅助、重试辅助与安全日志元数据辅助。

跨提供方工具在可被提供方实现复用、但不可被通用引擎复用时，属于 `@sp/sync-providers`。现有例子是提供方共享的错误类、PKCE、重试谓词、native-HTTP 重试，以及安全日志元数据辅助。

新的捆绑提供方应遵循 Dropbox/OneDrive/WebDAV/SuperSync/LocalFile
模式：将提供方拥有的协议逻辑与提供方中立契约放在
`@sp/sync-providers` 中，然后在薄的应用侧工厂中组合仅限应用的凭证、平台桥接、校验器、OAuth 路由与 UI 配置。若提供方是应用特定或插件提供而非捆绑的，应在应用侧针对提供方契约实现，而不是扩大包表面。

`src/app` 拥有宿主特定的配置与编排：

- `ActionType`、`ENTITY_TYPES`、`SyncProviderId`、提供方列表，以及存储前缀如 `REMOTE_FILE_CONTENT_PREFIX` 与 `PRIVATE_CFG_PREFIX`；
- 从功能 reducer/selector 构建实体注册表；
- 包装的全状态 payload 形状、导入原因、修复 payload，以及针对 `@sp/shared-schema` 的校验；
- Angular 服务、NgRx dispatch/replay 转换、本地 action 过滤、hydration 窗口、归档副作用、提供方工厂、OAuth 回调、配置对话框与平台桥接实现。

`packages/shared-schema` 拥有在应用与服务器之间共享的 Super Productivity schema 契约与校验器。在此边界中它应保持与 SP 耦合，且不应成为 `@sp/sync-core` 或 `@sp/sync-providers` 的依赖。

## 公共导出

包消费者应只从包 barrel 导入：

```ts
import { compareVectorClocks } from '@sp/sync-core';
import { Dropbox, PROVIDER_ID_DROPBOX } from '@sp/sync-providers/dropbox';
```

不要从包内部导入，例如 `@sp/sync-core/src/*`、
`@sp/sync-providers/src/*` 或 `dist/*`。若宿主需要某个符号，应有意地将其提升到包 barrel，并检查它并非应用拥有。

根级 `@sp/sync-providers` barrel 已移除；消费者 MUST 从聚焦的子路径 barrel 导入：`@sp/sync-providers/dropbox`、
`@sp/sync-providers/onedrive`、`/webdav`、`/super-sync`、`/local-file`、`/http`、
`/errors`、`/file-based`、`/pkce`、`/platform`、`/provider-types`、
`/credential-store` 与 `/log`。提供方类、提供方拥有的字符串常量，以及共享的隐私边界日志辅助在那里导出，但应用枚举如 `SyncProviderId` 不会。内部辅助如 WebDAV API/适配器类保持未导出，除非第二个宿主需要它们。

`@sp/sync-core` 仍为现有消费者导出已弃用的全状态 op 兼容默认值，以及宿主定义的 `OpType.SyncImport` / `BackupImport` / `Repair` 字符串。新的可复用宿主应通过 `createFullStateOpTypeHelpers()` 提供自己的全状态操作字符串。

## 隐私边界

包日志必须只使用 `SyncLogger` 与安全的结构化元数据。
`SyncLogger` 是隐私感知的端口形状；它不会对任意元数据做清理。调用方负责传入已清洗的值，当前强制方式是代码审查加上聚焦测试。

ID、计数、action 字符串、实体类型、提供方 ID，以及错误名称/代码是可接受的。URL 元数据仅在调用方剥离查询字符串、片段、凭证、令牌、原始响应正文，以及用户提供的路径段（如文件名、邮箱、分享 ID 或文件夹名）之后才可接受。优先使用粗粒度路径模板、提供方操作名、仅限主机的值，或提供方拥有的相对路径类别，而非原始 URL 路径。

完整实体、操作 payload、任务标题、笔记文本、原始提供方响应、凭证、头信息与加密材料必须远离可导出日志。针对不安全直接日志的 lint 规则仍是可能的后续项；在此之前，新的可移动/提供方代码应使用 `SyncLogger`，且测试应断言隐私敏感的 catch 路径。

## 测试

ESLint 包边界覆盖适用于 `packages/sync-core/**` 与 `packages/sync-providers/**` 下的所有 TypeScript 文件，包括测试。测试可通过相对路径导入自身包内部以进行白盒覆盖。`@sp/sync-providers` 测试可以导入公共的 `@sp/sync-core` 导出，但不应导入 `@sp/sync-core` 内部或 sync-core 测试辅助。

## 验证

在跨这些边界移动代码之前，运行：

```bash
npm run lint
npm run sync-core:build
npm run sync-providers:build
npm run packages:test
```

快速边界抽查可使用：

```bash
rg -n "from ['\"](@angular|@ngrx|@sp/shared-schema|src/app|@sp/sync-core/src|@sp/sync-core/)|import\(['\"](@angular|@ngrx|@sp/shared-schema|src/app|@sp/sync-core/src|@sp/sync-core/)" packages/sync-core/src packages/sync-providers/src
```
