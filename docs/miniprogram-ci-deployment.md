# 微信开发版 CI 自动部署方案

## 1. 背景与目标

此前微信开发版依赖本地设备和微信开发者工具 CLI 上传。设备离线、本地登录态失效或工具不可用时，会出现代码已经合入 `main`，但开发版仍停留在旧版本的问题。

本方案把上传动作迁移到 GitHub Actions，形成以下闭环：

1. 变更通过 PR 进入 `main`；
2. `main` push 触发 `CI`；
3. CI 全部通过后触发“微信开发版自动上传”；
4. 工作流确认目标提交仍是最新 `main`；
5. 使用 GitHub Secret 中的上传私钥调用 `miniprogram-ci`；
6. 清理临时密钥，并在微信公众平台核验开发版。

目标是让“代码已合入”“测试已通过”“开发版已更新”成为同一条可审计链路，而不是三个互相独立的人工状态。

## 2. 实现组成

| 组成 | 路径 | 职责 |
| --- | --- | --- |
| 项目 CI | `.github/workflows/ci.yml` | 验证 `main` 和 PR 的格式、类型、测试、覆盖率、CloudBase 包一致性及依赖安全 |
| 自动上传工作流 | `.github/workflows/deploy-miniprogram.yml` | 在 `main` CI 成功后上传开发版，并支持受控手动触发 |
| 上传入口 | `scripts/upload-miniprogram-ci.mjs` | 读取 AppID、校验输入、收紧密钥权限并调用微信上传接口 |
| 契约测试 | `scripts/upload-miniprogram-ci.node-test.mjs` | 锁定参数、密钥、防回退和工作流安全不变量 |
| 上传工具依赖 | `tools/miniprogram-ci/package*.json` | 独立锁定 `miniprogram-ci@2.1.31` 及传递依赖 |
| 仓库脚本 | `package.json` | 提供 `test:deploy` 和 `deploy:miniprogram` 命令，并把部署测试接入 `validate` |

## 3. 触发与版本策略

### 自动触发

工作流监听名为 `CI` 的 `workflow_run` 完成事件，只接受：

- 事件来源是 `push`；
- 分支是 `main`；
- CI 结论是 `success`。

自动版本格式为 `0.0.<run_number>.<run_attempt>`，版本说明包含目标 `main` SHA，便于从微信开发版反查 GitHub 提交。

### 手动触发

在 GitHub Actions 的“微信开发版自动上传”页面选择 `main` 后，可填写：

- `version`：例如 `1.0.29`；
- `description`：发布说明；
- `robot`：微信 CI 机器人编号，范围 1–30。

手动运行仍必须指向当前远端 `main`，不能从旧分支或历史 SHA 上传。

## 4. 防止旧流水线回退

上传任务存在两个校验点：

1. checkout 后执行 `git fetch origin main`，确认待上传 SHA 等于 `origin/main`；
2. 依赖安装、测试和密钥准备完成后，在真正调用上传命令前再次通过 `git ls-remote` 读取远端 `main`。

如果任一阶段发现 `main` 已前进，任务记录“跳过过期提交”并停止上传。固定 concurrency group 会串行化已经触发的上传任务，避免多个 Run 并发争用开发版。

## 5. 私钥与依赖安全

- 私钥保存在 GitHub Actions Secret `WECHAT_MINIPROGRAM_PRIVATE_KEY`；
- 工作流只把 Secret 写入 `${RUNNER_TEMP}/miniprogram-ci.key`；
- 文件权限立即收紧为 `0600`；
- 上传脚本只接收密钥路径，不读取或输出密钥正文；
- `always()` 清理步骤保证成功、失败和取消路径都尝试删除临时文件；
- 上传工具使用独立 lockfile，避免污染业务依赖；
- CI 使用 `npm ci --ignore-scripts --prefix tools/miniprogram-ci`，降低传递依赖生命周期脚本风险。

