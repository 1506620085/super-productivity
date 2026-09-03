# 插件国际化（i18n）指南

本指南说明如何为 Super Productivity 插件添加多语言支持。

## 快速开始

```
my-plugin/
├── manifest.json          # Declare supported languages
├── plugin.js
└── i18n/                  # Translation files
    ├── en.json           # Required - English
    ├── de.json           # Optional - German
    └── fr.json           # Optional - French
```

**manifest.json**：

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "i18n": {
    "languages": ["en", "de", "fr"]
  }
}
```

**i18n/en.json**：

```json
{
  "GREETING": "Hello from my plugin!",
  "TASK_COUNT": "You have {{count}} tasks",
  "BUTTONS": {
    "SAVE": "Save",
    "CANCEL": "Cancel"
  }
}
```

**plugin.js**：

```javascript
// Use translations in your plugin
const greeting = api.translate('GREETING');
const taskMsg = api.translate('TASK_COUNT', { count: 5 });
const saveBtn = api.translate('BUTTONS.SAVE');
```

## 插件结构

### 1. 清单配置

在 `manifest.json` 中加入 `i18n` 部分：

```json
{
  "id": "my-awesome-plugin",
  "name": "My Awesome Plugin",
  "version": "1.0.0",
  "description": "A plugin with multi-language support",
  "i18n": {
    "languages": ["en", "de", "fr", "es"]
  }
}
```

**字段**：

- `languages`（必填）：插件支持的语言代码数组
- 必须至少包含 `"en"`（英语）
- 使用标准语言代码：`en`、`de`、`fr`、`es`、`ja`、`zh` 等

### 2. 翻译文件

在插件中创建 `i18n/` 文件夹，为每种语言准备 JSON 文件：

```
my-plugin/
├── i18n/
│   ├── en.json    # English (required)
│   ├── de.json    # German
│   ├── fr.json    # French
│   └── es.json    # Spanish
```

**文件命名**：使用清单中的语言代码（例如 `en.json`、`de.json`）

`i18n/` 文件夹必须位于插件 ZIP 的根目录，与 `manifest.json` 同级。

**语言代码必须与 Super Productivity 自身使用的代码之一匹配，且为小写**
（`en`、`de`、`pt-br`、`zh-tw` 等）——`pt-BR` 与 `pt-br` 不同，会被忽略。

**翻译文件请以 UTF-8 保存。** JSON 必须是 UTF-8；以传统 8 位编码（Latin-1/CP1252——注意变音符号与重音）保存的文件会被直接拒绝，而不是加载成乱码字符。

若已声明的语言在 ZIP 中没有对应的 `i18n/<lang>.json`，或该文件不是描述对象的有效 UTF-8 JSON，则会跳过该语言。每种情况都会单独以 console 警告记录。不受支持的语言代码会汇总在一条 `Unsupported language codes: …` 警告中，并截断为前几个。之后 `translate()` 会回退为返回 key 本身，因此翻译未显示时请先检查控制台。

对于上传的插件 ZIP，所有已声明翻译文件合计限制为 5 MB；超出则拒绝上传。

### 3. 翻译文件格式

使用层级化 JSON 结构便于组织：

```json
{
  "MESSAGES": {
    "WELCOME": "Welcome to the plugin!",
    "GOODBYE": "See you later!",
    "ERROR": "An error occurred: {{error}}"
  },
  "BUTTONS": {
    "SAVE": "Save",
    "CANCEL": "Cancel",
    "DELETE": "Delete"
  },
  "LABELS": {
    "TASK_NAME": "Task Name",
    "DUE_DATE": "Due Date"
  }
}
```

**最佳实践**：

- 使用大写键名以保持一致
- 将相关翻译分组
- 保持层级简单（最多 2–3 层）
- 使用描述性的键名

## API 方法

### translate(key, params?)

翻译一个 key，并可选用参数插值。

**参数**：

- `key`（string）：使用点号表示法的翻译键
- `params`（object，可选）：插入到译文中的值

**返回值**：翻译后的字符串；若未找到翻译则返回 key 本身

**示例**：

```javascript
// Simple translation
const greeting = api.translate('MESSAGES.WELCOME');
// → "Welcome to the plugin!" (en)
// → "Willkommen zum Plugin!" (de)

