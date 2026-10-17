# 腾讯文档报名名单同步具体需求

> 文档日期：2026-10-17（CST）
>
> 文档性质：未来需求与方案草案，不代表任何能力已经开发、部署、获批或通过真实环境验证
>
> 依据：腾讯文档开放平台官方资料、`docs/requirements-design.md`、`docs/cloudbase-schema.md`、`cloudfunctions/admin-review`、`cloudfunctions/registration`
>
> 约束：本文只提出设计，不修改当前 CloudBase Schema，不提前新增代码骨架

## 1. 结论与范围

### 1.1 产品结论

腾讯文档开放平台公开资料足以支持继续推进“将单个活动的报名名单同步到腾讯在线表格”的接入验证：第三方应用在通过审核且取得用户 OAuth 授权后，可创建在线表格并写入内容。正式实现必须使用届时官方推荐的 V3 接口，并以目标主体后台实际获批的 scope、接口参数、频控和错误码为准。

本需求采用**隐私优先、管理员显式触发、单活动快照同步**：

1. V1 仅允许当前小程序管理员选择一个活动，预览字段与人数后手动发起同步。
2. V1 每次同步生成或覆盖该活动绑定的受控表格快照，不做报名变化后的实时自动同步。
3. 默认只同步非敏感字段；真实姓名、手机号均默认关闭，V1 不支持打开。
4. 紧急联系人姓名、紧急联系人电话在任何阶段都不导出，不出现在预览、任务载荷、腾讯文档或审计日志中。
5. 腾讯文档是协作副本，不是报名、审批、签到、容量或候补的事实源；禁止从表格反向修改小程序数据。
6. 复用现有 `admins` 白名单与服务端可信 `WXContext.OPENID` 鉴权；外部写入采用现有 Outbox 的持久意图、租约、尝试次数、退避、fencing 和“结果未知不盲目重发”思路。
7. 本文不宣称现有 `admin-review`、`registration`、`notification_outbox` 或任何页面已经具备腾讯文档同步能力。

### 1.2 V1 范围

- 管理员完成腾讯文档账号授权、查看授权状态、撤销本应用侧授权。
- 从管理员活动入口选择一个活动，查看可同步人数、字段、敏感级别和默认选择。
- 只读提取该活动当前报名记录，生成稳定排序的快照。
- 创建一个腾讯在线表格，或更新该活动此前由本应用创建并绑定的表格。
- 展示任务状态、成功/跳过/失败行数、文档入口和可操作的恢复建议。
- 记录不含 PII、token、密钥和单元格原文的安全审计。

### 1.3 边界原则

- 当前业务集合仍保持客户端全拒绝 ACL，仅云函数访问。
- 报名事实继续以 `registrations` 为准，活动事实继续以 `activities` 为准。
- 不把客户端传入的 `openid`、角色、表格 ID、目标字段或行内容当作可信事实。
- 同步失败不得影响报名、审批、候补、取消、签到和通知发送。
- 本文的建议集合、索引和字段都是后续实施候选；立项开发时另行更新 `docs/cloudbase-schema.md` 并走 CloudBase plan/apply/verify，本阶段不改 schema。

## 2. 官方能力核验

### 2.1 已确认

| 能力 | 已确认结论 | 产品约束 | 官方 URL |
| --- | --- | --- | --- |
| 第三方 Open API | 腾讯文档开放平台面向第三方应用；取得用户授权后可操作用户文档数据 | 不做匿名调用或仅凭服务端密钥任意访问 | https://docs.qq.com/open/document/app/ |
| 创建在线表格 | `POST /openapi/drive/v2/files` 的公开资料支持 `type=sheet`；创建权限示例为 `scope.drive.creatable` | V2 页面仅用于确认能力存在，生产路径以 V3 为准 | https://docs.qq.com/open/document/app/openapi/v2/file/files/create.html |
| 写入区域内容 | V2 在线表格索引公开“更新区域内容”，同时明确 V2 已废弃、V3 推荐 | M0 必须实测 V3 创建、批量写入与回读 | https://docs.qq.com/open/document/app/openapi/v2/sheet/ |
| OAuth | 授权码模式；Code 5 分钟且一次性，Access Token 30 天，Refresh Token 1 年；换 token 和 API 调用均应由后台完成 | token 不下发客户端；回调防 CSRF、防重放 | https://docs.qq.com/open/document/app/oauth2/ |
| 应用与权限审核 | 主体、应用和所需权限需按流程申请；权限遵循最少必要，scope 变化后用户需重新授权 | 未获批不得开放同步入口 | https://docs.qq.com/open/document/app/scope.html |
| 接入流程 | 注册/登录、主体审核、API 接入资料审核、审核通过后发布上线 | M0 是发布阻断项 | https://docs.qq.com/open |
| 权限与协作者 API | 普通第三方接口索引公开权限查询/设置及协作者增删查等能力 | M2 才考虑协作者，且需单独获批和实测 | https://docs.qq.com/open/document/app/openapi/v2/file/ |
| 默认频控 | 文件操作按 openID 300 次/分钟；单篇文档内容操作按 fileID 150 次/分钟；特殊接口以接口页为准 | 任务必须节流、退避，不以公开上限作为目标吞吐 | https://docs.qq.com/open/document/app/openapi/v2/frequency_control.html |
| 免费配额口径 | 官方称自 2025-07-01 起每应用限时免费 20,000 次 API，但公开页面未说明统计周期 | 不承诺“每月 20,000 次”；上线前确认计费与超额行为 | https://docs.qq.com/open/document/app/ |
| 安全宣传口径 | 官方宣称专业级加密存储并保障访问、传输、存储安全 | 不能替代双方数据处理、安全或 SLA 书面条款 | https://docs.qq.com/open |

