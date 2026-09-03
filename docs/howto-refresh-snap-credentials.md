# 如何刷新 Snap Store 凭证

GitHub Actions 用于发布新版本的 Snap Store 凭证会定期过期。过期后，CI 发布步骤会失败。按以下步骤生成新凭证并更新 GitHub Actions secret。

1. 运行 `snapcraft export-login --snaps superproductivity -`
2. 将输出值复制到 GitHub Actions 设置中的 `SNAPCRAFT_STORE_CREDENTIALS`（Settings > Secrets and variables > Actions）。
