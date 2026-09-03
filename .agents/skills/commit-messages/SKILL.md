---
name: commit-messages
description: 为本仓库编写提交信息。在提交、撰写提交信息或 squash 时使用。强制 Angular conventional-commit 格式与测试 scope 规则。
---

# 提交信息

Angular conventional-commit 格式：`type(scope): description`。

**类型：** `feat`、`fix`、`docs`、`style`、`refactor`、`perf`、`test`、`build`、`ci`、`chore`。

**示例：**

- `feat(tasks): add recurring task support`
- `fix(sync): handle network timeout`

**规则：**

- 描述使用祈使语气、小写、无尾部句号。
- **绝不**使用 `fix(test):` 或 `fix(e2e):` ——对测试的更改使用 `test:` 类型（例如 `test(sync): cover vector-clock pruning`）。
- Scope 为触及的功能/区域（`tasks`、`sync`、`ui`、`plugins` 等）；仅当更改确实是仓库范围时才省略。
