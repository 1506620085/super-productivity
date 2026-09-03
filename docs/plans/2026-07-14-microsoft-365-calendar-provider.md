# Microsoft 365 日历提供方（无需 iCal URL 的 Outlook）

状态：**已提出，经仓库审计与对抗性 Codex 审查后修订** ·
2026-07-14

## 决策摘要

可行，但不是对 Google Calendar 插件的机械重命名。Microsoft Graph 事件映射是
容易的一半。更难的一半是在高校租户中可靠地运营多租户 Microsoft Entra 应用，
并弥合若干围绕 OAuth、轮询、限流、全天日期与设备本地凭证的通用插件宿主缺口。

最小负责任的产品是捆绑的、**只读、仅 Electron 的 Microsoft 365 Calendar
提供方，面向工作/学校账户**。它应让用户无需 iCal URL 即可认证、选择自己的
日历、在 Schedule/Planner 中查看事件、手动将事件转为任务，并在 Outlook 中
打开原始事件。

在 Phase 0 租户门控成功之前，不要开始生产实现。代码无法绕过大学的同意、
Conditional Access 或企业应用策略。

### 难度与估计

| 结果                                                     |                                  估计 | 置信度                        |
| ----------------------------------------------------------- | ----------------------------------------: | --------------------------------- |
| 可丢弃的 Graph/租户可行性探针                   |                      1–2 个工程日 | Medium；租户策略属外部 |
| 生产 Electron MVP，含宿主加固与测试 | 额外 17–26 个专注工程日 | Medium                            |
| 总工程工作量                                    |          约一名工程师 4–6 周 | Medium                            |
| Microsoft 发布者/管理员批准                          |                              未计入 | 无界的外部经过时间   |

仅登录并列出事件的演示可在几天内做出。称之为生产就绪会掩盖审查中发现的
主要风险：不支持的移动流程当前仍会启动 OAuth、所有日历提供方可能按最快
提供方的节奏被轮询、已链接任务会引发按任务的 Graph 请求、刷新令牌持久化
非事务性，以及已同步的日历 ID 可能遇到不同本地账户的凭证。

## 用户问题

一些大学要求 Outlook/Microsoft 365，但禁用日历发布，因此现有基于 URL 的
iCal 集成无法使用。所请求的工作流是个人规划，而非团队日历管理：

1. 使用大学 Microsoft 365 账户登录。
2. 选择一个或多个个人日历。
3. 在规划现实一天时，在任务旁看到即将到来的事件。
4. 在有用时将事件转换为任务。
5. 在 Outlook 中打开源事件。

这作为可选集成符合 Super Productivity 的深度工作范围。它必须默认安静、
只读、最小权限，并在离线或断开时安全。

## 可复用内容

仓库已有大部分结构件：

- `packages/plugin-dev/google-calendar-provider/` 演示了捆绑的 OAuth
  议程提供方、动态日历选择、通过远程 API 的重复展开、事件到任务映射，以及
  提供方本地测试。
- `src/app/plugins/oauth/` 提供授权码 + PKCE 流程、Electron 环回回调、
  令牌刷新与本地 IndexedDB 令牌存储。
- `packages/plugin-api/src/issue-provider-types.ts` 已用开始、时长、全天、
  截止时间与源 URL 字段表示议程事件。
- `src/app/features/calendar-integration/` 已将插件事件与 iCal 事件合并，
  并暴露任务创建与源链接操作。
- `packages/plugin-dev/scripts/build-all.js`、`src/app/plugins/plugin.service.ts` 与
  `electron/bundled-plugin-ids.test.cjs` 定义了捆绑插件构建与保留 ID 路径。

提供方应扩展这些构建块。不应引入第二套日历框架、Microsoft SDK、后端令牌
代理或新的根依赖。

## 复核期间的修正

初始大纲在以下方面过于乐观。这些是要求，而非可选润色：

- 缺失的移动客户端 ID **不会**当前禁用原生 OAuth。宿主需要显式的可叠加
  平台能力契约。
- 议程刷新当前使用所有日历提供方中的最小间隔。因此一分钟的 Google 提供方
  可使五分钟的 Microsoft 提供方每分钟调用 Graph。
- 议程视图配置隐藏自动轮询设置，而默认保持开启。导入的插件日历任务因此可在
  每次 issue 轮询周期为每个任务生成一次 `getById` 请求。
