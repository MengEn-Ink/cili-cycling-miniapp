# CloudBase 数据契约与安全边界

所有业务集合使用客户端全拒绝 ACL，仅云函数访问。运行时身份只来自 `cloud.getWXContext().OPENID`；响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。日志和审计不得包含 PII、密钥、密文或第三方凭证。

## 集合

### `activities`

活动、容量、时间、媒体和路线事实。官方公开路线只保存：

```text
external_provider: strava
external_route_id
external_route_url
```

组织者上传 GPX 后，服务端可信预览可写入：

```text
gpx_file_id, gpx_preview_id, gpx_sha256
generated_preview_file_id
route_name
distance_km, elevation_m, elevation_loss_m
elevation_min_m, elevation_max_m
estimated_moving_time_seconds, estimation_source: cili
elevation_profile, route_outline, route_bounds
```

客户端不能提交解析指标作为可信事实。新 GPX 必须先经 `activity-admin/previewRouteGpx` 解析，再在保存活动的事务中消费对应预览。已绑定活动后可从活动自身继承可信指标。

### `registrations`

`_id` 是 `activity_id + openid` 的确定性摘要。包含活动选项、脱敏 `profile_snapshot`、状态、审批历史和可选队伍字段；不读取或对外投影第三方账号状态、快照或指标。

状态为 `waiting|pending|approved|checked_in|rejected|cancelled`。`waiting` 不占位，`pending + approved + checked_in` 占位；取消或驳回释放名额并按 FIFO 规则补位。

### `profiles`

```text
_id: openid
nickname, title, gender, emergency_name
avatar_source: wechat|custom
avatar_file_id, avatar_revision
avatar_visibility, avatar_visibility_revision
photos, background_photo
real_name_cipher, phone_cipher, emergency_phone_cipher
real_name_masked, phone_masked, emergency_phone_masked
phone_source: wechat|manual
phone_verified
created_at, updated_at
```

个人名片只返回 `generated_at`、`profile` 和 `backgrounds`。资料、报名和审核响应均不包含第三方账号指标。

### `admins`

`_id: openid`，并包含 `display_name/is_super/enabled`。管理员身份由服务端按 WXContext 查询。

### `audit_logs`

`actor_openid/action/target_id/created_at/detail`。`detail` 仅允许非敏感业务状态。

### `notification_outbox`

审批、候补和活动提醒的订阅消息发件箱。状态机为：

```text
pending|retryable -> claimed -> dispatching
dispatching -> sent|retryable|failed_terminal|delivery_unknown
```

所有完成写入均以 `status + lease_id + attempt_no` fencing；外部发送结果不明确时禁止自动重发。

### `profile_media`

```text
_id: sha256(file_id)
file_id, source_file_id, canonical_file_id
sha256, size, mime
owner_openid
category: ride|bike|other
origin: wechat|custom
status: unreferenced|active|deleting|deleted|delete_failed|delete_failed_terminal
cleanup_after, referenced_at
delete_lease_id, delete_lease_expires_at, delete_attempts
retry_at, last_error_code
```

只有 owner、当前资料引用、状态和 canonical 内容元数据完整匹配时才签发临时 URL。

### `profile_media_imports`

客户端 staging 上传和服务端 canonical copy 的 durable intent：

```text
_id: client-upload-<sha256> | canonical-upload-<sha256>
kind: client_upload|canonical_upload
owner_openid
cloud_path
file_id, media_id, canonical_file_id
status: prepared|orphaned|recovering|deleting|delete_confirming|completed|invalid|deleted|delete_failed|delete_failed_terminal
cleanup_after, delete_lease_expires_at, retry_at
```

该集合继续用于微信/自定义图片上传补偿，不再承担第三方头像导入。

### `route_previews`

组织者上传 GPX 后产生的两小时可信预览。记录绑定 `owner_openid`、文件路径、SHA-256、解析指标、路线轮廓、海拔曲线、生成图和 `expires_at`。保存活动时按 owner、摘要、来源文件、生成图和目标活动进行事务校验与消费。

## 受管索引

| 集合 | 字段 |
| --- | --- |
| activities | status ASC, event_start ASC, _id ASC, event_end ASC |
| activities | status ASC, event_end DESC, _id DESC, event_start DESC |
| activities | status ASC, event_start ASC |
| activities | status ASC, event_end ASC, event_start ASC |
| activities | status ASC, event_end ASC, event_start DESC |
| activities | created_by ASC, event_start DESC |
| activities | status ASC, is_deleted ASC, event_start DESC, _id DESC |
| activities | created_by ASC, status ASC, is_deleted ASC, event_start DESC, _id DESC |
| registrations | activity_id ASC, openid ASC |
| registrations | activity_id ASC, status ASC, created_at DESC |
| registrations | activity_id ASC, status ASC, _id ASC |
| registrations | activity_id ASC, status ASC, options.gathering_mode ASC, created_at ASC |
| registrations | activity_id ASC, team_id ASC, is_team_leader ASC |
| registrations | openid ASC, created_at DESC |
| registrations | openid ASC, created_at DESC, _id DESC |
| notification_outbox | status ASC, attempts ASC, lease_expires_at ASC |
| notification_outbox | target_openid ASC, created_at DESC |
| notification_outbox | status ASC, attempts ASC, next_retry_at ASC |
| profile_media | owner_openid ASC, status ASC, created_at DESC |
| profile_media | owner_openid ASC, origin ASC, status ASC, _id ASC |
| profile_media | status ASC, cleanup_after ASC |
| profile_media | status ASC, delete_lease_expires_at ASC |
| profile_media | status ASC, retry_at ASC |
| profile_media_imports | status ASC, cleanup_after ASC |
| profile_media_imports | status ASC, delete_lease_expires_at ASC |
| profile_media_imports | status ASC, retry_at ASC |
| route_previews | expires_at ASC |
| route_previews | owner_openid ASC, expires_at ASC |
| audit_logs | actor_openid ASC, created_at DESC |

bootstrap 当前管理 9 集合、全拒绝规则与 29 索引。`route_previews` 使用客户端全拒绝 ACL。

## 部署后验证

1. 执行 `npm run cloudbase:plan`，审核后运行 apply 与 verify。
2. 应用并回读 `cloudstorage.rules.json`，确认客户端只能写本人 `profiles/` 与 `activity-routes/<openid>/` staging 路径。
3. 部署 `route-web` 并回读 `/route/embed` 网关；该函数只渲染官方 Embed，不抓取路线页面。
4. 核对资料、报名和审核响应不含历史账号字段；旧集合与字段由迁移清理任务有界删除。
5. 在开发者工具和真机验证官方路线查看、GPX 原生详情与原件下载。
