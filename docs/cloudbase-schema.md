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

### `clubs` 与 `club_memberships`

`clubs.max_members` 为 `2..10000` 的整数；审批创建时使用申请的 `expected_size`，`member_count` 以 OWNER 为 1 初始化。`member_count` 是容量判断的强一致计数，公开加入必须在同一事务读取俱乐部和确定性 membership，只有新建 active membership 才更新同一俱乐部文档并加一；重复加入不增加。对缺少容量字段的历史俱乐部，事务内按 active memberships 实数回填 `member_count`，并以 `max(50, member_count)` 初始化 `max_members`。管理员修改上限不得低于当前 active 成员数，并继续使用 `expectedUpdatedAt` 乐观锁和 `requestId` 幂等审计。

```text
clubs: name, city, introduction, avatar_url, join_mode
clubs: approval_status, status, owner_openid, source_application_id
clubs: member_count, max_members, created_at, updated_at
club_memberships: club_id, openid, role, status, created_at, updated_at
```

公开加入容量已满返回 `CLUB_FULL`；非法上限返回 `INVALID_MAX_MEMBERS`；低于当前人数返回 `MAX_MEMBERS_BELOW_CURRENT`。

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

资料删除相关字段为 `generation / privacy_request_id / privacy_generation`；`privacy_manual_review` 表示目标、引用或重试需要受控人工核验，不能视为对象已删除。个人媒体按类别与实际跨业务引用判断，不按 owner 删除活动或俱乐部图片。

```text
_id: sha256(file_id)
file_id, source_file_id, canonical_file_id
sha256, size, mime
owner_openid
category: ride|bike|other
origin: wechat|custom
status: unreferenced|active|deleting|deleted|delete_failed|delete_failed_terminal
security_status: missing|pending|retryable|pass|review|risky
security_trace_id, security_error_code, security_submitted_at, security_decided_at
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

### `content_media_checks`

微信图片异步审核的服务端账本，客户端读写全拒绝。审核受理只写 `pending`，不能当作通过：

```text
_id = trace_id
trace_id, media_id, owner_openid, category
generation, canonical_file_id, sha256
status: pending|pass|review|risky
attempts, submitted_at, decided_at, updated_at
detail_count
```

`content-callback` 只接受 `/content/callback` 匿名网关上的微信安全模式消息，校验
Token 签名、AES 解密后的 AppID、事件类型、trace 及完整媒体绑定。回调早于账本事务可见时返回可重试
5xx；坏签名或坏消息返回 4xx；重复终态回调幂等成功。只有当前 generation、canonical
文件和摘要完全匹配且结果为 `pass` 时，业务保存才能激活媒体。

### `privacy_requests`

客户端读写均拒绝，仅 `profile` 的可信本人入口和配置的 `privacy-maintenance-worker` Timer 访问。

```text
_id: deletion-<sha256([trusted_openid, requestId])>
owner_openid, kind: profile_deletion, policy_version, generation
status: requested|processing|awaiting_media|restricted|retryable|manual_review|completed
phase, cursors, attempts, retry_at, lease_id, lease_expires_at
last_error_code, created_at, updated_at, completed_at, signed_url_not_after
media_targets: deduplicated personal file references from profile and registration snapshots
replay_epoch: private recovery-run fence (absent on normal deletion)
```

请求不保存姓名或电话原值；原媒体目标仅限受控内部恢复，不在 DTO 下发。`profiles` 保留 generation、删除请求 ID 与状态 sentinel，普通读取不创建资料。删除锁与资料写入、报名、审批、核销和候补晋升读取同一事务文档；取消/驳回仍可释放现有名额，不自动取消活动。

报名实际 `profile_snapshot` 和非必要备注分批清除，并标记 `privacy_generation / privacy_public_suppressed`。清除快照的同一事务先去重持久登记头像、背景与照片目标；登记上限为 256 个，超限保留已抑制公开的原快照并转人工恢复，不能截断丢失目标。无可信 registry 或精确删除 intent 的孤儿目标保留在账本中，不能完成。资料查询失败或缺失时，公开投影不回退个人快照。未结束或结束时间未知的现场必要联络以 `privacy_contact` 暂存加密字段，只有审核管理员按该报名读取；活动结束或报名取消后继续清除。`restricted` 和 `manual_review` 均不是完成。角色、活动、占位与审计关联不在本次删除范围。

**受控备份恢复：** 先隔离恢复环境并禁止用户流量，覆盖恢复最新持久删除账本，再由无 WX 用户身份的受控服务入口以配置 Timer 信封及 `ReplayRequestId` 重放已完成删除。重放建立私有 `replay_epoch`，旧媒体即使数据库标为 `deleted` 也须重新获得当前 epoch 的存储删除或可信不存在确认；媒体行用 `privacy_replay_epoch / privacy_deleted_epoch` 记录本轮登记与确认，历史租约回调不得写入新轮次，耗尽或歧义目标仍转人工处理。更高 generation 的 profile、报名和媒体保持不变，旧账本独立清理可归属的旧 generation 数据，且不能借用新资料联络字段。

Timer 返回普通 `{ processed, failed }`；提供 `ReplayRequestId` 时另含 `replay`：`{ status: "queued"|"already_running", generation }` 或 `{ status: "blocked", code }`。`queued` 只是本轮入队，不是删除完成；阻塞码包括 `DELETION_NOT_FOUND`、`DELETION_NOT_COMPLETED`、`PROFILE_REQUEST_CONFLICT`、`MEDIA_TARGET_ACCOUNTING_LIMIT`，阻塞不改写目标请求或资料。每条请求完成并复核实际快照、当前 epoch 媒体删除与相应 sentinel/更新资料后才允许恢复流量；不得先公开旧快照。此入口不能替代人工核验、法律保留裁决或存储地址回验。

`profile/requestDeletion` 确认 `policyVersion=2026-10-21`、`scope=self-profile-and-personal-media`、`confirmed=true` 与独立请求 ID。`deletionStatus` 返回持久阶段而非受理即成功；仅完成后 `recreate` 才递增 generation，此后所有个人写入必须携带当前 generation。已签发地址最长剩余有效期单独记录，停止新签发不等于对象删除或撤回他人保存的图片。

该集合继续用于微信/自定义图片上传补偿，不再承担第三方头像导入。

### Strava OAuth 与撤销状态

Strava 仅用于活动管理员按官方路线 URL 导入 GPX，不写入 `profiles`：

```text
strava_credentials: _id/openid = 可信 WXContext OPENID
owner_openid, athlete_id, athlete_name
access_token_cipher, refresh_token_cipher (AES-256-GCM)
oauth_generation, profile_generation, revision
token_expires_at, connected_at, updated_at