开放合作平台入口保留为：https://docs.qq.com/open/developers/ 。腾讯文档隐私政策官方链接保留为：https://docs.qq.com/doc/p/30cb57a3280b16bd48fb49001022ada97479339a 。

### 2.2 待腾讯侧接入验证

下列事项不得在产品页面、PRD 或上线公告中写成已支持：

1. V3 创建表格、批量写入、读取回验的最终 URL、参数、批量上限、单元格/行列限制、scope 与错误码。
2. 目标主体可注册类型、资质材料、审核时限、驳回规则、商务合同及生产上线条件。
3. 创建、写入、读取回验、权限设置、协作者管理分别属于免审核还是需审核权限，以及目标应用能否全部获批。
4. 普通第三方应用是否存在适用本场景的应用级账号 token；在确认前按“每位管理员用户 OAuth 授权”设计。
5. 普通第三方应用可用的分享范围、公开链接撤销、密码、有效期、禁止复制/下载，以及与 SaaS 企业版权限模型的映射。
6. 协作者上限、外部身份标识、所有权转让限制和账号离职后的行为。
7. 20,000 次额度的周期、到期时间、失败调用是否计费、资源包价格、超额响应和提额流程。
8. 真实限流响应码、是否返回 `Retry-After`、突发规则及推荐重试窗口。
9. Refresh Token 是否轮换、旧 token 是否立即失效、并发刷新规则、主动撤销接口和撤销后的失效时点。
10. API 数据删除与备份保留期、数据驻留和跨境、加密与密钥、租户隔离、认证范围、安全事件通知、RPO/RTO、可用性 SLA 和审计权。
11. 创建调用或写入调用超时后，能否通过请求 ID、幂等键、文件列表或内容版本可靠判定实际结果。
12. V3 是否提供原子批量写入、追加行、文档版本/ETag 或条件更新能力；若没有，采用应用侧快照覆盖与回读校验。

M0 必须保存上述每项的官方页面版本、实测请求 ID、脱敏响应摘要和确认结论；无法确认的能力不得进入相应阶段。

## 3. 用户与权限

| 角色 | 可执行操作 | 禁止操作 |
| --- | --- | --- |
| 骑手 | 无腾讯文档同步入口；其报名数据仅在满足字段策略时被管理员导出 | 不能授权管理员、不能选择导出字段、不能查看同步任务或文档 |
| 活动发起人（非管理员） | V1 无同步权限 | 仅凭 `created_by` 不得同步报名名单 |
| 启用的管理员 | 绑定/撤销自己的腾讯文档授权；预览并手动同步单个活动；查看本人可见任务 | 不得绕过字段策略，不得导出紧急联系人，不得从表格回写 |
| 超级管理员（未来可选） | M2 可审批敏感字段策略、管理协作者范围，具体规则另行设计 | 不能在无用途、无确认的情况下开启敏感字段 |
| 系统 worker | 领取已授权任务、读取服务端快照、调用腾讯 API、回写状态 | 不能改变报名事实，不能扩大字段或协作者范围 |

所有管理员操作均须在服务端：

1. 从 `cloud.getWXContext().OPENID` 获取可信身份。
2. 查询 `admins`，要求 `_id` 匹配且 `enabled !== false`。
3. 忽略或拒绝客户端传入的 `openid`、role、授权主体、fileID、行内容和服务端状态字段。
4. 每次创建预览、确认同步、重试、撤销授权、修改敏感字段策略和协作者都重新鉴权，而不是信任页面缓存。
5. 管理员被禁用后，不得新建或重试任务；已领取任务在真正外呼前须再次检查授权有效性和管理员状态，失败则安全终止。

## 4. V1 管理员手动单活动同步旅程

1. 管理员进入某活动的报名管理页，点击“同步到腾讯文档”。普通发起人和骑手不展示入口。
2. 服务端校验管理员身份，返回授权状态；未授权时显示用途、字段边界、数据去向和撤销说明。
3. 管理员点击“去授权”，服务端生成一次性 `state`、PKCE（若官方支持/要求）和短期回调会话，再跳转官方授权页。
4. 回调由服务端校验 `state`、有效期、一次性消费和授权主体，后台用 code 换 token；token 加密保存，永不返回小程序端。
5. 返回活动页后，管理员发起“预览”。服务端读取活动和报名记录，冻结源版本水位与筛选口径，返回字段名、敏感标签、记录数、状态分布和样例占位符；不在预览接口返回完整手机号或完整真实姓名。
6. V1 字段选择固定为默认非敏感字段。真实姓名、手机号开关置灰并标注“当前版本不支持”；紧急联系人不展示开关。
7. 页面说明：“将创建或更新一份腾讯在线表格副本；表格修改不会回写小程序；同步期间报名仍可能变化。”管理员勾选确认后提交。
8. 服务端用 `activity_id + field_policy_version + source_watermark` 生成幂等键，在事务内创建同步任务/Outbox 意图和审计摘要；客户端仅获得 `job_id`。
9. worker 领取任务：校验租约、管理员状态、授权、字段策略和源快照，刷新即将过期的 token，按确定性排序构建表头和行批次。
10. 若无绑定文档，创建标题为“此里报名名单 - {活动标题} - {同步日期}”的在线表格并记录绑定；若已有绑定文档，校验其归属和可写权限后更新。
11. 按批写入并回读关键范围/行数校验。成功后保存文档 ID、官方打开 URL、快照摘要、成功与跳过数量；不保存表格原文副本到日志。
12. 页面轮询任务状态。成功显示“已同步 N 条”与“打开腾讯文档”；部分成功显示已完成范围和“继续重试”；授权或权限问题显示“重新授权/检查权限”。
13. 管理员重复点击同一预览的“同步”只返回同一任务；源数据变化后需重新预览并显式发起新快照。

