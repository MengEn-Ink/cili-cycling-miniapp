# 安全初始化 CloudBase

本目录只提供操作说明，不保存真实身份、密钥或业务数据。CloudBase 的集合、索引与数据库规则由仓库根目录的 `scripts/bootstrap-cloudbase.mjs` 声明；活动必须通过已部署的小程序业务流程创建。

## 1. 准备

1. 确认微信开发者工具登录的是目标小程序开发成员，CloudBase CLI 登录的是目标腾讯云账号。
2. 核对 `cloudbaserc.json` 的环境；切换环境时必须显式传入并确认目标环境 ID。
3. 在 CloudBase 控制台配置云函数环境变量。变量名见 `cloudfunctions/.env.example`，真实值不得写入仓库、命令历史、Issue 或 CI 日志。

## 2. 创建集合、索引与数据库规则

默认命令只读取远端并生成计划：

```bash
npm run cloudbase:plan
```

计划的当前基线是 12 个核心集合、26 个业务索引和全拒绝客户端数据库规则。由环境负责人审核计划后，才可执行：

```bash
npm run cloudbase:apply
npm run cloudbase:verify
```

覆盖 `cloudbaserc.json` 中的环境时，使用脚本支持的 `--env-id` 和完全相同的 `--confirm-env-id`，不要依赖未展开的环境变量或模糊环境名称。

`cloudbase:verify` 不验证云存储规则。必须单独应用并回读 `cloudstorage.rules.json`，确认客户端只能写本人 `profiles/` staging 路径，不能写 `profile-canonical/`。

`strava_route_previews` 已由 bootstrap 与其他服务端可信集合一并管理，并纳入全拒绝客户端读写规则和 `cloudbase:verify`。不要绕过 plan/apply/verify 手工创建或放宽该集合权限。

## 3. 创建首个管理员

部署 `auth` 后，按 [管理员白名单说明](../seed-admin/README.md) 从真实微信身份取得 `openid`，再由环境负责人在 `admins` 集合创建记录。不要从客户端参数、Mock、截图或持久化日志猜测身份。

## 4. 创建首个活动

部署并验证 `activity-admin` 后，在小程序“我的 → 活动管理”中创建草稿。补齐标题、活动起止时间和路线起终点后可先发布预告；只有补齐截止时间、总容量、集合方式分仓、费用和必要司机信息后，服务端才会把报名状态判定为开放。不要在数据库控制台手工拼装活动，也不要直接修改：

- `status`、`version` 或 `created_by`；
- `occupied_count` 及集合方式分仓计数；
- 报名状态、审批历史或签到状态。

这些字段必须通过云函数的校验、事务和审计流程变化。

## 5. 验证与安全约束

- 运行 `npm run cloudbase:verify`，确认集合、索引和全拒绝客户端规则。
- 按根 README 的顺序部署云函数和定时触发器，应用并回读三条 OAuth HTTPS 网关路由；同步配置 Strava callback 和小程序 `web-view` 业务域名。
- 在隔离测试环境按 `docs/verification/p0-real-registration-journey.md` 执行真实旅程。
- 不得提交真实 `openid`、手机号、OAuth code/state、Strava token、密钥、密文、控制台导出数据或未脱敏证据。
- 不得用 Mock、本地构建结果或手工改库代替真实环境验证。