// With parameters
const error = api.translate('MESSAGES.ERROR', {
  error: 'Network timeout',
});
// → "An error occurred: Network timeout"

// With multiple parameters
const summary = api.translate('SUMMARY', {
  count: 5,
  type: 'tasks',
});
// → "You have 5 tasks"

// Nested keys
const btnLabel = api.translate('BUTTONS.SAVE');
// → "Save"
```

**回退行为**：

1. 尝试当前应用语言（例如德语）
2. 若找不到 key，回退到英语
3. 若英语中也没有，返回 key 本身

```javascript
// User's language is German (de)
// de.json has: { "BUTTONS": { "SAVE": "Speichern" } }
// en.json has: { "BUTTONS": { "SAVE": "Save", "CANCEL": "Cancel" } }

api.translate('BUTTONS.SAVE'); // → "Speichern" (from de.json)
api.translate('BUTTONS.CANCEL'); // → "Cancel" (from en.json - fallback)
api.translate('BUTTONS.DELETE'); // → "BUTTONS.DELETE" (not found)
```

### formatDate(date, format)

按当前区域设置格式化日期。

**参数**：

- `date`（Date | string | number）：要格式化的日期
  - Date 对象
  - ISO 8601 字符串（例如 `"2026-01-16T14:30:00Z"`）
  - 时间戳（自 epoch 起的毫秒数）
- `format`（string）：预定义格式
  - `"short"` - 短日期（1/16/26）
  - `"medium"` - 中等日期（Jan 16, 2026）
  - `"long"` - 长日期（January 16, 2026）
  - `"time"` - 仅时间（2:30 PM）
  - `"datetime"` - 日期与时间（1/16/26, 2:30 PM）

**返回值**：格式化后的日期字符串

**示例**：

```javascript
const now = new Date();

// Short format
api.formatDate(now, 'short');
// → "1/16/26" (en-US)
// → "16.1.26" (de)

// Long format
api.formatDate(now, 'long');
// → "January 16, 2026" (en)
// → "16. Januar 2026" (de)

// Time only
api.formatDate(now, 'time');
// → "2:30 PM" (en)
// → "14:30" (de)

// ISO string input
api.formatDate('2026-01-16T14:30:00Z', 'datetime');
// → "1/16/26, 2:30 PM" (en)

// Timestamp input
api.formatDate(1737039000000, 'medium');
// → "Jan 16, 2026" (en)
```

### getCurrentLanguage()

获取当前应用语言代码。

**返回值**：语言代码（例如 `"en"`、`"de"`、`"fr"`）

**示例**：

```javascript
const lang = api.getCurrentLanguage();
console.log(`Current language: ${lang}`);
// → "Current language: de"

// Conditional logic based on language
if (lang === 'ja' || lang === 'zh') {
  // Special handling for Asian languages
  console.log('Using CJK font');
}
```

## 语言变更 Hook

监听语言变更以更新插件 UI：

```javascript
api.registerHook('languageChange', ({ newLanguage }) => {
  console.log(`Language changed to: ${newLanguage}`);

  // Plugin translations are automatically reloaded
  // Update your UI if needed
  updatePluginUI();
});
```

**说明**：语言变更时，插件翻译会自动重新加载。仅当你还有额外的 UI 更新时才需要此 hook。

## 支持的语言

Super Productivity 支持以下语言代码：

| Code    | Language              |
| ------- | --------------------- |
| `en`    | English               |
| `de`    | German                |
| `es`    | Spanish               |
| `fr`    | French                |
| `it`    | Italian               |
| `pt`    | Portuguese            |
| `pt-br` | Portuguese (Brazil)   |
| `ru`    | Russian               |
| `zh`    | Chinese (Simplified)  |
| `zh-tw` | Chinese (Traditional) |
| `ja`    | Japanese              |
| `ko`    | Korean                |
| `ar`    | Arabic                |
| `fa`    | Persian               |
| `tr`    | Turkish               |
| `pl`    | Polish                |
| `nl`    | Dutch                 |
| `nb`    | Norwegian             |
| `sv`    | Swedish               |
| `fi`    | Finnish               |
| `cs`    | Czech                 |
| `sk`    | Slovak                |
| `hr`    | Croatian              |
| `uk`    | Ukrainian             |
| `id`    | Indonesian            |
| `ro`    | Romanian              |
| `ro-md` | Romanian (Moldova)    |

## 完整示例

以下是一个带有 i18n 支持的完整插件：

**目录结构**：

```
task-counter-plugin/
├── manifest.json
├── plugin.js
└── i18n/
    ├── en.json
    └── de.json
