# SuperSync 服务器

面向 Super Productivity 的自定义高性能同步服务器。

> **说明：** 本服务器实现的是自定义的、基于操作的同步协议（事件溯源），**不是** WebDAV。它专为 Super Productivity 客户端的高效同步需求而设计。

> **相关文档：**
>
> - [认证架构](./docs/authentication.md) — 认证设计决策与安全特性
> - [同步架构现场指南](../../docs/sync-and-op-log/sync-architecture.html) — 全系统维护者总览
> - [服务器架构](./docs/architecture.md) — 仅服务器侧的契约与信任边界
> - [备份与灾难恢复](./docs/backup-and-recovery.md) — 备份配置与恢复流程
> - [生产容量](./docs/production-capacity.md) — 托管部署的实测 I/O 上限，以及写查询时意味着什么

## 架构

服务器采用 **写时追加、保留式操作日志**，后端为 **PostgreSQL**（通过 Prisma）：

1.  **操作（Operations）**：客户端上传原子操作（Create、Update、Delete、Move）。
2.  **序列号（Sequence Numbers）**：服务器在当前同步数据集内为每位用户分配严格递增的 `server_seq`。
3.  **同步（Synchronization）**：客户端请求「自序列 `X` 以来的全部操作」。
4.  **全量状态边界（Full-state boundaries）**：客户端可从因果全量状态操作快速追赶；可选的明文缓存支持服务器侧回放与恢复。

### 关键设计原则

| 原则                           | 说明                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------- |
| **有范围的服务器权威**         | 服务器拥有每用户顺序与已接受上传结果，而非应用状态语义                                         |
| **两部分冲突处理**             | 服务器检测上传冲突；客户端处理拒绝与下载侧并发                                                 |
| **E2E 加密支持**               | 可选载荷加密，路由与因果元数据保持明文                                                         |
| **幂等上传**                   | 持久的操作 ID 唯一性是兜底；请求 ID 额外提供五分钟进程本地缓存                                 |

## 快速开始

### Docker（推荐）

运行服务器最简单的方式是使用附带的 Docker Compose 配置。
部署主机需要带 Compose 插件的 Docker，以及 `curl`、`git` 和 `jq`。
镜像修订检查要求 Docker Compose 支持
`docker compose config --format json`。

> **没有 release 标签。** `ghcr.io/super-productivity/supersync` 只发布
> `latest` 与 `master-<sha>`，二者都从 `master` 构建，因此默认部署会跟踪上游
> `master` 而非某个已发布版本。若需要固定版本，请将 `SUPERSYNC_IMAGE`
> 钉到某个 `master-<sha>` 标签。

```bash
# 1. Clone the repo (deploy.sh runs from this checkout) and enter this directory
git clone https://github.com/super-productivity/super-productivity.git
cd super-productivity/packages/super-sync-server

# 2. Copy environment example
cp env.example .env

# 3. Configure .env (Set JWT_SECRET, DOMAIN, POSTGRES_PASSWORD)
nano .env

# 4. Deploy the stack and run database migrations
./scripts/deploy.sh
```

`./scripts/deploy.sh --build` 会在本地构建镜像，而不是拉取。
这会在部署主机上、在正在运行的栈旁边编译整个 monorepo：预计需要数分钟，
峰值内存会在容器已预留的约 2.5 GB 之上再增加超过 1.5 GB，外加 BuildKit
缓存每次构建约增长 1.4 GB 且不会自动清理。在小型 VPS 上请优先拉取，
或在别处构建并设置 `SUPERSYNC_IMAGE`（传入相同的 `VCS_REF`，见下文）。
若镜像输入存在未提交或未跟踪的更改，`--build` 也会拒绝运行；错误信息会列出相关文件。

`docker compose up` 不能替代正式部署：容器启动时的迁移默认关闭，
以免应用重启与部署迁移器竞态。
`./scripts/deploy.sh` 会在替换应用容器之前先运行一次 `prisma migrate deploy`，
然后拉起栈并校验健康检查端点。