微信上传 IP 白名单与 GitHub 托管 Runner 的动态出口 IP 不兼容。若业务必须开启白名单，应切换为固定出口的受控 self-hosted runner；否则保持上传白名单关闭，并通过主分支保护、最小 Actions 权限和密钥轮换降低风险。

## 6. 输入校验与失败语义

上传脚本在调用微信接口前校验：

- `project.config.json` 中存在 AppID；
- 私钥路径存在、是普通文件且内容非空；
- 版本符合 `^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$`；
- 说明是单行且不超过 128 个字符；
- robot 是 1–30 的整数。

任何校验失败、Secret 缺失、微信接口拒绝或上传异常都会让步骤失败。工作流不吞错，也不会把失败伪装成部署成功。

## 7. 首次启用记录

首次完整闭环于 2026-10-01 完成：

| 项目 | 结果 |
| --- | --- |
| 实现 PR | [#30](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/30) |
| 合并提交 | `744a275ea5e8f2cc8c554cb6dfa14b33293ca501` |
| `main` CI | [Run 36748968541](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/36748968541)，成功 |
| 自动触发验证 | [Run 36749142296](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/36749142296)，成功 |
| 手动版本验证 | [Run 36749282557](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/36749282557)，`1.0.29` 上传成功 |
| 微信平台验收 | 版本管理中可见开发版 `1.0.29`，说明为 `GitHub Actions 自动上传 main 744a275` |
| Secret | `WECHAT_MINIPROGRAM_PRIVATE_KEY` 已配置，临时副本已清理 |

## 8. 日常操作

### 标准流程

1. 从最新 `origin/main` 创建工作分支；
2. 完成代码与测试；
3. 按 [贡献与发布规则](../CONTRIBUTING.md) 跑本地门禁；
4. 提交 PR，等待 CI 通过；
5. 合入 `main`；
6. 等待 `main` CI 和自动上传工作流通过；
7. 在 Actions 日志及微信公众平台核对版本。

### 手动补发

仅在需要固定版本号或自动 Run 因外部瞬时故障失败时使用：

```bash
gh workflow run deploy-miniprogram.yml \
  --repo MengEn-Ink/cili-cycling-miniapp \
  --ref main \
  -f version=1.0.29 \
  -f description='手动补发最新 main' \
  -f robot=1
```

手动补发不能绕过 `main` 和测试门禁，也不能上传历史提交。

## 9. 故障处理与回滚

| 现象 | 排查与处理 |
| --- | --- |
| CI 未触发上传 | 确认事件是 `main` push、CI 名称仍为 `CI`、结论为 `success` |
| 提示过期提交 | 正常安全跳过；等待最新 `main` 的 CI 和上传 Run |
| Secret 缺失 | 重新配置 `WECHAT_MINIPROGRAM_PRIVATE_KEY`，不要把正文写入日志 |
| IP 不在白名单 | 关闭上传白名单或迁移到固定出口 Runner，不要维护 GitHub 动态 IP |
| 私钥无效 | 微信公众平台重置上传密钥并原子更新 GitHub Secret |
| 微信账号冻结 | 先恢复账号服务，再重跑最新 `main` |
| 上传接口失败 | 保留 Run 证据，确认微信服务状态和错误码后重跑最新 SHA |
| 需要停用 | 禁用上传工作流并删除 Secret；怀疑泄露时同步重置微信密钥 |

本方案只自动上传小程序代码，不自动部署 CloudBase 云函数。云函数部署仍按 README 的“CloudBase 初始化与部署”执行并单独验收。

## 10. 后续维护约束

修改 `CI` 名称、触发事件、工作流权限、Secret 名称、版本算法、SHA 校验、依赖锁或临时密钥生命周期时，必须同步：

1. 更新上传工作流；
2. 更新 `scripts/upload-miniprogram-ci.node-test.mjs` 的契约断言；
3. 更新本文和 `CONTRIBUTING.md`；
4. 在 PR 中完成手动 `workflow_dispatch` 回归；
5. 合并后确认自动 `workflow_run` 仍能真实上传。