- `/me/calendars` 可暴露本地表示的共享/委派日历。MVP 必须过滤为已登录邮箱
  拥有的日历，而不仅仅在 UI 中隐藏标签。
- 议程加载与 issue 搜索是独立的宿主路径。声称「本地搜索」需要显式键控的
  提供方缓存与进行中去重。
- 刷新令牌持久化必须在返回新访问令牌之前完成，且延迟的刷新不得在断开后
  复活凭证或覆盖更新的登录。
- 瞬时刷新失败与终端重新认证失败需要不同的状态转换。429、超时、离线错误或
  5xx 不得删除仍可用的刷新令牌。
- Microsoft 要求客户端尊重 `Retry-After`。小型类型化错误扩展优于盲目休眠，
  或将每个响应头作为永久插件 API 暴露。
- 日历选择会同步，而 OAuth 凭证是本地的、每个插件键控一次。提供方必须检测
  来自不同账户的日历 ID，并说明一台设备上的所有配置共享一次 Microsoft
  登录。
- 全天事件需要显式的 `dueDay` 日期字符串。从 UTC 毫秒时间戳重建可能在邮箱与
  设备时区不同时偏移一天。
- 事件元数据以未加密形式缓存在本地存储中。认证变更必须清除受影响提供方的
  缓存，而瞬时离线失败可保留它。
- 插件翻译需要 `i18n.languages: ["en"]`、`i18n/en.json`、构建复制与
  `PluginAPI.translate`；字面复制当前 Google 脚手架会遗漏这些要求。

## MVP 范围

### 包含

- 全球 Microsoft 云中的 Microsoft 365 工作/学校账户。
- Windows、macOS 与 Linux 上的 Super Productivity Electron 构建。
- 每台设备每个插件一个 Microsoft 账户。
- 最多 10 个由已登录邮箱拥有的日历。
- 固定事件窗口：本地今天前 7 天至本地今天后 28 天。
- 单次事件、重复出现/例外，以及多日/全天事件。
- Schedule/Planner 显示、对提供方缓存的有界标题搜索、手动任务创建，以及打开
  Outlook web 链接。
- 只读委派权限 `Calendars.ReadBasic` 加上 `offline_access`。
- 瞬时离线/服务器失败期间的陈旧缓存议程数据，与需要重连状态清晰可区分。

### 明确排除

- 创建、编辑、移动、完成或删除 Outlook 事件。
- 时间块回写与 Google 功能对等。
- 事件正文/备注、附件、扩展、与会者或会议聊天数据。
- 共享、委派、组、会议室或资源日历。
- 个人 Outlook.com 账户、仅访客账户，以及国家/主权云。
- Web、Android 与 iOS 支持。
- 一台设备上的多个 Microsoft 账户。
- 自动 backlog 导入。
- 已导入任务的自动刷新。任务是带有源链接的手动创建规划快照；这避免无界的
  按任务 Graph 轮询路径。

排除项应出现在设置文案与文档中，而不仅在代码注释中。

## 架构

```text
Microsoft Entra authorization (system browser + PKCE)
        |
        v
device-local OAuth token store (one account per plugin, never synced)
        |
        v
Microsoft provider -> validated Graph client -> bounded in-memory event cache
        |                                      |
        |                                      +-> local title search / getById reuse
        v
existing issue-provider agenda contract
        |
        v
calendar integration cache -> Schedule/Planner -> manual task snapshot
```

提供方配置（含所选日历 ID）仍是已同步 issue 提供方状态的一部分。令牌与
提供方的事件缓存保持设备本地。在每台设备上，所选 ID 必须在开始 Graph 事件
调用前，与该设备已连接账户返回的日历进行核对。

## 固定契约与限制

这些值使「有界」可测试，并避免在真实工作流需要前添加设置：

