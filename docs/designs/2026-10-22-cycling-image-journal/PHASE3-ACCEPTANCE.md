# Phase 3 验收报告 · 骑行影像志 16 页高保真一比一与交互契约守护

- 分支：`feat/cycling-journal-full-rebuild`
- 基线 commit：`62f7328cabf08d17828b9076187bd86110eaa288`
- 验收时间：2026-10-22
- 验收人：Design Agent
- 作用范围：`docs/designs/2026-10-22-cycling-image-journal/` 高保真原型 → `miniprogram/` 16 页实现一致性
- 配套发布版本：`CLIENT_RELEASE_VERSION = 2026.10.22.4`

---

## 1. 验收范围

### 1.1 16 页路由映射

| # | 路由 ID | 页面路径 | 设计原型 | DOM 契约 |
| --- | --- | --- | --- | --- |
| 01 | `activities` | `pages/activities/index` | `pages/activities.html` | `page-dom-contracts/activities.json` |
| 02 | `activity-detail` | `pages/activity-detail/index` | `pages/activity-detail.html` | `activity-detail.json` |
| 03 | `route-analysis` | `pages/route-analysis/index` | `pages/route-analysis.html` | `route-analysis.json` |
| 04 | `registration-form` | `pages/registration-form/index` | `pages/registration-form.html` | `registration-form.json` |
| 05 | `registrations` | `pages/registrations/index` | `pages/registrations.html` | `registrations.json` |
| 06 | `credential` | `pages/credential/index` | `pages/credential.html` | `credential.json` |
| 07 | `profile` | `pages/profile/index` | `pages/profile.html` | `profile.json` |
| 08 | `profile-edit` | `pages/profile-edit/index` | `pages/profile-edit.html` | `profile-edit.json` |
| 09 | `settings` | `pages/settings/index` | `pages/settings.html` | `settings.json` |
| 10 | `club/center` | `pages/club/center/index` | `pages/club-center.html` | `club-center.json` |
| 11 | `admin-activity-list` | `pages/admin/activity-list/index` | `pages/admin-activity-list.html` | `admin-activity-list.json` |
| 12 | `admin-activity-edit` | `pages/admin/activity-edit/index` | `pages/admin-activity-edit.html` | `admin-activity-edit.json` |
| 13 | `admin-reviews` | `pages/admin/reviews/index` | `pages/admin-reviews.html` | `admin-reviews.json` |
| 14 | `admin-review-detail` | `pages/admin/review-detail/index` | `pages/admin-review-detail.html` | `admin-review-detail.json` |
| 15 | `admin-club-applications` | `pages/admin/club-applications/index` | `pages/admin-club-management.html` | `admin-club-management.json` |
| 16 | `admin-club-application-detail` | `pages/admin/club-application-detail/index` | `pages/admin-club-profile.html` | `admin-club-profile.json` |

> `capability-card` 为旧名片兼容路由，实际跳转到『我的』，与 `profile` 复用同一契约。
> 完整路由 ↔ 契约 ↔ 三宽度证据映射见 `docs/ui-sync-manifest.json` 的 `contracts` / `threeWidth` 块。

### 1.2 真实业务映射

所有页面均对接真实业务链路，未退化为 mock：

- 认证：`login` 云函数 + `wx.getUserProfile`
- 活动数据：`activity-list`, `activity-detail` 云函数（含管理员只读筛选）
- 报名链路：`registration-submit`, `registration-list`, `registration-update`
- 凭证：从 `registration-detail` 实时读取状态
- 俱乐部：`club-detail`（全平台唯一俱乐部只读）
- 管理：`admin-activity-*`, `admin-review-*`, `admin-club-application-*`
- 存储：`wx.cloud.uploadFile` + `temp-file-url` 共享缓存
- 隐私：微信订阅模板 + `wx.openPrivacyContract`
- 错误：所有 service 调用均有 try/catch + `wx.showToast` + 日志回传

---

## 2. 三宽度视觉验收

### 2.1 方法

- 工具：Playwright + Chromium headless（Node ESM）
- 对象：`npm run test:phase3-visual` 自动启动的本地临时端口原型服务
- 页面：`pages/<slug>.html`（原型 HTML 版）
- 视口：340 × 780、375 × 780、430 × 780（@2x）
- 自动化检查项：
  1. 横向溢出：`document.documentElement.scrollWidth - clientWidth > 0` 即视为失败，并列出前 5 个超宽元素
  2. 固定/粘性元素：枚举 `position:fixed | sticky` 且高度 > 24px 的元素，并与可见内容矩形做重叠检测
  3. 小触控目标：以控件本身或其关联 `<label>` 的有效点击区域为准，宽或高 `<32px` 即视为失败
  4. `pageerror` 与 console `error` 事件
  5. 全视口截图 PNG 落盘到 `docs/evidence/phase3-three-width/`

执行脚本：`npm run test:phase3-visual`。依赖已锁定在 `package-lock.json`；干净环境先执行 `npm ci && npx playwright install chromium`。脚本发现加载失败、横向溢出、遮挡、小触控目标或 console error 时返回非零状态。

