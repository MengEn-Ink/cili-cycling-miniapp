# 固定体验版发布记录

本目录只保存已经在微信公众平台完成回读的 `verified` 清单。开发版仍由 `微信开发版自动上传` 工作流滚动上传；体验版只能通过 `微信体验版晋级证据门禁` 两阶段流程人工晋级，自动上传不得覆盖体验基线。

## 晋级

1. 确认目标是当前 `main`，对应 CI 与微信开发版上传工作流均成功，核心流程 smoke 已通过；门禁会通过 GitHub API 核验 smoke/CI/上传 run 的仓库、工作流、结论和目标 SHA，并下载上传 receipt 核对版本、SHA 与 run ID，任意外链或跳过上传的成功 run 不能晋级。
2. 手动运行 `微信体验版晋级证据门禁`，选择 `candidate/promote`，固定入口使用 `pages/activities/index`。
3. 下载候选清单，核对版本、SHA、CI run、上传 run、入口和摘要；然后由发布负责人在微信公众平台把同一开发版选为体验版。
4. 取得平台版本页回读证据后，以相同参数运行 `verified/promote`，填写 candidate 工作流 run ID、其输出的 `sha256` 摘要，并由 `wechat-experience` 受保护环境审批人填写 `CONFIRMED`；工作流会下载原候选 artifact、生成与版本/SHA/入口绑定的结构化平台声明并逐字段校验，禁止换包。即使期间 `main` 已前进，verified 仍沿用原 candidate。
5. 将 verified artifact 原样提交到本目录，文件名使用 `<releaseId>.json`。脚本采用排他写入，已有记录不得覆盖。

## 回退演练

1. 只选择本目录已验证的历史稳定版本；工作流会按该 `releaseId` 回读仓库清单并强制核对目标 SHA 与版本。运行 `candidate/rollback`，填写上一稳定 `releaseId` 与回退原因。
2. 在微信公众平台恢复该历史版本后运行 `verified/rollback`，附平台回读和 smoke 证据。
3. 将 verified 清单原样提交到本目录；每次操作的 `releaseId` 包含模式与 candidate run ID，因此回退审计会新增记录而不会覆盖被恢复的稳定清单。随后在群内同步入口、版本、SHA 和影响。

## 验证

```bash
node scripts/miniprogram-experience-release.mjs verify \
  --input docs/releases/experience/<releaseId>.json
```

清单摘要覆盖全部字段；任何手工改写或额外字段都会校验失败。CI 还会检查本目录 JSON 只增不改不删。GitHub Actions artifact 仅保留 90 天，仓库内 verified 清单是长期审计记录。
