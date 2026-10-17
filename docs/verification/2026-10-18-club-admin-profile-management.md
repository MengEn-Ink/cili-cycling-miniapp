# 俱乐部管理员资料管理端到端验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | [#278](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/278) |
| Head SHA | `3902bf48d3edad311132aff39ee4eedf1cdb228b`（合并前提交，后续仅追加本报告并 amend） |
| 客户端版本 | `2026.10.18.2` |
| 验收环境 | 本地自动化；CloudBase 与微信开发版待合并后验收 |
| 验收角色 | OWNER、ADMIN、普通 MEMBER |
| 执行时间 | 2026-10-18 06:15 CST |
| 执行人 | Aime |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | 俱乐部中心新增管理卡片、编辑态、多俱乐部切换、确认保存及失败重试 |
| 云函数与数据 | `club-application` 新增管理资料读写 action、审计幂等与乐观并发控制 |
| 权限与隐私 | 仅 active OWNER/ADMIN 可管理；字段白名单；头像归属校验；客户端只接收 HTTPS 地址 |
| Pages / 文档 | Pages 不涉及；同步设置页发布日志、UI schema 与本验收报告 |
| 部署与回滚 | 合并后部署 `club-application` 并上传微信开发版；异常时回滚提交并重新部署 |

## 3. 测试用例矩阵

| 用例 | 类型 | 前置条件 | 步骤 | 预期 | 实际 | 证据 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OWNER/ADMIN 读取并保存资料 | 标准路径 | active 管理身份 | 打开俱乐部中心、编辑五类资料、确认保存 | 返回新资料并退出编辑态 | 定向前后端测试通过 | `core.node-test.js`、`club-center-runtime.test.ts` | PASS |
| 普通成员尝试管理 | 权限边界 | active MEMBER | 读取管理资料 | 不展示入口且服务端拒绝 | 权限测试通过 | `core.node-test.js` | PASS |
| 两名管理员基于旧版本保存 | 根因反例 | 同一俱乐部两个管理员 | A 保存后 B 携旧 `updatedAt` 保存 | B 收到冲突，不覆盖 A | 乐观锁测试通过 | `core.node-test.js` | PASS |
| 响应丢失后重放旧 requestId | 失败恢复 | 首次写入已提交 | 使用相同 requestId 重试 | 返回首次结果，不覆盖后续修改 | 独立审计幂等测试通过 | `core.node-test.js` | PASS |
| 多俱乐部切换 | 回归 | 管理两个俱乐部 | 保存 A，切换 B 后再回 A | A 使用保存后的最新列表资料 | 运行时断言通过 | `club-center-runtime.test.ts` | PASS |
| 头像替换与存量兼容 | 边界 | 存量头像或新上传头像 | 保留旧头像或上传本人目录图片 | 允许保留；替换仅限本人目录；不泄露 fileId | 云函数与仓储测试通过 | `core.node-test.js`、`cloud-repository.test.ts` | PASS |
| 真实 CloudBase 与微信端链路 | 端到端 | main 合并版本 | 部署云函数并上传开发版后回读 | 函数 Active、真实写入可回读、开发版上传成功 | 待合并后执行 | main Actions 与 smoke 日志 | BLOCKED |

## 4. 自动化门禁

| 门禁 | 结果 | 关键输出或链接 |
| --- | --- | --- |
| `npm run validate` | 通过 | 17 个页面源码完整性校验通过；云函数包校验通过 |
| `npm run coverage` | 通过 | 95 files / 1173 tests；`cloud.ts` lines 90.39%、branches 88.56% |
| `npm run audit:all` | 通过 | 项目及各云函数 0 high；微信上传工具为已评估例外 |
| `git diff --check` | 通过 | 无空白错误 |
| PR checks | 进行中 | CodeQL 已通过；CI 描述门禁将在补齐本报告和规范描述后重跑 |

## 5. 端到端执行记录

1. 基于最新 `origin/main` 创建 `feat/club-admin-profile-management`，核对 OWNER/ADMIN/MEMBER 权限来源与现有俱乐部中心入口。
2. 执行云函数状态机与 CloudBase smoke harness 测试，覆盖真实存储适配层、管理资料更新、幂等审计和清理回读。
3. 执行页面运行时、仓储映射、缓存失效、发布日志和 UI 契约测试。
4. 执行全量 validate、coverage、安全审计和差异检查，并记录客户端版本 `2026.10.18.2`。

**执行结论**：自动化链路 PASS；真实 CloudBase 部署与微信开发版验收 BLOCKED（需合并 main 后执行）。

**未执行或阻塞说明**：PR 分支不会替代 main 生产交付；合并后由 main 工作流部署 `club-application`、执行真实写入 smoke 并上传微信开发版，完成后回填本报告对应运行链接和版本号。

## 6. 部署与回读

| 流程 | 运行链接 | 结果 | 回读 |
| --- | --- | --- | --- |
| main CI | 待合并后回填 | 待执行 | 待核对最终 main SHA |
| Pages | 不适用 | 安全跳过 | 本次无 Pages 变更 |
| CloudBase | 待合并后回填 | 待部署 | 待核对 `club-application` Active 与真实写入 smoke |
| 微信开发版 | 待合并后回填 | 待上传 | 待提取开发版版本号和上传成功日志 |

## 7. 风险与回滚

- 剩余风险：真实环境权限配置和云函数部署状态需在 main 合并后验证。
- 监控与观察：关注 `CLUB_ADMIN_REQUIRED`、`CLUB_PROFILE_CONFLICT`、头像签名失败及微信端保存错误。
- 回滚步骤：回滚本提交，重新部署 `club-application`，并由 main 工作流上传回滚后的微信开发版。
- 数据恢复：资料写入有审计记录；必要时按 `club_profile_updated` 审计结果恢复上一版本字段。

## 8. 最终结论

代码、权限、安全、并发和自动化门禁满足合并条件；真实 CloudBase 与微信开发版属于合并后交付验收项，完成前整体部署状态保持 BLOCKED。
