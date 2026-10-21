# 2026-10-21 管理员 Strava 线路同步与活动路线创建交付验收

> 本记录对应分支 `feat/strava-pages-interaction`，固化本次 PR 的需求、方案、改动、门禁与影响；端到端真实部署与真机验收仍需在 PR 合并进入 `main` 后以平台结果回读，不在本文件内伪造结论。本 PR 相对 `origin/main` 仅包含 1 条提交（即本次 Strava 收敛改动），具体哈希以合并时平台记录为准，不在本文件内固化，避免 amend / rebase 后失效。

## 需求上下文

- 核心诉求：进一步收敛 Strava 使用边界，仅管理员需要连接 Strava；普通成员与游客不接触任何 Strava 术语或入口。
- 场景一：设置页为管理员新增「同步 Strava 线路信息」入口，承载授权链接复制与状态提示，承担连接管理与故障恢复。
- 场景二：创建 / 编辑活动页将「粘贴 Strava 线路地址 + 解析」作为主路径；GPX / 本地文件等补充能力折叠到路线输入右侧的 `+` 弹层，默认不可见。
- 场景三：活动归属与报名截止不再出现在表单：唯一俱乐部默认选中，截止时间由服务端派生为活动开始日北京时间 `00:00`。
- 文案约束：面向用户的文案禁止出现 `OAuth`、`Token`、`GPX`、`授权回调`、`API`、`web-view` 等技术词；主路径仅出现「同步 Strava 线路信息」「粘贴 Strava 线路地址」等生活化表达。
- Pages 原型（`docs/*`）需与真实小程序页面结构一致，作为 UI Sync 双端证据的参考基线。
- 范围边界：本 PR 不新增云函数、不改动领域数据结构、不改动既有 Strava 接口契约；仅在前端与原型侧收敛交互。

## 背景

- 历史交付在 `2026-10-13`、`2026-10-19` 两轮迭代后保留了设置页版本号与路线预览能力，但活动编辑页仍混合展示「Strava 连接」「GPX 上传」「公开/私密俱乐部选择」「报名截止时间」等多模入口，普通管理员需要跨页反复确认授权状态。
- 复盘中确认授权只服务于「拉取 Strava 线路数据」这一能力，不应与活动表单耦合；同时俱乐部仅剩一个真实运营主体，`clubOptions` 事实上为单选常量，picker 的存在会增加误操作与审核成本。
- `pages/*` 的高保真 Pages 原型与真实小程序页面出现结构漂移，`docs/ui-sync-manifest.json` 中 settings / admin-activity-edit 两屏证据与新文案不一致，导致 `check-ui-sync.mjs` 无法作为上线前的事实门禁。
- 用户在上一轮确认：仅做 Pages 原型对齐不满足交付标准，必须回到小程序真实前后端代码，并保证 `validate` / `coverage` / UI Sync 等既有门禁不被削弱。

## 修改方案

1. 设置页 (`miniprogram/pages/settings/*`)
   - 在管理员态下新增「00 线路同步 / 同步 Strava 线路信息」行；普通用户与游客保持原样。
   - 复用现有 `rideService.getStravaRouteReadiness` 与 `startStravaRouteAuthorization`，在 `onShow` 时拉取状态；点击按钮时根据 readiness 复制授权链接或提示下一步。
   - 文案全部走业务化表达，组件内不出现 OAuth / Token / 回调等技术词；通过 `appStore.role === 'admin'` 判断可见性，`authStatus !== 'authenticated'` 时隐藏入口。
2. 活动编辑页 (`miniprogram/pages/admin/activity-edit/*`)
   - 删除活动归属 picker；新建活动默认选中唯一真实俱乐部，TS 层仍保留 `clubOptions` 常量用于未来扩展与契约测试。
   - 删除页内「连接 Strava」「复制授权链接」按钮；连接管理迁移到设置页，页面只保留「粘贴 Strava 线路地址 + 解析」主路径与右侧的 `+` 本地路线补充按钮。
   - `+` 弹层在底部作为 `route-boost-sheet` 展开，承载本地路线文件 / GPX 补录能力；关闭后页面回到纯 Strava 地址主路径。
   - 发布按钮文案由 `publishButtonLabel` 根据表单状态派生；保存时后端沿用「活动开始日 00:00 自动派生 deadline」逻辑，表单不再暴露截止时间。