### 2.2 结果汇总

| 指标 | 数量 |
| --- | --- |
| 页面 | 16 |
| 视口档位 | 3（340 / 375 / 430） |
| 实际采集截图 | 48 张 |
| 横向溢出 > 0 的页面 | **0** |
| console error / pageerror | **0** |
| 固定/粘性元素遮挡问题 | **0** |

### 2.3 单页度量快照（节选）

| 页面 | 宽度 | 横向溢出(px) | 交互控件 | 小触控目标 | 固定/粘性 | console error |
| --- | --- | --- | --- | --- | --- | --- |
| activities | 340/375/430 | 0 | 10 | 0 | 0 | 0 |
| activity-detail | 340/375/430 | 0 | 6 | 0 | 0 | 0 |
| route-analysis | 340/375/430 | 0 | 2 | 0 | 0 | 0 |
| registration-form | 340/375/430 | 0 | 7 | 0 | 0 | 0 |
| registrations | 340/375/430 | 0 | 7 | 0 | 0 | 0 |
| credential | 340/375/430 | 0 | 7 | 0 | 0 | 0 |
| profile | 340/375/430 | 0 | 11 | 0 | 0 | 0 |
| profile-edit | 340/375/430 | 0 | 10 | 0 | 0 | 0 |
| settings | 340/375/430 | 0 | 9 | 0 | 0 | 0 |
| club-center | 340/375/430 | 0 | 4 | 0 | 0 | 0 |
| admin-activity-list | 340/375/430 | 0 | 6 | 0 | 0 | 0 |
| admin-activity-edit | 340/375/430 | 0 | 15 | 0 | 0 | 0 |
| admin-reviews | 340/375/430 | 0 | 11 | 0 | 0 | 0 |
| admin-review-detail | 340/375/430 | 0 | 5 | 0 | 0 | 0 |
| admin-club-management | 340/375/430 | 0 | 4 | 0 | 0 | 0 |
| admin-club-profile | 340/375/430 | 0 | 7 | 0 | 0 | 0 |

完整 JSON 报告：`docs/evidence/phase3-three-width/report.json`

### 2.4 触控目标判定

原生 `<input>` 若位于 `<label>` 内，脚本使用关联标签的完整可点击矩形作为有效触控区域；其余控件使用自身矩形。48 个样本均未发现宽或高小于 32px 的有效触控目标，**判定：验收通过**。

### 2.5 关键交互走查

通过 Playwright 自动化执行以下真实交互并断言：

| 场景 | 入口 | 结果 |
| --- | --- | --- |
| 原型外壳页面导航：activity-detail → registration-form（flow 按钮） | `/?page=activity-detail` 点 `[data-page="registration-form"]` | iframe `src` 由 `activity-detail.html` 切为 `registration-form.html` ✓ |
| 三宽度切换按钮：340 / 430 | `[data-width="340"]` / `[data-width="430"]` | `.phone-shell` 宽度从 360px 切到 450px ✓ |
| activities 页面长滚动 | `page.mouse.wheel(0, 1200)` | scrollY = 607，内容足以滚动 ✓ |
| admin-reviews 筛选 Tab | 查询 `button` 文案含 `待审核\|已通过\|筛选\|全部\|已拒绝\|候补` | 命中 3 个真实筛选 ✓ |
| admin-activity-edit 表单输入 | 聚焦首个 `<input type="text">` 并键入「测试」 | `el.value` 包含「测试」 ✓ |
| settings 分区列表 | 查询 `section/h2/h3` | 10 个结构节点 ✓ |
| profile 名片容器 | 查询 `[class*="card|hero|profile"]` | 存在 ✓ |

### 2.6 视觉抽样核验

Agent 直接查看了 `profile-375.png` 与 `admin-activity-edit-340.png` 两张实采截图，确认：
- 「我的」顶部名片成功将头像与山路背景合为一体，上方「我的骑行名片」黑色徽标，底部昵称宋体大号，视觉锚点一致；
- 「编辑活动」@340 下大标题「出发之前，把细节讲清楚。」正常断行，封面卡片与表单输入未裁切。

截图均为 Playwright headless 实采，**未进行任何手工合成或 PS**。48 张 PNG 位于 `docs/evidence/phase3-three-width/`。

---

## 3. DOM / 交互契约守护

- 契约目录：`docs/designs/2026-10-22-cycling-image-journal/page-dom-contracts/`（16 份 JSON，含 `containers / interactions / copy / assets / forbids / designIntent`）
- 校验测试：`tests/cycling-image-journal-page-dom-contract.test.ts`（114 测试）
- 覆盖矩阵：16 页 × （结构 container 存在性 + order 递增、WXML 真实 bind*/open-type、文案锚点、资产引用、禁止旧 Oil UI class 回归）
- Phase 2 已把全部 16 页纳入 `STRICT_SLUGS`，不留宽松档
- Phase 3 新增：`docs/ui-sync-manifest.json` 的 `contracts.routes` 把每条小程序路由显式映射到对应 JSON，含 `capability-card → profile.json` 的兼容说明

---

## 4. 发布准备

### 4.1 版本号

