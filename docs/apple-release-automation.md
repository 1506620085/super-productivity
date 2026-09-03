# Apple（iOS 与 macOS）发布自动化

版本准备、草稿发布门控以及非 Apple 分发渠道，见[发布与上架操作手册](release-and-publishing.md)。

推送最终版本 tag（`vX.Y.Z`）会构建、签名、上传**并提交** iOS 与 macOS App Store 构建以供审核，并在 Apple 批准后自动发布。唯一未自动化的步骤是 Apple 的人工审核。

## 流水线

| 目标                                               | Workflow                                                      | 产出                           |
| -------------------------------------------------- | ------------------------------------------------------------- | ------------------------------ |
| iOS App Store                                      | `.github/workflows/build-ios.yml`                             | `.ipa` → App Store Connect     |
| Mac App Store                                      | `.github/workflows/build-publish-to-mac-store-on-release.yml` | MAS `.pkg` → App Store Connect |
| Mac 直接下载（已公证 DMG/zip，自动更新）           | `.github/workflows/build.yml`（`mac-bin`）                    | GitHub release 资源            |

在 tag 推送时，每个 workflow 构建并签名产物，然后运行 fastlane lane（`fastlane/Fastfile`，`ios release` / `mac release`），其会：

1. 将产物上传到 App Store Connect。Apple 的二进制校验在上传过程中内联运行（这替代了先前独立的 `altool --validate-app` 步骤）。
2. 仅推送「What's New」发行说明（由 `tools/prepare-appstore-release-notes.js` 从 `build/release-notes.md` 派生）。lane 将 `metadata_path` 指向**仅**含 `<locale>/release_notes.txt` 的目录；deliver 只读该文件并跳过其他所有字段（无远程回读），因此在 App Store Connect 中手工维护的描述、关键词、截图等保持不动。（故意**不**设置 `skip_metadata`——否则 deliver 会完全不上传说明。）
3. 等待 App Store Connect 完成处理该构建。
4. 以**批准后自动发布**提交该版本审核。

`build/release-notes.md` 是发布时重新生成的已提交快照（见 `tools/release-notes.js`）。若推送 tag 时该文件未为新版本刷新，会静默上传过时说明——确保发行说明提交在打 tag 之前落地。

### 提交 vs 仅上传

`SUBMIT_FOR_REVIEW` 每次运行计算为
`startsWith(github.ref, 'refs/tags/v') && !contains(github.ref, '-')`：

- **最终 tag**（`vX.Y.Z`，无连字符）→ 上传**并**提交审核。
- **预发布 tag**（任何含 `-` 的 tag，例如 `v18.0.0-rc.0`、`v17.0.0-RC.13`、`-beta.1`、`-alpha.0`）或**手动 `workflow_dispatch`** → 仅上传（构建进入 App Store Connect / TestFlight，不上架提交）。

> 门控依据 `-` 的存在，而不是把 `RC`/`beta`/`alpha` 列入拒绝名单，因为 GitHub Actions 的 `contains()` 区分大小写，且本仓库的 RC tag 主要为**小写** `-rc.N`。仓库历史中每个预发布 tag 都含 `-`；最终 tag 都不含。

## 所需 secrets

认证使用 **App Store Connect API key**（与公证 secrets 复用），在 CI 中比 Apple ID + 应用专用密码更稳健：

| Secret                  | 用作为            | 用途                                                                                            |
| ----------------------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| `mac_api_key`           | `ASC_KEY_CONTENT` | `.p8` 密钥文件内容（原始 PEM，含 `-----BEGIN/END PRIVATE KEY-----` 行）                         |
| `mac_api_key_id`        | `ASC_KEY_ID`      | API key id                                                                                      |
| `mac_api_key_issuer_id` | `ASC_ISSUER_ID`   | API issuer id                                                                                   |

> **重要：** API key 必须属于具有 **App Manager** 角色（或更高）的用户。仅有 **Developer** 角色的 key 可以上传/公证，但**不能创建版本或提交审核**。若提交因权限错误失败，请用 App Manager 角色签发新 key 并更新上述三个 secrets。

## 注意事项

- **Apple 审核是唯一人工门控**——由人工执行（约 1–2 天），可能被拒。直至（含）提交的一切均已自动化。
- **`automatic_release: true`** 会在 Apple 批准后立刻向 100% 用户发布该版本（无手动「Release this version」点击，无分阶段上线）。若希望人工上线或分阶段上线，在 `fastlane/Fastfile` 中设置 `automatic_release: false`（和/或对 iOS 设置 `phased_release: true`）。
- **构建号一次性使用。** 若 lane 在二进制**已上传之后**、提交**完成之前**失败（网络中断、App Manager 角色错误、出口合规暂停），简单重跑无效——App Store Connect 会拒绝重复构建号。恢复方式是在 App Store Connect 中手工完成提交，或提高构建号并重新打 tag。
- **「What's New」语言区域：** 仅生成 `en-US` 说明。若 App Store 列表有其他活跃语言区域，Apple 可能在提交时要求它们也有「What's New」文本。按需添加更多 `release_notes.txt`（或扩展 `tools/prepare-appstore-release-notes.js`）。
- **出口合规：** 若 `ios/App/App/Info.plist` 未设置 `ITSAppUsesNonExemptEncryption`，App Store Connect 会暂停提交并询问加密问题。设置一次即可保持提交完全无人值守。
- **绝不要在这些 lane 中启用 fastlane 详细模式**（`--verbose` / `FASTLANE_VERBOSE`）——详细输出可能转储 deliver 选项哈希，其中携带 API key 材料。