3. Pages 原型 (`docs/templates.js`、`docs/schema.js`、`docs/styles.css`)
   - 对齐小程序真实 WXML 结构：settings 新增管理员 Strava 行，admin-activity-edit 收敛为「Strava 地址 + 解析 + `+` 弹层」。
   - `schema.js` 新增 `settings:admin` 与 `admin-activity-edit` 的多个状态（空、解析中、成功、`+` 展开、错误等），`releaseNotes` 更新到 `2026.10.21.5`。
   - `styles.css` 补充 Strava sync row、route source、`+` 入口、bottom sheet、inline registration mode 等令牌与结构样式，禁止直接写 raw hex；品牌橙通过 `--color-brand-strava: #fc4c02` 变量引用。
4. UI Sync 证据 (`docs/ui-sync-manifest.json` + `docs/evidence/ui-sync/2026-10-16-design-acceptance/*.png`)
   - 使用 Chrome headless `?capture=viewport` 以 375×812 重拍 Pages 两屏；DevTools 真机证据沿用上轮 2026-10-16 采集，note 显式标注本轮未重拍、以 Pages 为双端 UI 同步基线。
   - 更新 `syncedAt`、`source.digest`、`prototype.digest` 与两屏 evidence note / state，运行 `node scripts/check-ui-sync.mjs` 通过。
5. 测试契约 (`tests/*.test.ts`)
   - 新增 / 更新 Vitest 契约，覆盖：设置页管理员可见入口、普通用户不可见、点击复制授权链接、文案无技术词；活动编辑页默认不展示 GPX / 上传 / 公开俱乐部选项，`+` 弹层展开后才出现补充能力；Pages prototype 与 showcase 契约与小程序结构一致；版本号同步到 `2026.10.21.5`。

## 复现或验证路径

1. 拉取分支 `feat/strava-pages-interaction`，执行 `git log origin/main..HEAD --oneline` 应仅输出 1 条提交，即本次 Strava 管理员线路同步与活动路线创建的收敛改动；提交哈希以当前 `HEAD` 为准，不在本文档中固化。
2. 在仓库根执行 `python3 -m http.server 8777 --directory docs`，浏览器访问 `http://localhost:8777/`：
   - 身份切换到「管理员」后进入 `设置` 页，确认出现「00 线路同步 / 同步 Strava 线路信息」行，版本号显示 `V2026.10.21.5`；普通用户与游客下该行不出现。
   - 进入 `管理员 · 编辑活动`，确认页面不再展示活动归属 picker、不再展示报名截止时间输入；路线区默认只有「Strava 线路地址 + 解析」主路径与右侧 `+`；点击 `+` 展开底部弹层后出现「上传本地路线文件」等补充能力，关闭弹层回到主路径。
3. 对照 `docs/evidence/ui-sync/2026-10-16-design-acceptance/settings-pages.png`、`admin-activity-edit-pages.png` 两张 Pages 证据（375×812）核对结构与文案一致。
4. 执行自动化门禁：
   - `node scripts/check-ui-sync.mjs`：双端 digest / 证据一致，剩余额度与距上次同步天数正常。
   - `npm run validate`：全链路通过（prettier / eslint / typecheck / vitest / 契约 / 发布说明 / UI Sync / 主包 / 治理 / 云函数 / build）。
   - `npm run coverage`：vitest 覆盖率与 cloud 覆盖率均通过。
   - `git diff --check origin/main..HEAD`：无空白错误。
   - `npm run audit:all`：业务依赖 0 高危漏洞，但 `tools/miniprogram-ci` 的 `fast-glob` / `request` 存在可升级依赖，脚本以非零退出报告，详见 §影响面与 §测试与端到端验收。

