# 添加 Issue 集成

新的外部 issue 与日历集成应为 **issue-provider 插件**。
除非维护者已批准插件 API 无法满足的仅核心需求，否则不要向 `src/app/features/issue/providers/` 添加新的内置提供方。

公共 TypeScript 定义为权威来源：

- [`packages/plugin-api/src/issue-provider-types.ts`](../packages/plugin-api/src/issue-provider-types.ts)
- [`packages/plugin-api/src/types.ts`](../packages/plugin-api/src/types.ts)

以当前打包的提供方为实现参考：

- [GitHub](../packages/plugin-dev/github-issue-provider/)：搜索、评论、待办导入与字段同步
- [Google Calendar](../packages/plugin-dev/google-calendar-provider/)：OAuth、议程字段与事件回写
- [CalDAV](../packages/plugin-dev/caldav-calendar-provider/)：文本响应、非标准 HTTP 动词，以及已批准的私有网络提供方

通用插件打包、UI、权限与安全见 [插件开发](plugin-development.md)。

## 1. 创建插件包

仓库拥有的提供方通常位于 `packages/plugin-dev/<provider-name>/`：

```text
<provider-name>/
├── package.json
├── scripts/build.js
├── src/
│   ├── manifest.json
│   ├── plugin.ts
│   └── icon.svg
└── *.spec.ts
```

将提供方 API 类型与映射逻辑保留在包内。不要把提供方加到核心 issue-provider 联合类型、默认值、表单或 Angular 服务中。

最小 manifest：

```json
{
  "id": "example-issue-provider",
  "name": "Example Issues",
  "version": "1.0.0",
  "manifestVersion": 1,
  "minSupVersion": "18.0.0",
  "description": "Connects Example issues to Super Productivity",
  "type": "issueProvider",
  "icon": "icon.svg",
  "iFrame": false,
  "permissions": ["http"],
  "hooks": [],
  "issueProvider": {
    "pollIntervalMs": 600000,
    "icon": "extension",
    "humanReadableName": "Example",
    "issueStrings": {
      "singular": "Issue",
      "plural": "Issues"
    }
  }
}
```

新提供方省略 `issueProvider.issueProviderKey`。宿主会分配 `plugin:<plugin-id>`。该字段保留给迁移既有内置键及其持久化配置的仓库托管插件。

## 2. 注册提供方

`IssueProviderPluginDefinition` 基于 Promise。实现当前确切类型，而不是把方法列表抄进插件：

```typescript
import type {
  IssueProviderPluginDefinition,
  PluginHttp,
  PluginIssue,
  PluginSearchResult,
} from '@super-productivity/plugin-api';

declare const PluginAPI: {
  registerIssueProvider(definition: IssueProviderPluginDefinition): void;
};

const API = 'https://api.example.com';

PluginAPI.registerIssueProvider({
  configFields: [
    {
      key: 'workspace',
      type: 'input',
      label: 'Workspace',
      required: true,
    },
  ],

  getHeaders(): Record<string, string> {
    return { Accept: 'application/json' };
  },

  async searchIssues(
    searchTerm: string,
    config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginSearchResult[]> {
    const workspace = String(config.workspace);
    return http.get<PluginSearchResult[]>(`${API}/workspaces/${workspace}/issues`, {
      params: { query: searchTerm },
    });
  },

  async getById(
    issueId: string,
    _config: Record<string, unknown>,
    http: PluginHttp,
  ): Promise<PluginIssue> {
    return http.get<PluginIssue>(`${API}/issues/${encodeURIComponent(issueId)}`);
  },

  getIssueLink(issueId: string): string {
    return `https://example.com/issues/${encodeURIComponent(issueId)}`;
  },

  issueDisplay: [
    { field: 'title', label: 'Title', type: 'link', linkField: 'url' },
    { field: 'state', label: 'State', type: 'text' },
    { field: 'body', label: 'Description', type: 'markdown', hideEmpty: true },
  ],
});
```

必填契约为 `configFields`、`getHeaders`、`searchIssues`、`getById`、`getIssueLink` 与 `issueDisplay`。可选能力包括连接测试、评论、待办导入、字段映射、创建/更新/删除，以及日历时间块操作。只添加提供方实际支持的能力。

提供方请求使用 `PluginHttp` 参数。它返回 Promise，应用提供方 headers，并限制方法与超时。其初始 URL 检查默认拒绝已知元数据主机、常见本地主机名与字面私有 IP。它不会在请求前解析主机名或重新校验重定向目标，且 issue-provider 请求当前会跟随重定向。使用你信任的固定 HTTPS API 源；不要把 `PluginHttp` 当作完整 SSRF 边界。`allowPrivateNetwork` 仅对受信打包插件生效，且只应在自托管提供方需要时启用。

`manifest.allowedHosts` 约束的是单独的 `PluginAPI.request` 方法；不约束传给 issue-provider 方法的 `PluginHttp`。在 Web 与桌面端，`PluginAPI.request` 拒绝重定向；原生请求仍可跟随，且任何平台都不会重新校验主机名解析。

## 3. 处理凭证

### OAuth

同时声明 `"oauth"` 与 `"http"` 权限，并添加带 `OAuthFlowConfig` 的 `oauthButton` 字段。宿主启动适合平台的 OAuth 流程并存储所得 token。提供方方法异步取回：

```typescript
declare const PluginAPI: {
  getOAuthToken(): Promise<string | null>;
};

