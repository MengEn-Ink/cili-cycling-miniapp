# “此里”真实报名旅程与 UI 重构设计

- 日期：2026-09-29
- 状态：方案 A 已获负责人批准，本文等待最终书面复核
- 仓库：`/Users/bytedance/work/ride-event-miniprogram`
- 设计原则：先修通真实客户旅程，再扩展完整一期能力

## 1. 决策摘要

当前版本应定义为“可靠的 CloudBase 安全底座 + 最小报名/审批闭环”，不能定义为需求稿中的完整一期。第一批交付聚焦一条真实可用的客户旅程：

> 活动浏览 → 判断报名资格 → 完善实名资料 → Strava 授权并自动准备数据 → 提交报名 → 管理员审批 → 查看凭证 → 取消或驳回后重报

后端继续采用原生微信小程序、`CloudRepository`、分域云函数、数据库客户端全拒绝、WXContext 身份、AES-256-GCM 加密和事务化名额管理。UI 重构不得破坏这些已验证边界。

视觉采用“公路骑行路书”方向：图片主导、暖纸背景、深林绿主色、骑行橙强调色，用路线、时间、爬升、名额和骑手信息构成业务识别，替代重复的“渐变 Hero + 白卡片”模板。

## 2. 当前事实

### 2.1 已经成立的技术底座

- 页面通过 repository/service 与云函数隔离，主要入口为 `miniprogram/repositories/cloud.ts`。
- 真实运行固定使用 `CloudRepository`，不会静默回退 Mock。
- 身份只信任 `cloud.getWXContext().OPENID`；管理员能力在服务端再次校验。
- 业务集合拒绝客户端直接读写，只允许云函数访问。
- PII 与 Strava token 使用 AES-256-GCM；OAuth state 有哈希、过期和一次性消费保护。
- 报名占位、取消和审批通过事务维护 `pending + approved` 名额口径。
- 2026-09-29 执行 `npm run validate` 全通过：前端 69 个测试、bootstrap 13 个测试、全部云函数测试、类型检查、部署包检查和 13 页面源码完整性检查均通过。

### 2.2 阻塞真实旅程的问题

1. OAuth 回调写入 credential 后，状态会显示 connected；但服务端报名还要求存在 Strava snapshot。用户若没有再次手动同步，会遇到“界面看似已绑定、提交却失败”。
2. OAuth 回调页没有自动返回小程序，只提示用户手动返回。
3. 活动 CTA 没有提前区分报名中、已满、已截止、已结束和已有报名，用户可能到提交时才知道失败。
4. 缺失 Strava 指标在部分映射中被折算成 `0`，管理员无法区分“真实为零”和“尚未取得”。
5. 需求稿与实现口径漂移：当前允许个人主体手填手机号并标记 manual/unverified，而文档仍称手机号只能来自微信授权。
6. 活动管理、Strava 豁免、完整历史指标、称号/照片识人和管理员配置尚未形成真实后端能力。

### 2.3 当前 UI 问题

- 全站主要依赖 `hero/card/row/grid/metric` 等少量全局样式，多数页面 WXSS 为空。
- 多个页面重复英文眉题、绿色渐变 Hero 和白卡片，缺少骑行活动专属视觉。
- 活动封面、名额进度、路线视觉、行程时间轴、骑手照片和指标门槛尚未进入核心页面。
- 审批 Tabs 无计数和选中态；部分交互使用普通 `view/text`，反馈和可访问性不足。
- 取消报名、Strava 解绑和审批缺少统一确认、防重复和忙碌状态。
- 次级文本颜色对小字号文本的对比度不足。

## 3. 范围

### 3.1 第一批必须交付