| 关注点                      | MVP 规则                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 租户端点              | `organizations` 授权/令牌端点                                                                                                                 |
| 委派作用域             | `offline_access https://graph.microsoft.com/Calendars.ReadBasic`                                                                                              |
| 日历所有权           | 将每个日历所有者与默认日历的所有者比较；若所有权缺失/模糊，仅暴露默认日历并对其余失败关闭 |
| 所选日历           | 至少 1 个，最多 10 个                                                                                                                                        |
| 事件窗口                 | 本地日起始 −7 天至本地日起始 +28 天，作为显式偏移瞬间发送                                                              |
| Graph 页大小              | `$top=100`                                                                                                                                                    |
| 分页                   | 每个日历最多 5 页，映射事件总计最多 2,000                                                                                                    |
| 日历请求并发 | 2                                                                                                                                                             |
| 请求超时              | 30 秒                                                                                                                                                    |
| 议程节奏               | 每个 Microsoft 提供方 5 分钟；手动刷新可绕过到期时间                                                                                      |
| 重叠                      | 每个账户/配置缓存键一次进行中获取；之后的自动 tick 复用它                                                                              |
| 搜索                       | 不区分大小写的标题搜索，最多 50 条结果，覆盖同一有界缓存                                                                                |
| 无 `Retry-After` 的重试  | 最多 2 次重试，使用约 1 s 与 2 s 指数延迟加抖动                                                                               |
| 有 `Retry-After` 的重试     | 在给定时间之前不重试；仅当等待至多 30 s 时重试一次，否则停止并保留陈旧数据                                    |
| 定时事件身份         | 区分大小写的日历 ID + 不可变事件 ID 的复合、可逆编码                                                                             |
| 全天身份/日期        | 将 `YYYY-MM-DD` 开始与独占结束日期与数值日程瞬间分开保留                                                                 |
| 内容限制               | 验证响应形态；在映射前将 ID/URL/标题限制到已记录的本地常量                                                                    |

若达到上限，以安全的本地化「日历结果上限已达」错误使该次刷新失败，并保留
上次完整的提供方快照。切勿用截断缓存静默替换完整缓存。

### 失败语义

- **离线、超时、429 或 5xx：** 保留令牌与上次完整议程缓存；仅在表中预算内
  重试。
- **某个所选日历返回 403/404：** 使刷新失败并保留上次完整快照；设置/
  测试连接识别不可访问的日历并要求重新选择。这有意对 MVP 采用全有或全无，
  因为宿主缓存是提供方范围的，而非按远程日历。
- **401：** 强制刷新访问令牌一次并重试 Graph 请求一次。第二次 401、
  `invalid_grant`、`interaction_required` 或 claims challenge 变为需要重连，
  并清除受影响提供方的缓存事件元数据。
- **畸形 Graph 数据：** 拒绝畸形项。若被拒项或分页限制使结果不完整，拒绝
  刷新并保留先前完整快照。
- **无先前缓存：** 不显示事件并给出本地化可操作错误；切勿为认证或不完整
  失败发明空的成功结果。
- **账户/配置不匹配：** 不发起 `calendarView` 调用。要求用户为本地已连接
  账户重新选择日历。

## 外部可行性门控（Phase 0）

本阶段有意先于仓库实现。

1. 创建 Super Productivity 拥有的、多租户公共客户端 Entra 注册，限于组织
   目录中的账户。不要添加客户端密钥。
2. 通过 Entra 应用清单注册 Electron 环回重定向
   `http://127.0.0.1:<fixed-high-port>/<fixed-callback-path>`。Microsoft 不将
   字面 `127.0.0.1` 端口视为可互换，因此精确 URI 很重要。
3. 仅配置 `Calendars.ReadBasic`；在 OAuth 流程中请求 `offline_access`。
4. 记录项目是否能满足 Microsoft 发布者验证前置条件。许多教育租户即使委派
   权限通常可由用户同意，也会限制未验证的多租户应用。
5. 用以下情况证明授权、PKCE 令牌交换、刷新、`/me/calendars` 与一次
   `calendarView` 调用：
   - 普通 Microsoft 365 租户；
   - 有代表性的限制性大学租户，理想为报告用户的租户；
   - 拒绝同意与需要管理员批准的路径。
6. 在全部三个桌面 OS 上验证所选固定端口。确认端口冲突产生清晰可操作的
   失败而非超时。
7. 验证 Graph 响应在 `Calendars.ReadBasic` 下暴露所需字段：日历所有者/
   默认标志、事件 subject/start/end、`isAllDay`、取消/响应状态、不可变 ID 与
   `webLink`。

**继续（Go）：** 至少一名有代表性的大学用户可以同意，或大学有现实的、
已记录的管理员批准路径；应用注册可由项目运营与发布；所有必需字段在
read-basic 作用域下可用。

