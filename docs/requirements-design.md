# 骑行活动报名审批小程序 · 需求与实现方案

> 状态：需求设计稿，待负责人评审确认后进入实施计划
>
> 更新时间：2026-09-28
>
> 参照产品：CEC 骑意小程序（仅参考活动呈现与报名信息结构，不复刻其商业体系）

## 1. 项目目标与范围

为单个骑行俱乐部做一个微信小程序，把「活动发布 → 队员实名报名 → Strava 能力绑定 → 管理员线上审批 → 报名结果查询」全部线上化，替代微信群接龙 + 人工核对。

### 1.1 本期范围（一期）

- 活动展示：活动说明、时间安排（集合/出发/返程）、路线与里程、注意事项、装备要求、费用说明（仅文字说明，不在线收款）。
- 实名报名：微信授权登录与手机号，填报实名信息；区分自带车/租车、骑行经验、紧急联系人等。
- **强制绑定 Strava**：报名前必须完成 Strava 授权，系统拉取骑行统计，作为管理员审批的评判依据之一。
- 管理员审批：待审名单、报名详情与 Strava 数据、通过/驳回（填理由）、名额计数。
- 个人中心：我的报名状态、报名凭证（通过后展示，可截图）、Strava 绑定状态与重新授权。
- 个人资料维护：昵称/称号、个人信息编辑，上传多张个人照片（骑行照、车辆照等），便于管理员快速识别。

### 1.2 明确不做（二期及以后）

- 在线支付报名费/押金。
- 现场签到核销（二维码 + 扫码/名单勾选）。
- 名单导出 Excel、订阅消息批量通知。
- 多俱乐部/多组织入驻、管理端 Web 后台（一期管理功能在小程序内完成）。

## 2. 角色与权限

| 角色     | 识别方式                            | 权限                                                 |
| -------- | ----------------------------------- | ---------------------------------------------------- |
| 普通队员 | openid                              | 浏览活动、报名、查看本人报名与凭证、绑定/换绑 Strava |
| 管理员   | openid 白名单（云数据库配置表维护） | 上述全部 + 活动 CRU、审批、查看全部报名记录          |

一期不做复杂角色体系；管理员名单在配置集合里维护，首个管理员通过部署脚本写入。

## 3. 用户流程与报名状态机

### 3.1 队员主流程

```
小程序启动（静默 wx.login → 云函数换 openid）
  → 活动列表（进行中/已结束）
  → 活动详情：说明 / 时间安排 / 路线 / 注意事项 / 装备 / 费用说明
  → 点「立即报名」
      → 未授权手机号：button getPhoneNumber 授权
      → 未实名：填写实名资料（可保存为常用资料，下次自动带入）
      → 未绑定 Strava：强制走 Strava 授权（不绑定不能继续）；绑定受阻可「申请豁免」，管理员通过后可跳过此步
      → 选择 自带车/租车、经验等级等本活动选项
  → 提交报名 → 状态「待审核」
  → 管理员审批 → 通过：状态「已通过」，生成报名凭证
                驳回：状态「已驳回」，展示理由，可修改后重新报名
```

### 3.2 报名记录状态

| 状态        | 含义                           | 允许的迁移                                                   |
| ----------- | ------------------------------ | ------------------------------------------------------------ |
| `pending`   | 已提交，待管理员审核           | → approved / rejected / cancelled                            |
| `approved`  | 审核通过，占用名额             | → cancelled（队员取消/管理员撤销）                           |
| `rejected`  | 审核驳回，附理由               | 队员修改后重新提交 → pending（沿用同一条记录或新建，见 6.4） |
| `cancelled` | 队员主动取消或被撤销，释放名额 | 终态；可重新报名 → pending                                   |

名额口径：`approved + pending` 计入占用（待审也占位，防止超报）；`rejected/cancelled` 立即释放。活动可配置「报名截止时间」，截止后不可提交。

## 4. 功能清单（按页面）

### 4.1 队员端

1. **活动列表页**：封面图、标题、活动日期、状态标签（报名中/已满/已截止/已结束）、已报名名额。
2. **活动详情页**：
   - 活动说明（富文本）。
   - 时间安排：集合时间地点、出发/返程时间、关键节点（结构化时间段，非纯文本）。
   - 路线概况：起终点、里程、爬升、难度等级、路线文件链接（可选）。
   - 注意事项、装备要求（清单）。
   - 费用说明（包含/不包含，纯文字）。
   - 底部固定操作条：报名状态 + 「立即报名/查看报名」。
