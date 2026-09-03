# E2E 测试参考

## 运行测试

```bash
npm run e2e:file tests/path/to/test.spec.ts   # 单个测试（约 20 秒/个）
npm run e2e                                    # 全部测试
npm run e2e:supersync:file <path>              # SuperSync E2E（自动启动服务器）
```

迭代时优先对单文件使用 `--retries=0` 以避免长时间等待，并用 `--grep "test name"` 只跑某一个测试：

```bash
npm run e2e:file <path> -- --retries=0 --grep "should X"
```

## SuperSync 完整套件

`npm run e2e:supersync` 脚本会缓冲输出，不利于实时调试。请改为直接用 Playwright 并以 line reporter 运行：

```bash
# Start the server
docker compose -f docker-compose.yaml -f docker-compose.supersync.yaml up -d supersync && \
  until curl -s http://localhost:1901/health > /dev/null 2>&1; do sleep 1; done && \
  echo 'Server ready!'

# Run with line reporter for real-time output
npx playwright test --config e2e/playwright.config.ts --grep @supersync --reporter=line

# Stop the server when done
docker compose -f docker-compose.yaml -f docker-compose.supersync.yaml down supersync
```

## 测试模板

```typescript
// Import path depends on test depth (see Import Paths below)
import { expect, test } from '../../fixtures/test.fixture';

test.describe('Feature', () => {
  test('should X when Y', async ({ workViewPage, taskPage }) => {
    await workViewPage.waitForTaskList();
    await workViewPage.addTask('Task Name');

    const task = taskPage.getTaskByText('Task Name');
    await expect(task).toBeVisible();
  });
});
```

## 导入路径

| 测试位置                         | 导入路径                           |
| -------------------------------- | -------------------------------- |
| `tests/feature/test.spec.ts`     | `../../fixtures/test.fixture`    |
| `tests/feature/sub/test.spec.ts` | `../../../fixtures/test.fixture` |

## 全部 Fixture

| Fixture        | 用途                                               |
| -------------- | ------------------------------------------------ |
| `workViewPage` | 任务列表、添加任务                                 |
| `taskPage`     | 任务操作（获取、编辑、标记完成）                   |
| `projectPage`  | 项目 CRUD、导航                                    |
| `settingsPage` | 设置导航、插件管理                                 |
| `dialogPage`   | 模态框/对话框交互                                  |
| `plannerPage`  | 规划视图操作                                       |
| `syncPage`     | WebDAV 同步设置                                    |
| `tagPage`      | 标签管理                                           |
| `notePage`     | 笔记功能                                           |
| `sideNavPage`  | 侧边导航                                           |
| `testPrefix`   | 自动加到任务/项目名称前缀以实现隔离                |

## 断言辅助函数

```typescript
import {
  expectTaskCount,
  expectTaskVisible,
  expectTaskDone,
  expectDoneTaskCount,
  expectDialogVisible,
  expectNoGlobalError,
} from '../../utils/assertions';

// Usage:
await expectTaskCount(taskPage, 2);
await expectTaskVisible(taskPage, 'Task Name');
await expectTaskDone(taskPage, 'Task Name');
await expectDialogVisible(dialogPage);
await expectNoGlobalError(page);
```

## 常见模式

### 创建带任务的项目

```typescript
await projectPage.createAndGoToTestProject();
await workViewPage.addTask('Task 1');
await workViewPage.addTask('Task 2');
await expectTaskCount(taskPage, 2);
```

### 标记任务完成并验证

```typescript
await workViewPage.addTask('My Task');
const task = taskPage.getTaskByText('My Task');
await taskPage.markTaskAsDone(task);
await expectDoneTaskCount(taskPage, 1);
```

### 对话框交互

```typescript
// Trigger dialog via some action, then:
await dialogPage.waitForDialog();
await dialogPage.fillDialogInput('input[name="title"]', 'Value');
await dialogPage.clickSaveButton();
await dialogPage.waitForDialogToClose();
```

### 同步测试（需串行执行）

```typescript
test.describe.configure({ mode: 'serial' });

test.describe('Sync Feature', () => {
  test('should sync data', async ({ syncPage, workViewPage }) => {
    // Sync tests require special setup - see sync-test-helpers.ts
  });
});
```

## 关键方法

### workViewPage

- `waitForTaskList()` - 每个测试中首先调用
- `addTask(name)` - 通过全局输入框添加任务

### taskPage

- `getTaskByText(text)` → Locator
- `getTask(index)` → Locator（从 1 开始）
- `getAllTasks()` → Locator
- `markTaskAsDone(task)`
- `getTaskCount()` → number
- `getDoneTasks()` / `getUndoneTasks()` → Locator
- `waitForTaskWithText(text)` → Locator

### projectPage

- `createProject(name)`
- `navigateToProjectByName(name)`
- `createAndGoToTestProject()` - 快速搭建

### settingsPage

- `navigateToPluginSettings()`
- `uploadPlugin(path)`, `enablePlugin(name)`, `pluginExists(name)`

### dialogPage

- `waitForDialog()` → Locator
- `clickDialogButton(text)`, `clickSaveButton()`
- `fillDialogInput(selector, value)`
- `waitForDialogToClose()`

完整方法列表请阅读页面对象文件：`e2e/pages/<name>.page.ts`

## 选择器

```typescript
import { cssSelectors } from '../../constants/selectors';
// Available: TASK, FIRST_TASK, TASK_TITLE, TASK_DONE_BTN, ADD_TASK_INPUT, MAT_DIALOG, SIDENAV, etc.
```

## 关键规则

1. **始终以** `await workViewPage.waitForTaskList()` **开头**
2. **使用页面对象**——常见操作不要用原始的 `page.locator()`
3. **不要使用 `waitForTimeout()`**——改用 `expect().toBeVisible()`
4. **测试相互隔离**——每个测试获得全新浏览器上下文 + IndexedDB
5. **使用断言辅助函数**——保持测试一致、可读
