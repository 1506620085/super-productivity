# 营销短片流水线

由 Playwright 驱动，为落地页与 GitHub README 生成营销 gif/视频。镜像截图流水线（`e2e/store-screenshots/`）——相同的 fixture/种子管道，类似的 npm 脚本形态。

## 运行

```bash
npm run video         # tight default (~17s) → dist/video/reel*.{mp4,webm,gif}
npm run video:full    # full variant (~21s) → dist/video/reel-full*.{...}
npm run video:shorts  # 9:16 portrait (~12s) → dist/video/reel-shorts*.{...}
                      # 1080×1920 for TikTok / YouTube Shorts / Instagram Reels.
                      # Skips the side-panel drag beat (no horizontal room).
npm run video:keyboard
                      # keyboard-first reel demonstrating SP shortcuts.
npm run video:mobile  # 19.5:9 phone aspect (1080×2340) → reel-mobile*.{...}
                      # hasTouch context + isMobile UA; tap-ripple replaces
                      # the cursor ring; tap-driven choreography.
npx cross-env MS_STORE_AUDIO_SOURCE=path/to/audio.ext npm run video:ms-store
                      # 16:9 Store trailer → dist/video/reel-ms-store.mp4 + thumbnail

# under the hood
npm run video:capture # Playwright records to .tmp/video/recordings/<variant>/
npm run video:build   # ffmpeg → dist/video/, picks the most recent webm
npm run video:open    # opens an autoplay browser preview, skips in CI
```

`REEL_VARIANT=<name>` 切换规格分支并添加文件名后缀，使多种变体可共存于 `dist/video/`。`full` 使用更长的编排。`ms-store` 复用紧凑编排，但以 1920×1080 捕获，并仅构建 Microsoft Store 预告片资源。

变体录制隔离在 `.tmp/video/recordings/<variant>/`（`default`、`full`、`ms-store` 等）下，这样 `video:build` 不会误用不同宽高比的录制。

`gifsicle` 是可选的——若缺失，构建脚本回退到 ffmpeg 的 gif。安装后还可得到 `reel-optimized.gif`（约小 30%）。

## 文件

| 文件                                     | 职责                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright.store-video.config.ts`       | 单个 chromium project，项目级 `video: 'off'`（由 fixture 自行处理 `recordVideo`，因为 `browser.newContext()` 不会继承 `use.video`）。                                                                                                             |
| `store-video/fixture.ts`                 | 启用 `recordVideo` 的自定义上下文：1024×1024 / DPR 2，或对 `REEL_VARIANT=ms-store` 使用 1920×1080 / DPR 1。复用截图流水线的种子构建器。Init 脚本处理：光标高亮环、对话框/snack/tooltip/mention 抑制、应用缩放。            |
| `store-video/overlays.ts`                | DOM 注入的叠加原语：`showOverlay`、`showCaption`、`showIntegrationsCard`、`showEndCard`、`cutToScene`、`fadeTransition`、`loopBoundary`、`attachDragGhost`、`smoothMouseMove`。以及 `LOGOS` 常量中的内联品牌 SVG。                                 |
| `store-video/scenarios/reel.spec.ts`     | 六拍编排。`REEL_VARIANT=full` 触发可选的 "No account. No tracking." 拍并放宽停留时间。`REEL_VARIANT=shorts` 跳过侧面板拖拽拍并收紧停留，以适配竖屏 9:16。对 `REEL_VARIANT=keyboard` 整段跳过。 |
| `store-video/scenarios/keyboard.spec.ts` | 键盘优先短片（仅 `REEL_VARIANT=keyboard`）。五拍：标语 → `Shift+A` 捕获 → `J`/`K` 导航 → `F` 专注模式 → 结束卡。每个 chip 都是真实的 `page.keyboard.press()`，因果关系诚实。                                                      |
| `store-video/scenarios/mobile.spec.ts`   | 移动触控短片（仅 `REEL_VARIANT=mobile`）。1080×2340 手机宽高比，带 `hasTouch`/`isMobile`。四拍：标语 → 点按捕获 → 点按专注 → 结束卡。fixture 在 `touchstart`/`pointerdown` 上安装 tap-ripple，替代光标高亮。         |
| `store-video/build-video.ts`             | 选取 `.tmp/video/recordings/` 下最新的 `.webm`，应用 trim sidecar（剪掉种子导入前导），经 ffmpeg 产出 mp4/webm/gif，可选 `gifsicle` 优化。对 `ms-store` 产出 1920×1080 H.264/AAC MP4 与 PNG 缩略图。             |
| `store-video/open-video.ts`              | 在 `npm run video` 后打开自动播放浏览器预览。优先 mp4，尊重 `REEL_VARIANT`，仅预览时略过第一帧黑屏，CI 中跳过自动打开。                                                                                       |

## 拍结构（当前）

```
Lead-in   black fades to SP UI with schedule day-panel already open
1  Capture in seconds.        global add-task-bar; types
                              "A task 1h" with 55ms keystroke delay.
                              Captured task carries through to beats 2 and 3.
