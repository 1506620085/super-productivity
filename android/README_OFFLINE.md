# 无网络依赖模式配置

**无网络依赖模式**允许你在无互联网连接的情况下使用 Super Productivity Android 应用。该模式推荐给偏好本地使用的用户。

## 将启动模式设为无网络依赖

要启用无网络依赖模式，请在 `app_config.properties` 文件中将 `LAUNCH_MODE` 设为 `0`（新安装的默认值）或 `2`。

对于**全新安装**的用户，将 `LAUNCH_MODE` 设为 `2` 可确保应用默认以无网络依赖模式启动。这样可避免任何连接在线服务的尝试，从一开始就提供流畅的离线体验。

**重要**：若将 `LAUNCH_MODE` 设为 `0`，应用将使用默认行为，可能会尝试从 SharedPreferences 读取，并在可用时连接在线服务。为保持纯离线体验，新安装时请始终将 `LAUNCH_MODE` 设为 `2`。

## 在本地构建并运行 super-productivity-android

### 1. 克隆仓库

要设置项目，请克隆 `super-productivity` 仓库，而不是直接克隆 `super-productivity-android` 仓库。这样可确保包括 Android 项目在内的所有子模块都正确初始化。

```bash
git clone https://github.com/super-productivity/super-productivity.git
cd super-productivity
git submodule init
git submodule update
```

### 2. 编译 Node.js 项目

确保已安装 Node.js 和 npm。进入 `super-productivity` 项目的根目录并安装必要依赖。

```bash
npm install
```

### 3. 编译 Android 项目

在根目录下，使用以下命令编译 Android 项目：

- **测试构建：**

  ```bash
  npm run dist:android
  ```

- **生产构建：**

  ```bash
  npm run dist:android:prod
  ```

### 4. 安装

你可以使用 Android Studio 或 npm 脚本安装已编译的 Android 应用。

- **使用 Android Studio：**

  1. 打开 Android Studio。
  2. 选择 `Open an existing project`。
  3. 导航到已克隆仓库中的 `android` 目录。
  4. 按提示在设备或模拟器上构建并运行应用。

- **使用 NPM 脚本：**

  - **测试安装：**

    ```bash
    npm run install:android
    ```

  - **生产安装：**

    ```bash
    npm run install:android:prod
    ```

## 补充说明

- **本地修改**：`app_config.properties` 文件仅供本地修改。**请勿提交**该文件，除非你对更改有十足把握。
- **无需额外配置**：无网络依赖模式除将 `LAUNCH_MODE` 设为 `0` 或 `2` 外，无需进一步配置。

更多信息请参阅[主 README](./README.md)。