**停止（No-go）：** 代表性租户绝对阻止该应用且无可行批准路径、无法满足
发布者要求，或所需事件/所有权字段要求项目不愿请求的更广权限。在此情况下，
诚实地回答用户；任何客户端实现都无法覆盖该策略。

探针应留下简短证据说明，含租户类型、请求的作用域、所用重定向、成功/失败
类别，以及已脱敏的截图/错误。切勿提交令牌、租户 ID、用户地址、授权码或
客户端密钥。

## 依赖顺序

```text
Phase 0 tenant gate
  -> host OAuth safety
  -> host HTTP/polling/calendar contracts
  -> provider Graph slices
  -> cross-tenant/manual verification
  -> docs and pilot
```

若前一契约无法在不做更大架构变更的情况下变得可靠，在每个检查点停止。

## 有序实现任务

每个任务有意可单独审查。文件列表是预期触点，而非扩大任务的许可。

### 1. 添加显式 OAuth 平台能力契约

**依赖：** Phase 0 通过。

向 `OAuthFlowConfig` 添加可选、向后兼容的 `supportedPlatforms` 字段。省略它的
现有插件保持当前行为；Microsoft 提供方仅声明 Electron。在准备重定向服务器或
打开浏览器之前强制执行该字段。

可能涉及的文件：

- `packages/plugin-api/src/types.ts`
- `src/app/plugins/oauth/resolve-effective-oauth-config.util.ts`
- `src/app/plugins/oauth/resolve-effective-oauth-config.util.spec.ts`
- `src/app/plugins/oauth/plugin-oauth-bridge.service.ts`
- `src/app/plugins/oauth/plugin-oauth-bridge.service.spec.ts`

验收：web/原生尝试在任何 OAuth 副作用之前失败；Google 行为不变。用针对性
specs 与对每个变更的 TypeScript 文件运行 `npm run checkFile` 验证。估计：
0.5 天。

### 2. 使不支持平台的 UX 通用化

**依赖：** 任务 1。

用新的平台契约与本地化的仅桌面说明，替换提供方对话框中仅 web 的可用性检查。

可能涉及的文件：

- `src/app/features/issue/dialog-edit-issue-provider/dialog-edit-issue-provider.component.ts`
- `src/app/features/issue/dialog-edit-issue-provider/dialog-edit-issue-provider.component.html`
- `src/app/features/issue/dialog-edit-issue-provider/dialog-edit-issue-provider.component.spec.ts`
- `src/assets/i18n/en.json`

验收：不支持的构建显示禁用的连接操作且从不启动 OAuth；Electron 仍可连接。
估计：0.5 天。

### 3. 使令牌刷新成为可等待、代际守卫的事务

**依赖：** 任务 1。

为成功、瞬时失败与终端重新认证定义内部刷新结果。成功时，替换已轮换的刷新
令牌（若未返回则保留旧的），持久化完整的新令牌集，然后才返回访问令牌。在
连接/断开时递增每个插件的代际；来自更老代际的延迟刷新必须丢弃，且不得写入
内存或 IndexedDB。在同一代际内对并发刷新去重。

为 401 单次重试路径暴露可叠加的强制刷新选项，并在连接、断开或终端失效后
发出插件会话变更事件。瞬时网络/429/5xx 错误保留凭证。

可能涉及的文件：

- `src/app/plugins/oauth/plugin-oauth.model.ts`
- `src/app/plugins/oauth/plugin-oauth.service.ts`
- `src/app/plugins/oauth/plugin-oauth.service.spec.ts`
- `src/app/plugins/oauth/plugin-oauth-bridge.service.ts`
- `src/app/plugins/oauth/plugin-oauth-bridge.service.spec.ts`

验收：测试覆盖轮换、无轮换、持久化失败、刷新去重、刷新期间断开、刷新期间
重连/账户切换、重启恢复、瞬时失败、终端失败与强制刷新。不记录令牌或响应
正文。估计：2–3 天。

### 4. 加固 Electron 环回回调

**依赖：** Phase 0 的确切重定向。

在 `PLUGIN_OAUTH_START`，从已验证的授权 URL 提取预期 state 与回调路径。
环回服务器必须忽略无关路径与错误 state 的请求，而不将流程标记为已处理或
关闭。仅在匹配回调、超时、显式取消或启动错误后关闭。对固定端口保留现有的
清晰 `EADDRINUSE` 错误。

可能涉及的文件：

- `electron/plugin-oauth.ts`
- 一个小型纯回调验证辅助及其旁侧的针对性测试

