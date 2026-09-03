# Android 后台同步改进

> **状态：已规划**
>
> **负责人 / 跟踪：** 未指定；实现前请创建 issue。
>
> **上次核实：** 2026-07-29

## 背景

Android WorkManager 大约每 15 分钟轮询一次 SuperSync 服务器。
当它检测到任务在另一台设备上被完成、删除、改期，或其提醒被清除时，
会更新或取消过期的 Android 通知。这能工作，但原生提醒反映远端变更仍有延迟。

本文档记录：

1. 围绕 worker 私有序列游标的安全约束；以及
2. 缩短 15 分钟通知更新延迟的可能方式。

---

## 已否决：将提醒游标用于前台同步

后台 worker 的 `lastServerSeq` **不能**证明操作已写入操作日志或已应用到 Angular 状态。
它只记录原生提醒 worker 在更新通知时扫描到了何处。

因此：

- 切勿将提醒游标暴露为 `getLastSyncSeq()`，或用它为前台
  provider 的 `sinceSeq` 赋值。
- 前台同步仅可在已下载的操作被持久存储并成功应用之后，才推进自己的游标。
- 为原生提醒目的看到或过滤某条操作，并不意味着前台同步可以安全地跳过该操作。

违反此边界可能导致远端任务变更被应用永久遗漏。
任何未来共享的后台同步缓存都需要存储实际操作，
并通过与正常前台下载相同的持久 apply/checkpoint 路径传递。
那是独立的同步设计，而非提醒优化。

---

## 可能改进：基于推送的取消

### 问题

WorkManager 的最小周期间隔为 15 分钟。用户可能在桌面端完成任务，
若提醒在该窗口内触发，手机仍会收到提醒。

### 候选方案

使用 Firebase Cloud Messaging (FCM)，在发生与提醒相关的操作时，
由 SuperSync 服务器推送轻量信号。Android 应用收到推送后立即取消过期通知。

这是 **未获批的实现工作**。它需要纳入跟踪的隐私、运维与产品决策，
因为会引入 Google 基础设施、设备注册、服务器状态以及新的投递路径。

### 前置条件

- SuperSync 服务器必须支持在新操作上触发 webhook/推送
- FCM 项目配置与设备 token 注册
- 服务器侧逻辑，用于判定哪些操作属于「与提醒相关」

### 设计

#### 服务器侧

1. 客户端向 SuperSync 服务器注册其 FCM token（新 API 端点）
2. 当服务器收到匹配提醒相关动作码（HRX、HX、HD、HCR、带提醒变更的 HU）的操作时，向该账户已注册的 token 发送 **仅含 data** 的 FCM 消息
3. FCM 载荷尽量精简：`{ "type": "reminder_change", "seq": 12345 }`

#### 客户端侧

1. `FirebaseMessagingService` 接收 data 消息
2. 从 SharedPreferences 读取当前 `lastServerSeq`
3. 若传入的 seq 更新，则用现有 `SuperSyncBackgroundProvider` 从 `lastServerSeq` 拉取到新 seq 的操作
4. 使用 `SyncReminderWorker` 中的现有逻辑解析并取消通知
5. 更新 `lastServerSeq`

#### 混合方案

保留 15 分钟的 WorkManager 轮询作为回退。FCM 投递是尽力而为——消息可能被系统延迟或丢弃（Doze 模式、电池优化）。即使 FCM 失败，worker 也能保证最终一致。

```
FCM 推送（即时，尽力而为）
        ↓
  取消通知
        ↓
WorkManager 轮询（15 分钟，有保证）
        ↓
  取消任何仍过期的通知
```

### 实现步骤

1. 向 Android 项目添加 Firebase SDK
2. 创建继承 `FirebaseMessagingService` 的 `SyncFirebaseMessagingService`
3. 在 SuperSync 服务器添加 FCM token 注册端点
4. 添加服务器侧针对提醒相关操作的推送逻辑
5. 将 FCM token 桥接到 TypeScript 层，以便在 SuperSync 认证时发送
6. 保留现有 WorkManager 轮询作为回退

### 考量

- **隐私**：FCM 消息会经过 Google 服务器。载荷应只含 seq 编号，绝不包含任务内容。
- **电池**：仅含 data 的 FCM 消息影响很小。与现有 WorkManager 轮询结合，额外耗电可忽略。
- **服务器成本**：每个提醒相关操作向每台已注册设备推送一次。对多数用户每天仅几次。
- **多设备**：每台设备注册自己的 FCM token。服务器向该账户的所有 token 推送。

---

## 可能改进：其他同步提供方

### Dropbox / WebDAV

`BackgroundSyncProvider` 接口已支持此场景。Dropbox 实现将：

1. 通过 Dropbox API 下载 `sync-data.json`（约 100KB+）
2. 与本地缓存副本做 diff，检测任务完成/删除
3. 返回需要取消的 taskId 集合

这比 SuperSync 基于操作的 API 更重，但对于约 15 分钟的轮询间隔仍可行。WebDAV 类似。

**关键差异**：Dropbox/WebDAV 提供方需要本地缓存先前状态以计算 diff，增加存储开销。SuperSync 基于 seq 的分页则完全避免这一点。

### 实现将增加：

- 实现 `BackgroundSyncProvider` 的 `DropboxBackgroundProvider`
- 实现 `BackgroundSyncProvider` 的 `WebDavBackgroundProvider`
- Dropbox OAuth token 与 WebDAV 凭据的桥接
- 在 `SyncReminderWorker` 中按已存提供方 ID 选择提供方

---

## 优先级与顺序

| 候选                      | 工作量                                  | 影响                        | 建议                                               |
| ------------------------- | --------------------------------------- | --------------------------- | -------------------------------------------------- |
| FCM 推送                  | 大（约 1 周，需服务器改动）             | 高 — 更快取消               | 仅在隐私/产品/运维批准之后                         |
| 其他同步提供方            | 每个提供方中等                          | 中 — 覆盖面更广             | 仅在确有提供方需求时                               |
| 将提醒游标作提示          | 小                                      | 不安全 — 可能跳过用户数据   | 已否决；保留上文安全围栏                           |
