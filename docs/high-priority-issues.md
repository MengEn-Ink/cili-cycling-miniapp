# 高优问题清单

> 最后更新：2026-10-11 12:47（CST）
>
> 维护原则：这里只保留尚未满足关闭条件的问题。新问题先去重、澄清、拆分；已满足关闭条件的条目直接删除，Git 历史和不可变外部证据作为归档。

## 开工与证据规则

1. 每个 Agent 开工前先读本文件，优先处理未阻塞的 P0，再处理 P1；除非用户明确调整顺序。
2. `用户报告`、`代码已合入`、`CI 通过`、`已部署`、`真实验收`是五层独立证据，后层不得由前层推断。
3. `READY` 表示可立即处理；`IN_PROGRESS` 表示已有唯一写者；`BLOCKED_BY(...)` 只等待括号内的实现门禁；`SUPERSEDED_BY(...)` 表示旧需求已被括号内的新产品基线替代，不再单独实施；`DEPLOY_PENDING` 表示代码门禁已通过但目标环境部署缺失；`PENDING_EVIDENCE` 表示缺少运行态回读或真实验收。
4. 代码项只有在合入目标分支、所需 CI 通过、部署到目标环境、真实 smoke/readback 通过，并满足条目要求的独立复核后才可删除。
5. 同一文件族只允许一个写者；不同处理泳道可并行。状态、负责人、证据、下一步或关闭条件变化时，必须在同一轮同步本文件。

## 当前共同证据

