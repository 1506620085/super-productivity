# iOS 主屏幕小组件（移植 Android 小组件）

> **状态：** 已在开放 PR #8950 上实现；尚未合并到本分支
>
> **实现分支：** `codex/pr-8950-improvements`
>
> **最后验证：** 2026-07-29
>
> 实现合并后，且其持久契约与限制已迁入维护中的小组件指南后，
> 删除本计划。

将 Android 任务列表小组件（PR #8737；见
[维护中的 Android 小组件指南](../android-home-screen-widget.md)）通过 WidgetKit
扩展移植到 iOS。Android 架构——单向版本化 JSON 快照 + 后写覆盖的完成点击队列 +
渲染时待定覆盖——正是 WidgetKit 所需的形态，因此这是视图层与管道层的移植，
而非重新设计。

## 架构映射（原样复用 `v: 1` 契约）

| Android                                                                    | iOS                                                                                              |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `KeyValStore` blob `widget_data`（SQLite）                                  | App Group `UserDefaults(suiteName:)`，相同 key，相同 JSON                                        |
| `TaskListWidgetProvider` + `RemoteViewsService` + XML 布局              | WidgetKit 扩展：`TimelineProvider` + SwiftUI 列表                                           |
| `JavaScriptInterface.saveToDbWrapped` / `updateWidget()`                   | 本地 Capacitor 插件：`setWidgetData(json)` + `WidgetCenter.shared.reloadTimelines`            |
| 复选框点击 → `WidgetDoneQueue`（SharedPreferences）                       | `Button(intent:)` → AppIntent 将相同的 `{taskId: targetIsDone}` map 写入 App Group defaults |
| 渲染时待定完成覆盖（`WidgetData.parse(pendingDoneTargets:)`） | Swift 解析器中的相同覆盖——逐行移植，含 JSON-null 守卫            |
| 排空触发：`onResume$` + 实时 LocalBroadcast                          | 仅 Capacitor `resume`（见限制）                                                        |
| 标题栏/行点击 → 启动 activity                                           | `widgetURL` 深链接 → 打开应用（无按任务导航，与 Android v1 一致）                   |

- **单写者不变式沿用：** Angular 是 `widget_data` 的唯一写者；AppIntent
  只写队列；小组件在渲染时覆盖待定目标。写竞争在结构上仍不可能发生。
- **时间线策略 `.never`** — 条目永不过期；每次刷新都是显式的
  `reloadTimelines` 推送（应用在快照写入后，AppIntent 在队列写入后）。
  无轮询，无后台刷新配额博弈。
- **契约：** 相同的 `v: 1` blob（`AndroidWidgetData`，位于
  `src/app/features/android/android-widget.model.ts`）。Swift 解析器成为
  第三个具名端点；未知 `v` 渲染空小组件，与 Kotlin 相同。作为 Angular
  步骤的一部分，将 TS 类型重命名为平台无关名称（`WidgetData`）。

## 工作项

### 1. Xcode 工程 + 签名（摩擦的一半——无逻辑）

- 新建 WidgetKit 扩展目标 `SupWidget`，bundle ID
  `com.super-productivity.app.widget`，**部署目标 iOS 17.0**，而应用本身
  仍为 16.0。理由：交互式小组件（`Button(intent:)`/AppIntents）需要
  17+；为 16 提供仅可看不可点的回退意味着第二条代码路径和更差的小组件——
  低于 17 时小组件直接不可用，应用不受影响。仅当 16.x 采用率数据另有说明时
  再重新评估。
- **两个**目标均启用 App Groups 能力，group ID
  `group.com.super-productivity.app`。
- Apple 开发者门户：注册扩展 App ID，在两个 App ID 上启用 App Group，
  重新生成两个预配描述文件。
- CI（`.github/workflows/build-ios.yml`）：签名使用单一手动管理的
  描述文件密钥（`IOS_PROVISION_PROFILE`）。需要第二个密钥用于扩展
  描述文件，以相同方式安装，并在导出选项中增加额外条目。现有的
  "Apple Distribution" 证书覆盖两个目标。
- `npx cap sync ios` 不得与新目标冲突——扩展目标位于 Capacitor
  管理组之外，验证一次并在扩展目录 README 中注明。

### 2. 小组件扩展（Swift，约 250–400 行，全部新建）

- `WidgetData.swift`：解析 `v: 1` JSON + 待定完成覆盖。移植 Kotlin
  解析器的边界情况：版本门控 → 空列表，缺失的 `projectId`（Angular 省略，
  从不为 null），`projectColors` 查找。在扩展目标中用与
  `WidgetDataTest.kt` 相同的 golden JSON 做单元测试——复制夹具，使两个
  解析器锁定为同一种形态。
- `DoneQueue.swift`：App Group defaults 中的后写覆盖 `[String: Bool]`；
  `setTarget`、`getAndClear`、`peek`——镜像 `WidgetDoneQueue.kt` 语义
  （通过串行队列保证 get-and-clear 原子性；UserDefaults 对单槽 JSON
  字符串进程安全足够，与 SharedPreferences 方案一致）。
- `ToggleDoneIntent`（AppIntent）：参数 `taskId` + `setDone`（目标在渲染时
  根据*显示*状态计算，因此重复点击会切换——与 Android punch-list 第 1 项
  的精神兄弟姐妹相同修复）。写入队列后返回；WidgetKit 在 intent 后自动
  重新渲染，覆盖显示新状态。
