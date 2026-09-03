# 更新 electron-builder 所用的 macOS 证书

> **相关 macOS 文档：**
>
> - [发布与上架](release-and-publishing.md)
> - [Mac App Store 签名](mac-app-store-code-signing-guide.md)

本次轮换更新 macOS GitHub Actions runner 使用的证书包与配置描述文件。在能访问 Apple Developer 团队的 Mac 上执行。

在替换包通过本地与 CI 签名检查之前，保持当前可用身份有效。先撤销会造成本可避免的发布中断，并可能毁掉唯一可用的私钥配对。

## 1. 清点并备份可用配置

1. 记录当前 workflow 使用的 Apple Distribution、Mac Installer Distribution 与 Developer ID 身份：

   ```bash
   security find-identity -v -p codesigning
   ```

2. 从 **钥匙串访问 → 我的证书** 将可用身份与私钥导出为加密 PKCS#12 备份。存入团队安全凭证存储。
3. 记录活跃证书过期日期，以及 `mas_provision_profile` 与 `dl_provision_profile` 使用的配置文件名。

若 Apple 证书配额阻止在可用证书旁创建替换项，先确认备份可导入，并在撤销任何东西前安排维护窗口。

## 2. 创建并安装替换项

1. 在钥匙串访问中，为 Apple Developer 团队创建证书签名请求。
2. 在
   [Apple Developer 证书门户](https://developer.apple.com/account/resources/certificates/list)
   中签发当前 workflow 所需的证书类型：
   - Apple Distribution，用于 Mac App Store 应用签名
   - Mac Installer Distribution，用于上传的 Mac App Store 包
   - Developer ID Application，用于直接下载构建
   - 当前 workflow 仍引用的任何额外身份
3. 下载并将每个证书安装到登录钥匙串。
4. 在 **我的证书** 中展开每个新身份，确认私钥已附着。

先不要移除或撤销旧身份。

## 3. 创建替换配置描述文件

仅在新证书存在后创建配置文件：

1. 使用新 Apple Distribution 证书为 `com.super-productivity.app` 创建 Mac App Store 配置文件。保存为
   `tools/mac-profiles/mas.provisionprofile`。
2. 若直接下载 workflow 仍使用 Developer ID 配置文件，用新 Developer ID Application 证书创建，并保存为
   `tools/mac-profiles/dl.provisionprofile`。
3. 检查每个配置文件，确认其嵌入证书是新身份之一：

   ```bash
   security cms -D -i tools/mac-profiles/mas.provisionprofile
   security cms -D -i tools/mac-profiles/dl.provisionprofile
   ```

配置文件证书与签名所选身份必须匹配。动态验证流程见
[Mac App Store 签名](mac-app-store-code-signing-guide.md)。

## 4. 导出并更新 CI secrets

1. 在钥匙串访问中，将替换身份及其私钥导出为一个带密码保护的 `all-certs.p12`。使用新生成的密码。
2. 上传前验证该包可导入临时钥匙串。
3. Base64 编码包与配置文件：

   ```bash
   base64 -i all-certs.p12 -o all-certs.b64
   base64 -i tools/mac-profiles/mas.provisionprofile -o mas-profile.b64
   base64 -i tools/mac-profiles/dl.provisionprofile -o dmg-profile.b64
   ```

4. 更新 workflow 引用的 GitHub Actions secrets：
   - `mac_certs` 与 `mac_certs_password`
   - `mas_provision_profile`
   - `dl_provision_profile`

workflow 文件对 secret 名称以及是否仍需要配置文件具有权威性。绝不要提交 PKCS#12 文件、编码后的 secret 文件或密码。

## 5. 撤销前先验证

1. 构建并验证 Mac App Store 包：

   ```bash
   cp tools/mac-profiles/mas.provisionprofile embedded.provisionprofile
   npm run build
   npm run dist:mac:mas:buildOnly
   codesign -dv --verbose=4 \
     ".tmp/app-builds/mas-universal/Super Productivity.app"
   pkgutil --check-signature \
     .tmp/app-builds/mas-universal/super*.pkg
   ```

2. 本地直接下载公证测试时，通过静默提示输入凭证，使应用专用密码不写入 shell 历史。
   在 Bash 中运行以下内容；子 shell 将导出值限制在构建内：

   ```bash
   (
     set -e
     read -r -p "Apple ID: " APPLE_ID
     read -r -s -p "App-specific password: " APPLE_APP_SPECIFIC_PASSWORD
     printf "\n"
     read -r -p "Apple team ID: " APPLE_TEAM_ID
     export APPLE_ID APPLE_APP_SPECIFIC_PASSWORD APPLE_TEAM_ID
     npm run build
     npm run dist:mac:dl
   )
   ```

3. 验证 DMG 签名与公证：

   ```bash
   codesign --verify --deep --strict --verbose=2 "<path-to-built-app>"
   spctl --assess --type open --context context:primary-signature -vv \
     "<path-to-dmg>"
   xcrun stapler validate "<path-to-dmg>"
   ```

4. 运行会使用更新后 secrets 的 macOS 签名 workflow，并确认其证书/配置文件诊断匹配。

## 6. 退役旧材料

仅在两条替换构建路径都通过后：

1. 在 Apple Developer 门户撤销被取代的证书。
2. 从本地钥匙串移除旧身份。
3. 确认安全备份与 GitHub secrets 可用后，删除本地未加密与 base64 工作文件。
4. 在团队凭证清单中记录轮换日期与新过期日期。