验收：错误路径/state 不能消费真实回调；正确的错误与代码回调完成一次；冲突与
超时会清理。估计：0.5–1 天。

### 5. 添加窄类型的插件 HTTP 错误契约

**依赖：** Phase 0 之后无依赖；在 Graph 重试逻辑之前落地。

添加可选类型化错误形态，仅含规范化的 `status`、`retryAfterMs` 与稳定错误
类别。解析 `Retry-After` 的秒与 HTTP-date 两种形式。不暴露任意头，不改变
成功响应形态。对现有插件保持向后兼容。

可能涉及的文件：

- `packages/plugin-api/src/issue-provider-types.ts`
- `src/app/plugins/issue-provider/plugin-issue-provider.model.ts`
- `src/app/plugins/issue-provider/plugin-http.service.ts`
- `src/app/plugins/issue-provider/plugin-http.service.spec.ts`

验收：Electron 与受支持原生路径对 401/403/404/429/5xx/超时产生相同的安全错误
字段；现有消费者仍收到其预期数据。估计：1–1.5 天。

### 6. 强制按提供方的议程节奏且无重叠

**依赖：** 无；在启用提供方之前必需。

合并的日历定时器可继续以最小配置间隔唤醒，但必须仅调用到期的提供方。按
提供方 ID 跟踪上次尝试/成功与进行中 promise。手动刷新将提供方标记为到期；
自动 tick 从不对已在进行中的提供方启动第二次请求。

可能涉及的文件：

- `src/app/features/calendar-integration/calendar-integration.service.ts`
- `src/app/features/calendar-integration/calendar-integration.service.spec.ts`

验收：Google 为一分钟、Microsoft 为五分钟时，Microsoft 每五分钟调用一次；慢
请求从不重叠；启用/禁用与提供方移除清除节奏状态。估计：1–1.5 天。

### 7. 为议程提供方添加默认自动轮询能力

**依赖：** 无；可叠加的公共契约。

向 issue-provider 清单管道添加 `defaultAutoPoll?: boolean`。保留现有插件的
当前默认；Microsoft 设为 false。这防止隐藏的议程视图默认启动按已链接任务的
Graph 轮询。

可能涉及的契约/管道文件：

- `packages/plugin-api/src/issue-provider-types.ts`
- `src/app/plugins/issue-provider/plugin-issue-provider.model.ts`
- `src/app/plugins/issue-provider/plugin-issue-provider-registry.service.ts`
- `src/app/plugins/issue-provider/plugin-issue-provider-registry.service.spec.ts`
- `src/app/plugins/plugin-bridge.service.ts`

然后在提供方设置模型中应用，并在对话框 spec 中覆盖。验收：新的 Microsoft
配置存储 `isAutoPoll: false`；Google 与现有提供方保留当前默认。估计：
0.5–1 天。

### 8. 通过议程契约保留仅日期截止日与规范 URL

**依赖：** 契约审查检查点。

向 `PluginSearchResult` 与 `CalendarIntegrationEvent` 添加可选
`dueDay?: string`。映射插件议程结果时保留 `dueDay` 与 `url`。将 `dueDay`
验证为 `YYYY-MM-DD`；issue 适配器必须优先于从 `start` 毫秒推导日期。事件打开
优先规范 HTTPS URL，并回退到 `getIssueLink`。

可能涉及的文件，必要时拆成两个小提交：

- `packages/plugin-api/src/issue-provider-types.ts`
- `src/app/features/calendar-integration/calendar-integration.model.ts`
- `src/app/features/calendar-integration/calendar-integration.service.ts` 与 spec
- `src/app/plugins/issue-provider/plugin-issue-provider-adapter.service.ts` 与 spec
- `src/app/features/calendar-integration/calendar-event-actions.service.ts` 与 spec

验收：邮箱/设备时区差异从不偏移全天任务日期；覆盖规范 URL、回退 URL、畸形
URL 与普通 iCal 行为。估计：1–2 天。

### 9. 仅清除认证失效的日历缓存条目

**依赖：** 任务 3 与 8。

在日历集成中消费 OAuth 会话变更事件。在断开、账户替换或终端失效时，移除由
该插件注册的提供方配置所属的内存与本地存储条目。瞬时离线/429/5xx 失败保留
上次完整快照。

可能涉及的文件：

