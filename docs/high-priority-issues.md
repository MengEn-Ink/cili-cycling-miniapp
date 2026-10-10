# 高优问题清单

> 最后更新：2026-10-10 23:56（CST）
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

## 当前工作交接检查点

- 本轮已完成并交付：HP-01 至 HP-05 已按完整证据链从清单删除；HP-06 已随 PR #56 合入并上传开发版，但其“深浅主题并存”产品前提已被新 UI 基线替代；HP-20261010-01 的旧浅色行程序号与三处运行态低对比过渡保护已随 PR #62/#66/#69 合入并上传开发版；HP-08 已随 PR #57 合入并交付开发版；HP-12 闰日算法已随 PR #59 合入。
- 当前最高优先级：优先完成 `HP-20261010-03` 至 `HP-20261010-07` 五个新增 P0；其中 `HP-20261010-03` 已有 #78 代码与开发版基线，先补创建/编辑保存重开的端到端证据并修复实测缺陷，其余四项按文件族独立开工。既有 `HP-20261010-02`、`HP-20261009-13` 继续等待物理真机或真实外部授权证据，不阻塞无文件冲突的新任务。
- HP-20261010-02 进展：单一主题底座与第一批六页已推送至 main；head `4b27057...` 的 main CI run [38025995570](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38025995570) SUCCESS，微信开发版 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) 实际上传 `0.0.55.1`；375×812 开发者工具六页截图及 TabBar 图标复核通过。追加修复：报名凭证页 `credential/index.wxss` 曾残留深色主题硬编码色（`#f7f7f5`/`#a8a8ad`/`#9bc2aa`/`#e9a071` 等），`.serial`/`.hero-kicker` 还直接把 `--color-brand #d9ff43` 当文字色用，导致浅底对比度严重不足；已在 `tests/unified-bright-first-batch-contract.test.ts` 新增禁用深色色和 token 收口 RED，并把 wxss 收口为 `--color-text/--color-muted/--color-success-text/--color-raised/--color-border` 等 token，设置页追加 `2026.10.10.14 报名凭证页统一明亮主题` 升级日志；本地 Vitest 55 文件 738/738 全部通过。仍待物理真机截图与独立复核。
- HP-07 检查点：代码、全量本地/远端门禁、开发版 `0.0.52.1`（含后续 #73）、目标环境索引、`registration` Active 回读及线上代码比对已完成；仅余 50+ 真实报名页面 smoke 和独立复核，状态保持 `PENDING_EVIDENCE`。
- HP-13 检查点：`status` 根因修复已完成 main CI、开发版 `0.0.58.1`、CloudBase Active 回读、线上代码比对和设置页真实请求验证；原 `INTERNAL_ERROR` 已恢复为 `ok:true/state:syncing`。条目转为 `PENDING_EVIDENCE`，仅保留授权成功、拒绝、scope 不足、token 失效、重新授权、解绑后旧 callback 六条真实外部生命周期 smoke。
- 并行状态：PR #61/#62/#63/#64/#66/#68/#69/#73 均已合入；HP-07 已解除代码文件族占用，`HP-20261010-02` 已开始推进。
- 责任边界：TraeX 执行者负责 `HP-20261010-02` 页面与组件实施；TraeX 审判者负责逐页尺寸对照、旧主题残留扫描、功能回归、CI/开发版和真机验收。Aime 个人助理完成本次清单对齐后退出，不再占用任何代码文件族。

## 当前处理顺序