- OAuth 后自动完成可报名所需的 Strava 数据准备。
- 自动回到小程序；失败时提供真实原因、明确下一步和可重试能力。
- 活动详情提供九个 CTA 决策分支，覆盖查看、重报、历史与开放状态。
- 报名页按实名、Strava、活动选项三段门禁展示完成状态。
- 管理员看到可解释的识人信息、报名选项、指标、数据范围和缺失状态。
- 危险操作统一增加确认、防重复和完成反馈。
- 活动列表、详情、报名、Strava、审批关键页面完成业务化视觉重构。
- README、需求设计和 CloudBase 契约统一手机号与一期边界口径。
- 用真实客户旅程进行端到端验收，并保留云端审计证据。

### 3.2 第二批能力

- 活动创建、编辑、草稿、发布和结束。
- Strava 豁免申请、审批、授予、撤销和审计。
- 全历史/断点续传指标、4 周频率、比赛、俱乐部和车辆。
- 称号、头像、照片分类、预览、删除和孤儿文件清理。
- 管理员配置、分页、导出、通知和现场核销。

第二批能力不会在第一批 UI 中伪装为可用；入口要么隐藏，要么明确显示未开放。

### 3.3 不在本轮范围

- 在线支付。
- 多俱乐部 SaaS 化。
- 独立 Web 管理后台。
- 自动依据 Strava 指标拒绝报名。
- 用新框架替换原生小程序或用新后端替换 CloudBase。

## 4. 角色与关键任务

### 4.1 骑手

目标是在不了解 OAuth、同步和数据模型的前提下，确认活动是否适合自己并完成报名。

关键任务：

1. 快速看懂活动时间、路线、难度、名额、截止时间和费用。
2. 明确知道当前还缺哪一项报名资格，并能原地修复。
3. Strava 授权后自动达到可报名状态，不需要额外理解“同步”。
4. 随时查看审核状态、理由和凭证。
5. 取消或驳回后能理解后果并重新报名。

### 4.2 管理员

目标是用最少操作判断骑手是否适合活动，并留下可追溯审批证据。

关键任务：

1. 按活动和状态查看带计数的审批队列。
2. 识别骑手、查看活动选项、资料完整度和 Strava 指标。
3. 区分真实数值、缺失数据和数据覆盖范围。
4. 对照建议门槛做人工判断，不由系统自动拒绝。
5. 防止重复审批，并要求驳回理由由管理员明确输入。

### 4.3 活动组织者

第一批通过部署脚本和数据库准备活动，重点验证报名与审批真实闭环。第二批才在小程序内维护活动。

## 5. 方案选择

### 5.1 方案 A：真实旅程优先，渐进式重构

先修状态与契约，再重构关键页面，最后补完整一期能力。此方案变更边界最小、风险最低，而且每一阶段都可按真实旅程验收。

### 5.2 方案 B：UI 视觉优先

先重做全站视觉，再补业务断点。演示效果快，但可能继续出现“看起来完成、实际报不了名”，并造成返工。

### 5.3 方案 C：一次性补齐完整一期

同时实现活动 CRUD、豁免、完整指标、照片/称号和全站 UI。覆盖最完整，但改动横跨页面、数据、云函数、第三方 API 和权限，不适合当前阶段。

采用方案 A。方案 B 只能作为 A 中关键页面的并行视觉工作，方案 C 拆到第二批。

## 6. 目标架构

### 6.1 不变量

- 小程序云函数调用只信任 WXContext；客户端传入的 openid 和 role 一律不可信。HTTP OAuth callback 没有小程序 WXContext，只信任服务端 `oauth_states` 中经哈希命中、未过期、未消费并在事务内完成一次性消费的 state，由该记录取得 openid；callback 绝不接受 query 中的 openid 或 role 作为身份。
- 业务集合仍拒绝客户端直接读写。
- PII 和 token 仍使用现有 AES-256-GCM 格式；密钥缺失或密文认证失败继续 fail closed。
- OAuth state 继续哈希落库、过期拒绝、事务内一次性消费。
- 报名容量和状态迁移继续使用事务；UI 状态不能替代服务端校验。
- 日志、审计和客户端响应不得包含 PII 明文、token、OAuth code/state 或密文。
- 新组件库只能影响表现和交互，不得绕过 repository/service 层直接访问云函数或数据库。