使用自带的 Postgres 服务时请保持 `DATABASE_URL` 未设置。默认连接使用
`postgres:5432`；已将 `DATABASE_URL` 设为 `db:5432` 的现有安装仍可工作，
因为 Compose 服务将 `db` 暴露为网络别名。

> **升级说明：** 由于 `RUN_MIGRATIONS_ON_STARTUP` 默认为 `false`，
> `docker compose pull && docker compose up -d` 可能导致应用在未应用迁移的情况下运行。
> 生产更新请使用 `./scripts/deploy.sh`，本地镜像构建请使用 `./scripts/deploy.sh --build`。

`deploy.sh` 会校验拉取/构建的 `supersync` 镜像的
`org.opencontainers.image.revision` 标签是否与影响 SuperSync 镜像输入的最新提交一致。
这可防止主机部署脚本对过期镜像运行迁移，同时又不必为无关仓库提交发布新镜像。
若发布自定义镜像，请在 Docker 构建时传入相同的源修订作为 `VCS_REF`，
或仅在刻意手动覆盖时设置 `SUPERSYNC_SKIP_IMAGE_REVISION_CHECK=true`。

部分迁移使用 `CREATE INDEX CONCURRENTLY`，在繁忙数据库上可能被长时间事务阻塞。
应用 schema 变更时请在非高峰时段部署，若大表需要更长时间可提高
`MIGRATION_TIMEOUT`（秒，默认 `900`）。`deploy.sh` 退出码 `124` 表示迁移超时 —
清除阻塞事务后重新运行。带锁超时上限的 reloption 迁移（自行设置较短
`lock_timeout` 的迁移，例如 `operations_entity_ids_gin` 那次）会快速失败而不是
把流量排队，并会原生重试有限次数。若每次尝试都超时，则会保持回滚 —
清除阻塞事务后重新运行部署。

若部署在 Prisma 将某次迁移记录为失败之后中断，后续部署可能以 `P3009` 停止。
当迁移包含 `CREATE/DROP INDEX CONCURRENTLY` 语句（不能在单个事务块中运行）时，
Prisma 也可能以 `P3018` 停止迁移。`scripts/migrate-deploy.sh` 会通用地处理
安全的「先删后建」并发索引情况：在需要时解析失败行，在 Prisma migrate 之外
应用迁移 SQL，标记迁移已应用，然后重试 `migrate deploy`。它也会按形态
（从不按名称）原生重试任何带锁超时上限的 reloption 迁移；所有其他失败迁移形态
会停下供人工审查。

应用回滚不需要更改此索引设置。若本次上线后实测插入延迟回退，请在单独批准的
数据库变更中恢复 PostgreSQL 默认值：

```bash
printf '%s\n' \
  'BEGIN;' \
  "SET LOCAL lock_timeout = '1s';" \
  'ALTER INDEX "operations_entity_ids_gin" RESET (fastupdate);' \
  'COMMIT;' | npx prisma db execute --schema prisma/schema.prisma --stdin
```

