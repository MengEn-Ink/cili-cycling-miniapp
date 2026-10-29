# 固定体验版发布记录

本目录只保存已经在微信公众平台完成回读的 `verified` 清单。开发版仍由 `微信开发版自动上传` 工作流滚动上传；同 SHA 的真实上传成功后，`微信体验版晋级证据门禁` 自动准备 candidate，但不会冒充微信公众平台选版。自动上传和自动候选均不得覆盖体验基线。

## 晋级

1. 确认目标是当前 `main`，对应 CI 与微信开发版上传工作流均成功，核心流程 smoke 已通过；门禁会通过 GitHub API 核验 smoke/CI/上传 run 的仓库、工作流、结论和目标 SHA，并下载上传 receipt 核对版本、SHA 与 run ID，任意外链或跳过上传的成功 run 不能晋级。
2. `微信开发版自动上传` 成功后会自动触发 `candidate/promote`；门禁从真实 upload/release receipt 反推版本、SHA、CI run 和 smoke run。纯文档安全跳过、receipt 不完整或上传后 `main` 已前进时只记录跳过。平台瞬时故障时可手动运行 `candidate/promote` 恢复，固定入口仍为 `pages/activities/index`。
3. 下载候选清单，核对版本、SHA、CI run、上传 run、入口和摘要；然后先回读微信公众平台版本管理。原生开发权限可用时，由发布负责人把同一开发版选为体验版。`miniprogram-ci` 没有公开的体验版选版接口，此动作不能由开发版上传伪装或绕过。
4. 若版本管理显示“开发管理已禁用 / 开发权限已托管给第三方”，不得生成 verified。授权第三方必须使用微信开放平台 `commit` 上传代码并生成体验版，或由管理员恢复原生开发权限后重新选版；两条路径都要回读同版本、SHA 与入口。
5. 取得平台版本页回读证据后运行 `verified/promote`，只填写 candidate 工作流 run ID 与 `platform_evidence=CONFIRMED`；工作流下载原候选 artifact，并从中反推版本、SHA、CI、上传、smoke、入口和摘要。额外填写的字段只作为一致性检查，任一冲突都会失败。即使期间 `main` 已前进，verified 仍沿用原 candidate。
6. 将 verified artifact 原样提交到本目录，文件名使用 `<releaseId>.json`。脚本采用排他写入，已有记录不得覆盖。

## 回退演练

1. 只选择本目录已验证的历史稳定 `promote` 版本。先手动运行 `微信开发版自动上传`，填写该清单的完整 `restore_release_id`，不要填写 `version`；工作流会用当前 `main` 的脚本与锁定依赖校验清单摘要、`verified/promote` 状态、release ID 和 main 祖先关系，再从清单派生历史 SHA/版本并从独立源码目录重传。上传 receipt 为 schema 2，绑定本次 run、目标 SHA/版本和 `restoreReleaseId`。
2. 运行 `candidate/rollback`，`previous_release_id` 填被恢复的稳定 `promote` 清单，`upload_run_id` 填上一步历史恢复上传 run；门禁会核验该 run 成功、工作流名称及 schema 2 receipt。历史清单仍严格核对原 CI 与 smoke，但不要求本次恢复上传 URL 等于原历史上传 URL。
3. 在微信公众平台把本次重传的同版本开发版恢复为体验版后运行 `verified/rollback`，附平台回读和 smoke 证据。
4. 将 verified 清单原样提交到本目录；新 rollback 清单的 `uploadRunUrl` 记录本次历史恢复上传。每次操作的 `releaseId` 包含模式与 candidate run ID，因此回退审计会新增记录而不会覆盖被恢复的稳定清单。随后在群内同步入口、版本、SHA 和影响。

## 验证

```bash
node scripts/miniprogram-experience-release.mjs verify \
  --input docs/releases/experience/<releaseId>.json
```

清单摘要覆盖全部字段；任何手工改写或额外字段都会校验失败。CI 还会检查本目录 JSON 只增不改不删。GitHub Actions artifact 仅保留 90 天，仓库内 verified 清单是长期审计记录。
