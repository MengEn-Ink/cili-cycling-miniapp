# 高优问题清单

> 最后更新：2026-10-10 10:55（CST）
>
> 维护原则：这里只保留尚未满足关闭条件的问题。新问题先去重、澄清、拆分；已满足关闭条件的条目直接删除，Git 历史和不可变外部证据作为归档。

## 开工与证据规则

1. 每个 Agent 开工前先读本文件，优先处理未阻塞的 P0，再处理 P1；除非用户明确调整顺序。
2. `用户报告`、`代码已合入`、`CI 通过`、`已部署`、`真实验收`是五层独立证据，后层不得由前层推断。
3. `READY` 表示可立即处理；`IN_PROGRESS` 表示已有唯一写者；`BLOCKED_BY(...)` 只等待括号内的实现门禁；`DEPLOY_PENDING` 表示代码门禁已通过但目标环境部署缺失；`PENDING_EVIDENCE` 表示缺少运行态回读或真实验收。
4. 代码项只有在合入目标分支、所需 CI 通过、部署到目标环境、真实 smoke/readback 通过，并满足条目要求的独立复核后才可删除。
5. 同一文件族只允许一个写者；不同处理泳道可并行。状态、负责人、证据、下一步或关闭条件变化时，必须在同一轮同步本文件。

## 当前共同证据