> **在 `0_init` 基线之前创建的现有数据库：** 迁移链现在以创建基表的 `0_init`
> 基线开始，因此全新数据库可以仅靠迁移初始化。schema 早于该基线的数据库必须在
> **下一次部署之前** 告知 Prisma 其 schema 已反映哪些迁移，否则 `migrate deploy`
> 会尝试重建已有对象并失败（`relation "users" already exists`，或
> `P3005 The database schema is not empty`）。这也适用于无人值守部署路径
> （Helm `migrate-db` initContainer 以及 Docker `RUN_MIGRATIONS_ON_STARTUP=true`
> 启动），在完成基线化之前会大声失败。
>
> - **已有 Prisma 迁移历史的数据库**（`0_init` 之前的迁移已记录在
>   `_prisma_migrations`）：只需将基线标记为已应用。
>
>   ```bash
>   npx prisma migrate resolve --applied 0_init
>   ```
>
> - **用 `prisma db push` 创建的数据库**（无迁移历史）：其逻辑 schema 已与最新
>   `schema.prisma` 匹配，但 `db push` 无法表达存储 reloption —
>   既不能表达 `operations_entity_ids_gin` 的 fastupdate 设置，也不能表达
>   `operations` 的 autovacuum 因子。请在基线化整条链之前先应用该仅数据库状态
>   并清空旧的 pending 列表，否则下面的循环会在从未真正应用过这两次
>   reloption 迁移的数据库上将它们标记为已应用。（这只关闭 reloption 缺口 —
>   `20260512000000`、`20260514000000` 与 `20260514000002` 中的部分索引同样无法
>   用 `db push` 表示，仍是已知缺口，与 `schema.prisma` 的部分索引说明一并跟踪。）
>   每个显式事务将 `SET LOCAL` 限定在其语句内；若锁超时触发，请在非高峰重试。
>   autovacuum 的 `ALTER` 只取 `SHARE UPDATE EXCLUSIVE`，因此从不阻塞应用流量，
>   但 SUE 会与自身冲突，所以同样设了超时上限，而不是在没有反馈的情况下
>   等在正在运行的 `VACUUM` 后面。
>
>   ```bash
>   (
>     set -e
>     printf '%s\n' \
>       'BEGIN;' \
>       "SET LOCAL lock_timeout = '1s';" \
>       'ALTER INDEX "operations_entity_ids_gin" SET (fastupdate = off);' \
>       'COMMIT;' | npx prisma db execute --schema prisma/schema.prisma --stdin
>     printf '%s\n' \
>       'BEGIN;' \
>       "SET LOCAL lock_timeout = '5s';" \
>       'ALTER TABLE "operations" SET (autovacuum_vacuum_insert_scale_factor = 0.02);' \
>       'COMMIT;' | npx prisma db execute --schema prisma/schema.prisma --stdin
>     printf '%s\n' \
>       'BEGIN;' \
>       "SET LOCAL statement_timeout = '300s';" \
>       "SELECT gin_clean_pending_list('operations_entity_ids_gin');" \
>       'COMMIT;' | npx prisma db execute --schema prisma/schema.prisma --stdin
>     for m in prisma/migrations/*/; do
>       npx prisma migrate resolve --applied "$(basename "$m")"
>     done
>   )
>   ```
>
> 全新数据库无需以上步骤 — `migrate deploy` 会自动应用 `0_init` 及后续链。

对于本地 `prisma migrate dev` 影子数据库，请通过 `prisma db execute` 在事务外
应用包含 `CREATE INDEX CONCURRENTLY` 的迁移，然后标记迁移已应用，
与生产部署变通做法一致。

若 `DATABASE_URL` 指向外部 PostgreSQL 服务器，请将 `POSTGRES_SERVICE=` 设为空值。
`deploy.sh` 随后只启动应用/代理服务并禁用 compose 依赖，从而不需要自带的
Postgres 容器。Prisma 迁移仍针对已配置的 `DATABASE_URL` 运行。

**支持的版本为 PostgreSQL 16 或更新**，这也是 CI 与生产运行的版本
（自带 compose 镜像为 `postgres:16-alpine`）。PostgreSQL 14 与 15 仍可工作，
且仍会收到每次迁移 — `migrate-deploy.sh` 会警告并继续 — 只是不在测试套件覆盖范围内。

**Linux 主机上的 PostgreSQL 14 是硬性下限**，由连接强制执行而非仅文档说明：
迁移管道在其连接上设置 `client_connection_check_interval`，以便被遗弃的
`CREATE INDEX CONCURRENTLY` 自行取消，而不是一直持有表锁。更旧或非 Linux
服务器会以 FATAL `unrecognized configuration parameter` 拒绝该启动选项，
导致每次迁移连接都失败，因此不会应用任何内容。这还覆盖了链自身的 PG13 要求 —
迁移 `20260828000003` 设置 `autovacuum_vacuum_insert_scale_factor`，在更旧服务器上
产生的 `22023` 不会匹配脚本中的任何恢复门控，从而使该迁移失败，后续每次部署
都死于 `P3009`。

### 载荷字节回填

