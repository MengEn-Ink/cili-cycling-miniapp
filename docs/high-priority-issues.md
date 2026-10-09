# 高优问题清单

> 最后更新：2026-10-10 01:20（CST）
>
> 维护原则：这里只保留尚未满足关闭条件的问题。新问题先去重、澄清、拆分；已满足关闭条件的条目直接删除，Git 历史和不可变外部证据作为归档。

## 开工与证据规则

1. 每个 Agent 开工前先读本文件，优先处理未阻塞的 P0，再处理 P1；除非用户明确调整顺序。
2. `用户报告`、`代码已合入`、`CI 通过`、`已部署`、`真实验收`是五层独立证据，后层不得由前层推断。
3. `READY` 表示可立即处理；`IN_PROGRESS` 表示已有唯一写者；`BLOCKED_BY(...)` 只等待括号内的实现门禁；`DEPLOY_PENDING` 表示代码门禁已通过但目标环境部署缺失；`PENDING_EVIDENCE` 表示缺少运行态回读或真实验收。
4. 代码项只有在合入目标分支、所需 CI 通过、部署到目标环境、真实 smoke/readback 通过，并满足条目要求的独立复核后才可删除。
5. 同一文件族只允许一个写者；不同处理泳道可并行。状态、负责人、证据、下一步或关闭条件变化时，必须在同一轮同步本文件。

## 当前共同证据

