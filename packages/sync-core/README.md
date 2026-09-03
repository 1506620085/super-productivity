# @sp/sync-core

Super Productivity 同步引擎的框架无关原语：操作日志类型、向量时钟、冲突解决、gzip 压缩与端到端加密。由主应用与 SuperSync 服务器消费；无 Angular/Electron/Capacitor 依赖。

## 加密

加密层提供 Argon2id 密钥派生与 AES-256-GCM 认证加密，包含 WebCrypto 路径，以及在 `crypto.subtle` 不可用时（尤其是 Android Capacitor 上的 `http://localhost`）的 `@noble/ciphers` 回退。

```ts
import {
  encrypt,
  decrypt,
  encryptBatch,
  decryptBatch,
  clearSessionKeyCache,
  setLegacyKdfWarningHandler,
} from '@sp/sync-core';

const cipher = await encrypt('hello', password);
const plain = await decrypt(cipher, password);
```

### 线上格式（公开契约）

| Format   | Bytes                                                           |
| -------- | --------------------------------------------------------------- |
| Argon2id | `[SALT (16)] [IV (12)] [AES-GCM ciphertext + auth tag (>= 16)]` |
| Legacy   | `[IV (12)] [AES-GCM ciphertext + auth tag (>= 16)]`             |

所有密文均以 base64 编码以便传输。格式按长度区分：`< 28` 字节无效，`< 44` 字节明确为旧版，`>= 44` 字节视为 Argon2id，并在认证失败时回退到旧版。未经版本化迁移请勿更改此约定。

### Salt 与 IV 语义

- **IV**（12 字节）每次调用都新鲜随机。固定密钥下 AES-GCM 的安全性归结为 IV 唯一性，本实现保证这一点。
- **salt**（16 字节）按 `(进程会话, 密码)` 对派生一次，并在该会话中的每次 `encrypt`/`encryptBatch` 调用中复用。这是有意为之——让会话缓存摊销约 500 ms–2 s 的 Argon2id 派生。因此同一会话内对同一明文的两次加密会共享 salt 前缀，仅 IV 与密文不同。测试中不要断言每次调用的 salt 唯一性。

### 会话密钥缓存

`encrypt`/`decrypt`/`encryptBatch`/`decryptBatch` 共享三个内存缓存（加密密钥、按 salt 的解密密钥、旧版 PBKDF2 密钥），可跨同步周期存活。Argon2id 派生开销大（默认 64 MiB / 3 次迭代时移动端约 500–2000 ms）；缓存使重复同步从分钟级变为秒级。

每当用户更改密码或登出时调用 `clearSessionKeyCache()`。密钥仅存在于内存，永不持久化。

### 旧版 KDF 迁移

旧数据使用以密码自身为盐的 PBKDF2 加密——在密码学上较弱。`decrypt()` 与 `decryptBatch()` 仍可读旧密文，使现有同步数据仍可访问。

`setLegacyKdfWarningHandler(fn)` 注册一个回调，在每次成功的旧版解密时触发，无论从哪个入口调用。宿主应节流面向用户的消息（例如每个会话只显示一次弃用横幅）。

### Argon2id 参数

默认为 OWASP 2023 移动端建议（parallelism: 1, iterations: 3, memorySize: 64 MiB）。测试可通过 `setArgon2ParamsForTesting({ ... })` 减弱参数——在 Node 打包且 `NODE_ENV === 'production'` 时调用会抛错。不带参数调用可恢复默认值。

## 其他导出

- `OpType`、`Operation`、`VectorClock` 及同类 — 操作日志原语类型
- `compareVectorClocks`、`mergeVectorClocks`、`limitVectorClockSize` — 时钟代数
- `classifyOpAgainstSyncImport` — 全量状态导入的操作处置
- `createSyncFilePrefixHelpers` — 宿主配置的文件前缀编解码
- `compressWithGzip`、`decompressGzipFromString` — gzip 辅助
- `replayOperationBatch`、`applyRemoteOperations` — 回放与应用协调器
- `planRegularOpsAfterFullStateUpload`、`planSnapshotHydration` 等 — 同步规划

完整 barrel 见 `src/index.ts`，各符号用法见其 JSDoc。

## 测试

```bash
npm test           # typecheck specs + vitest run, Node WebCrypto + @noble fallback
npm run test:watch # watch mode
npm run build      # tsup -> ESM + CJS + .d.ts
```

浏览器上下文烟雾覆盖位于消费方应用：`src/app/op-log/encryption/encryption.browser.spec.ts`（Karma + 真实 Chrome）。