## 改动

- 小程序运行时
  - `miniprogram/config/release.ts`：`CLIENT_RELEASE_VERSION` 由 `2026.10.21.4` 升至 `2026.10.21.5`。
  - `miniprogram/pages/settings/index.wxml`：新增管理员 `00 线路同步` 区块与「同步 Strava 线路信息」行。
  - `miniprogram/pages/settings/index.ts`：引入 `appStore` 与 `rideService` 的 Strava readiness / 授权能力；新增 `isAdmin / stravaState / stravaDescription / stravaAction / stravaAuthorizationUrl`；补 `onShow / onUnload / applyStravaReadiness / loadStravaStatus / openStravaSync`；顶部 release notes 增加 `2026.10.21.5`。
  - `miniprogram/pages/settings/index.wxss`：新增 Strava row 结构与状态样式。
  - `miniprogram/pages/admin/activity-edit/index.wxml`：删除活动归属 picker、页内 Strava 连接按钮；改为 Strava 线路地址输入 + 解析 + `+` 弹层；发布按钮文案改由 `publishButtonLabel` 派生。
  - `miniprogram/pages/admin/activity-edit/index.ts`：新增 `showRouteBoostSheet / publishButtonLabel / openStravaSettings / openRouteBoostSheet / closeRouteBoostSheet / noop / recomputePublishLabel`；`loadClubOptions` 新建态默认选中第一个真实俱乐部；保留 `getStravaRouteReadiness` 与 `importStravaRoute`，移除页内 `startStravaRouteAuthorization`；保存时保留 deadline 自动派生逻辑。
  - `miniprogram/pages/admin/activity-edit/index.wxss`：新增 route source、`+`、bottom sheet 等结构样式。
- Pages 高保真原型
  - `docs/templates.js`：对齐小程序结构，重写 settings / admin-activity-edit 两屏模板。
  - `docs/schema.js`：新增 settings 管理员态与 admin-activity-edit 多状态；`releaseNotes` 升级到 `2026.10.21.5`。
  - `docs/styles.css`：新增 Strava sync row、route source、`+`、bottom sheet、inline registration mode 样式与 `--color-brand-strava` 令牌。
  - `docs/ui-sync-manifest.json`：更新 `syncedAt` / `source.digest` / `prototype.digest`，更新 settings / admin-activity-edit evidence note 与 state。
  - `docs/evidence/ui-sync/2026-10-16-design-acceptance/settings-pages.png`、`admin-activity-edit-pages.png`：重拍 375×812 Pages 证据。
- 测试契约
  - 新增 / 更新：`tests/settings-page.test.ts`、`tests/strava-retirement.test.ts`、`tests/activity-admin-edit.test.ts`、`tests/club-foundation-m0-contract.test.ts`、`tests/unified-theme-tokens-contract.test.ts`、`tests/pages-full-app-prototype.test.ts`、`tests/showcase-pages-contract.test.ts`。

## 影响面

### 行为变化

- 管理员：设置页新增 Strava 同步入口；创建 / 编辑活动不再在页内复制授权链接或选择归属俱乐部，Strava 失效时按钮会跳转设置页恢复。
- 普通成员 / 游客：不感知任何 Strava 入口与文案；报名、活动详情、路线预览与查看路径未变化。
- 创建 / 编辑活动：报名截止时间不再出现在表单；保存时后端沿用「活动开始日北京时间 `00:00`」自动派生逻辑，前端通过 Vitest 契约锁定。

### 数据与兼容性

- 不改动数据库字段、索引、集合或云函数签名；不新增 OpenAPI。
- `clubOptions` 常量与 `PUBLIC_CLUB_OPTION` 保留，老活动兼容读取；新建活动默认选中唯一真实俱乐部。
- 既有带「活动归属」「截止时间」字段的历史活动继续按原值读取；只有新建或编辑保存时才会应用新规则。
- `releaseNotes` 增量追加 `2026.10.21.5` 条目，旧版本号与说明保持原样。

