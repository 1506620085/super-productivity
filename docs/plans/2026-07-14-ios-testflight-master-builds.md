# 实现计划：从 `master` 构建内部 TestFlight

**状态：** 仅计划 · **日期：** 2026-07-14
**难度：** 中等。约需一个工程日，拆成两处小改动，外加 Apple 处理与测试者验证时间。

## 结果与范围

使用现有 iOS 签名/归档工作流，将最新合格的 `master` 状态发送到内部 TestFlight
组。快速连续推送会合并：一个 beta 可运行，仅最新的取代性 beta 等待。这有意不为
每个中间 SHA 各产出一个 TestFlight 构建。

生产行为保持基于事件：最终 `v*` 标签推送仍提交现有 iOS 发布以供审核，预发布
标签推送仍仅上传，手动调度永远不能提交到生产。Master 构建标记为
**TestFlight Internal Only**，因此 Apple 不能将其提供给外部测试者或客户。

范围外：外部 TestFlight、应用改动、新依赖，以及现有的 iOS/macOS App Store
审核提交竞态。没有新的应用级上传队列；仅内部 beta 路径既不编辑 App Store
元数据，也不开启审核。

## 路由契约

| 事件                                  | 导出                   | Fastlane lane | 生产提交 |
| -------------------------------------- | ------------------------ | ------------- | ----------------- |
| 推送到 `master`                       | TestFlight Internal Only | `ios beta`    | Never             |
| 推送最终 `v*` 标签                 | App Store Connect        | `ios release` | Yes               |
| 推送预发布 `v*` 标签            | App Store Connect        | `ios release` | No                |
| 手动调度，默认 `beta` 模式   | TestFlight Internal Only | `ios beta`    | Never             |
| 手动调度，`release-upload-only` | App Store Connect        | `ios release` | Never             |

生产守卫必须包含事件类型，而不仅是 ref：

```yaml
SUBMIT_FOR_REVIEW: >-
  ${{ github.event_name == 'push'
      && startsWith(github.ref, 'refs/tags/v')
      && !contains(github.ref, '-') }}
```

手动 beta 调度仅允许从 `master`。显式的 `release-upload-only` 模式保留工作流
当前的手动上传能力，而不继承其最终标签提交的隐患。

## Phase 0：Apple 与版本前置条件

- 创建一个内部测试者组，添加预期的 App Store Connect 用户，并启用自动分发。
  接受合格标签上传也会到达该组，因为自动分发是应用/组配置，与 Git ref
  无关。
- 创建专用的 App Store Connect **团队** API 密钥，角色为 Developer，用于 beta
  上传。将其存为 `ASC_*` 密钥，放在仅限 `master` 的 `internal-testflight`
  GitHub 环境中，无审核者门控。团队密钥不能按应用限定范围；独立的较低角色
  密钥可降低权限与凭证复用，但仍具有团队范围的上传访问权。
- 在发布路由上保留现有的 App Manager 密钥。仅记录密钥名称、角色和证书/
  描述文件过期信息——切勿记录密钥或测试者内容。
- 在固定的 Xcode 26.2 runner 上，确认 `xcodebuild -help` 支持
  `testFlightInternalTestingOnly` 导出选项，且当前预配描述文件可导出该分发
  类型。
- 在启用无人值守构建前，用 `agvtool`、归档的 IPA 和 Apple 验证下方构建号
  示例。

## Increment A：添加安全的手动 beta 路径

尚不添加 `master` 推送触发器。

### Fastlane

在 `fastlane/Fastfile` 中添加 `ios beta`。它需要 `IPA_PATH` 与现有 `ASC_*`
契约，调用 `upload_to_testflight`，并显式设置这些选项：

```ruby
skip_submission: true
skip_waiting_for_build_processing: false
distribute_external: false
submit_beta_review: false
wait_processing_timeout_duration: 1800
```

不要传递测试者组、changelog 或通知选项。App Store Connect 的自动组拥有内部
分发。处理超时意味着「上传成功，处理状态未知」；重试前先检查 App Store
Connect。切勿盲目重新上传同一 IPA。

### 工作流与版本控制

将 `.github/workflows/build-ios.yml` 重构为一个构建作业与条件性的 beta 和
发布上传作业：

- 添加 `workflow_dispatch.mode`，以 `beta` 为安全默认，另一选项为
  `release-upload-only`。
- 设置顶层 `permissions: contents: read`。
- beta 运行以 `testFlightInternalTestingOnly: true` 导出；标签与手动发布
  上传保持当前 App Store Connect 导出。
- 在发布路由上保留精确剥离的 `package.json` 营销版本。
- 对于 beta，将 `CFBundleShortVersionString` 设为
  `incrementPatch(max(stripPrerelease(package.version), highest stable vX.Y.Z tag))`。
  拉取标签并以严格三整数比较实现，不引入依赖。该未来列车必须大于最新已批准
  的 iOS 版本，包括刚发布之后。
- 在每条路由上将 `CFBundleVersion` 精确设为
  `$(date -u +%Y%m%d%H%M).${GITHUB_RUN_NUMBER}.${GITHUB_RUN_ATTEMPT}`。
  这仍高于旧的时间戳值，并区分同一分钟的运行与重跑。
