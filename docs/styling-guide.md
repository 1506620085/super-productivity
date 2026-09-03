# 样式指南

## 规则

- **所有视觉样式必须使用 CSS 变量**，来自 `src/styles/_css-variables.scss`——绝不要硬编码颜色、间距、阴影、过渡或 z-index。
- **定位/布局可用普通 CSS**——flexbox、grid、display、position、尺寸。
- **创建新样式元素前先检查 `src/app/ui/`**——已有 40+ 可复用组件。
- **组件 SCSS 应尽量精简**——共享样式放在 `src/styles/components/` 或做成 mixin。
- **Material 浮层组件**（菜单、对话框、tooltip）渲染在组件作用域外——在 `src/styles/components/` 中样式化，并在组件中加注释指向那里。
- **只引用能到达该规则的自定义属性**——`var(--x)` 若 `--x` 未声明，或仅声明在某组件的 `:host` 内，会静默使整个声明失效。由 `npm run lint:css-vars`（`tools/check-css-vars.js`）在 SCSS、主题 CSS 与内联 `styles:`/`[ngStyle]` 上强制执行；失败时会说明如何修复。

## 反模式

| 避免                               | 改为这样做                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| 硬编码颜色（`#fff`、`red`）        | CSS 变量（`--text-color`、`--card-bg`、`--color-danger`）                 |
| 硬编码间距（`16px`、`1rem`）       | 间距变量（`--s2`、`--s`、`--s-half`）                                     |
| 硬编码阴影                         | 海拔变量（`--whiteframe-shadow-*dp`、`--md-sys-level*`）                  |
| 硬编码过渡/时长                    | 过渡变量（`--transition-standard`、`--transition-duration-*`）            |
| 自定义 z-index 值                  | Z-index 变量（`--z-main-header`、`--z-backdrop` 等）                      |
| 未检查就新建样式元素               | 先检查 `src/app/ui/` 是否已有可复用组件                                   |

## 对话框操作按钮

每种角色一种处理，使对话框感觉一致。按**功能而非标签**分类（关闭只读视图的「Close」是次要；提交的「Close」是主要）。

| 角色                             | 处理方式                          | 说明                                                             |
| -------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| 主要 / 确认                      | `mat-flat-button color="primary"` | Save、OK、Submit、Create、Schedule——主要肯定操作                 |
| 取消 / 关闭 / 次要               | `mat-button`（无 `color`）        | 弱化的文本按钮                                                   |
| 破坏性                           | `color="warn"`（保留变体）        | Delete、Remove、Unschedule——绝不并入主要                         |
| 真正的替代（非取消）             | `mat-stroked-button`              | 例如主要操作旁的「Skip instance」「Configure」                   |

规则：

- **图标：** 去掉 OK/Cancel/Save/Submit 上通用的 `check`/`close` 图标——毫无增益。保留有含义的图标（排期中的 `alarm`/`today`/`event_busy`、`wb_sunny`、`save`、`cloud_upload`、`delete_forever`）。
- **取消/关闭不加 `color`**——Cancel 上残留的 `color="primary"` 只会给它上色；删掉。
- **响应式外观**——当按钮外观必须在运行时改变时，在单个元素上绑定（`[matButton]="cond ? 'filled' : 'outlined'"`），而不是在 `@if`/`@else` 中交换两个按钮。属性形式在构造时固定，交换会重建节点，丢失焦点以及翻转中途的点击。见 `finish-day-btn.component.html`。
- **无死类**——遗留 Bootstrap `btn btn-primary` 类已移除；不要重新引入。`submit-button` 仅在 `dialog-create-tag` 内有样式。
- **对称选择对话框**（例如同步「用远程」vs「用本地」）可用两个匹配的 `mat-stroked-button`——没有单一主要。

## 提示框（info / warning / danger / success）

