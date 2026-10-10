# 全局统一明亮 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除旧深浅主题分叉，以单一明亮高对比视觉系统迁移第一批六页，并保持全部真实业务行为。

**Architecture:** 先用静态契约锁定唯一系统外观、语义 token 和尺寸，再移除 14 页主题运行时状态。共享组件稳定后按“列表 → 详情/表单 → 个人/设置”分批迁移，每批只改模板与样式，沿用现有 service、repository 和页面状态机。

**Tech Stack:** 原生微信小程序、TypeScript、WXML、WXSS、Vitest、Node test

---

## 文件职责

- `miniprogram/app.json`：唯一系统导航、TabBar 和滚动背景配置。
- `miniprogram/app.wxss`：唯一视觉 token、全局布局和基础控件。
- `miniprogram/services/theme-service.ts`：移除主题选择后，仅容错同步固定系统外观。
- `miniprogram/components/{brand-logo,activity-card,state-view,status-pill}`：共享品牌、活动卡和状态视觉。
- `miniprogram/pages/activities`、`activity-detail`、`admin/activity-edit`、`registrations`、`profile`、`settings`：第一批页面。
- `tests/unified-bright-ui-contract.test.ts`：新产品基线的主静态契约。
- 既有页面测试：继续证明业务行为未被 UI 迁移改变。

### Task 1: 锁定单一主题与尺寸基线

**Files:**
- Create: `tests/unified-bright-ui-contract.test.ts`
- Modify: `tests/theme-runtime-integration.test.ts`
- Modify: `tests/theme-service.test.ts`
- Modify: `tests/settings-page.test.ts`

- [ ] **Step 1: 写失败契约**

契约读取 `app.json`、`app.wxss`、14 页脚本/模板和设置页，断言：

```ts
expect(app.window).toMatchObject({
  navigationBarBackgroundColor: '#ffffff',
  navigationBarTextStyle: 'black',
  backgroundColor: '#ffffff',
  backgroundTextStyle: 'dark',
});
expect(styles).toContain('--color-brand: #d9ff43;');
expect(styles).toContain('--control-height: 96rpx;');
expect(styles).toContain('--segment-height: 80rpx;');
expect(`${styles}\n${allPages}`).not.toMatch(/theme-light|theme-dark|themeClass/);
expect(settingsTemplate).not.toContain('显示主题');
expect(settingsScript).not.toMatch(/setTheme|switchTheme/);
```

- [ ] **Step 2: 验证 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts`

Expected: FAIL，原因是当前系统仍为暗色默认、双主题类仍存在、设置页仍有主题入口。

- [ ] **Step 3: 把旧主题测试改为唯一外观测试**

`theme-service.test.ts` 只覆盖固定白色系统调用的幂等、失败重试和 API 缺失容错；`settings-page.test.ts` 删除主题切换断言，保留 Strava 与升级日志。

- [ ] **Step 4: 再次验证仍为 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/theme-service.test.ts tests/settings-page.test.ts`

Expected: FAIL，且仅失败于生产代码尚未迁移。

### Task 2: 实现固定系统外观并移除运行时主题

**Files:**
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/app.ts`
- Modify: `miniprogram/services/theme-service.ts`
- Modify: `miniprogram/pages/**/index.ts`
- Modify: `miniprogram/pages/**/index.wxml`
- Modify: `miniprogram/pages/**/index.json`

- [ ] **Step 1: 收敛固定外观服务**

保留容错和失败重试，但只导出：

```ts
export function applyAppAppearance(): void {
  applyNavigation();
  applyTabBar();
  applyBackground();
}
```

固定值为白色导航、黑色前景、白色 TabBar、深灰未选中项、近黑选中项，并使用 `*-light.png` 作为未选中图标。

- [ ] **Step 2: 删除页面主题状态**

从 14 页移除 `syncPageTheme` import、`theme/themeClass` data、`onShow` 中的同步调用和根节点 `{{themeClass}}`。保留页面原有 `onShow` 业务调用。

- [ ] **Step 3: 更新系统配置**

所有页面 JSON 使用：

```json
{
  "navigationBarBackgroundColor": "#ffffff",
  "navigationBarTextStyle": "black",
  "backgroundColor": "#ffffff",
  "backgroundColorTop": "#ffffff",
  "backgroundColorBottom": "#ffffff",
  "backgroundTextStyle": "dark"
}
```

- [ ] **Step 4: 验证 GREEN**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/theme-service.test.ts tests/theme-runtime-integration.test.ts`

