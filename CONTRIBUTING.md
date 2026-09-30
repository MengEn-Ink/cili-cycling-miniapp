# 贡献与发布规则

本文是仓库级强制规则，适用于所有代码、配置、测试和文档变更。目标是保证进入 `main` 的每次变更都经过本地验证、GitHub CI 和可追溯的部署验收。

## 1. 主分支与提交规则

1. `main` 是唯一可部署主分支，禁止在未验证的情况下直接推送。
2. 日常变更必须从最新 `origin/main` 创建符合仓库惯例的分支，例如 `feat/*`、`fix/*`、`docs/*`、`chore/*`。
3. 每个交付分支应收拢为一个语义完整的提交；提交标题和正文使用简体中文，并保留协作者 trailer。
4. 通过 Pull Request 合入 `main`。只有用户明确批准且 GitHub 审计链路不可用时，才允许紧急直推；紧急操作仍必须先完成同等本地验证，并在后续补齐记录。
5. 不得通过删除断言、跳过测试、降低覆盖率阈值或绕过 Actions 来换取绿色结果。

## 2. 本地交付门禁

提交前至少执行：

```bash
npm ci
npm run cloud:prepare
npm run validate
npm run coverage
npm run audit:all
```

若只修改文档，仍需执行 `npm run format:check`、相关契约测试和 `git diff --check`；若文档改动会影响命令、工作流或部署契约，则必须执行完整门禁。

任何失败都必须先修复。缺少外部环境导致未执行的验证必须明确记录，不能标记为通过。

## 3. Pull Request 与 CI 门禁

1. PR 必须以最新 `main` 为基线，描述需求背景、改动、影响、测试、回滚和文件统计。
2. PR 的 `CI / validate` 必须完成且结论为 `success`，才能合入 `main`。
3. CI 至少覆盖依赖安装、共享云函数包准备、`npm run validate`、覆盖率、只读 bootstrap 校验和高危依赖审计。
4. 合并后必须再次确认 `main` push 触发的 CI 通过；PR 分支上的成功不能替代主分支最终验证。

## 4. 自动部署规则

1. `.github/workflows/deploy-miniprogram.yml` 是微信开发版的唯一标准自动上传入口。
2. 只有 `main` 的 `CI` 以 `success` 完成后，`workflow_run` 才允许上传；PR、失败 CI、取消 CI 和非 `main` 分支不得部署。
3. 工作流必须在准备阶段和真正上传前分别核对目标 SHA 仍等于远端 `main`，避免旧流水线重跑覆盖新开发版。
4. 自动版本使用 `0.0.<run_number>.<attempt>`；需要稳定、可识别版本时，从 `main` 手动触发工作流并显式填写版本和说明。
5. 不得绕过 CI 直接上传未进入 `main` 的代码。紧急手动上传也必须使用同一上传脚本，并记录目标 `main` SHA、版本和 Actions/操作证据。
6. 自动上传只覆盖小程序代码。涉及 `cloudfunctions/**` 的变更，还必须按 README 部署对应 CloudBase 云函数并核验状态，不能把小程序上传成功等同于云函数已部署。

## 5. 密钥与供应链规则

1. 微信代码上传私钥只保存在 GitHub Actions Secret `WECHAT_MINIPROGRAM_PRIVATE_KEY`，禁止提交到仓库、普通变量、日志、Issue 或 PR。
2. Runner 仅在临时目录生成权限为 `0600` 的密钥文件，并在 `always()` 清理步骤中删除。
3. `miniprogram-ci` 必须由 `tools/miniprogram-ci/package-lock.json` 锁定版本，并使用 `npm ci --ignore-scripts` 安装。
4. 怀疑密钥泄露时，立即在微信公众平台重置密钥、更新 GitHub Secret，并验证旧密钥失效。
5. GitHub 托管 Runner 出口 IP 不固定；若开启微信上传 IP 白名单，必须使用固定出口的受控 Runner。

## 6. 部署验收与失败处理

每次合入 `main` 后必须完成以下闭环：

- `main` CI 结论为 `success`；
- “微信开发版自动上传”工作流结论为 `success`；
- 日志显示上传的 SHA、版本和 `微信开发版 <version> 上传成功`；
- 微信公众平台版本管理中能看到对应开发版；
- 密钥临时文件清理步骤成功。

若自动部署失败：

1. 保留失败 Run 和日志，不得改成跳过或吞错；
2. 区分 CI、Secret、IP 白名单、账号状态、微信接口和代码包问题；
3. 修复后从最新 `main` 重新运行，不得重跑已过期 SHA；
4. 验证成功后再宣布部署完成。

## 7. 交付清单

- [ ] 分支基于最新 `origin/main`
- [ ] 本地验证全部通过
- [ ] PR 描述与最终 diff 一致
- [ ] PR CI 通过
- [ ] 变更已合入 `main`
- [ ] `main` CI 通过
- [ ] 自动部署通过
- [ ] 微信开发版可见
- [ ] 云函数变更已单独部署并核验（如适用）
- [ ] Secret 和临时文件未泄露

完整实现、运行方式和故障处理见 [微信开发版 CI 自动部署方案](docs/miniprogram-ci-deployment.md)。