## 5. 字段分级与默认值

### 5.1 分级定义

- **L0 业务公开/低风险**：已可在活动或公开卡片边界内出现，仍按最小必要导出。
- **L1 内部运营**：仅管理员业务所需，不公开，但不包含直接联系方式或实名明文。
- **L2 敏感个人信息**：真实姓名、手机号等，可直接识别或联系个人；默认关闭，只能在 M2 的受控机制下开启。
- **L3 禁止导出**：无论用户、管理员、阶段或配置如何都不得发送给腾讯文档。

### 5.2 字段策略

| 表格列 | 来源 | 等级 | V1 默认 | 最早阶段 | 规则 |
| --- | --- | ---: | --- | --- | --- |
| 序号 | 同步时按稳定顺序生成 | L0 | 开启 | M1 | 不是报名凭证 |
| 昵称 | `profile_snapshot.nickname` | L0 | 开启 | M1 | 空值写“未填写” |
| 性别 | `profile_snapshot.gender` | L1 | 开启 | M1 | 仅男/女，否则“未填写” |
| 报名状态 | `registrations.status` | L1 | 开启 | M1 | 映射中文，不暴露内部错误 |
| 集合方式 | `options.gathering_mode` | L1 | 开启 | M1 | 自驾/后援车/未填写 |
| 骑行经验 | `options.experience` | L1 | 开启 | M1 | 新手/进阶/常骑/未填写 |
| 队伍名称 | `team_name` | L1 | 开启 | M1 | 不导出 `team_id` |
| 队长标记 | `is_team_leader` | L1 | 开启 | M1 | 是/否 |
| 报名时间 | `created_at` | L1 | 开启 | M1 | 统一时区与格式 |
| 签到状态/时间 | `status`、`checked_in_at` | L1 | 开启 | M1 | 无签到时间留空 |
| 报名备注 | `options.remark` | L1 | **关闭** | M1 可选 | 可能含用户自填敏感内容；开启前二次提示，V1 建议保持关闭 |
| 审批结论 | 当前 `status` | L1 | 开启 | M1 | 不导出驳回理由或审批评论 |
| 凭证序号 | `serial_no` | L1 | 关闭 | M1 可选 | 非必要不导出 |
| 真实姓名 | 受控解密 `real_name_cipher` | L2 | **关闭且 V1 不可开启** | M2 | 每次同步二次确认、限定协作者和用途；不得使用 masked 字段冒充实名 |
| 手机号 | 受控解密 `phone_cipher` | L2 | **关闭且 V1 不可开启** | M2 | 每次同步二次确认；同时显示来源/验证状态可选，不默认开启 |
| 手机号来源/验证状态 | `phone_source`、`phone_verified` | L1 | 关闭 | M2 | 仅在手机号同步时有业务意义 |
| `openid` | `registrations.openid` | L3 | 禁止 | 永不 | 内部身份标识不出域 |
| `registration_id` | `_id` | L3 | 禁止 | 永不 | 仅内部幂等与定位使用 |
| 真实姓名/手机号密文、密钥 | `*_cipher`、环境变量 | L3 | 禁止 | 永不 | 不进入快照展示、任务 payload、日志或腾讯文档 |
| 紧急联系人姓名 | `profiles.emergency_name` 或快照 | **L3** | **禁止** | **永不** | 任何阶段不导出 |
| 紧急联系人电话（明文/掩码/密文） | `emergency_phone_*` | **L3** | **禁止** | **永不** | 任何阶段不导出，连掩码也不导出 |
| 审批人 openid、操作人 openid | 审批/签到记录 | L3 | 禁止 | 永不 | 仅内部审计可用 |
| 媒体、照片、临时 URL | profiles/media | L3 | 禁止 | 永不 | 本需求不导出媒体 |

### 5.3 空值与快照口径

- 默认同步全部状态 `waiting/pending/approved/checked_in/rejected/cancelled`，由管理员在预览时选择允许的状态集合；默认推荐 `pending/approved/checked_in`，实际产品评审后定版。
- 同一任务以预览确认时的 `source_watermark` 为边界；晚到或更新的数据进入下一次手动同步。
- 稳定排序：状态优先级（产品定版）+ `created_at ASC` + `_id ASC`；`_id` 只用于排序，不出现在表格。
- 缺失字段写空白或明确的“未填写”，不得从其他敏感字段推断。
- 表头和字段策略带 `field_policy_version`；版本变化必须重新预览确认。

## 6. 授权与撤销

### 6.1 授权

