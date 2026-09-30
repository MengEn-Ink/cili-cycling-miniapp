# CloudBase 数据契约与安全边界

所有业务集合客户端读写均拒绝，仅云函数访问。运行期身份只来自 `cloud.getWXContext().OPENID`；响应统一为 `{ ok: true, data }` 或 `{ ok: false, error }`。任何日志和审计不得包含 PII、OAuth code、state 明文、Secret 或 token。

第一批手机号规则：微信授权号码标记为 wechat/verified；个人主体可手填号码，标记为 manual/unverified。两者都满足第一批报名门禁，管理员审批详情必须展示来源。

Strava 报名资格唯一事实源：`strava_credentials + strava_snapshots`。`profiles.strava` 仅为兼容展示缓存，不参与报名判定。

快照新鲜度为 24 小时；同步租约为 2 分钟。覆盖度只描述最近 90 天；第 5 页仍满 200 条时 `coverage_complete=false`。完整空窗口的统计值可为 0，未知或不完整值为 `null`。

## 集合

### `activities`

活动公开字段、`capacity`、`occupied_count`、`occupancy_partition_ready`、两类分仓计数、单调递增 `version`、`signup_deadline/event_start/event_end`、`status` 与内部审计字段。公开读取只允许 `published && is_deleted !== true`。管理员写入由独立 `activity-admin` 云函数负责：新建必须为 `draft`，状态仅允许 `draft → published → finished`，`finished` 为终态；更新必须携带详情响应中的 `expectedVersion`，事务内不一致时返回 `ACTIVITY_CONFLICT`；活动容量上限为 1000，且不得低于事务内读取的 `occupied_count`，并必须满足 `signup_deadline < event_start < event_end`。旧活动首次保存分仓时在事务内完整读取全部 `pending + approved` 报名并按集合方式回填，自动回填最多处理 1000 个占位；容量或占位数超限、未知集合方式、分页失败或总数不一致都以 `PARTITION_BACKFILL_REQUIRED` 阻断且不写入。

### `registrations`

`_id` 是 activity_id 与 openid 的确定性摘要；包含活动选项、脱敏 `profile_snapshot`、无 token 的 `strava_snapshot`、状态与审批历史。`pending + approved` 占位，提交/取消/驳回和名额更新在事务中完成。

### `profiles`

