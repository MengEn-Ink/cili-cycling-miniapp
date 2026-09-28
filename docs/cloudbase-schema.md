# CloudBase 数据契约与安全边界

> 适用范围：一期活动只读、队员报名/我的报名、管理员审批。所有业务读写均经云函数；小程序端不直连以下集合。

## 1. 统一约定

- 时间字段使用 CloudBase `Date`（种子数据可用 ISO 8601，写入时转换为 Date）。
- 所有运行期身份只来自 `cloud.getWXContext().OPENID`。客户端的 `openid / role / status / capacity / occupied_count / amount / price / review_* / serial_no` 会被拒绝。
- 响应统一为 `{ ok: true, data }` 或 `{ ok: false, error: { code, message, details? } }`。
- 软删除统一为 `is_deleted: true`；活动公开查询只接受 `status=published && is_deleted!==true`。
- 建议将五个集合的客户端安全规则设为**所有客户端读写均拒绝**（控制台中选择“仅云函数可读写”或等价自定义规则）。即使活动是公开信息，也由 `activity-read` 做字段白名单，避免内部字段泄漏。

## 2. 集合字段

### `activities`

```text
_id: string
title, cover_image, description: string
schedule: [{ time, title, location, remark? }]
route: { start, end, distance_km, elevation_m, level, gpx_file_id? }
notices, equipment: string[]
fee: { included: string[], excluded: string[], remark: string } // 仅说明，不是支付金额
capacity: integer > 0
occupied_count: integer >= 0       // pending + approved
signup_deadline, event_start, event_end: Date
status: draft | published | finished
is_deleted: boolean
created_by, created_at, updated_at  // 内部字段，不对队员响应
```

公开白名单不含 `created_by / created_at / updated_at / is_deleted`。`occupied_count` 是真实占位，口径严格为 `pending + approved`。

### `registrations`

```text
_id: "reg_" + sha256(activity_id + NUL + openid) // 确定性唯一键
activity_id, openid: string
status: pending | approved | rejected | cancelled
options: { bike_mode: own | rent, experience: beginner | intermediate | regular,
           rental_need: string, remark: string }
profile_snapshot: {
  nickname: string,
  real_name_masked, phone_masked, id_number_masked: string
}                                      // 只落脱敏展示值，不落明文
strava_status: connected | exempted
strava_snapshot?: {                    // 只允许统计白名单，绝不含 token
  years_on_strava, rides_per_month, activities_90d, activities_4w,
  longest_km, longest_name, max_elevation_m, max_elevation_name,
  weighted_avg_speed_kmh, race_count, races, clubs, primary_club_name,
  bikes, coverage, connected_at
}
exemption?: { reason, at }
review_history: [{ reviewer_openid, reviewed_at, action: approve | reject, comment }]
serial_no?: string
created_at, updated_at: Date
```

驳回/取消后重报复用确定性 `_id`，`review_history` 原样保留并回到 `pending`。同一活动同一用户物理上只有一条记录。

### `profiles`

一期报名函数只**读取**预先由未来安全资料服务生成的资料，不提供资料写入接口：

```text
_id: openid
nickname, title, avatar_file_id: string
photos: [{ file_id, category, uploaded_at }]
real_name_masked, phone_masked, id_number_masked: string
sensitive_status: {
  phone_verified: boolean,
  identity_encrypted: boolean,
  emergency_contact_encrypted: boolean
}
sensitive_refs?: {
  phone_cipher_ref, identity_cipher_ref, emergency_contact_cipher_ref: string
}                                      // 仅 KMS/密钥方案完成后使用
strava: {
  status: connected | disconnected,
  snapshot?: <上述统计白名单>,
  exempt?: { enabled, reason, at, granted_by }
}
created_at, updated_at: Date
```

**禁止**在没有 KMS/环境密钥和独立资料云函数时写入明文手机号、证件号、紧急联系电话或 Strava token。当前代码仅依据 `sensitive_status` 判断资料是否已由可信流程完整保存，对外只返回报名快照中的脱敏值。Strava token 应放在后续专用集合并加密，永不进入本批云函数响应或日志。

### `admins`

```text
_id: openid                         // 权限判断唯一键
display_name: string
is_super: boolean
enabled: boolean                    // 缺省视为启用；false 明确禁用
created_at, updated_at: Date
```

管理员判断必须同时满足 `_id === cloud.getWXContext().OPENID && enabled !== false`。客户端传入角色无效。

### `audit_logs`

```text
_id: auto
actor_openid: string
action: string                      // 例如 registration.approve/reject
target_id: string
created_at: Date
detail: { from_status?, to_status?, reason? }
```

不得记录手机号、证件号、紧急联系电话、Strava access/refresh token。审批日志与报名状态更新在同一事务中提交。

## 3. 索引

在 CloudBase 控制台按顺序建立：

| 集合 | 索引字段（顺序） | 属性 | 对应查询 |
| --- | --- | --- | --- |
| activities | `status ASC, event_start ASC` | 普通 | 已发布活动列表 |
| registrations | `activity_id ASC, openid ASC` | **唯一** | 双保险业务唯一性；确定性 `_id` 已先保证 |
| registrations | `activity_id ASC, status ASC, created_at DESC` | 普通 | 管理员按活动/状态审批列表 |
| registrations | `openid ASC, created_at DESC` | 普通 | 我的报名 |
| audit_logs | `actor_openid ASC, created_at DESC` | 普通 | 审计追溯 |

若 CloudBase 控制台不允许包含 `_id` 逻辑已等价保证的唯一索引，仍应建立 `activity_id + openid` 唯一索引作为数据导入/人工误操作的最后防线。

## 4. 名额与事务取舍

本实现引入 `activities.occupied_count`，而不是在事务中对 `registrations` 做聚合 `count`。原因是 CloudBase Node SDK 的事务能力适合文档点读写，事务内聚合查询的支持和冲突语义不适合作为容量闸门。提交事务会读取活动文档、核对 `occupied_count < capacity`、写确定性报名文档并更新活动计数；同一活动文档成为冲突检测点。取消和驳回在同一事务释放计数，通过不改变计数。

这不是“先 count 后 insert”的窗口。离线测试用串行事务替身锁定满员与状态不变量；真实 CloudBase 的冲突重试、事务超时、热点吞吐仍必须部署后压测，不能以单元测试冒充数据库并发验证。

## 5. 主要错误码

`UNAUTHENTICATED`、`ADMIN_REQUIRED`、`FORBIDDEN`、`FORBIDDEN_FIELD`、`VALIDATION_FAILED`、`ACTIVITY_NOT_AVAILABLE`、`ACTIVITY_NOT_FOUND`、`SIGNUP_CLOSED`、`PROFILE_INCOMPLETE`、`STRAVA_REQUIRED`、`REGISTRATION_EXISTS`、`REGISTRATION_NOT_FOUND`、`INVALID_TRANSITION`、`REASON_REQUIRED`、`CAPACITY_FULL`、`SCHEMA_INVALID`、`UNKNOWN_ACTION`、`INTERNAL_ERROR`。

## 6. 部署后联调检查

1. 建集合、安全规则与索引，并校验活动 `occupied_count` 初值为 0。
2. 使用测试账号在同一活动并发提交，确认只有容量数请求成功，冲突请求可重试且最终不超额。
3. 验证缺失文档在当前 SDK 的错误码与 `maybeGet` 兼容。
4. 验证 `Date` 序列化、复合索引命中、事务冲突/重试行为和单次事务限制。
5. 在控制台核对审计日志不含敏感数据，并验证普通用户无法调用管理员审批。
