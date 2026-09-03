# 父子任务转换

sync-md 插件现已支持通过更改 markdown 文件中的缩进，在父任务与子任务状态之间转换。

## 工作原理

### 将子任务转换为父任务

只需在 markdown 文件中取消子任务的缩进，即可将其转为父任务：

**之前：**

```markdown
- [ ] Parent Task
  - [ ] This is a subtask
```

**之后：**

```markdown
- [ ] Parent Task
- [ ] This is a subtask # Now a parent task
```

### 将父任务转换为子任务

将父任务缩进到另一任务之下，即可将其转为子任务：

**之前：**

```markdown
- [ ] Task 1
- [ ] Task 2
```

**之后：**

```markdown
- [ ] Task 1
  - [ ] Task 2 # Now a subtask of Task 1
```

### 在父任务之间移动子任务

也可以将子任务从一个父任务移到另一个：

**之前：**

```markdown
- [ ] Parent 1
  - [ ] Subtask
- [ ] Parent 2
```

**之后：**

```markdown
- [ ] Parent 1
- [ ] Parent 2
  - [ ] Subtask # Now under Parent 2
```

## 限制

具有以下属性的任务**不能**转换为子任务：

- 带有 `repeatCfgId` 的任务（重复任务）
- 带有 `issueId` 的任务（关联 issue 的任务）

若尝试缩进这些任务，会看到警告消息，任务将保持为父任务。

**示例：**

```markdown
- [ ] Normal Task
  - [ ] Repeating Task # ⚠️ Won't work - will show warning
```

不过，这些任务**可以**不受限制地从子任务转换为父任务。