### 6.2 Strava 可报名状态机

统一使用以下状态，替代单一 `connected` 布尔值：

| 状态 | 含义 | 用户动作 |
| --- | --- | --- |
| `disconnected` | 没有有效授权 | 绑定 Strava |
| `authorizing` | 已发起 OAuth，等待回调 | 完成授权或重新发起 |
| `syncing` | 已授权，系统自动准备快照 | 等待；超时后可重试 |
| `ready` | 有有效 snapshot，可以报名 | 继续报名 |
| `failed` | 授权存在但准备失败 | 查看安全错误原因并重试 |

`authorizing` 是派生状态：只有服务端存在当前用户未过期且未消费的 `oauth_states` 记录时成立；用户取消授权、state 过期或 state 已消费但 credential 未建立时回到 disconnected，不能长期悬挂。

服务端响应示意：

```ts
type StravaReadiness = {
  state: 'disconnected' | 'authorizing' | 'syncing' | 'ready' | 'failed';
  canRegister: boolean;
  snapshot: null | {
    totalKm: number | null;
    rides90d: number | null;
    longestKm: number | null;
    elevationM: number | null;
    speedKmh: number | null;
    latestActivityAt: string | null;
    syncedAt: string;
    coverage: { from: string; to: string; complete: boolean };
  };
  error: null | { code: string; message: string; retryable: boolean };
};
```

关键规则：

- `strava_credentials + strava_snapshots` 是 readiness 的唯一事实源。`profiles.strava.snapshot` 只保留为兼容展示缓存，不参与报名判定；第一批把 registration 事务改为读取 canonical credential 与 snapshot。
- `canRegister` 只有在 `state=ready` 且存在 24 小时内生成的有效 snapshot 时为 true。
- coverage 只表示最近 90 天窗口，不代表全历史。`coverage.complete=true` 表示该 90 天窗口内分页读取完整；若第 5 页仍满 200 条则为 false。
- 完整抓取成功且真实没有骑行时，相关次数和合计值允许为 0；API 未返回、解析缺失或分页不完整导致不可确定时必须返回 `null`，不能用 0 代替。
- `ensureReady` 先读取 canonical credential 与 snapshot：credential 有效且 snapshot 在 24 小时内时直接返回 ready，不写 lease。只有 pending、failed、超过 24 小时的 stale-ready，或 `sync_started_at` 已超过 2 分钟的过期 running 才能通过条件更新原子取得 running lease。取得 lease 的调用方在数据库事务外访问 Strava；并发调用只返回 syncing，不重复请求外部 API。
- 同步成功或失败的写回必须以 `sync_lease_id` 做 fencing：只有当前 lease owner 可以更新 `sync_status`、错误和 snapshot；lease 不匹配的旧 worker 丢弃结果且不写审计终态，避免超时接管后被旧结果覆盖。
- 小程序的 Strava 页 `onShow` 与报名页加载都会自动调用 `ensureReady`；syncing 状态每 1.5 秒轮询一次，最多 30 秒。30 秒未进入终态时停止轮询并显示可重试提示；下一次 `ensureReady` 可在 lease 过期后接管。用户不需要理解或点击“同步最近 90 天”。
- 回调页完成 token 持久化后将状态设为 pending，并自动返回小程序；回到 Strava 页后由 `onShow` 触发 `ensureReady`。自动返回失败时保留清晰按钮。
- 提交报名的服务端门禁直接验证 canonical credential、ready 状态和 snapshot，不相信前端 `canRegister` 或 profile 缓存。

### 6.3 数据兼容

优先在 `strava_credentials` 增加非敏感同步元数据：

```text
sync_status: pending|running|ready|failed
sync_error_code?: String
sync_started_at?: Date
sync_finished_at?: Date
sync_lease_id?: String
```