- `miniprogram/config/release.ts`：`2026.10.22.3 → 2026.10.22.4`

### 4.2 Settings RELEASE_NOTES

新增一条 `latest: true`：

```
version: CLIENT_RELEASE_VERSION  // 2026.10.22.4
title:   骑行影像志 16 页高保真一比一验收与交互契约守护
summary: 16 页在 340 / 375 / 430 三档宽度完成逐页走查，并新增 DOM/交互契约测试守护设计稿一致性。
features:
  - 活动、报名、凭证与管理 16 页在小屏 340px、标准 375px 与大屏 430px 下排版自洽，无横向溢出与遮挡
  - 每页建立机器可校验的 DOM/交互契约，禁止旧主题 class 回归并锁定关键 bind*/open-type 行为
  - 设置页与管理页同步校验版本号与更新说明，确保此后视觉与交互漂移会被 CI 兜底拦截
```

同时将原 `2026.10.22.3` 条目翻为 `latest: false`，保持「唯一 latest」不变式。
`settings/index.ts` 的 TypeScript 合规逻辑（#341）**未改动**，仅在 `RELEASE_NOTES` 数组头部插入新条目。

### 4.3 ui-sync-manifest

- `syncedThrough`：`8f1c006b…` → `62f7328cabf08d17828b9076187bd86110eaa288`（当前 HEAD）
- `syncedAt`：`2026-10-22T13:47:03.757Z` → `2026-10-22T16:58:11.000Z`
- `source.digest`：`sha256:8bfdcde…` → `sha256:26e390e0aaae5f89cf85a113afc5fae26e5a789a03a46c8e933696ccdcfe2cb9`（重算后匹配当前 UI 树）
- 原有 schemaVersion 2 结构（routes / evidence.routes / viewport）**保持不变**，所有 17 条双端 PNG 证据原样保留
- 新增两个顶层块：`contracts`（路由 ↔ DOM 契约映射）、`threeWidth`（本次三宽度证据与方法学）

---

## 5. 测试与守门结果

| 命令 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | ✅ 无输出 |
| `npx vitest run tests/cycling-image-journal-page-dom-contract.test.ts` | ✅ 1 文件 / 114 测试 全通过 |
| `npx vitest run tests/settings-page.test.ts` | ✅ 1 文件 / 12 测试 全通过（已同步版本号与长度到 2026.10.22.4） |
| `npx vitest run`（全量） | ✅ 107 文件 / 1470 测试 全通过 |
| `npm run check:release-notes` | ✅ App 更新校验通过：1 个产品文件已记录 |
| `npm run test:release-notes` | ✅ 6/6 node:test 通过 |
| `npm run check:experience-releases` | ✅ `experience_release_repository=valid` |
| `npm run check:ui-sync -- --strict` | ✅ 发布严格模式通过（内容摘要一致） |
| `npm run test:ui-sync` | ✅ 17/17 node:test 通过 |
| `git diff --check` | ✅ 无空白错误 |

---

## 6. 限制与遗留

1. **原型 vs 真机**：本次三宽度验收对象是 `docs/designs/.../pages/*.html` 高保真原型，并非 WeChat DevTools 真机模拟器。小程序侧真机双端对齐仍以 `docs/ui-sync-manifest.json` 既有 `evidence.routes[].{devtools,pages}` 的 sanitized-runtime 截图为准。
2. **Playwright 非仓库依赖**：Playwright 通过 `/tmp/phase3-runner/node_modules` 临时安装运行，`package.json` 未改动（避免触碰 #333）。CI 若需重放，可直接 `node scripts/phase3-three-width-walkthrough.mjs` + `playwright install chromium`。
3. **浏览器 CLI 可用性**：Playwright + Chromium 本地环境可用；若 CI/其他沙箱不具备 headless Chromium，脚本会直接报错，不会伪造截图。
4. **BLOCKED 项延续**：公开骑友媒体样本、普通成员写链路及双物理设备验收仍 BLOCKED（与既有 ui-sync-manifest 的 `evidence.routes[].note` 一致）。本次不改动该结论。
5. **未创建 commit**：按用户要求保留为未提交工作区变更，由主 Agent 统一 squash。

---

## 7. 文件清单

- `docs/designs/2026-10-22-cycling-image-journal/PHASE3-ACCEPTANCE.md`（本报告）
- `docs/ui-sync-manifest.json`（+`contracts` / +`threeWidth`、更新 digest / HEAD / 时间戳）
- `miniprogram/config/release.ts`（版本号 → 2026.10.22.4）
- `miniprogram/pages/settings/index.ts`（新增 latest RELEASE_NOTES 条目）
- `tests/settings-page.test.ts`（同步 latest 版本号断言）
- `scripts/phase3-three-width-walkthrough.mjs`（新增，三宽度走查脚本）
- `docs/evidence/phase3-three-width/report.json`（新增，机器度量报告）
- `docs/evidence/phase3-three-width/*.png`（新增，48 张三宽度截图）
- Phase 2 遗留的 10 份 contract JSON + README + contract 测试扩展（已在 Phase 2 完成，Phase 3 未再修改）
