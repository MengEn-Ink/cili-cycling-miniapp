# P0 真实报名旅程验收

当前产品口径：2026-10-16。Strava 使用公开路线解析与规范化链接复制，GPX 独立导入；均不要求 OAuth。历史 OAuth、自动同步与 `strava.sync.succeeded` 不属于当前发布门禁。

## 前置条件与角色

- 记录已部署的 Git SHA、客户端版本、开发版上传版本、Pages workflow、云环境、函数部署记录、时间与验收人。
- 使用隔离测试环境、可管理测试活动的管理员、资料完整且未参加目标活动的普通成员。管理员自报名只算 smoke。
- 两台物理设备分别覆盖 iOS、Android，记录系统、微信版本、基础库、字体大小、网络。模拟器不能替代相册权限、扫码、分享与安全区验收。
- 活动使用唯一 `E2E_RESULT:` 标记，至少留两名额。受控目录保留真实 ID 映射；公开证据仅使用别名、状态、数量和审计动作。
- 条件不足记录 `not_executed`、缺失条件及负责人；不得修改快照把未执行变为通过。

## 从部署到回收

| 顺序 | 实操 | 必须回读的事实 |
| --- | --- | --- |
| 1 | 创建草稿，填写时间、地点、照片与路线 | 草稿归属正确，照片为可用临时 HTTPS 地址 |
| 2 | 解析公开 Strava URL，另测 GPX 导入 | 路线事实、Canvas、规范化链接复制、GPX 选择及下载可用；无授权入口 |
| 3 | 发布测试活动 | 骑友可见；报名开关、截止时间、总量与分组容量正确 |
| 4 | 普通成员填写资料与进入报名 | 实名、电话完整对本人可见；未验证手机号路径提示准确 |
| 5 | 单击提交，并独立覆盖快速双击 | 只有一条记录；`occupied` 仅增加 1；`registration.submitted`；重复提交被前端阻止或返回稳定业务错误 |
| 6 | 管理员审批；另测自动通过配置 | 审批旅程 pending → approved，自动通过旅程直接 approved；凭证与人数一致 |
| 7 | 打开凭证、群二维码、名片与海报 | 日期/集合时间分开；受保护媒体回显，Canvas 字体、换行及二维码可读 |
| 8 | 本人取消 | cancelled，名额回到基线，`registration.cancelled` |
| 9 | 本人重新报名 | 沿用记录 ID，状态与配置一致，名额仅增加 1，`registration.resubmitted` |
| 10 | 独立样本测试签到 | approved → checked_in，重复签到幂等；不可取消样本明确记入回收计划 |
| 11 | 普通成员与管理员交叉查看 | 审核管理员完整资料；其他骑友只见昵称；司机电话公开完整显示 |
| 12 | 网络失败、重试和地址续签 | 不重复写入；临时 URL 失效后恢复；原始媒体地址不泄露 |
| 13 | 取消可取消的测试报名，结束隔离活动 | 活跃报名为 0 或明确记录 checked_in 残留与负责人；保存最终回读 |

## 写操作与失败补偿

写入超时后先只读对账，确认结果再决定下一步；禁止盲目重试发布、提交、审批或取消。可复用 `scripts/p0-journey-driver.mjs` 中不依赖 OAuth 的 `waitForPageReady`、`runReconciledWrite`、`compensateJourney`。

补偿使用正常业务取消与结束活动能力，不直接删除数据库。未知结果、连接中断、断言失败后仍执行补偿并保存报告。无法补偿时记录残留资源别名、最终状态、失败原因及下一步，完整旅程不得标记通过。

## 证据与判定

每个用例记录：编号、设备/角色、步骤、预期、实际、`passed / failed / blocked / not_executed`、脱敏截图文件名、时间、数据回读与补偿结果。报名审计至少包含 submitted、approved（人工审批旅程）、cancelled、resubmitted；所有时间戳有序，计数与状态互相印证。

公开证据不包含真实姓名、电话、openid、身份证、二维码、临时媒体 URL、凭据或密文。本人/管理员界面完整展示是产品规则，公开证据脱敏是交付规则，两者分别验收。

`scripts/verify-journey-evidence.mjs`、`issue-journey-run.mjs`、`evaluateJourneyPreflight` 和 `sanitizeJourneyAudits` 当前保留历史 v1 OAuth 证据兼容，**不得用于签发当前完整旅程通过**。历史格式与命令见 [40324f1 版手册](https://github.com/MengEn-Ink/cili-cycling-miniapp/blob/40324f1b10304b52895d182e1e3a66a0d44b4625/docs/verification/p0-real-registration-journey.md)。当前写链路以本表逐项人工回读验收；v2 离线签发器迁移在高优清单跟进。

总结果只有在真实普通成员、双平台设备、回读与补偿均满足后才能标为完整通过。模拟器结果单独引用 [只读 E2E 手册](wechat-devtools-e2e.md)，不得关闭物理真机 P0。
