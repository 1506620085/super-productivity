# 文档指南

保持 Super Productivity 文档与代码同步的规则与约定。

## 为何重要

`docs/wiki/` 是人工整理、面向人的 Wiki，通过 CI 发布到 [GitHub Wiki](https://github.com/super-productivity/super-productivity/wiki)。它有意与自动生成的 [DeepWiki](https://deepwiki.com/super-productivity/super-productivity) 分开——后者描述代码机制。用户为了解上下文、意图以及功能如何拼在一起而阅读的是 Wiki。

## 何时更新 Wiki

**当面向用户的功能变更时，在同一 PR 中更新 `docs/wiki/`。** 常见情形与目标笔记：

| 变更                                                               | 要编辑的笔记                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| 新增/更改/移除设置、偏好或配置选项                                 | `3.02-Settings-and-Preferences.md`                                             |
| 新增/更改/移除快捷键                                               | `3.03-Keyboard-Shortcuts.md`                                                   |
| 简写语法新增或更改                                                 | `3.04-Short-Syntax.md`                                                         |
| 新增或更改 REST / Plugin / Sync API 表面                           | `3.01-API.md`                                                                  |
| 新增 issue 或同步提供方，或既有提供方行为变更                      | `3.07-Issue-Integration-Comparison.md` / `3.08-Sync-Integration-Comparison.md` |
| 用户数据形态、存储位置或备份/导入行为变更                          | `3.06-User-Data.md`                                                            |
| 新增主题钩子或主题变量变更                                         | `3.09-Theming.md`                                                              |
| Web 与桌面能力差异                                                 | `3.05-Web-App-vs-Desktop.md`                                                   |

若改动纯属内部（例如重构、测试、性能、构建），无需更新 Wiki。
某些子系统可能过于具体，仅靠代码注释即可；此时除非直接与已有文档矛盾，否则无需更新 Wiki。

## 如何撰写 Wiki 内容

**编辑前请阅读 [`docs/wiki/0.00-Wiki-Structure-and-Organization.md`](wiki/0.00-Wiki-Structure-and-Organization.md)。** 它定义了四类笔记（Quickstarts、How-To、Reference、Concepts）、编号方案，以及各类的 [Diátaxis](https://diataxis.fr/) 风格写作指引。Reference 笔记应准确、全面、一致地描述——仅此而已。

## 默认写 Reference 笔记（`3.XX`）

Reference 笔记是对既有事物（设置、快捷键、API、数据形态、对比）的机械描述。它们是代码驱动更新最安全的目标。其他类别更偏人工撰写，应谨慎改动：

- **Quickstarts（`1.XX`）** — 教学/入门叙述。不要自行改写语气或重组结构。
- **How-To（`2.XX`）** — 带假定受众与语气的任务配方。若工作流确实变了，更新步骤；不要扩大范围。
- **Concepts（`4.XX`）** — 解释性背景与设计理由。仅在有强证据时触碰；宁可标出问题也不要重写。

若改动明显影响非 Reference 笔记（例如因 UI 移动导致 How-To 步骤错误），做最小必要修正，并在 PR 说明中点出，以便人工审阅文案。若不确定该改哪篇，或是否值得更新 Wiki，先问再写。

## Wiki lint 与质量

Wiki 笔记在同步到 GitHub Wiki 前会在 CI 中 lint。lint 规则与链接检查见 [`docs/wiki/0.02-Wiki-QA-and-Maintenance.md`](wiki/0.02-Wiki-QA-and-Maintenance.md)，markdown 与格式约定见 [`docs/wiki/0.01-Style-Guide.md`](wiki/0.01-Style-Guide.md)。

## 面向开发者的文档

Wiki 面向终端用户与开发者。仍有一些面向开发者的文档（`docs/styling-guide.md`、`docs/sync-and-op-log/`、`docs/plugin-development.md`、`ARCHITECTURE-DECISIONS.md`）因过旧或过新尚未考虑并入 Wiki。无论如何，当这些笔记需要变更时，遵循同样的「随代码一并更新」规则，并指出何时可并入主 Wiki。切勿在未事先告知的情况下把它们重构进新 Wiki，因为部分开发者可能仍依赖当前路径。