- `src/app/features/calendar-integration/calendar-integration.service.ts`
- `src/app/features/calendar-integration/calendar-integration.service.spec.ts`
- 若尚未完成，任务 3 的 OAuth 事件定义/specs

验收：断开或重连后不可见旧账户标题/链接；离线启动仅在同一 OAuth 会话仍有效
时可显示先前账户的缓存。估计：1 天。

**检查点 A：** 运行所有针对性的 OAuth、插件 HTTP、日历集成、issue 适配器、
提供方对话框与 Google Calendar 测试。在开始 Microsoft 包之前审查每个可叠加
公共类型。若这些变更需要破坏性插件 API，停止并改为撰写架构决策。

### 10. 用真实 i18n 搭建提供方脚手架

**依赖：** 检查点 A。

创建 `packages/plugin-dev/microsoft-calendar-provider/`，采用 Google 提供方的
Vitest/esbuild 形态，但遵循当前插件 i18n 契约，而非复制 Google 的硬编码标签。

必需资产：

- 永久清单 ID `microsoft-calendar-provider`；
- `i18n.languages: ["en"]` 与 `i18n/en.json`；
- 复制清单、图标与英文翻译的构建脚本；
- 每个面向用户的提供方字符串使用 `PluginAPI.translate`；
- 仅 OAuth 与 HTTP 权限；无 node 执行；
- `useAgendaView: true`、五分钟议程间隔、
  `defaultAutoAddToBacklog: false` 与 `defaultAutoPoll: false`；
- 无 web/移动客户端 ID，且 `supportedPlatforms: ["electron"]`。

可能涉及的包/工具文件：`package.json`、`package-lock.json`、`tsconfig.json`、
`vitest.config.ts` 与 `scripts/build.js`。保持运行时代码无依赖；作用域内的
构建/测试包镜像现有插件。估计：1 天。

### 11. 实现纯 Graph 边界解析与映射

**依赖：** 任务 10。

为配置验证、Graph 响应验证、复合 ID、URL 允许列表与日期映射创建小型类型化
模块。将每个 Graph 响应与 `nextLink` 视为不可信。每个带 bearer 认证的绝对 URL
必须是 HTTPS 且主机名恰好为 `graph.microsoft.com`；拒绝凭证、替代端口、外观
相似后缀与重定向派生的主机。

映射规则：

- 每次事件请求使用 `Prefer: IdType="ImmutableId"`；
- 使用可逆的日历 ID + 事件 ID 复合键并保留大小写；
- 过滤已取消事件，并默认平静地过滤用户已拒绝的事件；
- 对空 subject 使用本地化的「Untitled event」回退；
- 定时值使用所提供的 Graph 时区/偏移成为真实瞬间；
- 全天 start/end 保留日期字符串，end 为独占；数值日程瞬间仅从本地日期边界
  构造以供显示；
- 多日时长使用本地日期边界，使 23/25 小时 DST 日仍占据正确日历日；
- 仅接受安全的 HTTPS Outlook `webLink` 值。

验收：纯测试覆盖无效形态、过大字段、敌意 `nextLink`、ID 大小写、重复实例/
例外、缺失标题、定时时区偏移、邮箱时区与设备时区不同、旅行、DST 与多日全天
事件。估计：2 天。

### 12. 连接 OAuth 并仅加载自有日历

**依赖：** 任务 3、4、10 与 11。

针对 `organizations` 端点，用 Phase 0 客户端 ID 与重定向配置授权码 + PKCE。
连接后加载 `/me/calendars`。从默认日历确立邮箱所有者，将日历过滤为同一规范化
所有者，并在所有者数据缺失时按规范失败关闭。不持久化或记录所有者地址。

多选为必需且上限 10。在保存/测试前，将已同步的所选 ID 与本地返回的自有日历
ID 核对。若无一匹配或部分匹配，显示账户不匹配/重新选择错误且不发起事件调用。
设置文案必须说明断开/重连会影响设备上的每个 Microsoft Calendar 配置。

验收：普通自有日历出现；共享/委派日历不出现；来自同一账户的已同步配置可用；
来自不同账户的已同步配置安全失败。估计：1–1.5 天。

### 13. 实现有界事件获取与提供方缓存

**依赖：** 任务 5、6、11 与 12。

使用固定窗口与数值限制获取每个所选日历的 `calendarView`。仅跟随已验证的
`@odata.nextLink` 值。限制并发，强制每个缓存键一次进行中 promise，并实现上方
固定的失败/重试语义。

