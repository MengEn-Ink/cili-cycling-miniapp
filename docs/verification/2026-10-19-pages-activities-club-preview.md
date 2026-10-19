# Pages 单俱乐部口径本地验收

## 范围

- 仅修改 GitHub Pages 原型（`docs/**`）、Pages 测试与本验收文档；未修改 `miniprogram/**`、`cloudfunctions/**`、数据库字段、发布日志或部署配置。
- 单俱乐部口径：全平台始终只有一个俱乐部（`club-xinzhuangqiao / 辛庄桥小火车`），首次由平台管理员直接 bootstrap 创建，创建后任何角色都不再提供创建入口。
- 普通骑友从「我的」直达唯一俱乐部主页；不再出现发现、推荐、申请加入、撤回、退出、审批、成员名录与容量上限。
- 所有活动统一归属该唯一俱乐部，对全体用户可见；不再区分公开活动与俱乐部活动，取消发布范围选择与「成员投稿 / 管理员审批」两段式流程。
- 保留能力：活动报名 / 候补 / 取消报名 / 活动人数上限（容量只作用于单场活动，不作为俱乐部容量）。
- 17 条正式路由 ID 保持不变（与 `miniprogram/app.json` 一致）：
  - `admin-club-applications`：改为“唯一俱乐部资料概览 + 编辑入口”，仅在空库首次 bootstrap 态提供创建引导。
  - `admin-club-application-detail`：改为“编辑唯一俱乐部”，`edit` 为默认态，`bootstrap` 为空库首次创建态。
  - `club/center`：从 `discovery/detail/manage/loading/error` 收敛为 `home/manage/loading/error`。
  - `admin-activity-list`：下线活动投稿—审批两段式；筛选保留「全部 / 已下架 / 已驳回 / 已上线 / 已结束」，去掉「待审核俱乐部活动」分支；卡内「报名待审」指报名审批数，不是活动审批数。
  - `admin-activity-edit`：发布主体固定展示唯一俱乐部，主按钮统一为「发布活动」；不再根据角色切换「提交俱乐部审核 / 管理员直发」。
- M0 组织审批原型（`org-overview` / `activity-publish-target` / `admin-approval-inbox` / `approval-detail` / `approval-outcome` / `approval-exceptions`）与 11 页 `planned-club-*` 规划原型随多俱乐部语义一同下线，schema / templates / app / index / 测试均未保留其入口。

## 修改文件

- `docs/schema.js`
  - 删除 6 个 M0 组织审批 prototype pages 与 11 页 `planned-club-*` 规划原型，并以注释声明下线原因。
  - 收敛 `clubCenterPrototype` / `clubManagementPrototype` / `clubMembership` / 活动 `hostClub` / `clubIdentity` / `tripClubSnapshots` 为唯一俱乐部数据。
  - `admin-activity-list` 状态改为 `default / rejected / empty / loading`，copy 改为“按状态管理唯一俱乐部的全部活动与发布状态；活动统一由平台管理员发布”。
  - `admin-activity-edit` 状态改为 `edit / create / rejected-resubmit / error / uploading`，copy 改为“平台管理员维护唯一俱乐部的活动内容；所有活动统一归属该俱乐部，对所有用户可见”，fixes 去除「成员投稿 / 管理员直发 / 公开活动仅平台管理员发布」分支，并显式声明保留活动人数上限与候补队列。
  - `profile` / `club/center` / `admin-club-applications` / `admin-club-application-detail` 维持上一轮单俱乐部收敛不变。
- `docs/templates.js`
  - `admin-activity-list` 下线 `pending-review` 分支，筛选只剩「全部 / 已下架 / 已驳回 / 已上线 / 已结束」；卡片不再出现「驳回 / 通过」活动审批按钮，`metric-grid` 的第二项标注改为「报名待审」，指向报名审批页。
  - `admin-activity-edit` 下线 `member-submit` / `manager-publish` 分支，固定展示“唯一俱乐部”徽标，底部主按钮固定为「发布活动」；驳回态文案改为“已驳回 · 路线信息需要补充，修改后可重新发布”。
  - `clubAvatarStack` 注释改为单俱乐部收口说明，函数行为未变。
