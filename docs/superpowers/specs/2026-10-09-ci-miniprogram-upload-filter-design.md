# CI 微信开发版上传过滤设计

## 背景

当前 `CI` 在 `main` 的每次 push 后运行，`微信开发版自动上传` 再通过
`workflow_run` 等待 CI 成功。该结构保证只有通过门禁的提交才会上传，但纯文档、
验证记录和其他不影响小程序产物的提交也会消耗微信开发版本号。

现有工作流还在使用基于 Node.js 20 的 `actions/checkout@v4` 和
`actions/setup-node@v4`。GitHub Actions 已切换到 Node.js 24，应升级到当前原生
Node.js 24 的 Action 主版本，消除运行时兼容告警。

## 目标

1. 保留“CI 成功后才允许自动上传”的发布门禁。
2. 纯文档、验证记录和其他非产物变更仍运行 CI，但不上传微信开发版。
3. 多提交 push 必须按完整的 `before..sha` 区间判定，不能只检查最后一个提交。
4. 手动触发上传继续可用，不受自动路径过滤影响。
5. 路径判定、artifact 内容和工作流接线均有自动化测试。
6. GitHub 官方 JavaScript Action 升级到原生 Node.js 24 的当前主版本。

## 非目标

- 不改变本地 `npm run validate`、覆盖率或依赖审计门禁。
- 不改变微信上传版本号、机器人编号、密钥处理和 main 最新提交保护。
- 不把部署任务合并进 CI 工作流。
- 不跳过纯文档提交的 CI。

## 方案

### 路径判定

新增 `scripts/miniprogram-upload-decision.mjs`，提供纯函数：

- `shouldUploadMiniProgram(paths)`：只要任一路径影响小程序产物或上传链路即返回
  `true`。
- `buildUploadDecision({ before, sha, paths })`：生成可序列化判定对象。
- `validateUploadDecision(value, expectedSha)`：部署端校验 schema 和提交 SHA。

需要自动上传的路径：

- `miniprogram/**`
- `cloudfunctions/**`
- `tools/miniprogram-ci/**`
- `scripts/upload-miniprogram-ci.mjs`
- `scripts/miniprogram-upload-decision.mjs`
- `project.config.json`
- `project.private.config.json`
- `package.json`
- `package-lock.json`

`.github/workflows/**` 不自动触发上传。工作流自身变更应先通过 CI，必要时使用既有
`workflow_dispatch` 手动验证，避免仅调整 CI 配置就消耗开发版本号。

### CI 判定 artifact

`CI` 的 `validate` job 在 checkout 后：

1. 使用事件提供的 `github.event.before` 和 `github.sha` 作为完整 push 区间。
2. 通过 `git diff --name-only` 得到变更路径。
3. 调用判定脚本写出 `miniprogram-upload-decision.json`。
4. 仅在 push 到 `main` 时上传名为 `miniprogram-upload-decision` 的 artifact。

Pull request 仍执行全部门禁，但不生成供部署使用的判定 artifact。

### 部署消费

自动 `workflow_run` 路径：

1. 使用触发它的 CI `run-id` 下载判定 artifact。
2. 校验 artifact 中的 `sha` 必须等于 `workflow_run.head_sha`。
3. 仅当 `shouldUpload=true` 时执行 checkout、main 最新提交检查、依赖安装和上传。
4. `shouldUpload=false` 时输出明确的跳过原因并成功结束。
5. artifact 缺失、内容非法或 SHA 不匹配时 fail closed，不上传。

手动 `workflow_dispatch` 路径直接进入既有上传流程。

部署工作流增加最小权限 `actions: read`，用于跨工作流下载 artifact。

## Action 版本

升级到当前官方原生 Node.js 24 主版本：

- `actions/checkout@v7`
- `actions/setup-node@v7`
- `actions/upload-artifact@v7`
- `actions/download-artifact@v8`

## 测试

1. 单元测试覆盖产品代码、云函数、上传脚本、依赖清单、纯文档、纯测试和工作流文件。
2. 单元测试覆盖 decision schema、布尔类型及 SHA 匹配校验。
3. 工作流契约测试确认：
   - CI 使用完整 push 区间并上传 artifact；
   - 部署工作流按 CI run-id 下载 artifact；
   - 自动上传受判定结果约束；
   - 手动上传不受过滤；
   - 原有 main 最新提交保护和密钥保护仍存在；
   - 所有官方 Action 使用目标主版本。
4. 执行 `npm run test:deploy` 和 `npm run validate`。

## 交付

实施完成后提交并推送 `main`，观察 CI 和部署工作流。由于本次包含
`scripts/miniprogram-upload-decision.mjs`，本次提交自身应触发一次微信开发版上传；
后续纯文档提交应只运行 CI，并由部署工作流明确跳过上传。