### 安全与隐私

- Strava 授权链接复制 / 跳转的实现未变，仍由 `rideService.startStravaRouteAuthorization` 下发；本次只变更入口位置与文案，没有新增外发请求、未扩大 scope、未新增持久化。
- 管理员可见性依赖 `appStore.authStatus === 'authenticated' && appStore.role === 'admin'`，未改动鉴权中间件；非管理员无法通过 Pages 直达该入口。
- 不采集真实 openid、手机号、OAuth 参数或密文；证据截图保持 Pages 原型态，不含真实用户信息。

### 部署

- 需要重新构建发布小程序前端包；云函数、CloudBase 环境变量、规则与数据库均无变化，可按常规 `main` → GitHub Actions → 微信开发版 / 预览 → CloudBase 部署流水线执行。
- Pages 需随 `main` CI 发布到 GitHub Pages，验证线上 `#settings` / `#admin-activity-edit` 两屏结构与本地一致。

### 回滚

- 风险等级：中。回滚方式为在 `main` 上回滚本 PR 的合并提交（`git revert -m 1 <merge-commit>`，`<merge-commit>` 以平台合并记录为准），随后触发 `main` CI 重新发布。
- 回滚后：设置页回到不含 Strava 入口的旧文案；活动编辑页恢复活动归属 picker、页内 Strava 连接按钮与 GPX 入口；Pages 原型自动跟随 `docs/*` 回退；`releaseNotes` 回退到 `2026.10.21.4`。
- 数据库 / 云函数 / 规则无需联动回滚；旧版本小程序对已有活动的字段读取保持兼容。

## 测试与端到端验收

### 自动化门禁命令

| 门禁 | 命令 | 本次结果 | 关键证据 |
| --- | --- | --- | --- |
| 全量质量门禁 | `npm run validate` | PASS | 格式检查 / ESLint / typecheck / Vitest / 契约 / 发布说明 / UI Sync / 主包 / 治理 / 云函数 / build 全部通过 |
| 覆盖率门禁 | `npm run coverage` | PASS | Vitest 覆盖率与 `scripts/check-cloud-coverage.mjs` 通过 |
| UI 同步 | `node scripts/check-ui-sync.mjs` | PASS | `未同步 UI 提交：0 / 距上次同步：0 天 / 剩余额度：4` |
| 空白检查 | `git diff --check origin/main..HEAD` | PASS | 无空白告警 |
| 依赖安全审计 | `npm run audit:all` | **BLOCKED（存量）** | 业务与云函数 `found 0 vulnerabilities`；`scripts/audit-miniprogram-ci.mjs` 以 `微信上传工具仍有可升级修复的依赖：fast-glob, request` 非零退出 |

> `npm run audit:all` 失败属于存量阻塞：本 PR 未改动 `tools/miniprogram-ci/`、`cloudfunctions/**`、`scripts/audit-miniprogram-ci.mjs`、`package.json` 或 `package-lock.json`（`git log origin/main..HEAD -- …` 为空）；`tools/miniprogram-ci/audit-allowlist.json` 的例外窗口到 `2027-01-15`，但 `fast-glob` / `request` 存在上游可升级版本后，脚本会直接以 `fixable` 为失败条件。本 PR 不打算修复该上游升级（涉及 miniprogram-ci 兼容性评估），交由独立工单跟进。

### 关键用例