对话框与配置面板内的着色消息框使用全局 `.callout` 类，来自 `src/styles/components/_callout.scss`——绝不要用本地 `.warning-box` 克隆及其自有 `rgba(255, 152, 0, …)`，那种对 15 套主题不可见。

```html
<div class="callout callout--warning">
  <mat-icon aria-hidden="true">warning</mat-icon>
  <p>If you lose this password your synced data cannot be recovered.</p>
</div>
```

| 修饰符            | 色调 token        | 用于                                        |
| ----------------- | ----------------- | ------------------------------------------- |
| _(无)_/`--info`   | `--c-primary`     | 中性上下文、「将会发生什么」说明            |
| `--success`       | `--color-success` | 确认、节省、「无需操作」                    |
| `--warning`       | `--color-warning` | 不可逆但有意的操作                          |
| `--danger`        | `--color-danger`  | 破坏性操作、失败                            |

一个色调 token（`--callout-c`）驱动图标色、边框与填充，后两者通过 `color-mix()`——因此每种色调都感知主题，新色调只需一个声明。外边距留给消费者（对话框自己的 SCSS 中 `.callout { margin-bottom: var(--s2); }`），原语不拥有 margin。

图标可选，但文案必须是单个子元素——一个 `<p>`，或包裹多个内容的 `<div>`。`.callout` 是 flex 行，若把类放在 `<p>` 上并留下裸文本，每个内联子节点会变成自己的 flex 项：`<strong>Note:</strong> …` 会渲染成两列带间隙，换行时还有悬挂缩进。

兄弟：`.info-panel`（`_info-panel.scss`）是 formly 生成标记的同一思路，无法添加图标元素，字形须来自 `::before`。

## 字体阶梯

| 变量             | 值   | 变量              | 值   |
| ---------------- | ---- | ----------------- | ---- |
| `--font-size-xs` | 11px | `--font-size-xl`  | 18px |
| `--font-size-sm` | 12px | `--font-size-2xl` | 22px |
| `--font-size-md` | 14px | `--font-size-3xl` | 28px |
| `--font-size-lg` | 16px |                   |      |

文字尺寸走阶梯；将偏离阶梯的值吸附到最近一步。
配套 token：`--font-weight-medium/-semibold/-bold`、
`--line-height-tight/-snug/-normal`、`--font-mono-stack`。

两个有意例外——保持普通 px/em：

- **Material 图标字形尺寸**写成匹配集合——`font-size`、`width` 与 `height` 均为 20px。字形必须等于其盒子否则会偏心，且阶梯没有 20/24px 步长。见 `main-header.component.scss` 与 `config-page.component.scss` 中的 `.tab-icon` 规则。
- **有意成比例的 `em`** 尺寸跟随父级（内联图标上的 `font-size: 1em`）。

## 关键文件

| 文件                             | 用途                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `src/styles/_css-variables.scss` | 全部 CSS 自定义属性（设计 token）                             |
| `src/styles/themes.scss`         | Material 主题设置 + 工具类                                    |
| `src/styles/page.scss`           | 全局页面/body 样式                                            |
| `src/styles/util.scss`           | 工具类                                                        |
| `src/styles/components/`         | 全局组件样式（Material 覆盖、共享模式）                       |
| `src/styles/mixins/`             | 可复用 SCSS mixin                                             |
| `src/app/ui/`                    | 40+ 可复用 Angular UI 组件                                    |

## 间距变量（8px 网格）

| 变量          | 值   | 变量   | 值   |
| ------------- | ---- | ------ | ---- |
| `--s-quarter` | 2px  | `--s4` | 32px |
| `--s-half`    | 4px  | `--s5` | 40px |
| `--s`         | 8px  | `--s6` | 48px |
| `--s2`        | 16px | `--s7` | 56px |
| `--s3`        | 24px | `--s8` | 64px |

```scss
// ✅ 好
padding: var(--s2) var(--s3);
gap: var(--s-half);

// ❌ 差
padding: 16px 24px;
gap: 4px;
```