- 在每个相关目标与导出的 IPA 中验证这两个值。同时确认是否必须添加
  `VERSIONING_SYSTEM = apple-generic` 才能获得可靠的 `agvtool` 行为。
- 将证书/描述文件安装移至导出前一刻；归档已是未签名的。在每次 master
  构建上复用共享的 Apple Distribution 证书仍是可接受的残余风险。
- 使用固定版本的 artifact actions、按 run/attempt 特定的名称、
  `if-no-files-found: error`、干净的下载目录，以及 beta artifact 一天保留期，
  在作业间精确传递一个 IPA。除非恰好存在一个常规 `.ipa`，否则上传作业必须
  失败。
- 仅将 beta 上传作业绑定到 `internal-testflight`；发布凭证留在现有发布路径。
  切勿启用 verbose fastlane 输出。

为完整的 beta 构建/上传生命周期添加工作流级并发：beta 运行共享固定组，
`cancel-in-progress: false` 与 `queue: single`，保留正在运行的运行且仅保留
最新的待定运行。标签与手动发布运行使用 run/attempt 特定组，因此 master
推送不能合并它们。

### 静态验证

- `ruby -c fastlane/Fastfile`
- 在 macOS runner 上 `bundle exec fastlane lanes`
- `npx prettier --check .github/workflows/build-ios.yml`
- `git diff --check`
- 用旧时间戳构建、两次同一分钟运行、一次重跑、预发布 package 版本，以及
  比 package 更新的稳定标签，演练版本计算。
- 审查路由表中的每种情况，并确认 `master` 推送触发器不存在。
- 确认未添加依赖或密钥内容。

## Increment 之间的实况门控

合并 Increment A，然后从 `master` 手动调度一次 `beta`。在以下全部为真之前
不要继续：

- Apple 接受并完成处理预期的 version/build 对。
- App Store Connect 显示 **Internal** 指示，且不允许外部或客户分发。
- 自动内部组收到它，且一名测试者可以安装并启动。
- 未创建或更改任何外部 Beta App Review、App Review 提交、App Store 版本或
  发布元数据。
- 日志与 artifact 未暴露签名或 API 密钥材料。

仅记录 Actions URL、非敏感的 version/build 对、时长与结果。

## Increment B：启用 `master` 并记录运维

添加分支触发器，同时保留现有标签触发器：

```yaml
push:
  branches: [master]
  tags: ['v*']
```

更新 `docs/release-and-publishing.md`、`docs/apple-release-automation.md` 与
`.github/SECURITY-SETUP.md`，写入路由表、仅内部边界、凭证、version/build
公式、合并、超时恢复与回滚。

合并后，确认一次正常的 `master` 推送成功上传。紧挨着启动三次 beta 调度，
验证活动运行完成、中间待定运行被取代、最新待定运行继续。失败的 Apple
上传/处理结果必须使 Actions 变红。

下一次打标签发布是后续观察项，不是激活阻塞项：

- 验证发布 lane 与提交行为未变；
- 预期自动内部组会收到合格的发布构建；以及
- 在其达到 Ready for Distribution 后，验证下一次 master beta 前进到下一个
  patch 列车且 Apple 接受它。

## 成本、回滚与风险

每个在合并后存活的 beta 大约消耗 10–15 分钟 macOS runner，外加一次签名 IPA
上传。第一周跟踪 `accepted beta runs × duration` 与 artifact 存储。保持
一天 beta artifact 保留；仅当成本/噪声实质显著时，才考虑经证明安全的
仅文档路径过滤。

回滚是移除 `master` 分支触发器，同时保留手动 beta 模式。若必须停止已分发
构建，使用 App Store Connect **Expire Build**；禁用自动组分发会影响未来
分配，但不会收回已安装的构建。Apple 接受新 version/build 方案后继续保留它。

| 风险                                                  | 缓解                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Beta 到达外部测试或生产           | 仅内部导出加上失败即关闭的 beta lane                                             |
| 发布后 beta 因旧版本被拒     | 基于 package 与稳定标签的未来 patch 列车；强制发布后检查           |
| 快速推送造成成本与 TestFlight 噪声         | 工作流级 beta 合并与一天 artifact                                         |
| 手动/标签路由提交错误构建            | 显式模式、事件类型生产守卫、路由表审查                           |
| 生产凭证暴露增加                  | 专用 Developer beta 密钥；发布密钥留在发布作业；受保护的 master/CODEOWNERS |
| 每次 master 构建增加签名身份暴露 | 仅在导出时安装，限制工作流更改，接受并记录证书复用    |
| 上传后 Apple 处理超时               | 先检查 App Store Connect；仅在需要重试时用新编号重建      |

## 实现时需复核的参考

- [Apple: Distributing beta builds](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [Apple: Internal testers and internal-only builds](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)
- [Apple: Build/version identifiers](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleversion)
- [Apple: Marketing-version identifiers](https://developer.apple.com/documentation/bundleresources/information-property-list/cfbundleshortversionstring)
- [fastlane: `upload_to_testflight`](https://docs.fastlane.tools/actions/upload_to_testflight/)
- [GitHub Actions: concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
