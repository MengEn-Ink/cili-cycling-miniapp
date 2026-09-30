# CILI UI、媒体诊断与预告发布设计

## 目标

修复开发版中活动创建、活动审批和资料编辑的主题与控件尺寸不一致问题；把微信头像、Strava 头像和个人照片上传从泛化失败改为可定位、可重试的流程；允许运营资料未齐的活动先公开展示，同时确保报名在容量与交通配置补齐前保持关闭。

## 已确认事实

- 当前基线为 `main@81c30a8`，CloudBase 已具备 11 个集合、22 条索引与 10 个函数。
- `profile`、`strava-auth`、`strava-callback` 部署代码与主线一致，所需环境变量格式有效；CloudBase 存储 ACL 为 `PRIVATE`。
- 当前环境未启用 CLS 日志主题，无法从最近线上失败中恢复首个稳定错误码。客户端又将云调用异常折叠为 `CALL_FAILED`，因此现阶段不能断言头像失败的唯一根因。
- 创建活动页使用荧光黄局部主题，审批页使用黑橙主题；活动模板输入、审批筛选、资料照片按钮和部分次级按钮没有统一的 88rpx 触控下限。
- 服务端已能保存字段不完整的草稿，并能为字段不完整的已发布活动返回 `closed_reason=incomplete`；但发布校验、客户端映射与报名门禁尚未形成完整的“可展示但不可报名”契约。

## 方案比较

### 方案 A：公开预告与报名开放解耦（采用）

`status=published` 只表示活动可以公开展示；是否允许报名由服务端计算的 `registration_state` 决定。标题、活动开始/结束时间、路线起终点和安全说明是公开预告的最小要求。容量、分仓、司机、报名截止和费用可以后补；任一报名必需字段缺失时返回 `closed_reason=incomplete`，客户端显示“报名待开放”，报名接口返回稳定的 `SIGNUP_INFO_INCOMPLETE`。

优点是满足快速发布且不伪造业务数据，也不会产生超卖或无法履约的报名。代价是发布页需要明确区分“发布活动”和“开放报名”。

### 方案 B：缺字段也开放报名（不采用）

只用总容量或默认值接受报名。实现简单，但会产生集合方式无法分仓、司机未确认和容量超卖风险。

### 方案 C：继续只保留草稿（不采用）

风险最低，但不满足用户要求的快速公开活动。

## 活动状态与数据流

1. `draft → published` 时，服务端只要求公开展示所需字段完整且时间顺序有效。
2. `publicActivity` 始终由服务端计算报名状态：
   - 活动结束：`finished`
   - 报名配置缺失或分仓未就绪：`incomplete`
   - 截止时间已过：`deadline`
   - 总容量或分仓满额：`full`
   - 其余：`open`
3. `registration/submit` 在任何资料读取和写入前调用同一报名就绪判断；`incomplete` 时返回 `SIGNUP_INFO_INCOMPLETE`。
4. 后续编辑补齐容量、分仓、司机、截止和费用后，服务端事务完成分仓回填并把活动自然转为 `open`，无需新状态迁移。
5. 列表和详情显示已发布活动；CTA 对 `incomplete` 显示“报名待开放”。

10·1“碣石村—灵岳寺”已有标题、时间、路线、里程爬升、安全说明、AA 费用和封面，可先发布为预告；容量拆分与司机仍保持未知，报名关闭，后续补齐后开放。

## 视觉与交互

采用“双表面、单品牌”：全局共享组件继续是浅色默认，深色业务页通过页面根节点局部覆盖；品牌色统一为 `#0b0b0c`、`#242427`、`#d55b1f`、`#c82018`，活动编辑页不再使用荧光黄或未定义 `--accent`。

- 共享控件令牌：单行控件和按钮最小 88rpx，多行文本最小 220rpx。
- 活动创建/编辑：input、picker、textarea 和发布状态提示统一；“发布活动”与“报名待开放”文案分离。
- 审批列表/详情：筛选和活动选择器具备 88rpx 触控区，审批按钮保持防重复与 safe-area。
- 资料编辑：头像按钮保持 88rpx；照片按钮取消 mini 尺寸并增加 `photoBusy`；失败时保留旧头像/照片并显示持久 inline alert。
- 所有异步错误进入稳定 `role=alert`/`aria-live` 区域；新尝试开始或成功后清除旧错误。

## 媒体失败诊断与恢复

客户端为三条链记录无敏感信息的阶段名与稳定错误码：

- 微信/自定义头像：`issue_path → upload → register → set_avatar`
- 个人照片：`issue_path → upload → register`
- Strava 头像：`readiness → import`

页面不得记录或展示 `fileID`、openid、头像 URL、token 或用户资料。错误提示包含下一步，例如重新选择图片、重新授权 Strava 或稍后重试。Strava credential 缺少头像信息时显示“请重新授权 Strava 获取头像”，而不是泛化失败。上传动作使用单一 busy lock；失败后释放锁并保留现有资料。