- 用户报告：2026-10-09 群聊新增 6 组问题，已拆成 HP-06 至 HP-13 共 8 个原子项；HP-01 至 HP-05 于 2026-10-10 全部满足关闭条件并删除。
- 代码合入（2026-10-11 12:02）：N3 剩余 UI 增量由 [#116](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/116) 交付——首页未来活动按中国自然日插入「今天/明天/后天/M月D日 周X」分组头，多日时顶部出现可点击的日期 chip 平滑定位到当天分组，历史视图与「下一场/接下来」主视觉不变；main HEAD `c6d163a`，main CI run [38110023518](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110023518) SUCCESS，开发版 run [38110081492](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110081492) 日志确认「微信开发版 0.0.117.1（robot 1）上传成功」。N3 至此代码/CI/开发版齐备，仅余真机日期切换 smoke。
- 分支治理（2026-10-11 12:02）：远端仅保留 `main`，#89–#116 合并后功能分支均已删除；沙箱近期交付 worktree 的陈旧本地分支已核对（均为 squash 已合并内容）后清理，其中本地 `fix/activity-image-upload-status` 经逐文件比对，确认其能力已被当前 main 的 `pendingImages` 逐张状态/独立重试实现（#95/#100）覆盖且更完整，删除不丢需求。
- 代码合入：PR [#45](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/45)、[#48](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/48)、[#52](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/52)、[#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53)、[#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56)、[#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57)、[#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59)、[#62](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/62)、[#66](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/66)、[#69](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/69)、[#73](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/73) 已合并；HP-01..05 验收时云函数代码基线为 `0da2ce5...`（当时 main HEAD），#56/#57/#58/#59/#62/#66/#69/#73 均未改动 `cloudfunctions/**`，故线上函数与当前 main 云函数代码一致。
- CI：上述 PR 的 PR CI 与 main CI 均为 SUCCESS。CI 不能证明 CloudBase Active 版本或真机行为。
- HP-07 远端门禁：main SHA `d9d9f777450a33a6cccb664028b588b9aaade789` 的 CI run [38023441280](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023441280) SUCCESS；validate、coverage、CloudBase bootstrap 只读验证和高危依赖审计全部通过。
- 微信开发版：第二批补强（资料编辑/骑行名片低对比收口）随 head `c60a47e...` 的 main CI run [38042509312](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38042509312) SUCCESS，开发版 run [38042576572](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38042576572) 实际上传 `0.0.75.1`；第二批浅底可读性修复与升级日志收敛随 head `0071bb1...` 的 main CI run [38040428765](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38040428765) SUCCESS，开发版 run [38040488247](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38040488247) 实际上传 `0.0.73.1`；HP-10/HP-11 远端 CI 收口随 head `b4934c6...` 的 main CI run [38034344065](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38034344065) SUCCESS，首轮 `36247f2...` 和 `e1a5161...` 因 Prettier 门禁和 force-push 失效先后失败后，经 chore 格式化与空提交补推后收敛；统一 UI 第一批随 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) 成功上传 `0.0.55.1`（head `4b27057...`，日志含"微信开发版 0.0.55.1 上传成功"）；此前 run [38024964766](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38024964766) 上传 `0.0.52.1`（head `54df558...`），run [38023517201](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023517201) 上传 `0.0.49.1`（head `d9d9f77...`）。更早 run [38020822125](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38020822125) 上传 `0.0.45.1`（head `fe616f2...`）；浅色主题首次随 run [38014100157](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014100157) 上传 `0.0.36.1`（head `a275fc3...`）交付，活动时间快捷项随 run [38017106152](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017106152) 的 `0.0.37.1` 交付。
- HP-07 微信开发版：同一 SHA `d9d9f77...` 的 run [38023517201](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023517201) SUCCESS，实际上传而非跳过，日志确认“微信开发版 `0.0.49.1` 上传成功”。
- CloudBase 部署与回读（2026-10-10，已登录本地环境执行）：`cloudbase-d0gizacy77a1ab017` 共 13 个集合、31 条索引，`node scripts/bootstrap-cloudbase.mjs --verify` 通过（不符合项 0）；10 个云函数全部部署，下载线上 `$LATEST` 代码与同基线本地包逐文件比对：首轮仅 `admin-review` 落后（缺 PR #48 的快照字段），补部署后再次下载比对 10/10 全部一致，管理台状态为部署完成。
- HP-07 CloudBase 部署与回读（2026-10-10）：`registrations_openid_created_at_id` 索引已应用，requestId `aa271a73-b190-4329-8b4b-37f9eb9dcb83`；bootstrap verify 确认 13 个集合、32 条索引且不符合项 0。`registration` 已强制部署，函数列表回读状态为 `Active`、更新时间 `2026-10-10 12:06:42`，requestId `8f0b635a-554a-4b15-b886-14d8b4f01d35`；线上 `$LATEST` 下载后与本地部署包逐文件比对无差异。
- HP-01/02/03/05 真机 smoke（2026-10-10，自动化客户端对同一部署）：向 `activities` 插入 101 条 `e2e_marker` 隔离文档（含 5 进行中、45 未来候选、30 历史候选、15 自然结束、6 draft 及两个同时间戳混合 ID 组）；首页未来视图三页 20→40→50、历史三页 20→40→45，跨页 ID 唯一；同刻未来组 UTF-8 升序为 `["e2eMIXaaa12","e2eMIXaaa13","e2eMix-Aaa-09","e2eMix-Aaa-10","e2eMix_Aaa_08","e2eMix_Aaa_11"]`，同刻历史组降序为 `["e2eOldaaa13","e2eOld_Aaa_11","e2eOld_Aaa_08","e2eOld-Aaa-10","e2eOld-Aaa-09","e2eOLDaaa12"]`；同筛选重复触发与快速切换竞态后无错误、无重复。
- HP-03 planner/readback（2026-10-10，同部署同基线）：探针 108 条 strict BSON Date fixture，插入 requestId `129afefc-295b-4ca0-a2b3-5922b1c05c92`，BSON Date 回读 requestId `cdded173-911f-4776-ad84-40407b15d0a9`（`bsonDateVerified: true`），12/12 explain 通过，future/history 各 50 条 smoke；清理 drop requestId `a47f4959-a36e-4935-a891-d67c96604a86`、verify requestId `0b373350-d94b-4cf1-a361-6baadbedafc2`、remaining 0。
- HP-04 真机 smoke（2026-10-10，同一隔离集）：管理列表全部 50→100→102（101 隔离 + 1 存量草稿）、无遗漏无重复；draft 筛选 7（隔离 6）、published 50→65、finished 30；快速刷新/筛选/加载更多竞态后仍为全部/50 且无错误。
- 隔离清理：按 marker 分批物理删除 101/101，回查 `e2e_marker` 结果集为空（requestId `817d85a8-5441-4406-a289-4c9946dc0aba`），存量 1 条草稿原样保留。
- 新 UI 产品基线（2026-10-10 09:58）：用户已确认按新截图重做全局 UI，移除旧版布局及深浅主题区分；采用单一明亮高对比主题，并以 375×812px、16px 页面边距、8px 栅格、48px 输入/按钮、56px TabBar、真实字体和卡片尺寸为实施基准。
- 新 UI 375×812 运行态证据（2026-10-10 13:07）：在 head `4b27057...` 上通过微信开发者工具官方 `miniprogram-automator` 采集第一批六页截图，设备配置回读为 iPhone X、`screenWidth=375`、`screenHeight=812`、基础库 3.17.4；逐页确认无重叠、裁切或固定栏遮挡，创建页保持单列，原生 TabBar 三个图标正常。截图与边界说明存于 `docs/evidence/2026-10-10-unified-bright-ui/`；该证据不冒充物理真机验收。
- 旧 UI 本地运行态封板（2026-10-10 12:20）：在独立 worktree 检出 #69 合并提交 `d639b704`，通过已登录微信开发者工具（iPhone 12/13 Pro，390px，浅色主题）重跑 14 页 smoke；独立视觉复核确认骑行名片指标、活动管理标题与 `RIDE 1` 序号均 `PASS`，底部按钮未被安全区裁切。该证据仅用于封板旧 UI 过渡保护，不改变 `HP-20261010-02` 的统一 UI 优先级。
- HP-08 本地运行态补证（同一 worktree）：通过真实输入框和快捷按钮得到 `startAt=2026-10-10 22:00:00`、`endAt=2026-10-11 02:00:00`；清空开始时间后点击相对截止时间，`deadline` 保持空值。该 smoke 尚未覆盖新建/编辑模式的 picker、保存、重开回读和真机独立复核。
- CloudBase 本地核验（2026-10-10）：`npm run cloudbase:verify` 通过，`profile-media-cleanup`、`activity-admin`、`strava-auth`、`strava-callback`、`profile`、`activity-read` 均为 `Active`；该证据仅证明部署状态，不替代业务链路验收。
- HP-13 可观测性（2026-10-10）：CloudBase 日志服务已通过 CLI 开通，CLI 明确提示“不额外计费”；诊断提交 `672cb5f` 随 head `633d74f...` 的 CI run [38027332121](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38027332121) SUCCESS。`strava-auth` 强制部署后回读为 `Active`、更新时间 `2026-10-10 13:23:59`（requestId `dd84d75e-0242-4752-9581-df297e2ab33e`），线上 `$LATEST` 与本地部署包逐文件无差异。真实请求 `ae45d0b8-ade6-4a16-8eec-6f343cda303e` 输出 `stage=read-readiness/code=-1`，未记录 openid、令牌或原始错误正文。
- HP-13 根因修复部署与回读（2026-10-10）：提交 `31404ce46723` 随 head `736274b...` 的 CI run [38027765737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38027765737) SUCCESS，开发版 run [38027820410](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38027820410) 实际上传 `0.0.58.1`。`strava-auth` 强制部署后回读为 `Active`、更新时间 `2026-10-10 13:31:44`（requestId `d51f1a4c-f08b-47c0-a97d-67133ea0a04f`），线上 `$LATEST` 与本地逐文件无差异；设置页真实请求 `7849fefc-1c0f-48d0-b3e6-6e04541ee476` 返回 `ok:true/state:syncing`，页面回读 `stravaLoadError=""`、文案“授权成功，正在准备骑行数据”，该请求无 `strava_auth_failed` 日志。
- HP-09 远端交付（2026-10-10）：head `65f46cc...` 的 main CI run [38028452090](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38028452090) SUCCESS；开发版 run [38028513962](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38028513962) 实际上传 `0.0.60.1`，日志含“微信开发版 0.0.60.1 上传成功”。
- 极简活动创建现状（2026-10-10）：PR [#78](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/78) 已合入 main `45b64ed...`，main CI run [38064193937](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38064193937) 与微信开发版 run [38064286120](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38064286120) SUCCESS，实际上传 `0.0.78.1`。该证据只证明代码和开发版交付，不关闭时间保存重开回显、图片本地预览/保存回读等端到端缺口。
- 新增需求澄清（2026-10-10 23:56）：用户确认将极简创建端到端、活动分享与群二维码、首页未来两周、个人资料必填、图片上传治理、右滑删除、缓存、全员发布与发布人展示、固定体验版九项加入项目待办；其中性别和个人照片均为必填，个人照片同时作为背景照片和骑行名片必备素材。
- 2026-10-11 10:04 对齐：最近 50 个已合并 PR 的远端 head 分支均已删除；沙箱遗留 worktree/本地分支 `feat/activity-title-card-polish` 已清理。清单内未发现 `READY` / `IN_PROGRESS` 的可继续编码事项。

## 当前工作交接检查点

- 2026-10-11 12:47 本轮（定时对齐）补做全量界面英文文案扫描并交付 [#118](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/118)：#113 仅收口编辑器与活动详情，本轮把活动首页/详情/我的活动、报名审批与审核详情、报名表单、我的行程、个人资料、设置等页面的 brand-logo 英文 meta 与 MY RIDES、REVIEW、CURRENT EVENT、CONTROL CENTER、LATEST、RIDER PROFILE、IDENTITY CHECK、PROFILE LOADING/ERROR、CILI ACTIVITIES、CILI · REGISTRATION、STEP 1、RIDE / 01、RIDES / n、RIDER CAPABILITY、RIDE DETAIL、PREFERENCES · RELEASES、ADMIN · REVIEW、REVIEW · DETAIL 及个人资料 M/A 图标字母统一改为中文或移除（紧邻中文标题的重复英文装饰直接删除；CILI/STRAVA 品牌词与 km/m/km/h 计量单位保留），并删除随元素失效的 `.hero-sequence`/`.hero view:first-child` 样式。新增 `tests/ui-copy-chinese-contract`（19 个禁用词 + meta 英文断言的全量 WXML 扫描契约），同步报名表单契约与设置页发布日志断言；本地 `npm run validate`（833 项测试）、`coverage`、`audit:all`（0 高危）全绿。main `7631d71`，main CI [38112254759](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38112254759) SUCCESS，微信开发版 [38112316334](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38112316334) 日志确认「微信开发版 0.0.119.1（robot 1）上传成功」。N10 文案中文化在代码/自动化/开发版层全部齐备，仅余真机抽查、独立复核与用户确认。分支治理：远端仍仅 `main`；沙箱 10/10 遗留 7 个本地 worktree 与 21 个 squash 已合并或被覆盖的陈旧本地分支已全部清理，HP-07 smoke 证据归档至沙箱 `archived-evidence-20261010/`。CloudBase 部署凭证本沙箱仍缺失（环境无 Tencent/TCB/WECHAT 相关变量、无 @cloudbase/cli），N5/N8 涉及云函数部署回读的阻塞仍未解除。
- 2026-10-11 12:02 本轮（定时对齐）交付清单中唯一仍可独立推进的纯前端增量：[#116](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/116) 首页未来活动按中国自然日分组——在 #89 的 14 天窗口与稳定升序之上，未来列表插入「今天/明天/后天/M月D日 周X」日期头（同日多场合并为一组、跨年补年份），出现 ≥2 个日期时顶部展示横向日期 chip，点击 `wx.pageScrollTo` 平滑定位到当天锚点，旧基础库不支持 selector 时静默降级；历史视图与「下一场/接下来」主视觉零变化。新增纯函数 `describeActivityDay`/`buildTimelineRows` 并保持 `items` 驱动计数与空态；本地 `npm run validate`、`coverage`（activities 行覆盖 98.16%）、`audit:all`（0 高危）全绿。main `c6d163a`，main CI [38110023518](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110023518) SUCCESS，微信开发版 [38110081492](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110081492) 日志确认「微信开发版 0.0.117.1（robot 1）上传成功」。N3 代码/CI/开发版齐备，仅余真机日期切换 smoke 与独立复核；完整日历视图明确留作同契约上的独立后续 UI 增量。分支治理：远端仅 `main`，#89–#116 功能分支合并后均删除；沙箱近期交付 worktree 残留本地分支核对为 squash 已合并内容后清理，本地 `fix/activity-image-upload-status` 经逐文件比对确认已被当前 main 的 `pendingImages` 逐张状态/独立重试（#95/#100）完整覆盖。其余 N1–N10 仍统一阻塞在真机/微信后台/真实外部授权证据，无可继续纯代码推进项。

- 2026-10-11 10:04 本轮对齐确认最新代码交付并补充运行态证据：[#113](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/113) 已合入 main `89cde00...`，将活动标题改为发布人必填、移除默认/快捷集合时间、保存时不再回退默认时间，并收口活动卡片等宽指标、去荧光强调、黑底按钮白字和中文化标签。main CI [38101620274](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38101620274) 与微信开发版 [38101695758](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38101695758) 均 success，日志确认上传 `0.0.114.1`；微信开发者工具官方 miniprogram-automator 22 项运行态检查全部通过，截图与结论存于 `docs/evidence/2026-10-11-title-card-smoke/`。该增量推进 N1/N10 与 UI 的代码、自动化和开发者工具运行态层，但仍缺物理真机创建/编辑保存重开、活动卡片视觉独立复核与用户人工确认，状态保持 `PENDING_EVIDENCE`。本轮已确认最近 50 个 merged PR 远端分支均已删除，并清理沙箱本地遗留分支；无可并行编码的 `READY`/`IN_PROGRESS` 项，剩余均为真机/微信后台/真实外部授权证据。

- 2026-10-11 06:35 本轮（定时对齐）再交付一条纯前端独立 PR 并上传微信开发版 `0.0.104.1`：[#103](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/103) 只读缓存支持冷启动持久化与断网兜底——回源成功后写入版本化 `wx` 同步存储，冷启动在 TTL 内直接复用并保留原始过期时刻；网络失败仅在 5 分钟离线窗口内返回上次数据，在线仍强制回源；活动/Strava 写入与账号切换同步清理内存和持久化命名空间，并新增命中率指标。PR `validate`、main CI [38091847664](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38091847664) 与微信开发版自动上传 [38091927615](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38091927615) 均 success。N7 已推进冷启动持久化/可观测部分，状态仍 `PENDING_EVIDENCE`，剩余“图片临时地址缓存及到期刷新”与真机冷启动/断网 smoke。另：共享工作区中存在他泳道未提交的“资料图片内容指纹去重”改动（`profile-edit/index.ts` + `profile-media-dedupe.test.ts`），本轮未触碰、未并入任何提交。真实阻塞维持不变：① 云函数部署需腾讯云凭证；② 大量条目需物理真机/真实验收。
- 2026-10-11 08:15 本轮交付 N7 最后一条纯代码增量并修正 N9 状态：[#111](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/111) 新增 `TempFileUrlCache`，内存缓存已解析图片临时地址，DataLoader 式合并同一事件循环内请求为一次批量调用、同 fileID 并发单飞去重、临期前自动判失效并在下次解析刷新，仅缓存合法 https 结果、失败不缓存；资料编辑页照片预览已接入。PR validate、main CI 与微信开发版自动上传均 success，版本 `0.0.112.1`（checkout `08d9739`）；无云函数改动，无需 CloudBase 部署。N7 的代码/单测层全部收口，仅剩真机冷启动/断网 smoke。另修正 N9 表格行（原误标 `READY`）为 `PENDING_EVIDENCE`，与其详情一致：固定稳定体验版入口与晋级/回退门禁演练（#81–#87）已完成，等待下一开发版做实际跨版本回退和固定入口业务 smoke。至此清单内 N1–N9 已无 `READY`/`IN_PROGRESS` 的纯代码可推进项，全部收敛到“真机/真实验收/微信后台”这一共同阻塞。
- 2026-10-11 07:45 本轮交付活动发布人展示并完成运行态验收：经核实“全员可发布”的服务端权限（普通用户创建草稿→发布自己草稿→下架自己活动，openid 绑定）与前端入口此前已具备，无需新增；[#109](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/109) 在 activity-read 按 created_by 批量解析发布人昵称与 canonical 头像，卡片与详情展示，资料缺失兜底“骑友”，并抽取共享 profiles/头像解析 helper 给参与人复用。PR validate、main CI 与微信开发版自动上传均 success，版本 `0.0.110.1`（checkout `5ddb021`）。activity-read 已通过 CloudBase CLI 部署，线上 list 调用回读真实活动返回 publisher（昵称“莫拉拉”、头像 profile-canonical）。N8 转 `PENDING_EVIDENCE`，仅剩真机 smoke/独立复核。所有 P0 及多数 P1 当前都处于“真机/真实验收”这一共同阻塞，代码、CI、部署、运行态回读层均已完成。
- 2026-10-11 06:55 本轮补齐图片去重链路并交付一条纯前端 PR：#100 活动图片指纹去重合并后曾因 #102 docs 抢跑被上传流程判为过期，已手动 `workflow_dispatch` 补传微信开发版 `0.0.103.1`（checkout `e1b35b2`，含 #100+#101）；[#105](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/105) 个人资料客户端会话内指纹去重（头像/背景共享指纹映射、跨槽位复用，取不到指纹回退完整链路，跨会话由云端 canonical 兜底），rebase 到 #104 后日志顺延 `2026.10.11.11`，PR `validate`、main CI 与微信开发版自动上传 [38092918041](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38092918041) 均 success，微信开发版 `0.0.106.1`（checkout `b6dddd41`）。另：#94 云函数 `activity-admin` 已通过本机 CloudBase CLI 部署到 `cloudbase-d0gizacy77a1ab017` 并回读 `MATCH: 线上与本地一致`，N6 的 CloudBase 部署阻塞解除。为避让并发泳道，本轮在独立 clone（`cili-profile-dedupe`）交付，原共享工作区 `cili-work-main` 已原样归还。N5 转 `PENDING_EVIDENCE`（仅剩真机弱网/CloudBase 回读）。真实阻塞收敛为：大量条目需物理真机/真实验收。

- 2026-10-11 05:50 本轮（定时对齐）再交付两条独立 PR 并上传微信开发版 `0.0.100.1`：#99 活动卡片滑动删除（接 #94 服务端删除契约）、#101 活动/Strava 内存 TTL 缓存与写后失效；两个 PR 的 PR checks、main CI 与微信开发版自动上传均 success。N6/N7 已推进到“已部署”层，状态 `PENDING_EVIDENCE`。**真实阻塞（需用户/环境决策）**：① 沙箱无 CloudBase CLI 与腾讯云凭证，#89/#94/#96 等改动的云函数（activity-read/activity-admin/registration/admin-review/profile）无法在沙箱部署，需要为沙箱配置腾讯云凭证或由用户确认部署；② 大量 `PENDING_EVIDENCE` 条目需物理真机/真实验收，代码与部署层不能替代。
- 2026-10-11 本轮（定时对齐）已完成四条独立 PR 并上传微信开发版 `0.0.97.1`：#94 活动删除服务端契约、#95 集合时间回显与图片往返、#96 资料必填与报名拦截、#97 分享卡片封面与朋友圈；四个 PR 的 main CI 与微信开发版自动上传均 success。四个条目均已推进到“已部署”层，真机 smoke/回读待做，状态统一为 `PENDING_EVIDENCE`；#94 的前端右滑 UI（分支 `fix/activity-card-swipe-delete`）已由另一泳道 `IN_PROGRESS`，#97 的活动群二维码作为剩余原子项保留在原条目。
- 本轮已完成并交付：HP-01 至 HP-05 已按完整证据链从清单删除；HP-06 已随 PR #56 合入并上传开发版，但其“深浅主题并存”产品前提已被新 UI 基线替代；HP-20261010-01 的旧浅色行程序号与三处运行态低对比过渡保护已随 PR #62/#66/#69 合入并上传开发版；HP-08 已随 PR #57 合入并交付开发版；HP-12 闰日算法已随 PR #59 合入。
- 当前最高优先级：清单内 N1–N10 已无 `READY` / `IN_PROGRESS` 的纯代码可推进项；下一步不是继续拆 PR 写代码，而是按条目补真实证据：N1 创建/编辑真机保存重开，N2 分享/二维码真机扫码替换，N3 真机日期切换复核（日期分组/快捷定位已由 #116 交付，完整日历另列后续增量），N4 资料与报名真机 smoke，N5 弱网与 CloudBase 回读，N6 真机手势，N7 冷启动/断网，N8 普通用户发布链路，N9 体验版晋级/回退与固定入口业务 smoke，N10 标题/时间/卡片与全量界面中文化真机抽查和用户确认。
- HP-20261010-02 进展：单一主题底座与第一批六页已推送至 main；head `4b27057...` 的 main CI run [38025995570](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38025995570) SUCCESS，微信开发版 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) 实际上传 `0.0.55.1`；375×812 开发者工具六页截图及 TabBar 图标复核通过。追加修复：报名凭证页 `credential/index.wxss` 曾残留深色主题硬编码色（`#f7f7f5`/`#a8a8ad`/`#9bc2aa`/`#e9a071` 等），`.serial`/`.hero-kicker` 还直接把 `--color-brand #d9ff43` 当文字色用，导致浅底对比度严重不足；已在 `tests/unified-bright-first-batch-contract.test.ts` 新增禁用深色色和 token 收口 RED，并把 wxss 收口为 `--color-text/--color-muted/--color-success-text/--color-raised/--color-border` 等 token，设置页追加 `2026.10.10.14 报名凭证页统一明亮主题` 升级日志；本地 Vitest 55 文件 738/738 全部通过。仍待物理真机截图与独立复核。
- HP-07 检查点：代码、全量本地/远端门禁、开发版 `0.0.52.1`（含后续 #73）、目标环境索引、`registration` Active 回读及线上代码比对已完成；仅余 50+ 真实报名页面 smoke 和独立复核，状态保持 `PENDING_EVIDENCE`。
- HP-13 检查点：`status` 根因修复已完成 main CI、开发版 `0.0.58.1`、CloudBase Active 回读、线上代码比对和设置页真实请求验证；原 `INTERNAL_ERROR` 已恢复为 `ok:true/state:syncing`。条目转为 `PENDING_EVIDENCE`，仅保留授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实外部生命周期 smoke。
- 并行状态：PR #61/#62/#63/#64/#66/#68/#69/#73 均已合入；HP-07 已解除代码文件族占用，`HP-20261010-02` 已开始推进。
- 责任边界：TraeX 执行者负责 `HP-20261010-02` 页面与组件实施；TraeX 审判者负责逐页尺寸对照、旧主题残留扫描、功能回归、CI/开发版和真机验收。Aime 个人助理完成本次清单对齐后退出，不再占用任何代码文件族。

## 当前处理顺序

| 泳道 | ID               | 优先级 | 状态                                     | 目标                                                                                    | 唯一写者      | 复核/发布                    |
| ---- | ---------------- | ------ | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| N1   | `HP-20261010-03` | P0     | `PENDING_EVIDENCE` (#95/#113, 开发版 0.0.114.1) | 时间回显、图片预览往返、标题必填与快捷时间移除均已交付，开发者工具 22 项运行态 E2E 通过，待真机 smoke 与独立复核 | Aime          | 独立复核 / 真机              |
| N2   | `HP-20261010-04` | P0     | `PENDING_EVIDENCE` (#97/#107, 开发版 0.0.108.1) | 分享卡片与活动群二维码已交付；待真机扫码/替换 smoke、独立复核，微信群待办/置顶能力待评估 | -             | 独立复核 / 真机              |
| N3   | `HP-20261010-05` | P0     | `PENDING_EVIDENCE` (#116, 开发版 0.0.117.1) | 14 天窗口（#89）与日期分组、快捷定位 UI（#116）均已交付，待真机日期切换 smoke 与独立复核（完整日历视图为独立后续增量） | -             | 独立复核 / 真机              |
| N4   | `HP-20261010-06` | P0     | `PENDING_EVIDENCE` (#96, 开发版 0.0.97.1) | 性别、头像、个人照片必填与报名拦截已交付，待真机资料/报名 smoke                          | Aime          | 独立复核 / 真机              |
| N5   | `HP-20261010-07` | P0     | `PENDING_EVIDENCE` (#100/#105, 开发版 0.0.106.1) | 活动图片指纹去重、资料图片会话内去重与失败恢复已交付，待真机弱网/CloudBase 回读 | Aime          | 独立复核 / 真机              |
| N6   | `HP-20261010-08` | P1     | `PENDING_EVIDENCE` (#94/#99, 开发版 0.0.106.1) | 删除契约、右滑 UI 与 activity-admin CloudBase 部署均已完成，待真机手势/独立复核          | Aime          | 独立复核 / 真机              |
| N7   | `HP-20261010-09` | P1     | `PENDING_EVIDENCE` (#101/#103/#111, 开发版 0.0.112.1) | 内存 TTL 缓存、冷启动持久化、断网兜底、命中率指标与图片临时地址缓存均已交付；仅剩真机冷启动/断网 smoke | Aime          | 独立复核 / 真机              |
| N8   | `HP-20261010-10` | P1     | `PENDING_EVIDENCE` (#109, 开发版 0.0.110.1) | 全员发布权限经核实已具备，卡片/详情发布人头像昵称已交付，activity-read 已部署并运行态回读，待真机 smoke/独立复核 | Aime          | 独立复核 / 真机              |
| N9   | `HP-20261010-11` | P1     | `PENDING_EVIDENCE`                       | 固定稳定体验版入口与晋级/回退门禁演练已完成（#81–#87），等待下一开发版做实际跨版本回退和固定入口业务 smoke | -             | 独立复核 / 微信后台          |
| N10  | `HP-20261011-01` | P0     | `PENDING_EVIDENCE` (#113/#118, 开发版 0.0.119.1) | 标题必填（草稿/发布一致）、移除默认与快捷集合时间、卡片去荧光/指标等宽/黑底白字已交付；#118 完成全量页面装饰英文清理（meta/kicker/角标/图标字母统一中文，新增禁用契约），开发者工具 22 项运行态 E2E 通过，待真机抽查、独立复核与用户确认 | Aime          | 独立复核 / 真机 / 用户确认 |
| UI   | `HP-20261010-02` | P0     | `PENDING_EVIDENCE`                       | 单一主题底座、第一批六页与活动卡片高对比收口已交付，待物理真机截图与独立复核             | -             | TraeX 审判者                 |
| B    | `HP-20261009-13` | P0     | `PENDING_EVIDENCE`                       | `status` 已恢复，待六条真实 Strava 授权/解绑生命周期 smoke                              | -             | TraeX 审判者 / Aime 个人助理 |
| D    | `HP-20261009-06` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧双主题全页对比度，不再单独实施                                                        | -             | TraeX 审判者                 |
| D1   | `HP-20261010-01` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧浅色主题与运行态低对比已随 #62/#66 补保护，最终由新 UI 统一收口                       | -             | TraeX 审判者                 |
| E    | `HP-20261009-07` | P1     | `PENDING_EVIDENCE`                       | 我的行程已交付开发版并完成部署回读，待 50+ 真实报名 smoke 和独立复核                   | Aime 个人助理 | TraeX 审判者                 |
| F1   | `HP-20261009-08` | P1     | `SUPERSEDED_BY(HP-20261011-01)`          | 旧相对快捷时间入口已被“集合时间完全由用户选择、无默认/快捷预设”新口径取代            | -             | TraeX 审判者                 |
| F2   | `HP-20261009-09` | P1     | `PENDING_EVIDENCE`                       | 选点恢复已交付开发版 `0.0.60.1`，待真机定位与微信后台复核                              | -             | TraeX 审判者                 |
| G1   | `HP-20261009-10` | P1     | `PENDING_EVIDENCE`                       | 单背景槽位协议客户端/服务端代码链路齐全，待部署回读与真实多图账号 smoke     | -             | TraeX 审判者                 |
| G2   | `HP-20261009-11` | P1     | `PENDING_EVIDENCE`                       | 个人中心头像点击预览已交付，待开发版 smoke 与独立复核                                       | -             | TraeX 审判者                 |
| H    | `HP-20261009-12` | P1     | `BLOCKED_BY(HP-20261009-13 smoke)`       | 闰日周年算法已随 #59 合入，待三函数部署、真实账号回读与真机验收                         | TraeX 执行者  | TraeX 审判者                 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。

## 事项明细

### HP-20261011-01 · 活动标题必填、集合时间无预设与卡片视觉收口

- 优先级/状态：P0 / `PENDING_EVIDENCE`；PR [#113](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/113) 已合入 main，PR validate 与 main CI 全绿，微信开发版 `0.0.114.1` 自动上传成功（checkout `89cde00`，[main CI 38101620274](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38101620274)、[开发版上传 38101695758](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38101695758) 均成功）。
- 用户口径（2026-10-11 07:44 群聊）：活动创建增加活动标题字段且由发布人填写；集合时间不给「明早七点 / 下周」之类默认提示，完全由用户选择；活动卡片字段对齐、去掉荧光色、黑底按钮白字；清理 App 界面英文文本。
- 已交付：标题为草稿/发布一致的必填输入（maxlength 100，与云函数 `activity-admin` 既有 title 必填契约一致，无 CloudBase 改动）；删除「明早 07:00 / 下周六 08:00」快捷预设、默认时间与自动生成标题；未选日期/时间分别精确报错且不回退默认值；发布缺集合地点 fail closed；卡片指标改按实际数量等宽排列、移除荧光强调、黑底按钮白字；编辑器与详情装饰性英文标签改中文；设置页新增 `2026.10.11.15` 发布日志。
- 验证：`npm run validate` 全绿（61 文件 798 测试）、coverage/audit 全绿；2026-10-11 09:42 微信开发者工具 miniprogram-automator 22 项运行态检查全部通过、零页面异常（含三层校验拦截、picker 选择回显、存量活动编辑回显、#109 发布人渲染复验），证据与截图见 `docs/evidence/2026-10-11-title-card-smoke/`。
- 关闭条件：物理真机走一遍创建（含错误提示）与编辑回显、卡片视觉人工确认、独立复核通过；用户确认标题必填口径。
- 更新时间：2026-10-11 10:04（CST）。

### HP-20261010-03 · 极简活动创建/编辑端到端闭环

- 优先级/状态：P0 / `PENDING_EVIDENCE`；PR [#95](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/95) 已合入并随开发版 `0.0.97.1` 上传成功，PR [#113](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/113) 已随开发版 `0.0.114.1` 上传成功；自动化端到端证据与开发者工具运行态证据齐全，尚未完成物理真机 smoke 与独立复核。
- 用户可见字段：活动标题（2026-10-11 07:44 用户确认改为发布人手填必填）、集合时间、集合地点、最多 3 张封面、备注、Strava 路线链接；标题不再由系统生成，集合时间不提供默认值与快捷预设；其余历史兼容字段继续在系统侧维护，不重新暴露旧复杂表单。
- 已修复：集合时间拆为日期、时间两个独立字段，不再注入默认 08:00，发布时分别必填校验，保存重开稳定回显；图片选择即本地预览，单张失败保留成功项并可独立重试，保存重开按数量与顺序完整回读；#113 进一步把标题改为必填输入（草稿/发布一致校验），移除「明早 07:00 / 下周六 08:00」快捷预设与自动生成标题，未选时间时终止保存而非回退默认时间，发布缺地点继续 fail closed。
- 验收范围：覆盖新建与编辑的标题输入、picker 选择、取消、跨日、保存、详情展示、重新编辑回显；图片覆盖选择、顺序预览、上传中、失败重试、删除/替换、保存回读；Strava 链接覆盖合法、非法、清空和重新编辑。上述已由 `tests/activity-admin-edit.test.ts` 端到端用例锁定（含跨日深夜场景）；2026-10-11 09:42 另用微信开发者工具 miniprogram-automator 对 #113 新代码做 22 项运行态检查全部通过（空标题/缺日期/缺地点三层拦截、picker 回显、存量活动编辑回显、零页面异常），证据见 `docs/evidence/2026-10-11-title-card-smoke/`。
- 关闭条件：同一 SHA 开发版、微信开发者工具与物理真机端到端 smoke、独立复核全部通过；自动化测试、main CI、开发版上传与开发者工具运行态 E2E 已完成。
- 更新时间：2026-10-11 10:04（CST）。

### HP-20261010-04 · 活动分享卡片、微信群触达与活动群二维码

- 优先级/状态：P0 / `PENDING_EVIDENCE`；分享卡片已随 [#97](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/97) 交付开发版 `0.0.97.1`，活动群二维码已随 [#107](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/107) 交付开发版 `0.0.108.1`（main CI [38094671694](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38094671694)、微信开发版 [38094753857](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38094753857) 均成功，日志含“微信开发版 0.0.108.1 上传成功”）。
- 当前事实：分享给好友/群已带活动封面 `imageUrl` 与标题（封面优先、其次首张图，仅 http/https 透传，cloud:// 或无封面安全降级），并支持分享到朋友圈；活动群二维码已完成可选字段、创建/编辑独立上传预览/删除替换、详情展示、7 天过期提示、云函数读写白名单与临时地址解析。微信群待办/置顶需按微信现有开放能力先做可行性验证，不能以普通分享冒充。
- 剩余交付：真机扫码/替换 smoke 与独立复核；群待办/置顶仅在平台接口和主体权限可用时接入，不可用时记录限制并提供明确替代路径。
- 关闭条件：真机分享给好友/群后卡片信息正确且可打开对应活动（自动化与部署已完成，待真机）；二维码可配置、查看、替换且异常可解释；群触达能力完成真实账号/真机验证和独立复核。
- 更新时间：2026-10-11 07:25（CST）。

### HP-20261010-05 · 首页未来两周活动预览

- 优先级/状态：P0 / `PENDING_EVIDENCE`；[#89](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/89) 交付 14 天查询窗口与边界测试（开发版 `0.0.88.1`），[#116](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/116) 交付日期分组与日期快捷定位（main `c6d163a`、开发版 `0.0.117.1`）；仅完整日历视图仍作为同一数据契约上的独立后续 UI 增量。
- 当前事实：首页未来列表已限定当前起 14 天、按集合时间升序（`_id` 稳定打破同刻），并按中国自然日插入「今天/明天/后天/M月D日 周X」分组头、多日时提供可点击的日期 chip 平滑定位；历史活动入口与分页保持不变。尚缺完整月历视图与真机日期切换回读。
- 产品口径：首页优先呈现从当前时刻起 14 天内的已发布活动，按集合时间升序并以 `_id` 稳定打破同刻排序；进行中、跨日、边界时刻、时区与无活动状态必须有明确规则，不破坏历史活动入口和分页。
- 交付拆分：14 天数据窗口与稳定排序（#89）→ 日期分组/快捷定位（#116）均已完成；完整日历作为同一数据契约上的独立 UI 增量，避免与列表/导航重写耦合。
- 关闭条件：14 天时间边界测试、50+ 数据分页无漏重、开发版与真机日期切换 smoke、独立复核全部通过；查询层自动化、分组/快捷定位自动化、main CI 与开发版上传均已完成，仅余真机日期切换 smoke 与独立复核。
- 更新时间：2026-10-11 12:02（CST，#116 已合入；main CI [38110023518](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110023518) SUCCESS；微信开发版 [38110081492](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38110081492) 上传 `0.0.117.1` 成功；#89 见 [38075238636](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38075238636) 与 `0.0.88.1`）。

### HP-20261010-06 · 个人资料最小必要字段与必填口径

- 优先级/状态：P0 / `PENDING_EVIDENCE`；[#96](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/96) 已合入并随开发版 `0.0.97.1` 上传，自动化与部署证据齐全，待真机资料/报名 smoke 与独立复核。
- 最终口径：性别、头像和个人照片均为必填；个人照片同时是个人页背景照片与骑行名片必备素材，不得被实现为可跳过的装饰字段。真实姓名、手机号、紧急联系人姓名和电话继续保持安全/报名链路所需校验；昵称等非核心字段不得阻断主流程。
- 已落地：客户端整表保存逐项校验并可操作提示；云函数按“存量资料 + 本次更新”的最终状态校验，头像单独即时更新不触发整套门禁，显式清空合法值被拒绝；报名前后端同步校验个人照片就绪。
- 数据兼容：与 `HP-20261009-10` 的单背景槽位协议保持一致；新用户必须完成一张个人照片，存量缺失账号进入可恢复补全流程，存量多图不被静默删除。
- 验收范围：空值、非法性别、默认头像、照片上传失败、保存重开、背景展示、骑行名片展示和存量账号迁移；客户端与服务端使用同一必填契约。相关 node:test/vitest 用例已锁定（头像单更、缺项拒绝、报名拦截）。
- 关闭条件：新旧账号均无数据丢失；必填提示可操作；背景和骑行名片真实展示；CloudBase 部署回读、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-11 04:35（CST）。

### HP-20261010-07 · 图片上传可用性与重复上传治理

- 优先级/状态：P0 / `PENDING_EVIDENCE`（活动侧 [#100](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/100)、资料侧 [#105](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/105)，开发版 `0.0.106.1`）。
- 已落地（活动图片，#100）：上传路径由时间戳随机名改为内容 md5 确定性路径 `profiles/activity-media/<digest>.<ext>`，已提交图片、待处理项与同批文件三处去重，失败重试复用同一 `cloudPath`；`wx.getFileInfo` 失败时降级随机路径保证可用性优先。
- 已落地（资料图片，#105）：头像与背景照片选图后取内容 md5，命中本次会话「指纹→fileId」映射则直接复用、跳过路径申请/上传/注册，头像与背景跨槽位共享映射；取不到指纹回退完整上传链路。跨会话重复由云端既有 canonical 内容哈希机制（`profile-canonical`）兜底，随机源对象由 cleanup intent 台账到期清理。
- 剩余增量：真机弱网与 CloudBase 回读（同一图片反复选择、断网重试、成功响应丢失等场景）以及独立复核；孤立对象审计清理依赖定期 cleanup 任务运行态证据。
- 关闭条件：选择即本地预览，上传进度与失败原因可见，可安全重试/删除/替换；重复选择不重复计费存储；孤立对象可审计清理；真机弱网、CloudBase 回读和独立复核通过。
- 更新时间：2026-10-11 06:55（CST）。

### HP-20261010-08 · 活动卡片右滑删除

- 优先级/状态：P1 / `PENDING_EVIDENCE`：服务端契约（[#94](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/94)）与前端右滑删除 UI（[#99](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/99)，开发版 `0.0.106.1`）均已合入；云函数 `activity-admin` 已通过 CloudBase CLI 部署到 `cloudbase-d0gizacy77a1ab017` 并回读 `MATCH: 线上与本地一致`，仅剩真机手势与独立复核。
- 已落地契约：`delete` action 仅发布者本人或管理员可调用；有 pending/approved/checked_in/waiting 报名或候补时禁止删除并说明原因；无报名时写入 `is_deleted` 逻辑删除，不物理删除活动、报名或媒体；重复请求幂等，不存在返回 `ACTIVITY_NOT_FOUND`；写入前二次校验报名以覆盖并发新增。
- 已落地交互：活动卡片向左滑动露出删除按钮并自动展开/收回，删除前二次确认、删除成功即时移除；非本人或云端拦截时展示原因，不只在前端数组移除。
- 关闭条件：真机手势、并发报名、重复删除、网络失败和撤销/恢复策略测试通过；列表/详情一致；真机手势与独立复核齐全（CloudBase 部署已完成）。服务端 node:test 用例已覆盖权限/占用/幂等/并发，前端 Vitest 已覆盖滑动/确认/云端拦截。
- 更新时间：2026-10-11 06:55（CST）。

### HP-20261010-09 · 活动、图片与 Strava 缓存

- 优先级/状态：P1 / `PENDING_EVIDENCE`（内存、冷启动持久化与图片临时地址缓存均已交付，[#101](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/101)/[#103](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/103)/[#111](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/111)，开发版 `0.0.112.1`）。
- 产品目标：活动列表/详情、已解析图片临时地址和 Strava 摘要减少重复请求，并保留显式刷新和过期恢复；缓存不是永久数据源，不能掩盖报名状态、权限、活动下架或 Strava 解绑变化。
- 已交付（内存增量）：新增 `CachingRepository` 装饰器与 `TtlCache`，对活动列表/分页/详情、Strava 状态/就绪摘要做 30s read-through 缓存并对并发相同读取去重；活动/报名写入清 `act:` 命名空间、Strava 写入清 `strava:` 命名空间，过期自动回源，openid 变化或身份失效清空全部缓存。Vitest 17 例覆盖命中/过期/容量/并发/失败/命名空间隔离。
- 已交付（冷启动持久化增量，#103）：新增版本化 `CacheStorage`（`WxCacheStorage` 用 `wx.*StorageSync` + 测试用 `MemoryCacheStorage`）；回源成功后持久化并保留原始过期时刻，冷启动 TTL 内直接复用；网络失败仅在 5 分钟离线窗口内返回上次数据，在线仍强制回源；活动/Strava 写入与账号切换同步清理持久化命名空间；新增命中率 `CacheMetrics`（含 `getMetrics/resetMetrics`）支撑可观测，手动刷新可由现有 `invalidate*` + 页面下拉刷新承接。Vitest 再增 14 例。
- 已交付（图片临时地址缓存，#111）：新增 `TempFileUrlCache`，内存缓存 fileID -> 仍有效临时地址；同一事件循环内的解析合并为一次 `getTempFileURL` 批量调用，同 fileID 并发解析单飞去重；临期前（默认提前 5 分钟）视为失效并在下次解析时刷新；仅缓存合法 https 结果，整批失败或异常结果不入缓存以便下次重试。资料编辑页照片预览（`loadPhotoPreviews`）已接入。Vitest 再增 7 例。
- 剩余增量：仅真机冷启动/断网 smoke 与独立复核（temp 地址会过期，缓存只做内存、不持久化）。
- 关闭条件：冷启动、热启动、弱网、离线、过期、手动刷新和账号切换测试通过；命中率可观察且不展示越权/陈旧数据；真机与独立复核齐全。代码与单测层（热启动/冷启动/过期/账号切换/图片临时地址）已全部满足，仅剩真机验收。
- 更新时间：2026-10-11 08:15（CST）。

### HP-20261010-10 · 全员发布活动与发布人展示

- 优先级/状态：P1 / `PENDING_EVIDENCE`（[#109](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/109)，开发版 `0.0.110.1`）。
- 权限核实：服务端 `activity-admin` 早已支持普通登录用户“创建草稿 → 发布自己草稿 → 下架自己活动”，openid 严格绑定（非本人返回 FORBIDDEN），前端创建入口也已对普通用户开放，故“全员可发布”无需新增改动。
- 已落地（发布人展示，#109）：`activity-read` 在 list/listPage/detail 按 `created_by` 批量解析发布人昵称与 canonical 头像临时地址随公开 DTO 返回；抽取 `loadProfiles`/`resolveAvatarTempUrls` 让参与人与发布人共用批量解析链路。活动模型新增 publisher，卡片与详情展示发布人头像昵称；资料缺失统一兜底“骑友”、空头像占位，不暴露手机号等隐私字段。
- 运行态证据：activity-read 已部署 CloudBase；线上 `list` 调用回读，真实活动返回 `publisher: { nickname: '莫拉拉', avatar_url: .../profile-canonical/...jpg }`；2026-10-11 09:42 的 #113 开发者工具运行态截图中，活动首页卡片继续展示发布人昵称与头像，复验 #109 前端渲染仍成立。
- 关闭条件：普通用户与管理员权限矩阵、草稿→发布→编辑链路、跨账号越权测试、真机 smoke 与独立复核齐全（CloudBase 部署与运行态回读已满足）。
- 更新时间：2026-10-11 07:45（CST）。

### HP-20261010-11 · 固定稳定体验版发布

- 优先级/状态：P1 / `PENDING_EVIDENCE`，真实体验版晋级与回退门禁演练已完成，等待下一开发版本做跨版本回退和固定入口业务 smoke。
- 当前事实：PR #81/#83/#85 已合入；开发版 `0.0.85.1`（SHA `4190831422cf1e22e41da513bd379ae43a6115ef`）已通过 CI `38072731639`、上传 `38072821382`、candidate `38072992383`、verified `38073187099` 并在微信公众平台回读为体验版。稳定清单已由 PR #87 入库；回退候选 `38073739247` 与 verified `38073860197` 已验证历史清单绑定和唯一审计记录，但因当前体验版本身就是该稳定基线，仍需在下一开发版本晋级后执行一次实际跨版本切换。
- 产品目标：群成员始终通过同一个稳定体验版入口使用已验收版本；开发版继续承载日常验证，不能自动覆盖体验基线。
- 交付要求：记录不可变 Git SHA、开发版版本、CI run、体验版设置人/时间和验收结论；只有门禁全绿且 smoke 通过的版本才可人工或受控晋级，失败可回退到上一稳定基线；二维码/入口变化须同步群内说明。
- 下一步：在下一次实际业务版本晋级后，回退到 `0.0.85.1` 完成跨版本切换；补固定入口核心业务 smoke 和独立复核。
- 关闭条件：完成一次真实晋级与跨版本回退，固定入口可访问，版本和 SHA 可回读，发布说明与责任边界明确并经独立复核。
- 更新时间：2026-10-11 02:00（CST）。

### HP-20261010-02 · 按确认稿统一全局 UI 并移除旧主题体系

- 优先级/状态：P0 / `PENDING_EVIDENCE`。单一亮色主题、主题切换入口清理与第一批六页迁移均已合入 main 并上传开发版 `0.0.55.1`；375×812 开发者工具截图与 TabBar 图标复核已通过，待物理真机截图和独立复核后再关闭。
- 产品基线：删除旧版布局，不再区分暗色/浅色；统一白色主背景、近黑文字、荧光黄绿色品牌色、2px 黑色描边、轻量硬阴影、大圆角卡片，禁止继续保留主题切换入口或双份主题样式。
- 尺寸基线：375×812px 画布；状态栏 20px、导航栏 44px、TabBar 56px + 安全区；左右边距 16px、8px 栅格；页面标题 24/32px、卡片标题 18/26px、正文 14/22px、辅助文字 12/18px；主按钮和输入框 48px 高、分段控件 40px 高、卡片圆角/内边距 16px、卡片间距 12px。
- 页面范围：活动首页、活动详情、创建活动、我的行程、个人中心、设置为第一批；随后覆盖报名、管理端、骑行能力卡和共享组件。必须保留当前真实功能、状态、分页、授权与异常恢复，不以效果图虚构功能。
- 实施拆分：先建立单一 token/基础组件和 App 壳层，再逐页迁移；同一时间只允许一个写者修改全局 token、导航和共享组件，页面迁移可在文件族不重叠时并行。（已完成：统一亮色主题与移除主题切换入口，见 #73）
- 开工证据：2026-10-10 12:42 已完成现有 14 页主题接线、全局 token、系统导航、TabBar、共享组件和第一批六页静态契约盘点；确认采用“单一主题底座 → 共享组件 → 六页迁移”的分批 TDD 方案，设计与计划分别固化到 `docs/superpowers/specs/2026-10-10-unified-bright-ui-design.md` 和 `docs/superpowers/plans/2026-10-10-unified-bright-ui.md`。
- 底座 RED/GREEN：新增 `tests/unified-bright-ui-contract.test.ts`，先证明系统栏、14 页运行时主题状态、设置页主题入口和双份 token 不符合新基线；现已固定白色系统栏与原生 TabBar、唯一明亮 token、48px 控件、40px 分段、16px 卡片圆角和硬阴影，并将 14 页主题同步逻辑收口为幂等系统外观应用。
- 旧体系清理：产品代码已无 `.theme-light/.theme-dark`、`themeClass`、主题切换入口和设置页主题预览死样式；页面首次绘制背景改为 `--color-bg`，旧双主题对比度测试已迁移为单一明亮 UI 契约。
- 底座门禁：Vitest 54 文件、728 项全部通过；`npm run typecheck`、`npm run lint`、`npm run format:check` 和 `git diff --check` 通过。
- 实施提交：设计与计划为 `0d4dfc7 docs(ui): plan unified bright interface`，单一主题底座为 `d565968 feat(ui): unify bright appearance foundation`，第一批六页迁移为 `14f5e1c feat(ui): migrate core pages to bright layout`；三层提交均已基于 `origin/main` 的 `75d6f2b` 完成重放并推送至 main。
- 第一批 RED/GREEN：新增 `tests/unified-bright-first-batch-contract.test.ts`，先以 6/6 失败锁定活动首页、详情、创建、我的行程、个人中心和设置的尺寸偏差；现已统一 16px 页面边距、48px 控件、40px 分段、16px 卡片圆角/内边距、12px 卡片间距和 2px 描边，并将 375px 创建页收敛为单列，设置页新增 `2026.10.10.10 / 统一明亮界面` 升级日志。
- 第一批本地门禁：整合 `origin/main` 的 `75d6f2b` 后再次执行 `npm run validate` 并全通过；Vitest 55 文件、734/734，旅程/证据 82/82，bootstrap/planner 58/58，上传链路 14/14，升级日志、全部云函数测试、部署包一致性和构建均通过。
- 第一批远端门禁：head `4b27057...` 的 main CI run [38025995570](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38025995570) SUCCESS；validate、coverage、CloudBase bootstrap 只读验证和高危依赖审计全部通过。微信开发版 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) SUCCESS，实际上传 `0.0.55.1`。
- 375×812 运行态复核：通过微信开发者工具官方 `miniprogram-automator` 逐页采集活动首页、详情、创建、我的行程、个人中心和设置截图，确认创建页为单列，页面无可见重叠、裁切或固定操作栏遮挡；证据和 SHA-256 校验基础存于 `docs/evidence/2026-10-10-unified-bright-ui/`。
- TabBar 复核：官方小程序截图中活动、行程、我的三组图标及选中态均正常；此前桌面级截图的破图仅出现在开发者工具嵌套 WebView 捕获层，重编译仍可复现，但不代表小程序内部资源加载失败。
- 第二批可读性修复（2026-10-10 17:12）：端到端扫描发现报名、活动详情、我的行程、管理端（reviews/review-detail/activity-edit）及通用 `state-view` 组件在浅底上残留荧光黄与近白文字（如 `.card-number`/`.eyebrow-title`/`.panel-code`/`.location-button`/`.state-retry`/报名页 `.section-label` 近白标题），对比度严重不足；已将这些文字收口到 `--color-text`/`--color-muted`，深色媒体面（照片 hero、骑行名片、`.rider-status` 弹窗）保持不变并由 `light-theme-color-calibration` 契约守护。同时设置页功能升级日志仅渲染最近 5 条（`VISIBLE_RELEASE_NOTES`），历史保留在数据数组与 Git。提交 `0071bb1`，Vitest 55 文件 740/740 全绿，`prettier --check`/`eslint`/`tsc` 通过。main CI run [38040428765](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38040428765) SUCCESS，微信开发版 run [38040488247](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38040488247) 实际上传 `0.0.73.1`。
- 第二批补强（2026-10-10 17:48，用户已确认修复）：追加 token 审计发现两处遗漏——资料编辑页 `.step-kicker`/`.avatar-preview-placeholder` 荧光黄贴白底，骑行名片 `.sync-button` 引用未定义变量 `--color-text-primary` 导致文字色失效；已分别收口到 `--color-text`。脚本比对全部 wxss 引用 token 与 `app.wxss` 定义，确认 `--color-text-primary` 为唯一未定义颜色 token，此类隐形文字风险清零；深色照片名片与媒体面保持不变。提交 `c60a47e`，Vitest 55 文件 740/740 全绿，`prettier --check`/`eslint`/`tsc` 通过。main CI run [38042509312](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38042509312) SUCCESS，微信开发版 run [38042576572](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38042576572) 实际上传 `0.0.75.1`。
- 活动卡片补强（2026-10-11 10:04）：[#113](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/113) 将活动卡片指标按实际数量等宽排列，移除荧光强调，黑底按钮统一白字，活动首页与详情装饰性英文改中文；main CI 与微信开发版 `0.0.114.1` 均成功。
- 当前占用：代码文件族已释放；仅等待第一批六页物理真机截图、活动卡片视觉独立复核与真机点按验收，证据齐全前保持 `PENDING_EVIDENCE`。
- 审核要求：TraeX 审判者按 375×812px 逐页核对布局、字体、卡片、触控区和安全区；扫描 `theme-light/theme-dark`、主题切换入口及旧硬编码残留；执行功能回归、CI、开发版上传和真机截图验收。
- 交付要求：产品代码同步设置页版本日志；独立 PR 保持单提交；CI 全绿；微信开发版上传；第一批六页逐页真机截图与基准尺寸对照通过后才可关闭。
- 更新时间：2026-10-11 10:04（第二批浅底可读性修复、补强、活动卡片高对比收口与升级日志均已交付开发版，第一批六页仍待物理真机截图和独立复核）。

### HP-20261009-06 · 浅色主题全页对比度

- 优先级/状态：P1 / `SUPERSEDED_BY(HP-20261010-02)`。
- 已有证据：PR [#56](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/56) 已合入 main，CI 与开发版 `0.0.36.1` 成功；这些改动在新版 UI 落地前继续提供可读性保护。
- 产品决策：用户已取消深浅主题区分，因此不再沿旧双主题基线补 320px 截图或新增样式修复；可复用的高对比语义色应收口进 `HP-20261010-02` 的单一 token 体系。
- 退出条件：新版 UI 完成旧主题入口/类名/token 清理并通过统一主题真机验收后，随 `HP-20261010-02` 一并删除本条。
- 更新时间：2026-10-10。

### HP-20261010-01 · 浅色模式“我的行程”RIDE 序号对比度不足

- 优先级/状态：P1 / `SUPERSEDED_BY(HP-20261010-02)`。
- 已知现象：旧浅色主题下 `RIDE 1` 序号与白色卡片对比不足；该问题仍需在新版“我的行程”卡片中避免。
- 已处理证据：PR [#62](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/62) 已把旧浅色主题 `.card-index` 接入 `--color-muted`；PR [#66](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/66) 收口三处运行态低对比；PR [#69](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/69) 阻止全局浅色样式覆盖名片指标。#69 main CI run [38022806890](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38022806890) 与微信开发版 run [38022867777](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38022867777) 均 SUCCESS，开发版 `0.0.48.1` 上传成功。
- 产品决策：旧浅色主题已有过渡保护，但不再追加旧主题专项验收；由 `HP-20261010-02` 使用统一弱文字 token，并由 TraeX 审判者按真实卡片背景验证普通文字对比度 ≥4.5:1。
- 更新时间：2026-10-10。

### HP-20261009-07 · 我的行程保留全部历史、已完成和下架活动

- 优先级/状态：P1 / `PENDING_EVIDENCE`；代码与目标环境部署回读已完成，报名/行程文件族解除写入占用。
- 用户报告：历史已完成或下架活动不能从用户行程消失，也不能变成异常。
- 实现结果：保留旧 `mine` 数组协议并新增 `minePage`；按 `created_at DESC + _id DESC` 稳定分页，仓储层透明聚合且严格拒绝异常 envelope、重复 cursor/ID；页面仅依赖 owner-bound 活动投影，`draft`、软删和物理缺失均降级为可解释历史活动，缺失活动仍可取消并写审计。
- 设计/计划证据：推荐方案已固化到 `docs/superpowers/specs/2026-10-10-registration-history-pagination-design.md`，TDD 步骤已固化到 `docs/superpowers/plans/2026-10-10-registration-history-pagination.md`；采用兼容式 `minePage`、`created_at + _id` 稳定游标、仓储层透明聚合和 owner-bound 活动投影，旧 `mine` 数组协议保持不变；活动物理缺失时允许本人取消并写审计，但不回写不存在的名额。
- TDD RED：`npm --prefix cloudfunctions/registration test` 按预期因 `Cannot find module './mine-page'` 失败，既有 14 项报名测试继续通过；新测试已锁定 101 条分页、同时间戳 binary `_id` 顺序、非法游标及 `published/finished/draft/is_deleted/物理缺失` 活动投影。
- TDD GREEN：已新增兼容式 `minePage`、严格不透明游标和安全活动投影；`npm --prefix cloudfunctions/registration test` 18/18 通过，101 条及同时间戳分页均无漏重，旧 `mine` 保持不变。
- 取消 RED：`npm --prefix cloudfunctions/shared test` 按预期 23/24 通过；活动实体缺失场景以 `SCHEMA_INVALID / 活动名额计数异常` 失败，证明异常可复现；同一测试同时锁定现存畸形活动不得绕过校验。
- 取消 GREEN：仅在活动实体不存在时跳过名额与候补回写，报名更新和审计仍处于同一事务；共享领域 24/24、报名函数 18/18 及云函数部署包一致性校验通过，正常活动与现存畸形活动合同不变。
- 客户端 RED：`npx vitest run tests/cloud-repository.test.ts tests/tab-page-refresh.test.ts` 按预期 164/168 通过；4 项失败分别证明仓储层仍按旧数组解析且只请求 1 页，以及页面仍被公开活动列表失败拖垮。
- 客户端 GREEN：仓储层现以严格 envelope 透明聚合所有 `minePage`，拒绝重复 cursor、重复 ID、异常字段和超过 200 页；“我的行程”已移除公开活动列表调用。focused Vitest 3 文件 171/171 通过。
- 索引 RED：`node --test scripts/bootstrap-cloudbase.node-test.mjs` 按预期 27/28 通过，新断言因 `registrations_openid_created_at_id` 缺失而失败。
- 索引 GREEN：bootstrap 已新增 `openid ASC + created_at DESC + _id DESC` 复合索引，托管基线更新为 13 集合、32 索引；schema/README/初始化手册已同步，bootstrap 28/28 通过。
- 门禁进展：`npm run audit:all` 已通过，12 个依赖树均为 0 vulnerability；首轮 `npm run validate` 在 typecheck 发现 `tests/registration-history.test.ts` 的 Cloud API mock 参数类型过窄，已修正为真实 `data?: unknown` 签名，产品运行代码未受影响。
- 发布日志 RED：整合远端 main 后，第二轮 `validate` 已通过 lint、typecheck、Vitest 737/737、旅程证据 82/82、bootstrap 58/58、上传链路 14/14，按预期停在升级日志缺失门禁；远端已占用 `2026.10.10.8`，`tests/settings-page.test.ts` 改以 `2026.10.10.9` 锁定“我的行程完整保留”最新日志。
- 发布日志 GREEN：设置页已新增 `2026.10.10.9 / 我的行程完整保留`，保留远端 `2026.10.10.8 / 骑行名片指标恢复深色媒体面` 并下沉为历史日志；focused 5/5 与发布日志门禁通过。
- 本地最终门禁：基于远端 #68/#69 的合并基线，`npm run validate` 全通过；Vitest 738/738、旅程/证据 82/82、bootstrap/planner 58/58、上传链路 14/14，云函数测试、部署包一致性和构建均通过；`npm run audit:all` 的 12 个依赖树均为 0 vulnerability。
- 部署证据：目标环境索引 apply requestId `aa271a73-b190-4329-8b4b-37f9eb9dcb83`，bootstrap verify 为 13 集合/32 索引且不符合项 0；`registration` 回读为 `Active`，更新时间 `2026-10-10 12:06:42`，requestId `8f0b635a-554a-4b15-b886-14d8b4f01d35`；线上 `$LATEST` 与本地部署包逐文件无差异。
- 远端交付：main SHA `d9d9f777450a33a6cccb664028b588b9aaade789` 的 CI run [38023441280](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023441280) SUCCESS；同 SHA 上传 run [38023517201](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023517201) SUCCESS，开发版 `0.0.49.1` 上传成功。
- 下一步：使用 50+ 真实报名完成页面总数、首尾记录、下架/删除/缺失展示和取消 smoke，并由 TraeX 审判者独立复核；证据齐全前不删除本条。
- 负责人：Aime 个人助理；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：全部报名可分页且无漏重；历史/下架/软删/缺失活动可解释展示；公开活动接口失败不影响行程；`registration` 部署回读、50+ 真实数据 smoke、CI 与独立复核齐全。
- 更新时间：2026-10-10。

### HP-20261009-08 · 创建活动时间快捷选择

- 优先级/状态：P1 / `SUPERSEDED_BY(HP-20261011-01)`；相对快捷项前置提示曾随 PR [#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57) 合入 main 并交付开发版，但 2026-10-11 用户新口径明确集合时间不要「明早/下周」类默认或快捷提示。
- 用户报告：创建活动的时间需要控件和快捷选择，且点了没反应时要有交代；后续新口径要求时间完全由用户选择，因此本旧项不再独立实施。
- 历史代码/CI：PR #48 曾加入 picker 与“明早 07:00、下周六 08:00、开始后 4 小时、开始前 1 天 20:00”等快捷项；PR #57 修复相对快捷项在开始时间为空/非法时静默无动作的问题；PR #113 已删除创建表单中的明早/下周快捷预设和默认时间。
- 远端证据：#57 main CI run [38017029088](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017029088) SUCCESS，开发版 `0.0.37.1` 已上传；#113 main CI 与开发版 `0.0.114.1` 均成功。
- 取代说明：旧“快捷时间可用性”关闭为被新产品基线取代；创建/编辑 picker 保存重开与无默认值验收改由 `HP-20261011-01` 和 `HP-20261010-03` 承接。
- 关闭条件：无单独关闭动作；确认 `HP-20261011-01` 的真机验收和用户确认后，本条可随被取代项一并删除。
- 更新时间：2026-10-11 10:04。

### HP-20261009-09 · 创建活动地点快捷选择与权限恢复

- 优先级/状态：P1 / `PENDING_EVIDENCE`（HP-08 代码门禁已满足）。
- 用户报告：地点快捷选择应位于输入框右侧。
- 代码/CI：PR #48 已把起终点“地图选点”放到输入框右侧，并保留坐标回填、手改文字清坐标与服务端范围校验。
- 确认缺口：微信现行规则下 `chooseLocation` 已不再需要 `scope.userLocation`，不得新增会扩大隐私范围的 `wx.authorize/getSetting/openSetting`；当前取消、系统定位关闭、接口/隐私配置失败和保存中竞态仍未覆盖。
- 设计：采用 `docs/superpowers/specs/2026-10-10-activity-location-recovery-design.md` 的直接选点状态机；`app.json` 保持仅声明 `requiredPrivateInfos: ["chooseLocation"]`，后台接口开通和“用户选择的位置信息”隐私用途纳入发布验收。
- TDD RED：tests-only 提交 `213eb4c` 增加取消、系统定位关闭、平台配置错误、重复选点、保存互斥、WXML 状态和最小隐私边界合同；focused 10 项中 4 项按预期失败、6 项既有行为通过，失败原因均为状态机尚未实现。
- TDD GREEN：提交 `401afca` 增加单一 `choosingLocation` 状态、稳定错误分类及选点/保存互斥，不新增精确定位 scope；focused 10/10、活动编辑/详情导航/统一 UI 相邻回归 59/59、typecheck、lint 和相关格式检查通过。
- 本地交付证据：发布说明 `2026.10.10.13` 随提交 `fd9edf3` 完成 RED→GREEN；`npm run validate` 全绿，包含前端 737/737、旅程证据 82/82、bootstrap 58/58、部署链路 14/14、全部云函数、部署包一致性和 14 页构建。微信开发者工具创建页回读 `allowed=true/isAdmin=true/loading=false/error=""`，`choosingLocation=""`，两个右侧选点按钮均为 68×48px 且可用，保存按钮可用。
- 远端交付证据：main CI run [38028452090](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38028452090) SUCCESS；同一 head `65f46cc...` 的开发版 run [38028513962](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38028513962) 实际上传 `0.0.60.1`。
- 下一步：仅保留创建/编辑真机选点、系统定位关闭恢复、保存重开、详情导航、后台接口开通和“用户选择的位置信息”隐私指引独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；隐私配置/真机：Aime 个人助理。
- 关闭条件：创建/编辑均可从右侧选点并持久化坐标；拒绝后有可操作恢复路径；手改文本不提交旧坐标；活动详情真实导航成功；CI、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-10 13:45（CST）。

### HP-20261009-10 · 单背景图与预览的数据安全闭环

- 优先级/状态：P1 / `PENDING_EVIDENCE`，代码链路已完成，仅待部署回读与真实账号 smoke。
- 用户报告：个人只允许一张背景图片，并需要背景预览。
- 已确认设计：采用 `docs/superpowers/specs/2026-10-10-profile-background-slot-design.md` 的显式可空 `background_photo` 单槽位；旧 `photos` 保留为只读历史审核媒体。字段缺失时只做首图兼容回退；新客户端只写槽位；旧客户端零/单图写入转换为槽位更新且不覆盖历史数组；管理员按"当前背景、历史媒体、头像"去重后最多三张。
- 服务端 TDD 进展：已完成显式槽位合同、旧协议转换、存量多图引用保护、cleanup 活引用保护，以及个人名片/管理员审核媒体视图分离；个人名片只展示有效背景槽位，缺失字段才回退首张合法 legacy photo，显式 `null` 不回退；管理员按"当前背景、legacy 骑行、legacy 其他、头像"去重并封顶三张。
- 引用闭环：`profile/store.js` 的 `profileReferencesMedia`、`strava-auth/store.js` 的 disconnect 保留集、`strava-callback/index.js` 的换绑 `retainedByPhotos`、`admin-review/index.js` 的 `profileMediaIds` 都把 `background_photo.file_id` 纳入；对应 RED→GREEN 测试已验证。
- 客户端进展：`models/Profile/ProfileUpdate` 已加 `backgroundPhoto`；cloud repo 严格 map `background_photo`（显式 null 支持、非法分类拒绝）并序列化为 `background_photo`；mock repo 保留 legacy photos；`profile-edit/index.ts` 的 `addPhoto` 写入 `backgroundPhoto`，`save` 发送 `background_photo` 单槽位且不再发送 `photos`；`docs/cloudbase-schema.md` 和设置页 `2026.10.10.15 个人背景图单槽位协议` 已同步。
- 聚焦门禁：`profile` 98/98、`profile-media-cleanup` 37/37、`admin-review` 28/28、`strava-auth` 30/30、`strava-callback` 18/18；客户端 Vitest 55 文件 739/739；typecheck + lint 通过。
- CloudBase 部署与回读（2026-10-10 15:45–15:48，本机已登录 `@cloudbase/cli@3.8.4`）：`profile`、`admin-review`、`strava-auth`、`strava-callback`、`profile-media-cleanup` 五个函数 `fn deploy --force` 全部 success；`fn list` 回读五者均 `Active`（profile 15:45:01、admin-review 15:45:38、strava-auth 15:46:21、strava-callback 15:47:00、profile-media-cleanup 15:48:05）。`fn code download` 下载线上 `$LATEST` 后，与本地部署包 `diff -r`（排除 node_modules/package-lock）五函数全部零差异，核心 9 文件逐字节一致。`bootstrap-cloudbase --verify` 通过（13 集合、索引不符合项 0）。`fn invoke profile {"action":"get"}` 返回 `UNAUTHENTICATED`（requestId `59400f24-873e-4c68-8f74-848bcc47e5fa`，3ms），证明部署版可运行且入口鉴权 fail-closed。
- 下一步：剩存量多图账号真实 smoke（微信端打开→保存→历史相册不丢失，替换→旧槽位降级）与 TraeX 审判者独立复核；CLI invoke 无微信 WXContext 无法覆盖业务数据链路。
- 真机 smoke（2026-10-10 16:23，`miniprogram-automator@0.12.1` 连 `cli auto` 端口 9420，设备 HUAWEI Mate 70 Pro / 基础库 3.17.4）：真实账号 `profile-edit` 加载到 `backgroundPhoto={id:cloud://...,category:ride}`、`photos.length=1`，save payload 字段 `["gender","emergencyName","backgroundPhoto"]` 且 `hasPhotos=false`；注入 3 张 legacy photos 的存量账号 `photos.length=3` 原样保留、payload 仍只含 `backgroundPhoto`（=首张 legacy，category 规整 ride）、`hasPhotos=false`，证明旧账号保存不截断历史相册。证据与截图存于 `docs/evidence/2026-10-10-profile-smoke/`。仅剩 TraeX 审判者物理真机点按独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：新用户只能添加/替换一张背景；编辑页与个人中心可预览；两张输入被拒；存量多图无未经确认的数据丢失；`profile` 部署、真机 smoke、CI 与复核齐全。
- 更新时间：2026-10-10 16:24（CST）。

### HP-20261009-11 · 个人中心头像预览不可用

- 优先级/状态：P1 / `PENDING_EVIDENCE`，代码已交付，待开发版和真机复核。
- 用户报告：头像预览不可用。
- 代码：`miniprogram/pages/profile/index.wxml` 的 `avatar-image` 新增 `bindtap="previewAvatar"`；`index.ts` 的 `previewAvatar` 严格校验合法 HTTPS 临时 URL（cloud://、http:// 或空值均 fail closed），复用现有 `heroAvatarUrl`。编辑资料页既有预览保留不变。
- 测试：`tests/profile-page.test.ts` 新增模板断言 `bindtap="previewAvatar"` 和四种输入分支（合法 HTTPS、空、cloud://、http://）；全量 Vitest 55 文件 740/740 通过。
- 发布：设置页追加 `2026.10.10.16 个人中心头像可预览` 升级日志。
- 下一步：push → main CI → 开发版上传；真机 smoke（已登录头像点击、未登录空占位 → 不触发预览）；由 TraeX 审判者独立复核后转关闭。
- 真机 smoke（2026-10-10 16:23，`miniprogram-automator@0.12.1` 连 `cli auto` 端口 9420，设备 HUAWEI Mate 70 Pro / 基础库 3.17.4）：部署页面 `previewAvatar` 处理器存在；拦截 `wx.previewImage` 统计四分支——`https://` 触发预览（current=该 URL），`''`/`cloud://`/`http://` 均不触发，`totalCalls=1`，fail-closed 生效；当前无头像账号渲染占位、不渲染 `.avatar-image`，符合预期。证据存于 `docs/evidence/2026-10-10-profile-smoke/`。仅剩物理真机点按独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：个人中心和编辑页均可预览头像；异常输入不调用预览且不崩溃；测试、同 SHA 开发版 smoke 与独立复核齐全。
- 更新时间：2026-10-10 16:24（CST）。

### HP-20261009-12 · Strava 年限正确性、存量回填与部署

- 优先级/状态：P1 / `BLOCKED_BY(HP-20261009-13 smoke)`；客户端闰日周年算法已随 PR [#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 合入 main。
- 用户报告：根据 Strava 获取骑行年限的功能为何未上线，代码是否合并。
- 代码/CI：账号年限取自 Strava athlete `created_at`，已进入 main 并通过 CI；它表示 Strava 账号年龄，不是完整现实骑龄。#59 按目标年份当月最后一天收敛周年日，修复 `2020-02-29 -> 2021-02-28` 少算一年的问题。
- 证据缺口：三个云函数部署须等 HP-13 smoke；存量快照可能缺 `athlete_created_at`，缺真实同步回读；缺真机显示验收。
- 下一步：HP-13 smoke 通过后部署同一 SHA 的三个函数；定义存量账号自动回填或一次性重新授权策略并真实回读。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：周年与闰日测试通过；三个函数 Active 版本可回读；真实账号同步后回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`；新旧账号真机显示正确且无需反复授权。
- 更新时间：2026-10-10。

### HP-20261009-13 · 设置页 Strava 授权撤销与异常生命周期

- 优先级/状态：P0 / `PENDING_EVIDENCE`，生命周期代码已随 PR [#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53) 合入 main；阻断真实 smoke 的 `status` INTERNAL_ERROR 已完成修复、部署与线上回读，仅余真实外部授权生命周期验收。
- 当前事实：merge SHA `490044dd91194f9cd643c43700f97ae1ffaa74d3` 实现 attempt generation/fencing；disconnect 原子推进代际并消费全部未消费 state；callback 对乱序、解绑竞态和同步竞态 fail closed；`access_denied/error` 消费 state 并落稳定拒绝状态；readiness 按 scope/token/config/network 返回 `reauthorize/disconnect/contact-support/retry`；客户端仅按 recovery action 展示动作且不自动重跑 failed；解绑明确为本地断开，并降级所有未被 profile 引用的 Strava 媒体。
- 证据/阻断：PR #53 `validate` SUCCESS；main CI run `38010547930` SUCCESS；微信开发版 run `38010624339` 成功上传 `0.0.32.1`；2026-10-10 已下载线上 `strava-auth/strava-callback` 代码与基线比对一致。诊断将旧失败请求 `ae45d0b8-ade6-4a16-8eec-6f343cda303e` 定位为 `read-readiness/-1`；修复部署后新请求 `7849fefc-1c0f-48d0-b3e6-6e04541ee476` 返回 `ok:true/state:syncing` 且无失败告警。剩余六条 smoke 涉及真实 Strava 登录、拒绝或凭证状态变化，不能以本地测试或数据库造数替代。
- 诊断补丁：提交 `672cb5f` 新增可注入 `createHandler`，为身份、过期 state 清理、readiness 读取及后续动作标记阶段；仅对最终映射为 `INTERNAL_ERROR` 的异常记录 `{action, stage, code}`，不记录 openid、令牌或原始错误正文，客户端仍返回统一错误。节点测试已完成 RED→GREEN，`strava-auth` 27/27 通过；最终 `npm run validate` 全绿，包含格式、lint、typecheck、前端 734/734、旅程证据 82/82、bootstrap 58/58、部署链路 14/14、全部云函数、部署包一致性和构建。
- 根因修复：提交 `31404ce46723` 在 `maybeGet` 中复用已由 profile 验证的严格文档缺失判定，仅当 `-1/-502001` 同时包含明确 document missing 语义时返回空记录；真实错误形态和通用 `-1` 失败关闭均有测试保护，focused 29/29 已通过。提交前 `npm run validate` 全绿：前端 734/734、旅程证据 82/82、bootstrap 58/58、部署链路 14/14、全部云函数、部署包一致性和构建均通过。
- 下一步：执行授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实 smoke，并由独立复核者确认日志与数据库不变量。
- 负责人：TraeX 执行者；安全/独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：解绑后所有旧 callback 被拒绝且凭证不复活；拒绝授权消费 state 并停止轮询；retry/reauthorize/disconnect/contact-support 由稳定服务端语义驱动；`strava-auth/callback` 部署回读；六条真实 smoke 通过。
- 更新时间：2026-10-10 13:34（CST）。

## 并行边界

- 新增 N1（极简创建）与既有 F1/F2 共享活动编辑页，必须串行；N2（分享/二维码）优先使用详情页与独立媒体字段，若触及活动编辑页则避开 N1/F1/F2。
- 新增 N4（资料必填）、N5 的个人照片上传部分与既有 G1/G2 共享个人资料和媒体协议，必须串行；活动封面上传可在确认云存储幂等/清理协议后由独立文件族并行。
- 新增 N6 先做服务端删除契约，再做卡片手势；N8 的发布者权限/活动写接口与 N6 共享活动服务端契约，单写者串行。N3 首页窗口、N7 缓存、N9 发布流程在不修改上述共享文件时可并行。
- 泳道 B（HP-13）先处理授权安全；HP-12 的客户端周年算法可并行，但 Strava/Profile 云函数统一部署必须在 HP-13 代码复核与真实 smoke 后。
- 泳道 D（HP-06、HP-20261010-01）、E（HP-07）文件边界独立，可并行；HP-20261010-01 与 #56 后续复核共享浅色主题验收，串行收口。
- 泳道 F（HP-08→09）共享活动编辑页，单写者串行；泳道 G（HP-10→11）共享个人资料页，单写者串行。
- Aime 个人助理只在不可变 SHA 通过独立复核后执行目标环境部署和真实 smoke；部署证据不得替代代码复核，开发版上传不得替代 CloudBase 部署。
