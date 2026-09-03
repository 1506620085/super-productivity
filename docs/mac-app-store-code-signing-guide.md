# Mac App Store 代码签名

> **相关 macOS 文档：**
>
> - [发布与上架](release-and-publishing.md)
> - [证书轮换](update-mac-certificates.md)

Mac App Store 校验要求应用签名身份与配置描述文件中嵌入的证书匹配。证书名称、指纹与所有者在每次轮换时都会变化，因此应从当前钥匙串与配置文件推导它们，而不是把维护者特定值复制进配置或文档。

## 权威来源

- [`build/electron-builder.mas.yaml`](../build/electron-builder.mas.yaml) 拥有 MAS 目标、entitlements、应用 ID 与配置文件路径。
- [Mac App Store workflow](../.github/workflows/build-publish-to-mac-store-on-release.yml) 拥有证书导入、secret 名称、配置文件安装、诊断与上传。
- Apple Developer 门户拥有活跃证书与配置描述文件。

除非可执行配置变更，否则保持身份选择自动化。不要向 electron-builder 配置添加复制的证书名或指纹。

## 创建配置描述文件

1. 确认拟用的当前 **Apple Distribution** 身份与私钥已安装：

   ```bash
   security find-identity -v -p codesigning
   ```

2. 在
   [Apple Developer 配置文件门户](https://developer.apple.com/account/resources/profiles/list)
   中，为 `com.super-productivity.app` 创建 **Mac App Store Connect** 分发配置文件。
3. 选择门户显示的当前 Apple Distribution 证书。不要仅因熟悉的所有者名称而选择已被取代的遗留 Mac App Distribution 证书。
4. 将配置文件保存为 `tools/mac-profiles/mas.provisionprofile`。

## 动态验证配置文件

列出配置文件中嵌入的每个证书。脚本打印其主题与 SHA-1 指纹；此处使用 SHA-1 仅因为 macOS 身份列表使用该标识符。

```bash
PROFILE_PATH="tools/mac-profiles/mas.provisionprofile" python3 - <<'PY'
import hashlib
import os
import plistlib
import subprocess
import tempfile

profile = subprocess.run(
    ["security", "cms", "-D", "-i", os.environ["PROFILE_PATH"]],
    check=True,
    capture_output=True,
).stdout
certificates = plistlib.loads(profile)["DeveloperCertificates"]

with tempfile.TemporaryDirectory() as directory:
    for index, certificate in enumerate(certificates):
        path = os.path.join(directory, f"profile-cert-{index}.der")
        with open(path, "wb") as output:
            output.write(certificate)
        subject = subprocess.run(
            [
                "openssl",
                "x509",
                "-inform",
                "DER",
                "-in",
                path,
                "-noout",
                "-subject",
            ],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
        fingerprint = hashlib.sha1(certificate).hexdigest().upper()
        print(f"{fingerprint}  {subject}")
PY
```

确认至少一个指纹与 `security find-identity` 中拟用的 Apple Distribution 身份精确匹配。

## 更新 CI 并测试

1. 编码已验证的配置文件：

   ```bash
   base64 -i tools/mac-profiles/mas.provisionprofile -o mas-profile.b64
   ```

2. 更新 `mas_provision_profile` GitHub Actions secret。不要提交编码后的配置文件。
3. 用同一配置文件本地构建：

   ```bash
   cp tools/mac-profiles/mas.provisionprofile embedded.provisionprofile
   npm run build
   npm run dist:mac:mas:buildOnly
   ```

4. 检查实际应用签名与包：

   ```bash
   codesign -dv --verbose=4 \
     ".tmp/app-builds/mas-universal/Super Productivity.app"
   pkgutil --check-signature \
     .tmp/app-builds/mas-universal/super*.pkg
   ```

5. 运行 Mac App Store workflow，并将其配置文件-证书诊断与签名期间报告的身份比较。上传前它们必须指向同一当前证书。

## 故障排除

### 配置描述文件证书不匹配

若 Apple 报告可执行文件未由配置文件中包含的证书签名：

1. 重新运行上方配置文件检查。
2. 在构建日志中查看 electron-builder 选择的身份。
3. 确认 CI PKCS#12 包包含该身份及其私钥。
4. 用所选当前 Apple Distribution 证书重新创建配置文件，或在所选身份非预期时替换 CI 包。

不要通过把维护者姓名或旧指纹粘贴进配置来修复不匹配。

### 包已签名但在 App Store Connect 中不可用

- 等待 Apple 处理完成。
- 完成构建的出口合规问题。
- 确认版本与构建号尚未被使用。
- 确认构建出现在 macOS 平台下。

## 轮换

在撤销可用身份之前，创建并测试替换证书、配置文件与 CI secrets。遵循
[轮换操作手册](update-mac-certificates.md)；它会在两条替换构建路径都通过之前保持当前发布路径可用。