3. **报名填报页**：
   - 手机号（必填）：微信授权号码标记为 `wechat/verified`；个人主体可手填号码并标记为 `manual/unverified`。两者都满足第一批报名门禁。
   - 真实姓名、手机号、性别、紧急联系人与紧急电话；不采集证件类型和证件号码。
   - 紧急联系人姓名、电话（必填）。
   - 本活动选项：用车方式（自带车/租车）、骑行经验等级（新手/有一定经验/常骑）、是否需要租车（数量/车型备注）、饮食或其他备注。
   - Strava 绑定卡片：未绑定时阻断提交，显示「绑定 Strava」；已绑定展示头像、近一年里程/活动数、最近活动时间。
4. **我的报名 / 报名凭证页**：活动信息、状态时间线、审批意见；通过后展示凭证（活动名、姓名、编号、集合信息），仅供截图，不做二维码核销。
5. **个人中心页**：常用实名资料维护（可编辑）、昵称与称号设置、多相册管理（骑行照、车辆照，可上传多张/删除）、Strava 绑定状态与重新授权、我的报名历史。昵称与照片会展示在管理员审批详情顶部，帮助快速识人。

### 4.2 管理员端（同一小程序，按角色显示入口）

1. **活动管理**：创建/编辑活动（详情各字段、名额、报名截止时间、活动状态：草稿/发布/结束）。
2. **报名审批列表**：按活动筛选，Tab：待审核/已通过/已驳回/全部，显示名额计数。
3. **报名详情与审批**：
   - 顶部识人卡片：用户昵称、称号、骑行照与车辆照缩略图（点开看大图）。
   - 实名与联系信息（仅展示必要脱敏值，不含证件信息）。
   - Strava 数据面板（指标见 5.3）及授权时间；豁免报名展示「豁免」标识与原因。
   - 通过 / 驳回（驳回必填理由）。
4. **豁免与称号管理**：对确实无法绑定 Strava 的队员授予/撤销豁免（必填原因，留审计）；为队员颁发或修改「称号」（如"爬坡王""领队"，展示在报名详情和个人主页）。
5. **管理员配置**：维护管理员 openid 白名单（仅超管可见；一期也可直接在数据库维护）。

## 5. Strava 强制绑定设计（本项目关键点）

### 5.1 绑定是报名的前置条件

- 报名填报页校验绑定状态：无有效绑定记录或 token 已失效 → 必须先绑定，绑定成功后才能提交。
- **豁免例外**：被管理员授予 Strava 豁免（带原因）的队员可不绑定直接报名，记录带「豁免」标识；豁免针对账号长期有效，可被管理员撤销。未获豁免又无法完成绑定时，队员可在绑定页「申请豁免」，管理员审批通过后即可报名。
- 绑定时云函数立即调用 Strava API 拉取统计并落库，作为该次报名快照（审批看的是报名时的数据，避免事后变化）。

P0 报名契约：

- 第一批手机号规则：微信授权号码标记为 wechat/verified；个人主体可手填号码，标记为 manual/unverified。两者都满足第一批报名门禁，管理员审批详情必须展示来源。
- Strava 报名资格唯一事实源：`strava_credentials + strava_snapshots`。`profiles.strava` 仅为兼容展示缓存，不参与报名判定。
- 快照新鲜度为 24 小时；同步租约为 2 分钟。覆盖度只描述最近 90 天；第 5 页仍满 200 条时 `coverage_complete=false`。完整空窗口的统计值可为 0，未知或不完整值为 `null`。

### 5.2 OAuth 流程（微信小程序内）

小程序不能直接打开外部页面，采用「`web-view` + 云函数 HTTP 触发器/静态托管中转」：

```
队员点「绑定 Strava」
  → 云函数生成 state（含 openid，签名，5 分钟有效），返回 Strava 授权地址
  → 小程序 web-view 打开授权地址（域名需在小程序后台配置为业务域名）
  → 队员在 Strava 页面登录并授权（scope：`activity:read_all` 全部骑行活动 + `profile:read_all` 完整资料含俱乐部/车辆 + `read`，全部只读，不申请 write）
  → Strava 回调云函数 HTTP 地址：校验 state → 用 code 换 access_token / refresh_token
  → token 加密后存云数据库，写入 openid 绑定关系
  → web-view 展示「绑定成功」并通过 wx.miniProgram.navigateBack 回小程序
  → 小程序调云函数确认绑定并拉取统计
```

说明：需要一个带公网 HTTPS 的回调地址。微信云开发可用「云函数 URL 化/HTTP 访问」或「云开发静态托管」承载回调页与中转，部署时在 Strava 应用后台配置该回调域名。

### 5.3 拉取的指标与 API 实现（已对照 Strava 官方 API 文档核对）

