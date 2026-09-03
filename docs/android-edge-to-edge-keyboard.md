# Android edge-to-edge（边到边）+ 软键盘（IME）

全局添加任务栏如何叠在键盘之上，以及完整的 #8508 始末。**在改动 Android 上任何与键盘/IME（输入法编辑器）相关的逻辑之前请先读本文——该区域已反复回退（#8295，随后是 #8508）。**

> **更新（2026-06-22）：已从 `@capawesome/...edge-to-edge-support` 迁移到
> Capacitor 内置的 `SystemBars`**（`insetsHandling: 'css'`）。边到边
> inset（安全区/内边距）+ IME 内边距现由 SystemBars 在 **WebView ≥ 140**（或
> API ≥ 35）上处理；**WebView < 140 / API < 35** 的尾部场景由 env() + 原生
> 键盘 shim（`adjustWebViewHeightForKeyboardBelowApi30`，现已门控为
> WebView < 140，以免与 SystemBars 冲突）覆盖。栏背景不再由插件绘制（SystemBars 没有颜色 API）——栏为透明，
> 主题色通过 `NavigationBarPlugin.setWebViewBackgroundColor`
> （窗口装饰 + WebView 表面）透出。下方关于 #8508 的章节描述的是 _此前_
> `@capawesome` 的机制，作为历史保留。迁移与设备矩阵验证已合入 [PR #8543](https://github.com/super-productivity/super-productivity/pull/8543)。

> **⚠️ 切勿基于「系统在 Android 15/16 上不会为键盘调整大小」的假设，
> 去为 IME 给 WebView 做 inset。** 真实设备（包括 Pixel 级别的
> Android 16 手机）仍会为键盘调整窗口大小。在此之上再做 inset
> 会双重计数并压扁 WebView。见下方 #8508。任何未来的 inset
> 都必须 _检测_ 窗口是否已经调整过大小。

## 添加任务栏如何定位

全局添加任务栏是 `position: fixed`，且仅通过一个 CSS
变量从底部抬起：

```scss
// add-task-bar.component.scss
:host-context(.isTouchOnly).global {
  bottom: calc(var(--keyboard-height) + var(--s2));
}
```

`--keyboard-height` 默认值为 `0px`。在 Android/web 上由
`GlobalThemeService._initVisualViewportKeyboardTracking()`
（`src/app/core/theme/global-theme.service.ts`）根据
`obscured = window.innerHeight - visualViewport.height` 设置，并有 100px 下限
（`KEYBOARD_THRESHOLD_PX`——`obscured <= 100` 视为 `0`）。在 iOS 上由
Capacitor Keyboard 插件设置。

因此，若 **要么** 窗口/WebView 收缩
（此时 `bottom: 0` 已在 IME 之上），**要么** 可视视口收缩
（此时 `--keyboard-height` 抬起任务栏），任务栏都会浮在键盘之上。在我们测试过的设备上，窗口
**确实** 会收缩（系统为 IME 调整大小），因此 `--keyboard-height`
保持为 `0`，任务栏正确位于 `bottom: var(--s2)`。

## #8508 — 倒序 / 不可见字符（真正根因）

**现象。** 在 Android 上，添加任务栏（以及搜索）出现倒序或
不可见字符；部分用户反馈「看不到自己在写什么，且 Enter
无效」。仅在 v18.11.0 上报（Pixel 10/Android 17、Galaxy S23 Ultra、
Pixel 8a、Tab S5e/Android 15）。

**根因。** v18.11.0 通过 `patch-package` 补丁（提交 `5497212b9`）修改了
`@capawesome/capacitor-android-edge-to-edge-support`，使其 **始终** 按 IME 高度
给 WebView 做 inset（每次 `OnApplyWindowInsetsListener` 回调时
`bottomMargin = max(imeInsets.bottom, …)`），以修复在 _假定_ 强制边到边模式下
任务栏位于键盘 _后面_ 的问题。

在真实设备上该假定不成立：即便在 Android 16 上，系统 **仍会为 IME 调整窗口大小**。
在一台 Android 16 手机上键盘弹出时测得：`window.innerHeight` 从 **732 → 141**（且 `--keyboard-height`
保持为 `0`）。补丁随后在已收缩的窗口之上再叠加 **约 ~909px** 的 inset → WebView 被压成约 ~141px 的细条，
键盘上方出现巨大空白。这种压扁布局几乎可以肯定就是
「看不到自己在写什么」报告的原因。

**修复（本次变更）。** 补丁已 **完全移除**。插件的原有行为——
`bottomMargin = keyboardVisible ? 0 : max(imeInsets.bottom, …)`，即
键盘弹出时不做 inset——让系统自行处理键盘。
**已在 Android 16 手机上验证：空隙消失，WebView 填满调整后的窗口，
任务栏紧贴键盘上方（未再出现键盘后方回退）。**

## 已排除的理论（勿再追查）

- **「Angular `ngModel` 的 `writeValue` 在 composition（输入合成）期间重置光标。」**
  已证伪。`NgModel` 的 `isPropertyUpdated` 守卫在模型等于刚输入的值时会跳过 `writeValue`，
  且添加任务栏在 composition 中途从不触碰
  `value`/`setSelectionRange`/`focus`。已用 e2e CDP IME
  探测（现已移除）及单元测试证明。
- **「composition 期间每按键的 DOM 抖动（signal 更新）。」** 不是
  原因。设备上日志显示 WebView 在稳定输入时 **不会** 重新布局。
- **按 SDK 版本门控（仅在 API 36+ 做 inset）以及 inset「闩锁」。** 两者
  都试过并已回退。门控是错的，因为 Android 16 手机会 _调整大小_
  （因此在那里仍会双重计数）；闩锁会持有过期的键盘高度并
  产生自己的空隙。

## 未决事项 — 若对报告者而言仍未修复

1. **在报告者设备上确认「倒序字符」现象。** 压扁 WebView / 空隙已在维护者的 Android 16 手机上验证修复。
   尚 **未确认** 所有报告者的 _倒序_ 是否都已消失
   （Pixel 10/A17、S23、Pixel 8a、Tab S5e）。请他们测试下一版构建。
2. **残留：系统本身会在建议条变化时调整大小。** 即便
   补丁已移除，日志仍显示 IME inset 在建议条切换时振荡（`imeBottom 909↔996`）——
   且 _系统_ 每次都会调整窗口大小。在系统调整大小期间输入仍可能打断 composition。这是
   Android 自身的 `adjustResize`，不是我们的代码。若报告持续，这是
   下一条线索（例如内容稳定布局，或防抖）。
3. **v18.11.0 的另一处变更。** 若补丁移除后倒序仍存在，
   请重新检查 `@angular/* 21.2.11 → 21.2.17` 升级（提交 `f51954f80`）——该发行版中
   唯一另一处与 IME 相邻的变更。
4. **长期正确修复。** 移除补丁只会在「强制边到边 **且** _可视_ 视口
   也不会因 IME 收缩」的设备上让任务栏落在键盘后面——否则 `--keyboard-height` 仍会抬起
   任务栏。那是外观问题且可能很少见，相对之下测试过的每台真实设备都会出现压扁布局。正确的 inset 应是 **检测是否调整大小**：仅在窗口
   尚未因 IME 收缩时做 inset。Web 侧检测已
   存在——`GlobalThemeService._isVisualViewportResizedForKeyboard()`——因此未来原生 inset 可复用该逻辑，而非重新推导。请在
   下方设备矩阵上验证。
5. **重新启用诊断。** 在 `EdgeToEdge.applyInsetsInternal` 中添加 `android.util.Log.d("SP8508", …)`，
   记录 `kbVisible` / `imeBottom` /
   `bottomMargin` / 是否触发了重新布局，然后 `adb -d logcat -s SP8508`。
   Web 侧：`chrome://inspect` →
   `{innerH: innerHeight, vvH: visualViewport.height, kb: getComputedStyle(document.documentElement).getPropertyValue('--keyboard-height')}`。

## #8508 后续 — SDK 28（Android 9）：添加任务栏位于键盘 BEHIND（后方）

**状态：修复已实现（`CapacitorMainActivity.adjustWebViewForKeyboardBelowApi30`），
待下方矩阵的设备上验证。** 18.12.0（补丁移除）之后，一名 **Android 9 / API 28** 用户报告全局添加任务栏位于
软键盘 _下方 / 后方_。这正是上方未决事项 #4 的兑现，以及它所预测的设备类别。

**为何特指 API 28。** 任务栏定位 _仅_ 依赖
`--keyboard-height`，由 `GlobalThemeService._initVisualViewportKeyboardTracking()`
从 `obscured = window.innerHeight - visualViewport.height` 得出。仅当 **要么** 窗口因 IME 调整大小 **要么** VisualViewport
收缩时才正确。在 API 28 上 _两者都不发生_：

1. `targetSdk 36` + `@capawesome` 边到边插件在 **所有** API 级别调用
   `setDecorFitsSystemWindows(window, false)` → 窗口进入边到边 → 系统停止为 IME 调整大小。
2. 插件在该设备上 _确实_ 检测到 IME
   （`WindowInsetsCompat.Type.ime()` 报告可见），并在键盘弹出时将 WebView
   `bottomMargin = 0`——`EdgeToEdge.applyInsetsInternal`：
   「系统已为键盘调整窗口大小」。但它 **没有**
   调整大小（见第 1 点），因此 WebView 保持全高，任务栏原地不动。
   _（设备上 logcat 确认此处 `keyboardVisible == true`；早先猜测
   `Type.ime()` 在 < 30 上单纯不可靠，对该设备而言是错的。）_
3. WebView 的 VisualViewport 也不收缩 →
   `obscured ≈ 0` → `--keyboard-height = 0` → `position: fixed` 的任务栏位于
   键盘后方。

**切勿在 Web 侧「修复」此问题。** 很诱人从原生高度回退去喂 `--keyboard-height`
（Activity 已在每次布局时测量 IME——`CapacitorMainActivity` 的 `OnGlobalLayoutListener`：
`keypadHeight = screenHeight - rect.bottom`，在每个 API 级别都可靠）。陷阱在于：`obscured` 在 **两种** 情况下都是 `≈0`——正常情况（窗口 732→141）
与本次故障情况（什么都没调整）——因此 Web 侧无法区分，除非跟踪基线 `innerHeight` 并计算
`max(obscured, nativeKbHeight - layoutShrink)`——而这 **正是** 下方「切勿做什么」中
已回退的 #8295 公式。在 _会_ 调整大小的设备上，那会双重计数并把任务栏浮到屏幕中间。Web 层缺少
区分信号；原生层有明确几何信息。

**已实现修复（原生，IME 弹出时显式设置 WebView 高度，限定于
API < 30）——`CapacitorMainActivity.adjustWebViewHeightForKeyboardBelowApi30`。**
由既有键盘 `OnGlobalLayoutListener` 驱动：

- 键盘弹出时：将 WebView 的显式 **布局高度** 设为键盘顶部，
  `height = rect.bottom − webViewTopOnScreen`
  （`getWindowVisibleDisplayFrame`，在 API 28 上可靠）。收缩视图会收缩
  web 布局视口，因此现有 CSS 会把任务栏解析到键盘上方，
  无需 Web 侧键盘高度运算。
- 键盘收起时：恢复静止高度
  （`webViewLayoutHeightDefault`，启动时捕获，例如 `MATCH_PARENT`），以便
  插件的正常基于 margin 的布局原样生效。
- 门控为 `Build.VERSION.SDK_INT < 30`，因此在 API >= 30 上严格空操作，18.12.0 已验证的行为
  **不受影响**。

> **为何用高度，而非 `bottomMargin`，也非插件的 listener。** 插件拥有
> `webView.bottomMargin`，并在 IME 可见时每次 inset 分发都把它重写为 0（`EdgeToEdge.applyInsetsInternal`，因为它期望系统
> 调整大小——而强制边到边在 API < 30 上阻止了这一点）。从第二个写入者修正 margin
> 会让任务栏 **不断闪烁**（设备上 logcat 显示
> margin 每帧在 `0 ↔ lift` 间交替）；WebView 底部 _padding_ 不会
> 移动 web 布局视口；完全替换插件的 listener 虽修复了闪烁，但阻止了插件重新调整其状态栏/导航栏
> **颜色覆盖层**，导致导航栏出现 **白色空隙**。设置显式 `layout_height` 是出路：
> 它是与插件管理的 margin 不同的属性，且对显式高度的视图而言，底部 margin 不会改变视图尺寸——因此两者
> 永不冲突，插件仍可做 _其他一切_（inset + 颜色覆盖层，
> 无白色空隙）。目标从可见 frame 读取，不依赖
> WebView 自身高度，因此各次布局稳定（无反馈环）。

**上游状态（为何需要本地变通）。** 这是 `@capawesome/capacitor-android-edge-to-edge-support`（固定
8.0.8）中已知、反复回退的区域：见 `capawesome-team/capacitor-plugins` #845/#490/#596/#725/#819（已关闭）
以及 #847（开放）。`EdgeToEdge.applyInsetsInternal` 中有问题的 `keyboardVisible ? 0 : max(ime, navbar)` 三元表达式
已被承认——维护者指向 Capacitor 核心 `ionic-team/capacitor#8466`（核心 PR #8481 已为 **内置** `SystemBars`
修复并合并），插件 PR #848（「correct WebView margin
calculation」）会修复该三元式但 **仍开放/未发布**。因此我们使用的插件路径上尚无
已发布修复；此原生变通独立于该时间线。长期而言，迁移到 Capacitor 8 内置 `SystemBars`
（`insetsHandling`）并弃用该插件，是维护者暗示的方向。

**为何不用 Web 侧：** `obscured` 无法区分「窗口已调整」与
「什么都没调整」，因此 Web 侧 `--keyboard-height` 回退就是已回退的 #8295
公式。原生有明确几何信息。

**发布前仍需：** 在下方设备矩阵上验证——该区域已在 #8295 静默回退，并在 #8508 回退两次。在真实
API < 30 设备上确认任务栏紧贴键盘顶部（无白色空隙、无闪烁），键盘收起时状态栏/导航栏布局不变；
在 API >= 30 设备上确认完全无变化。仅调试用的
`Log.d("SUPKeyboard", "webView height …")` 会报告每次高度写入——稳态下
期望每次显示/隐藏一次，而非一串流。合并前移除该日志。

## #8508 后续 — 全屏 markdown / 笔记编辑器被压扁

**状态：CSS 修复已实现，待设备上验证。** 在 #8508 上报：
在 Android 上键盘弹出时编辑项目（或任务）笔记，
`DialogFullscreenMarkdownComponent` 的工具栏 + 文本区 + 关闭/保存控件被
压到屏幕顶部，下方到键盘之间有大片空白。

**原因。** 任务栏并非唯一必须避开键盘的 `position: fixed` 表面——该对话框也是 `position: fixed; height: 100%`。其键盘规则
减去了 `--keyboard-overlay-offset`，而该变量 **仅在 iOS 上** 设置，因此在
Android 上是空操作。键盘弹出时对话框因此保持 `100%` 解析到的高度：在不调整大小的设备上为全高（内容在键盘后方），
或在有问题的 v18.11.0 WebView 上为压扁细条。

**修复（`dialog-fullscreen-markdown.component.scss`）。** 对 Android / 移动 web 情况使用与添加任务栏相同的、
可检测调整大小的 `--keyboard-height`；在单独规则中保留 iOS 的 `--keyboard-overlay-offset` 路径。iOS 同时带有
`isNativeMobile` 与 `isIOS`（并设置非零的 `--keyboard-height`），因此 Android 规则用
`:not(.isIOS)` 排除 iOS——两条规则互斥且与顺序无关
（而非依赖同等特异性的源码顺序）：

```scss
:host-context(body.isNativeMobile:not(.isIOS).isKeyboardVisible) {
  height: calc(100% - var(--keyboard-height, 0px));
}
:host-context(body.isIOS.isKeyboardVisible) {
  height: calc(100% - var(--keyboard-overlay-offset, 0px) - var(--safe-area-top));
}
```

这 **不是** 上方已回退的 #8295 陷阱：它读取纯 VisualViewport 的
`--keyboard-height`，从不叠加原生数据。本文档跟踪的设备类别覆盖：

- **API < 30** — SDK 28 原生修复收缩 WebView 布局高度，因此
  `100%` 已在键盘之上且 `--keyboard-height == 0`；规则为
  `100% - 0`。可行。
- **API >= 30，设备会调整大小**（已验证 18.12.0）— `--keyboard-height == 0`，
  因此 `100% - 0`。可行。
- **API >= 30，不调整大小但 VisualViewport 收缩**（未决事项 #4）—
  `--keyboard-height > 0` 将对话框抬到键盘之上，与添加任务栏一致。

**切勿在此再减去 `--safe-area-top`。** 该修复的早期版本
曾这样做（`100% - --keyboard-height - --safe-area-top`）。那是双重计数：
`:host` 是 `border-box`（全局 `* { box-sizing: border-box }`）且已有
`padding-top: var(--safe-area-top)`，因此顶部 inset 已 _包含在_ `height: 100%` 内。
再减一次会在关闭/保存控件与键盘之间留下 `--safe-area-top` 大小的空隙。在 API < 30 上 `--safe-area-top` 为 0 时不可见，
一旦上方状态栏修复使其非零就会显现
（在 API >= 30 上也是潜伏问题，因为 env() 已给出非零 `--safe-area-top`）。
iOS 规则暂时保留其 `- --safe-area-top` 项——其键盘运行时
不同（WebView 不调整大小），且未在 iOS 设备上验证；若出现 iOS 底部空隙，也应去掉该项。

## #8508 后续 — SDK 28（Android 9）：页眉绘制在状态栏 BEHIND（后方）

**状态：修复已实现（`CapacitorMainActivity.pushStatusBarOverlapBelowApi30`），
待设备上验证。** 与键盘无关——在 API 28 上 web 页眉与 **状态栏** 重叠（无顶部空隙），在 #8508 上报。

**根因。** SystemBars 迁移后，Android 不再从 JS 写入
`--safe-area-inset-*`；`--safe-area-top` 通过 SCSS 回退
`var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`（`_css-variables.scss`）解析。
在 **API >= 35** 上 SystemBars 注入 `--safe-area-inset-top`，在 **WebView >= 140** 上
WebView 自身的 `env(safe-area-inset-top)` 正确——但在强制边到边的
**WebView < 140 尾部**，WebView 延伸到状态栏下方，同时 `env(safe-area-inset-top)` 解析为 **0**（旧 WebView 仅把显示
_刘海/挖孔_ 映射为安全区内边距，而非状态栏）。因此
`--safe-area-top == 0`，内容绘制在状态栏下方（Android 9 / API 28）。

**为何不能纯 Web 侧回退。** Web 侧无法区分「WebView 边到边延伸到状态栏下」与「WebView 已 inset 到其下方」——
两种情况下 `env()` 都是 0，盲目加上状态栏高度会在已 inset 情况下双重计数。原生有几何信息。

**修复（原生重叠 → SCSS 回退）——`pushStatusBarOverlapBelowApi30`。** 从既有键盘 `OnGlobalLayoutListener` 测量重叠
`max(0, rect.top − webViewTopOnScreen)`——`rect.top` 是可见 frame 顶部
（= 状态栏高度，在 API 28 上可靠；与键盘路径读取的同一 frame），
`getLocationOnScreen` 是 WebView 顶部（边到边时为 0，已 inset 后 == 状态栏高度）。将其发布（物理 px → CSS px，去重）为
`--android-status-bar-overlap` CSS 变量，门控为 **SDK < 30 且 WebView < 140**
（镜像键盘 shim，永不与 SystemBars 冲突）。该变量折入 SCSS 回退（`_css-variables.scss`）——不从 JS 写入，因此永不与 SystemBars 在 `--safe-area-inset-*` 上竞态：

```scss
--safe-area-top: var(
  --safe-area-inset-top,
  max(env(safe-area-inset-top, 0px), var(--android-status-bar-overlap, 0px))
);
```

- 用 `max()` 而非求和，因此永不双重计数：WebView < 140 边到边 →
  env 为 0，overlap = 状态栏 → 状态栏；一旦已 inset → env 为 0，overlap 为 0 → 0。
- 在 **API >= 35 / WebView >= 140** 上 `--safe-area-inset-top` 已设置（SystemBars）或
  env() 正确，因此 `var()` 优先级 / `max()` 完全忽略 overlap——
  已验证行为不受影响。
- JS 读取方（`_patchCdkViewportForSafeArea`）仍将 `var(max(...))`
  词法解析为 0，因此覆盖层定位不变——保留 #8283 的作用域
  （仅页眉 padding 受影响）。
- 已知小缺口：一台 **API 30–34**、**旧 WebView < 140** 的设备也会有
  env()==0，但被 SDK < 30 门控排除；罕见（API 30 以上 WebView 会自动更新）——若出现可把门控放宽为仅 WebView。
- 该变量仅作为文档上的内联样式存在，因此 Web 侧重载
  （`window.location.reload()`——语言切换、PWA 更新、同步冲突恢复）会擦除它。原生去重（`lastStatusBarOverlapCssPx`）在
  `flushPendingShareIntent()` 中重置（每次前端（重新）加载都会运行），以便下次布局
  重新发布；若不重置，未变化的值会被跳过，重叠会在重载后回退。

## 切勿做什么

不要在 VisualViewport 信号之上再堆叠第二/第三个键盘高度来源（原生物理 px 高度 + `baseInnerHeight` 跟踪路径组合为
`max(obscured, nativeKeyboardHeight - layoutShrink)`）。那就是 #8295；来源在独立的异步事件上竞态，基线在动画中途被重置为已收缩的
`innerHeight`，双重计数守卫崩溃，任务栏被错位。已回退。在源头修复 inset，且 **仅在检测到** 系统是否已调整大小之后。

## SystemBars inset 来源风险（设备上未确认）

自 2026-06 SystemBars 迁移评审结转。这些是设备矩阵上待 **检查** 的项，不是盲目修复——盲目修复有重现 #8508 的风险。

1. **API >= 35 + WebView < 140 双重计数（窄带）。** 在 SystemBars 的非透传分支（API >= 35）中，它会对 WebView 父级 `setPadding` _并_
   注入 `--safe-area-inset-*`。若 web 也通过 `var(--safe-area-*)` 做 padding，
   会双重计数。常见的 API 36 情况是 WebView >= 140 = 透传（无静态父级 padding，因此无双重计数），使这成为陈旧 WebView 的边角。这正是 `src/styles/_css-variables.scss` 中 `--bottom-nav-safe-area`
   将 inset 减半的原因。在带旧 WebView 的 API 35/36 设备上验证；若属实，
   在该频段关掉 web padding，而非全局移除。
2. **`env(safe-area-inset-bottom)` 与 `var(--safe-area-bottom)` 消费者在 API >= 35 上分叉。** 部分 SCSS 读原始 `env()`，其他 SCSS 读
   `var(--safe-area-*)`。在 API >= 35 上 SystemBars 可能将透传 inset 置零，同时向变量注入真实 px，因此两族不一致。
   在 API 35/36 上确认底部导航 / 添加任务栏间距；若错误则按频段统一到单一来源。
3. **API 30-34 + WebView < 140 的 IME 归属。** 原生 shim 故意门控为 `SDK_INT < 30`
   （观察到较新 API 会为 IME 调整窗口大小，在其上再做 inset 会重现 #8508 压扁）。在 SystemBars 下，
   WebView < 140 在 API 35 以下得不到 IME padding。验证 API 30-34 上窗口是否仍调整大小：若会，则无空隙；若不会，将 shim 扩展到
   `< 35 && WebView < 140`——但仅在设备上确认之后。
4. **CDK overlay / 上下文菜单顶部位置在 API >= 35 上偏移。**
   `--safe-area-inset-top` 在该处解析为真实 px（此前在 Android 上为 0），
   因此连接的 overlay 会钳制在状态栏下方。可能更正确；请重新测试 overlay 矩阵。

## 设备测试矩阵（合并 IME 变更前必需）

行为因设备而异——测试打开键盘的添加任务栏，以及点击 + 后立即快速输入一个词，覆盖：

- Android 10（API 29）— 边到边之前；此处 `Type.ime()` inset 不可靠
- Android 14（API 34）— 仍可选择退出边到边
- Android 15（API 35）— 我们通过 `windowOptOutEdgeToEdgeEnforcement` 选择退出
- Android 16（API 36）— 我们的目标；在真实设备上观察到系统仍会为 IME 调整大小

手势导航与三键导航、浅色与深色均需覆盖。确认：键盘上方无空白空隙，任务栏紧贴键盘上方可见，且输入字符按顺序出现（非倒序）。
