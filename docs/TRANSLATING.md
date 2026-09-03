# 翻译指南

Super Productivity 使用 JSON 文件存放翻译，位于 `src/assets/i18n/`。

## 如何贡献

> **重要：** 添加或更改翻译键时，**只直接编辑 `en.json`**。其他语言文件通过 [i18n-script-usage.md](i18n-script-usage.md) 中描述的 i18n 脚本工作流管理。手改其他语言文件可能导致你的改动被覆盖。

1. 在 `src/assets/i18n/en.json` 中添加或更新翻译键
2. 运行 i18n 脚本将变更传播到其他语言（见 [i18n-script-usage.md](i18n-script-usage.md)）
3. 提交 pull request

## 重要说明

### 回退语言

**英语（`en.json`）是回退语言。** 若某翻译缺失或为空，应用会自动显示英文文本。

### 屈折/与格形式后缀（`_NTH`）

某些键有带 `_NTH` 后缀的重复项（例如 `ORD_FIRST` 与 `ORD_FIRST_NTH`）。

- `ORD_FIRST` 用作快速设置菜单中的独立选项（例如 "first"）。
- `ORD_FIRST_NTH` 用在完整句子中（例如德语或其他屈折语言中的与格/屈折形式，如 "Monthly on the first Monday"）。
- 在无屈折的语言（如英语）中，这些值相同。

### 空值是有意的

当你看到空字符串（`""`）时，这是**有意的**——它会触发英文回退。除非你正在提供实际翻译，否则不要把英文文本复制进空字段。

```json
{
  "SOME_KEY": ""
}
```

上面会对 `SOME_KEY` 显示英文文本。

### 文件格式

- 嵌套 JSON 结构
- 键使用 SCREAMING_SNAKE_CASE
- 保持结构完整——只改字符串值

### 示例

```json
{
  "G": {
    "CANCEL": "Abbrechen",
    "SAVE": "Speichern"
  }
}
```

## 提示

- 用 `en.json` 作上下文参考
- 保持翻译简洁（UI 空间有限）
- 尽量在本地测试翻译（`ng serve`）

## 翻译管理脚本

用于管理缺失翻译并保持一致性，请使用 `tools/add-missing-i18n-variables.js` 脚本。详细说明见 [i18n-script-usage.md](i18n-script-usage.md)。
