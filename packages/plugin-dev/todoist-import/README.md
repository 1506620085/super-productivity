# Todoist 导入插件

此捆绑的一次性导入器将活跃的 Todoist 数据添加到 Super Productivity。
它是增量式的：永不替换现有应用数据，也不是实时的 Todoist 集成。

## 数据与隐私边界

- 插件请求 Todoist 统一 Sync API v1：
  `https://api.todoist.com/api/v1/sync`，先使用 `sync_token=*`，再用返回的
  token，以便包含延迟快照期间的变更。
- 个人 API token 仅在 iframe 内存中存在于导入会话期间。它只发送到
  `api.todoist.com`，永不存储、同步或记录日志。
- 因此清单声明 `http`，且精确为
  `allowedHosts: ["api.todoist.com"]`。
- 导入按项目进行，非事务性。失败可能使当前项目处于部分导入状态；结果会告知
  用户在重试前应删除哪个项目。

## 映射与有意舍弃

导入器处理活跃项目、顶级任务、两层子任务、备注/评论、顶级任务上的标签、
截止日期/时间，以及基于分钟的时间估算。

当前限制会在预览与摘要中展示：

- 嵌套项目会被展平，分区不会导入；
- 更深的子任务会重新挂到顶级祖先下；
- 子任务标签与优先级会省略，因为 SP 子任务无法持有标签；
- 重复规则保留下一个截止日期，并将 Todoist 重复文本追加到备注；不会创建
  `TaskRepeatCfg`；
- 基于天的时长、指派人、文件附件、已完成历史与提醒不会导入；并且
- 冲突检测仅看活跃的 SP 项目，因此可能无法识别已归档的先前导入。

## 批处理不变量

`src/map/plan-import.ts` 与 `src/map/run-import.ts` 有意：

- 每次 awaited 的 `batchUpdateForProject` 调用最多发送 50 个操作；
- 先创建父任务再创建子任务；
- 对未解析的父任务使用 `temp-` 前缀的 ID；并且
- 在后续批次调用前，用返回的真实 ID 替换父任务的临时 ID。

更改其中任何一项都可能导致导入的子任务被孤立并删除，或将多次派发压成同一事件循环轮次。批次结果并非权威，因此导入器会重新读取任务，并将落地数量与计划比较。

截止日期、带时间的到期值与标签是后续的 `updateTask` 调用，因为批量创建契约不携带它们。`TODAY` 是虚拟的，绝不能写入 `task.tagIds`。

## 开发

```bash
cd packages/plugin-dev/todoist-import
npm test
npm run build
```

纯解析、映射、有损摘要、本地化与执行器行为由同目录的 Jest 规格覆盖。打包变更后，还请从仓库根目录运行 `npm run plugins:build`。
