# CloudBase 数据契约与安全边界

所有业务集合使用客户端全拒绝 ACL，仅云函数访问。运行时身份只来自 `cloud.getWXContext().OPENID`；响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。日志和审计不得包含 PII、密钥、密文或第三方凭证。

## 个人信息展示规则

用户已确认（2026-10-13）：

- 本人和审核管理员可见的页面（报名表单、编辑资料、个人中心、本人报名凭证、审核后台）完整显示真实姓名、手机号和紧急联系人电话，不打星号。
- 其他骑友可见的地方（报名名单、骑友卡、公开主页）只显示昵称，接口不返回、页面不展示真实姓名和手机号。
- 后援车司机电话面向所有骑友公开，完整显示。
- 云端加密存储不变：`real_name_cipher`、`phone_cipher`、`emergency_phone_cipher` 仍以 `PII_ENCRYPTION_KEY` 加密；完整值只在 `profile`（本人）和 `admin-review`（管理员详情）中按请求解密返回。`*_masked` 字段仅为旧客户端兼容保留，不再用于页面展示。本规则只决定页面是否打星号。
- 日志、审计和证据文件仍不得包含 PII。

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

`_id` 是 `activity_id + openid` 的确定性摘要。包含活动选项、`profile_snapshot`（只存昵称、性别、`*_masked` 兼容字段和电话来源，不存明文实名和手机号；展示口径见“个人信息展示规则”）、状态、审批历史和可选队伍字段；不读取或对外投影第三方账号状态、快照或指标。

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

### `club_applications`

俱乐部创建申请与正式 `clubs` 分离。`_id` 是申请人可信 `openid` 的确定性摘要；一个申请人在 MVP 中只有一条当前申请链。

```text
applicant_openid
status: draft|pending_review|rejected|approved
review_version, last_submit_request_id, last_review_request_id
club_name, city, introduction, applicant_contact
join_mode: public_apply|invite_code|admin_invite
expected_size, activity_types, rules_summary, cover_file_id
rejection_reason, reviewed_by, submitted_at, reviewed_at
club_id（仅审批通过后写入）
created_at, updated_at
```

客户端数据库读写全拒绝，仅 `club-application` 云函数按 WXContext 读取本人申请。管理员列表、详情和审批均由服务端实时查询 `admins`。通过审批时在事务中以确定性 ID 创建 `clubs`、`OWNER` 的 `club_memberships` 和审计记录；重复审批返回同一结果，不重复创建资源。驳回原因必填，修改重提递增 `review_version`。

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

`route-maintenance` 使用保留文档 `__route_maintenance_v1__` 保存各集合稳定 `_id` 游标。定时任务只在预览创建超过 24 小时后回收对象；活动仍在引用或同摘要的新预览仍在使用时不会删除 GPX/PNG。历史账号集合仅在 `OAUTH_RETIREMENT_PURGE_ENABLED=1` 时按批清空，该开关必须在新路线链路运行时验收后才可开启。

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
| activities | club_id ASC, status ASC, event_start ASC |
| club_applications | status ASC, updated_at DESC |
| club_memberships | openid ASC, status ASC |
| club_memberships | club_id ASC, openid ASC, status ASC |
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

bootstrap 当前管理 12 集合、全拒绝规则与 33 索引。`route_previews` 与 `club_applications` 使用客户端全拒绝 ACL。

## 部署后验证

1. 执行 `npm run cloudbase:plan`，审核后运行 apply 与 verify。
2. 应用并回读 `cloudstorage.rules.json`，确认客户端只能写本人 `profiles/`、`activity-routes/<openid>/` 与 `club-applications/<openid>/` staging 路径。
3. 部署 `route-maintenance`，回读维护定时器；官方路线页已下线，不再部署 `route-web` 或配置 `/route/embed` 网关。
4. 核对资料、报名和审核响应不含历史账号字段；保持 purge 关闭并完成官方路线查看、GPX 上传/保存/下载及失败回退验收。
5. 验收通过后临时开启 purge，等待旧集合、兼容字段和旧预览清空并回读，再移除开关和线上旧资源。