- 用户报告：2026-10-09 群聊新增 6 组问题，已拆成 HP-06 至 HP-13 共 8 个原子项。
- 代码合入：PR [#48](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/48) 已合并，merge SHA `d0f866f02e5ac5d86591132a55ed72cecc98f368`；这只证明其中已有实现进入 main。
- CI：PR #48 `validate` SUCCESS；main 对应 CI 亦为 SUCCESS。CI 不能证明 CloudBase Active 版本或真机行为。
- 微信开发版：Actions run [37951023361](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/37951023361) 已成功上传 `0.0.27.1`，head `d0f866f...`。
- CloudBase 部署：Aime 个人助理已在群内报告 `registration`、`profile`、`strava-auth`、`strava-callback` 为 Active，但尚未提供目标环境、各函数版本/更新时间、只读回读 requestId 与 `d0f866f...` 的不可变映射；在证据补齐前统一记为 `PENDING_EVIDENCE`。
- 真实验收：新增 8 项均未取得与同一不可变 SHA 对应的完整真机/真实数据 smoke，不得标记完成。

## 当前处理顺序

| 泳道 | ID | 优先级 | 状态 | 目标 | 唯一写者 | 复核/发布 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `HP-20261009-01` | P0 | `IN_PROGRESS` | 首页时间线兼容生产 BSON Date | TraeX 执行者 | TraeX 审判者 |
| A2 | `HP-20261009-02` | P1 | `IN_PROGRESS` | `_id` 使用 Mongo binary 顺序 | TraeX 执行者 | TraeX 审判者 |
| A3 | `HP-20261009-03` | P0 发布门禁 | `IN_PROGRESS` | 真实 Date planner/smoke 重新取证 | TraeX 执行者 | TraeX 审判者 |
| A4 | `HP-20261009-05` | P1 | `IN_PROGRESS` | 首页时间线客户端与发布链路 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| B | `HP-20261009-13` | P0 | `READY` | Strava 授权撤销与异常生命周期 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| C | `HP-20261009-04` | P1 | `READY` | PR #45 管理列表分页交付 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| D | `HP-20261009-06` | P1 | `READY` | 浅色主题全页对比度 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| E | `HP-20261009-07` | P1 | `READY` | 我的行程永久保留历史/下架活动 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| F1 | `HP-20261009-08` | P1 | `READY` | 创建活动时间快捷选择 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| F2 | `HP-20261009-09` | P1 | `BLOCKED_BY(HP-20261009-08 code commit)` | 创建活动地点快捷选择与权限恢复 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| G1 | `HP-20261009-10` | P1 | `READY` | 单背景图与预览的数据安全闭环 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| G2 | `HP-20261009-11` | P1 | `BLOCKED_BY(HP-20261009-10 code commit)` | 个人中心头像预览 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| H | `HP-20261009-12` | P1 | `READY` | Strava 年限正确性、回填与部署 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。例如 HP-01/02 focused GREEN 且 HP-03 planner/smoke PASS 后即可启动 HP-05；HP-01/02/03 仍保留到合入、部署和真实页面 smoke 齐全，避免形成部署依赖死锁。

## 事项明细

### HP-20261009-01 · 首页时间线不兼容生产 BSON Date

- 优先级/状态：P0 / `IN_PROGRESS`，代码与 planner 已通过独立复核，等待集成 PR/CI/部署链路。
- 当前事实：最新 main 基线上的集成分支已包含 RED `2e4c7d7` 与 GREEN `02a2fea`；where/keyset 使用 BSON Date、内部统一 epoch 比较，仅 cursor/DTO 边界转 ISO。
- 证据/阻断：focused、`activity-read` 全回归、cloud package 和 production BSON Date planner 已通过；当前仍未形成经 CI 的合并提交，也未部署或完成真实页面 smoke。
- 下一步：随 HP-05 集成 head 完成完整 validate、独立复核与 Draft PR；合入后由 Aime 部署同一不可变 SHA 并执行页面 smoke。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：Date RED 转绿、focused 回归与 package verifier 通过，可进入 HP-02/03；不要求本条先最终关闭。
- 关闭条件：修复合入 main；HP-03 的 BSON Date planner/smoke 通过；目标环境部署；真实首页分页 smoke 通过；独立复核无 P0/P1。
- 更新时间：2026-10-10。

### HP-20261009-02 · `_id` 归并顺序与 Mongo binary collation 不一致

- 优先级/状态：P1 / `IN_PROGRESS`，代码 GREEN 已独立复核，等待集成 PR/CI/部署链路。
- 当前事实：集成分支已包含混合 `-/_/大小写`、同时间戳、`page_size=1` 的 RED `963f1e4` 与 GREEN `49b4062`；归并使用 UTF-8 `Buffer.compare`，不再使用 `localeCompare`。
- 证据/阻断：focused 26/26、`activity-read` 44/44、cloud package 与 planner smoke 已通过；尚未合入 main、部署或取得部署后跨页页面证据。
- 下一步：随 HP-05 完成完整 validate、独立复核与 Draft PR；部署后验证同时间戳混合 ID 无漏无重。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：focused GREEN 后可与 HP-01 一起进入 HP-03；不要求本条先最终关闭。
- 关闭条件：确定性 RED 转绿；合入 main；真实 Date smoke 同时证明跨页顺序、唯一性和无遗漏；部署与页面 smoke 通过。
- 更新时间：2026-10-10。

### HP-20261009-03 · production BSON Date planner 发布门禁

- 优先级/状态：P0 发布门禁 / `IN_PROGRESS`，production BSON Date 证据门禁已 PASS，等待合入、部署和部署后验收。
- 当前事实：第五轮用 108 条 strict canonical EJSON BSON Date fixture 完成类型回读、12/12 explain 与四流 smoke；报告收口提交 `ef70d50` 已在最新 main 基线的集成分支中。
- 证据/阻断：独立复核确认 future/history 各 50 条按 `[20,20,10]` 无漏无重、legacy 可见、无效数据排除；临时集合三次只读回查 remaining=0，最后 requestId `3c96cd25-ca7e-4a25-b682-89bf9f0eefaf`。证据尚未随 PR 合入，且不代表目标环境部署或真实页面通过。
- 下一步：随 HP-05 完成不可变集成 SHA、CI 和合并；部署同 SHA 后执行真实页面 smoke/readback。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：以下 planner/smoke 证据 PASS 后即可启动 HP-05，条目继续保留等待最终部署证据。
- 关闭条件：插入后回读并断言 `event_start/event_end` 为 BSON Date；查询 where/keyset 边界回读确认使用 Date；12/12 explain 无阻塞 SORT 且命中预期索引；108 条 smoke 的分页、顺序、唯一性、legacy/delete/非法数据结果正确；临时集合 remaining=0；相关代码合入、部署和独立复核完成。
- 更新时间：2026-10-10。

### HP-20261009-04 · PR #45 活动管理分页尚未交付

- 优先级/状态：P1 / `READY`，可在独立 worktree 并行。
- 当前事实：[PR #45](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/45) OPEN、非 Draft、`CONFLICTING/DIRTY`，head `60f035df1ff630567f944328a641ba023466b83b`；旧 `validate` SUCCESS，但 0 review、未合并、未部署。
- 证据/阻断：101+ 管理列表分页尚未进入 main；旧 CI 不能证明与当前 main 兼容或真实页面通过。
- 下一步：从最新 main 处理冲突且保留原测试门禁；独立审查后重跑 CI，再部署测试环境并做管理页 smoke。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；发布：Aime 个人助理。
- 关闭条件：不可变 PR SHA 复核通过；CI SUCCESS；合入 main；测试环境部署成功；101+、同时间戳、过滤、刷新/加载更多竞态真实 smoke 通过。
- 更新时间：2026-10-09。

### HP-20261009-05 · 首页未来/历史时间线剩余客户端与发布链路

- 优先级/状态：P1 / `IN_PROGRESS`，唯一写者正在最新 main 基线的独立 worktree 收口。
- 当前事实：分支已提交严格 repository envelope/兼容旧 `listActivities(filter?)`（`695d12a`）、双视图 revision/single-flight 状态机（`7b16bce`）与 future/history UI/加载更多（`9e8fbf2`）；现有 main 的 26 个索引已包含 planner 证明的两个复合索引，无重复索引变更。
- 证据/阻断：repository 144/144、页面/刷新/主题 42/42 与 typecheck 已通过；产品/schema/release notes 已在同轮同步。尚缺完整 `npm run validate`、不可变独立复核、Draft PR 原始 CI、合并、部署和真实页面 smoke。
- 下一步：完成文档和清单同步，跑完整 validate，冻结精确 SHA 交审判者复核；复核通过后创建 Draft PR，禁止直接部署旧 tip。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；发布：Aime 个人助理。
- 关闭条件：合入 main；目标环境部署；真实页面默认未来、历史切换、分页、同筛选重试及切换/迟到响应竞态全部通过；独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261009-06 · 浅色主题全页对比度

- 优先级/状态：P1 / `READY`，与后端泳道并行。
- 用户报告：个人中心“编辑资料”在浅色主题出现白字难以辨认，并要求核对其他页面。
- 代码/CI：双主题与个人中心专项修复已进入 main；PR #48 与开发版 `0.0.27.1` 已成功，但只证明代码和上传。
- 确认缺口：生产基线仍有明确低对比候选，例如活动编辑错误色 `#ff8b85` 对白底约 2.26:1，活动详情多个标签低于 4.5:1；现有测试只覆盖局部选择器，没有 14 页真实渲染证据。
- 下一步：建立普通文字 ≥4.5:1、大字/控件 ≥3:1 的页面清单；修复确认色值；为允许固定白字的摄影 Hero 建立最小 allowlist 与静态门禁。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：14 页及共享可见组件在常规宽度和 320px 浅色主题通过；个人中心有图/无图、资料编辑错误/禁用/失败态通过；深色回归、CI、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-07 · 我的行程保留全部历史、已完成和下架活动

- 优先级/状态：P1 / `READY`，报名/行程文件族独立处理。
- 用户报告：历史已完成或下架活动不能从用户行程消失，也不能变成异常。
- 代码/CI：PR #48 已让 `registration/mine` 返回 owner-bound 活动投影和快照降级，focused 既有测试可通过；Aime 已报告 `registration` Active，但版本映射、只读回读与真实 smoke 证据尚未补齐。
- 确认缺口：`registration/mine` 固定 `.limit(50)` 且无分页；页面用 `Promise.all(listRegistrations,listActivities)`，无必要的公开活动读取失败会拖垮整页；真实 `draft` 下架、软删/物理缺失服务端降级未被直接测试。
- 下一步：先锁 101 条分页、公开列表失败不影响行程、`published/finished/draft/is_deleted/物理缺失` 的 RED；明确下架标签和缺失活动取消报名合同后最小 GREEN。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：全部报名可分页且无漏重；历史/下架/软删/缺失活动可解释展示；公开活动接口失败不影响行程；`registration` 部署回读、50+ 真实数据 smoke、CI 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-08 · 创建活动时间快捷选择

- 优先级/状态：P1 / `READY`，活动编辑文件族唯一写者先处理本项。
- 用户报告：创建活动的时间需要控件和快捷选择。
- 代码/CI：PR #48 已加入日期/时间 picker 与“明早 07:00、下周六 08:00、开始后 4 小时、开始前 1 天 20:00”等快捷项；开发版 `0.0.27.1` 已上传。
- 确认缺口：开始时间为空/非法时，两个相对快捷项静默无动作；缺少跨月、跨年、周六边界、时区和真机 picker 证据。
- 下一步：补相对快捷项前置条件 RED，改为明确禁用或提示；补边界测试并在创建/编辑两种模式真实保存回读。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：三个时间字段可精细和快捷选择；无静默操作；跨月/年/时区无漂移；创建与编辑保存重开正确；CI、开发版 smoke 和独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-09 · 创建活动地点快捷选择与权限恢复

- 优先级/状态：P1 / `BLOCKED_BY(HP-20261009-08 code commit)`，避免并发修改活动编辑文件族。
- 用户报告：地点快捷选择应位于输入框右侧。
- 代码/CI：PR #48 已把起终点“地图选点”放到输入框右侧，并保留坐标回填、手改文字清坐标与服务端范围校验；开发版已上传。
- 确认缺口：没有 `wx.authorize/getSetting/openSetting` 的拒绝恢复链；后台隐私声明无法从仓库证明；取消、永久拒绝、系统定位关闭和保存中竞态未覆盖。
- 下一步：设计并测试首次同意、拒绝后恢复、系统定位关闭、取消和保存中的状态机；核对微信后台隐私指引。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；隐私配置/真机：Aime 个人助理。
- 关闭条件：创建/编辑均可从右侧选点并持久化坐标；拒绝后有可操作恢复路径；手改文本不提交旧坐标；活动详情真实导航成功；CI、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-10 · 单背景图与预览的数据安全闭环

- 优先级/状态：P1 / `READY`，个人资料媒体文件族唯一写者先处理本项。
- 用户报告：个人只允许一张背景图片，并需要背景预览。
- 代码/CI：PR #48 已把选择数量设为 1、只取 `photos[0]`、服务端拒绝多图，并在编辑页/个人中心加入背景预览；Aime 已报告 `profile` Active，但版本映射、只读回读与真实 smoke 证据尚未补齐。
- 确认缺口：schema/模型仍把 `photos` 定义为无上限数组；存量多图账号打开并保存会静默丢弃其余引用，且与管理员审核最多三张个人媒体的既有语义冲突。
- 下一步：采用不丢历史资料的单背景槽位或明确迁移方案，补存量多图 RED、schema 合同和清理回读；不得以静默截断关闭。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：新用户只能添加/替换一张背景；编辑页与个人中心可预览；两张输入被拒；存量多图无未经确认的数据丢失；`profile` 部署、真机 smoke、CI 与复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-11 · 个人中心头像预览不可用

- 优先级/状态：P1 / `BLOCKED_BY(HP-20261009-10 code commit)`，避免并发修改 profile 文件族。
- 用户报告：头像预览不可用。
- 代码/CI：编辑资料页已有 `previewAvatar` 和 HTTPS URL 等待；PR #48 已合入。个人中心首页头像只有 `binderror`，没有 `bindtap` 或预览处理器，升级日志“头像和背景图均可点击预览”大于实现事实。
- 证据/阻断：现有首页测试只断言 aria-label，因此在头像完全不可点击时仍可通过；开发版上传不等于场景验收。
- 下一步：先补首页头像点击 RED；实现合法 HTTPS 单图预览，无头像/非法 URL/加载失败时 fail closed；保留编辑页回归。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：个人中心和编辑页均可预览头像；异常输入不调用预览且不崩溃；测试、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-12 · Strava 年限正确性、存量回填与部署

- 优先级/状态：P1 / `READY`；客户端周年算法可与 HP-13 后端设计并行，三个云函数部署须等待 HP-13 P0 修复。
- 用户报告：根据 Strava 获取骑行年限的功能为何未上线，代码是否合并。
- 代码/CI：账号年限取自 Strava athlete `created_at`，已进入 main 并通过 CI；开发版 `0.0.27.1` 已上传。它表示 Strava 账号年龄，不是完整现实骑龄。
- 确认缺口：`2020-02-29 -> 2021-02-28` 当前返回 0 年，违反设计期望 1 年；Aime 已报告三个相关函数 Active，但未给出与代码 SHA 的版本映射；存量快照可能缺 `athlete_created_at`，无真实同步回读。
- 下一步：补周年前/当天/后与闰日 RED，修正算法；定义存量账号自动回填或一次性重新授权策略；在 HP-13 修复后部署同一 SHA 的三个函数。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：周年与闰日测试通过；main 合入且 CI 绿；三个函数 Active 版本可回读；真实账号同步后回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`；新旧账号真机显示正确且无需反复授权。
- 更新时间：2026-10-09。

### HP-20261009-13 · 设置页 Strava 授权撤销与异常生命周期

- 优先级/状态：P0 / `READY`，Strava 后端/设置页发布门禁。
- 用户报告：设置中应统一管理重新授权、解绑与授权异常处理。
- 代码/CI：PR #48 已加入设置页状态卡和入口；既有服务端支持 start/status/sync/disconnect，CI 通过；Aime 已报告相关函数 Active，但不可变版本映射与真实授权 smoke 尚未提供。
- 确认缺口：解绑不会作废在途 `oauth_states`，旧 callback 可在“解绑成功”后重新创建凭证；用户拒绝授权时 state 不消费并可卡 `authorizing`；failed 状态没有按 scope/token/config/network 分类恢复；当前解绑只删本地 token，未明确是否调用 Strava deauthorize。
- 下一步：先锁 disconnect×callback、多 state 乱序、`access_denied`、failed recovery 的 RED；设计 attempt generation/fencing、稳定错误与 recovery action；明确本地断开或外部撤销语义。
- 负责人：TraeX 执行者；安全/独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：解绑后所有旧 callback 被拒绝且凭证不复活；拒绝授权消费 state 并停止轮询；retry/reauthorize/disconnect/contact-support 由稳定服务端语义驱动；解绑数据保留合同明确；`strava-auth/callback` 部署回读；授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实 smoke 通过。
- 更新时间：2026-10-09。

## 并行边界

- 泳道 A（HP-01/02/03/05）共享首页时间线文件，按实现门禁串行；HP-03 PASS 后即可继续 HP-05，不等待部署最终关闭。
- 泳道 B（HP-13）先处理授权安全；HP-12 的客户端周年算法可并行，但 Strava/Profile 云函数统一部署必须在 HP-13 代码复核后。
- 泳道 C（HP-04）、D（HP-06）、E（HP-07）文件边界独立，可并行。
- 泳道 F（HP-08→09）共享活动编辑页，单写者串行；泳道 G（HP-10→11）共享个人资料页，单写者串行。
- Aime 个人助理只在不可变 SHA 通过独立复核后执行目标环境部署和真实 smoke；部署证据不得替代代码复核，开发版上传不得替代 CloudBase 部署。
