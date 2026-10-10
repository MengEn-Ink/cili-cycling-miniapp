# 高优问题清单

> 最后更新：2026-10-10 13:30（CST）
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
- 微信开发版：统一 UI 第一批随 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) 成功上传 `0.0.55.1`（head `4b27057...`，日志含“微信开发版 0.0.55.1 上传成功”）；此前 run [38024964766](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38024964766) 上传 `0.0.52.1`（head `54df558...`），run [38023517201](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38023517201) 上传 `0.0.49.1`（head `d9d9f77...`）。更早 run [38020822125](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38020822125) 上传 `0.0.45.1`（head `fe616f2...`）；浅色主题首次随 run [38014100157](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38014100157) 上传 `0.0.36.1`（head `a275fc3...`）交付，活动时间快捷项随 run [38017106152](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38017106152) 的 `0.0.37.1` 交付。
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

## 当前工作交接检查点

- 本轮已完成并交付：HP-01 至 HP-05 已按完整证据链从清单删除；HP-06 已随 PR #56 合入并上传开发版，但其“深浅主题并存”产品前提已被新 UI 基线替代；HP-20261010-01 的旧浅色行程序号与三处运行态低对比过渡保护已随 PR #62/#66/#69 合入并上传开发版；HP-08 已随 PR #57 合入并交付开发版；HP-12 闰日算法已随 PR #59 合入。
- 当前最高优先级：先实施 `HP-20261010-02` 全局统一 UI，再在新布局上继续做页面级功能验收，避免继续为即将删除的旧主题/旧布局补样式。
- HP-20261010-02 进展：单一主题底座与第一批六页已推送至 main；head `4b27057...` 的 main CI run [38025995570](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38025995570) SUCCESS，微信开发版 run [38026070737](https://github.com/MengEn-Ink/cili-cycling-miniapp/actions/runs/38026070737) 实际上传 `0.0.55.1`；375×812 开发者工具六页截图及 TabBar 图标复核通过，仅余物理真机截图与独立复核。
- HP-07 检查点：代码、全量本地/远端门禁、开发版 `0.0.52.1`（含后续 #73）、目标环境索引、`registration` Active 回读及线上代码比对已完成；仅余 50+ 真实报名页面 smoke 和独立复核，状态保持 `PENDING_EVIDENCE`。
- HP-13 根因证据：诊断部署后的设置页真实调用仍返回 `INTERNAL_ERROR`（requestId `ae45d0b8-ade6-4a16-8eec-6f343cda303e`），日志将故障定位到 `read-readiness/-1`。当前账号有 `strava_credentials/strava_snapshots`，但没有 `oauth_attempts`；CloudBase 对该明确缺文档读取返回 `errCode=-1 / document with _id ... does not exist`，而 `strava-auth` 只兼容了同语义的 `-502001`。真实错误形态已由 RED 测试复现，最小修复后明确缺文档的 `-1` 正常降级，通用 `-1 / database request fail` 继续失败关闭，`strava-auth` 29/29 通过。
- 并行状态：PR #61/#62/#63/#64/#66/#68/#69/#73 均已合入；HP-07 已解除代码文件族占用，`HP-20261010-02` 已开始推进。
- 责任边界：TraeX 执行者负责 `HP-20261010-02` 页面与组件实施；TraeX 审判者负责逐页尺寸对照、旧主题残留扫描、功能回归、CI/开发版和真机验收。Aime 个人助理完成本次清单对齐后退出，不再占用任何代码文件族。

## 当前处理顺序

| 泳道 | ID               | 优先级 | 状态                                     | 目标                                                                                    | 唯一写者      | 复核/发布                    |
| ---- | ---------------- | ------ | ---------------------------------------- | --------------------------------------------------------------------------------------- | ------------- | ---------------------------- |
| UI   | `HP-20261010-02` | P0     | `PENDING_EVIDENCE`                       | 单一主题底座与第一批六页已交付开发版 `0.0.55.1`，待物理真机截图与独立复核                 | -             | TraeX 审判者                 |
| B    | `HP-20261009-13` | P0     | `IN_PROGRESS`                            | 正部署脱敏阶段诊断以定位 `status` INTERNAL_ERROR，随后完成真实授权/解绑 smoke            | TraeX 执行者  | TraeX 审判者 / Aime 个人助理 |
| D    | `HP-20261009-06` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧双主题全页对比度，不再单独实施                                                        | -             | TraeX 审判者                 |
| D1   | `HP-20261010-01` | P1     | `SUPERSEDED_BY(HP-20261010-02)`          | 旧浅色主题与运行态低对比已随 #62/#66 补保护，最终由新 UI 统一收口                       | -             | TraeX 审判者                 |
| E    | `HP-20261009-07` | P1     | `PENDING_EVIDENCE`                       | 我的行程已交付开发版并完成部署回读，待 50+ 真实报名 smoke 和独立复核                   | Aime 个人助理 | TraeX 审判者                 |
| F1   | `HP-20261009-08` | P1     | `PENDING_EVIDENCE`                       | 相对快捷项前置提示已随 #57 交付开发版 0.0.37.1，仅余真机 picker 创建/编辑保存重开 smoke | TraeX 执行者  | TraeX 审判者                 |
| F2   | `HP-20261009-09` | P1     | `READY`                                  | 创建活动地点快捷选择与权限恢复（需真机定位验证）                                        | TraeX 执行者  | TraeX 审判者                 |
| G1   | `HP-20261009-10` | P1     | `READY`                                  | 单背景图与预览的数据安全闭环                                                            | TraeX 执行者  | TraeX 审判者                 |
| G2   | `HP-20261009-11` | P1     | `BLOCKED_BY(HP-20261009-10 code commit)` | 个人中心头像预览                                                                        | TraeX 执行者  | TraeX 审判者                 |
| H    | `HP-20261009-12` | P1     | `BLOCKED_BY(HP-20261009-13 smoke)`       | 闰日周年算法已随 #59 合入，待三函数部署、真实账号回读与真机验收                         | TraeX 执行者  | TraeX 审判者                 |

> `BLOCKED_BY` 只约束开始后续实现的门禁，不要求前置条目最终关闭。

## 事项明细

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
- 当前占用：代码文件族已释放；仅等待第一批六页物理真机截图与独立复核，证据齐全前保持 `PENDING_EVIDENCE`。
- 审核要求：TraeX 审判者按 375×812px 逐页核对布局、字体、卡片、触控区和安全区；扫描 `theme-light/theme-dark`、主题切换入口及旧硬编码残留；执行功能回归、CI、开发版上传和真机截图验收。
- 交付要求：产品代码同步设置页版本日志；独立 PR 保持单提交；CI 全绿；微信开发版上传；第一批六页逐页真机截图与基准尺寸对照通过后才可关闭。
- 更新时间：2026-10-10 13:10（main CI、开发版 `0.0.55.1` 与 375×812 开发者工具截图已完成，仅待物理真机截图和独立复核）。

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

- 优先级/状态：P1 / `BLOCKED_BY(HP-20261009-13 smoke)`；客户端闰日周年算法已随 PR [#59](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/59) 合入 main。
- 用户报告：根据 Strava 获取骑行年限的功能为何未上线，代码是否合并。
- 代码/CI：账号年限取自 Strava athlete `created_at`，已进入 main 并通过 CI；它表示 Strava 账号年龄，不是完整现实骑龄。#59 按目标年份当月最后一天收敛周年日，修复 `2020-02-29 -> 2021-02-28` 少算一年的问题。
- 证据缺口：三个云函数部署须等 HP-13 smoke；存量快照可能缺 `athlete_created_at`，缺真实同步回读；缺真机显示验收。
- 下一步：HP-13 smoke 通过后部署同一 SHA 的三个函数；定义存量账号自动回填或一次性重新授权策略并真实回读。
- 负责人：TraeX 执行者；独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：周年与闰日测试通过；三个函数 Active 版本可回读；真实账号同步后回读 `strava_snapshots.athlete_created_at` 与 profile `strava_joined_at`；新旧账号真机显示正确且无需反复授权。
- 更新时间：2026-10-10。

### HP-20261009-13 · 设置页 Strava 授权撤销与异常生命周期

- 优先级/状态：P0 / `IN_PROGRESS`，生命周期代码已随 PR [#53](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/53) 合入 main；阻断真实 smoke 的 `status` INTERNAL_ERROR 根因修复已提交，正等待 CI、部署与线上回读。
- 当前事实：merge SHA `490044dd91194f9cd643c43700f97ae1ffaa74d3` 实现 attempt generation/fencing；disconnect 原子推进代际并消费全部未消费 state；callback 对乱序、解绑竞态和同步竞态 fail closed；`access_denied/error` 消费 state 并落稳定拒绝状态；readiness 按 scope/token/config/network 返回 `reauthorize/disconnect/contact-support/retry`；客户端仅按 recovery action 展示动作且不自动重跑 failed；解绑明确为本地断开，并降级所有未被 profile 引用的 Strava 媒体。
- 证据/阻断：PR #53 `validate` SUCCESS；main CI run `38010547930` SUCCESS；微信开发版 run `38010624339` 成功上传 `0.0.32.1`；2026-10-10 已下载线上 `strava-auth/strava-callback` 代码与基线比对一致。本地真实调用 `status` 当前返回 `INTERNAL_ERROR / 服务暂时不可用`（开通日志前 requestId `8d93c87e-387f-4b93-a667-f58e515b4b4c`，开通后 requestId `c76c3181-230d-46db-bd17-25b5616e2136`）；函数 Node.js 20.19 且 Active，排除运行时版本过旧，`athlete_created_at` 缺失也不会让 readiness 抛错。CloudBase 日志服务已开通；只读探针确认空 state 集合、cleanup 查询和未消费 state 查询均可成功，旧线上函数因未输出异常阶段仍无法确定根因。
- 诊断补丁：提交 `672cb5f` 新增可注入 `createHandler`，为身份、过期 state 清理、readiness 读取及后续动作标记阶段；仅对最终映射为 `INTERNAL_ERROR` 的异常记录 `{action, stage, code}`，不记录 openid、令牌或原始错误正文，客户端仍返回统一错误。节点测试已完成 RED→GREEN，`strava-auth` 27/27 通过；最终 `npm run validate` 全绿，包含格式、lint、typecheck、前端 734/734、旅程证据 82/82、bootstrap 58/58、部署链路 14/14、全部云函数、部署包一致性和构建。
- 根因修复：提交 `31404ce46723` 在 `maybeGet` 中复用已由 profile 验证的严格文档缺失判定，仅当 `-1/-502001` 同时包含明确 document missing 语义时返回空记录；真实错误形态和通用 `-1` 失败关闭均有测试保护，focused 29/29 已通过。提交前 `npm run validate` 全绿：前端 734/734、旅程证据 82/82、bootstrap 58/58、部署链路 14/14、全部云函数、部署包一致性和构建均通过。
- 下一步：推送根因修复并跟踪 CI；部署同一代码树的 `strava-auth`、下载 `$LATEST` 比对并重跑设置页 `status`。状态读取恢复后继续六条真实授权生命周期 smoke。
- 负责人：TraeX 执行者；安全/独立复核：TraeX 审判者；部署/真机：Aime 个人助理。
- 关闭条件：解绑后所有旧 callback 被拒绝且凭证不复活；拒绝授权消费 state 并停止轮询；retry/reauthorize/disconnect/contact-support 由稳定服务端语义驱动；`strava-auth/callback` 部署回读；六条真实 smoke 通过。
- 更新时间：2026-10-10 13:30（CST）。

## 并行边界

- 泳道 B（HP-13）先处理授权安全；HP-12 的客户端周年算法可并行，但 Strava/Profile 云函数统一部署必须在 HP-13 代码复核与真实 smoke 后。
- 泳道 D（HP-06、HP-20261010-01）、E（HP-07）文件边界独立，可并行；HP-20261010-01 与 #56 后续复核共享浅色主题验收，串行收口。
- 泳道 F（HP-08→09）共享活动编辑页，单写者串行；泳道 G（HP-10→11）共享个人资料页，单写者串行。
- Aime 个人助理只在不可变 SHA 通过独立复核后执行目标环境部署和真实 smoke；部署证据不得替代代码复核，开发版上传不得替代 CloudBase 部署。
