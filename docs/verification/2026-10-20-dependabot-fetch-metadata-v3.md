# Dependabot 元数据动作升级验收

## 变更

- 将 `.github/workflows/dependabot-auto-merge.yml` 使用的 `dependabot/fetch-metadata` 从 `v2.4.0` 升级到 `v3.1.0`。
- 权限、触发条件和低风险自动合并判定保持不变。

## 验收

- GitHub Actions workflow 可正常解析。
- PR 的 CI 与 CodeQL 检查通过。
- Dependabot 元数据读取步骤能够使用现有 `GITHUB_TOKEN` 执行。

## 影响与回滚

不涉及小程序、云函数和用户数据；如上游动作出现兼容问题，可将版本恢复为 `v2.4.0`。
