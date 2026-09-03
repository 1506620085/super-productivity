# 主题契约（Theming Contract）

为 Super Productivity 编写自定义主题的公共契约。本文档权威——校验器的警告通道与同一契约对齐（`src/app/core/theme/theme-contract.const.ts`）。

## 简明版

将至少包含以下四个声明的 CSS 文件拖入 设置 → 主题 →「Install theme…」：

```css
body {
  --surface-1: #f8f8f7;
  --surface-2: #fff;
  --ink: rgb(44, 44, 44);
  --ink-on-channel: 0, 0, 0;
}
```

若要更精致的主题，也请声明**推荐** token（见下表）。主题是纯 CSS——无脚本、无远程 URL、无打包资源。

## 主题如何工作

CSS 变量架构有三层：

1. **原语** — 表面阶梯（`--surface-0` 到 `--surface-4`）、墨色（`--ink`、`--ink-strong`、`--ink-muted`、`--ink-on-channel`）、`--separator`、`--divider`、`--scrim`、`--bg-overlay`、`--brand`、`--focus-ring`。这些是主题用来产生不同感觉的旋钮。
2. **语义别名** — 高层 token，如 `--bg`、`--card-bg`、`--text-color`。多数解析到某个原语，因此改一个原语会自动波及数十个语义 token。
3. **Category-B token** — 真浅/深分裂，其关系在模式间确实不同（例如 `--close-btn-bg`、`--scrollbar-thumb`）。想覆盖这些的主题必须声明浅色与深色两套值。

每个主题叠在基础之上。若你的 CSS 未声明某 token，则使用基础值。

## 必填 token

| Token              | 控制内容                                          | 说明                                                                                                                                                              |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--surface-1`      | 应用背景                                          | 表面阶梯的基底。                                                                                                                                                  |
| `--surface-2`      | 卡片 / 任务 / 面板背景                            | 比 `--surface-1` 高一级。                                                                                                                                         |
| `--ink`            | 正文颜色                                          | 多数文本直接使用。                                                                                                                                                |
| `--ink-on-channel` | RGB 三元组（无 `rgb()` 包装）用于叠层 token       | 例如浅色用 `0, 0, 0`，深色用 `255, 255, 255`。用作 `rgba(var(--ink-on-channel), α)`，用单一声明做出模式正确的悬停/焦点叠层。                                      |

## 推荐 token

| Token          | 控制内容                                                                  |
| -------------- | ------------------------------------------------------------------------- |
| `--surface-0`  | 略深于 `--surface-1`（用于工具栏的 `--bg-darker`）。                      |
| `--surface-3`  | 抬升表面（当前任务、拖放目标）。                                          |
| `--surface-4`  | 最高表面（横幅、移动底部面板）。                                          |
| `--ink-strong` | 最大对比文本（强调标签）。                                                |
| `--ink-muted`  | 弱化文本（辅助标签、占位符）。                                            |
| `--separator`  | 柔和分隔色（行之间）。                                                    |
| `--divider`    | 默认分隔线色（Material 使用）。                                           |
| `--scrim`      | 背景 / 叠层遮罩色。                                                       |

若缺少任一推荐项，校验器会发出列出 token 名的警告，并在安装后显示 snackbar。主题仍会安装——警告仅供参考。

## 可选 token

| Token                    | 控制内容                             | 默认           |
| ------------------------ | ------------------------------------ | -------------- |
| `--state-hover-alpha`    | 悬停叠层不透明度                     | `0.06`         |
| `--state-focus-alpha`    | 焦点叠层不透明度                     | `0.10`         |
| `--state-pressed-alpha`  | 按下/激活叠层不透明度                | `0.14`         |
| `--state-selected-alpha` | 选中行叠层不透明度                   | `0.10`         |
| `--state-disabled-alpha` | 禁用元素不透明度                     | `0.40`         |
| `--focus-ring`           | 焦点环颜色（默认为 `--brand`）。     | `var(--brand)` |
| `--system-surface`       | 原生 Android 系统栏背景。            | `var(--bg)`    |

这些是 **alpha 标量**（或单色），不是 rgba 颜色。基础层用 `--ink-on-channel` 合成实际叠层色，因此将 `--state-hover-alpha` 调到 `0.10` 会在浅色与深色模式自动得到更强悬停。

`--system-surface` 必须解析为不透明的 `#rgb`、`#rrggbb` 或整数通道 `rgb(...)` 颜色且无 alpha。透明值、百分比通道与渐变会回退到 Default 主题表面，因为 Android 原生颜色解析器无法使用它们。