回填对启动是可选的：增量存储计数器在没有它时也能工作。但只要用户仍有
`payload_bytes = 0` 的遗留行，该用户的精确配额对账就会延期（服务器拒绝用近似和
覆盖精确计数器），因此若希望遗留账户也能对账，请运行回填。

运行回填直至完成：

```bash
npm run migrate-payload-bytes
```

在 `npm run build` 之前的源码检出中，使用：

```bash
npm run migrate-payload-bytes:dev
```

### 手动设置（开发）

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Set up .env
cp env.example .env
# Edit .env to point to your PostgreSQL instance (DATABASE_URL)

# Push schema to DB
npx prisma db push

# Start the server
npm run dev

# Or build and run
npm run build
npm start
```

## 配置

所有配置通过环境变量完成。

| 变量                                    | 默认值                               | 说明                                                                                                                                           |
| :-------------------------------------- | :----------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT`                                  | `1900`                               | 服务器端口                                                                                                                                     |
| `HOST`                                  | `0.0.0.0`                            | 服务器绑定地址。IPv6-only 部署使用 `::`。                                                                                                      |
| `DATABASE_URL`                          | -                                    | PostgreSQL 连接字符串（例如 `postgresql://user:pass@localhost:5432/db`）                                                                       |
| `JWT_SECRET`                            | -                                    | **必需。** 用于签发 JWT 的密钥（最少 32 字符）                                                                                                 |
| `PUBLIC_URL`                            | -                                    | **必需。** 用于邮件链接的公网 URL（例如 `https://sync.example.com`）                                                                           |
| `CORS_ORIGINS`                          | `https://app.super-productivity.com` | 允许的 CORS 来源。`*` 允许任意来源 — 生产环境切勿如此，CORS 以 `credentials: true` 运行。                                                      |
| `SMTP_HOST`                             | -                                    | 用于邮件的 SMTP 服务器                                                                                                                         |
| `WEBAUTHN_RP_ID`                        | `localhost`                          | **通行密钥必需。** 你的域名，不含协议或端口。通行密钥绑定于此 — 更改会使所有已注册凭证失效。                                                   |
| `WEBAUTHN_ORIGIN`                       | `http://localhost:1900`              | **通行密钥必需。** 用户访问认证 UI 的地址，含协议。                                                                                            |
| `WEBAUTHN_RP_NAME`                      | `WEBAUTHN_RP_ID` 的值                | 在用户操作系统通行密钥提示中显示的名称。                                                                                                       |
| `ALLOWED_EMAILS`                        | -（任何人可注册）                    | 逗号分隔的精确地址和/或 `*@domain` 规则。                                                                                                       |
| `SUPERSYNC_DEFAULT_STORAGE_QUOTA_BYTES` | `104857600`（100 MB）                | 自现在起新建账户的配额。现有账户保留其行上已存储的值。                                                                                         |

### 法律页面

**镜像不附带服务条款，在你表明自己是数据控制者之前也不提供隐私政策。** 这是刻意的：
我们自己的文档点名德国法、莱比锡管辖地以及我们的联系地址，在你的域名下发布它们
会构成以你名义作出的虚假法律声明。

设置以下 **全部五项** 才会发布 `/privacy.html` 并显示注册同意通知。全部不设则
法律页面根本不会提供。部分设置是启动错误，而非静默回退。

| 变量                      | 说明                                     |
| :------------------------ | :--------------------------------------- |
| `PRIVACY_CONTACT_NAME`    | 控制者名称（个人或公司）                 |
| `PRIVACY_ADDRESS_STREET`  | 街道地址                                 |
| `PRIVACY_ADDRESS_CITY`    | 邮编与城市                               |
| `PRIVACY_ADDRESS_COUNTRY` | 国家/地区                                |
| `PRIVACY_CONTACT_EMAIL`   | 数据保护请求的联系地址                   |

`PRIVACY_DATA_REGION` 独立于上述五项：设为 `EU`（或 `EEA`）可在落地页显示
「数据托管于欧盟」徽章。其他任何值都不显示徽章，因为在「托管于美国」上方挂欧盟旗
正是这些页面要避免的虚假主张。

