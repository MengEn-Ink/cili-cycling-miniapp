# CloudBase 数据契约与安全边界

所有业务集合客户端读写均拒绝，仅云函数访问。运行期身份只来自 `cloud.getWXContext().OPENID`；响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。任何日志和审计不得包含 PII、OAuth code、state 明文、Secret 或 token。

第一批手机号规则：微信授权号码标记为 wechat/verified；个人主体可手填号码，标记为 manual/unverified。两者都满足第一批报名门禁，管理员审批详情必须展示来源。

Strava 报名资格唯一事实源：`strava_credentials + strava_snapshots`。`profiles.strava` 仅为兼容展示缓存，不参与报名判定。

快照新鲜度为 24 小时；同步租约为 2 分钟。覆盖度只描述最近 90 天；第 5 页仍满 200 条时 `coverage_complete=false`。完整空窗口的统计值可为 0，未知或不完整值为 `null`。

## 集合

### `activities`

活动公开字段、`capacity`、`occupied_count`、`signup_deadline/event_start/event_end`、`status` 与内部审计字段。公开读取只允许 `published && is_deleted !== true`。管理员写入由独立 `activity-admin` 云函数负责：新建必须为 `draft`，状态仅允许 `draft → published → finished`，`finished` 为终态；容量不得低于事务内读取的 `occupied_count`，且必须满足 `signup_deadline < event_start < event_end`。

### `registrations`

`_id` 是 activity_id 与 openid 的确定性摘要；包含活动选项、脱敏 `profile_snapshot`、无 token 的 `strava_snapshot`、状态与审批历史。`pending + approved` 占位，提交/取消/驳回和名额更新在事务中完成。

### `profiles`

```text
_id: openid
nickname, title, avatar_file_id
photos: [{ file_id, category: ride|bike|other }]
gender, emergency_name
real_name_cipher, phone_cipher, emergency_phone_cipher: {
  v: 1, alg: A256GCM, iv, tag, ciphertext
}
real_name_masked, phone_masked, emergency_phone_masked
phone_source: wechat|manual
phone_verified: Boolean             # wechat=true, manual=false
strava: { status: connected|disconnected, snapshot? }
created_at, updated_at
```

三个敏感字段均用环境变量 `PII_ENCRYPTION_KEY`（base64 32 bytes）独立 AES-256-GCM 加密和随机 12-byte IV。证件信息不再采集、写入或返回；存量证件字段只读保留，不解密、不迁移，普通资料更新也不主动删除。密钥缺失/非法、密文认证失败均 fail closed。`getPhoneNumber` 接受微信动态 code 并调用 `cloud.openapi.phonenumber`，写入 `wechat/verified`；个人主体的 `update` 可写入手填号码，但必须写入 `manual/unverified`。响应不返回敏感明文或密文，只返回必要掩码、来源、验证状态、`sensitive_status` 与 `completeness`；管理员审批详情必须展示手机号来源。

### `notification_outbox`

审批事务内原子写入的订阅消息发件箱。`_id` 为审批轮次确定性 ID，包含 `type/aggregate_id/target_openid/template_key/payload/status/attempts/last_error/lease_expires_at/claimed_by/created_at/updated_at/sent_at`。状态机为 `pending|failed|租约过期的 sending -> sending -> sent|failed`：`sending` 使用 2 分钟租约，进程中断后可由定时 worker 重领；最多尝试 5 次，达到上限返回 `MAX_RETRIES_EXCEEDED`，并由 `status + attempts + lease_expires_at` 扫描索引在批次 `limit` 前排除耗尽任务，避免新任务饥饿。客户端 ACL 全拒绝，仅云函数可读写。

`notification-send` 配置每分钟 CloudBase timer `notification-outbox-worker`，以无 OPENID 的平台服务身份批量扫描并消费，不能依赖管理员账号在线；小程序手工调用仍必须通过管理员白名单。模板缺失与微信发送失败都会将任务明确写为 `failed` 并记录 `last_error`。模板 ID 只从环境变量 `REVIEW_APPROVED_TEMPLATE_ID`、`REVIEW_REJECTED_TEMPLATE_ID` 读取，不写入数据库或客户端。

### `admins`