oauth_states: _id = sha256(随机 state)
state_hash, owner_openid, oauth_generation, profile_generation
created_at, expires_at, consumed_at

strava_authorizations: _id = owner_openid
generation, profile_generation, mode, pending_count, manual_count, operation_id

strava_operations: _id = 随机操作 ID
owner_openid, oauth_generation, profile_generation, kind, status, expires_at

strava_revocations: _id = 随机撤销材料 ID
owner_openid, generation, token_cipher, status, attempts, retry_at
lease_id, lease_expires_at, last_error_code

strava_route_sources: _id = sha256(cloud_path)
owner_openid, cloud_path, oauth_generation, profile_generation
```

客户端对以上集合均全拒绝。原始 state 只出现在短时授权 URL 中，数据库仅保存哈希；callback 单次消费时同时核对 OAuth/profile generation 并持久预留 mint 操作。`disconnect` 先递增 generation、移除正常凭证并仅保留加密撤销材料；配置的隐私 Timer 每轮最多处理 2 份材料，使用 30 秒租约、最多 8 次尝试和 1 分钟至 1 小时指数退避调用官方 `/oauth/revoke`，单次外部请求 8 秒超时。HTTP 200（包括 token 已不存在）才完成该材料；400/401 转人工核验，503/网络或超时继续重试。旧 callback、refresh、导入和路线预览不能越过 generation fence，迟到 mint 材料进入受限撤销队列。已绑定活动 GPX 不批量删除。

可信本人可调用 `status` 与 `disconnect`，管理员资格只约束 `start` 与 `importRoute`。状态 DTO 仅返回 `{ state, generation, import_ready, revocation_complete, athlete_name }`；`state` 为 `disconnected|authorizing|connected|revocation_pending|manual_review`，不返回 token、密文、原始标识或上游响应。`STRAVA_CLIENT_SECRET` 和严格 base64 的 32 字节 `STRAVA_TOKEN_ENCRYPTION_KEY` 只通过云函数环境变量注入到需要的函数。

### `route_previews`

组织者上传 GPX 后产生的两小时可信预览。记录绑定 `owner_openid`、文件路径、SHA-256、解析指标、路线轮廓、海拔曲线、生成图和 `expires_at`。保存活动时按 owner、摘要、来源文件、生成图和目标活动进行事务校验与消费。

`route-maintenance` 使用保留文档 `__route_maintenance_v1__` 保存各集合稳定 `_id` 游标。定时任务只在预览创建超过 24 小时后回收对象；活动仍在引用或同摘要的新预览仍在使用时不会删除 GPX/PNG。当前 Strava OAuth 与撤销集合是路线导入运行时状态，不得由历史 OAuth 清理开关删除。

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
| content_media_checks | status ASC, updated_at ASC, _id ASC |
| route_previews | expires_at ASC |
| route_previews | owner_openid ASC, expires_at ASC |
| strava_revocations | status ASC, retry_at ASC, _id ASC |
| strava_revocations | owner_openid ASC, status ASC, retry_at ASC, _id ASC |
| strava_operations | status ASC, expires_at ASC, _id ASC |
| strava_operations | owner_openid ASC, status ASC, expires_at ASC, _id ASC |
| audit_logs | actor_openid ASC, created_at DESC |

资料删除新增稳定游标索引：`privacy_requests(status, retry_at, _id)`、`registrations(openid, _id)`、`profile_media / profile_media_imports(owner_openid, _id)` 及两媒体集合的 `(privacy_request_id, _id)`，均为 ASC。

bootstrap 当前管理 20 集合、全拒绝规则与 47 索引。`content_media_checks`、`privacy_requests`、`route_previews`、全部 Strava OAuth/撤销集合与 `club_applications` 使用客户端全拒绝 ACL。

## 部署后验证

1. 执行 `npm run cloudbase:plan`，审核后运行 apply 与 verify。
2. 应用并回读 `cloudstorage.rules.json`，确认客户端只能写本人 `profiles/`、`activity-routes/<openid>/` 与 `club-applications/<openid>/` staging 路径。
3. 部署 `content-callback`，以受控 Secret 注入 `WECHAT_CALLBACK_TOKEN`、`WECHAT_CALLBACK_AES_KEY` 和 `WECHAT_APP_ID`；声明式应用并回读 `/content/callback` 匿名网关，完成 GET 校验与安全模式审核回调实测。
4. 部署 `route-maintenance`，回读维护定时器；官方路线页已下线，不再部署 `route-web` 或配置 `/route/embed` 网关。
5. 核对资料、报名和审核响应不含历史账号字段；保持 purge 关闭并完成官方路线查看、GPX 上传/保存/下载及失败回退验收。
6. 验收通过后临时开启 purge，等待旧集合、兼容字段和旧预览清空并回读，再移除开关和线上旧资源。
