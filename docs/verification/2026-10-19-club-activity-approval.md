# 俱乐部活动投稿审批闭环验收报告

- 验收日期：2026-10-19
- 代码基线：`origin/main` `6676faa5ed9bd90affa4dcb50152f857a414cf50`
- 验收范围：普通成员投稿、俱乐部管理者直发与审批、并发幂等、公开列表隔离、Pages 原型同步

## 验收结论

代码、自动化测试、覆盖率、安全审计和 Pages 原型验收均通过；真实 CloudBase 部署、微信开发版和 MEMBER/OWNER/ADMIN 真机写链路需在 PR 合并、自动部署完成后继续取证，当前不标记为已完成。

## 自动化验证

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 全量质量门禁 | `npm run validate` | 通过；99 个 Vitest 文件、1242 项测试通过，构建、治理、设计、UI 同步与 Cloud 包校验通过 |
| 覆盖率 | `npm run coverage` | 通过；总 Lines 85.26%，`cloud.ts` Lines 90.79%、Branches 88.95% |
| 安全审计 | `npm run audit:all` | 通过；主包与 CloudBase 包无 high 级未处理漏洞 |
| 提交卫生 | `git diff --check` | 通过 |

## 关键场景

| 场景 | 预期 | 结果 |
| --- | --- | --- |
| 普通成员投稿 | 进入 `pending_review`，不出现在公开列表 | 自动化通过 |
| OWNER/ADMIN 直发 | 直接进入 `published` 并记录 `role_auto_publish` | 自动化通过 |
| OWNER/ADMIN 审批 | 通过后发布；驳回必须填写原因 | 自动化通过 |
| 重复与并发请求 | 同一意图幂等，旧版本或异意图冲突 | 自动化通过 |
| 权限与边界 | 未知角色、越权、停用俱乐部、过期活动拒绝 | 自动化通过 |
| 管理俱乐部分页 | 超过单页时继续读取，不静默漏权限 | 自动化通过 |
| Pages 原型 | 活动编辑与管理列表对应交互和截图同步 | 通过 |

## 端到端验收状态

| 环节 | 状态 | 说明 |
| --- | --- | --- |
| CloudBase 测试环境部署 | 阻塞 | PR 合并后由 `CloudBase 自动部署` workflow 部署 `activity-admin` 并核对 Active 状态 |
| 微信开发版上传 | 阻塞 | PR 合并后由 `微信开发版自动上传` workflow 生成 SHA 锚定回执 |
| DevTools 编译与交互 | 阻塞 | 需要可信 macOS 微信开发者工具环境 |
| MEMBER/OWNER/ADMIN 真机旅程 | 阻塞 | 需要真实角色账号完成投稿、审批、驳回、重投和公开列表回读 |

## 合并后复验步骤

1. 核对 main CI 的 Validate、Coverage、Audit 与 Cloud 包校验全部成功。
2. 核对 CloudBase 自动部署中 `activity-admin` 部署成功，并在函数列表中为 Active。
3. 核对微信开发版上传 workflow 成功并保存 `miniprogram-upload-receipt-<SHA>.json`。
4. 用真实 MEMBER 账号投稿，再用所属俱乐部 OWNER/ADMIN 分别执行通过与驳回；确认审核中和已驳回活动不进入公开列表，通过后才公开。
5. 在 iOS 与 Android 真机复验筛选、驳回原因弹窗、重复点击和弱网重试反馈。
