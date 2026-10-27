# Issue #384 内容审核运行链路实施方案

日期：2026-10-27

Issue：[#384](https://github.com/MengEn-Ink/cili-cycling-miniapp/issues/384)

基线：`ca5affe05f726f6ae71ab2ea9b4c609508560165`

来源：`0908a0214f02b0817fcaefbe188e928905535d5b`、已合 #370/#376、当前 main 的 #358/#372 媒体兼容实现。

## 1. 目标与边界

本轮只建立一个可自动验证的后端纵切片：

```text
现有 canonical profile_media
  -> profile.submitMediaReview
  -> 事务预占唯一 operation 并消耗 attempt
  -> 微信 mediaCheckAsync
  -> 同 operation + 完整媒体绑定事务 ACK 为 pending
  -> content-callback 安全模式验签/解密/AppID 与事件校验
  -> pass|review|risky 或已认证 -1008
  -> trace + operation + media 完整绑定 CAS
  -> 终态幂等，或进入 retryable
```

不修改小程序页面、交互、设置页和 `RELEASE_NOTES`，不自动改变现有 `registerMedia`、`setAvatar`、活动、俱乐部或公开读取行为。因此，本轮不是完整上线：上传后不会由现有客户端自动调用新 action，也不会在回调尚未部署时强制阻断已有保存链路。

## 2. 复用与修正

- 复用 #370 的 `content.cjs` 为 `profile/content-contract.js`，保持严格响应码、trace、scene/version、canonical/sha256/generation 绑定。
- 复用 #376 的认证回调协议为云函数 `callback-contract.js`，保留签名、AES-CBC/PKCS#7、嵌入 AppID、事件 AppID、整数 `version=2` 和整数 `errcode` 校验。
- 复用 source 的 `content-callback` HTTP/core/store 结构和测试形态，但修正 R03/R06，并将 operation 纳入绑定。
- 复用当前 main 的 canonical 媒体登记、source/canonical 路径兼容、owner 校验和精确“文档不存在”识别，不回退 #358/#372。
- 协议依据为微信发布的[消息加解密说明](https://developers.weixin.qq.com/doc/store/leagueheadsupplier/callback/allback_encoding.html)与企业微信成熟的 [`VerifyURL` 契约](https://work.weixin.qq.com/api/doc/90000/90139/90968)：`msg_signature = SHA1(sort(token,timestamp,nonce,encrypted))`，AES-256-CBC 的 IV 为 AESKey 前 16 字节，PKCS#7 块大小为 32，解密帧为 `random(16B)+msg_len(4B,网络字节序)+msg+AppID/ReceiveId`，必须校验尾部标识。固定测试向量直接取后者公开的 `QDG6eK` 示例，不由本仓库加密函数反向生成。

## 3. 数据模型与不变量

### `content_media_check_operations`

`_id = operation_id`，每次真实外部调用前创建。核心字段：

```text
operation_id, media_id, owner_openid, category, generation
canonical_file_id, sha256, attempt
status: reserved|submitted|pending|submission_unknown|retryable|pass|review|risky
trace_id, reserved_at, submitted_at, lease_expired_at
error_code, created_at, updated_at
```

### `content_media_checks`

`_id = trace_id`，仅在微信受理成功后由 ACK 事务写入：

```text
trace_id, operation_id, media_id, owner_openid, category, generation
canonical_file_id, sha256, attempts
status: pending|retryable|pass|review|risky
```

### `profile_media` 增量字段

```text
security_operation_id, security_trace_id, security_attempts
security_status: submitting|pending|submission_unknown|retryable|pass|review|risky
security_error_code, security_reserved_at, security_submitted_at
security_failed_at, security_decided_at, security_detail_count
```

不变量：

1. `reserveMediaCheck` 在任何临时 URL 和微信调用前运行；事务内先检查 owner、用途、generation、canonical、sha256 和媒体状态，再写唯一 operation，并同步增加 `security_attempts`。`reserved_at` 同时是有界 submitting lease 的起点。
2. 外部调用失败不会退还预算；`failMediaCheckOperation` 只结算仍为当前 `submitting` 的同 operation 和同绑定，旧失败不能覆盖新尝试。
3. 微信明确返回成功和 trace 后，必须先以 `recordMediaCheckSubmission` 把 trace、完整绑定、attempt、submitted_at 写回同一 operation，状态改为 `submitted`，再执行三表 ACK。ACK 瞬时失败时，同 operation 重放只从 `submitted` 恢复 ACK，严禁再次调用 `mediaCheckAsync`；已为 `pending` 的重复恢复直接返回既有结果。
4. `reserved + submitting` 在租约内重放仍返回处理中；租约过期且没有已持久化 trace 时，外部结果不确定，operation/media 原子标记 `submission_unknown`，禁止自动创建新 operation 或盲目重提，由运维结合微信侧记录处理。
5. 回调先于 ACK 时 trace 表尚不可见，固定返回可重试错误，使微信重试；ACK 成功后才允许回调同时匹配 trace、operation、media 三份记录及当前 `security_operation_id/security_trace_id`，旧回调只返回 `ignored`。
6. `pass/review/risky/retryable` 在 trace 已终态时直接返回现有状态，重放不重复写。
7. 已认证 `errcode=-1008` 落 `retryable`；未知、未认证或类型宽松的输入拒绝。
8. 仅错误码与消息共同明确表示 document missing 时返回不存在；普通 `-502001/-1` 数据库故障继续抛出，使 HTTP 返回 5xx。
9. 当前 main 尚无权益 generation 的存量 `profile_media` 只在此纵切片明确映射为 generation 1；一旦记录已有 generation 就必须精确相等，后续权益代际上线时移除此单点兼容，而不是把缺值泛化为任意代际。

## 4. 本轮运行入口

`profile` 新增后端 action `submitMediaReview`：

```json
{
  "action": "submitMediaReview",
  "fileId": "cloud://...source-file-id...",
  "operationId": "client-or-server-idempotency-key"
}
```

OPENID 始终来自 `cloud.getWXContext()`；传入 `openid` 会被拒绝。入口读取当前 owner 的既有 canonical 记录后调用预占服务。`operationId` 可由调用方提供用于请求幂等；省略时服务端生成 UUID。本轮未让小程序调用此 action。

`content-callback` 新增 GET URL 校验和 POST 安全模式回调，候选网关路径为 `/content/callback`。缺少 Token/AESKey/AppID 时固定返回 503；未认证输入不能进入 store。GET 按安全模式契约读取 `msg_signature/timestamp/nonce/echostr`：签名必须覆盖 Token、时间戳、nonce 和加密 `echostr`，验签后复用 POST 的 AES-256-CBC、严格 PKCS#7、消息帧与 AppID 校验，最终只返回解密后的明文 `echostr`；不得回退到三参数 `signature` 或原样返回密文。POST 仍以请求体 `Encrypt` 参与同一四参数签名，不改变既有消费流程。

## 5. 分阶段实施

### 阶段 A：本提交（初步代码闭环）

- [x] operation 预占、唯一键和最多 2 次尝试预算。
- [x] 外部失败按当前 operation CAS 为 retryable。
- [x] 成功 trace 先写 operation outbox（`submitted`），三表 ACK 瞬时失败可由同 operation 幂等恢复且不重复调用微信。
- [x] submitting 租约内保持处理中；租约过期且外部结果未知时进入 `submission_unknown`，禁止盲目重提。
- [x] 认证回调、`-1008` 可恢复、终态幂等、完整绑定 CAS。
- [x] 数据库“明确不存在”与通用错误分流。
- [x] 新云函数和候选网关声明、包级测试接入。
- [x] 安全模式 GET 使用 `msg_signature` 对加密 `echostr` 验签，解密并校验 AppID 后返回明文；固定采用企业微信官方 `VerifyURL` 发布向量做跨实现测试。
- [ ] 不启用客户端自动提交和保存强制门槛。

### 阶段 B：部署前基础设施

- 创建 `content_media_check_operations`、`content_media_checks`，客户端 ACL 全拒绝。
- 为运维查询建立至少 `media_id + created_at`、`status + updated_at` 索引；确认 `_id` 唯一约束作为 operation/trace 唯一性来源。
- 部署 `content-callback`，以函数环境变量精确配置 `WECHAT_CALLBACK_TOKEN`、`WECHAT_CALLBACK_AES_KEY`（43 字符 EncodingAESKey，不带补位 `=`）、`WECHAT_APP_ID`；三者必须与微信后台同一套配置一致，不得在日志、仓库或回执中输出值。
- 回读函数 runtime/handler、三项环境变量“已存在”状态、网关 `/content/callback` 路由、无鉴权 HTTP 配置和最终 HTTPS 域名；不得只检查本地配置文件。
- 在微信后台选择安全模式并保存 URL。抓取首次 GET，确认包含 `msg_signature/timestamp/nonce/echostr` 且 `echostr` 为密文；服务必须在 3 秒内以 `text/plain`、HTTP 200 返回解密后的明文，不得返回密文、JSON、引号、空格或换行。分别重放错误签名、破坏密文、错误 AESKey 和错误 AppID，确认均不返回 2xx 明文。
- 使用微信官方消息接口调试工具的安全模式加密调试推送真实事件，确认普通 POST 仍以 `msg_signature + Encrypt` 验签、解密、校验 AppID 并返回 `success`，且 operation/trace/media 状态按预期推进；GET 成功不能替代这一步。
- 先以隔离媒体调用显式 `submitMediaReview`，确认回调可达、重试行为与数据库事务行为。

### 阶段 C：业务门槛与完整消费者

只有阶段 B 通过后，才能把 `registerMedia -> submitMediaReview` 自动串联，并让 profile/activity/club 保存、活动人工审批和 public read 统一消费安全状态。需要同时完成：

- `pass` 才可激活；显式 `review/risky` 永不借当前引用或 legacy 例外公开。
- 无状态旧绑定仅按明确兼容矩阵处理，保留 #358/#372 的来源、用途、路径版本和本人预览。
- 活动人工审批在同一事务重核原作者媒体；pending/retryable/review/risky 不得随审批发布。
- 公开签名和缓存失效同步接入；失败恢复与补偿 worker 有监控和预算。

## 6. 回调部署门槛

以下任一项未满足，禁止启用上传后的自动审核或保存强制门槛：

1. 三项回调配置在目标 CloudBase 实际回读存在，且密钥轮换/回退方案完成。
2. HTTPS 网关 GET 校验及微信安全模式 POST 均通过；请求体 envelope 与平台实际格式一致。
3. 两个集合、ACL、索引已建立，通用数据库故障实测返回 5xx，微信会重试。
4. 真实回调可将当前 operation 从 pending 推进，重放不增写，旧 operation 不覆盖新 pending。
5. `-1008`、超时、trace 暂不可见、事务冲突和 ACK 失败均进入可观察状态；同 operation 能从 `submitted` 恢复 ACK，`submission_unknown` 有人工核对与解锁流程。
6. 没有把 Token/AESKey、密文、openid、媒体 URL 或回调明文写入日志。

## 7. 自动化验收

本轮本地验收覆盖：

- 外部调用前 reserve；失败仍消耗预算；第三次提交被拒绝。
- ACK 对 operation、attempt、owner、用途、generation、canonical、sha256 做完整 CAS；外部成功凭据先持久化，瞬时 ACK 失败后同 operation 只恢复 ACK。
- callback 先于 ACK 返回可重试错误；重复恢复幂等；submitting 租约未过期保持 IN_PROGRESS，租约过期进入 `submission_unknown` 且不再次调用微信。
- pass/review/risky 终态幂等；删除、换代、换摘要、跨 operation 回调均忽略。
- 已认证 `-1008` 写 retryable 且重放幂等。
- 未知 trace 返回 503；认证错误返回 4xx；数据库错误返回 5xx。
- `-502001/-1` 只有明确 document missing 文本才可吞。
- 受影响云函数测试、内容协议测试、bootstrap/部署配置相关测试和 `git diff --check` 通过。

## 8. 真实微信回调后续验收

在隔离环境使用真实微信安全模式回调完成以下矩阵，模拟器或合成 AES fixture 不能替代：

1. `upload -> canonical -> reserve -> pending -> pass -> 业务保存 -> active -> public read`。
2. review、risky、`-1008`、网络超时、微信受理成功但本地 ACK 失败。
3. 回调先于 ACK 可见、重复回调、乱序回调、旧 operation 迟到、同 operation 重放。
4. canonical 原生图片转换、JPEG/PNG/WebP、大小边界、目标 Nodejs20.19/Linux ABI。
5. 数据库临时不可用、事务冲突、集合/索引缺失、网关 5xx 重试。
6. 当前 source/canonical 引用、现代/旧类别、本人预览、公开签名和活动人工审批。
7. iOS/Android 真机、普通成员身份、目标云回读、全量 `validate`、安全审计、PR/main CI 与 CodeQL。

## 9. 回退与遗留

本轮尚未改动业务激活和公开读取，回退可先停用 `/content/callback` 与显式 `submitMediaReview`；保留 operation/trace 记录用于审计，不删除已产生的状态。不得以回滚方式把 review/risky 当作 pass。

遗留工作是阶段 B/C：真实部署和微信回调、集合/索引 bootstrap、自动提交、保存/审批/公开读取门槛、活动与俱乐部消费者、恢复 worker、监控告警和全链路真机验收。完成这些工作之前，Issue #384 只能标记为“初步后端闭环”，不能宣称生产内容审核已上线。