```text
_id: openid
nickname, title
avatar_source: wechat|strava|custom
avatar_file_id, avatar_revision       # 每次头像槽位变化时单调递增
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

### `profile_media`

```text
_id: sha256(file_id)
file_id
source_file_id                 # 与 file_id 相同，显式标记客户端兼容引用
canonical_file_id              # server-owned、content-addressed 展示对象
sha256, size, mime             # canonical 对应的已验证字节版本
owner_openid
category: ride|bike|other
origin: wechat|strava|custom
status: unreferenced|active|deleting|deleted|delete_failed|delete_failed_terminal
created_at
cleanup_after                 # unreferenced 上传 24 小时后的回收候选时间
referenced_at?                # profile update 成功引用时间
delete_lease_id?, delete_claimed_at?, delete_lease_expires_at?, delete_attempts?
deleted_at?, delete_failed_at?, retry_at?, last_error_code?
```

客户端先调用 `profile/mediaUploadPath` 取得由 `PROFILE_MEDIA_PATH_SECRET` 和可信 WXContext OPENID 派生的 opaque owner staging 路径，上传成功后立即调用 `profile/registerMedia`。服务端通过临时 URL HEAD 与有界 GET 验证实际对象，计算 SHA-256，并把相同字节写入 `profile-canonical/<owner-alias>/<source-hash>/<content-hash>.<ext>`。登记初始状态为 `unreferenced` 且幂等，并绑定 source/canonical/hash/size/mime；只有同一事务内成功写入当前 profile 的媒体才切换为 `active`，被移除的 active 媒体在同一事务内降级为带新 `cleanup_after` 的 `unreferenced`。资料更新仍使用 source ID 兼容旧客户端；个人名片和管理员名片只为 owner/status/current-reference 都匹配的 canonical ID 签 URL。存量未登记或未 canonicalize 的 legacy 媒体不迁移、不删除，但不进入任何能力卡。

`profile-media-cleanup` 每 10 分钟最多处理 20 条到期 `unreferenced`、过期 `deleting` 或到期 `delete_failed` 记录。该函数必须配置与 `profile` 相同的 `PROFILE_MEDIA_PATH_SECRET`。每条记录均在事务内重读 owner 当前 profile：仍被引用则恢复 `active`；未引用才写入唯一且有过期时间的删除 lease 并调用云存储删除。worker 中断后可 fenced 重领；失败或过期 recovery 合计最多尝试 3 次，随后进入 `delete_failed_terminal`，避免永久重试和索引饥饿。结果只保存稳定 `last_error_code`，不记录底层错误文本。微信/自定义上传在 `registerMedia` 与对象删除同时失败时仍由客户端 `reportOrphan` 账本补偿；Strava 服务端导入不依赖客户端账本，使用下述持久 intent。

### `profile_media_imports`

服务端 Strava 头像导入与客户端直传图片的 durable intent/orphan 补偿状态机。客户端无读写权限，也不能提交 URL、credential、generation 或 lease：

```text
_id: avatar-import-<uuid> | client-upload-<sha256(cloud_path)>
kind?: client_upload|canonical_upload # 缺失表示 Strava 服务端导入
owner_openid, athlete_id?, credential_generation?, avatar_url_fingerprint?
cloud_path                         # 上传前持久化的 owner HMAC 路径
file_id?, media_id?                # 上传响应验证通过后写入
status: leased|prepared|uploaded|orphaned|recovering|deleting|delete_confirming|completed|aborted|invalid|deleted|delete_failed|delete_failed_terminal
created_at, lease_expires_at, prepared_at?, uploaded_at?, completed_at?, failed_at?
cleanup_after, delete_lease_id?, delete_claimed_at?, delete_lease_expires_at?
delete_attempts?, retry_at?, recovery_delete_pending?, delete_confirmation_pending?, last_error_code?
```

下载前先在事务中创建 `leased` intent，并以当前 credential 的 generation、athlete ID 与头像 URL SHA-256 指纹绑定 owner 级 lease；不持久化原头像 URL。未过期的其他 intent 会被拒绝，同一 intent 可幂等复用，只有 lease 过期后才能 fenced takeover。下载完成后再次核对同一 fence，写入 owner HMAC `cloud_path` 并进入 `prepared`，随后 upload、完成和失败路径都继续核对该 fence。最终事务重读 credential、intent、profile 和 media，只有 athlete、generation、URL 指纹、lease 及 owner 路径全部匹配时，才原子登记 `origin=strava` 并切换头像。失败后有上传目标的 intent 进入 `orphaned`，尚未生成目标的 `leased` intent 进入 `aborted`。

微信/自定义头像和个人照片在 `mediaUploadPath` 返回前创建 `kind=client_upload,status=prepared` 的确定性 intent，`cleanup_after` 为 30 分钟。`registerMedia` 在任何特权存储读取前校验 owner HMAC 路径，成功后在同一事务写 `profile_media` 并把 intent 标记为 `completed`。旧客户端仍可忽略新增账本；服务端按 cloudPath 推导 intent ID，因此滚动升级期间不要求客户端回传新字段。

服务端复制 canonical 对象前另建 `kind=canonical_upload,status=prepared` intent，并把 source intent 绑定到同一 canonical path/hash/size/mime。任何一步失败时两个 intent 都保留给 cleanup；登记成功时 registry 与两个 intent 在同一事务完成。`profile_media` 解除全部引用后，cleanup 在同一 fenced 删除中同时删除 source 与 canonical 对象。

`cloudstorage.rules.json` 只允许已登录客户端写 `profiles/` staging 前缀且要求资源 owner 与当前身份一致；`profile-canonical/` 不满足客户端写规则，只能由云函数/控制台创建。规则应用与回读后，部署 smoke 必须用真实小程序身份尝试覆盖 canonical path 并确认被拒绝。

若上传响应丢失，cleanup 会先用共享 secret 验证 `owner_openid` 与 HMAC 路径绑定，再对该 intent 的唯一 owner 路径写入最小占位以取得规范 file ID，并执行 fenced 删除。恢复 lease 固定为 5 分钟，显式大于 `profile-media-cleanup` 的 30 秒函数超时与 30 秒存储 settle margin；恢复任务在外部上传前后都重读 lease，旧 worker 丢失 lease 时重新持久化删除 fence 后才补偿。恢复型删除先进入 `delete_confirming`，延迟一个 5 分钟 lease 窗口后再做第二次删除并终结，从而收敛先前调用晚到的存储写。任何待删除 file ID 必须与 intent 的 `cloud_path` 完全一致。

### `notification_outbox`

审批事务内原子写入的订阅消息发件箱。`_id` 为审批轮次确定性 ID，包含 `type/aggregate_id/target_openid/template_key/payload/status/attempts/attempt_no/last_error/lease_id/lease_expires_at/next_retry_at/claimed_by/dispatch_started_at/dispatch_outcome/created_at/updated_at/sent_at`。自动发送采用 `pending|retryable -> claimed -> dispatching -> sent|retryable|failed_terminal|delivery_unknown` 状态机：每次 claim 生成唯一 `lease_id` 并递增 `attempt_no`，所有后续写入都必须在事务内同时匹配 `status + lease_id + attempt_no`。短暂并发拒绝按 attempt 使用 1、2、4、8、15 分钟的有上限指数退避；日配额错误 `45009` 则推迟到上海时区次日 00:05，避免在配额恢复前耗尽尝试次数。`next_retry_at` 到达前不会进入 ready 列表。过期 `claimed` 可安全重领；`dispatching` 表示外部调用可能已发生，过期后根据已持久化的 `dispatch_outcome` 恢复为 `retryable` 或 `failed_terminal`，没有可靠 outcome 时才隔离为 `delivery_unknown`，禁止自动重发。最多尝试 5 次，并由租约扫描索引和 `status + attempts + next_retry_at` 重试索引在批次 `limit` 前排除未到期、耗尽和不可自动发送的任务；ready 扫描在 immediate、到期 retryable、过期 claimed 三组间轮转取数，任一组持续满额都不会饿死其他组。客户端 ACL 全拒绝，仅云函数可读写。

`notification-send` 配置每分钟 CloudBase timer `notification-outbox-worker`，以无 OPENID 的平台服务身份批量扫描并消费，不能依赖管理员账号在线；小程序手工发送仍必须通过管理员白名单。模板缺失等发送前错误进入 `retryable`；微信明确拒绝时先 fenced 写入 `dispatch_outcome`，再将任务转为 `retryable` 或 `failed_terminal`，最终状态 ACK 失败只重试数据库写，恢复器随后可依据 outcome 安全收敛。网络错误、SDK `errCode=-1`、未识别的 provider code、worker 在 dispatch 后丢失以及发送成功后的数据库 ACK 失败均进入 `delivery_unknown`。任何 ACK 重试都绝不再次调用微信。登录用户可通过只读 `subscription-config` action 获取这两个审核模板 ID 以在报名点击时请求订阅，无需管理员权限；接口只从环境变量 `REVIEW_APPROVED_TEMPLATE_ID`、`REVIEW_REJECTED_TEMPLATE_ID` 构造 allowlist，不返回其他配置，也不把模板 ID 写入 outbox 或客户端可写数据。

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
_id/openid, athlete_id, athlete_name, athlete_avatar_url?
credential_generation                 # 每次 OAuth credential 保存单调递增
avatar_import_lease_id?, avatar_import_started_at?, avatar_import_lease_expires_at?
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
| activities | created_by ASC, event_start DESC | 普通；成员管理列表 |
| registrations | activity_id ASC, openid ASC | 唯一 |
| registrations | activity_id ASC, status ASC, created_at DESC | 普通 |
| registrations | openid ASC, created_at DESC | 普通 |
| audit_logs | actor_openid ASC, created_at DESC | 普通 |
| notification_outbox | status ASC, attempts ASC, lease_expires_at ASC | 普通；待发送与过期 claim 扫描 |
| notification_outbox | target_openid ASC, created_at DESC | 普通；用户通知历史查询 |
| notification_outbox | status ASC, attempts ASC, next_retry_at ASC | 普通；到期重试扫描 |
| profile_media | owner_openid ASC, status ASC, created_at DESC | 普通；owner 媒体查询 |
| profile_media | status ASC, cleanup_after ASC | 普通；未引用媒体回收扫描 |
| profile_media | status ASC, delete_lease_expires_at ASC | 普通；中断删除重领扫描 |
| profile_media | status ASC, retry_at ASC | 普通；失败退避重试扫描 |
| profile_media_imports | status ASC, cleanup_after ASC | 普通；待回收导入扫描 |
| profile_media_imports | status ASC, delete_lease_expires_at ASC | 普通；中断导入清理重领扫描 |
| profile_media_imports | status ASC, retry_at ASC | 普通；导入清理失败退避扫描 |
| oauth_states | state_hash ASC | 唯一 |
| oauth_states | expires_at ASC | 普通；应用层过期与限量清理 |
| oauth_states | openid ASC, expires_at DESC | 普通；查询用户的活跃授权状态 |
| strava_credentials | openid ASC | 唯一 |
| strava_snapshots | openid ASC | 唯一 |
| strava_snapshots | synced_at DESC | 普通 |

## 主要错误码

`UNAUTHENTICATED`、`ADMIN_REQUIRED`、`FORBIDDEN_FIELD`、`VALIDATION_FAILED`、`ACTIVITY_CONFLICT`、`PARTITION_BACKFILL_REQUIRED`、`PROFILE_INCOMPLETE`、`PHONE_CODE_REQUIRED`、`PII_KEY_INVALID`、`STRAVA_CONFIG_INVALID`、`STRAVA_KEY_INVALID`、`OAUTH_STATE_INVALID`、`OAUTH_STATE_EXPIRED`、`STRAVA_NOT_CONNECTED`、`STRAVA_AVATAR_BUSY`、`STRAVA_AVATAR_STALE`、`STRAVA_AVATAR_STATE_UNKNOWN`、`STRAVA_AVATAR_CLEANUP_PENDING`、`STRAVA_API_FAILED`、`UNKNOWN_ACTION`、`INTERNAL_ERROR`。

## 部署后验证

1. 校验 11 集合、全拒绝规则与 22 索引，确认 `activities.created_by + event_start`、`notification_outbox` 的 lease、目标与 retry 索引，`profile_media` 与 `profile_media_imports` 的 cleanup、delete lease 与 retry 索引，以及 `oauth_states.expires_at` 和 `oauth_states.openid + expires_at` 普通索引存在，并验证应用层过期、`consumed_at` 防重放及限量清理。
2. 真机验证 WXContext openid、微信手机号动态 code、手填手机号来源，以及资料响应中无明文/密文。
3. 配置 callback HTTPS 路由、Strava 回调域和小程序业务域名，验证 CSRF、过期与重放。
4. 验证 token 临期刷新、90 天分页、解绑审计及日志无敏感信息；验证跨用户媒体拒绝、未登记 legacy 不进卡、register 失败回收上传对象，以及临时 URL 故障降级。
5. 在隔离活动中压测报名容量与审批事务。
