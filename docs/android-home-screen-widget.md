# Android 主屏幕小组件

> **状态：** 维护中
>
> **最后核实：** 2026-07-29

小组件显示应用今日视图最近快照中最多 20 个任务，并允许用户切换完成状态。它是 Angular 状态的原生投影，不是独立的任务或日历引擎。

## 契约与归属

- Angular 的 `WidgetDataService` 是 `widget_data` JSON 快照的唯一写入者。TypeScript 契约在
  `src/app/features/android/android-widget.model.ts`。
- Kotlin 在
  `android/app/src/main/java/com/superproductivity/superproductivity/widget/WidgetData.kt`
  中解析带版本的 `v: 1` 形态。未知版本失败关闭为空列表。
- 原生复选框点击只写入 `WidgetDoneQueue`。渲染器立即叠加队列中的目标状态；Angular 稍后排空、去重并应用这些意图。原生代码绝不可改写快照。
- 保持显式组件 PendingIntent 与 exported-receiver 限制；外部应用不得能完成任务。

序列化器与 Kotlin 解析器由 `android-widget.selectors.spec.ts` 与 `WidgetDataTest.kt` 锁定为同一 golden 形态。契约变更时两端与两个测试都要更新。

## 日期与新鲜度语义

Angular 提供 `dayStr` 与 `validUntil`。原生代码仅以 `now >= validUntil` 判断过期；不得复现逻辑日偏移、重复任务物化、逾期结转或虚拟 `TODAY_TAG` 成员关系。

小组件反映应用尚能运行时产生的最后状态。进程死亡时无法创建新一天的重复任务或接收跨客户端变更。其 30 分钟平台刷新不精确，且可能被 Doze 推迟。在应用写入当前快照之前，`validUntil` 之前的快照不能被判定为过期。

## 有意限制

- 无任务创建、撤销或按任务深度链接。
- 原生小组件外观仅英文，使用固定样式。
- 最多渲染 20 个任务。
- 应用死亡时的跨客户端新鲜度需要单独的后台同步设计。提醒 worker 的游标不是权威应用状态游标；见
  [Android 后台同步改进](long-term-plans/android-background-sync-improvements.md)。

改动应保持单写入者快照、队列意图投递、逻辑日边界与同步后刷新不变量。