Expected: PASS。

- [ ] **Step 5: 提交底座**

```bash
git add miniprogram/app.json miniprogram/app.ts miniprogram/services/theme-service.ts miniprogram/pages tests
git commit -m "refactor(ui): remove runtime theme switching"
```

### Task 3: 建立 token 与共享组件

**Files:**
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/components/brand-logo/index.wxss`
- Modify: `miniprogram/components/activity-card/index.wxss`
- Modify: `miniprogram/components/state-view/index.wxss`
- Modify: `miniprogram/components/status-pill/index.wxss`
- Test: `tests/unified-bright-ui-contract.test.ts`

- [ ] **Step 1: 扩充失败契约**

断言主背景、正文、品牌、2px 描边、硬阴影、32rpx 页面边距、96rpx 控件、80rpx 分段控件、32rpx 卡片圆角和 24rpx 卡片间距。

- [ ] **Step 2: 验证 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts`

Expected: FAIL，显示旧 token 和旧共享组件尺寸。

- [ ] **Step 3: 重写全局 token 与共享样式**

基础 token：

```css
page {
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-raised: #f4f5f0;
  --color-text: #10120f;
  --color-muted: #5b6258;
  --color-brand: #d9ff43;
  --color-on-brand: #10120f;
  --color-border: #10120f;
  --control-height: 96rpx;
  --segment-height: 80rpx;
  --page-gutter: 32rpx;
  --radius-card: 32rpx;
  --shadow-hard: 8rpx 8rpx 0 #10120f;
}
```

媒体面继续使用独立 `--color-on-media`，不得把白色媒体文字用于白色卡片。

- [ ] **Step 4: 验证 GREEN 与共享组件回归**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/editorial-performance-layout.test.ts tests/state-view-contract.test.ts`

Expected: PASS。

### Task 4: 迁移活动首页与我的行程

**Files:**
- Modify: `miniprogram/pages/activities/index.wxml`
- Modify: `miniprogram/pages/activities/index.wxss`
- Modify: `miniprogram/pages/registrations/index.wxml`
- Modify: `miniprogram/pages/registrations/index.wxss`
- Test: `tests/unified-bright-ui-contract.test.ts`
- Test: `tests/activity-home-timeline.test.ts`
- Test: `tests/registration-history.test.ts`
- Test: `tests/registration-pages-compact-contract.test.ts`

- [ ] **Step 1: 写页面结构失败契约**

断言首页分段控件 80rpx、活动卡间距 24rpx、行程卡 `RIDE` 序号使用 `--color-muted`、卡片白底 2rpx 描边，且原有分页、筛选、打开和状态模板标记均保留。

- [ ] **Step 2: 验证 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/activity-home-timeline.test.ts tests/registration-history.test.ts tests/registration-pages-compact-contract.test.ts`

Expected: FAIL 于旧页面尺寸或暗色硬编码。

- [ ] **Step 3: 迁移模板与样式**

仅改视觉结构与 class；保留 `switchView`、`loadMore`、`open`、`state-view` 和所有可访问状态文本。

- [ ] **Step 4: 验证 GREEN**

重复 Step 2 命令，Expected: PASS。

### Task 5: 迁移活动详情与创建活动