`_id: openid`，并包含 `display_name/is_super/enabled`。管理员必须由服务端按 WXContext 查询，`enabled !== false`。

### `audit_logs`

`actor_openid/action/target_id/created_at/detail`。detail 只允许非敏感状态字段。

### `oauth_states`

```text
_id: sha256(state)              # 文档主键天然唯一
state_hash: sha256(state)       # 唯一索引
openid
expires_at                      # 应用层强制校验 10 分钟；普通 ASC 索引辅助清理
consumed_at?                    # callback 事务内一次性写入，存在即拒绝重放
created_at
```

state 原文至少 32 随机字节，只返回给发起授权的客户端，不落库。callback 在事务中原子检查并写入 `consumed_at`，再严格校验 `expires_at`；因此成功、失败或过期 state 均不可重放。当前 CloudBase `UpdateTable` 不接受 TTL 参数，本集合采用**非物理 TTL，应用层过期 + 限量清理**：`start/status` 每次最多删除 20 条已过期 state，不能以物理删除代替过期或重放校验。

### `strava_credentials`

```text
_id/openid, athlete_id, athlete_name
access_token_cipher, refresh_token_cipher: { v, alg, iv, tag, ciphertext }
token_expires_at, scopes, connected_at, updated_at
sync_status: pending|running|ready|failed
sync_error_code?: String
sync_started_at?: Date
sync_finished_at?: Date
sync_lease_id?: String
```

两个 token 使用 `STRAVA_TOKEN_ENCRYPTION_KEY`（base64 32 bytes）分别 AES-256-GCM 加密，永不进入客户端响应。

### `strava_snapshots`

```text
_id/openid
total_km, activities_90d, longest_km, total_elevation_m
weighted_avg_speed_kmh, latest_activity_at
coverage_from, coverage_to, coverage_complete
synced_at
```

只统计最近 90 天 Ride 类活动，排除 trainer/commute；每页 200，最多 5 页。第 5 页仍满 200 条时 `coverage_complete=false`。加权均速为总距离/总移动时间；完整空窗口的统计值可为 0，未知或不完整值为 `null`。

## 索引

| 集合 | 字段 | 属性 |
| --- | --- | --- |
| activities | status ASC, event_start ASC | 普通 |
| registrations | activity_id ASC, openid ASC | 唯一 |
| registrations | activity_id ASC, status ASC, created_at DESC | 普通 |
| registrations | openid ASC, created_at DESC | 普通 |
| audit_logs | actor_openid ASC, created_at DESC | 普通 |
| oauth_states | state_hash ASC | 唯一 |
| oauth_states | expires_at ASC | 普通；应用层过期与限量清理 |
| oauth_states | openid ASC, expires_at DESC | 普通；查询用户的活跃授权状态 |
| strava_credentials | openid ASC | 唯一 |
| strava_snapshots | openid ASC | 唯一 |
| strava_snapshots | synced_at DESC | 普通 |

## 主要错误码

`UNAUTHENTICATED`、`ADMIN_REQUIRED`、`FORBIDDEN_FIELD`、`VALIDATION_FAILED`、`PROFILE_INCOMPLETE`、`PHONE_CODE_REQUIRED`、`PII_KEY_INVALID`、`STRAVA_CONFIG_INVALID`、`STRAVA_KEY_INVALID`、`OAUTH_STATE_INVALID`、`OAUTH_STATE_EXPIRED`、`STRAVA_NOT_CONNECTED`、`STRAVA_API_FAILED`、`UNKNOWN_ACTION`、`INTERNAL_ERROR`。

## 部署后验证

1. 校验 8 集合、全拒绝规则与 11 索引，确认 `oauth_states.expires_at` 和 `oauth_states.openid + expires_at` 普通索引存在，并验证应用层过期、`consumed_at` 防重放及限量清理。
2. 真机验证 WXContext openid、微信手机号动态 code、手填手机号来源，以及资料响应中无明文/密文。
3. 配置 callback HTTPS 路由、Strava 回调域和小程序业务域名，验证 CSRF、过期与重放。
4. 验证 token 临期刷新、90 天分页、解绑审计及日志无敏感信息。
5. 在隔离活动中压测报名容量与审批事务。