使用会话内存缓存，键为单向内存账户所有者指纹加上排序后的所选日历 ID 与窗口。
永不持久化指纹。首次议程加载前，搜索可填充同一缓存一次；之后 `searchIssues`
在本地过滤。在连接、断开、选择变更或 OAuth 终端失效时清除它。

验收：测试证明分页上限、总事件上限、两种 Retry-After 形式的 429、长
Retry-After 中止、5xx 退避、超时、401 强制刷新一次、终端重连、无重叠获取、
缓存隔离，以及对上次完整快照的全有或全无保留。估计：2–3 天。

### 14. 注册只读提供方定义

**依赖：** 任务 13。

实现强制的 issue-provider 方法：

- `getHeaders` 获取当前 OAuth 访问令牌；
- `testConnection` 验证账户、选择与一次有界 Graph 调用；
- `getNewIssuesForBacklog` 返回议程窗口；
- `searchIssues` 搜索同一缓存，仅在需要时获取一次；
- `getById` 复用新鲜缓存条目或执行一次有界直接查找；
- `getIssueLink` 使用缓存的规范链接与已记录的工作/学校回退；
- `issueDisplay` 仅显示非敏感基本字段。

不注册 `createIssue`、`updateIssue`、`deleteIssue`、评论、时间块方法或推送字段
映射。不在映射对象中包含 Graph 事件正文。

验收：静态/spy 测试证明不存在写 HTTP 方法或写提供方钩子；任务创建按需获得
标题、`dueWithTime` 或 `dueDay`、时长/时间估计与源链接。估计：1–1.5 天。

### 15. 捆绑并保留永久插件 ID

**依赖：** 任务 10 与 14。

原子地注册构建/复制与发现：

- `packages/plugin-dev/scripts/build-all.js`
- `src/app/plugins/plugin.service.ts`
- `electron/bundled-plugin-ids.test.cjs`（验证；仅当测试本身不需要新行为时
  更改）

验收：构建资产包含 `manifest.json`、`plugin.js`、`icon.svg` 与 `i18n/en.json`；
资产路径与保留的清单 ID 不能漂移。估计：0.5 天。

### 16. 记录隐私、平台与租户限制

**依赖：** 可工作的实现。

在同一功能 PR 中更新用户文档：

- `docs/wiki/3.07-Issue-Integration-Comparison.md`
- `docs/wiki/4.24-Integrations.md`
- `docs/wiki/3.05-Web-App-vs-Desktop.md`
- `docs/wiki/3.06-User-Data.md`

记录确切作用域、只读行为、仅 Electron 支持、一个本地账户、已同步选择与未同步
凭证、大学管理员批准，以及存储：本地 only IndexedDB 中的 OAuth 令牌，加上现有
未加密日历本地存储缓存中的基本事件元数据/源 URL。说明各缓存何时保留或清除。
估计：0.5–1 天。

### 17. 端到端验证与试点

**依赖：** 所有实现任务。

运行：

- 对每个变更的 `.ts` 或 `.scss` 文件 `npm run checkFile <filepath>`；
- OAuth、插件 HTTP、日历集成、提供方对话框、issue 适配器与 Google Calendar
  回归的针对性根 specs；
- Microsoft 插件 `npm test`、`npm run typecheck` 与 `npm run build`；
- `node --test electron/bundled-plugin-ids.test.cjs`；
- `npm run plugins:build` 与适合发布分支的生产构建。

手动矩阵：

- Windows、macOS 与 Linux Electron；
- 普通租户与代表性大学租户；
- 首次同意、拒绝同意、需要管理员批准、过期访问令牌、轮换刷新令牌、离线刷新、
  已撤销授权，以及重连到另一账户；
- 一个与十个日历、同账户已同步配置、不同账户已同步配置；
- 定时、重复、例外、已取消、已拒绝、全天、多日、DST，以及邮箱/设备时区不匹配；
- 一分钟 Google 加五分钟 Microsoft 节奏；
- 断开/账户切换缓存清除与离线陈旧缓存保留；
- 端口冲突与错误路径/state 环回请求。

在一般发布前与报告用户试点。成功试点意味着他们无需 iCal URL 即可连接、选择
大学日历、从议程规划、创建任务快照，并在不请求更广权限的情况下打开 Outlook
事件。估计：1.5–2 天外加用户可用性。