- 采用 OAuth 2.0 Authorization Code，授权发起和回调均由后台控制。
- `state` 随机、短期、一次性，与发起管理员 openid、目标环境和回跳页面绑定；不在 URL 放入活动名单或 PII。
- Client Secret、Access Token、Refresh Token 仅服务端保存，使用受管密钥加密；日志只记凭证记录 ID、scope 摘要和到期时间。
- 请求 scope 仅包含当前阶段必要能力。新增协作者或权限 scope 时，必须重新做隐私评审并要求用户重新授权。
- 多管理员不共享个人 token；每个任务绑定授权主体。是否允许组织级授权必须在 M0 由腾讯确认后另行设计。

### 6.2 撤销

管理员可在设置页点击“解除腾讯文档授权”：

1. 服务端重新校验管理员身份。
2. 若官方提供撤销接口则调用；是否支持及语义由 M0 验证。
3. 无论官方撤销结果如何，本应用立即将凭证标记为 `revoked`，停止新任务、刷新和外呼，并清除/销毁本地 token 密文（按安全实现选择立即删除或加密擦除）。
4. `queued/retryable` 任务转为不可继续；`dispatching` 任务通过租约 fencing 阻止后续批次。
5. 已创建的腾讯文档不会自动删除，除非官方能力、用户确认和产品策略都已明确；页面必须告知用户自行处理既有文档及其协作者。
6. 仅保留最小审计摘要和非敏感文档关联；token、code、PII 不保留在审计。

管理员被禁用、scope 缩减、refresh 失败或腾讯返回撤权信号时，按等同撤销处理。重新授权产生新的凭证版本，旧任务不得自动切换到新凭证继续写入，须由管理员确认恢复。

## 7. 同步状态机

### 7.1 任务状态

```text
prepared -> queued -> claimed -> dispatching
claimed|dispatching -> retryable -> claimed
claimed|dispatching -> succeeded
claimed|dispatching -> partially_succeeded
prepared|queued|claimed|retryable -> cancelled
claimed|dispatching|retryable -> auth_required
claimed|dispatching|retryable -> failed_terminal
claimed|dispatching -> delivery_unknown
```

- `prepared`：预览已生成，尚未确认。
- `queued`：已确认且持久化，等待 worker。
- `claimed`：worker 获得短租约，尚未调用外部 API。
- `dispatching`：至少一次外部调用已开始；必须记录批次游标和 attempt。
- `retryable`：确定未成功且可安全重试，带 `next_retry_at`。
- `succeeded`：目标范围全部写入且完成必要回读校验。
- `partially_succeeded`：部分批次已确认成功，剩余部分确定失败；可从未完成批次继续。
- `auth_required`：授权缺失、过期且刷新失败、scope 不足或用户撤权，需要人工重新授权。
- `delivery_unknown`：超时/断链导致外部结果无法判断；禁止自动重复写入，须先对账。
- `failed_terminal`：参数、文档不可恢复、策略冲突或重试耗尽。
- `cancelled`：尚未产生不可逆外部影响，或在批次边界停止；已写入部分不声称回滚。

所有终态写入必须校验 `status + lease_id + attempt_no`，避免过期 worker 覆盖新结果。

### 7.2 文档绑定状态

```text
unbound -> creating -> active
creating -> create_unknown|failed
active -> inaccessible|deleted|revoked
create_unknown -> active|failed（人工/自动对账后）
```

创建超时不得直接再次创建，以免产生重复文档。先按 M0 验证可用的请求 ID、元数据标记、文件列表或标题+时间窗口进行对账；无法可靠判定时进入人工处理。

## 8. 幂等、重试、并发与外部异常

### 8.1 幂等

- 请求幂等键：`sha256(activity_id + source_watermark + field_policy_version + selected_statuses + selected_fields + authorization_subject)`。
- 相同键只允许一个有效任务；客户端重复提交返回原 `job_id`。
- 文档绑定按 `activity_id + owner_authorization_id` 唯一；M1 一个活动在同一授权主体下至多一个 active 文档。
- 每批记录 `batch_no/range/payload_hash`；已回读确认的批次不重复发送。
- 不依赖腾讯支持幂等键；若其 V3 原生支持，则 M0 验证后双重使用。

### 8.2 重试

- 仅对可明确判定“未生效”的网络连接失败、5xx、限流和临时服务不可用重试。
- 指数退避加随机抖动，优先遵从可信 `Retry-After`；最大次数和总时长由 M0 压测后配置化。
- 参数错误、scope 不足、文档删除、字段策略失效直接进入对应人工状态，不做无意义重试。
- 外部结果未知进入 `delivery_unknown`，先回读/对账，绝不盲目重发。

### 8.3 并发

- 同一文档同时最多一个 `dispatching` 任务；新任务可排队或提示“已有同步进行中”。
- 租约到期可由新 worker 接管，但旧 worker 的 fencing token 失效。
- token 刷新按授权记录加互斥/版本 CAS，避免并发刷新覆盖轮换后的 refresh token。
- 报名数据在同步期间可继续变化；任务只处理其水位快照，不锁业务事务，不影响报名吞吐。

### 8.4 部分成功

- 每个批次成功后持久化游标和摘要，再处理下一批。
- 部分成功页面必须显示“已同步 X/Y 条”，不能显示整体成功。
- 继续重试只处理未确认批次；若表头或字段策略变化，必须新建任务，不能混写。
- 如果腾讯接口不支持安全续写，则以新工作表/临时区完整写入、校验后切换的方案作为候选，需 M0 实测后定版。