由于测试环境未启用 CLS，本轮先通过客户端安全阶段码和一次真机 smoke 定位实际失败点。启用 CLS 属于独立环境变更，不作为本轮前置条件。

## 兼容与迁移

- 存量 `published` 活动不回写默认容量或司机。
- 客户端接受 `closed_reason=incomplete`，旧客户端仍会按不可报名处理。
- 模板复制继续清空活动 ID、状态、报名/审核数据、媒体和司机联系方式；生成的草稿可在补齐最小展示字段后发布预告。
- 既有安全边界不变：头像必须 owner-bound；Strava 头像只由服务端受限导入；身份缓存不持久化 openid、role、isSuper 或 token。

## 验证与发布

1. 先写 RED 覆盖发布预告、报名待开放、补齐后开放和服务端 fail-closed。
2. 写 UI 契约测试覆盖主题令牌、88/220rpx、safe-area、alert 和 busy lock。
3. 写媒体行为测试覆盖每个失败阶段、Strava 重授权提示、旧数据不丢失和重试成功。
4. 运行 `validate`、`coverage`、`audit:all`、只读 CloudBase plan。
5. 独立复核无 P0/P1 后快进 main；仅测试环境执行必要 apply/deploy，并上传新开发版。
6. 使用真机执行微信头像、个人照片、Strava 头像、活动预告、报名待开放、补齐配置后报名的闭环。

## 非目标

- 不用默认容量、虚构司机或虚构费用开放报名。
- 不启用生产环境发布。
- 不在本轮引入新的前端框架、全站深色主题或客户端直接写数据库。

## Phase 2 安全复核 follow-up

头像与图片链在部署前还必须满足以下收敛契约：

- Strava DNS 解析与 HTTPS 请求都在同一个 5 秒总 deadline 内；仅 `EAI_AGAIN` 等白名单瞬时 DNS 错误重试一次，私网/保留地址、格式错误和其它安全错误立即失败。
- `avatar_available` 仅在头像 URL 同时满足 HTTPS、无凭证、无显式端口、非 IP 且属于三项 Strava CDN allowlist 时为 true；OAuth 写入和 readiness 使用同一可信 URL 规则。
- `registerMedia` 在调用 CloudBase 临时 URL、HEAD 或 GET 之前，先验证 fileID 的 HMAC owner 路径。对象验证先读取可信临时 URL 的 `Content-Length`，再以最多 5MiB 的流式读取核对实际大小和 JPEG/PNG/WebP magic；不使用会把整个对象载入内存的 `downloadFile`。
- `mediaUploadPath` 在把 owner-bound cloudPath 返回客户端前，先在现有 `profile_media_imports` 集合写入 `client_upload` intent。`registerMedia` 成功时在同一事务完成媒体登记和 intent；若上传对象已落盘但客户端未收到响应，过期 intent 由既有 cleanup fence 按 owner path 恢复删除目标并回收。
- 客户端 inline alert 与 toast 使用同一安全文案。`MEDIA_TOO_LARGE` 明确引导压缩或换图；预览成功只能清除同一预览请求产生的旧错误，不得覆盖更晚的上传、登记或保存错误。
- 滚动部署顺序是硬门：先部署并验证 `profile`、`strava-auth`、`strava-callback` 与 `profile-media-cleanup`，确认 readiness、intent 和 cleanup 契约，再上传依赖 `avatar_available` 的小程序开发版。

### Immutable canonical media

客户端可写的 `profiles/<owner-alias>/<uuid>.<ext>` 仅为 source staging path，永远不直接用于对外签 URL。服务端完成 HEAD 与有界 GET 后，对实际读取字节计算 SHA-256，并上传到 `profile-canonical/<owner-alias>/<sha256(source-file-id)>/<sha256(bytes)>.<ext>`。该路径同时绑定 owner、source 与内容版本：同一 source/内容重复登记幂等，source 被覆盖也不会改变已登记 canonical 对象；不同 source 不共享 cleanup 生命周期。

`profile_media` 继续以 source fileID 的摘要为主键并兼容 profile 中的旧引用，同时新增 `source_file_id`、`canonical_file_id`、`sha256`、`size`、`mime`。个人与管理员名片仅解析 canonical fileID；缺少合法 canonical 绑定的 legacy 记录隐藏并回退品牌图，不再签 source URL。

canonical 上传前先写独立 `canonical_upload` intent；响应未知时 source intent 与 canonical intent 均可由现有 fenced cleanup 按各自 owner path 收敛。登记成功必须在一个事务内写 registry 并完成两个 intent。解除全部 profile 引用后，媒体 cleanup 同批删除 source 与 canonical；仍有头像或 photos 引用时二者都不能删除。

仓库声明云存储规则：客户端只可写 `profiles/` staging 前缀且需匹配资源 owner，`profile-canonical/` 只能由云函数/控制台写。发布时必须先应用并回读规则，再通过小程序真实身份尝试覆盖 canonical 路径并确认拒绝，随后才能部署依赖 canonical registry 的函数与上传客户端。
