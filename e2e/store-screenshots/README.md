# 自动化截图流水线

由 Playwright 驱动、基于单一种子数据集的可复现应用商店截图。

## 快速开始

```bash
# Capture the web-store matrix (all web viewports × matching scenarios)
npm run screenshots

# Or split:
npm run screenshots:capture          # full web matrix → dist/screenshots/_master/
npm run screenshots:capture:desktop  # desktopMaster only
npm run screenshots:capture:mobile   # iPhone/iPad/Android viewports only
npm run screenshots:capture:electron # Electron build → dist/screenshots/_master_electron/
npm run screenshots:electron         # capture:electron + build (lands in dist/)
npm run screenshots:build:flathub    # rebuild only dist/screenshots/flathub/
npm run screenshots:flathub          # Linux Electron capture + Flathub-ready build
npm run screenshots:build            # rebuild dist/ layout from existing masters

# One group while iterating
npx playwright test --config e2e/playwright.store-screenshots.config.ts \
  --project=desktopMaster --grep "desktop all"
```

## 环境变量覆盖

| 变量                                                        | 作用                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `SCREENSHOT_MODE=electron`                                 | 将 fixture 切换到 Electron 流水线（由 `screenshots:capture:electron` 设置）。                                                    |
| `SCREENSHOT_BASE_DATE=2026-05-06T09:30:00`                 | 固定种子构建器使用的「今天」锚点。默认取一个远离午夜、在 CI 各时区都安全的周三。                           |
| `SP_SCREENSHOT_BG_DARK_URL` / `SP_SCREENSHOT_BG_LIGHT_URL` | 覆盖默认 Unsplash 背景（例如指向本地资源，用于离线 / 隐私敏感场景）。                          |
| `SP_SCREENSHOT_BG_DISABLE=1`                               | 完全去掉背景图（由 `screenshots:flathub` 设置）。                                                                           |
| `SP_SCREENSHOT_BG_OVERLAY_OPACITY=80`                      | 驱动各上下文中「加深/变亮背景图以提升对比度」滑块（0–99）。截图默认 80，应用内默认 20。 |
| `SP_SCREENSHOTS_STORE=flathub`                             | 将后处理限制为某一商店规则。由 `screenshots:build:flathub` 使用，避免 Linux 截图重新生成 Mac App Store 输出。 |

主截图落在 `dist/screenshots/_master/<viewport>/<locale>/<theme>/<scenario>/<name>.png`。
各商店资源落在 `dist/screenshots/<store>/<locale>/NN-name.png`（以及 F-Droid 的 `fastlane/...` 布局）。
Web 与 Microsoft Store 共用通用桌面输出：`dist/screenshots/desktop/<locale>/`。

## 场景阵容

| 槽位       | 平台 | 主题 | 展示内容                                                     |
| ---------- | -------- | ----- | ----------------------------------------------------------------- |
| mobile-00  | mobile   | dark  | 封面/主视觉 — 今日列表并叠加营销文案            |
| desktop-00 | desktop  | dark  | 封面/主视觉 — 今日列表并叠加营销文案            |
| tablet-00  | tablet   | dark  | 封面/主视觉 — 今日列表并叠加营销文案            |
| mobile-01  | mobile   | dark  | 规划器                                                           |
| mobile-02  | mobile   | dark  | 规划器且日历导航展开                                |
| mobile-03  | mobile   | dark  | 艾森豪威尔矩阵看板                                           |
| mobile-04  | mobile   | light | 规划器展开（浅色变体）                                  |
| mobile-05  | mobile   | dark  | 日程视图                                                     |
| mobile-06  | mobile   | dark  | 今日任务列表                                                   |
| desktop-01 | desktop  | dark  | 今日 + 日程日面板打开                                   |
| desktop-02 | desktop  | dark  | 艾森豪威尔矩阵看板                                           |
| desktop-03 | desktop  | dark  | 日程视图                                                     |
| desktop-04 | desktop  | light | 项目（工作）+ 笔记面板已填充                            |
| desktop-05 | desktop  | dark  | 专注模式                                                        |
| desktop-06 | desktop  | light | 日程（浅色变体）                                          |
| desktop-07 | desktop  | dark  | 项目（工作）视图，无壁纸 — 常规配色更干净 |
| desktop-08 | desktop  | dark  | 规划器                                                           |
| desktop-09 | desktop  | light | 项目（工作）+ 议题提供者面板打开                        |
| desktop-10 | desktop  | dark  | 项目（工作）+ 任务详情面板打开                           |