授权后云函数调用以下接口，均为只读：

- `GET /athlete`（DetailedAthlete）：取 `created_at`（Strava 注册时间）、头像、姓名、所在城市、体重、`bikes`（车辆列表）、`clubs`。
- `GET /athlete/clubs`：取加入的俱乐部列表（SummaryClub：名称、城市、成员数、`membership` 状态、认证标识等）。
- `GET /athlete/activities`：分页（每页最多 200 条）拉取骑行活动，逐条取 `distance / total_elevation_gain / average_speed / moving_time / start_date / workout_type / type / sport_type`。

据此计算审批所需指标（只统计 Ride 类活动，trainer/通勤默认剔除并可配置）：

| 指标                    | 计算口径                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 骑行年限（Strava 年限） | 当前时间 − athlete.`created_at`，取整年；注明这是 Strava 使用年限                                                                                       |
| 活动频率                | 活动期内平均每月活动数；另给近 90 天活动数和近 4 周次数                                                                                                 |
| 最长骑行距离            | 所有活动 `distance` 的最大值（保留活动名称与日期）                                                                                                      |
| 最大爬升高度            | 所有活动 `total_elevation_gain` 的最大值（保留活动名称与日期）                                                                                          |
| 平均速度                | 按移动距离加权的 `average_speed`（∑distance / ∑moving_time），避免简单平均被短活动拉偏                                                                  |
| 是否参加过比赛          | 存在 `workout_type` 为比赛标记的活动（骑行类 12、跑步类 1）；列出比赛名称与日期                                                                         |
| Strava 主俱乐部         | `/athlete/clubs` 返回的俱乐部；Strava 没有"主俱乐部"字段，按 `membership=member` 展示全部，默认取第一个（或成员数最多）标记为"主俱乐部"，此为展示启发式 |
| 车辆信息                | athlete.`bikes`：车名、品牌、总里程（Strava 记录），辅助核对租车/自带车                                                                                 |

实现注意：

- **API 配额**：单应用每 15 分钟 200 次、每天 2000 次。同步只查询最近 90 天，每页 200 条，最多 5 页；第 5 页仍满 200 条时将 `coverage_complete` 记为 `false`，不把部分窗口统计冒充完整结果。指标在报名时快照固化。
- `refresh_token` 长期有效；进入报名/审批相关流程时云函数按需用其刷新短期 access_token（Strava token 有效期约 6 小时），失败则提示重新授权。
- 所有计算在云函数完成，前端只拿结果，不接触 token。

### 5.4 作为审批标准的落地方式

- 每个活动可配置「建议门槛」（如近一年里程 ≥X、近 90 天活动数 ≥Y），可留空。
- 审批页把实际指标与门槛并列展示，**不做系统自动拒绝**：是否通过由管理员结合实际情况判断（门槛只是辅助标尺）。
- **支持豁免**：管理员可对无法绑定 Strava 的队员授予豁免（必填原因，写审计日志）；队员也可在绑定页发起豁免申请，管理员通过后即可正常报名。豁免报名在审批列表带明显标识，且不展示 Strava 指标。

### 5.5 风险与应对

| 风险                                  | 影响                            | 应对                                                                                                         |
| ------------------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Strava 在国内网络访问不稳定           | 授权页打不开/回调失败，无法报名 | 绑定页给出明确失败提示与重试；支持「申请豁免」由管理员人工放行；云函数侧换 token（服务端访问，不走用户网络） |
| 强制绑定挡住新骑友                    | 潜在流失                        | 审批页展示数据但不自动卡；豁免通道兜底；文案说明绑定用途                                                     |
| 历史活动很多，超出云函数时长/API 配额 | 指标算不全                      | 分页拉取加上限与断点续传，指标以已拉数据计算并标注完整度；配额内单用户同步量充足                             |
| OAuth 回调域名/小程序业务域名配置     | 上线阻塞                        | 部署清单前置：Strava 应用、回调 HTTPS 地址、小程序业务域名三者先配齐                                         |
| token 泄露                            | 账号被读                        | token 加密存储（见 7.3），仅云函数可解密；不进日志、不返回给前端                                             |

## 6. 数据模型（云数据库集合）

### 6.1 `activities` 活动

```text
_id, title, cover_image,
description,                 // 活动说明（富文本）
schedule: [                  // 时间安排（结构化）
  { time, title, location, remark }
],
route: { start, end, distance_km, elevation_m, level, gpx_file_id },
notices: [String],           // 注意事项
equipment: [String],         // 装备要求
fee: { included: [String], excluded: [String], remark },
capacity,                    // 名额
occupied_pending,            // 待审占用
occupied_approved,           // 通过占用
signup_deadline,             // 报名截止时间
event_start, event_end,
status,                      // draft | published | finished
created_by, created_at, updated_at
```

