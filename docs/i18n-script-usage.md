# I18n 翻译管理脚本

本文档说明 `tools/add-missing-i18n-variables.js` 脚本的用法，用于管理 Super Productivity 的国际化（i18n）文件。

## 概览

脚本管理位于 `src/assets/i18n/` 的翻译文件。基础语言为英语（`en.json`），其他语言如 `de.json`（德语）、`tr.json`（土耳其语）等包含翻译。

脚本支持三种模式：

- **Extract 模式**：为特定语言创建仅含缺失翻译的进行中（WIP）文件。
- **Merge 模式**：将已翻译的 WIP 文件合并回主语言文件。
- **Legacy 模式**：向所有语言文件添加缺失键（未指定模式时的默认）。

## 文件结构

- `en.json`：含全部键的英文参考文件。
- `{lang}.json`：主翻译文件（例如 `de.json`、`tr.json`）。
- `{lang}-wip.json`：仅含缺失翻译的临时进行中文件。

## 用法

### 提取缺失翻译

为特定语言（例如土耳其语）提取缺失翻译：

```bash
node tools/add-missing-i18n-variables.js extract tr
```

这会创建 `tr-wip.json`，包含存在于 `en.json` 但在 `tr.json` 中缺失或为空的所有键。

### 翻译 WIP 文件

编辑生成的 `{lang}-wip.json` 文件并为键提供翻译。

示例 `tr-wip.json`：

```json
{
  "APP": {
    "SKIP_SYNC_WAIT": "Skip waiting for sync"
  },
  "F": {
    "CALDAV": {
      "ISSUE_CONTENT": {
        "DESCRIPTION": "Description"
      }
    }
  }
}
```

### 合并翻译

翻译 WIP 文件后，合并回主语言文件：

```bash
node tools/add-missing-i18n-variables.js merge tr
```

这会：

- 将 `tr-wip.json` 的翻译合并进 `tr.json`
- 保持与 `en.json` 相同的键顺序
- 校验所有键都存在
- 删除 `tr-wip.json` 文件

### Legacy 模式（更新全部文件）

一次向所有语言文件添加缺失键（保留既有翻译）：

```bash
node tools/add-missing-i18n-variables.js
```

这会更新所有 `{lang}.json` 文件以包含 `en.json` 中的任何新键，并按相同顺序放置。

## 工作流示例

1. 新功能添加，更新 `en.json` 中的新键。
2. 为你的语言运行 extract：`node tools/add-missing-i18n-variables.js extract de`
3. 在 `de-wip.json` 中翻译键。
4. 运行 merge：`node tools/add-missing-i18n-variables.js merge de`
5. 提交包含更新后 `de.json` 的 pull request。

## 说明

- 脚本保持键顺序与 `en.json` 一致。
- 翻译文件中的空字符串会触发英文回退。
- WIP 文件是临时的，会被 merge 命令删除。