async function getHeaders(): Promise<Record<string, string>> {
  const token = await PluginAPI.getOAuthToken();
  if (!token) throw new Error('Connect the account first.');
  return { Authorization: `Bearer ${token}` };
}
```

桌面、Android、iOS、scope 与 PKCE 配置见 Google Calendar 提供方。嵌入插件源码或配置中的 `clientSecret` 并非机密。仅当提供方明确将该客户端视为公开时才包含；绝不要提交机密 OAuth secret。

### API token 与密码

不要仅因字段使用 `type: "password"` 就把密钥存进已同步的插件数据或提供方配置；那只是 UI 遮罩。插件管理的凭证设置应使用本地、按插件的 secret API：

```typescript
await PluginAPI.setSecret('api-token', token);
const token = await PluginAPI.getSecret('api-token');
await PluginAPI.deleteSecret('api-token');
```

这些值按设备隔离，且排除在 Super Productivity 同步、导出与备份之外。目前静态未加密，因此这是隔离边界，不是硬件加固安全存储。用户必须在每台设备上重新输入密钥。

绝不要记录 token、授权头、含用户内容的响应体或 issue 标题。

## 4. 有意映射数据

- 将远程 ID 规范为字符串。
- 显式转换时间戳，并测试时区/全天行为。
- 仅返回 `PluginSearchResult` 与 `PluginIssue` 所需字段。
- 仅为安全、可逆语义定义 `fieldMappings`。当远程写行为出人意料时，将映射默认设为 `off` 或 `pullOnly`。
- 在提供方允许处使 create/update/delete 幂等。
- 处理限速、分页、已删除状态与部分 API 响应。
- 将提供方特定数据留在插件内，而不是扩展核心模型。

## 5. 打包并文档化仓库拥有的提供方

对打包提供方：

1. 将其构建加入 `packages/plugin-dev/scripts/build-all.js`。
2. 将构建输出复制到 `src/assets/bundled-plugins/<plugin-id>/`。
3. 将资源路径加到 `src/app/plugins/plugin.service.ts` 的打包列表。
4. 只添加英文字符串源；遵循既有插件 i18n 打包方式。
5. 在同一改动中更新 `docs/wiki/` 中的 issue-provider 对比。

上传的社区插件无需核心注册，并保留其 `plugin:<plugin-id>` 提供方键。

## 6. 验证

至少：

```bash
cd packages/plugin-dev/<provider-name>
npm run typecheck
npm test
npm run build
```

若包尚无测试脚本，为响应映射、认证失败、分页、日期与回写转换添加聚焦测试。然后运行仓库插件构建：

```bash
npm run plugins:build
```

在 Web、Electron 与每个声称的原生平台上手动验证配置、连接测试、搜索/导入、轮询，以及任何已启用的回写。

## 遗留核心提供方

既有内置提供方仍实现
[`IssueServiceInterface`](../src/app/features/issue/issue-service-interface.ts)，
其当前方法返回 Promise。修复既有内置提供方应遵循其既定文件夹与测试。

再添加一个核心提供方会产生永久的联合类型、配置状态、表单、迁移与同步兼容性。没有明确架构决策说明插件契约为何不足时，不要为新集成走那条路。
