# GitHub Pages UI 同步与视觉证据门禁设计

## 目标

以最新小程序代码为事实源，定期同步 `docs/` 下的 GitHub Pages 高保真原型，并通过可复核的微信开发者工具截图与 Pages 截图证明二者一致。

门禁采用严格的漂移预算，而不是要求每个 UI 提交都立即重做原型：

- 最多允许 4 个尚未同步的 UI 变更提交。
- 第 5 个 UI 变更提交或距上次同步超过 7 天时，普通 CI 阻断后续 UI 合入。
- 全局主题、品牌资产、页面路由和 P0 可见性修复必须立即同步。
- 体验版晋级和正式视觉验收要求零漂移。

## 事实源与范围

### UI 源文件

以下文件属于 UI 变更范围：

- `miniprogram/app.json`
- `miniprogram/app.wxss`
- `miniprogram/pages/**`
- `miniprogram/components/**`
- `miniprogram/assets/**`

页面和组件目录中的 TypeScript、JSON、WXML、WXSS 与视觉资源都纳入统计。这样可以覆盖文案、显示条件、导航配置、交互状态和样式变化，而不只检查模板文件。

### 高保真原型

GitHub Pages 原型继续由以下文件提供：

- `docs/index.html`
- `docs/styles.css`
- `docs/app.js`
- `docs/schema.js`
- `docs/templates.js`

原型必须覆盖 `miniprogram/app.json` 中的 13 个真实页面，不增加虚构路由，也不遗漏真实路由。

## 同步清单

新增 `docs/ui-sync-manifest.json`，记录：

- 最近一次同步的 Git 提交和时间；
- UI 源文件摘要与 Pages 原型摘要；
- 13 个真实路由到小程序源目录、原型路由和截图证据的映射；
- 本次同步覆盖的微信开发者工具截图和 Pages 截图；
- 当前漂移预算阈值。

内容摘要基于排序后的文件路径和文件内容计算，避免依赖尚未创建的提交 SHA，也防止只修改任意一个 `docs/` 文件绕过门禁。

## CI 门禁

新增 `scripts/check-ui-sync.mjs` 与对应单元测试。

### 普通模式

普通 CI 从清单中的同步提交开始统计 UI 变更提交：

- 无漂移时通过；
- 1 至 4 个 UI 变更提交时通过，并输出剩余额度；
- 第 5 个 UI 变更提交时失败；
- 存在未同步 UI 变更且同步时间超过 7 天时失败；
- 命中即时触发文件时，只要存在漂移就失败；
- 摘要不匹配、路由映射不完整或截图无效时失败。

### 发布严格模式

体验版晋级工作流使用严格模式。只要存在任何未同步 UI 变更就失败，确保体验版对应的 GitHub Pages 原型和视觉证据没有漂移。

### 即时触发文件

以下变化不消耗漂移预算，必须在同一批次完成同步：

- `miniprogram/app.json`
- `miniprogram/app.wxss`
- `miniprogram/assets/brand/**`
- `miniprogram/components/brand-logo/**`

页面路由变化由 `app.json` 覆盖。P0 可见性修复通过同步清单中的 `forceSync` 标志明确声明，并由 CI 验证为零漂移。

## 视觉证据

每次同步在 `docs/evidence/ui-sync/<date>-<slug>/` 保存：

- `manifest.json`：源提交、路由、摘要和截图文件映射；
- `README.md`：验证范围、命令、通过结果与已知限制；
- `<route>-devtools.png`：微信开发者工具运行态截图；
- `<route>-pages.png`：GitHub Pages 或本地 Pages 同视口截图。

CI 校验截图文件存在、为有效 PNG、尺寸非零，并与本次受影响路由逐一对应。CI 不在 Linux Runner 中启动微信开发者工具；截图采集在已登录的 macOS 开发环境完成，CI 只验证证据完整性与内容摘要。

## 本轮原型同步

本轮以 `origin/main@7038e5c` 为基线，修正自原型 PR #177 之后的已知漂移：

- 全场景 Logo 物料与显示比例；
- 活动详情的四项关键指标、报名状态和紧凑信息层级；
- Strava 路线预览、链接复制和 GPX 操作区；
- 活动管理页的四态筛选、卡片间距和黑白橙主题；
- 与最新运行态一致的活动首页、我的行程和报名凭证示例数据。

其余页面保留 13 路由覆盖，并复核共享品牌、主题和触控规范。

## 验证

实现完成后执行：

1. 门禁脚本单元测试；
2. `tests/showcase-pages-contract.test.ts` 等原型契约测试；
3. `npm run validate`；
4. 微信开发者工具只读 E2E，保存核心页面截图；
5. 本地 Pages 桌面与移动视口浏览器核对；
6. 合并后核对 GitHub Pages 正式地址；
7. 体验版工作流严格模式演练。

微信开发者工具截图属于模拟器验证，不替代 iOS 和 Android 真机验收。

## 失败处理

门禁失败必须输出：

- 未同步 UI 提交数；
- 最近同步时间与剩余天数；
- 命中的即时触发文件；
- 缺失或摘要不匹配的路由与证据文件；
- 应执行的同步命令。

如果微信开发者工具无法采集截图，不允许用静态源码断言代替；应保留失败原因并阻断需要视觉证据的同步批次。