- `TaskListWidget.swift`：`TimelineProvider`（单条目，`.never`），SwiftUI
  视图——标题栏（应用名 + 计数，点击 = `widgetURL`），任务行（项目颜色条、
  标题、复选框 `Button(intent:)`），空状态。v1 使用 `.systemMedium` +
  `.systemLarge` 尺寸族。静态偏暗样式以匹配 Android v1 外观；仅在无成本时
  跟随系统 `colorScheme`。

### 3. 桥接插件（Swift + ObjC stub，约 100 行）

在 `ios/App/App/` 中按现有 `StoreReviewPlugin.swift`/`.m` 模式实现本地
Capacitor 插件 `WidgetBridgePlugin`：

- `setWidgetData({ json })` → 写入 App Group defaults，然后
  `WidgetCenter.shared.reloadTimelines(ofKind:)`。
- `getAndClearDoneQueue()` → 返回 `{ json: string | null }`。

无 `getWidgetTaskQueue` 等价物——分享 intent 处理不在范围内。

### 4. Angular（约 100–150 行，主要是通用化）

- 从 `WidgetDataService` 抽出平台特定写入：保留 selector 读取 +
  上次推送 JSON 去重，对 sink 分支——
  `IS_ANDROID_WEB_VIEW` → `androidInterface`，`Capacitor.getPlatform() === 'ios'` →
  `registerPlugin<WidgetBridgePlugin>('WidgetBridge')`（模式：
  `src/app/features/dialog-please-rate/store-review/index.ts`）。
- Effects：通过将门控拓宽为「android webview 或 iOS native」复用
  `android-widget.effects.ts` 触发器。iOS 上的触发器：状态变化
  （带防抖，含现有 hydration 守卫）、同步窗口下降沿，以及 Capacitor
  `pause`（App Group 写入很快；适合约 5 秒后台宽限）。排空触发器：
  Capacitor `resume` + 初始数据已加载门控，喂入现有纯函数
  `getTaskDoneChangesToApply()`——无 iOS 特定排空逻辑。
- 移动/重命名 `features/android/android-widget.*` →
  `features/widget/`，使用平台无关名称；`android-interface.ts` 保留其
  作为 Android sink 的角色。相同的聚合 `WIDGET_TASKS_UPDATED` snack
  （已在 `en.json` 中）。
- 同步正确性检查：风险概况不变——effects 仍为 `dispatch: false` 的
  状态消费者；排空路径产生与 Android 排空完全相同的用户意图操作
  （去重 + skip-already-in-target 防止重放噪声）；同步窗口期间无新写入。

## 已知限制（有意为之，匹配或低于 Android v1）

- **应用存活时无实时排空。** Android 通过 LocalBroadcast 戳运行中的
  WebView；iOS 从扩展进程没有廉价等价物（Darwin 通知对 v1 属于过度工程）。
  应用在前台时点击会在下次 `resume` 时应用。由待定覆盖缓解：小组件本身
  始终立即正确。若将来重要：`CFNotificationCenter` Darwin 通知是升级路径。
- **直到下次打开才过期**，与进程已死的 Android 相同，但命中更频繁，因为
  iOS 会积极挂起 WebView。日切时显示昨天的列表，直到下次打开应用。挂起期间
  的跨客户端新鲜度留待 phase 2（BGAppRefreshTask + 同步——与 Android 的
  WorkManager 想法同一 phase-2 槽位）。
- **仅 iOS 17+**（应用本身仍为 iOS 16）。
- 小组件 chrome 字符串仅通过扩展的 strings 文件提供英文（与 Android v1
  `strings.xml` 对等）。
- 小组件不支持任务创建 / 撤销 / 按任务深链接。

## 待定决策（实现前确定）

1. App Group ID 字符串——建议 `group.com.super-productivity.app`；发版后
   难以更改（旧容器中会留下过期数据），一次选好。
2. TS 重命名（`features/android/android-widget.*` → `features/widget/`）
   是作为预备重构 PR 还是落在功能 PR 内。预备重构对审查更干净；无论哪种，
   Android 小组件 PR #8737 必须先合并，以免在重命名之上变基。

## 工作量估计

约 2–4 个专注日：约 0.5–1 天用于 Xcode 目标/App Group/门户/CI 签名，约 1–1.5
天用于扩展 + 插件，约 0.5 天用于 Angular 通用化 + specs，其余用于真机测试
（需要 Mac + 真机；模拟器中的交互式小组件不稳定）。App Store 对小组件的
审核属常规。

## 文件

原生（除非注明否则全部新建）：`ios/App/SupWidget/{TaskListWidget,WidgetData,DoneQueue,ToggleDoneIntent}.swift`，
扩展 `Info.plist` + entitlements，`App/App.entitlements`（App Group，编辑），
`ios/App/App/WidgetBridgePlugin.swift` + `.m`，`project.pbxproj`（新目标），
小组件单元测试 + 共享 golden JSON 夹具。

Angular：`features/widget/widget-data.model.ts`，`features/widget/widget-data.service.ts`
（+spec），`features/widget/store/widget.selectors.ts`（+spec），
`features/widget/store/widget.effects.ts`（+spec），`features/widget/widget-bridge.ts`
（Capacitor `registerPlugin`），`root-store/feature-stores.module.ts`。

CI/发布：`.github/workflows/build-ios.yml`（扩展描述文件），新
`IOS_WIDGET_PROVISION_PROFILE` 密钥，导出选项。
