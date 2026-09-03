# 维护者文档

本目录包含用户文档、维护者操作手册、架构指引、进行中的计划与研究。它们的权威等级不同：计划或研究笔记不能覆盖当前代码、测试或已采纳的决策。

## 维护中的指南

随其描述的行为或工作流一并更新：

- [`src/app` 分层地图](../src/app/README.md) — 东西在哪、依赖指向何方、哪些方向被 lint 强制
- [文档指南](documentation-guide.md)
- [开发环境变量](ENV_SETUP.md)
- [插件开发](plugin-development.md)
- [添加 Issue 集成](add-new-integration.md)
- [功能与 PR 评审指南](feature-review-guide.md)
- [样式指南](styling-guide.md) 与 [主题契约](theming-contract.md)
- [Android 边到边与键盘行为](android-edge-to-edge-keyboard.md)
- [Android 主屏幕小组件](android-home-screen-widget.md)
- [发布与上架操作手册](release-and-publishing.md)
- [Apple 发布自动化](apple-release-automation.md)
- [翻译指南](TRANSLATING.md) 与 [i18n 脚本用法](i18n-script-usage.md)

面向用户的文档在 [`wiki/`](wiki/)。同步与 operation-log 架构在 [`sync-and-op-log/`](sync-and-op-log/)。

## 决策

已采纳决策描述的约束在实现工作完成后仍然成立：

[`../ARCHITECTURE-DECISIONS.md`](../ARCHITECTURE-DECISIONS.md) 是全部决策的索引。编号记录内联存放，其
[记录于别处的决策](../ARCHITECTURE-DECISIONS.md#记录于别处的决策)
表指向住在独立文档或作为贡献者规则的那些——例如
[SuperSync 数据库静态加密](supersync-encryption-at-rest-decision.md)。
保存在该文件之外的决策仍必须列在那里。

决策必须写明状态与日期、所选结果、为何如此选择，以及何种情况值得重新审视。被取代的决策作为历史保留，但必须链接到其替换项，并保留原编号。

## 进行中的计划

[`plans/`](plans/) 与 [`long-term-plans/`](long-term-plans/) 包含提案，
而非当前行为。每个进行中的计划开头应有：

- 状态（`Proposed`、`Planned`、`In progress` 或 `Deferred`）；
- 负责人与跟踪 issue 或 pull request；
- 相对代码最后一次核实的日期；
- 完成或移除条件。

实现落地后，将持久契约或限制移入维护中的指南、包 README、代码注释或决策记录，然后删除已完成的计划。不要把交接说明或「下一步」文档留作永久文档。

## 研究与审计

[`research/`](research/) 记录某一时间点收集的证据。除非维护中的指南或已采纳决策采用其结论，否则非规范性。研究应写明快照日期与跟踪 issue。大型审计产出可在发现项分流期间保留，但已核实工作应移到 issue，持久安全约束应移到维护中的文档。

一旦结论已移入维护中的指南、决策记录或已跟踪的 issue，就删除研究笔记。Git 历史可随时找回。

相对过去提交冻结的发现会静默过时，因此要写明何种情况会使其错误：任何关于哪些发布包含某变更的主张，都必须用 `git tag --contains` 重新推导，绝不可凭记忆，因为下一个 tag 可能在代码未变的情况下翻转结论。

- [重复事件实现计划](research/recurring-events-implementation-plan.md)
- [Snap Wayland GPU 根因与已上线修复](research/snap-wayland-gpu-fix-research.md)
  — 研究寿命结束后仍保留，因为 `electron-builder.yaml`、
  `tools/afterPack.js` 与 `build/linux/snap-wrapper.sh` 引用它说明守卫存在的原因

## 评审检查清单

更改行为或运维时：

1. 在同一改动中更新相关的维护中指南。
2. 对照仓库核实命令、路径、API 名称、workflow 触发器与密钥名称，而不是从旧计划复制。
3. 从本索引、包 README 或其他权威文档链接新文档，使其可被发现。
4. 移除或标记现已与新来源矛盾的过时文档。
5. 绝不要在文档中放入凭证、用户数据或生产专用密钥值。
6. 运行 `npm run docs:check-links`。