## 安全与隐私验收标准

- 不提交客户端密钥或租户特定标识符。
- 仅请求 `offline_access` 与委派的 `Calendars.ReadBasic`。
- 每个 OAuth 流程使用 PKCE 与 state；环回监听器仅在 `127.0.0.1` 上接受预期
  路径/state。
- Bearer 令牌仅发送到确切的 HTTPS Microsoft Graph 主机。
- 重定向与 `nextLink` 值不能将 bearer 请求移到另一主机。
- Graph 响应值在边界处进行形态/长度验证，并仅通过正常转义的 Angular/插件表单
  路径渲染。
- 日志仅含安全类别/状态/计数与不透明内部提供方 ID；从不包含令牌、代码、邮箱
  地址、租户 ID、标题、正文、事件 URL 或原始 Graph 错误载荷。
- OAuth 凭证仅本地，从不进入已同步的 `pluginConfig`。
- 既不请求也不缓存事件正文、与会者与附件。
- 账户替换、断开与终端认证失败清除受影响的缓存事件元数据。
- 自动与手动请求路径共享并发、分页、重试与超时界限。
- 不引入新的根依赖。

## 发布标准

仅在以下全部为真时发布：

- Phase 0 对代表性教育租户通过。
- Entra 应用注册有具名长期所有者与发布者验证决策。
- 不支持的平台不能启动 OAuth。
- 刷新轮换在重启后存活，且不能与断开/重连竞态。
- Microsoft 调用即使旁边有更快提供方也保持自身节奏。
- 已导入任务不触发自动按任务 Graph 轮询。
- 选择中不出现共享/委派日历。
- 全天日期在邮箱/设备时区差异下保持稳定。
- 限流尊重 Retry-After，且所有请求/页/事件限制经测试。
- 缓存保留/清除行为经测试并记录。
- 现有 Google Calendar 行为保持绿色。
- 大学试点在无更广作用域的情况下成功。

## 延后跟进

仅在真实需求与单独设计审查之后考虑：

- 带有专用 Entra 重定向/客户端配置的 Android/iOS 支持。
- Web 支持，包括 24 小时 SPA 刷新令牌寿命与 CORS/重新认证设计。
- Outlook.com 消费者账户与主权云端点集。
- 带有显式权限与所有权 UX 的共享/委派日历。
- 每台设备多个账户，这需要更改插件全局 OAuth 存储。
- 事件写操作与时间块同步，这需要 `Calendars.ReadWrite`、冲突语义与大得多的
  信任面。
- 若测得的 Graph 量证明增加的状态与生命周期复杂度合理，则使用增量查询或变更
  通知。

## 已核对的官方参考

- [Microsoft identity platform authorization-code flow with PKCE](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)
- [Redirect URI restrictions and loopback rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
- [Refresh-token replacement and lifetimes](https://learn.microsoft.com/en-us/entra/identity-platform/refresh-tokens)
- [`Calendars.ReadBasic` delegated permission](https://learn.microsoft.com/en-us/graph/permissions-reference#calendarsreadbasic)
- [Tenant user-consent configuration](https://learn.microsoft.com/en-us/entra/identity/enterprise-apps/configure-user-consent)
- [Publisher verification](https://learn.microsoft.com/en-us/entra/identity-platform/publisher-verification-overview)
- [List calendars](https://learn.microsoft.com/en-us/graph/api/user-list-calendars?view=graph-rest-1.0)
- [Shared and delegated Outlook calendars](https://learn.microsoft.com/en-us/graph/outlook-get-shared-events-calendars)
- [Calendar view and recurrence expansion](https://learn.microsoft.com/en-us/graph/api/calendar-list-calendarview?view=graph-rest-1.0)
- [Outlook immutable IDs](https://learn.microsoft.com/en-us/graph/outlook-immutable-id)
- [Microsoft Graph event resource and `webLink`](https://learn.microsoft.com/en-us/graph/api/resources/event?view=graph-rest-1.0)
- [Get an event](https://learn.microsoft.com/en-us/graph/api/event-get?view=graph-rest-1.0)
- [Microsoft Graph throttling and Retry-After](https://learn.microsoft.com/en-us/graph/throttling)
- [Claims challenges and Conditional Access](https://learn.microsoft.com/en-us/entra/identity-platform/claims-challenge)