1.5 [full only]               No account. No tracking.
2  Plan your day.             drags the newly captured "A task" item onto
                              the schedule panel with the app's native CDK
                              drag behavior and Playwright's stepped mouse
                              movement.
3  Focus on what matters.     dispatches `[Task] SetCurrentTask` /
                              `[FocusMode] Show Overlay` /
                              `[FocusMode] Start Session` directly via
                              `__e2eTestHelpers.store`. `clock.runFor(5500)`
                              skips the 5s countdown; `clock.resume()` lets
                              the timer tick during the hold.
4  Plays well with GitHub,    full-screen integrations card. Title in a
   Jira & more.               lower-third bar at `bottom: 72px`. Logos
                              centered above; brand colors on GitLab
                              (#fc6d26) and Jira (#2684ff). Subtitle "& many
                              more" below the grid.
5  Free and open source.      end card with monochrome SP logo, animated
                              stat counter-ups (★ 19K, 4.8 ★) staggered by
                              280ms, platforms line on one line.
Boundary  black fades in so the gif loop seam is black-to-black
```

## 场景转场

主短片使用两种转场风格：

1. `cutToScene(page, async () => { ... })` 用于应用状态变更与更大的界面跳转。它淡入一层最大 z-index 的黑色遮罩，在黑屏遮住应用时执行 setup，再淡出。第 1 → 2 拍在此遮罩回调内通过点击真实 backdrop 关闭 add-task-bar，从而在拖拽开始前隐藏列表回流与光标复位。传入 `label` 可记录 setup 在黑屏后花费的时间。
2. 受控全屏卡片的直接交叉淡入。第 4 → 5 拍在集成卡片上方显示结束卡，待结束卡基本不透明后隐藏下方的集成卡片。

**在 `cutToScene` 回调内始终向下一个叠加层/卡片传入 `noWait: true`。** 否则该调用会等待自身淡入（以及 `showIntegrationsCard`/`showEndCard` 的交错动画）——这些会在仍不透明的黑屏后播放而浪费。使用 `noWait` 时，调用在 DOM 就位后立即返回，淡入动画与 `cutToScene` 的从黑淡出并行。观众看到的是：场景 → 黑屏 → 下一场景带着其动画浮现。

`fadeTransition` 仍可在 `overlays.ts` 中使用，但请勿用于拖拽 setup 路径：其半透明变暗可能让底层应用回流透出，使拖拽前几帧看起来不对。

## 架构决策 / 注意事项

**Trim sidecar。** 录制必然包含编排开始前约 14 秒的种子导入导航。fixture 在创建上下文时盖上 `recordingState.startMs`；规格就绪时调用 `markBeatsStart()`；差值写入 `.tmp/video/recordings/_latest-trim.json`，ffmpeg `-ss` 跳过该段。**不要试图经 IndexedDB 注入种子**——addInitScript 与 SP 读取 IDB 的时序竞态确实不安全，而 trim sidecar 能正确处理主机速度差异。

**页面时钟。** `page.clock.install({ time: SCREENSHOT_BASE_DATE })` 默认开启（继承自截图 fixture）。这会冻结页面中的 `Date.now`、`setTimeout`、`setInterval` 与 `requestAnimationFrame`，直到调用 `clock.runFor(ms)` 或 `clock.resume()`。第 3 拍调用 `runFor(5500)` 跳过专注模式 5 秒倒计时，再 `resume()` 让运行中的计时器自然走动，结束卡统计数字动画（使用 rAF）也能播放。

**Material snack bar 与对话框。** 经 fixture init 脚本中的 CSS 隐藏（`.cdk-overlay-pane:has(.mat-mdc-dialog-container)`、`.mat-mdc-snack-bar-container`，以及 `mention-list`、`.mention-menu`、`.add-task-bar-panel`）。安装时钟后，snack 自动关闭计时器不会自行触发——隐藏它们比等待更干净。focus-mode-overlay 不是 mat-dialog，因此不受影响。

**应用缩放。** fixture init 中的 `app-root { zoom: 1.4 }` 在不缩小录制画布的情况下「放大」SP UI。1.4 时布局的内视口约为 1024/1.4 ≈ 731px——足以容纳工作视图 + 折叠侧栏 + 240 宽右侧面板而不裁切。更早的 1.5 会裁掉工作视图右缘。更早的 1.4 迭代_还_在 add-task-bar 上叠加了 `transform: scale(1.45)`，但与 zoom 叠加严重，裁切超出视口——仅让 `app-root zoom` 负责更简单。叠加层是 DOM 树中 `app-root` 的兄弟（追加到 `body`），因此不受此缩放影响——请按未缩放视口设计叠加层尺寸。

**日程日面板宽度。** 在 `ONBOARDING_INIT` 中通过 `localStorage.setItem('SUP_RIGHT_PANEL_WIDTH', '250')` 预置——这是 `RIGHT_PANEL_CONFIG.MIN_WIDTH`，面板在 200px 的 CLOSE_THRESHOLD 触发前允许的最小宽度。经面板自身的持久化路径预置，意味着内部日程网格按 250 计算列宽，事件块不会溢出。更早的迭代对 `.side` 强制 `width !important`，只改了外框尺寸却未传到网格——事件于是溢出面板右缘，还得用难看的 `overflow-x: hidden` 双保险裁切。不要走那条路。

**Add-task-bar 叠加层。** fixture 只隐藏输入时弹出在栏上方的_叠加表面_（mat-autocomplete 建议、mention-list、加载旋转器）——否则会在 gif 中间显示为毛刺白块。栏本身不受 fixture 样式影响；使用真实的 `:host` 规则。第 1 → 2 拍通过点击真实的 `.backdrop` 关闭它，匹配正常 UI 行为，而不是直接派发布局状态。

**光标高亮。** 在 `z-index: 2147483640` 的柔和白色径向渐变环，跟随 mousemove。通过 `body.__sp-hide-cursor-highlight` 按拍切换可见性——用于捕获拍，避免聚焦输入框时环显示为多余的点。

**主文字一致性。** `.__sp-video-overlay-text`、`.__sp-video-int-card-title`、`.__sp-video-end-card-title` 共享同一规则，带 `font-size: clamp(48px, 6.4vw, 96px) !important`。需要 `!important` 是因为 `.mat-typography h1` 的特异性为 (0,1,1)，高于仅 class 的选择器。卡片标题用 `<p>` 而非 `<h1>` 作为双保险——即使有 `!important`，排版的 font 简写也可能渗入。

**拖拽预览。** 第 2 拍刻意不使用合成视频幽灵。它依赖应用真实的 CDK 拖拽行为，使视觉预览与用户将任务拖到日程面板时看到的一致。保持源定位器绑定到 `CAPTURED_TASK_DISPLAY_TITLE`；使用 `task().first()` 可能误拖到更大的种子任务，使预览看起来被放大。

**循环边界。** `loopBoundary(page, 'in', ms)` 先显示全黑 opacity 1，再在 `ms` 内淡到 0（前导）。`loopBoundary(page, 'out', ms)` 从 0 淡到 1（收尾）。Gif 接缝为黑到黑，无跳切。`z-index: 2147483647`（最大安全值），覆盖包括结束卡在内的一切。

**输出帧率。** Playwright 录制器在本流水线中产出 25fps webm。`build-video.ts` 保持 MP4、WebM 与 GIF 均为 25fps，避免淡入淡出与光标移动时出现重复/丢帧抖动。

**Microsoft Store 变体。** `npm run video:ms-store` 设置 `REEL_VARIANT=ms-store`，以 1920×1080 录制，并产出：

- `dist/video/reel-ms-store.mp4` — H.264 High Profile、yuv420p、50 Mbps 目标、BT.709 色彩标签、closed GOP、2 个 B 帧、fast-start MP4，以及 48 kHz、384 kbps 编码器目标的 AAC-LC 立体声。
- `dist/video/reel-ms-store-thumbnail.png` — 成品预告片 1.2 秒处的 1920×1080 PNG 帧。

该变体遵循 Microsoft Partner Center 的应用预告片要求：MP4/MOV、1920×1080 视频、1920×1080 PNG 缩略图、标题少于 255 字符，且预告片内无年龄分级片头。构建用 `ffprobe` 校验生成的 MP4/PNG，尺寸、编解码器、profile、扫描类型、色彩标签、缺失音频或超过 2GB 时失败。

必需的 Store 环境变量：

- `MS_STORE_AUDIO_SOURCE=path/to/audio.ext` 在预告片下循环真实音频床。静音生成的 AAC 探测值远低于 Partner Center 的 384 kbps 立体声要求，因此未设置时 Store 构建会失败。

可选的 Store 环境变量：

- `MS_STORE_THUMBNAIL_AT_SECONDS=2.4` 从成品 MP4 选择不同的缩略图帧。

**构建脚本选取最新 webm。** 无需在运行间清理 `.tmp/video/recordings/`。旧 webm 会累积，但只有最新 `.mtime` 的会构建到输出。

**变体文件名后缀。** `build-video.ts` 读取 `process.env.REEL_VARIANT`，设置时向所有输出文件名追加 `-${variant}`。`npm run video:full` 能工作是因为环境变量会通过 `npm run` 传播。

## 迭代循环

1. 编辑 `reel.spec.ts`（文案、拍顺序、时长）或 `overlays.ts`（视觉样式）。
2. 对每个改动的 `.ts` 文件运行 `npm run checkFile <path>`（按项目 CLAUDE.md）。
3. `npm run video` — 捕获（约 32 秒）+ 构建（约 10 秒）。
4. 打开 `dist/video/reel-optimized.gif`。

**不要**在模板字面量的 CSS 注释中放反引号——它们会被解析为嵌套模板表达式并破坏 TypeScript。多次迭代已踩过此坑。

**不要**在规格坐标中混用无括号的 `+`/`*` 运算符——eslint `no-mixed-operators` 会失败。使用中间 `const` 或加括号。

## 待打磨想法（尚未上线）

- **主题 + 语言环境矩阵。** Fixture 已通过 `test.use({ theme, locale })` 支持两者。为每个变体添加 Playwright project；矩阵运行产出 `reel-en-dark.gif`、`reel-en-light.gif` 等。镜像截图流水线模式。
- ~~**宽高比变体。** 移动社交用 9:16（1080×1920）。~~ 已作为 `npm run video:shorts` 上线。各变体不同的 `VIDEO_SIZE` 在 `fixture.ts:getVideoProfile`。
- **5 秒社交剪辑。** `npm run video:short` 产出第 {1, 3, 5} 拍。变体标志的简单扩展。
- **投放槽高亮。** 拖拽任务落点的日程槽短暂 CSS 脉冲——给第 2 拍一个收尾标点。
- **Logo 入场时品牌色闪烁。** 当前 logo 为平面品牌色。可先亮闪再回落。
- **结束卡「Open the app →」CTA。** chip 风格视觉提示；非真实链接。
- **进一步收紧。** 当前默认约 17 秒；可通过收紧拖拽停顿推到约 14 秒。

## 与项目级 CLAUDE.md 的协调

位于 `e2e/` 下，因此 `e2e/CLAUDE.md` 规则同样适用（测试模板、fixture 约定）。按根项目指引通过 `npm run checkFile` 做 lint。不受翻译影响——目前所有叠加层文案在规格中硬编码为英文。
