# 仅在线模式（兼容模式）配置

**仅在线模式（兼容模式）**允许 Super Productivity Android 应用连接到生产服务器、本地开发服务器或自托管服务器。该模式需要互联网连接，并兼容多种服务器配置。

**注意**：虽然仅在线模式可连接生产、本地开发或自托管服务器，但强烈建议使用最新的**无网络依赖模式**以获得更稳定可靠的体验。无网络依赖模式可在无互联网的情况下使用应用，确保持续生产力、增强隐私并降低延迟。

更多信息请参阅**[无网络依赖模式文档（推荐）](./README_OFFLINE.md)**。

若你需要在线功能或必须连接到特定服务器，请按下方步骤配置仅在线模式。

## 将启动模式设为在线

要启用仅在线模式，请在 `app_config.properties` 文件中将 `LAUNCH_MODE` 设为 `1` 或 `0`。

- **1**：强制仅在线模式（兼容模式）
- **0**：默认行为（从 SharedPreferences 读取）

**建议**：将 `LAUNCH_MODE` 设为 `0` 以使用默认行为。应用将采用默认行为，可能会尝试从 SharedPreferences 读取，并在可用时连接在线服务。

### 配置选项

1. **启动模式（`LAUNCH_MODE`）**

   ```properties
   LAUNCH_MODE=1
   ```

   - **0**：默认行为（从 SharedPreferences 读取）
   - **1**：强制仅在线模式（兼容模式）
   - **2**：强制无网络依赖模式（用于离线配置）

2. **使用生产 URL**

   - **条件**：适用于 `LAUNCH_MODE` 设为 `1`，或设为 `0` 且用户从旧版本升级的情况。
   - **默认**：`https://app.super-productivity.com`
   - **配置**：确保 `ONLINE_SERVICE_IS_LOCAL` 设为 `false`。

   ```properties
   ONLINE_SERVICE_IS_LOCAL=false
   ```

3. **使用本地开发服务器**

   - **条件**：适用于 `LAUNCH_MODE` 设为 `1`，或设为 `0` 且用户从旧版本升级的情况。
   - **配置**：将 `ONLINE_SERVICE_IS_LOCAL` 设为 `true` 并启动本地服务器。

   ```properties
   ONLINE_SERVICE_IS_LOCAL=true
   ```

   - **启动本地服务器**

     ```bash
     ng serve --disable-host-check --host 0.0.0.0 --port 4200 --live-reload --watch
     ```

   - **访问 URL**：`http://10.0.2.2:4200`（可从 Android Studio 模拟器及模拟器内的 Chrome 浏览器访问）。

4. **使用自托管服务器**

   - **条件**：适用于 `LAUNCH_MODE` 设为 `1`，或设为 `0` 且用户从旧版本升级的情况。
   - **配置**：将 `ONLINE_SERVICE_IS_LOCAL` 设为 `false`，并更新 `ONLINE_SERVICE_HOST` 与 `ONLINE_SERVICE_PROTOCOL`。

   ```properties
   ONLINE_SERVICE_IS_LOCAL=false
   ONLINE_SERVICE_HOST=your.server.address
   ONLINE_SERVICE_PROTOCOL=https
   ```

## 如何修改 URL

你可以通过修改项目根目录下的 `app_config.properties` 文件来编辑 web view 加载的 URL。这样即可在生产服务器、本地开发服务器或自托管服务器之间轻松切换。

### 相关设置

- **`LAUNCH_MODE`**：

  - `0`：默认行为（从 SharedPreferences 读取）
  - `1`：强制仅在线模式
  - `2`：强制无网络依赖模式

- **当 `LAUNCH_MODE` 为 `1` 或 `0`（且已升级）时**：
  - **`ONLINE_SERVICE_IS_LOCAL`**：
    - `true`：从本地开发服务器加载（`http://10.0.2.2:4200`）。
    - `false`：从生产或自托管服务器加载。
  - **`ONLINE_SERVICE_HOST`**：
    - 定义服务器地址。
  - **`ONLINE_SERVICE_PROTOCOL`**：
    - `http` 或 `https`。

## 重要说明

- **本地修改**：`app_config.properties` 文件仅供本地修改。**请勿提交**该文件，除非你对更改有十足把握。
- **切换服务器**：通过配置这些属性，你可以在默认、在线与离线启动行为之间无缝切换，而无需直接修改 Kotlin 源文件，从而改善开发流程并提供部署灵活性。
