# 发布与上架操作手册

> **状态：** 维护中
>
> **相对 workflow 最后核实：** 2026-07-29

GitHub Actions workflow 是可执行的权威来源。每当其触发器、渠道、产物或 secret 名称变更时，在同一改动中更新本手册。

## 发布边界

发布有两个不同边界：

1. **推送 `v*` tag：** 构建产物并创建草稿 GitHub release。最终 tag（`vX.Y.Z`，无 `-`）还会上传并提交 iOS 与 Mac App Store 构建以供审核，并在 Apple 批准后自动发布。即使 GitHub release 仍是草稿，也应将最终 tag 视为影响生产。
2. **发布 GitHub release：** 触发部署 Web 应用并发布或提升其他分发渠道的 release-event workflow。

不要仅为测试构建而发布草稿。在支持处使用预发布 tag 或 workflow 的手动 dispatch。

## 准备版本

从干净、当前的发布提交开始，并选择合适的语义版本：

```bash
npm version patch
```

适当时使用 `minor`、`major` 或显式预发布版本。`version` 生命周期会更新 Android 版本、生成 `build/release-notes.md`、写入带版本的 Google Play changelog、暂存变更，并创建 npm 版本提交与 tag。

推送任何东西之前：

1. 审查版本提交与 tag。
2. 阅读 `build/release-notes.md`，检查准确性与用户数据/隐私泄漏。
3. 对最终发布，确认生成的 Android changelog 存在于 `android/fastlane/metadata/android/en-US/changelogs/`。
4. 运行相关发行说明测试：

   ```bash
   npm run release-notes:test
   ```

5. 确认工作树干净。

若生成文件有误，停止并在推送前修复本地版本提交与 tag。绝不要移动已到达远程的发布 tag。

一起推送已审查的版本提交与恰好打算的那个 tag。用 `npm version` 创建的 tag 替换占位符；不要使用 `--follow-tags`，它可能包含其他可达的 annotated tag。

```bash
git push --atomic origin HEAD "vX.Y.Z"
```

## Tag 会触发什么

| 产出                                                      | Workflow                                                      | 最终 tag                                        | 含 `-` 的 tag      |
| --------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| 草稿 GitHub release 与 Linux/macOS/Windows 桌面资源       | `.github/workflows/build.yml`                                 | 构建                                            | 构建               |
| Android APK 与 GitHub release 资源                        | `.github/workflows/build-android.yml`                         | 上传到 Play `internal` 并附加 APK               | 仅构建/附加        |
| iOS App Store                                             | `.github/workflows/build-ios.yml`                             | 上传并提交审核                                  | 仅上传             |
| Mac App Store                                             | `.github/workflows/build-publish-to-mac-store-on-release.yml` | 上传并提交审核                                  | 仅上传             |
| Microsoft Store `.appx`                                   | `.github/workflows/build-create-windows-store-on-release.yml` | 构建产物供手工 Partner Center 上传              | 构建产物           |

Apple 的详细提交行为、API key 要求与恢复情形见 [Apple 发布自动化](apple-release-automation.md)。

桌面 workflow 的草稿/预发布标志检测与 Apple workflow 使用的规则并不完全相同。发布预发布前，请明确确认 GitHub 将草稿标记为预发布。

## 发布草稿前验证

等待每个 tag workflow 到达终态。至少验证：

- 草稿 release 正文包含预期说明；
- 预期的 Linux、macOS、已签名 Windows、Android 与 Snap 资源存在；
- Windows 签名通过验证；
- Android 最终构建到达 Play `internal` 轨道；
- Apple 上传/提交具有预期的最终 vs 预发布行为；以及
- 若更新该渠道，Microsoft Store 产物与 `WinStoreReleaseNotes` 产物存在。

不要在必需 workflow 变红时强行发布。先诊断，或有意从发布范围中移除受影响渠道。

## 发布 GitHub release 会触发什么

对非预发布 release，发布草稿会启动：

| 渠道        | Workflow                                                    | 结果                                            |
| ----------- | ----------------------------------------------------------- | ----------------------------------------------- |
| Google Play | `.github/workflows/auto-publish-google-play-on-release.yml` | 将 `internal` 提升到 `production`               |
| Snap Store  | `.github/workflows/build-publish-to-snap-on-release.yml`    | 将 release Snap 发布到 `edge` 与 `stable`       |
| Web 应用    | `.github/workflows/build-update-web-app-on-release.yml`     | 构建并部署生产 Web 资源                         |
| Docker Hub  | `.github/workflows/publish-to-hub-docker.yml`               | 构建并发布应用镜像                              |