`strava_snapshots` 增加 `coverage_from/coverage_to/coverage_complete`。coverage 固定描述最近 90 天；旧数据没有字段时按“未知覆盖度”处理，不删除、不覆盖现有 token 或 snapshot。`profiles.strava.snapshot` 只作兼容展示缓存，迁移期可以继续写入，但任何报名资格判断均以 credentials + snapshots 为准。

第一批不新建大而全集合。部署采用向后兼容顺序：先让读取兼容旧字段，再写新字段，最后更新 UI。

### 6.4 活动 CTA

CTA 由活动状态、截止时间、容量和当前用户报名共同决定，优先级如下：

1. 当前报名为 pending 或 approved：显示“查看我的报名”。
2. 当前报名为 rejected 或 cancelled，且活动仍开放：显示“修改后重新报名”。
3. 当前报名为 rejected 或 cancelled，但活动已结束：显示“查看报名历史”，禁用报名。
4. 当前报名为 rejected 或 cancelled，但已到截止时间：显示“查看报名历史”，禁用报名。
5. 当前报名为 rejected 或 cancelled，但名额已满：显示“查看报名历史”，禁用报名。
6. 无报名记录且活动已结束：显示“活动已结束”，禁用。
7. 无报名记录且已到截止时间：显示“报名已截止”，禁用。
8. 无报名记录且 `pending + approved >= capacity`：显示“名额已满”，禁用。
9. 无报名记录且活动开放：显示“立即报名”。

前端提前解释状态，服务端仍重新计算并拒绝竞态条件下的无效提交。

## 7. 用户流程

### 7.1 Strava 授权与自动准备

```text
报名页识别 state=disconnected
  → 用户点击“绑定 Strava”
  → strava-auth.start 生成一次性 state 和授权 URL
  → web-view 完成 OAuth
  → strava-callback 校验 state、换 token、加密存储、标记 pending
  → 回调页尝试自动返回小程序，失败则显示返回按钮
  → Strava 页 onShow 调 ensureReady
  → ready：展示数据范围并自动回报名页
  → failed：展示真实但不泄密的原因、重试按钮和帮助说明
  → 报名页再次调 ensureReady 兜底
```

若 Strava API 暂时失败，已安全保存的授权不要求用户重复授权；仅当 token 刷新失败或授权失效时才要求重新授权。

Strava 首次请求 callback 时，URL 必然带 `code` 和 `state` query。callback 校验并一次性消费 state、加密保存 token 后，立即 303 到同源、无 query 的固定成功页；失败也跳转到只带非敏感错误枚举的固定失败页。应用日志、响应正文、重定向目标和最终可见 URL 不记录或保留 token、code、state 明文或 openid。

成功页只加载微信官方 `https://res.wx.qq.com/open/js/jweixin-1.6.0.js`，并为每次响应生成随机 CSP nonce。`script-src` 仅允许该官方来源和匹配 nonce 的本页脚本，继续禁止 `unsafe-inline`、`unsafe-eval`、通配脚本来源和第三方脚本。页面加载 800ms 后调用 `wx.miniProgram.navigateBack({ delta: 1 })`；“返回小程序”按钮执行同一动作。3 秒内无法调用 API 时保留页面和手动返回说明。

### 7.2 报名

报名页按三段门禁展示：

1. 实名与紧急联系：展示完整度、脱敏值、手机号来源和修复入口。第一批允许手填手机号完成报名，但必须标记“手填未验证”；微信授权手机号标记“微信已验证”。
2. Strava：展示 readiness、数据范围、失败原因和修复入口。
3. 活动选项：用车方式、结构化租车需求、经验、饮食和备注。

提交按钮只有三段都满足时可用。禁用态必须说明缺失项。提交后锁定按钮，直到请求结束，防止重复点击。

### 7.3 审批

管理员选择活动后看到带计数的 Tabs。列表优先展示 pending，并标记照片缺失、Strava 数据缺失或覆盖度不足。

详情按以下顺序展示：