- 用户报告：2026-10-09 群聊新增 6 组问题，已拆成 HP-06 至 HP-13 共 8 个原子项；HP-01 至 HP-05 于 2026-10-10 全部满足关闭条件并删除。
- 代码合入：PR [#45](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/45)、[#48](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/48)、[#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52)、[#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53)、[#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56)、[#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57)、[#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 已合并；[#58](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/58)、[#60](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/60) 为纯文档提交；最后一次含产品/云函数变更的 main 基线为 `d3e84e6bd1104548bbe35a05b8496a277f9086c5`（#59 纯前端 Strava 闰日周年校准）。
- CI：上述 PR 及产品基线 `d3e84e6...` 对应 CI 均为 SUCCESS；最新 main CI run [38018305836](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018305836) SUCCESS。CI 不能证明 CloudBase Active 版本或真机行为。
- 微信开发版：run [38018365813](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018365813) 成功上传 `0.0.39.1`（head `d3e84e6...`）；浅色主题（HP-06）首次随 run [38014100157](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014100157) 的 `0.0.36.1`（head `a275fc3...`）交付，活动时间快捷项（HP-08）首次随 run [38017106152](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017106152) 的 `0.0.37.1`（head `92f5c0b...`）交付。
- CloudBase 部署与回读（2026-10-10，已登录本地环境执行，环境 `cloudbase-d0gizacy77a1ab017`）：HP-01..05 验收时 `node scripts/bootstrap-cloudbase.mjs --verify` 通过（13 个集合、31 条索引、不符合项 0），10 个云函数下载线上 `$LATEST` 与同基线本地包逐文件比对，首轮仅 `admin-review` 落后（缺 PR #48 快照字段），补部署后 10/10 全部一致；随后补建 `oauth_attempts` 与首页/媒体/管理分页共 6 条索引（apply requestId 依次为 `70af1f69-803e-4e65-8816-8aaf04120cc5`、`910a7036-7da5-4210-bbb5-48562d84302d`、`6028903a-c63d-4c1b-bd59-a1db4656719d`、`b6331a33-f8be-479e-9247-615a9071f3e2`、`bd79dafe-6b74-4da4-af09-af5a75196bdd`、`104e8934-617e-497e-bd12-0f302680e35c`），并将 `activity-read`、`strava-auth`、`strava-callback`、`activity-admin` 部署为 Active，函数列表回读成功。
- HP-01/02/03/05 真机 smoke（2026-10-10，自动化客户端对同一部署）：向 `activities` 插入 101 条 `e2e_marker: P0SWEEP_20261010` 隔离文档（含 5 进行中、45 未来候选、30 历史候选、15 自然结束、6 draft 及两个同时间戳混合 ID 组）；首页未来视图三页 20→40→50、历史三页 20→40→45，跨页 ID 唯一；同刻未来组 UTF-8 升序为 `["e2eMIXaaa12","e2eMIXaaa13","e2eMix-Aaa-09","e2eMix-Aaa-10","e2eMix_Aaa_08","e2eMix_Aaa_11"]`，同刻历史组降序为 `["e2eOldaaa13","e2eOld_Aaa_11","e2eOld_Aaa_08","e2eOld-Aaa-10","e2eOld-Aaa-09","e2eOLDaaa12"]`；同筛选重复触发与快速切换竞态后无错误、无重复。
- HP-03 planner/readback（2026-10-10，同部署同基线）：探针 108 条 strict BSON Date fixture，插入 requestId `129afefc-295b-4ca0-a2b3-5922b1c05c92`，BSON Date 回读 requestId `cdded173-911f-4776-ad84-40407b15d0a9`（`bsonDateVerified: true`），12/12 explain 通过，future/history 各 50 条 smoke；清理 drop requestId `a47f4959-a36e-4935-a891-d67c96604a86`、verify requestId `0b373350-d94b-4cf1-a361-6baadbedafc2`、remaining 0。
- HP-04 真机 smoke（2026-10-10，同一隔离集）：管理列表全部 50→100→102（101 隔离 + 1 存量草稿）、无遗漏无重复；draft 筛选 7（隔离 6）、published 50→65、finished 30；快速刷新/筛选/加载更多竞态后仍为全部/50 且无错误。
- 隔离清理：按 marker 分批物理删除 101/101，回查 `e2e_marker` 结果集为空（requestId `817d85a8-5441-4406-a289-4c9946dc0aba`），存量 1 条草稿原样保留。
- 剩余真实验收缺口：HP-06 仅余 320px 真机截图与独立复核；HP-08 仅余真机 picker 创建/编辑保存重开 smoke；HP-12 待真实新旧账号同步回读 `strava_snapshots.athlete_created_at` / profile `strava_joined_at` 与真机年限展示；HP-13 待六条授权生命周期 smoke。未取得完整真机 smoke 的条目不得删除。

## 当前处理顺序

| 泳道 | ID               | 优先级 | 状态                                     | 目标                                                                                    | 唯一写者      | 复核/发布                    |
| ---- | ---------------- | ------ | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| B    | `HP-20261009-13` | P0     | `PENDING_EVIDENCE`                       | Strava 生命周期已部署，待真实授权/解绑 smoke                                            | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| D    | `HP-20261009-06` | P1     | `PENDING_EVIDENCE`                       | 浅色对比度已随 #56 合入并交付开发版 0.0.36.1，仅余 320px 真机截图与独立复核             | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| D1   | `HP-20261010-01` | P1     | `IN_PROGRESS`                            | 浅色模式“我的行程”RIDE 序号对比度修复（#56 遗漏项，新发现）                             | Aime 个人助理 | TraeX 审判者                 |
| E    | `HP-20261009-07` | P1     | `READY`                                  | 我的行程永久保留历史/下架活动                                                           | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| F1   | `HP-20261009-08` | P1     | `PENDING_EVIDENCE`                       | 相对快捷项前置提示已随 #57 交付开发版 0.0.37.1，仅余真机 picker 创建/编辑保存重开 smoke | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| F2   | `HP-20261009-09` | P1     | `READY`                                  | 创建活动地点快捷选择与权限恢复（HP-08 代码门禁已满足，可启动；需真机定位验证）          | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| G1   | `HP-20261009-10` | P1     | `READY`                                  | 单背景图与预览的数据安全闭环                                                            | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| G2   | `HP-20261009-11` | P1     | `BLOCKED_BY(HP-20261009-10 code commit)` | 个人中心头像预览                                                                        | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| H    | `HP-20261009-12` | P1     | `PENDING_EVIDENCE`                       | 闰日修复已随 #59 合入、相关函数已部署 Active，待真实新旧账号同步回读与真机 smoke        | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。

## 事项明细

### HP-20261009-06 · 浅色主题全页对比度

- 优先级/状态：P1 / `PENDING_EVIDENCE`，浅色对比度代码已随 PR [#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56) 合入 main 并交付开发版，等待真机验收与独立复核。
- 用户报告：个人中心“编辑资料”在浅色主题出现白字难以辨认，并要求核对其他页面。
- 代码事实：已补齐占位符、禁用态、媒体前景、状态与性别徽标 token；修复 profile、profile-edit、registrations、activity-detail、activity-card，并同步活动编辑、报名表单、凭证、审批详情与骑行名片等扫描出的风险。摄影 Hero 的固定浅色文字继续由深色遮罩承载，不改变品牌视觉。
- 本地证据：浅色主题 focused Vitest 51/51 通过；全页静态契约断言普通文字 ≥4.5:1、关键控件 ≥3:1。
- 远端证据：main CI run [38014014812](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014014812) SUCCESS；同 SHA `a275fc3...` 的开发版 `0.0.36.1` 已上传。
- Aime 自动化复核进展（2026-10-10）：真实点击设置页可双向切换深浅色并持久化；settings、activities、registrations、profile、profile-edit、activity-detail、admin/activity-list 页面浅色 class 均生效；抽样真实渲染文字计算对比度，已发现 registrations 页 `.card-index` 未随浅色覆盖（拆为 HP-20261010-01 单独修复），其余在修完该遗漏后需复跑确认。
- 证据缺口：320px 真机截图、HP-20261010-01 合入后的整页复跑与独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：14 页及共享可见组件在常规宽度和 320px 浅色主题通过；个人中心有图/无图、资料编辑错误/禁用/失败态通过；深色回归、CI、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261010-01 · 浅色模式“我的行程”RIDE 序号对比度不足

- 优先级/状态：P1 / `IN_PROGRESS`，Aime 个人助理；2026-10-10 浅色真机 smoke 中发现并拆出的 #56 遗漏项。
- 用户可感知现象：浅色模式下“我的行程”卡片左上角 `RIDE 1` 等序号沿用深色主题灰字 `#9b9ba0`，压在白色卡片上对比度仅约 2.8:1，户外强光下难辨认。
- 修法：浅色主题 `.card-index` 改用语义弱色 `var(--color-muted)`（浅色值 `#4f4f4c`），深色主题不变；全页对比度契约增加该选择器锁定。
- 验收：本地门禁 + PR checks + main CI + 微信开发版上传成功后，复跑浅色 smoke 确认该元素对比度 ≥4.5:1，再删除本条。
- 更新时间：2026-10-10。

### HP-20261009-07 · 我的行程保留全部历史、已完成和下架活动

- 优先级/状态：P1 / `READY`，报名/行程文件族独立处理。
- 用户报告：历史已完成或下架活动不能从用户行程消失，也不能变成异常。
- 代码/CI：PR #48 已让 `registration/mine` 返回 owner-bound 活动投影和快照降级，focused 既有测试可通过；Aime 已报告 `registration` Active，但版本映射、只读回读与真实 smoke 证据尚未补齐。
- 确认缺口：`registration/mine` 固定 `.limit(50)` 且无分页；页面用 `Promise.all(listRegistrations,listActivities)`，公开活动读取失败会拖垮整页；真实 `draft` 下架、软删/物理缺失服务端降级未被直接测试。
- 下一步：先锁 101 条分页、公开列表失败不影响行程、`published/finished/draft/is_deleted/物理缺失` 的 RED；明确下架标签和缺失活动取消报名合同后最小 GREEN。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：全部报名可分页且无漏重；历史/下架/软删/缺失活动可解释展示；公开活动接口失败不影响行程；`registration` 部署回读、50+ 真实数据 smoke、CI 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-08 · 创建活动时间快捷选择

- 优先级/状态：P1 / `PENDING_EVIDENCE`，相对快捷项前置提示已随 PR [#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57) 合入 main 并交付开发版，仅余真机 picker smoke。
- 用户报告：创建活动的时间需要控件和快捷选择，且点了没反应时要有交代。
- 代码/CI：PR #48 已加入 picker 与“明早 07:00、下周六 08:00、开始后 4 小时、开始前 1 天 20:00”等快捷项；PR #57 修复相对快捷项在开始时间为空/非法时静默无动作的问题。
- 远端证据：main CI run [38017029088](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017029088) SUCCESS；同 SHA `92f5c0b...` 的开发版 `0.0.37.1` 已上传。
- 证据缺口：真机 picker 在创建/编辑两种模式保存后重开的 smoke 与独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：三个时间字段可精细和快捷选择；无静默操作；跨月/年/时区无漂移；创建与编辑保存重开正确；CI、开发版 smoke 和独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261009-09 · 创建活动地点快捷选择与权限恢复

- 优先级/状态：P1 / `READY`（HP-08 代码门禁已满足）。
- 用户报告：地点快捷选择应位于输入框右侧。
- 代码/CI：PR #48 已把起终点“地图选点”放到输入框右侧，并保留坐标回填、手改文字清坐标与服务端范围校验。
- 确认缺口：没有 `wx.authorize/getSetting/openSetting` 的拒绝恢复链；取消、永久拒绝、系统定位关闭和保存中竞态未覆盖。
- 下一步：设计并测试首次同意、拒绝后恢复、系统定位关闭、取消和保存中的状态机；核对微信后台隐私指引。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；隐私配置/真机：Aime 个人助理。
- 关闭条件：创建/编辑均可从右侧选点并持久化坐标；拒绝后有可操作恢复路径；手改文本不提交旧坐标；活动详情真实导航成功；CI、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261009-10 · 单背景图与预览的数据安全闭环

- 优先级/状态：P1 / `READY`，个人资料媒体文件族唯一写者先处理本项。
- 用户报告：个人只允许一张背景图片，并需要背景预览。
- 代码/CI：PR #48 已把选择数量设为 1、只取 `photos[0]`、服务端拒绝多图，并在编辑页/个人中心加入背景预览。
- 确认缺口：schema/模型仍把 `photos` 定义为无上限数组；存量多图账号打开并保存会静默丢弃其余引用，且与管理员审核最多三张个人媒体的既有语义冲突。
- 下一步：采用不丢历史资料的单背景槽位或明确迁移方案，补存量多图 RED、schema 合同和清理回读；不得以静默截断关闭。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：新用户只能添加/替换一张背景；编辑页与个人中心可预览；两张输入被拒；存量多图无未经确认的数据丢失；`profile` 部署、真机 smoke、CI 与复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-11 · 个人中心头像预览不可用

- 优先级/状态：P1 / `BLOCKED_BY(HP-20261009-10 code commit)`，避免并发修改 profile 文件族。
- 用户报告：头像预览不可用。
- 代码/CI：编辑资料页已有 `previewAvatar` 和 HTTPS URL 等待；PR #48 已合入。个人中心首页头像只有 `binderror`，没有 `bindtap` 或预览处理器，升级日志“头像和背景图均可点击预览”大于实现事实。
- 证据/阻断：现有首页测试只断言 aria-label，因此在头像完全不可点击时仍可通过。
- 下一步：先补首页头像点击 RED；实现合法 HTTPS 单图预览，无头像/非法 URL/加载失败时 fail closed；保留编辑页回归。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：个人中心和编辑页均可预览头像；异常输入不调用预览且不崩溃；测试、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-09。

### HP-20261009-12 · Strava 年限正确性、存量回填与部署

- 优先级/状态：P1 / `PENDING_EVIDENCE`；闰日周年算法已随 PR [#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 合入 main 并交付开发版，相关云函数已部署 Active，存量同步回读与真机验收尚未完成。
- 用户报告：根据 Strava 获取骑行年限的功能为何未上线，代码是否合并。
- 代码/CI：账号年限取自 Strava athlete `created_at`，PR #59 将目标年份的周年日收敛到当月最后一天，`2020-02-29 -> 2021-02-28` 由 0 年修正为 1 年；普通日期与闰年边界保持不变。修复前确定性 RED，修复后 focused 25/25、全量 Vitest 734/734、`personal-card.ts` lines/functions 100% 且 branches 95%；PR/main CI 均为 SUCCESS。
- 发布证据：merge SHA `d3e84e6bd1104548bbe35a05b8496a277f9086c5`；微信开发版 run [38018365813](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38018365813) 成功上传 `0.0.39.1`。
- 部署现状：`strava-auth`、`strava-callback`、`activity-read`、`activity-admin` 已按 main 部署为 Active 并通过函数列表回读。
- 证据缺口：尚未给出线上 Active 版本与共享同步代码 SHA 的版本映射；存量快照可能缺 `athlete_created_at`，尚无真实新旧账号同步回读与真机年限展示证据。
- 下一步：使用新旧 Strava 测试账号触发同步，回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`，核对周年前/当天/后及闰日账号真机显示；补齐 Active 版本映射与独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：周年与闰日测试通过；main 合入且 CI 绿；相关函数 Active 版本可回读且有 SHA 映射；真实账号同步后回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`；新旧账号真机显示正确且无需反复授权。
- 更新时间：2026-10-10。

### HP-20261009-13 · 设置页 Strava 授权撤销与异常生命周期

- 优先级/状态：P0 / `PENDING_EVIDENCE`，代码已随 PR [#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53) 合入 main，PR/main CI、微信开发版、`strava-auth/strava-callback` 部署与 CloudBase verify 均成功，等待六条真实授权 smoke。
- 当前事实：merge SHA `490044dd91194f9cd643c43700f97ae1ffaa74d3` 实现 attempt generation/fencing；disconnect 原子推进代际并消费全部未消费 state；callback 对乱序、解绑竞态和同步竞态 fail closed；`access_denied/error` 消费 state 并落稳定拒绝状态；readiness 按 scope/token/config/network 返回 `reauthorize/disconnect/contact-support/retry`；客户端仅按 recovery action 展示动作且不自动重跑 failed；解绑明确为本地断开，并降级所有未被 profile 引用的 Strava 媒体。
- 证据/阻断：PR #53 `validate` SUCCESS；main CI run `38010547930` SUCCESS；微信开发版 run `38010624339` 成功上传 `0.0.32.1`；2026-10-10 已下载线上 `strava-auth/strava-callback` 代码与基线比对一致。当前缺授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实 smoke。
- 下一步：使用真机和 Strava 测试账号执行六条授权生命周期 smoke，并确认旧 callback 无法恢复凭证。
- 负责人：TraeX 执行者；安全/独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：解绑后所有旧 callback 被拒绝且凭证不复活；拒绝授权消费 state 并停止轮询；retry/reauthorize/disconnect/contact-support 由稳定服务端语义驱动；`strava-auth/callback` 部署回读；六条真实 smoke 通过。
- 更新时间：2026-10-10。

## 并行边界

- 泳道 B（HP-13）先处理授权安全；HP-12 客户端周年算法已并行合入，相关四个云函数已部署 Active；HP-13 真实 smoke 闭环前不得再追加共享 Strava/Profile 代码的新部署变更。
- 泳道 D（HP-06、HP-20261010-01）、E（HP-07）文件边界独立，可并行；HP-20261010-01 与 #56 后续复核共享浅色主题验收，串行收口。
- 泳道 F（HP-08→09）共享活动编辑页，单写者串行；泳道 G（HP-10→11）共享个人资料页，单写者串行。
- Aime 个人助理只在不可变 SHA 通过独立复核后执行目标环境部署和真实 smoke；部署证据不得替代代码复核，开发版上传不得替代 CloudBase 部署。