两个可选段落在未设置时会从政策中完全省略：
`PRIVACY_HOSTING_PROVIDER`（你的托管提供商，若第三方代表你处理数据）以及
`PRIVACY_SUPERVISORY_AUTHORITY`（对你有管辖权的监管机构 — 未设置时政策会引导用户
联系其居住地的监管机构）。

要发布你自己的服务条款，请将 HTML 放在 `<DATA_DIR>/legal/terms.html`；启动时会复制到
`/terms.html` 并从同意通知中链接。使用自带 compose 文件时意味着绑定挂载 —
参见 `docker-compose.yml` 中的注释示例。由 `scripts/deploy.sh` 驱动的部署可改为在
`.env` 中设置 `SUPERSYNC_INSTALL_REPO_TERMS=true`，以便每次部署将检出中的
`legal/terms.html` 同步到数据卷 — 仅当你检出中的文件确实属于你时才这样做。
附带模板只是起点，不是法律建议：发布前请对照你的实际运营审查每一节。

## API 端点

### 认证

生产环境的账户创建与登录使用通行密钥或邮件魔法链接；没有基于密码的生产
`/api/register` 或 `/api/login` 端点。

| 端点组                     | 用途                                                                  |
| -------------------------- | --------------------------------------------------------------------- |
| `/api/register/passkey/*`  | 启动并验证通行密钥注册                                                |
| `/api/register/magic-link` | 注册仅邮箱账户                                                        |
| `/api/verify-email`        | 激活账户，并对通行密钥注册激活其绑定凭证                              |
| `/api/login/passkey/*`     | 启动并验证通行密钥认证                                                |
| `/api/login/magic-link*`   | 请求并消费一次性登录链接                                              |
| `/api/recover/passkey*`    | 在邮箱令牌恢复后替换通行密钥                                          |
| `/api/replace-token`       | 撤销所有更早的 JWT 并返回替换令牌                                     |

参见 [认证架构](./docs/authentication.md) 了解生命周期与安全边界。可执行路由与
schema 位于 [`src/api.ts`](./src/api.ts)，令牌行为位于
[`src/auth.ts`](./src/auth.ts)，WebAuthn 行为位于
[`src/passkey.ts`](./src/passkey.ts)。

### 同步

所有 HTTP 同步端点需要 bearer 认证：
`Authorization: Bearer <jwt-token>`。WebSocket 端点使用 `token` 查询参数中的
同一完整访问权限、365 天 JWT；它不是更窄的仅 WebSocket 凭证。

#### 1. 上传操作

向服务器发送新变更。

```http
POST /api/sync/ops
```

#### 2. 下载操作

获取其他设备的变更。

```http
GET /api/sync/ops?sinceSeq=123
```

#### 3. 同步状态（诊断）

检查同步状态与存储信息。生产客户端不使用 — 供运维/调试使用。

```http
GET /api/sync/status
```

## 客户端配置

在 Super Productivity 中，将自定义同步提供商配置为：

- **Base URL**：`https://sync.your-domain.com`（或你的部署 URL）
- **Auth Token**：登录获得的 JWT 令牌

## 维护

### 脚本

服务器包含管理任务脚本。这些脚本使用已配置的数据库。

```bash
# Delete a user account
npm run delete-user -- user@example.com

# Clear sync data (preserves account)
npm run clear-data -- user@example.com

# Clear ALL sync data (dangerous)
npm run clear-data -- --all
```

## API 细节

稳定的端点用途与服务器不变量记录在
[服务器架构](./docs/architecture.md)。请求与响应形状由可执行路由拥有：同步线格式
位于 [`packages/shared-schema/src/supersync-http-contract.ts`](../shared-schema/src/supersync-http-contract.ts)，
认证 schema 与路由并列于 [`src/api.ts`](./src/api.ts)。

## 安全特性