1. 骑手识人信息：第一批只读返回 nickname、已有 title、avatar 和已有 photos；不包含照片编辑、分类或删除。
2. 活动报名选项和备注。
3. 实名脱敏信息与资料完整度。
4. Strava 实际指标、建议门槛、覆盖度和同步时间。
5. 审批历史。
6. 通过/驳回操作。

驳回理由初始为空，必须由管理员输入。通过和驳回都先确认，并在请求中禁用按钮。

识人文件不通过公开永久 URL 暴露。`admin-review` 完成管理员校验后读取 profile 白名单字段，并由服务端将允许的 CloudBase file ID 换成短期临时 URL 返回；客户端不持久化临时 URL，失败时显示缺图占位。第一批不改变上传能力和云存储规则。

### 7.4 凭证、取消与重报

- approved 展示凭证编号、活动、姓名、集合信息和审批时间。
- pending/rejected/cancelled 展示清晰状态和下一步，不把凭证框架伪装成已通过。
- 取消前说明会释放名额，并要求确认。
- rejected 或 cancelled 重新提交沿用现有确定性记录和历史，不清空审计轨迹。

## 8. UI 设计系统

### 8.1 视觉语言

主题是“公路骑行路书”：户外照片与路线数据是主角，界面像一张简洁、可信、可快速扫读的行程卡，而不是通用后台。

### 8.2 颜色 token

| Token | 色值 | 用途 |
| --- | --- | --- |
| `--color-primary` | `#0B5D45` | 主按钮、选中态、品牌 |
| `--color-primary-pressed` | `#084735` | 主按钮按压 |
| `--color-accent` | `#F05A36` | 里程高亮、进度、关键提示 |
| `--color-strava` | `#FC4C02` | 仅 Strava 品牌与连接状态 |
| `--color-bg` | `#F4F1E8` | 页面暖纸背景 |
| `--color-surface` | `#FFFFFF` | 表单和主要内容面 |
| `--color-text` | `#17211D` | 正文 |
| `--color-muted` | `#56655E` | 次级文字，满足普通文本对比度 |
| `--color-success` | `#18794E` | 成功、ready、approved |
| `--color-warning` | `#A15C00` | syncing、名额紧张 |
| `--color-danger` | `#B42318` | failed、rejected、危险操作 |
| `--color-border` | `#D8DDD7` | 边框和分隔线 |

状态不能只靠颜色表达，必须同时有文字或图标。

### 8.3 排版与空间

- 页面左右留白 28rpx；内容组间距 32rpx；小项间距 12/16rpx。
- 圆角收敛为 12、16、24rpx 三档；只有封面和关键浮层使用 24rpx。
- 标题层级为 44/34/28/24rpx；正文最低 26rpx，辅助文字最低 24rpx。
- 可点击区域最小 88rpx × 88rpx。
- 卡片不默认加阴影；用背景层次和 1rpx 边框区分。固定 CTA 才使用轻阴影。
- 动画只用于加载、步骤完成和状态切换；尊重 reduced motion 能力时关闭非必要动画。

### 8.4 组件策略

