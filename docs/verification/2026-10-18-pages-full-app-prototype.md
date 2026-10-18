# 2026-10-18 · GitHub Pages 全套 App 原型定向校验

> 分支：`feat/pages-full-app-prototype`
>
> 本轮范围：只更新 `docs/**` 与 Pages 原型相关契约测试；未修改 `miniprogram/**`、`cloudfunctions/**`、`scripts/**`、`package.json`、后端或主题 token。

## 1. 本轮修正

### 正式 `club/center` 原型

- 正式路由 ID 保持为 `club/center`，并继续使用 `discovery / detail / manage / loading / error` 单路由 mode-based 结构。
- `detail` 根据 fixture 中的 `viewer.roleToken` 判断权限：仅 `OWNER / CLUB_ADMIN` 显示管理入口；`MEMBER` 只读并显示权限说明。
- `discovery` 的推荐俱乐部同时提供“申请加入”和 disabled 的“查看详情”；申请动作只展示原型提示，明确尚未提交或完成服务端写入。
- 删除旧三 tab、成员名录、俱乐部活动、更多菜单与封面重试状态机的不可达 CSS；保留当前五种 mode 实际使用的样式。

### 页面统计与能力边界

- `schema.pages` 当前共 40 个画面：17 个正式路由 + 8 个 M0 原型 + 15 个 planned design-only 原型。
- `experienceStats.schemaPageCount` 更新为 `40`。
- 总览、页面 meta 和 header 统一说明为“17 个正式路由 + 23 个原型 / 40 个画面”。
- 23 个原型画面可进入 Pages 原型导航，但不进入 `miniprogram/app.json`，也不计入 17 条正式路由。

### 路线分析降级状态

- `route-analysis/no-waypoint` 现在真实渲染 `.ra-chart` 海拔剖面 DOM；不渲染关键点 marker，并保留“按剖面曲线自行判断强度”的说明。
- `route-analysis/parse-fail` 的“重试解析”改为 route action，进入 `route-analysis/loading`，不再只弹 toast。

### UI 同步摘要

- 按 `check:ui-sync` 实际计算结果更新 `docs/ui-sync-manifest.json` 的 prototype digest。
- 17 条正式路由的 Pages 截图已通过本地 Aime 浏览器重新采集为 375×812；最后一轮修复后再次采集 `club/center`。DevTools 证据仍保持 `blocked`，不把 Pages 截图冒充双端真实验收。

## 2. 本轮涉及文件

| 文件 | 内容 |
| --- | --- |
| `docs/schema.js` | 补充角色权限与申请边界；修正 40 画面统计 |
| `docs/templates.js` | 增加角色门禁、申请加入提示、路线剖面与 route retry |
| `docs/app.js` | 更新 17 正式 + 23 原型 / 40 画面总览文案 |
| `docs/index.html` | 更新 meta、header 与画面总数文案 |
| `docs/styles.css` | 删除旧 club 三 tab / 成员 / 活动 / 封面重试状态机样式 |
| `docs/ui-sync-manifest.json` | 更新 source / prototype digest、正式路由与 Pages 截图说明；DevTools 证据继续保持 blocked |
| `docs/evidence/ui-sync/2026-10-16-design-acceptance/*-pages.png` | 重新采集 17 张 375×812 Pages 原型截图 |
| `tests/pages-full-app-prototype.test.ts` | 增加权限、申请、40 画面隔离、旧 CSS 与路线降级契约 |
| `tests/showcase-pages-contract.test.ts` | 同步俱乐部与路线分析 Pages 契约 |
| `docs/verification/2026-10-18-pages-full-app-prototype.md` | 记录本轮实际定向验证 |

## 3. 实际执行结果

### Prettier

```text
$ npx prettier --write docs/app.js docs/index.html docs/schema.js docs/styles.css docs/templates.js tests/pages-full-app-prototype.test.ts tests/showcase-pages-contract.test.ts docs/verification/2026-10-18-pages-full-app-prototype.md
✓ 完成
```

### 定向契约

```text
$ npx vitest run tests/pages-full-app-prototype.test.ts tests/showcase-pages-contract.test.ts tests/club-center-runtime.test.ts tests/route-analysis-contract.test.ts
✓ Test Files  4 passed (4)
✓ Tests       109 passed (109)
```

### 语法与 diff

```text
$ node --check docs/templates.js && node --check docs/app.js && node --check docs/schema.js
✓ 通过

$ git diff --check
✓ 通过
```

### UI 同步

首次执行准确报告 prototype digest 已变化，随后将清单摘要更新为工具计算值并重新执行：

```text
$ npm run check:ui-sync
✓ 通过
```

## 4. 全量门禁与浏览器验收

```text
$ npm run validate
✓ 通过（格式、Lint、类型、全量测试、设计/UI 同步、治理、云函数包与构建门禁）

$ npm run coverage
✓ Test Files  96 passed (96)
✓ Tests       1222 passed (1222)
✓ Statements 81.70% · Branches 75.84% · Functions 81.36% · Lines 85.12%

$ npm run audit:all
✓ 主项目与云函数依赖审计通过
✓ 微信上传工具 5 个已评估且无上游修复的例外，沿用至 2027-01-15
```

Lint 保留 1 条 main 已存在的 `profile-edit/index.ts` 未使用 `eslint-disable` warning，无 error；本次 docs-only 任务未顺手修改业务代码。

浏览器验收使用**本地 Aime 浏览器**访问 `http://127.0.0.1:4173/index.html`：

- 逐一打开 17 条正式 hash 路由并采集 375×812 Pages 截图。
- 最后一轮单独复验 `club/center`；推荐俱乐部同时展示“申请加入”和 disabled 的“查看详情”。
- 复验 `route-analysis/no-waypoint` 存在 `data-profile-chart="no-waypoint"` 的真实海拔剖面 SVG。
- 复验 `parse-fail` 的“重试解析”进入 `#route-analysis/loading`。
- 浏览器 `errors` 与 `console` 均为空。

## 5. 仍待线上验证

- GitHub Pages 实际部署结果需在 PR 合并、Pages workflow 完成后复验。
- DevTools / 微信真机的真实权限、写入与媒体保存链路不属于本次 docs-only 原型任务，继续保持待验证。
