# 此里 · 骑行活动原生微信小程序

“此里”用于活动展示、实名资料、Strava 绑定、报名与管理员审批。需求见 [`docs/requirements-design.md`](docs/requirements-design.md)，数据契约见 [`docs/cloudbase-schema.md`](docs/cloudbase-schema.md)。

## 当前实现

- 微信运行固定使用 `CloudRepository`，不会回退 Mock；`DEVELOPMENT_MOCK` 与 `createRepository({ developmentMock: true })` 仅供显式开发/测试注入，UI 无切换入口。
- `auth` 只信任 `cloud.getWXContext().OPENID`，真实 role 优先；管理入口仅向已验证管理员显示，所有管理页再次校验。
- `activity-read` 保持只读；独立 `activity-admin` 提供管理员活动列表、详情、创建和编辑，执行 `draft → published → finished` 单向状态机、容量与关键时间校验。`registration`、`admin-review` 完成我的报名、提交/取消与管理员审批。
- `notification-send` 消费 Outbox 并执行审批通知发送，保留可重试、幂等处理与失败状态记录。
- `profile` 提供 `get/update/getPhoneNumber`。姓名、手机号、紧急电话分别以 AES-256-GCM 加密；不再采集或返回证件类型、证件号及其状态，存量证件密文只读保留且不解密。对外仅返回必要脱敏值、填写状态和完整度。手机号保留来源和验证状态。
- `strava-auth` 提供 `status/start/sync/disconnect`；`strava-callback` 处理 OAuth 回调。state 使用 32 字节随机值、SHA-256 落库、10 分钟应用层强制过期和事务内 `consumed_at` 一次性消费；`start/status` 每次限量清理已过期 state。token 使用 AES-256-GCM 加密。同步仅拉最近 90 天、每页 200 条、最多 5 页，并统计里程、次数、最长距离、爬升、距离加权平均速度和最近活动时间。
- 页面在未登录、资料未完成、函数/路由未部署时显示引导或错误，不伪造成功。相册保留 `chooseMedia -> cloud.uploadFile -> profile.update` 契约，须真机验证权限和存储规则。

## P0 报名契约

第一批手机号规则：微信授权号码标记为 wechat/verified；个人主体可手填号码，标记为 manual/unverified。两者都满足第一批报名门禁，管理员审批详情必须展示来源。

Strava 报名资格唯一事实源：`strava_credentials + strava_snapshots`。`profiles.strava` 仅为兼容展示缓存，不参与报名判定。

快照新鲜度为 24 小时；同步租约为 2 分钟。覆盖度只描述最近 90 天；第 5 页仍满 200 条时 `coverage_complete=false`。完整空窗口的统计值可为 0，未知或不完整值为 `null`。

`strava_credentials` 使用以下同步状态字段：

```text
sync_status: pending|running|ready|failed
sync_error_code?: String
sync_started_at?: Date
sync_finished_at?: Date
sync_lease_id?: String
```

## 环境变量（只在 CloudBase 控制台配置）

示例见 `cloudfunctions/.env.example`，仓库中不得填写真实值：

```text
PII_ENCRYPTION_KEY=                 # base64 编码的 32 字节随机密钥，仅 profile
STRAVA_CLIENT_ID=36717              # strava-auth / strava-callback
STRAVA_CLIENT_SECRET=               # strava-auth / strava-callback
STRAVA_TOKEN_ENCRYPTION_KEY=        # base64 编码的 32 字节随机密钥，两函数必须一致
STRAVA_CALLBACK_URL=                # strava-callback 的公网 HTTPS 完整地址
```

缺失或非法密钥会 fail closed。不要把 secret、token、openid 或真实用户资料写入代码、fixture、日志或 CI。

## CloudBase bootstrap

`scripts/bootstrap-cloudbase.mjs` 管理 9 个集合、13 个业务索引、全拒绝客户端规则和 `_id=demo_activity_001` 演示活动。`oauth_states._id` 与 `state_hash` 保证唯一，`expires_at ASC` 是辅助应用层清理的普通索引，`openid ASC + expires_at DESC` 用于查询用户的活跃授权状态；CloudBase `UpdateTable` 不接受 TTL 参数，因此这里是**非物理 TTL，应用层过期 + 清理**。默认只生成 plan，不写远端：

```bash
npm run cloudbase:plan
# 经人工审核后才可运行：npm run cloudbase:apply
npm run cloudbase:verify
```

目标基线为 9 个集合、全拒绝客户端规则、13 个业务索引及 `demo_activity_001`。脚本仍保持默认只读；每个环境都必须先审阅 plan，再显式 apply 和 verify，不能把仓库契约视为远端已完成变更。

## 安装与验证

```bash
npm ci
npm run cloud:install
npm run format:check
npm run validate
npm run coverage
npm run audit:all
```

`cloud:prepare` 把共享领域代码复制到三个报名域函数，并把 `strava-shared/core.js`、`api.js` 复制到两个 Strava 部署目录；每个部署目录均使用 registry 依赖和独立 lockfile。

## 部署与联调顺序

1. 审阅 `cloudbase:plan`，创建/升级 8 个集合、规则和索引，再执行 verify。
2. 为 `profile` 配置 `PII_ENCRYPTION_KEY`，部署并用测试账号验证 get/update/getPhoneNumber。
3. 为 `strava-auth` 和 `strava-callback` 配置相同的 Strava 环境变量。
4. 依次部署 `auth`、`profile`、`strava-callback`、`strava-auth`、`activity-read`、`activity-admin`、`registration`、`admin-review`、`notification-send`。
5. 使用 `cloudbaserc.json` 的 `gateway.routes` 声明式维护 `/strava/callback`；测试环境已创建并验证该 HTTPS 路由。将完整地址配置到 Strava 应用回调设置，并把域名加入小程序 `web-view` 业务域名。
6. 用真实微信账号验证 openid、手机号授权、OAuth 回跳、同步、报名和管理员审批；随后做容量并发压测。

## 尚未实现

Strava 豁免审批、管理员配置、敏感资料明文查看、支付、签到与导出尚无后端能力。前端不会对这些能力伪成功。