规格按平台分组：`scenarios/desktop/all.spec.ts` 与 `scenarios/mobile/all.spec.ts` 各自在单次会话中捕获所有槽位，组间通过 `applyTheme()` 切换 `DARK_MODE`（Playwright 的 `addInitScript` 为追加式，因此每次 reload 时后执行的脚本生效）。每个规格对每个语言环境（en + de）各运行一次。

## 文件

| 路径                                        | 用途                                                                                                                                                                                  |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `matrix.ts`                                 | 语言环境、主题、视口、移动/桌面分类、商店规则、共享桌面输出                                                                                            |
| `seed/seed.template.json`                   | 带日期偏移与 `@@PLANNER_OFFSET_+N` 占位符的精选数据集                                                                                                                 |
| `seed/build-seed.ts`                        | 将偏移物化为绝对日期，注入 `locale` + `customTheme`                                                                                                                 |
| `fixture.ts`                                | 固定时钟、应用深色模式、经 UI 流程导入种子，暴露 `screenshotMaster`（读取实时 `DARK_MODE`，使浅色/深色场景落在正确目录）                      |
| `helpers.ts`                                | `gotoAndSettle`、面板打开辅助、`resetView`、`applyTheme`、`applyLocale`、`applyTimeTrackingEnabled`、`applySideNavCollapsed`、`setPlannerCalendarExpanded`、`showMarketingOverlay` |
| `marketing-copy.ts`                         | slot-00 主视觉叠加层显示的标题 + 副标题                                                                                                                                     |
| `scenarios/desktop/all.spec.ts`             | 12 张桌面截图：主视觉 + 11 个场景 / 浅色变体                                                                                                                                   |
| `scenarios/mobile/all.spec.ts`              | 7 个移动槽位：主视觉 + 6 个场景                                                                                                                                                          |
| `scenarios/tablet/all.spec.ts`              | 6 个平板槽位：主视觉 + 5 个场景                                                                                                                                                          |
| `build-store-assets.ts`                     | 重命名并复制主图到共享/各商店布局；过滤/装帧 Flathub；对有 `maxBytes` 上限的商店（Snap）做 JPEG 重编码；生成 `_preview.html` 联系表                  |
| `../playwright.store-screenshots.config.ts` | 独立 Playwright 配置；每个视口一个 project                                                                                                                                     |

## 工作原理

1. **每个测试的种子文件**物化到 `.tmp/screenshot-seeds/seed-<date>-<locale>[-<customTheme>].json`。
2. **Fixture** 以 `page.clock.install({ time: SCREENSHOT_BASE_DATE })` 启动应用，设置 `localStorage.DARK_MODE`，将浏览器上下文固定为 `en-US`（使 `ImportPage` 的英文文本匹配始终有效），然后通过 `BackupService.importCompleteBackup` 导入种子。语言环境经 `globalConfig.localization.lng` → `applyLanguageFromState$` effect 流转。自定义主题经 `globalConfig.misc.customTheme` 流转。
3. **每个场景规格**将应用驱动到某状态并调用 `screenshotMaster(scenario, name)`。Playwright project 名称（如 `desktopMaster`）决定视口。
4. **后处理器**将主图复制到共享/各商店布局。不做缩放——截图已是各商店所需的原生尺寸。

## 添加场景

```ts
// scenarios/desktop/08-new-thing.spec.ts
import { test } from '../../fixture';
import { LOCALES } from '../../matrix';
import { gotoAndSettle, onlyOn } from '../../helpers';

for (const locale of LOCALES) {
  test.describe(`@screenshot desktop-08-new-thing (${locale})`, () => {
    test.use({ locale, theme: 'dark' });

    test('new thing', async ({ seededPage, screenshotMaster }, testInfo) => {
      onlyOn(testInfo, 'desktop');
      await gotoAndSettle(seededPage, '/#/whatever');
      await seededPage.locator('whatever-component').waitFor();
      await screenshotMaster('desktop-08-new-thing', 'new-thing');
    });
  });
}
```

## 各商店注意事项

