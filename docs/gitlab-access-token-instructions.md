# 如何生成带权限的 GitLab Access Token

## Personal Access Token

轮询 GitLab Issues 需要提供 access token。

1. 前往 User Settings / Access tokens
2. 添加带 `api` 范围的新 token

![Personal Token](https://github.com/user-attachments/assets/76fb204e-450a-4516-9d93-897ae2a32f6d)

## Project Access Token

若你自行托管 GitLab 或拥有 Premium/Ultimate 许可，可获取限定于某一项目的 Project Access Token。
范围与 Personal Access Token 类似，但还需设置角色。各角色能力见 <a href="https://docs.gitlab.com/ee/user/permissions.html#project-planning">文档</a>。

![Project Token](https://github.com/user-attachments/assets/f008f114-3d3e-450d-9301-7825222f9812)

GitHub Personal Access Token 说明见 [GitHub Access Token Instructions](./github-access-token-instructions.md)。