### 8.5 限流与配额

- 应用侧对 `openID`、`fileID` 和应用总量分别使用令牌桶/队列节流，目标速率低于公开上限并保留余量。
- 公开参考上限为文件操作 300 次/分钟/openID、单文档内容操作 150 次/分钟/fileID；接口特殊限制优先。
- 监控 429、配额余额、每任务调用数与重试放大率；达到预警阈值暂停新任务并向管理员给出预计恢复信息。
- 额度周期未确认前不在用户文案承诺固定刷新时间。

### 8.6 过期 token

- 外呼前判断 access token 剩余有效期，小于安全窗口则先刷新。
- 收到明确 token 过期响应时，允许一次受控刷新和原请求重试。
- refresh token 过期、撤销、scope 不足或刷新语义不明时进入 `auth_required`，提示重新授权。
- 刷新响应如返回新 refresh token，使用版本化原子替换；旧 token 立即停止使用。

## 9. 安全与审计

### 9.1 安全要求

1. 腾讯 API 只从服务端调用；客户端不接触 Client Secret 或 token。
2. token 密文与业务数据逻辑隔离，密钥不写仓库；最小权限访问、定期轮换并限制生产运维读取。
3. 构建导出行时采用字段白名单，不对对象做透传或“排除少数字段”。
4. L2 字段仅在 M2 单次任务执行窗口内按需解密，内存使用后释放，不写普通任务 payload、日志或错误详情。
5. 紧急联系人相关字段在最上游投影即排除，并有单测/集成测试验证任何阶段都无法选择或写出。
6. 文档标题不得包含手机号、真实姓名或其他 PII；错误日志不得记录 OAuth 参数、token、单元格值、密文或完整外部响应。
7. 官方打开 URL 仅返回给已重新鉴权的管理员；不得出现在公开接口、埋点明文或仓库证据。
8. M2 开启 L2 字段时，必须限制文档访问范围，禁止默认公开链接，并在写入前验证目标文档权限；能力未验证则 M2 不上线。
9. 腾讯文档副本的删除、保留和协作者责任在确认页明确告知管理员；撤权不等于已删除外部副本。

### 9.2 审计事件

建议事件：

- `tencent_docs.oauth_started/completed/revoked/refresh_failed`
- `registration_sync.previewed/confirmed/claimed/succeeded/partially_succeeded/retry_scheduled/delivery_unknown/failed/cancelled`
- `registration_sync.sensitive_fields_confirmed`
- `registration_sync.collaborator_added/removed`

审计仅记录：操作者内部标识、活动 ID、任务 ID、字段策略版本、字段等级集合（不记录值）、记录数量、状态、腾讯请求追踪 ID 的不可逆摘要、错误码、时间。不得记录真实姓名、手机号、紧急联系人、token、code、密钥、密文、表格行内容或完整 URL 查询参数。

审计保留期限、访问角色、导出流程和告警规则须在实施前由安全与运营确认。

## 10. 建议数据模型（仅设计，不实现）

> 以下为未来候选，不表示当前集合存在；本需求阶段不得修改 `docs/cloudbase-schema.md` 或创建集合/索引。

### 10.1 `tencent_docs_authorizations`

```text
_id: authorization_id
owner_openid
provider: tencent_docs
provider_open_id_hash
granted_scopes[]
access_token_cipher, refresh_token_cipher
access_expires_at, refresh_expires_at
credential_version
status: active|refreshing|auth_required|revoked
last_refresh_at, revoked_at
created_at, updated_at
```

### 10.2 `registration_sync_bindings`

```text
_id: sha256(activity_id + authorization_id)
activity_id, authorization_id
provider: tencent_docs
provider_file_id_cipher_or_protected
provider_book_id_cipher_or_protected
open_url_protected
status: creating|active|create_unknown|inaccessible|deleted|revoked|failed
created_by_openid
created_at, updated_at, last_verified_at
```

外部 ID 是否需要加密/受保护存储由威胁建模决定；无论如何不进入公开 DTO。

### 10.3 `registration_sync_jobs`

```text
_id: job_id
idempotency_key (unique intent)
activity_id, authorization_id, binding_id
requested_by_openid
source_watermark
selected_statuses[]
selected_fields[] (仅字段枚举，不含值)
field_policy_version
contains_sensitive: boolean
status
lease_id, lease_expires_at, attempt_no, next_retry_at
current_batch, total_batches
total_rows, succeeded_rows, skipped_rows, failed_rows
payload_hashes[] / snapshot_digest
provider_request_id_hash, last_error_code
created_at, confirmed_at, started_at, finished_at, updated_at
```

### 10.4 `registration_sync_batches`（数据量需要时）

```text
_id: sha256(job_id + batch_no)
job_id, batch_no, target_range, payload_hash
status: pending|dispatching|confirmed|retryable|delivery_unknown|failed
lease_id, attempt_no, provider_request_id_hash
row_count, last_error_code, updated_at
```

任务/批次不持久化 L2 明文。若为可靠重试确需持久快照，必须采用独立加密、短 TTL、任务结束删除和严格 ACL，并经安全评审；M1 非敏感字段仍优先采用可重建的水位快照。

### 10.5 建议唯一性与查询