### 6.2 `registrations` 报名记录

```text
_id, activity_id, openid,
profile_snapshot: {          // 报名时的最小必要资料快照
  nickname, real_name_masked, phone_masked
},
options: { bike_mode, experience, rental_need, remark },
strava_snapshot: {           // 报名时的 Strava 数据快照（豁免时为空）
  athlete_id, connected_at,
  years_on_strava,                   // Strava 年限
  rides_per_month, activities_90d,   // 活动频率
  longest_km, longest_name,          // 最长距离
  max_elevation_m, max_elevation_name, // 最大爬升
  weighted_avg_speed_kmh,            // 加权平均速度
  race_count, races: [{name, date}], // 比赛经历
  clubs: [{id, name, city, members}], primary_club_name, // 俱乐部
  bikes: [{name, brand, distance_km}],
  coverage: {full, note}             // 历史拉取完整度
},
strava_status,               // connected | exempted
exemption: { granted_by, reason, at }, // 豁免信息（仅 exempted 时有值）
identity_snapshot: { nickname, title, avatar, photos: [file_id] }, // 报名时昵称/称号/照片快照
status,                      // pending | approved | rejected | cancelled
review_history: [            // 各次审批记录（驳回重报可累积）
  { reviewer_openid, reviewed_at, action, comment }
],
serial_no,                   // 通过后的报名编号
created_at, updated_at
```

索引：`activity_id + status`、`openid + created_at`；同一活动同一 openid 仅允许一条非终态记录（云函数内做事务/唯一校验）。

### 6.3 `strava_credentials` 与 `strava_snapshots`

```text
strava_credentials:
_id, openid, athlete_id, athlete_name,
access_token_cipher, refresh_token_cipher, token_expires_at,
scopes,                      // 实际授予的 scope 列表
sync_status: pending|running|ready|failed,
sync_error_code?: String,
sync_started_at?: Date,
sync_finished_at?: Date,
sync_lease_id?: String,
connected_at, updated_at

strava_snapshots:
_id, openid,
total_km, activities_90d, longest_km, total_elevation_m,
weighted_avg_speed_kmh, latest_activity_at,
coverage_from, coverage_to, coverage_complete,
synced_at
```

`strava_credentials + strava_snapshots` 是 Strava 报名资格唯一事实源；`profiles.strava` 仅为兼容展示缓存，不参与报名判定。快照不足 24 小时才算新鲜；同步任务持有 2 分钟租约。完整空窗口的统计值可为 0，未知或不完整值为 `null`。

### 6.4 `users` 用户与常用资料

```text
_id, openid, phone,
phone_source: wechat|manual,
phone_verified: Boolean,     // wechat=true, manual=false
nickname,                    // 自定义昵称（本人编辑）
title,                       // 称号（管理员颁发，如"爬坡王"）
avatar_file_id,              // 头像
photos: [                    // 个人相册（多张，云存储 file_id）
  { file_id, category, uploaded_at }   // category: ride | bike | other
],
profile: { real_name_cipher, phone_cipher, gender, emergency_name, emergency_phone_cipher },
created_at, updated_at
```

相册约束：一期限制每人照片总数与单张大小（如 ≤30 张、≤10MB），仅本人可写、管理员在审批详情可读；照片存云存储，删除记录时同步清理孤儿文件（由云函数负责）。

### 6.5 `admins` 与 `audit_logs`

- `admins`: `{ openid, name, is_super, created_at }`。
- `audit_logs`: 敏感操作留痕，`{ openid, action, target, at, detail }`，覆盖审批通过/驳回、活动发布、豁免授予/撤销、称号颁发。

驳回后重报口径：沿用原 `registrations` 记录，status 从 `rejected` 回到 `pending`，并保留每次审批意见历史（追加到 review 历史数组），保证一条活动一条记录可追溯。

## 7. 云开发架构与安全

### 7.1 组成

- **小程序前端**：原生小程序（WXML/WXSS/JS），不引第三方 UI 重框架，可用基础组件库。
- **云函数**：统一一个或按域拆分（见 7.2），通过 `wx.cloud.callFunction` 调用；HTTP 触发器仅用于 Strava 回调。
- **云数据库**：上述集合；**云存储**：封面图、路线文件等。
- 无自建服务器、无域名备案（Strava 回调所需的 HTTPS 域名由云开发托管能力提供）。

### 7.2 云函数划分（建议）

