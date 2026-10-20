# 单俱乐部用户端收口验收报告

## 1. 验收对象

| 项目 | 内容 |
| --- | --- |
| PR | `feat/single-club-center` → `main`（创建后回填 PR 链接） |
| Head SHA | 见 GitHub PR 头部 `feat/single-club-center` 分支 tip |
| 客户端版本 | `2026.10.20.6` |
| 配套 PR | 管理端收口 #321（`feat/single-club-admin`）；本 PR 基于 `origin/main`，合并顺序可能要求 rebase |
| 验收环境 | 本地 Node 自动化（vitest / node:test）；CloudBase 与微信开发版未部署 |
| 验收角色 | 普通骑友、平台管理员、被授权俱乐部负责人 / 管理员 |
| 执行时间 | 2026-10-20 CST |

## 2. 影响范围

| 维度 | 结论 |
| --- | --- |
| 页面与交互 | `pages/club/center` 由 774 行多俱乐部聚合页重写为唯一俱乐部只读主页：loading 骨架 / error 可重试 / home（16:9 背景、叠放头像、名称地区、中文身份行、01 资料、02 活动、中性说明、canManage 编辑入口）/ empty（普通骑友中性空态，平台管理员可见“创建唯一俱乐部”）。个人中心俱乐部卡改为唯一俱乐部入口，移除多头像组与申请进度文案。 |
| 云函数与数据 | club-application 新增登录可读动作 `getSoleClubHome`：最多读取两条俱乐部文档以裁决唯一性，空库返回 `{exists:false}`，多存量显式返回 `DATA_MIGRATION_REQUIRED`；有俱乐部时仅返回名称、地区、简介、头像/背景临时地址与访问者中文角色、canManage。旧动作 mine/listJoinable/joinPublicClub/getClubDetail/getManagedClub/updateManagedClub/saveDraft/submit/withdraw/adminList/adminDetail/review 全部保留，未删除任何 clubs / club_applications / club_memberships 数据。 |
| 权限与隐私 | 新动作要求登录但不要求成员身份；canManage 仅对 `admin_users` 对应的 admins 集合启用记录为 true；active OWNER/ADMIN 仅展示中文身份，不获得管理跳转；响应在出口剥离 fileID、openid、申请人联系方式、容量等内部字段，只签发临时 HTTPS 地址；页面身份行只渲染服务端 roleLabel 中文，不直出英文角色令牌。 |
| 跨 PR 依赖 | 主页“编辑俱乐部资料”跳 `/pages/admin/club-application-detail/index?mode=edit`，空库创建跳同页 `?mode=bootstrap`，与 #321 路由参数一致；#321 合并前这两个入口在真机上没有目标页实现，需与 #321 同批或在其后发布。 |
| 部署与回滚 | 需重新部署 club-application 云函数并上传 2026.10.20.6 小程序；无集合结构与数据迁移。回滚回退版本与云函数即可；客户端不再调用的旧动作仍在线，回退无数据障碍。 |

## 3. 测试用例矩阵