- 授权：`owner_openid + provider + status`。
- 绑定：`activity_id + authorization_id` 唯一 active。
- 任务：`idempotency_key` 唯一；`status + next_retry_at`；`requested_by_openid + created_at DESC`。
- 批次：`job_id + batch_no` 唯一；`status + lease_expires_at`。

最终索引必须由真实查询计划、CloudBase 限制和数据规模验证后写入 schema，不在本文直接落地。

## 11. 接口草案

统一响应沿用 `{ ok: true, data }` / `{ ok: false, error }`。以下均为未来接口草案，不代表现有云函数 action。

### 11.1 授权

```text
POST tencent-docs-auth/start
请求: { return_path }
响应: { authorization_url, expires_at }

POST tencent-docs-auth/callback   // 平台回调，非小程序直传 token
请求: 官方回调参数
响应: 安全回跳或结果页

POST tencent-docs-auth/revoke
请求: { authorization_id }
响应: { status: "revoked", external_revoke: "confirmed|unknown|unsupported" }

GET tencent-docs-auth/status
响应: { authorized, scopes, access_expires_at, status }
```

### 11.2 预览与确认

```text
POST registration-sync/preview
请求: {
  activity_id,
  selected_statuses?: ["pending", "approved", "checked_in"]
}
响应: {
  preview_id,
  activity: { id, title },
  source_watermark,
  field_policy_version,
  fields: [{ key, label, level, selected, selectable }],
  counts: { total, by_status },
  expires_at
}
```

服务端不得接受客户端自定义列路径；`fields` 来自服务端策略。预览中真实姓名、手机号在 V1 必须 `selected=false, selectable=false`；紧急联系人字段不返回。

```text
POST registration-sync/confirm
请求: {
  preview_id,
  confirmation_token,
  idempotency_key
}
响应: { job_id, status: "queued", duplicate: boolean }
```

`confirmation_token` 由服务端签名并绑定管理员、活动、水位、字段策略、状态过滤和有效期。客户端不得提交实际行数据或 provider file ID。

### 11.3 状态、重试与取消

```text
GET registration-sync/jobs/{job_id}
响应: {
  status,
  progress: { succeeded, total, skipped, failed },
  document?: { open_url },
  last_error?: { code, message, retryable },
  actions: ["retry"|"reauthorize"|"reconcile"|"open_document"]
}

POST registration-sync/jobs/{job_id}/retry
请求: { expected_status }
响应: { job_id, status }

POST registration-sync/jobs/{job_id}/cancel
请求: { expected_status }
响应: { job_id, status, external_changes_may_remain }
```

所有接口必须重新执行服务端管理员鉴权、对象归属校验、状态转换校验和敏感字段策略校验。

## 12. 错误码与用户文案

| 错误码 | HTTP/业务语义 | 是否自动重试 | 用户文案 |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | 无可信微信身份 | 否 | “登录状态已失效，请重新进入小程序。” |
| `ADMIN_REQUIRED` | 非启用管理员 | 否 | “仅管理员可同步报名名单。” |
| `ACTIVITY_NOT_FOUND` | 活动不存在/不可访问 | 否 | “活动不存在或已不可用。” |
| `SYNC_PREVIEW_EXPIRED` | 预览过期或水位无效 | 否 | “报名数据已变化，请重新预览后同步。” |
| `SYNC_POLICY_CHANGED` | 字段策略版本变化 | 否 | “字段安全策略已更新，请重新确认。” |
| `SENSITIVE_FIELD_NOT_ALLOWED` | 当前阶段或权限不允许 L2 | 否 | “当前版本不支持同步真实姓名或手机号。” |
| `FORBIDDEN_EXPORT_FIELD` | 命中 L3 字段 | 否 | “所选字段不可导出。”（服务端告警） |
| `TENCENT_DOCS_AUTH_REQUIRED` | 未授权/refresh 失效/撤权 | 否 | “腾讯文档授权已失效，请重新授权后继续。” |
| `TENCENT_DOCS_SCOPE_DENIED` | scope 不足 | 否 | “当前授权缺少所需权限，请重新授权或联系管理员。” |
| `TENCENT_DOCS_RATE_LIMITED` | 官方限流 | 是 | “腾讯文档请求较多，系统将稍后继续。” |
| `TENCENT_DOCS_QUOTA_EXCEEDED` | 配额不足 | 否 | “腾讯文档接口额度不足，暂时无法同步，请联系管理员。” |
| `TENCENT_DOCS_FILE_INACCESSIBLE` | 文档删除/无权限 | 否 | “原同步文档不可访问，请确认权限后重试或新建文档。” |
| `SYNC_ALREADY_RUNNING` | 同文档并发任务 | 否 | “该活动正在同步，请稍后查看进度。” |
| `SYNC_PARTIAL_SUCCESS` | 部分批次完成 | 人工触发 | “已同步 {succeeded}/{total} 条，可继续重试未完成部分。” |
| `SYNC_DELIVERY_UNKNOWN` | 外部结果未知 | 禁止盲重试 | “同步结果暂无法确认，请先执行对账，避免重复写入。” |
| `SYNC_RETRY_EXHAUSTED` | 可重试错误耗尽 | 否 | “多次重试仍未完成，请稍后重新发起或联系管理员。” |
| `INTERNAL_ERROR` | 未知内部错误 | 视诊断 | “服务暂时不可用，请稍后重试。” |

