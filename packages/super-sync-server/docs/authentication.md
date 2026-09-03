# 认证架构

SuperSync 的生产认证路径为通行密钥（passkey）与邮件魔法链接。无论登录方式如何，成功认证都会签发同一长期 JWT。密码创建仅存在于受保护的测试路由；它不是生产注册或登录流程。

可执行权威为：路由与速率限制见 [`api.ts`](../src/api.ts)，邮件 token 与 JWT 校验见 [`auth.ts`](../src/auth.ts)，WebAuthn 仪式与恢复见 [`passkey.ts`](../src/passkey.ts)。请将这些文件中的请求与响应载荷细节保留在原处，勿在此重复。

## 稳定端点用途

以下路径均挂载在 `/api` 下。

| 方法与路径                       | 稳定用途                                                                               |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /register/passkey/options` | 启动 WebAuthn 注册并保留五分钟的进程本地挑战                                           |
| `POST /register/passkey/verify`  | 校验仪式并将精确凭证暂存，等待邮件验证                                                 |
| `POST /register/magic-link`      | 创建未验证的仅邮箱账户并发送其验证链接                                                   |
| `POST /verify-email`             | 消费验证 token 并激活对应账户或待定 passkey                                            |
| `POST /login/passkey/options`    | 启动 WebAuthn 认证仪式                                                                 |
| `POST /login/passkey/verify`     | 校验 passkey 并签发 JWT                                                                |
| `POST /login/magic-link`         | 向已验证账户发送一次性登录链接                                                         |
| `POST /login/magic-link/verify`  | 消费登录 token 并签发 JWT                                                              |
| `POST /recover/passkey`          | 向已验证的 passkey 账户发送恢复链接                                                    |
| `POST /recover/passkey/options`  | 校验恢复 token 并启动替换 passkey 注册                                                 |
| `POST /recover/passkey/complete` | 替换账户的 passkey 并使其现有 JWT 失效                                                 |
| `POST /replace-token`            | 递增已认证用户的 token 版本并返回唯一的替换 JWT                                        |

认证请求 schema 与中性错误响应在 [`api.ts`](../src/api.ts) 中与这些路由一并定义。

## 账户激活与登录

### Passkey 注册

服务器校验 WebAuthn 注册仪式，但不会立即信任提交的凭证。它将该凭证存为
`PendingPasskeyRegistration`，绑定到精确的邮件验证 token。当该 token 被消费时，服务器原子性地验证用户、删除该账户的其他待定或活跃凭证，并仅提升绑定到该链接的凭证。这是记录于
[ADR #6](../../../ARCHITECTURE-DECISIONS.md#6-passkeys-stay-pending-until-email-verification) 的现行架构。

### 魔法链接注册与登录

魔法链接注册创建无密码、无 passkey 的未验证账户。邮件验证将其激活。随后可请求并一次性兑换单独的 15 分钟登录 token 以换取 JWT。注册、登录与恢复响应避免泄露邮箱地址是否已存在。

### Passkey 登录与恢复

Passkey 登录执行全新的 WebAuthn 仪式，然后签发 JWT。Passkey 恢复使用一小时有效的邮件 bearer token 启动替换 WebAuthn 仪式。成功完成后删除旧 passkey、存储新的、递增 `tokenVersion`，从而使其账户先前的 JWT 失效。

WebAuthn 挑战存放在五分钟的进程本地映射中，并由对应的完成请求消费。因此多实例部署需要共享挑战存储，或对每次完整仪式使用粘性路由。

## JWT 生命周期、校验与吊销

JWT 经签名，但不作为会话存储。每个 JWT 携带 `userId`、`email` 与 `tokenVersion`，并在 365 天后过期。认证方式仅在签发前重要；passkey 与魔法链接会话具有相同作用域与生命周期。

Token 校验检查签名，然后确认账户仍然存在、已验证，且具有相同的 `tokenVersion`。为避免每次请求都读数据库，这些账户字段在有界、进程本地的认证缓存中缓存 30 秒。账户删除、验证、token 替换与恢复会在数据库写入旁使本地缓存失效。

这意味着吊销在执行写入的进程上是立即的，但跨独立副本不是：另一进程可继续接受先前缓存的 token，直到其条目过期，最多剩余 30 秒 TTL。若多实例部署需要立即的全局吊销，必须增加共享失效（或更强的集中式校验设计）。将账户的所有请求一致路由可缩小窗口，但不能作为共享失效的一般性保证替代。

`POST /api/replace-token` 递增 `tokenVersion`，使该账户所有先前 JWT 失效，并返回带新版本的新 JWT。未实现按设备的选择性吊销。

缓存实现及其单副本约束位于 [`auth-cache.ts`](../src/auth-cache.ts)；JWT 校验与版本写入位于 [`auth.ts`](../src/auth.ts)。

## 邮件 Token 是 Bearer 密钥

验证、魔法登录与 passkey 恢复 token 是随机 32 字节值，以纯字符串存储。它们在密码学上不可猜测、有时限，并通过受保护的数据库更新消费，使同一 token 不能完成流程两次。当前生命周期为：邮件验证 24 小时、魔法登录 15 分钟、passkey 恢复一小时。

这些限制降低暴露面；它们并不使明文 token 低价值。魔法登录 token 可授予 JWT，恢复 token 可替换账户的 passkey。消费 passkey 注册验证 token 会激活已绑定到该 token 的凭证，因此攻击者若暂存了其控制的凭证并随后获得对应邮件 token，即可获得持续账户访问。因此，包含未过期 token 的数据库转储、应用日志与代理日志必须视为凭证泄露。

明文存储是当前已知限制。更强的设计将仅存储 token 摘要，并比较所提交 token 的摘要，在保留查找与一次性语义的同时，不在数据库中留下可用的 bearer 值。

## WebSocket Token 传输

已认证的 HTTP 端点在 bearer authorization 头中接收 JWT。WebSocket 握手从 `token` 查询参数使用同一完整访问、365 天的 JWT；它不是短生命周期或仅限 WebSocket 作用域的凭证。

生产部署必须使用 HTTPS 与 WSS。由于反向代理的访问日志与请求失败/错误日志可能记录请求 URI 与头，每套此类配置都必须从两条日志路径中省略敏感查询值及带 token 的 `Referer` 头。登录与恢复页面必须发出
`Referrer-Policy: no-referrer`；否则其同源脚本与 API 请求可能在已记录头中重复带凭证的页面 URL。[捆绑的 Caddy 配置](../Caddyfile) 会替换完整的已记录查询后缀，从两条 Caddy 日志路径丢弃 `Referer`，并设置该策略。自定义代理与日志配置必须提供等效保护。应用错误日志记录器独立替换其完整查询后缀，因此畸形请求无法通过应用日志绕过代理过滤器。

## 安全属性与当前限制

| 关注点                       | 当前实现                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| JWT 签名                     | 至少 32 字符的 HMAC-SHA256 密钥                                                        |
| JWT 生命周期                 | passkey 与魔法链接认证均为 365 天                                                      |
| 整账户吊销                   | `tokenVersion` 递增，受上文所述跨副本缓存窗口约束                                      |
| Passkey 校验                 | WebAuthn 源、RP ID、挑战、凭证签名与计数器检查                                         |
| 邮箱枚举抗性                 | 中性的注册/登录/恢复响应与虚设 passkey 选项                                            |
| 邮件 bearer token 熵         | 32 随机字节                                                                            |
| WebAuthn 挑战存储            | 五分钟进程本地映射；无亲和性/共享存储则非多实例安全                                    |
| 按设备 JWT 吊销              | 未实现                                                                                 |
| 刷新 token 分离              | 未实现                                                                                 |

将 `JWT_SECRET` 设为至少 32 字符的强随机值。WebAuthn 部署身份由 `WEBAUTHN_RP_NAME`、`WEBAUTHN_RP_ID` 与 `WEBAUTHN_ORIGIN` 控制；生产源必须使用 HTTPS。
