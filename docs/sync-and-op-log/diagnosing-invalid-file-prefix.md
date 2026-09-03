# 诊断 `InvalidFilePrefixError`（#9627）

下载的同步文件必须以头 `pf_[C][E]<modelVersion>__` 开头
（`C` = 压缩，`E` = 加密）。若不是，客户端会抛出
`InvalidFilePrefixError`，而 OpLog 历史（用户作为日志导出发送的内容）会记录三个字段，旨在一次往返中回答一个问题：**这是坏的 RESPONSE（服务器/代理）还是坏的 STORED FILE？**

这些字段只是形状 — 绝不是文件的字节。同步文件的头部是用户数据。

## 解码表

| 字段       | 值    | 解读为                                                                                                                                                                                                                                                                                       |
| ----------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prefixAt`  | `-1`     | 头已完全消失。启发式：仅丢失第一个字节的头也会读成 `-1`。                                                                                                                                                                                                        |
| `prefixAt`  | `>= 0`   | 头存在但已损坏，或被前置垃圾推到该偏移。                                                                                                                                                                                                                       |
| `headShape` | `markup` | 坏的 RESPONSE：代理或强制门户 HTML、WebDAV multistatus。                                                                                                                                                                                                                               |
| `headShape` | `base64` | 与我们自己缺少头的密文/gzip 正文一致 — STORED-FILE 问题。**不是证明**：任何长字母数字正文读起来都一样；请权衡 `inputLength` 与提供方。                                                                                                      |
| `headShape` | `json`   | **模糊 — 不要解读为「坏响应」。** 加密与压缩默认都关闭，因此未加密的已存储正文就是原始 JSON。结合报告者的同步设置判断：若加密或压缩为 ON，其正文会是 `base64`，那时 `json` 才指向响应。 |
| `headShape` | `other`  | 无法识别或过短无法分类（`Unauthorized`、`nginx`）。检查 `inputLength`。                                                                                                                                                                                                         |

`headShape` 无法区分头被剥离与更大的片段（两者都读成
`base64`）；本地没有任何信息知道文件的预期大小。

## 所有权

`SyncFilePrefixInvalidPrefixDetails` 上的接口文档
（`packages/sync-core/src/sync-file-prefix.ts`）是规范性的；本表是分流摘要。这些论断由可执行规格钉住：分类在
`packages/sync-core/tests/sync-file-prefix.spec.ts`，针对真实编码器的按配置正文形状在
`src/app/op-log/encryption/encrypt-and-compress-handler.service.spec.ts`，以及
OpLog 桥接在 `src/app/op-log/util/sync-file-prefix.spec.ts`。

恢复：`SyncWrapperService` 会展示损坏远程 snack，并带有强制覆盖操作（与 `JsonParseError` 共享）— 但
`headShape: 'markup'` 除外，它指向坏响应而非坏的已存储文件：此时 snack 会解释可能的服务器/代理/登录原因，且不提供覆盖操作，因为在健康的远程文件上强制上传以「修复」瞬时响应会丢失其他设备的数据。若 markup 确实就是已存储文件（例如 WebDAV 持久化了错误页），手动逃生舱是同步设置 → 强制覆盖远程
（`DialogSyncCfgComponent`），它绝不会重新读取坏文件。针对此错误的 `.bak`
自动恢复停在 #9682 — 头剥离不是撕裂写入的形状 — 明确的合并标准记录在那里。