## 特殊 token

### `--ink-on-channel`

这是拱心石原语。它是 **RGB 三元组**——不是 `rgb()` 值，也不是 hex 字面量——因此可嵌入 `rgba(var(--ink-on-channel), 0.06)`，用单一声明产生模式正确的叠层。

```css
body {
  --ink-on-channel: 0, 0, 0; /* 浅色模式 → 黑色叠层 */
}
body.isDarkTheme {
  --ink-on-channel: 255, 255, 255; /* 深色模式 → 白色叠层 */
}
```

### `--state-*-alpha` 与遗留桥接

旧主题历史上直接声明 `--hover-bg-opacity`、`--focus-bg-opacity`、`--pressed-bg-opacity` 与 `--disabled-opacity`。基础层用这些遗留名作为 `var()` 回退声明规范名：

```css
:where(body, body.isDarkTheme) {
  --state-hover-alpha: var(--hover-bg-opacity, 0.06);
  --state-focus-alpha: var(--focus-bg-opacity, 0.1);
  --state-pressed-alpha: var(--pressed-bg-opacity, 0.14);
  --state-selected-alpha: var(--selected-bg-opacity, 0.1);
  --state-disabled-alpha: var(--disabled-opacity, 0.4);
}
```

若主题已使用遗留名，它们继续有效——无需重命名。新主题应优先使用 `--state-*-alpha` 名。

## 选择器契约

这部分是承重结构。在调试「我的主题浅色有效深色无效」前请阅读。

| 层                                                  | 所在位置                                  | 特异性                                               |
| --------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| 原语（如 `--surface-1`、`--ink-on-channel`）        | `body`（浅）、`body.isDarkTheme`（深）    | (0,0,1) 与 (0,1,1)                                   |
| 语义别名（如 `--bg`、`--card-bg`）                  | `:where(body, body.isDarkTheme)`          | (0,0,0) — `:where()` 是零特异性包装                  |
| Category-B token（按模式）                          | `body`（浅）、`body.isDarkTheme`（深）    | (0,0,1) 与 (0,1,1)                                   |

**覆盖原语的主题必须使用 `body` 和/或 `body.isDarkTheme` 选择器。** 声明在 `:root` 会被 `body` 继承，但基础层在 `body` 上直接声明同一属性。直接声明始终胜过继承值；选择器特异性从不跨这两个元素比较。因此仅在 `:root` 的原语在两种模式下对 body 都无效。

始终在 `body` 下声明浅色原语，在 `body.isDarkTheme` 下声明深色原语。

**覆盖语义别名的主题**应使用相同的 body 选择器。别名位于 `:where(...)`（特异性 0,0,0），因此稍后的 `body` 或 `body.isDarkTheme` 规则会正常胜出。`:root` 别名仍是继承的，不能替换直接声明在 body 上的别名。

校验器的警告通道在 v1 中**仅检查存在性**：不解析选择器。仅在 `:root` 声明 `--surface-1` 的主题会通过校验，即便该声明对 body 无效。选择器感知警告是已跟踪的后续项。

## Fork 说明

1. 选最接近的已发布主题作起点：`src/assets/themes/{arc,catppuccin-mocha,cybr,dark-base,dracula,everforest,glass,lines,liquid-glass,nord-polar-night,nord-snow-storm,plainspace,rainbow,velvet,zen}.css`。
2. 复制到新文件。将 `.css` 重命名为任意名——选择器用文件名 slug 作为主题 id。
3. 编辑 `body` 与 `body.isDarkTheme` 下的原语声明。从 `--surface-1`、`--surface-2`、`--ink`、`--ink-on-channel` 开始。其余保持默认。
4. 将文件拖入 设置 → 主题 →「Install theme…」。文件存在 IndexedDB；不会离开你的机器。

