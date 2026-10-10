# 高优问题清单

> 最后更新：2026-10-10（CST）
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
- 代码合入：PR [#45](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/45)、[#48](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/48)、[#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52)、[#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53)、[#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56)、[#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57)、[#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 已合并；最后一次含产品/云函数变更的 main 基线为 `d3e84e6bd1104548bbe35a05b8496a277f9086c5`（#59 纯前端 Strava 闰日周年校准），中间的纯文档清单提交不改变产品代码基线。
- CI：上述 PR 及产品基线 `d3e84e6...` 对应 CI 均为 SUCCESS；最新 main CI run [38018305836](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018305836) SUCCESS。CI 不能证明 CloudBase Active 版本或真机行为。
- 微信开发版：Actions run [38018365813](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018365813) 已成功上传 `0.0.39.1`，head `d3e84e6...`，日志包含“微信开发版 0.0.39.1 上传成功”；其中浅色主题对比度（HP-06）首次随 run [38014100157](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014100157) 上传的 `0.0.36.1`（head `a275fc3...`）交付，活动时间快捷项（HP-08）首次随 run [38017106152](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017106152) 上传的 `0.0.37.1`（head `92f5c0b...`）交付。
- CloudBase 部署：已通过本地已登录环境在 `cloudbase-d0gizacy77a1ab017` 应用并 verify 13 个集合、31 条索引；创建 `oauth_attempts` 和首页/媒体/管理分页共 5 条索引，apply requestId 分别为 `70af1f69-803e-4e65-8816-8aaf04120cc5`、`910a7036-7da5-4210-bbb5-48562d84302d`、`6028903a-c63d-4c1b-bd59-a1db4656719d`、`b6331a33-f8be-479e-9247-615a9071f3e2`、`bd79dafe-6b74-4da4-af09-af5a75196bdd`、`104e8934-617e-497e-bd12-0f302680e35c`；`activity-read`、`strava-auth`、`strava-callback`、`activity-admin` 部署命令均返回 success，函数列表回读为 Active。注意：本 Aime 沙箱内无 CloudBase 身份，`npm run cloudbase:verify` 返回 `No valid identity information, please use tcb login to login`，故新增云函数/索引的部署与回读只能由具备登录态的环境完成。
- 真实验收：HP-06、HP-08、HP-12 的代码门禁与开发版均已备齐，但 8 项都未取得与同一不可变 SHA 对应的完整真机/真实数据 smoke，不得删除；其中 HP-06 仅余 320px 真机截图与独立复核，HP-08 仅余真机 picker 创建/编辑保存重开 smoke，HP-12 仍需新旧账号同步回读与真机年限展示。

## 当前处理顺序

| 泳道 | ID | 优先级 | 状态 | 目标 | 唯一写者 | 复核/发布 |
| --- | --- | --- | --- | --- | --- | --- |
| A1 | `HP-20261009-01` | P0 | `PENDING_EVIDENCE` | 首页时间线兼容生产 BSON Date，已部署待真实页面 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| A2 | `HP-20261009-02` | P1 | `PENDING_EVIDENCE` | `_id` 使用 Mongo binary 顺序，已部署待真实页面 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| A3 | `HP-20261009-03` | P0 发布门禁 | `PENDING_EVIDENCE` | 真实 Date planner 已通过，待同 SHA 页面证据 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| A4 | `HP-20261009-05` | P1 | `PENDING_EVIDENCE` | 首页时间线客户端与发布链路，已部署待真实页面 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| B | `HP-20261009-13` | P0 | `PENDING_EVIDENCE` | Strava 生命周期已部署，待真实授权/解绑 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| C | `HP-20261009-04` | P1 | `PENDING_EVIDENCE` | 活动管理分页已部署，待 101+ 真实页面 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| D | `HP-20261009-06` | P1 | `PENDING_EVIDENCE` | 浅色对比度已随 #56 合入并交付开发版 0.0.36.1，仅余 320px 真机截图与独立复核 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| E | `HP-20261009-07` | P1 | `READY` | 我的行程永久保留历史/下架活动 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| F1 | `HP-20261009-08` | P1 | `PENDING_EVIDENCE` | 相对快捷项前置提示已随 #57 合入并交付开发版 0.0.37.1，仅余真机 picker 创建/编辑保存重开 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| F2 | `HP-20261009-09` | P1 | `READY` | 创建活动地点快捷选择与权限恢复（HP-08 代码门禁已满足，可启动；需真机定位验证） | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| G1 | `HP-20261009-10` | P1 | `READY` | 单背景图与预览的数据安全闭环 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| G2 | `HP-20261009-11` | P1 | `BLOCKED_BY(HP-20261009-10 code commit)` | 个人中心头像预览 | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |
| H | `HP-20261009-12` | P1 | `PENDING_EVIDENCE` | 闰日周年修复已随 #59 合入并交付开发版 0.0.39.1，待新旧账号同步回读与真机 smoke | TraeX 执行者 | TraeX 审判者 / Aime 个人助理 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。例如 HP-01/02 focused GREEN 且 HP-03 planner/smoke PASS 后即可启动 HP-05；HP-01/02/03 仍保留到合入、部署和真实页面 smoke 齐全，避免形成部署依赖死锁。

## 事项明细

### HP-20261009-01 · 首页时间线不兼容生产 BSON Date

- 优先级/状态：P0 / `PENDING_EVIDENCE`，代码已随 PR [#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52) 合入 main，`activity-read` 与两条首页索引已部署并 verify，等待真实页面 smoke。
- 当前事实：merge SHA `8d54e5f6caa1e75feb9043f2d1a2e04b698d859c` 已包含 RED `2e4c7d7` 与 GREEN `02a2fea`；where/keyset 使用 BSON Date、内部统一 epoch 比较，仅 cursor/DTO 边界转 ISO。
- 证据/阻断：PR #52 `validate` SUCCESS；main CI SUCCESS；微信开发版 run `37973713168` SUCCESS；`activity-read`、`activities_public_event_start`、`activities_public_event_end` 已部署并通过 bootstrap verify。当前仅缺真实首页分页 smoke。
- 下一步：执行首页默认未来、历史切换、跨页唯一性和快速切换迟到响应真实 smoke，补齐同一部署基线的页面证据。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：Date RED 转绿、focused 回归与 package verifier 通过，可进入 HP-02/03；不要求本条先最终关闭。
- 关闭条件：修复合入 main；HP-03 的 BSON Date planner/smoke 通过；目标环境部署；真实首页分页 smoke 通过；独立复核无 P0/P1。
- 更新时间：2026-10-10。

### HP-20261009-02 · `_id` 归并顺序与 Mongo binary collation 不一致

- 优先级/状态：P1 / `PENDING_EVIDENCE`，代码已随 PR [#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52) 合入 main，目标函数与索引已部署，等待跨页页面证据。
- 当前事实：merge SHA `8d54e5f6caa1e75feb9043f2d1a2e04b698d859c` 已包含混合 `-/_/大小写`、同时间戳、`page_size=1` 的 RED `963f1e4` 与 GREEN `49b4062`；归并使用 UTF-8 `Buffer.compare`，不再使用 `localeCompare`。
- 证据/阻断：PR #52 `validate` SUCCESS；main CI SUCCESS；微信开发版 run `37973713168` SUCCESS；目标环境函数、索引与 bootstrap verify 已通过。当前缺同时间戳混合 ID 页面 smoke。
- 下一步：验证同时间戳混合 ID 跨页顺序、唯一性和无遗漏。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：focused GREEN 后可与 HP-01 一起进入 HP-03；不要求本条先最终关闭。
- 关闭条件：确定性 RED 转绿；合入 main；真实 Date smoke 同时证明跨页顺序、唯一性和无遗漏；部署与页面 smoke 通过。
- 更新时间：2026-10-10。

### HP-20261009-03 · production BSON Date planner 发布门禁

- 优先级/状态：P0 发布门禁 / `PENDING_EVIDENCE`，production BSON Date 证据门禁已 PASS 且代码已随 PR [#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52) 合入 main，等待部署后同 SHA readback 与真实页面验收。
- 当前事实：第五轮用 108 条 strict canonical EJSON BSON Date fixture 完成类型回读、12/12 explain 与四流 smoke；报告收口提交 `ef70d50` 已随 merge SHA `8d54e5f6caa1e75feb9043f2d1a2e04b698d859c` 进入 main。
- 证据/阻断：独立复核确认 future/history 各 50 条按 `[20,20,10]` 无漏无重、legacy 可见、无效数据排除；临时集合三次只读回查 remaining=0，最后 requestId `3c96cd25-ca7e-4a25-b682-89bf9f0eefaf`。该证据属于部署前探针，不代表目标环境 Active 版本或真实页面通过；本轮 CloudBase verify 因缺身份失败。
- 下一步：目标环境部署最新 main 后，重新执行同 SHA 的 Date planner/readback 与真实页面 smoke。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者。
- 实现解锁条件：以下 planner/smoke 证据 PASS 后即可启动 HP-05，条目继续保留等待最终部署证据。
- 关闭条件：插入后回读并断言 `event_start/event_end` 为 BSON Date；查询 where/keyset 边界回读确认使用 Date；12/12 explain 无阻塞 SORT 且命中预期索引；108 条 smoke 的分页、顺序、唯一性、legacy/delete/非法数据结果正确；临时集合 remaining=0；相关代码合入、部署和独立复核完成。
- 更新时间：2026-10-10。

### HP-20261009-04 · PR #45 活动管理分页尚未交付

- 优先级/状态：P1 / `PENDING_EVIDENCE`，代码已随 PR [#45](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/45) 合入 main，CloudBase 31 索引与 `activity-admin` 已部署并 verify，等待管理页真实 smoke。
- 当前事实：merge SHA `658ea9c6f06acf9d5658eaa9dab77c8286a1bc07` 已在最新 main（13 集合、31 索引）上完成 PR #45 冲突整合，并保留首页时间线与 Strava 生命周期实现；活动管理新增两条组合索引，使用 BSON Date 查询边界、`event_start + _id` 稳定游标、状态/owner/软删前置过滤，以及 legacy ISO 时间与无时间草稿分阶段兼容。客户端新增状态筛选，并以 revision + 同 cursor single-flight 隔离刷新、筛选和加载更多，追加时按 ID 防重。
- 代码证据：PR #45 `validate` SUCCESS；main CI run `38012291148` SUCCESS；微信开发版 run `38012378411` 成功上传 `0.0.33.1`。活动管理 Node 测试覆盖 101 条、101 条同时间戳、BSON Date/legacy/无时间三阶段、状态与 owner/软删过滤及 cursor 绑定；Vitest 覆盖 repository 严格协议、快速刷新/筛选/加载更多迟到响应与重复请求。
- 证据/阻断：`activities_status_deleted_event_start_id` 与 `activities_owner_status_deleted_event_start_id` 已 apply，`activity-admin` 部署返回 success，31 索引 bootstrap verify 通过。当前缺 101+、同时间戳、过滤、快速刷新/筛选/加载更多竞态真实 smoke。
- 下一步：在管理页执行 101+ 与竞态真实 smoke，核对分页顺序、唯一性、筛选和迟到响应隔离。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；发布：Aime 个人助理。
- 关闭条件：不可变 PR SHA 复核通过；CI SUCCESS；合入 main；测试环境部署成功；101+、同时间戳、过滤、刷新/筛选/加载更多竞态真实 smoke 通过。
- 更新时间：2026-10-10。

### HP-20261009-05 · 首页未来/历史时间线剩余客户端与发布链路

- 优先级/状态：P1 / `PENDING_EVIDENCE`，客户端与发布链路已随 PR [#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52) 合入 main，目标函数与索引已部署并 verify，等待真实页面 smoke。
- 当前事实：merge SHA `8d54e5f6caa1e75feb9043f2d1a2e04b698d859c` 已包含严格 repository envelope/兼容旧 `listActivities(filter?)`、双视图 revision/single-flight 状态机、future/history UI/加载更多；当前 bootstrap 管理 31 条索引，首页两条 exact shape 已部署。
- 证据/阻断：PR #52 `validate` SUCCESS；main CI SUCCESS；微信开发版 run `37973713168` SUCCESS；目标环境 `cloudbase-d0gizacy77a1ab017` apply/verify 和 `activity-read` 部署成功。当前缺真实页面默认未来、历史切换与分页竞态 smoke。
- 下一步：执行真实页面默认未来、历史切换、分页、同筛选重试及切换/迟到响应竞态 smoke。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；发布：Aime 个人助理。
- 关闭条件：合入 main；目标环境部署；真实页面默认未来、历史切换、分页、同筛选重试及切换/迟到响应竞态全部通过；独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261009-06 · 浅色主题全页对比度

- 优先级/状态：P1 / `PENDING_EVIDENCE`，浅色主题对比度代码已随 PR [#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56) 合入 main 并交付开发版，等待真机验收与独立复核。
- 用户报告：个人中心“编辑资料”在浅色主题出现白字难以辨认，并要求核对其他页面。
- 代码事实：已补齐占位符、禁用态、媒体前景、状态与性别徽标语义 token；修复 profile、profile-edit、registrations、activity-detail、activity-card，并同步活动编辑、报名表单、凭证、审批详情与骑行名片等扫描出的真实风险。摄影 Hero 的固定浅色文字继续由深色遮罩承载，不改变品牌视觉。
- 本地证据：浅色主题 focused Vitest 5 文件 51/51 通过；新增全页静态契约覆盖输入占位符、错误/禁用态、辅助文案、卡片、状态和徽标，并断言普通文字 ≥4.5:1、关键控件 ≥3:1。`typecheck`、`format:check`、升级日志校验与 `git diff --check` 均通过。
- 远端证据：main CI run [38014014812](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014014812) SUCCESS；同不可变 SHA `a275fc3...` 的开发版 `0.0.36.1` 已由 run [38014100157](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014100157) 上传成功。
- 证据缺口：仍缺 14 页常规宽度/320px 真机截图与独立复核，因此暂不删除（对比度为与宽度无关的静态色彩属性，已由全页契约逐 token 证明）。
- 下一步：在常规宽度和 320px 对个人中心有图/无图、资料编辑错误/禁用/失败态及其余页面做浅色真机 smoke，并完成独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：14 页及共享可见组件在常规宽度和 320px 浅色主题通过；个人中心有图/无图、资料编辑错误/禁用/失败态通过；深色回归、CI、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-10。

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

- 优先级/状态：P1 / `PENDING_EVIDENCE`，相对快捷项前置提示已随 PR [#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57) 合入 main 并交付开发版，仅余真机 picker smoke。
- 用户报告：创建活动的时间需要控件和快捷选择，且点了没反应时要有交代。
- 代码/CI：PR #48 已加入日期/时间 picker 与“明早 07:00、下周六 08:00、开始后 4 小时、开始前 1 天 20:00”等快捷项；PR #57 修复相对快捷项在开始时间为空/非法时静默无动作的问题，并合并重复的开始时间解析。
- 测试证据：新增缺少/非法开始时间先红后绿用例（回退修复确认失败信号复现），补跨月（3/1→2/28）、跨年（→12/31）、闰年（2028→2/29）、跨天（22:00+4h→次日 02:00）与周六当天（→+7 天）边界回归，以及快捷时间在创建保存时随活动提交的回读用例；`validate`/`coverage`/`audit:all` 全绿。
- 远端证据：main CI run [38017029088](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017029088) SUCCESS；同不可变 SHA `92f5c0b...` 的开发版 `0.0.37.1` 已由 run [38017106152](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017106152) 上传成功。
- 证据缺口：仍缺真机 picker 在创建/编辑两种模式保存后重开的 smoke 与独立复核，因此暂不删除。
- 下一步：在真机验证创建与编辑两条路径，确认相对快捷项提示与正常回填、保存后重开值一致，并完成独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：三个时间字段可精细和快捷选择；无静默操作；跨月/年/时区无漂移；创建与编辑保存重开正确；CI、开发版 smoke 和独立复核齐全。
- 更新时间：2026-10-10。

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

- 优先级/状态：P1 / `PENDING_EVIDENCE`；闰日周年算法已随 PR [#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 合入 main 并交付开发版，存量同步回读与真机验收尚未完成。
- 用户报告：根据 Strava 获取骑行年限的功能为何未上线，代码是否合并。
- 代码/CI：账号年限取自 Strava athlete `created_at`，PR #59 将目标年份的周年日收敛到当月最后一天，`2020-02-29 -> 2021-02-28` 由 0 年修正为 1 年；普通日期与闰年边界保持不变。修复前确定性 RED，修复后 focused 25/25、全量 Vitest 734/734、`personal-card.ts` lines/functions 100% 且 branches 95%；PR/main CI 均为 SUCCESS。
- 发布证据：merge SHA `d3e84e6bd1104548bbe35a05b8496a277f9086c5`；微信开发版 run [38018365813](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018365813) 成功上传 `0.0.39.1`。本次只修改客户端算法，无云函数、Schema 或索引变更；现有同步链会在下一次同步抓取缺失的 `athlete_created_at`，无需为本次 PR 单独部署 CloudBase。
- 证据缺口：Aime 已报告三个相关函数 Active，但未给出与共享同步代码 SHA 的版本映射；存量快照可能缺 `athlete_created_at`，尚无真实新旧账号同步回读与真机年限展示证据。
- 下一步：使用新旧 Strava 测试账号触发同步，回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`，核对周年前/当天/后及闰日账号真机显示；补齐 Active 版本映射与独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：周年与闰日测试通过；main 合入且 CI 绿；三个函数 Active 版本可回读；真实账号同步后回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`；新旧账号真机显示正确且无需反复授权。
- 更新时间：2026-10-10。

### HP-20261009-13 · 设置页 Strava 授权撤销与异常生命周期

- 优先级/状态：P0 / `PENDING_EVIDENCE`，代码已随 PR [#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53) 合入 main，PR/main CI、微信开发版、`strava-auth/strava-callback` 部署与 CloudBase verify 均成功，等待六条真实授权 smoke。
- 当前事实：merge SHA `490044dd91194f9cd643c43700f97ae1ffaa74d3` 实现 attempt generation/fencing；disconnect 原子推进代际并消费全部未消费 state；callback 对乱序、解绑竞态和同步竞态 fail closed；`access_denied/error` 消费 state 并落稳定拒绝状态；readiness 按 scope/token/config/network 返回 `reauthorize/disconnect/contact-support/retry`；客户端仅按 recovery action 展示动作且不自动重跑 failed；解绑明确为本地断开，并降级所有未被 profile 引用的 Strava 媒体。
- 证据/阻断：PR #53 `validate` SUCCESS；main CI run `38010547930` SUCCESS；微信开发版 run `38010624339` 成功上传 `0.0.32.1`；`strava-auth`、`strava-callback` 部署返回 success，`oauth_attempts` 与媒体索引 apply/verify 通过。当前缺授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实 smoke。
- 下一步：使用真机和 Strava 测试账号执行六条授权生命周期 smoke，并确认旧 callback 无法恢复凭证。
- 负责人：TraeX 执行者；安全/独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：解绑后所有旧 callback 被拒绝且凭证不复活；拒绝授权消费 state 并停止轮询；retry/reauthorize/disconnect/contact-support 由稳定服务端语义驱动；解绑数据保留合同明确；`strava-auth/callback` 部署回读；授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实 smoke 通过。
- 更新时间：2026-10-10。

## 并行边界

- 泳道 A（HP-01/02/03/05）共享首页时间线文件，按实现门禁串行；HP-03 PASS 后即可继续 HP-05，不等待部署最终关闭。
- 泳道 B（HP-13）先处理授权安全；HP-12 的客户端周年算法可并行，但 Strava/Profile 云函数统一部署必须在 HP-13 代码复核后。
- 泳道 C（HP-04）、D（HP-06）、E（HP-07）文件边界独立，可并行。
- 泳道 F（HP-08→09）共享活动编辑页，单写者串行；泳道 G（HP-10→11）共享个人资料页，单写者串行。
- Aime 个人助理只在不可变 SHA 通过独立复核后执行目标环境部署和真实 smoke；部署证据不得替代代码复核，开发版上传不得替代 CloudBase 部署。