采用 [TDesign Miniprogram](https://github.com/Tencent/tdesign-miniprogram)（MIT），按页面引入 `Tabs`、`Steps`、`Dialog`、`Form`、`Tag`、`Empty` 和 `ImageViewer`。不与 WeUI 混搭。

自建领域组件：

- `activity-cover-card`：封面、状态、日期、路线和名额。
- `route-metrics`：里程、爬升、难度和覆盖度。
- `schedule-timeline`：集合、出发、补给、返程。
- `capacity-progress`：占用、剩余和状态说明。
- `registration-gate`：一项报名条件的状态、原因和修复动作。
- `strava-readiness`：授权、准备、成功、失败状态。
- `rider-summary`：昵称、称号、头像和照片。
- `review-metrics`：实际指标、建议门槛、覆盖范围和缺失值。

`app.wxss` 只保留 token、基础排版和通用交互状态；页面结构下沉到页面 WXSS 或领域组件。

## 9. 页面设计

### 9.1 活动列表

- 移除通用渐变 Hero，首屏直接展示近期活动。
- 卡片顶部使用真实活动封面；无封面时使用品牌化路线纹理占位，不使用随机网络图。
- 封面叠加日期和活动状态；正文展示起终点、距离、爬升和难度。
- 底部展示名额进度和截止信息。
- 已结束活动移到次级分组，不与报名中活动竞争视觉焦点。

### 9.2 活动详情

顺序固定为：

1. 封面、标题、状态。
2. 影响报名决策的摘要：日期、距离、爬升、难度、剩余名额和截止时间。
3. 时间轴。
4. 路线说明；第一批可用静态路线摘要，第二批再加入 GPX 地图。
5. 装备、注意事项和费用。
6. 固定状态化 CTA。

### 9.3 报名页

- 顶部显示活动摘要，不再重复大 Hero。
- 三个 `registration-gate` 依次展示实名、Strava 和活动选项。
- 每项使用“已完成/待处理/处理中/失败”文字状态。
- 选择租车后出现独立的数量与车型备注，饮食和其他备注分离。
- 底部显示隐私用途说明和提交按钮。

### 9.4 Strava 页

- 主信息是“是否已具备报名资格”，不是连接技术状态。
- ready 展示最近 90 天指标、覆盖范围和同步时间。
- syncing 显示自动准备中的进度文案，不提供多余手动同步主按钮。
- failed 显示分类后的安全错误和重试；token 无效才显示重新授权。
- 解绑进入危险操作确认流程。

### 9.5 我的与资料编辑

- 我的页展示骑手身份、资料完整度、Strava readiness 和报名历史入口。
- 手机号明确标识“微信已验证”或“手填未验证”。第一批两者都满足报名门禁；管理员审批详情必须展示来源，未来若升级为强验证策略需另行迁移，不能静默拒绝既有用户。
- 第一批保留现有照片上传契约，但不宣传为完整相册管理；第二批再补分类、预览、删除和清理。
- 管理员入口保留在“我的”，避免干扰普通骑手。

### 9.6 审批列表与详情

- Tabs 展示计数和选中态；列表显示骑手、活动选项、readiness 和异常标识。
- 详情使用 `rider-summary` 与 `review-metrics`，缺失字段展示“未获取”。
- 建议门槛与实际值并列，但明确写“仅供人工判断”。
- 固定审批栏中，驳回为次级危险操作，通过为主操作；二者均确认并防重复。

## 10. 错误处理与可观测性

### 10.1 用户可见错误

错误按可恢复性映射为稳定文案：

- 网络或 Strava 临时失败：保留授权，允许重试准备数据。
- token 失效：要求重新授权。
- 资料不完整：直接跳转到缺失字段。
- 活动已满/截止/结束：解释状态，不建议重复提交。
- 权限不足：返回上一安全页面，不展示内部角色或 openid。

用户文案不得直接展示内部异常堆栈、HTTP 状态或密钥配置细节。

### 10.2 审计与指标

保留并扩展非敏感审计动作：

- `strava.sync.started/succeeded/failed`
- `registration.submitted/cancelled/resubmitted`
- `registration.approved/rejected`

审计 detail 仅记录状态、目标 ID、安全错误码、覆盖范围和耗时，不记录 PII、token 或授权 code。

`registration.submitted/cancelled/resubmitted` 必须与报名记录写入及 `occupied_count` 变更处于同一数据库事务，由 transaction store 的 `addAudit` 能力写入；事务失败时三者全部回滚。审批审计继续与审批状态迁移处于同一事务。

每次真实旅程验收生成证据包：registration 状态历史、活动 `occupied_count` 变更前后值、对应 audit action/target/timestamp，以及对审计和日志无 PII/token 的抽查结果。证据包只保存脱敏数据和测试标识。

建议监控：

- OAuth 回调成功率。
- OAuth 成功到 ready 的成功率与 P95 耗时。
- 报名提交成功率及失败原因分布。
- pending 到审批完成耗时。
- 重复提交拦截次数。

## 11. 修改项与影响面

| 区域 | 计划修改 | 影响 |
| --- | --- | --- |
| `docs/requirements-design.md` | 同步第一/第二批边界、手机号来源、Strava readiness | 产品与验收口径 |
| `docs/cloudbase-schema.md` | 增加同步状态、覆盖度和 nullable 指标语义 | 数据契约 |
| `README.md` | 更新当前能力、部署和真实旅程验证 | 运维与交接 |
| `miniprogram/models` | 增加 readiness、CTA、coverage、nullable 指标 | 前端类型 |
| `miniprogram/repositories/cloud.ts` | 映射新契约，禁止缺失值转 0 | 所有调用页面 |
| `miniprogram/services` | 编排 ensureReady、CTA 和报名门禁 | 页面状态 |
| `miniprogram/pages` | 重构关键页面信息架构与交互 | 用户体验 |
| `miniprogram/components` | 新增领域组件，按需引入 TDesign | 包体积与一致性 |
| `package.json` / lockfile / 构建配置 | 安装 TDesign 并加入小程序 npm 构建与包体积检查 | 依赖与构建 |
| 各关键页面 `index.json` | 仅声明本页实际使用的 `usingComponents` | 分包与运行时 |
| `miniprogram/app.wxss` | 收敛为 token 与基础样式 | 全站视觉 |
| `strava-auth/callback/shared` | readiness、幂等自动准备、回跳和安全错误 | OAuth 主链路 |
| `activity-read` | 返回 CTA 所需字段 | 活动展示 |
| `registration` transaction store / `addAudit` | 读取 canonical readiness；同事务写报名、名额和审计 | 报名安全与证据 |
| `admin-review` | 返回缺失语义、覆盖度和所需识人字段；服务端换取短期文件 URL | 审批判断与文件访问 |
| tests | 状态机、DTO、页面服务、旅程回归 | 发布门禁 |

不修改：数据库客户端权限、密钥格式、小程序 WXContext 身份来源、callback 的服务端 state 身份链、事务化名额逻辑和审计脱敏原则。

## 12. 交付顺序

### 阶段 0：口径冻结

- 更新三份文档，使手机号、一期范围和 Strava 状态一致；第一批明确允许 manual/unverified 手机号报名，并在管理员端展示来源。
- 将现状标记为“安全底座 + 最小闭环”。

### 阶段 1：P0 真实旅程

- readiness DTO 与向后兼容读取。
- OAuth 回调后自动准备与自动回跳。
- 报名页自动 ensureReady。
- 失败恢复、幂等、防重复和审计。
- 真实 OAuth → 报名 → 审批 → 凭证 → 取消/重报验收。

### 阶段 2：P1 决策信息与关键 UI

- 九个 CTA 决策分支，覆盖已有报名、可重报、关闭后的历史查看和无记录状态。
- 活动列表/详情与报名门禁。
- 审批指标缺失语义、覆盖度和识人信息。
- TDesign 按需引入与领域组件。
- 取消、解绑和审批确认。

### 阶段 3：第二批一期能力

- 活动 CRUD。
- Strava 豁免。
- 完整指标与断点续传。
- 相册、称号、管理员配置和分页。

每一阶段独立通过测试和真实旅程验证后才进入下一阶段。

## 13. 测试与验收

### 13.1 自动化测试

- readiness 状态迁移和非法迁移。
- `ensureReady` 幂等、2 分钟 lease、并发去重、超时接管、1.5 秒轮询和 30 秒 UI 超时。
- OAuth state 过期、重放和 callback 错误。
- nullable 指标保持 null，不被映射为 0。
- 九个 CTA 决策分支的时间、容量、报名状态和重报组合。
- 报名容量并发、取消释放、驳回/取消后重报。
- 审批按钮防重复和驳回理由必填。
- DTO 只返回白名单字段，日志和审计不含敏感数据。
- UI 状态组件覆盖 loading/empty/error/ready/disabled。

### 13.2 真实客户旅程硬门

1. 新用户完成 OAuth 后无需理解“同步”，回报名页时必须自动达到可提交状态。
2. 同步失败时显示真实业务原因和明确下一步；不能只显示 HTTP 失败或通用异常。
3. 活动 CTA 覆盖 pending/approved 查看、rejected/cancelled 开放时重报、关闭时查看历史，以及无记录时的报名中、已满、已截止、已结束全部分支。
4. 管理员审批详情至少包含 nickname、已有 title、avatar/photos 临时访问、报名选项、手机号来源、可解释指标和最近 90 天覆盖度。
5. 缺失数据必须显示“未获取”，不能用 0 冒充。
6. 需求稿、CloudBase 契约和 README 对手机号来源及验收规则完全一致。
7. UI 只使用一套组件库按需引入，不改变 wx.cloud、安全、加密和事务边界。
8. 完整跑通授权 → 自动准备 → 报名 → 审批 → 凭证 → 取消/重报，并输出证据包：registration 状态历史、occupied_count 前后值、audit action/target/timestamp，以及日志与审计无 PII/token 的抽查结果。
9. UI 清理或外部服务失败被记录，但不会阻塞其他独立用例继续执行。
10. 发布前 `npm run validate` 与高风险旅程回归全部通过。

### 13.3 视觉验收

- 关键页面不再依赖相同的渐变 Hero + 白卡片骨架。
- 活动列表首屏可以在 5 秒内识别时间、路线难度、名额和报名状态。
- 所有普通文字满足 WCAG AA 对比度，交互区域至少 88rpx。
- 状态不只靠颜色表达；长昵称、长地点、缺图和大字号下不溢出。
- iPhone 刘海和底部安全区、常见 Android 尺寸均可操作。

## 14. 发布与回滚

- 新字段向后兼容，先部署读兼容，再部署写入和 UI。
- readiness 可通过服务端开关逐步启用；若自动准备异常，回滚 UI 仍能显示现有连接状态，但报名服务端门禁不放宽。
- TDesign 按页面引入，监控主包体积；超过微信限制时改为分包，不移除业务门禁。
- 任何回滚都不能降低数据库权限、关闭加密、跳过 OAuth state 校验或绕过容量事务。

## 15. 参考项目采用边界

| 来源 | 采用 | 不采用 |
| --- | --- | --- |
| 本机 `strava_photobook` | Strava 指标组织、路线视觉、照片叙事、黑白橙编辑感 | Python/Web 运行时和本地 token 模式 |
| 本机 `order-demo` | 安全区、触控尺寸、主题 token | 餐饮业务和 React/Tailwind 架构 |
| 本机 `bikepower-c` / `esp32-power` | 骑行数据术语 | 固件架构和小程序 UI |
| TDesign Miniprogram | MIT 组件与交互模式 | 替换领域组件和后端 |
| WeUI Miniprogram | 仅作微信原生感备选 | 与 TDesign 混搭 |
| `weixin_YiQi` / `PowerActivity` | 活动信息与报名流程观察 | 无明确许可的代码复制 |
| `PopRun` | MIT 运动类信息组织 | Laravel 后端和完整社交功能 |
| CloudBase examples | 部署、函数调用和网关样例 | 替换现有权限、加密、事务与数据模型 |

## 16. 完成定义

本设计进入实施计划的条件：

- 负责人确认本文的第一/第二批边界。
- 负责人确认 TDesign 单库策略与路书视觉方向。
- 负责人确认 readiness 状态机和真实旅程硬门。
- 文档中无未定项、占位内容、互相矛盾或需要实现者自行猜测的关键决策。

第一批功能完成的条件是第 13.2 节全部通过，而不是页面数量、Action 调用次数或演示截图数量。