Docker Hub workflow 对任何已发布的 GitHub release 都会运行，且不含 Web、Play、Snap workflow 使用的预发布守卫。发布预发布前请考虑这一点。

Microsoft Store 上传仍为手工：下载 `WinStoreRelease` 产物，并在 Partner Center 使用 workflow 摘要/产物中生成的发行说明。

## 持续渠道

- 普通 `master` 推送会构建桌面产物、将开发 Android 构建上传到 Play `internal` 轨道，并将分支 Snap 发布到 `edge`。
- 更改 SuperSync 服务器输入的 `master` 推送会发布 `ghcr.io/super-productivity/supersync:latest`；此镜像不按 release 打 tag。
- 预发布与手动 Apple workflow 上传构建但不提交 App Review。提议的额外分支行为见 [TestFlight 计划](plans/2026-07-14-ios-testflight-master-builds.md)；那不是当前行为。

## 凭证与签名

绝不要在文档中放入 secret 值。workflow 引用是 secret 名称的权威来源。主要运维组为：

- Android 签名与 Play：`DROID_KEYSTORE_PASSWORD`、`DROID_KEYSTORE_ALIAS`、`DROID_KEY_PASSWORD`、`DROID_KEYSTORE_BASE_64` 与 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`。
- Apple 签名与 App Store Connect：见 [Apple 发布自动化](apple-release-automation.md)、[Mac App Store 签名](mac-app-store-code-signing-guide.md) 与 [证书续期](update-mac-certificates.md)。
- Windows 签名：`SIGNPATH_API_TOKEN` 与 `SIGNPATH_ORGANIZATION_ID`；project、signing-policy 与 artifact-configuration slug 固定在 `.github/workflows/build.yml`。
- Snap：`SNAPCRAFT_STORE_CREDENTIALS`；见 [凭证刷新](howto-refresh-snap-credentials.md)。
- Web、Docker Hub 与 Microsoft Store 凭证在对应 workflow 的确切使用处命名。

## 商店列表资源

除非某 workflow 明确另有说明，截图、描述及其他商店列表资源仍为手工。商店要求会变；使用当前 App Store Connect、Google Play Console 或 Partner Center 要求，而不是从本仓库复制旧像素尺寸。上传前扫描发行说明与资源中的仅开发标签、密钥与个人数据。

## 失败与回滚

- 上传后失败的 Apple lane 可能需要新构建号或在 App Store Connect 中手工完成。遵循 [Apple 发布自动化](apple-release-automation.md#注意事项)。
- 在预期构建已在 `internal` 上之后，可对手动调度 Play 提升 workflow 做仅 Android 发布。
- 可用已有 release tag 手动调度 Snap 发布。
- 发布 GitHub release 会快速扇出。若只需移动一个渠道，使用该渠道支持的手动 workflow，而不是发布宽泛 release。
- 在发布讨论中记录 release URL 以及任何有意跳过或手工完成的渠道。
- 失败的 SignPath 步骤只打印连接器返回的内容，可能是无细节的裸 `Invalid request to SignPath API.`（v18.20.0，run 31883046355）。workflow 日志无法再说更多：在 SignPath Web UI 中诊断，签名请求记录带有真实原因。SignPath 的字节额度是年度配额，不是每次请求限制：把相同可执行文件拆到多个请求不会节省配额。v18.20.0 请求在旧流水线提交六个可执行文件（约 892 MB）并耗尽额度后被拒。workflow 现在在检查 x64 与 arm64 载荷均已嵌入后，只提交通用安装程序与便携版（约 448 MB）。它仅在签名后创建旧的架构特定下载名，因此那些兼容性副本不消耗签名配额。
- 减小新请求不会恢复已消耗的配额。在 SignPath 组织页查看活跃配额周期与剩余字节；必要时向 SignPath 申请例外或等待周期重置。同时核实 `SIGNPATH_API_TOKEN` 有效，且 `super-productivity` 项目、`release-signing` 策略与 `github-zip-pe` 产物配置在那些确切 slug 下仍存在，以及 GitHub 受信构建系统已获组织授权。若这些检查无法解释拒绝，将 run URL 与提交时间戳报告给 SignPath 支持，以便他们检查服务端请求记录。
- Windows 签名仅在 `v*` tag 上运行，因此签名修复只能通过重跑 `windows-bin` 或推送预发布 tag 来演练。绝不要移动已发布 tag 以重新测试。