```

**manifest.json**：

```json
{
  "id": "task-counter",
  "name": "Task Counter",
  "version": "1.0.0",
  "description": "Count and display task statistics",
  "i18n": {
    "languages": ["en", "de"]
  }
}
```

**i18n/en.json**：

```json
{
  "TITLE": "Task Statistics",
  "TOTAL_TASKS": "Total tasks: {{count}}",
  "COMPLETED_TODAY": "Completed today: {{count}}",
  "UPDATED": "Last updated: {{time}}",
  "BUTTONS": {
    "REFRESH": "Refresh",
    "CLOSE": "Close"
  }
}
```

**i18n/de.json**：

```json
{
  "TITLE": "Aufgabenstatistik",
  "TOTAL_TASKS": "Gesamt Aufgaben: {{count}}",
  "COMPLETED_TODAY": "Heute erledigt: {{count}}",
  "UPDATED": "Zuletzt aktualisiert: {{time}}",
  "BUTTONS": {
    "REFRESH": "Aktualisieren",
    "CLOSE": "Schließen"
  }
}
```

**plugin.js**：

```javascript
(async function () {
  // Display task statistics with translations
  async function showStatistics() {
    const tasks = await api.getTasks();
    const completedToday = tasks.filter((t) => t.isDone && isToday(t.doneOn));

    const title = api.translate('TITLE');
    const totalMsg = api.translate('TOTAL_TASKS', {
      count: tasks.length,
    });
    const completedMsg = api.translate('COMPLETED_TODAY', {
      count: completedToday.length,
    });
    const updatedMsg = api.translate('UPDATED', {
      time: api.formatDate(new Date(), 'time'),
    });
    const refreshBtn = api.translate('BUTTONS.REFRESH');

    api.showSnack({
      msg: `${title}\n${totalMsg}\n${completedMsg}\n${updatedMsg}`,
      type: 'SUCCESS',
    });
  }

  // Register menu entry
  api.registerMenuEntry({
    label: api.translate('TITLE'),
    icon: 'analytics',
    onClick: showStatistics,
  });

  // Update translations when language changes
  api.registerHook('languageChange', () => {
    console.log('Language changed, UI will update on next interaction');
  });

  function isToday(timestamp) {
    if (!timestamp) return false;
    const today = new Date();
    const date = new Date(timestamp);
    return date.toDateString() === today.toDateString();
  }
})();
```

## 最佳实践

### 1. 始终包含英语

英语是回退语言。始终提供 `en.json`：

```json
{
  "i18n": {
    "languages": ["en", "de", "fr"] // ✓ English first
  }
}
```

### 2. 保持键一致

所有语言文件使用相同的键：

**en.json**：

```json
{
  "SAVE": "Save",
  "CANCEL": "Cancel"
}
```

**de.json**：

```json
{
  "SAVE": "Speichern",
  "CANCEL": "Abbrechen"
}
```

### 3. 使用描述性键名

```javascript
// ✓ Good - descriptive
api.translate('BUTTONS.SAVE_TASK');