## 颜色变量

| 用例               | 变量                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| 文本               | `--text-color`、`--text-color-muted`、`--text-color-most-intense`                                  |
| 背景               | `--bg`、`--card-bg`、`--task-c-bg`、`--sub-task-c-bg`                                              |
| 语义               | `--color-success`（#4caf50）、`--color-warning`（#ff9800）、`--color-danger`（#f44336）            |
| Material 调色板    | `--palette-primary-500`、`--palette-accent-500`、`--palette-warn-500`（100–900）                   |
| 叠层               | `--c-dark-10` 到 `--c-dark-90`、`--c-light-05` 到 `--c-light-90`                                   |
| Alpha 系数         | `--border-alpha`（0.12）、`--overlay-alpha`（0.1）、`--muted-alpha`（0.6）、`--separator-alpha`（0.3） |

### 主题特定值

浅色主题设置：`--bg: #f8f8f7`、`--card-bg: #ffffff`、`--text-color: rgb(44, 44, 44)`
深色主题设置：`--bg: #131314`、`--card-bg: var(--dark3)`、`--text-color: rgb(230, 230, 230)`

深色海拔色：`--dark0`（rgb(0,0,0)）到 `--dark24`（rgb(56,56,56)）

### 组件中的主题特定覆盖

```scss
@include darkTheme() {
  /* 仅深色样式 */
}
@include lightTheme() {
  /* 仅浅色样式 */
}
```

Mixin 在 `src/styles/mixins/_theming.scss`。

## 阴影与海拔

- `--whiteframe-shadow-1dp` 到 `--whiteframe-shadow-24dp` — 经典 Material 阴影
- `--md-sys-level1` 到 `--md-sys-level5` — Material Design 3 风格

## 过渡与动画

| 类型       | 变量                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| 简写       | `--transition-fast`、`--transition-standard`、`--transition-enter`、`--transition-leave`                           |
| 时长       | `--transition-duration-xs`（90ms）、`-s`（150ms）、`-m`（225ms）、`-l`（375ms）                                     |
| 额外       | `--transition-duration-enter`（225ms）、`--transition-duration-leave`（195ms）、`--page-transition-duration`（225ms） |
| 时序       | `--ani-standard-timing`、`--ani-enter-timing`、`--ani-leave-timing`、`--ani-sharp-timing`                          |

迁移硬编码时长时，选最近的档——UI 过渡约 15% 偏差可接受。

## 焦点环

自定义交互元素的键盘无访问性 token。Material 组件保留自有焦点处理；将这些用于非 Material 按钮、卡片与自定义控件。

| 变量                  | 值                  |
| --------------------- | ------------------- |
| `--focus-ring-width`  | 2px                 |
| `--focus-ring-offset` | 2px                 |
| `--focus-ring`        | `var(--brand)`      |
| `--focus-ring-color`  | `var(--focus-ring)` |

主题应在 `body` / `body.isDarkTheme` 上覆盖公共 `--focus-ring` 原语。`--focus-ring-color` 是既有组件消费的兼容别名。

最快采用——添加 `util.scss` 中的 `.focus-ring` 工具类，仅在 `:focus-visible` 上应用 `outline`（因此鼠标点击不会触发）。