| 泳道 | ID               | 优先级 | 状态                                     | 目标                                                                                    | 唯一写者      | 复核/发布                    |
| ---- | ---------------- | ------ | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| N1   | `HP-20261010-03` | P0     | `READY`                                  | 极简活动创建/编辑完成时间回显、图片预览与保存重开的端到端闭环                           | -             | 独立复核 / 真机              |
| N2   | `HP-20261010-04` | P0     | `READY`                                  | 活动分享卡片、微信群待办/置顶能力评估与活动群二维码闭环                                 | -             | 独立复核 / 真机              |
| N3   | `HP-20261010-05` | P0     | `PENDING_EVIDENCE`                       | 14 天数据窗口已随 #89 交付开发版 `0.0.88.1`，待日期分组/快捷入口与真机复核                 | -             | 独立复核 / 真机              |
| N4   | `HP-20261010-06` | P0     | `READY`                                  | 收口个人资料最小必填字段；性别、头像和个人照片不得降级为选填                            | -             | 独立复核 / 真机              |
| N5   | `HP-20261010-07` | P0     | `READY`                                  | 恢复活动与资料图片上传，补预览、失败恢复和重复上传治理                                  | -             | 独立复核 / CloudBase         |
| N6   | `HP-20261010-08` | P1     | `READY`                                  | 活动卡片右滑删除；先建服务端契约，有报名时禁止删除，无报名时逻辑删除                    | -             | 独立复核 / CloudBase         |
| N7   | `HP-20261010-09` | P1     | `READY`                                  | 为活动、图片与 Strava 建立可失效、可刷新的缓存                                          | -             | 独立复核 / 真机              |
| N8   | `HP-20261010-10` | P1     | `READY`                                  | 所有登录用户可发布活动，并在活动卡片展示发布人头像和昵称                                | -             | 独立复核 / CloudBase         |
| N9   | `HP-20261010-11` | P1     | `READY`                                  | 建立固定稳定体验版入口、版本晋级和可追溯发布流程                                        | -             | 独立复核 / 微信后台          |
| UI   | `HP-20261010-02` | P0     | `PENDING_EVIDENCE`                       | 单一主题底座与第一批六页已交付开发版 `0.0.55.1`，待物理真机截图与独立复核                 | -             | TraeX 审判者                 |
| B    | `HP-20261009-13` | P0     | `PENDING_EVIDENCE`                       | `status` 已恢复，待六条真实 Strava 授权/解绑生命周期 smoke                              | -             | TraeX 审判者 / Aime 个人助理 |
| D    | `HP-20261009-06` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧双主题全页对比度，不再单独实施                                                        | -             | TraeX 审判者                 |
| D1   | `HP-20261010-01` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧浅色主题与运行态低对比已随 #62/#66 补保护，最终由新 UI 统一收口                       | -             | TraeX 审判者                 |
| E    | `HP-20261009-07` | P1     | `PENDING_EVIDENCE`                       | 我的行程已交付开发版并完成部署回读，待 50+ 真实报名 smoke 和独立复核                   | Aime 个人助理 | TraeX 审判者                 |
| F1   | `HP-20261009-08` | P1     | `PENDING_EVIDENCE`                       | 相对快捷项前置提示已随 #57 交付开发版 0.0.37.1，仅余真机 picker 创建/编辑保存重开 smoke | TraeX 执行者  | TraeX 审判者                 |
| F2   | `HP-20261009-09` | P1     | `PENDING_EVIDENCE`                       | 选点恢复已交付开发版 `0.0.60.1`，待真机定位与微信后台复核                              | -             | TraeX 审判者                 |
| G1   | `HP-20261009-10` | P1     | `PENDING_EVIDENCE`                       | 单背景槽位协议客户端/服务端代码链路齐全，待部署回读与真实多图账号 smoke     | -             | TraeX 审判者                 |
| G2   | `HP-20261009-11` | P1     | `PENDING_EVIDENCE`                       | 个人中心头像点击预览已交付，待开发版 smoke 与独立复核                                       | -             | TraeX 审判者                 |
| H    | `HP-20261009-12` | P1     | `BLOCKED_BY(HP-20261009-13 smoke)`       | 闰日周年算法已随 #59 合入，待三函数部署、真实账号回读与真机验收                         | TraeX 执行者  | TraeX 审判者                 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。

## 事项明细

### HP-20261010-03 · 极简活动创建/编辑端到端闭环