用户文案不得包含腾讯原始响应、token、scope 内部细节、文档 ID、手机号、真实姓名或堆栈。运维可通过脱敏 trace ID 定位。

## 13. 分期

### M0：接入验证

目标：证明资格、权限和技术闭环，不接触生产报名 PII。

- 完成主体/应用申请与最小 scope 审核。
- 在隔离环境用合成数据实测 OAuth、token 刷新/撤销、V3 创建表格、批量写入、回读、权限与协作者（若申请）。
- 实测 429、5xx、超时、过期 token、撤权、scope 不足、文档删除、配额不足和创建结果未知。
- 书面确认配额计费、数据处理、安全 SLA 和普通第三方/SaaS 能力边界。
- 输出接口契约、脱敏错误映射、批量大小、限流参数和 Go/No-Go 结论。

退出条件：关键待验证项有证据；无法确认安全写入、撤销或结果未知处理则不进入 M1。

### M1：无敏感字段手动同步

目标：管理员单活动、显式触发、非敏感字段快照。

- 仅 L0/L1 白名单，真实姓名和手机号不可选，紧急联系人完全不存在。
- 支持授权、预览、确认、创建/更新、状态查看、可安全重试与审计。
- 复用服务端管理员鉴权和 Outbox 可靠投递思想。
- 不做实时、定时或事件驱动自动同步；不做协作者自动管理。

### M2：受控敏感字段与协作者

目标：在必要性、合规与官方能力均通过后，有限开放真实姓名/手机号和协作者。

- L2 字段仍默认关闭；每次同步单独二次确认，不允许记住为全局默认。
- 明确用途、接收者、保留期限；校验文档非公开且协作者最小化。
- 超级管理员审批或双人复核是否需要，由安全评审定版。
- 支持协作者增删查前，先验证普通第三方应用接口、身份映射和上限。
- 紧急联系人仍永不导出。

### M3：可选增量自动同步

目标：仅在 M1/M2 稳定、用户明确开启且风险可控时提供。

- 默认关闭，以活动为单位显式开启，可随时暂停。
- 采用 Outbox/变更水位和定期对账，不承诺实时；写入延迟 SLO 经容量验证后设定。
- 对取消、状态变化、删除、表格人工编辑冲突定义清晰策略。
- 开启前再次告知字段、频率、接收者和外部保留；L2 自动同步需要更高等级审批。
- 第一版明确不做本阶段能力。

## 14. 验收标准

### 14.1 M0 验收

- [ ] 目标主体应用审核通过，Client ID/Secret 由密钥系统管理，无凭证进入仓库或客户端。
- [ ] 以官方当前 V3 完成：授权 → 创建表格 → 分批写入 → 回读 → token 刷新 → 撤销授权。
- [ ] 得到各接口 scope、批量上限、频控、主要错误码和配额周期的可追溯证据。
- [ ] 对创建/写入超时能够可靠对账；不能可靠对账时验证会进入 `delivery_unknown` 且不自动重发。
- [ ] 合成数据验证权限/协作者能力；普通第三方不可用的 SaaS 能力未被承诺。

### 14.2 M1 功能验收

- [ ] 非管理员无法看到或调用同步；伪造 openid、role、fileID、字段、行数据均被拒绝。
- [ ] 管理员可对单个活动完成授权、预览、确认、同步、查看进度和打开文档。
- [ ] 重复确认同一预览返回同一任务，不产生重复文档或重复行。
- [ ] 同文档并发任务串行；租约过期 worker 不能覆盖新 worker 结果。
- [ ] 部分成功仅重试未确认批次；未知结果不盲重试。
- [ ] token 过期可受控刷新；refresh 失效进入重新授权，不丢失可诊断状态。
- [ ] 限流遵循 `Retry-After`（若有）和退避；配额不足停止并给出正确文案。
- [ ] 报名在同步期间可继续提交/审批/取消/签到，且同步失败不改变业务事实。

### 14.3 隐私与安全验收

- [ ] V1 真实姓名、手机号默认关闭且不可开启，任务和腾讯表格均无对应列和值。
- [ ] 紧急联系人姓名、电话明文、掩码、密文在所有阶段永不导出；通过白盒测试、集成测试和目标表格抽检证明。
- [ ] `openid`、registration ID、密文、token、密钥、媒体 URL、审批人标识不进入表格。
- [ ] 日志、审计、埋点、错误和测试证据不含 PII、OAuth 参数、token、密钥、密文或单元格原文。
- [ ] 撤销后新任务与后续批次停止；旧凭证不可继续使用；页面明确既有外部文档不会因此自动删除。
- [ ] M2 若未完成权限封闭、二次确认和安全评审，L2 能力保持关闭。

### 14.4 真实性验收

- [ ] 文档、页面和发布说明均标注能力阶段；无真实证据时使用“未执行/待验证”，不写“已通过”。
- [ ] 本需求评审阶段未修改 CloudBase schema、未创建集合/索引、未新增代码骨架。

## 15. 非目标

- 第一版不做实时、准实时、定时或报名事件触发的自动同步。
- 不做腾讯文档到小程序的双向同步或表格回写审批/签到/容量。
- 不把腾讯文档作为灾备、主数据库或财务账本。
- 不做多活动合并总表、跨俱乐部/多租户数据仓库。
- 不导出照片、头像、GPX、媒体链接或群二维码。
- 不导出紧急联系人任何信息，任何阶段均不例外。
- V1 不导出真实姓名或手机号；M2 也不默认开启。
- 不承诺 SaaS 企业版能力可用于普通第三方应用。
- 不在本需求中新增 schema、集合、索引、云函数目录、占位 action、定时器或代码骨架。
- 不在未完成 M0 前承诺上线日期、吞吐、SLA、配额周期或商业价格。