// ✗ Bad - vague
api.translate('BTN1');
```

### 4. 分组相关翻译

```json
{
  "ERRORS": {
    "NETWORK": "Network error",
    "PERMISSION": "Permission denied",
    "VALIDATION": "Invalid input"
  },
  "SUCCESS": {
    "SAVED": "Saved successfully",
    "DELETED": "Deleted successfully"
  }
}
```

### 5. 谨慎处理复数

使用参数实现动态复数：

```json
{
  "TASK_COUNT_SINGULAR": "{{count}} task remaining",
  "TASK_COUNT_PLURAL": "{{count}} tasks remaining"
}
```

```javascript
const count = tasks.length;
const key = count === 1 ? 'TASK_COUNT_SINGULAR' : 'TASK_COUNT_PLURAL';
const msg = api.translate(key, { count });
```

### 6. 日期格式化

始终使用 `formatDate()`，不要手动格式化：

```javascript
// ✓ Good - locale-aware
const formatted = api.formatDate(task.dueDate, 'short');

// ✗ Bad - hard-coded format
const formatted = `${month}/${day}/${year}`;
```

## 故障排除

### 插件显示键名而非译文

**原因**：翻译文件未加载，或键不匹配

**解决**：

1. 检查插件中是否存在 `i18n/` 文件夹
2. 确认 JSON 文件有效
3. 确保键完全匹配（区分大小写）
4. 检查浏览器控制台是否有错误

### 显示了错误的语言

**原因**：插件不支持该语言

**解决**：

- 将该语言加入清单的 `i18n.languages`
- 创建对应的 JSON 文件
- 对不支持的语言，插件会回退到英语

### 翻译未更新

**原因**：插件代码缓存了翻译结果

**解决**：

- 每次需要译文时都调用 `api.translate()`
- 不要缓存翻译结果
- API 会在内部处理缓存

### 参数未插值

**原因**：占位符语法错误，或缺少参数

**解决**：

```javascript
// ✓ Correct syntax
api.translate('MESSAGE', { name: 'John' }); // "Hello, John"

// ✗ Wrong - missing curly braces
('Hello, {{name}}'); // ✓ Correct
('Hello, $name'); // ✗ Wrong

// ✗ Wrong - parameter name doesn't match
api.translate('MESSAGE', { user: 'John' }); // Won't replace {{name}}
```

## 从硬编码字符串迁移

若已有硬编码字符串的插件：

**之前**：

```javascript
api.showSnack({ msg: 'Task saved successfully' });
const label = 'Save Task';
```

**之后**：

1. 创建翻译文件：

**en.json**：

```json
{
  "MESSAGES": {
    "TASK_SAVED": "Task saved successfully"
  },
  "LABELS": {
    "SAVE_TASK": "Save Task"
  }
}
```

2. 更新插件代码：

```javascript
api.showSnack({
  msg: api.translate('MESSAGES.TASK_SAVED'),
});
const label = api.translate('LABELS.SAVE_TASK');
```

3. 更新清单：

```json
{
  "i18n": {
    "languages": ["en"]
  }
}
```

## 测试 i18n

### 1. 测试所有语言

```javascript
// Switch languages in Super Productivity settings
// Verify your plugin displays correct translations
```

### 2. 测试回退

```javascript
// Remove a key from non-English language
// Verify it falls back to English
```

### 3. 测试参数插值

```javascript
// Test with various parameter values
const msg = api.translate('COUNT', { count: 0 });
const msg = api.translate('COUNT', { count: 1 });
const msg = api.translate('COUNT', { count: 100 });
```

### 4. 测试日期格式

```javascript
// Test all format options
const formats = ['short', 'medium', 'long', 'time', 'datetime'];
formats.forEach((fmt) => {
  console.log(api.formatDate(new Date(), fmt));
});
```

## 性能考量

1. **翻译文件在插件激活时加载一次**
2. **译文缓存在内存中**
3. **频繁调用 `translate()` 无性能影响**
4. **切换语言会复用已加载的翻译**

## 另见

- [插件开发指南](README.md)
- [插件 API 参考](../plugin-api/README.md)
- [示例插件](.)