- 优先级/状态：P0 / `READY`；PR [#78](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/78) 已完成代码、CI 与开发版 `0.0.78.1` 交付，但尚未满足真实链路验收。
- 用户可见字段：集合时间、集合地点、最多 3 张封面、备注、Strava 路线链接；标题及历史兼容字段由系统生成或维护，不重新暴露旧复杂表单。
- 已知缺口：时间选择后未稳定回显；上传图片的本地预览、上传状态和保存后回读未形成闭环。创建页通过不等于编辑页、详情页或保存重开通过。
- 验收范围：覆盖新建与编辑的 picker 选择、取消、跨日、保存、详情展示、重新编辑回显；图片覆盖选择、顺序预览、上传中、失败重试、删除/替换、保存回读；Strava 链接覆盖合法、非法、清空和重新编辑。
- 关闭条件：自动化测试、同一 SHA 开发版、微信开发者工具与物理真机端到端 smoke、独立复核全部通过，且实测缺陷均已修复。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-04 · 活动分享卡片、微信群触达与活动群二维码

- 优先级/状态：P0 / `READY`。
- 当前事实：活动详情已有页面分享与海报能力，但缺少稳定的分享封面 `imageUrl`，也没有活动群二维码配置、展示与失效处理；微信群待办/置顶需按微信现有开放能力先做可行性验证，不能以普通分享冒充。
- 交付拆分：先完成分享卡片标题、封面、活动关键信息与落地页；活动群二维码作为活动可选字段独立上传、预览、替换和过期提示；群待办/置顶仅在平台接口和主体权限可用时接入，不可用时记录限制并提供明确替代路径。
- 关闭条件：分享给好友/群后卡片信息正确且可打开对应活动；二维码可配置、查看、替换且异常可解释；群触达能力完成真实账号/真机验证和独立复核。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-05 · 首页未来两周活动预览

- 优先级/状态：P0 / `PENDING_EVIDENCE`；PR [#89](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/89) 已合入并随开发版 `0.0.88.1` 上传成功，首个最小交付完成 14 天查询窗口和边界测试；日期分组、快捷预览和完整日历仍作为后续 UI 增量。
- 当前事实：首页已有未来/历史分组、分页和按时间排序，但没有未来 14 天窗口、日历视图或日期快捷定位。
- 产品口径：首页优先呈现从当前时刻起 14 天内的已发布活动，按集合时间升序并以 `_id` 稳定打破同刻排序；进行中、跨日、边界时刻、时区与无活动状态必须有明确规则，不破坏历史活动入口和分页。
- 交付拆分：先做 14 天数据窗口与稳定排序，再做日期分组/快捷预览；完整日历作为同一数据契约上的独立 UI 增量，避免首个 PR 同时重写列表与导航。
- 关闭条件：14 天时间边界测试、50+ 数据分页无漏重、开发版与真机日期切换 smoke、独立复核全部通过；其中查询层自动化、main CI 和开发版上传已完成，真机日期切换与 UI 增量未完成。
- 更新时间：2026-10-11 02:21（CST，#89 已合入；main CI [38075238636](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38075238636) SUCCESS；微信开发版 [38075317318](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38075317318) 上传 `0.0.88.1` 成功）。

### HP-20261010-06 · 个人资料最小必要字段与必填口径

- 优先级/状态：P0 / `READY`。
- 最终口径：性别、头像和个人照片均为必填；个人照片同时是个人页背景照片与骑行名片必备素材，不得被实现为可跳过的装饰字段。真实姓名、手机号、紧急联系人姓名和电话继续保持安全/报名链路所需校验；昵称等非核心字段不得阻断主流程。
- 数据兼容：与 `HP-20261009-10` 的单背景槽位协议保持一致；新用户必须完成一张个人照片，存量缺失账号应进入可恢复补全流程，存量多图不得被静默删除。
- 验收范围：空值、非法性别、默认头像、照片上传失败、保存重开、背景展示、骑行名片展示和存量账号迁移；客户端与服务端必须使用同一必填契约。
- 关闭条件：新旧账号均无数据丢失；必填提示可操作；背景和骑行名片真实展示；CloudBase 部署回读、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-07 · 图片上传可用性与重复上传治理

- 优先级/状态：P0 / `READY`。
- 当前事实：活动和个人资料均直接调用 `wx.cloud.uploadFile`；文件名由时间戳和随机数组成，同一图片重复选择会产生重复对象，目前也缺少统一的上传状态、失败重试、保存回读和孤立文件治理。
- 交付拆分：先以活动封面和个人照片分别复现并修复“不可上传/不可预览”；再引入内容指纹或等价幂等键，阻止同一业务实体重复上传；最后补替换、取消和保存失败后的安全清理，禁止误删仍被活动、资料或名片引用的文件。
- 关闭条件：选择即本地预览，上传进度与失败原因可见，可安全重试/删除/替换；重复选择不重复计费存储；孤立对象可审计清理；真机弱网、CloudBase 回读和独立复核通过。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-08 · 活动卡片右滑删除

- 优先级/状态：P1 / `READY`；右滑 UI 必须等待同一条目内的服务端删除契约落地后再开始。
- 前置契约：仅发布者或管理员可删；有有效报名/候补时禁止删除并说明原因；无报名时执行可审计的逻辑删除，不直接物理删除活动、报名或媒体；重复请求必须幂等。
- 交付顺序：先新增并部署服务端删除接口、权限与报名人数校验，再实现活动卡片右滑操作、二次确认、进行中/失败/恢复状态；不得只在前端数组中移除。
- 关闭条件：权限、并发报名、重复删除、网络失败和撤销/恢复策略测试通过；列表/详情一致；CloudBase 部署、真机手势与独立复核齐全。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-09 · 活动、图片与 Strava 缓存

- 优先级/状态：P1 / `READY`。
- 产品目标：活动列表/详情、已解析图片临时地址和 Strava 摘要减少重复请求，并保留显式刷新和过期恢复；缓存不是永久数据源，不能掩盖报名状态、权限、活动下架或 Strava 解绑变化。
- 设计要求：分别定义缓存键、版本、TTL、容量和失效事件；账号切换/退出、活动增删改、报名变化、头像/照片替换、Strava 重新授权或解绑时必须精准失效；临时图片 URL 到期后自动刷新。
- 关闭条件：冷启动、热启动、弱网、离线、过期、手动刷新和账号切换测试通过；命中率可观察且不展示越权/陈旧数据；真机与独立复核齐全。
- 更新时间：2026-10-10 23:56（CST）。

### HP-20261010-10 · 全员发布活动与发布人展示

- 优先级/状态：P1 / `READY`。
- 当前事实：后端部分支持普通用户创建自己的活动草稿，但前端创建入口仍位于管理路径，活动卡片未展示发布者头像和昵称。
- 产品口径：所有已登录且满足必要资料条件的用户都可创建、编辑和发布自己的活动；管理员保留审核/治理能力。活动卡片和详情展示发布人昵称与头像，历史活动和发布者资料变更需有稳定快照或明确回退。
- 安全要求：服务端绑定真实 openid，禁止代他人创建/修改；限制频率和输入范围；发布人头像异常时安全降级，不暴露手机号等隐私字段。
- 关闭条件：普通用户与管理员权限矩阵、草稿→发布→编辑链路、跨账号越权测试、CloudBase 部署、真机 smoke 与独立复核齐全。
- 更新时间：2026-10-10 23:56（CST）。

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
- 当前占用：代码文件族已释放；仅等待第一批六页物理真机截图与独立复核，证据齐全前保持 `PENDING_EVIDENCE`。
- 审核要求：TraeX 审判者按 375×812px 逐页核对布局、字体、卡片、触控区和安全区；扫描 `theme-light/theme-dark`、主题切换入口及旧硬编码残留；执行功能回归、CI、开发版上传和真机截图验收。
- 交付要求：产品代码同步设置页版本日志；独立 PR 保持单提交；CI 全绿；微信开发版上传；第一批六页逐页真机截图与基准尺寸对照通过后才可关闭。
- 更新时间：2026-10-10 17:48（第二批浅底可读性修复、补强与升级日志收敛已交付开发版 `0.0.75.1`，用户已确认；第一批六页仍待物理真机截图和独立复核）。

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

- 优先级/状态：P1 / `PENDING_EVIDENCE`，相对快捷项前置提示已随 PR [#57](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/57) 合入 main 并交付开发版，仅余真机 picker smoke。
- 用户报告：创建活动的时间需要控件和快捷选择，且点了没反应时要有交代。
- 代码/CI：PR #48 已加入 picker 与“明早 07:00、下周六 08:00、开始后 4 小时、开始前 1 天 20:00”等快捷项；PR #57 修复相对快捷项在开始时间为空/非法时静默无动作的问题。
- 远端证据：main CI run [38017029088](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017029088) SUCCESS；同 SHA `92f5c0b...` 的开发版 `0.0.37.1` 已上传。
- 本地补证：在微信开发者工具中通过真实输入框填入 `2026-10-10 22:00:00` 并点击“开始后 4 小时”，回读 `endAt=2026-10-11 02:00:00`；清空开始时间后点击相对截止时间，`deadline` 保持空值，未发生静默写入。
- 证据缺口：真机 picker 在创建/编辑两种模式保存后重开的 smoke 与独立复核。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；真机验收：Aime 个人助理。
- 关闭条件：三个时间字段可精细和快捷选择；无静默操作；跨月/年/时区无漂移；创建与编辑保存重开正确；CI、开发版 smoke 和独立复核齐全。
- 更新时间：2026-10-10。

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