- `docs/app.js` / `docs/index.html` / `docs/delivery-center.js`：维持上一轮单俱乐部收敛的叙事与 counts（17 正式路由 + 4 规划原型 / 21 画面；organizer-flow 明确“全平台始终只有一个俱乐部”）。
- `docs/styles.css`：维持上一轮 `club-center-page` 的 `data-mode="home"` 收敛不变。
- `docs/ui-sync-manifest.json`：`admin-activity-list` evidence `state` 改为“待处理活动”，`note` 改为“Pages 原型已下线活动投稿—审批两段式，默认展示唯一俱乐部的全部活动与「已驳回」筛选；活动统一由平台管理员发布”；`admin-activity-edit` evidence `state` 维持“活动编辑 · 唯一俱乐部归属”。两条仍标 `review: blocked`。
- `tests/showcase-pages-contract.test.ts`
  - credential 快照断言：从 `辛庄桥小火车（俱乐部活动）` 改为 `辛庄桥小火车`，并新增 `expect(credentialPage).not.toContain('（俱乐部活动）')` 与 `expect(credentialPage).not.toContain('此里公开活动')`。
  - `states/problems/fixes/spec` 统计断言从 23 改为 17，与 17 条正式路由对齐。
  - 组织者旅程断言从 `俱乐部创建仅由平台管理员发起并直接生效` 改为 `全平台始终只有一个俱乐部`，与 `docs/app.js` 的 organizer-flow 收口语义一致。

## 自动化结果

- `node_modules/.bin/vitest run tests/pages-full-app-prototype.test.ts tests/showcase-pages-contract.test.ts tests/ux-copy-and-centering-2026-10-17.test.ts`
  - 3 个测试文件、76 项测试全部通过。
- `npm run typecheck`（`tsc --noEmit`）：无输出，无错误。
- `npx prettier --check docs/schema.js docs/templates.js docs/app.js docs/styles.css docs/delivery-center.js docs/index.html docs/ui-sync-manifest.json tests/pages-full-app-prototype.test.ts tests/showcase-pages-contract.test.ts`：`All matched files use Prettier code style!`。
- `git diff --check`：无空白错误。
- 冗余模块 grep（`成员投稿|管理员直发|提交俱乐部审核|planned-club-|公开活动仅平台管理员|申请加入俱乐部|俱乐部推荐|多俱乐部`）仅命中否定/边界/下线注释：
  - `docs/schema.js:328`、`docs/delivery-center.js:671/689` 均为“不再出现 / 已下线”句式。
  - `docs/schema.js:475/798/799/896`、`docs/templates.js:1696` 为“已随多俱乐部语义一同下线”的注释。
  - `docs/app.js:304` 位于“不做什么 · 边界检查”，为显式否定声明。
  - `docs/ui-sync-manifest.json:153` 为单俱乐部化 evidence 说明。
  - 无任一命中以“可用能力 / 规划原型 / 入口按钮”的形式出现。
- 其余工程门禁（`npm run validate` / `npm run coverage` / `npm run audit:all` / CloudBase 部署等）本轮未执行；范围未触及 `miniprogram/**` 与 `cloudfunctions/**`，可按常规节奏在下轮一并执行。

## 浏览器验收

- 本轮未在本地启动静态服务并手动采集 340×740 / 375×812 / 390×844 截图。
- `docs/ui-sync-manifest.json` 中相关 evidence 仍沿用上一轮 2026-10-19 的 PNG 文件名；`state` / `note` 已随本轮 schema / templates 文案调整；下轮可按单俱乐部交互重新采集。

## 关键交互确认

- `#profile`：维持上一轮单俱乐部口径（管理员多一张“管理俱乐部资料”行；普通骑友仅看到“进入俱乐部主页”）。
- `#club/center`：维持 `home / manage / loading / error` 四态；`home` 对管理角色开放“编辑俱乐部资料”，普通 MEMBER 只读。
- `#admin-club-applications` / `#admin-club-application-detail`：维持“资料概览 + bootstrap 首次创建”；三段 01 头像 / 02 背景图 / 03 基本资料。
- `#admin-activity-list`：筛选「全部 / 已下架 / 已驳回 / 已上线 / 已结束」；活动卡不再出现「通过 / 驳回」活动审批按钮；页副标题改为“管理唯一俱乐部的全部活动与发布状态”；底部次按钮“报名审批”仍直达 `#admin-reviews`。
- `#admin-activity-edit`：发布主体卡片固定展示「辛庄桥小火车 · 唯一俱乐部」，底部主按钮固定为「发布活动」；驳回态提示改为“修改后可直接重新发布，无需再次审批”。
- `#credential`：活动归属行只渲染“辛庄桥小火车”，不再带「（俱乐部活动）」或「此里公开活动」后缀；凭证底部提示改为“历史行程与凭证保留成行时的活动归属，不再区分公开或俱乐部活动”。

## 未覆盖 / 阻塞

- 本轮未部署 Pages、CloudBase 或微信开发版。
- 本轮未在本地浏览器重新采集单俱乐部口径截图；evidence PNG 文件名沿用上一轮，仅文案已对齐。
- 未执行 `npm run validate` / `npm run coverage` / `npm run audit:all`；改动不涉及 `miniprogram/**` 与 `cloudfunctions/**`，上述门禁可按常规节奏在下轮一并执行。
- 现有 DevTools 证据继续标记为 `blocked`，不得据此声明双端一致或线上就绪。