| 用例 | 类型 | 预期 | 实际 | 证据 |
| --- | --- | --- | --- | --- |
| 管理员进入设置页看到「同步 Strava 线路信息」行 | 正常路径 | 行可见、文案为业务化表达、点击复制授权链接 | 通过 | `tests/settings-page.test.ts` |
| 游客 / 普通成员进入设置页 | 根因反例 | 不展示任何 Strava 入口与术语 | 通过 | `tests/settings-page.test.ts` |
| 活动编辑页默认视图 | 正常路径 | 只展示 Strava 地址 + 解析 + `+`；不展示 GPX / 上传 / 公开俱乐部 | 通过 | `tests/activity-admin-edit.test.ts`、`tests/strava-retirement.test.ts` |
| `+` 弹层展开 | 边界 | 弹层中出现「上传本地路线文件」等补充能力；关闭后回到主路径 | 通过 | `tests/activity-admin-edit.test.ts` |
| 活动归属 picker 彻底移除 | 回归 | WXML 不含 picker；TS 仍保留 `clubOptions / PUBLIC_CLUB_OPTION` 常量用于兼容 | 通过 | `tests/club-foundation-m0-contract.test.ts` |
| 报名截止自动派生 | 回归 | 表单无截止时间输入；保存后 deadline = start date 00:00 | 通过 | `tests/activity-admin-edit.test.ts` |
| Pages prototype 与小程序结构一致 | 正常路径 | settings / admin-activity-edit 双端模板 / schema 对齐 | 通过 | `tests/pages-full-app-prototype.test.ts`、`tests/showcase-pages-contract.test.ts` |
| 版本号与 release notes | 回归 | `CLIENT_RELEASE_VERSION === '2026.10.21.5'`、`docs/schema.js` 同步 | 通过 | `tests/unified-theme-tokens-contract.test.ts`、`tests/settings-page.test.ts` |

### 端到端验收

- Pages 浏览器核对：本地 `http://localhost:8777/#settings` 与 `#admin-activity-edit` 两屏结构与截图一致，身份切换表现符合预期。
- 小程序真机：本轮**未执行**微信开发版 / 真机端到端。该路径依赖 `main` 合并后触发的 GitHub Actions → 微信开发版上传 / Pages 发布 → CloudBase 部署，需在合并后以最终 `main` SHA 回读；本记录不以单元测试结果代替真机验收。
- 部署与回读：**待合并后回读**。合并进入 `main` 后需核对：GitHub Actions `main` run、GitHub Pages 发布版本、微信开发版上传回执、CloudBase 云函数版本（无变更，仅需确认未被重新发布破坏）。

### 验收报告路径

- 本报告：`docs/verification/2026-10-21-strava-route-sync-delivery.md`
- Pages 证据：
  - `docs/evidence/ui-sync/2026-10-16-design-acceptance/settings-pages.png`
  - `docs/evidence/ui-sync/2026-10-16-design-acceptance/admin-activity-edit-pages.png`
- UI Sync manifest：`docs/ui-sync-manifest.json`

### validate / coverage / audit / diff-check 结论

- `npm run validate`：PASS
- `npm run coverage`：PASS
- `npm run audit:all`：BLOCKED（存量 `tools/miniprogram-ci` 可升级依赖；非本 PR 引入，`main` 同样失败）
- `git diff --check origin/main..HEAD`：PASS

## 改动文件

```
docs/evidence/ui-sync/2026-10-16-design-acceptance/admin-activity-edit-pages.png
docs/evidence/ui-sync/2026-10-16-design-acceptance/settings-pages.png
docs/schema.js
docs/styles.css
docs/templates.js
docs/ui-sync-manifest.json
miniprogram/config/release.ts
miniprogram/pages/admin/activity-edit/index.ts
miniprogram/pages/admin/activity-edit/index.wxml
miniprogram/pages/admin/activity-edit/index.wxss
miniprogram/pages/settings/index.ts
miniprogram/pages/settings/index.wxml
miniprogram/pages/settings/index.wxss
tests/activity-admin-edit.test.ts
tests/club-foundation-m0-contract.test.ts
tests/pages-full-app-prototype.test.ts
tests/settings-page.test.ts
tests/showcase-pages-contract.test.ts
tests/strava-retirement.test.ts
tests/unified-theme-tokens-contract.test.ts
```

共 21 个文件变更，+1258 / −202（基于当前工作区相对 `origin/main` 的 `git diff --shortstat` 实测，已包含本报告本身 `docs/verification/2026-10-21-strava-route-sync-delivery.md`）。