```scss
// 按元素选择加入
.my-button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

## Z-Index 层

| 变量                     | 值   | 用途                     |
| ------------------------ | ---- | ------------------------ |
| `--z-check-done`         | 11   | 任务完成复选框           |
| `--z-main-header`        | 12   | 主标题栏                 |
| `--z-task-title-focus`   | 32   | 聚焦的任务标题           |
| `--z-mobile-bottom-nav`  | 50   | 移动端底部导航           |
| `--z-side-nav`           | 60   | 侧边导航                 |
| `--z-backdrop`           | 222  | 背景遮罩                 |
| `--z-add-task-bar`       | 999  | 添加任务栏               |
| `--z-search-bar`         | 999  | 搜索栏                   |
| `--z-onboarding-presets` | 999  | 引导预设屏幕             |
| `--z-tour`               | 1001 | 导览叠加层               |

## 布局变量

| 变量                    | 值    | 说明               |
| ----------------------- | ----- | ------------------ |
| `--component-max-width` | 800px | iPad 上 900–1000px |
| `--side-nav-width`      | 200px |                    |
| `--side-nav-width-l`    | 400px |                    |
| `--bar-height-large`    | 56px  |                    |
| `--bar-height`          | 48px  |                    |
| `--bar-height-small`    | 40px  |                    |

## 响应式断点

可用作 CSS 变量（`--layout-xxxs` 到 `--layout-xl`），以及 `src/styles/mixins/_media-queries.scss` 中的 SCSS 变量与 mixin：

| 断点   | 值     |
| ------ | ------ |
| `xxxs` | 398px  |
| `xxs`  | 440px  |
| `xs`   | 600px  |
| `sm`   | 960px  |
| `md`   | 1280px |
| `lg`   | 1920px |
| `xl`   | 2000px |

## 工具类

定义于 `src/styles/util.scss` 与 `src/styles/themes.scss`：

- 布局：`.center-wrapper`、`.mw`（最大宽度容器）
- 响应式：`.hide-xs`、`.hide-xxs`、`.hide-gt-sm`
- 输入：`.show-only-on-touch-primary`、`.show-only-on-mouse-primary`
- 主题：`.show-dark-only`、`.show-light-only`
- 颜色：`.bg-primary`、`.bgc-accent`、`.color-primary`、`.bg-success`、`.bg-warning`、`.bg-danger`
- 效果：`.milk-glass`（背景模糊）

## 编写主题

主题文件位于 `src/assets/themes/*.css`，运行时加载。

### 侧边导航：绝不要对 `magic-side-nav` 宿主应用会创建 CB 的属性

移动抽屉（`.nav-sidenav`）及其遮罩（`.nav-backdrop-mobile`）是 `magic-side-nav` 宿主的 `position: fixed` 子元素。在移动端宿主收缩为 `width: 0`（`magic-side-nav.component.ts` 中的 `hostWidthSignal`）。

任何为 fixed 定位后代建立[新包含块](https://developer.mozilla.org/en-US/docs/Web/CSS/Containing_block#identifying_the_containing_block)的属性——`backdrop-filter`、`filter`、`transform`、`perspective`、`contain: paint|layout|strict`，或匹配的 `will-change`——会把抽屉与遮罩重新锚定到宽度为 0 的宿主。用户点菜单时抽屉不会出现。

改为对内部 `.nav-sidenav` 应用玻璃/模糊/色调：

```css
/* ❌ 差 — 折叠移动抽屉 */
body.isDarkTheme magic-side-nav {
  background: var(--my-pane);
  backdrop-filter: blur(32px);
}

/* ✅ 好 — 宿主保持视觉惰性 */
body.isDarkTheme magic-side-nav .nav-sidenav {
  background: var(--my-pane);
  backdrop-filter: blur(32px);
}
```

不创建包含块的属性——`background`、`border`、`box-shadow`、`margin`——在宿主上安全。完整参考模式见 `velvet.css` 与 `liquid-glass.css`。

## 全局组件样式

位于 `src/styles/components/`，用于渲染在组件作用域外的元素：

- `_overwrite-material.scss` — Material 组件定制
- `_customizer-menu.scss`、`backdrop.scss`、`bottom-panel.scss`
- `markdown.scss`、`mentions.scss`、`table.scss`
- `fab-wrapper.scss`、`wrap-buttons.scss`、`multi-btn-wrapper.scss`
- `planner-shared.scss`、`formly-rows.scss`、`scrollbars.scss`