- **Web / MS Store** 共用 `dist/screenshots/desktop/<locale>/`；MS Store 底部 1/4 留给系统渲染文案，最多接受 10 张截图，因此上传前请从共享桌面集中最多挑 10 张。
- **Mac App Store** 拒绝在 16:10 画幅中加黑边的 16:9——请以原生 2880×1800 捕获。
- **Snap** 使用相同的桌面主图内容，但保持独立，因其上限为 5 张、每张 ≤2 MB，且为单一全局图库（无按语言区分）。流水线将所有桌面图重编码为 JPEG（mozjpeg，q90→q60 逐步降低）以满足上限；**上传 Snap 前请手动裁剪到 5 张**。
- **Play / Apple** 明确禁止 / 不鼓励设备外框。
- **Apple** 仅要求 iPhone 6.9"（1290×2796）与 iPad 13"（2064×2752）；更小尺寸自动派生。
- **Flathub** 要求原生窗口装饰并禁止叠加层——来源于 Electron 捕获流水线（单一全局图库）。在 Linux X11/Wayland 主机上通过 `npm run screenshots:flathub` 运行；它会禁用装饰性背景、去掉营销主视觉/重复变体，并以透明圆角 + 阴影装帧最终 PNG。

## Electron 流水线（Mac App Store、Flathub）

Web Chromium 截图在 macOS 上看起来不够「原生」——字体不对、滚动条不对、没有红绿灯按钮。Flathub 明确_要求_原生窗口装饰。因此有一条并行流水线，通过 Playwright 的 `_electron` API 运行真实的 SP Electron 构建。macOS 捕获使用 Electron 渲染器截图加上确定性的 hiddenInset 红绿灯叠加；Linux 捕获使用系统级区域工具（`grim`/`import`），以便 Flathub 获得真实的 GTK 装饰。

```bash
# Capture only — masters land in dist/screenshots/_master_electron/.
npm run screenshots:capture:electron

# Capture + build — masters and deliverables under dist/screenshots/
# (macappstore/, flathub/). Mirrors `npm run screenshots` for the web pipeline.
npm run screenshots:electron

# Flathub-ready Linux capture + targeted build. Disables decorative backgrounds
# and emits the filtered/framed dist/screenshots/flathub/ gallery.
npm run screenshots:flathub
```

相同场景、相同 fixture 文件——`store-screenshots/fixture.ts` 根据 `SCREENSHOT_MODE` 环境变量分支（由 npm 脚本设置）。每个桌面规格在两种模式下均可不变运行。

在 macOS 上，Playwright 启动的 Electron 并不总是被当作 LaunchServices 启动的 `.app`，即使窗口内容正确，系统捕获也可能漏掉 AppKit 的 hiddenInset 红绿灯。fixture 避开这条脆弱路径：以目标 2560×1600 Retina 尺寸捕获渲染器，并在 AppKit hiddenInset 坐标合成三个红绿灯。

在 Linux 上，系统级捕获抓取包含标题栏、阴影与 GTK 装饰的完整窗口矩形。边界来自 `BrowserWindow.getBounds()`；在 X11/Wayland 上 bounds == 像素。

各 OS 工具（必须在 PATH 中）：

- **macOS** — 无需外部捕获工具；fixture 强制 Retina 缩放捕获，使渲染器截图落在 2560×1600。
- **Linux X11** — ImageMagick（`apt install imagemagick`，提供 `import`）
- **Linux Wayland** — `grim`（`apt install grim`，仅 wlroots 系合成器）

Mac App Store 与 Flathub 商店规则在 `STORE_RULES` 中设有 `masterDir: 'electron'`，因此后处理器将这些截图拉取到 `dist/screenshots/macappstore/` 与 `dist/screenshots/flathub/`。Flathub 还在 `build-store-assets.ts` 中固定图库顺序并应用圆角透明窗口装帧。其余商店仍来自 web 流水线。

## 状态

- ✅ 基础：矩阵、种子构建器、fixture（web + electron 模式）、辅助函数、后处理器
- ✅ 26 张截图覆盖规划器、看板、日程、专注、笔记、项目视图、任务详情与议题提供者设置
- ✅ 每次构建在 `dist/screenshots/` 下生成 `_preview.html` 联系表，便于一键 QA
- ✅ Electron 模式流水线，含 macOS 红绿灯合成与 Linux OS 装饰捕获（`grim` / `import`）
- ✅ Mac App Store 已接入从 `_master_electron/` 取源
- ✅ Flathub STORE_RULE（单一图库，取自 `_master_electron/`，经过滤/装帧以适配 Flathub）
- ✅ Snap JPEG 重编码以满足 2 MB 上限（mozjpeg，按文件自动）
- ✅ 抑制 tooltip + 光标停靠，避免残留 Material tooltip 渗入截图
- ⏳ 在真实 Mac（或 Linux X11 做连通性）上对 Electron 流水线做冒烟测试