| 关键用例 | 覆盖场景 | 证据 | 结论 |
| --- | --- | --- | --- |
| 未登录拒绝 | 无 OPENID 调用 getSoleClubHome 返回 UNAUTHENTICATED 中文错误 | `index.node-test.js`「未登录访问唯一俱乐部公开主页被拒绝」 | PASS |
| 空库读主页 | clubs 为空时登录用户读取返回 `{exists:false}` 不报错、不写库 | core / index 两条「空库…exists:false」 | PASS |
| 普通骑友只读 | 无会员关系：role=VISITOR、role_label=骑友、can_manage=false；handler 响应无 avatar_file_id/cover_file_id/applicant_openid/owner_openid | core.node-test.js + index.node-test.js 公开投影用例 | PASS |
| 中文身份与可管理范围 | OWNER→负责人只读、ADMIN→管理员只读、普通成员→成员只读；仅平台管理员无会员关系亦可管理，停用管理员失效 | core.node-test.js 4 条身份用例 | PASS |
| 非可用俱乐部 | pending_review / inactive 文档对外按空库处理 | core.node-test.js「非 approved/active…」 | PASS |
| 多存量失败 | 公共读取与 adminGet/Create/Update 均显式返回 DATA_MIGRATION_REQUIRED，不修改任何俱乐部 | index.node-test.js 多存量用例 | PASS |
| 客户端仓储映射 | CloudRepository 空库→exists:false；有俱乐部→驼峰 SoleClubHome，仅发 `{action:'getSoleClubHome'}`；mock/cached 同步实现 | `tests/club-application-flow.test.ts` 映射用例 | PASS |
| 只读主页运行时 | 身份失败/未登录/读失败/重试/home/empty 管理员创建入口/edit 跳转拦截/switchTab 活动/图片 binderror 占位/迟到响应不覆盖/onUnload 失效 | `tests/club-center-runtime.test.ts` 12 条 | PASS |
| 旧多俱乐部交互清零 | WXML/TS 静态契约：无推荐、一键加入、撤回、申请进度、容量快捷操作、多卡切换、媒体上传；云函数旧动作契约（mine/withdraw/adminList/adminDetail/listJoinable/joinPublicClub/saveDraft/submit/review）全部保留 | `tests/club-application-flow.test.ts` 静态契约用例 | PASS |
| 旧申请审批云函数不回归 | 旧 review approved 关闭、adminGet/Create/Update、多存量迁移与 club-media 用例保留，club-application 定向测试 53 条全过 | `node --test cloudfunctions/club-application/*.node-test.js` | PASS |

## 4. 自动化门禁

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 格式 | `npm run format:check` | 通过：All matched files use Prettier code style |
| 发布日志 | `node scripts/check-release-notes.mjs` | 通过：16 个产品文件已记录 |
| 类型 | `npm run typecheck` | 通过（tsc --noEmit 无输出） |
| 相关前端测试 | `npx vitest run`（俱乐部、个人中心、设置、主包契约等 9 文件） | 通过：9 files / 81 tests passed |
| 俱乐部云函数单测 | `node --test cloudfunctions/club-application/*.node-test.js` | 通过：53 tests passed |
| 发布 / UI 同步 | `npm run check:release-notes`、`npm run test:release-notes`、`npm run test:ui-sync`、`npm run check:ui-sync` | 通过；当前 UI digest 已同步 |
| 空白检查 | `git diff --check` | 通过 |
| Lint | `npm run lint` | 0 error；仅 1 条未改动文件（profile-edit）既有 warning |

## 5. 端到端验收

- 端到端验收：阻塞。当前环境无微信开发者工具、iOS/Android 真机与 CloudBase 写权限。
- 验收报告：本文件 `docs/verification/2026-10-20-single-club-center.md`。
- 合并后需在开发版按下列路径真机回归并回填：
  1. 普通骑友：“我的”→俱乐部卡进入主页，只读查看背景/头像/名称/简介/地区/中文身份，“查看全部活动”切到活动 tab，无任何编辑、加入、申请控件；弱网杀进程重进不闪烁、不被迟到响应覆盖。
  2. 平台管理员：主页出现“编辑俱乐部资料”，跳 #321 的 `?mode=edit`；OWNER/ADMIN 只显示身份且无编辑入口；空库时普通骑友为中性空态，平台管理员出现“创建唯一俱乐部”并跳 `?mode=bootstrap`。
  3. 图片：头像/背景 403 或失效时展示“俱”/CLUB 占位，不出现裂图。

**执行结论**：代码与云函数层 PASS；真机端到端 BLOCKED，不以单元测试冒充真机验收。

## 6. 风险与回滚

- 与 #318–#321 同窗口发布，设置页发布日志与云函数 index.js 可能产生文本冲突，需按合并顺序 rebase（发布号 2026.10.20.6 已为 #321 的 2026.10.20.5 之后续号）。
- 编辑/创建目标页由 #321 提供；若仅本 PR 先上线，两个管理入口在真机无目标页（普通骑友路径不受影响）。
- 旧申请/推荐/加入 action 客户端已不调用但服务端保留，观察一个版本并确认无存量数据依赖后再按数据安全流程下线，已在 `docs/high-priority-issues.md` 2026-10-20 核对节登记核销条件。
- 回滚：回退小程序到 2026.10.20.5 并回退 club-application 云函数；无数据删除与迁移，无需数据恢复。