**Files:**
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/pages/activity-detail/index.wxss`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxml`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxss`
- Test: `tests/unified-bright-ui-contract.test.ts`
- Test: `tests/activity-detail-design.test.ts`
- Test: `tests/activity-admin-edit.test.ts`

- [ ] **Step 1: 写失败契约**

锁定详情媒体首屏、三列指标、48px 路线操作、固定 CTA 安全区；锁定创建页单列 375px 布局、48px 输入按钮、模式单选和现有时间/地点/Strava/图片/错误锚点。

- [ ] **Step 2: 验证 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/activity-detail-design.test.ts tests/activity-admin-edit.test.ts`

Expected: FAIL 于暗色内容卡、88rpx 控件和双列表单。

- [ ] **Step 3: 迁移样式**

详情保留媒体深色层，内容区改白底；创建页在基准宽度下统一单列，所有原有绑定和条件渲染不变。

- [ ] **Step 4: 验证 GREEN**

重复 Step 2 命令，Expected: PASS。

### Task 6: 迁移个人中心与设置

**Files:**
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/pages/settings/index.wxml`
- Modify: `miniprogram/pages/settings/index.wxss`
- Modify: `miniprogram/pages/settings/index.ts`
- Test: `tests/unified-bright-ui-contract.test.ts`
- Test: `tests/profile-page.test.ts`
- Test: `tests/settings-page.test.ts`
- Test: `scripts/check-release-notes.node-test.mjs`

- [ ] **Step 1: 写失败契约与版本日志测试**

设置页第一段必须是 Strava，不得存在主题入口；最新版本新增统一 UI 说明，旧日志顺延且内容不改写。个人中心照片媒体面保留，设置按钮最小 96rpx 且有 `aria-label`。

- [ ] **Step 2: 验证 RED**

Run: `npx vitest run tests/unified-bright-ui-contract.test.ts tests/profile-page.test.ts tests/settings-page.test.ts && node --test scripts/check-release-notes.node-test.mjs`

Expected: FAIL 于旧主题入口、旧尺寸和缺少新日志。

- [ ] **Step 3: 迁移页面**

删除设置主题卡与处理函数；把 Strava 管理前置。个人中心只调整结构和样式，不改缓存、刷新、身份、图片或能力卡逻辑。

- [ ] **Step 4: 验证 GREEN**

重复 Step 2 命令，Expected: PASS。

### Task 7: 清理旧主题残留并全量验证

**Files:**
- Modify: 由扫描命中的旧主题测试和样式文件
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: 扫描残留**

Run:

```bash
rg -n "theme-light|theme-dark|themeClass|setTheme|display-theme|深色（默认）|浅色（户外）" miniprogram tests
```

Expected: 无产品代码和有效契约命中；历史升级日志文字允许保留。

- [ ] **Step 2: 运行前端与全量门禁**

Run: `npm test`

Expected: 全部通过。

Run: `npm run validate`

Expected: 格式、lint、类型、前端、旅程证据、CloudBase 脚本、上传、发布日志、云函数和构建全部通过。

- [ ] **Step 3: 375×812 运行态验收**

自动化打开六页并采集截图；逐页检查 16px 边距、8px 栅格、48px 控件、40px 分段、56px TabBar、安全区、长文本、空态、错误态、加载态和固定操作区。活动创建分别检查日常与精品局。

- [ ] **Step 4: 回写清单**

记录本地测试、截图路径、提交 SHA 和未完成的远端/真机证据。没有 CI、开发版和真实截图时状态保持 `IN_PROGRESS` 或 `PENDING_EVIDENCE`。

### Task 8: 推送并收集远端证据

- [ ] **Step 1: 整理提交**

保持文档、主题底座、页面迁移和发布日志为可审查的独立提交；推送前工作区必须干净。

- [ ] **Step 2: 推送 main 并跟踪 CI**

确认 main CI 全绿，记录 run URL 与 SHA。

- [ ] **Step 3: 跟踪微信开发版**

确认实际上传而非过滤跳过，记录上传版本、run URL 和同一 SHA。

- [ ] **Step 4: 完成独立复核**

由审判者复核截图、旧主题残留、功能回归和发布证据；全部关闭条件满足后从高优清单删除 `HP-20261010-02` 及被其替代的旧主题条目。