## 16. 上线、回滚与监控

### 16.1 上线

1. 功能开关默认关闭，按环境和管理员白名单灰度。
2. 先在隔离环境使用合成数据；再以内部测试活动验证，不直接选择真实生产活动。
3. 上线前核对应用审核、scope、回调域名、密钥托管、隐私说明、告警和值班手册。
4. M1 先开放少量管理员，每日限制任务数与行数，观察至少一个完整运维周期后扩大。
5. 每阶段上线必须重新确认字段策略；M2/M3 使用独立开关，不能随 M1 自动开启。

### 16.2 回滚/熔断

- 可立即关闭“新建同步任务”和 worker 外呼两个独立开关。
- 关闭后不影响报名、审批、候补、签到和通知；`queued/retryable` 保留待人工决定，`dispatching` 在安全批次边界停止。
- 不通过删除当前业务集合或回滚报名数据来回滚同步功能。
- 外部已写内容不声称自动回滚；按文档 ID 清单由授权管理员确认删除、收紧权限或保留。
- 凭证泄露时立即吊销/失效、轮换 Client Secret、停止 worker、核查审计并按安全事件流程处理。

### 16.3 监控与告警

核心指标：

- 授权成功率、refresh 成功率、撤权/失效数。
- 任务 queued 时长、端到端成功率、部分成功率、`delivery_unknown` 数、终态失败率。
- 每任务 API 调用数、写入行数、429/5xx/4xx 比例、重试放大率和配额余量。
- 租约过期/并发冲突、幂等命中、重复文档对账发现数。
- PII 防泄漏规则命中、L3 字段阻断、敏感字段任务数量（M2）。

建议告警：`delivery_unknown > 0`、连续 refresh 失败、429 激增、配额接近阈值、同活动重复文档、worker 租约持续过期、任何 L3 字段阻断、审计写入失败。审计不可用时敏感同步必须 fail closed。

## 17. 开发任务拆分

> 仅用于后续排期；当前不提前创建代码骨架。

### 17.1 M0 接入与验证

1. 平台负责人：完成主体、应用、回调域和 scope 申请，维护待验证清单。
2. 后端：制作隔离验证工具，验证 OAuth、V3 创建/写入/回读、权限、协作者和用量查询。
3. QA：构造 429、5xx、超时、撤权、过期 token、文档删除和部分批次失败场景。
4. 安全/法务：确认数据处理、保留删除、驻留、加密、事件通知、SLA 与配额合同口径。
5. 产品：基于实测更新接口、错误码、字段策略和 Go/No-Go，不把验证脚本当生产实现。

### 17.2 M1 产品与工程

1. 产品/设计：管理员授权、预览、确认、进度、部分成功、重新授权和撤销页面。
2. 后端鉴权：复用现有 `admins` + `WXContext.OPENID`，定义对象级权限与统一错误响应。
3. OAuth 适配：服务端 start/callback/refresh/revoke、凭证加密和版本化刷新。
4. 投影器：活动/报名稳定分页、水位快照、状态映射、字段白名单与 L3 硬阻断。
5. 同步编排：任务 Outbox、租约、fencing、批次游标、幂等键、退避与对账。
6. 腾讯适配器：V3 create/write/read/permission 的窄接口封装，不向领域层泄露原始响应。
7. 审计：新增同步专用安全事件和脱敏 trace；失败时按敏感等级 fail closed。
8. QA：领域单测、适配器契约测试、沙箱集成测试、真机管理员旅程和故障注入。
9. 运维：功能开关、配额看板、告警、熔断、回滚与事件响应手册。
10. 文档：实施时再更新 `docs/cloudbase-schema.md`、需求基线和真实验证记录；无证据标记待验证。

### 17.3 M2/M3 前置任务

- 完成 L2 必要性评估、用户告知/同意口径、文档权限闭环和协作者身份验证。
- 增加单次二次确认、可能的双人复核、保留期限与外部文档清理机制。
- 设计增量事件水位、乱序/删除/人工改表冲突、周期对账和暂停恢复。
- 重新容量评估 API 配额与限流；未取得书面或实测结论，不启用自动同步。

## 18. 评审决策清单

进入开发前需明确：

1. M1 默认包含哪些报名状态，是否允许管理员切换状态过滤。
2. 报名备注在 M1 是完全禁用还是默认关闭可选；若可选，如何提示自由文本风险。
3. 更新已有表格采用整表覆盖、固定工作表覆盖还是新建版本工作表，以 M0 V3 能力为准。
4. 已创建文档的默认权限，以及授权管理员离职/被禁用后的归属处置。
5. 预览有效期、单任务最大行数、批次大小、最大重试次数和任务保留期。
6. M2 真实姓名/手机号的合法必要性、接收者和外部保留期限；不能回答则保持关闭。
7. 腾讯侧无法确认撤销、删除、结果对账或权限封闭时，对应阶段是否直接 No-Go。

本文以“最小权限、显式操作、默认不出敏感字段、外部副本可追溯、未知结果不重复发送”为最终裁决原则。