| 云函数                      | 职责                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `login`                     | wx.login code 换 openid、返回角色（是否管理员）                                      |
| `activity`                  | 活动列表/详情、管理员创建编辑、状态变更                                              |
| `registration`              | 报名提交、取消、我的报名、凭证；名额占用校验                                         |
| `review`                    | 管理员审批列表、详情（脱敏）、通过/驳回、查看明文（留审计）、豁免授予/撤销、称号颁发 |
| `strava`                    | 生成授权地址、绑定确认、统计同步与断点续拉、换绑/刷新、豁免申请提交                  |
| `strava-oauth`（HTTP 触发） | Strava 回调：state 校验、code 换 token、加密落库、回跳成功页                         |
| `user`                      | 手机号授权入库、实名资料维护、昵称编辑、照片上传/删除（云存储）、我的资料            |

### 7.3 安全红线

- 不采集、展示或导出证件类型和证件号；存量证件密文只读保留，不解密、不回传、不做批量迁移。Strava token 写入前用云函数内密钥做对称加密（密钥存云函数环境变量/KMS，不入库不入代码库）。
- 微信授权手机号通过 `getPhoneNumber` 在云函数解码并标记为 `wechat/verified`；个人主体可提交手填号码，但必须标记为 `manual/unverified`，管理员审批详情展示来源。两者都满足第一批报名门禁，不能把手填号码当成已验证号码。
- 所有写操作在云函数侧校验：身份、活动状态、报名截止、名额、重复报名、管理员权限；不信任前端传参。
- 新 profile 媒体必须使用服务端按 WXContext OPENID 签发的 opaque 上传路径；`registerMedia` 在确认对象存在后以事务内重读方式登记到 `profile_media`，不能把并发 active 记录覆盖回 unreferenced。新引用只有在 owner/category/status 与当前用户匹配时才能写入 profile，被移除的 active 媒体降级为待回收；未登记 legacy 媒体只读保留但不进入个人或管理员能力卡。定时清理删除前重新核对当前 profile 引用并使用带过期时间的 lease 防并发，worker 中断后允许重领；删除失败按退避最多重试 3 次，再进入 terminal，结果只记录安全状态码。临时 URL 解析失败按空图或少图降级；登记与即时删除同时失败时使用会验证对象存在性的 orphan report 与客户端持久重试账本补偿。
- 名额变更走云数据库事务/原子操作，防止并发超报。
- 日志不打印手机号、Strava token 或任何密文；敏感操作写 `audit_logs`。
- 小程序 `web-view` 业务域名、Strava 回调地址使用白名单；state 签名防伪造、短时效。

## 8. 页面清单汇总

| 端     | 页面                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 队员   | 活动列表、活动详情、报名填报、我的报名/凭证、个人中心（资料编辑、昵称/称号、多相册、Strava 绑定）、Strava 绑定 web-view 中转页 |
| 管理员 | 活动管理列表、活动编辑、审批列表、报名详情审批（豁免/称号操作）、管理员配置                                                    |

## 9. 分期实施建议

- **里程碑一（可用底座）**：登录与角色、活动管理与详情、云数据库集合与云函数骨架、静态托管/HTTP 回调打通。
- **里程碑二（报名闭环 + 用户资料）**：实名资料编辑、昵称与多照片上传、报名提交与名额、我的报名与状态。
- **里程碑三（Strava + 审批）**：Strava OAuth 全链路、全量指标计算与快照、豁免申请/授予、管理员审批与称号、报名凭证。
- **里程碑四（上线）**：业务域名与 Strava 应用配置、安全自查（加密/脱敏/审计）、小程序提审、小范围试用。

二期候选：现场核销、订阅消息、Excel 导出、在线支付。

## 10. 已确认的决策与剩余默认项

已确认（本期按此实施）：

1. 支持管理员 Strava「豁免」：队员可申请、管理员审批，全程留审计。
2. Strava 指标：骑行年限、活动频率、最长距离、最大爬升、加权平均速度、比赛经历、主俱乐部及全部俱乐部、车辆信息。
3. 支持个人信息编辑、昵称/称号、多张个人照片（骑行照/车辆照，分类上传），审批页顶部展示辅助识人。
4. 其余按前述建议：微信云开发、单俱乐部、不接支付、实名采集、线上审批。

剩余采用默认（如无异议不再追问）：

- 审批门槛逐活动可配置、可留空；系统不自动拒绝，管理员最终判定。
- Profile 完整度与报名必填项不包含任何证件字段。
- 报名截止后管理员仍可手动加人/撤人并同步名额。
- 前端用原生小程序实现。