| 特性                           | 实现                                                           |
| ------------------------------ | -------------------------------------------------------------- |
| **认证**                       | 通行密钥或魔法链接登录，签发 JWT bearer 令牌                   |
| **枚举抗性**                   | 中性邮件流响应与哑通行密钥选项                                 |
| **输入校验**                   | 校验操作 ID、实体 ID、schema 版本                              |
| **速率限制**                   | 路由特定的认证限制与每用户同步限制                             |
| **向量时钟净化**               | 共享 schema 限制；仅在冲突检测之后修剪                         |
| **实体类型白名单**             | 防止注入无效实体类型                                           |
| **请求去重**                   | 五分钟进程缓存加上持久的操作 ID 唯一性                         |
| **整账户 JWT 撤销**            | 令牌版本控制，配合 30 秒进程本地认证缓存                       |

## 多实例部署注意事项

自带 Helm chart 刻意将 SuperSync 限制为单副本。自定义多实例部署必须在提供相同
保证之前解决以下进程本地状态。

### 认证缓存与撤销

**问题**：成功的 JWT 验证会将账户的验证与令牌版本状态在每个进程中缓存 30 秒。
令牌版本写入仅使执行该写入的进程失效。

**影响**：在令牌替换、通行密钥恢复或账户删除之后，不同副本最多可在剩余缓存
TTL 内接受先前缓存的 JWT。令牌替换与通行密钥恢复也会强制关闭该账户的
WebSocket 连接，但仅限处理该请求的实例所持有的连接 — 在其他副本上，已撤销设备的
套接字会继续接收操作通知（仅元数据，无操作数据），直到下次重连尝试失败。

**多实例解决方案**：使用共享失效或集中验证。一致的每账户路由可降低暴露，
但不是共享失效的通用替代。

### 通行密钥挑战存储

**问题**：WebAuthn 挑战存储在内存 Map 中，跨实例无效。

**症状**：若挑战生成请求命中实例 A 而验证命中实例 B，通行密钥注册/登录会失败。

**多实例解决方案**：

- 实现共享挑战存储
- 或对完整 WebAuthn 仪式使用粘性会话

**当前状态**：生产环境若使用内存存储，启动时会记录警告。

### 快照生成锁

**问题**：防止并发快照生成使用内存 Map。

**症状**：同一用户可能在不同实例上触发重复的快照计算。

**影响**：仅性能（无数据损坏）— 快照是确定性的。

**多实例解决方案**：

- 实现 Redis 分布式锁（可选，仅出于性能）

### 请求与配额协调

**问题**：请求结果去重、进行中的存储对账，以及强制存储对账标记均为进程本地。

**影响**：路由到另一实例的重试可能被重新计算，尽管持久的操作 ID 唯一性仍会防止
同一操作被插入两次。强制存储计数器对账信号不会在进程重启或迁移到另一实例后保留，
因此后续精确对账必须自愈任何漂移。

### 单实例部署

对于单实例部署，这些限制的跨实例部分不适用。进程重启仍会清除内存协调状态。

## 安全说明

- **将 JWT_SECRET** 设为生产环境中的安全随机值（最少 32 字符）。
- **将邮箱验证、登录与恢复链接视为凭证。** 其令牌目前以明文存储。过期可防止使用，
  但不是通用的自动删除边界：记录在其流程消费或显式拒绝时清除，或在后续请求覆盖时清除；
  过期的验证令牌可能仍保留在存储中。参见
  [认证架构](./docs/authentication.md#email-tokens-are-bearer-secrets)。
- **生产环境使用 HTTPS 与 WSS。** 每个反向代理日志配置都必须从访问日志与请求失败/错误日志中
  省略敏感查询值与携带令牌的 `Referer` 头。
  登录与恢复页面还必须发出 `Referrer-Policy: no-referrer`，以免同源子请求复制其携带凭证的 URL。
  [自带 Caddy 配置](./Caddyfile) 会替换完整的已记录查询后缀，从两条 Caddy 日志路径丢弃
  `Referer`，并提供响应策略。应用错误日志同样替换其完整查询后缀。自定义设置必须提供等效保护。
  参见 [认证架构](./docs/authentication.md) 了解为何这是完整访问权限、365 天凭证。
- **生产环境限制 CORS 来源。**
- **生产部署建议进行数据库备份。**
