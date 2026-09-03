# Super Productivity E2E 测试指南

本指南提供使用 Playwright 为 Super Productivity 编写与维护端到端测试的完整信息。

## 目录

- [概览](#概览)
- [运行测试](#运行测试)
- [测试结构](#测试结构)
- [页面对象](#页面对象)
- [常见模式](#常见模式)
- [选择器](#选择器)
- [等待工具](#等待工具)
- [编写新测试](#编写新测试)
- [最佳实践](#最佳实践)
- [故障排查](#故障排查)

---

## 概览

我们的 E2E 测试基于 Playwright，并遵循页面对象模型（POM）模式以提升可维护性与复用性。测试按功能组织，并使用共享 fixture 完成通用搭建。

### 关键技术

- **Playwright**：现代 E2E 测试框架
- **TypeScript**：类型安全的测试代码
- **页面对象模型**：封装页面交互
- **Fixtures**：共享搭建与工具

---

## 运行测试

### 基本命令

```bash
# Run all tests
npm run e2e

# Run tests in UI mode (interactive)
npm run e2e:ui

# Run a single test file with detailed output
npm run e2e:file tests/task-basic/task-crud.spec.ts

# Run tests in headed mode (see browser)
npm run e2e:headed

# Run tests in debug mode
npm run e2e:debug

# Show test report
npm run e2e:show-report
```

### WebDAV 同步测试

```bash
# Run WebDAV tests (starts Docker container)
npm run e2e:webdav
```

---

## 测试结构

### 目录布局

```
e2e/
├── constants/          # Shared selectors and constants
│   └── selectors.ts    # Centralized CSS selectors
├── fixtures/           # Test fixtures and setup
│   └── test.fixture.ts # Custom test fixtures with page objects
├── helpers/            # Test helper functions
│   └── plugin-test.helpers.ts
├── pages/              # Page Object Models
│   ├── base.page.ts    # Base page with common methods
│   ├── work-view.page.ts
│   ├── project.page.ts
│   ├── task.page.ts
│   ├── settings.page.ts
│   ├── dialog.page.ts
│   ├── planner.page.ts
│   ├── side-nav.page.ts
│   ├── sync.page.ts
│   ├── tag.page.ts
│   └── note.page.ts
├── tests/              # Test specifications
│   ├── task-basic/
│   ├── project/
│   ├── planner/
│   └── ...
├── utils/              # Utility functions
│   ├── waits.ts        # Wait helpers
│   └── sync-helpers.ts
├── playwright.config.ts
└── global-setup.ts
```

---

## 页面对象

页面对象封装对特定页面或组件的交互。所有页面对象继承 `BasePage`，并接收 `page` 与可选的 `testPrefix`。

### 可用页面对象

#### 1. **BasePage**（`base.page.ts`）

所有页面对象的基类。提供通用功能：

```typescript
class BasePage {
  async addTask(taskName: string): Promise<void>;
  // Adds a task with automatic test prefix
}
```

**示例：**

```typescript
await workViewPage.addTask('My Task');
// Creates task with name "W0-P0-My Task" (prefixed for isolation)
```

#### 2. **WorkViewPage**（`work-view.page.ts`）

与主工作视图的交互：

```typescript
class WorkViewPage extends BasePage {
  async waitForTaskList(): Promise<void>;
  async addSubTask(task: Locator, subTaskName: string): Promise<void>;
}
```

**示例：**

```typescript
await workViewPage.waitForTaskList();
await workViewPage.addTask('Parent Task');
const task = page.locator('task').first();
await workViewPage.addSubTask(task, 'Child Task');
```

#### 3. **TaskPage**（`task.page.ts`）

任务相关操作：

```typescript
class TaskPage extends BasePage {
  getTask(index: number): Locator;
  getTaskByText(text: string): Locator;
  async markTaskAsDone(task: Locator): Promise<void>;
  async editTaskTitle(task: Locator, newTitle: string): Promise<void>;
  async openTaskDetail(task: Locator): Promise<void>;
  async getTaskCount(): Promise<number>;
  async isTaskDone(task: Locator): Promise<boolean>;
  getDoneTasks(): Locator;
  getUndoneTasks(): Locator;
  async waitForTaskWithText(text: string): Promise<Locator>;
  async taskHasTag(task: Locator, tagName: string): Promise<boolean>;
}
```

**示例：**

```typescript
const task = taskPage.getTask(1); // First task
await taskPage.markTaskAsDone(task);
await expect(taskPage.getDoneTasks()).toHaveCount(1);
```

#### 4. **ProjectPage**（`project.page.ts`）

项目管理：

```typescript
class ProjectPage extends BasePage {
  async createProject(projectName: string): Promise<void>;
  async navigateToProjectByName(projectName: string): Promise<void>;
  async createAndGoToTestProject(): Promise<void>;
  async addNote(noteContent: string): Promise<void>;
  async archiveDoneTasks(): Promise<void>;
}
```

**示例：**

```typescript
await projectPage.createProject('My Project');
await projectPage.navigateToProjectByName('My Project');
await projectPage.addNote('Project notes here');
```

#### 5. **SettingsPage**（`settings.page.ts`）

设置与配置：

```typescript
class SettingsPage extends BasePage {
  async navigateToSettings(): Promise<void>;
  async expandSection(sectionSelector: string): Promise<void>;
  async expandPluginSection(): Promise<void>;
  async navigateToPluginSettings(): Promise<void>;
  async enablePlugin(pluginName: string): Promise<boolean>;
  async disablePlugin(pluginName: string): Promise<boolean>;
  async isPluginEnabled(pluginName: string): Promise<boolean>;
  async uploadPlugin(pluginPath: string): Promise<void>;
}
```

**示例：**

```typescript
await settingsPage.navigateToPluginSettings();
await settingsPage.enablePlugin('Test Plugin');
expect(await settingsPage.isPluginEnabled('Test Plugin')).toBeTruthy();
```

#### 6. **DialogPage**（`dialog.page.ts`）

对话框与模态框交互：

```typescript
class DialogPage extends BasePage {
  async waitForDialog(): Promise<Locator>;
  async waitForDialogToClose(): Promise<void>;
  async clickDialogButton(buttonText: string): Promise<void>;
  async clickSaveButton(): Promise<void>;
  async fillDialogInput(selector: string, value: string): Promise<void>;
  async fillMarkdownDialog(content: string): Promise<void>;
  async saveMarkdownDialog(): Promise<void>;
  async editDateTime(dateValue?: string, timeValue?: string): Promise<void>;
}
```

**示例：**

```typescript
await dialogPage.waitForDialog();
await dialogPage.fillDialogInput('input[name="title"]', 'New Title');
await dialogPage.clickSaveButton();
await dialogPage.waitForDialogToClose();
```

---

## 常见模式

### 模式 1：基本任务 CRUD

```typescript
test('should create and edit task', async ({ page, workViewPage, taskPage }) => {
  await workViewPage.waitForTaskList();

  // Create
  await workViewPage.addTask('Test Task');
  await expect(taskPage.getAllTasks()).toHaveCount(1);

  // Edit
  const task = taskPage.getTask(1);
  await taskPage.editTaskTitle(task, 'Updated Task');
  await expect(taskPage.getTaskTitle(task)).toContainText('Updated Task');

  // Mark as done
  await taskPage.markTaskAsDone(task);
  await expect(taskPage.getDoneTasks()).toHaveCount(1);
});
```

### 模式 2：项目工作流

```typescript
test('should create project and add tasks', async ({ projectPage, workViewPage }) => {
  await projectPage.createAndGoToTestProject();
  await workViewPage.addTask('Project Task 1');
  await workViewPage.addTask('Project Task 2');
  await expect(page.locator('task')).toHaveCount(2);
});
```

### 模式 3：设置配置

```typescript
test('should enable plugin', async ({ settingsPage, waitForNav }) => {
  await settingsPage.navigateToPluginSettings();
  await settingsPage.enablePlugin('My Plugin');
  await waitForNav();
  expect(await settingsPage.isPluginEnabled('My Plugin')).toBeTruthy();
});
```

### 模式 4：对话框交互

```typescript
test('should edit date in dialog', async ({ taskPage, dialogPage }) => {
  const task = taskPage.getTask(1);
  await taskPage.openTaskDetail(task);

  const dateInfo = dialogPage.getDateInfo('Created');
  await dateInfo.click();
  await dialogPage.editDateTime('12/25/2025', undefined);
  await dialogPage.clickSaveButton();
});
```

---

## 选择器

所有选择器集中在 `constants/selectors.ts`。测试中请始终使用这些常量，不要硬编码选择器。

### 使用选择器

```typescript
import { cssSelectors } from '../constants/selectors';

const { TASK, TASK_TITLE, TASK_DONE_BTN } = cssSelectors;

// In test:
const task = page.locator(TASK).first();
const title = task.locator(TASK_TITLE);
```

### 选择器分类

- **导航**：`SIDENAV`、`NAV_ITEM`、`SETTINGS_BTN`
- **布局**：`ROUTE_WRAPPER`、`BACKDROP`、`PAGE_TITLE`
- **任务**：`TASK`、`TASK_TITLE`、`TASK_DONE_BTN`、`SUB_TASK`
- **添加任务**：`ADD_TASK_INPUT`、`ADD_TASK_SUBMIT`
- **对话框**：`MAT_DIALOG`、`DIALOG_FULLSCREEN_MARKDOWN`
- **设置**：`PAGE_SETTINGS`、`PLUGIN_SECTION`、`PLUGIN_MANAGEMENT`
- **项目**：`PAGE_PROJECT`、`CREATE_PROJECT_BTN`、`WORK_CONTEXT_MENU`

---

## 等待工具

位于 `utils/waits.ts`，这些工具有助于处理 Angular 的异步特性。

### 可用等待函数

#### `waitForAngularStability(page, timeout?)`

等待 Angular 完成所有异步操作。

```typescript
await waitForAngularStability(page);
```

#### `waitForAppReady(page, options?)`

全面等待应用初始化完成。

```typescript
await waitForAppReady(page, {
  selector: 'task-list',
  ensureRoute: true,
  routeRegex: /#\/project\/\w+/,
});
```

#### `waitForStatePersistence(page)`

等待 IndexedDB 持久化完成（在同步操作前很重要）。

```typescript
await workViewPage.addTask('Task');
await waitForStatePersistence(page); // Ensure saved to IndexedDB
// Now safe to trigger sync
```

---

## 编写新测试

### 步骤 1：创建测试文件

```typescript
// e2e/tests/my-feature/my-feature.spec.ts
import { test, expect } from '../../fixtures/test.fixture';

test.describe('My Feature', () => {
  test('should do something', async ({ page, workViewPage, taskPage }) => {
    // Test code here
  });
});
```

### 步骤 2：使用页面对象

```typescript
test('my test', async ({ workViewPage, taskPage, dialogPage }) => {
  // Wait for page ready
  await workViewPage.waitForTaskList();

  // Use page objects for interactions
  await workViewPage.addTask('Task 1');
  const task = taskPage.getTask(1);
  await taskPage.markTaskAsDone(task);

  // Assertions
  await expect(taskPage.getDoneTasks()).toHaveCount(1);
});
```

### 步骤 3：正确处理等待

```typescript
// GOOD: Use Angular stability waits
await workViewPage.addTask('Task');
await waitForAngularStability(page);
await expect(page.locator('task')).toBeVisible();

// BAD: Arbitrary timeouts
await page.waitForTimeout(5000); // Avoid unless necessary
```

### 步骤 4：使用常量中的选择器

```typescript
import { cssSelectors } from '../../constants/selectors';

const { TASK, TASK_TITLE } = cssSelectors;
const title = page.locator(TASK).first().locator(TASK_TITLE);
```

---

## 最佳实践

### ✅ 应当

1. **使用页面对象**处理所有交互
2. **使用集中式选择器**，来自 `constants/selectors.ts`
3. **状态变更后等待 Angular 稳定**
4. **使用测试前缀**（由 fixture 自动提供）以实现隔离
5. **每个测试只测一件事**——保持测试聚焦
6. **使用描述性测试名称**——例如 "should create task and mark as done"
7. **清理状态**——测试应相互独立
8. **尽可能使用基于角色的选择器**（无访问性）

```typescript
// GOOD
await page.getByRole('button', { name: 'Save' }).click();

// LESS GOOD
await page.locator('.save-btn').click();
```

### ❌ 不要

1. **不要硬编码选择器**——使用 `cssSelectors`
2. **不要使用任意等待**——使用 `waitForAngularStability`
3. **不要在测试间共享状态**——每个测试应独立
4. **不要直接访问 DOM**——使用页面对象
5. **不要跳过错误处理**——测试失败应清晰明确
6. **不要使用 `any` 类型**——保持类型安全

### 测试隔离

每个测试获得：

- 隔离的浏览器上下文（干净的存储）
- 唯一的测试前缀（`W0-P0-`、`W1-P0-` 等）
- 全新的页面实例

这确保测试不会互相干扰。

### 处理不稳定（Flakiness）

```typescript
// Use waitFor with explicit conditions
await page.waitForFunction(() => document.querySelectorAll('task').length === 3, {
  timeout: 10000,
});

// Use locator assertions (auto-retry)
await expect(page.locator('task')).toHaveCount(3);

// Avoid fixed timeouts
await page.waitForTimeout(1000); // BAD
await waitForAngularStability(page); // GOOD
```

---

## 故障排查

### 测试失败："Element not found"

1. 检查 `constants/selectors.ts` 中的选择器是否正确
2. 交互前添加等待：`await waitForAngularStability(page)`
3. 使用 `await element.waitFor({ state: 'visible' })`
4. 检查元素是否在不同上下文中（iframe、shadow DOM）

### 测试超时

1. 在特定 waitFor 调用中增加超时时间
2. 检查 Angular 是否卡住——查看是否有挂起的 HTTP 请求
3. 使用 `page.pause()` 进行交互式调试
4. 检查网络面板中是否有失败请求

### 不稳定的测试

1. 添加正确的等待：`waitForAngularStability`、`waitForAppReady`
2. 避免 `page.waitForTimeout()`——使用基于条件的等待
3. 检查竞态条件——确保状态已持久化
4. 在依赖已保存状态的操作前使用 `waitForStatePersistence`

### 调试

```typescript
// Pause execution and open Playwright Inspector
await page.pause();

// Take screenshot
await page.screenshot({ path: 'debug.png' });

// Console log page content
console.log(await page.content());

// Get element text for debugging
const text = await page.locator('task').first().textContent();
console.log('Task text:', text);
```

### 运行单个测试

```bash
# Run specific file
npm run e2e:file tests/task-basic/task-crud.spec.ts

# Run in debug mode
npm run e2e:debug

# Run in headed mode to see browser
npm run e2e:headed
```

---

## 示例

### 示例 1：完整任务 CRUD 测试

```typescript
import { test, expect } from '../../fixtures/test.fixture';

test.describe('Task CRUD', () => {
  test('should create, edit, and delete tasks', async ({
    page,
    workViewPage,
    taskPage,
  }) => {
    await workViewPage.waitForTaskList();

    // Create
    await workViewPage.addTask('Task 1');
    await workViewPage.addTask('Task 2');
    await expect(taskPage.getAllTasks()).toHaveCount(2);

    // Edit
    const firstTask = taskPage.getTask(1);
    await taskPage.editTaskTitle(firstTask, 'Updated Task');
    await expect(taskPage.getTaskTitle(firstTask)).toContainText('Updated Task');

    // Mark as done
    await taskPage.markTaskAsDone(firstTask);
    await expect(taskPage.getDoneTasks()).toHaveCount(1);
    await expect(taskPage.getUndoneTasks()).toHaveCount(1);
  });
});
```

### 示例 2：项目工作流

```typescript
test('should create project with tasks', async ({
  projectPage,
  workViewPage,
  taskPage,
}) => {
  await projectPage.createAndGoToTestProject();

  await workViewPage.addTask('Project Task');
  await projectPage.addNote('Important notes');

  const task = taskPage.getTask(1);
  await taskPage.markTaskAsDone(task);

  await projectPage.archiveDoneTasks();
  await expect(taskPage.getUndoneTasks()).toHaveCount(0);
});
```

### 示例 3：设置测试

```typescript
test('should configure plugin', async ({ settingsPage, page }) => {
  await settingsPage.navigateToPluginSettings();

  const pluginExists = await settingsPage.pluginExists('Test Plugin');
  expect(pluginExists).toBeTruthy();

  await settingsPage.enablePlugin('Test Plugin');
  expect(await settingsPage.isPluginEnabled('Test Plugin')).toBeTruthy();

  await settingsPage.navigateBackToWorkView();
  await expect(page).toHaveURL(/tag\/TODAY/);
});
```

---

## 获取帮助

- 在 `e2e/tests/` 中查看现有测试作为示例
- 在 `e2e/pages/` 中查阅页面对象的可用方法
- 查看 `constants/selectors.ts` 了解可用选择器
- 使用 Playwright Inspector（`npm run e2e:debug`）进行调试
- 查阅 Playwright 文档：https://playwright.dev/

---

## 总结检查清单

编写新测试时：

- [ ] 在合适的 `tests/` 子目录中创建测试文件
- [ ] 从 `fixtures/test.fixture.ts` 导入 `test` 和 `expect`
- [ ] 所有交互使用页面对象
- [ ] 使用 `constants/selectors.ts` 中的选择器
- [ ] 添加适当的等待（`waitForAngularStability` 等）
- [ ] 使用描述性测试名称
- [ ] 确保测试隔离（无共享状态）
- [ ] 提交前在本地运行测试
- [ ] 测试能稳定通过（运行 3 次以上）