## 示例

### 最小六行主题

```css
body {
  --surface-1: #fef9f3;
  --surface-2: #ffffff;
  --ink: #2c1810;
  --ink-on-channel: 44, 24, 16;
}
```

### 调节状态 alpha

```css
body {
  --surface-1: #f8f8f7;
  --surface-2: #fff;
  --ink: rgb(44, 44, 44);
  --ink-on-channel: 0, 0, 0;
  /* 更弱的悬停，更强的按下 */
  --state-hover-alpha: 0.04;
  --state-pressed-alpha: 0.18;
}
```

### 浅色 + 深色成对

```css
body {
  --surface-1: #fef9f3;
  --surface-2: #fff;
  --ink: #2c1810;
  --ink-on-channel: 0, 0, 0;
  --separator: #e0d6c8;
  --divider: rgba(0, 0, 0, 0.12);
}
body.isDarkTheme {
  --surface-1: #1a1410;
  --surface-2: #2c1810;
  --ink: rgb(245, 230, 215);
  --ink-on-channel: 255, 255, 255;
  --separator: rgba(255, 255, 255, 0.1);
  --divider: rgba(255, 255, 255, 0.12);
}
```

## 校验规则

校验器（`src/app/core/theme/validate-theme-css.util.ts`）在安装时运行。警告与主题一并持久化到 IndexedDB，以便选择器无需再次读取即可显示。存储的 CSS 在每次加载前也会重新校验；因此被旧客户端接受的主题无法绕过更新的安全规则。契约警告保持安装时的快照，直到用户重新上传文件。

**硬拒绝（主题不会安装）：**

- 解析为远程 URL 的 `url(...)` 参数（`http:`、`https:`、`//host/...`、`data:` URI、无 scheme 的绝对路径，或其他协议）
- 相对 `url(...)` 路径（v1 无打包资源）
- `src(...)` 参数（CSS Fonts L4 形式）——规则同 `url(...)`
- 任何 `@import` 规则
- 高级图像函数：任何 `image(...)` 或 `image-set(...)`
- 大于 500 KB 的文件
- 未终止的 `/* comments`（畸形 CSS）

**软警告（主题安装，显示 snackbar）：**

- 缺少任何必填或推荐 token——snackbar 列出 token 名。可选 token 不警告（它们始终从基础层继承）。

校验器处理关键字上的 `\xx` 转义尝试（`u\72l(`、`\55RL(`、`s\72\63(`、`--surf\61ce-1` 等）以及字符串字面量或 `url-tokens` 内的 `/* */` 注入——完整攻击面测试列表见 `validate-theme-css.util.spec.ts`。

安全关键字匹配偏保守。`url(` 与 `src(` 在原始（解码后）源上扫描，因此即使在注释或 CSS 字符串内也会被拒绝——伪装 token 绝不能隐藏后续真实请求。关键字存在禁令（`@import`、`image(`、`image-set(`）改为在去注释源上扫描：它们**允许出现在注释内**（主题可记录该限制），但仍拒绝 CSS 字符串值内的出现，因为转义解码后无法安全清空字符串。避免在主题字符串值与生成的标签中使用这些字面序列。

## 遗留迁移说明

若你已有在 token 模型重构前可用的主题，无需任何操作。校验器的警告通道不阻塞，15 个内置 CSS 主题提供满足最低契约的示例。若主题使用遗留名（`--hover-bg-opacity`、`--focus-bg-opacity`、`--pressed-bg-opacity`、`--disabled-opacity`），它们通过基础层的 `var()` 回退桥继续有效。

若希望契约警告安静，在 `body`（若主题有深色模式则还有 `body.isDarkTheme`）下声明四个必填 token（`--surface-1`、`--surface-2`、`--ink`、`--ink-on-channel`）。推荐 token 是加分项但非必需。
