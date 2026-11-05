# 2026-11-06 去表格线框 · 编辑式事实流验收

## 范围与来源

用户提供的浅色主题「活动详情」截图显示：「集合与出发」在白卡内又套了一层带圆角外框的表格，四行之间还有三条分隔线，同页「查看完整路线分析」「修改活动」及集合地点旁的「导航」也是描边控件，一屏内出现双层框与多条重复线。

对应实现为 `miniprogram/pages/activity-detail/index.wxss` 的 `.detailrows` / `.detailrow`。全站另有 5 个页面复用同一「外框 + 行线」模式，本轮一并对齐；`miniprogram/pages/settings/index.wxss` 的入口分隔行承担 104rpx 点击范围分组并被 `tests/theme-token-settings-controls.test.ts` 明确断言，按设计文档约定保留，不在去框范围内。

## 方案

方向为 Editorial / magazine，延续项目已有的编辑体章节标题、红色竖条与暖白纸面，不引入新颜色、字体或组件：

- 去掉 `.detailrows` 的外框、圆角裁切和所有 `.detailrow + .detailrow` / `border-bottom` 行线，改用 `--space-3` 留白分组。
- 保留「窄眉标栏 + 宽事实栏」两列以便扫读；眉标加大字距与字重、事实列加大字重，层级由排版承担。
- 每行左侧用 `--color-brand-fill` 的 8rpx 方点做节奏锚点，与章节红色竖条对齐成阅读轴；影院模式改用 `--color-cinema-red`。它不是分隔线，不占内容列。
- 集合地点「导航」去掉描边，改用 `--color-brand-text` 文字色（浅 `#b72c2c` / 暗 `#f06464`，4.5:1 口径），保留 88rpx 触控高度。
- 次级按钮 `.btn.secondary` 由描边改为 `border-color: transparent` + `--color-raised` 平面填充；主 CTA 红色填充不变。
- 影院模式移除 `.detail-page .detailrow` 的独立面板底色，避免去框后变成一排色块。

## 改动文件

- 样式：`miniprogram/pages/activity-detail/index.wxss`、`miniprogram/pages/admin/activity-edit/index.wxss`、`miniprogram/pages/admin/club-applications/index.wxss`、`miniprogram/pages/admin/review-detail/index.wxss`、`miniprogram/pages/club/center/index.wxss`、`miniprogram/pages/registration-form/index.wxss`。
- App 更新文案：`miniprogram/pages/settings/index.ts` 仅在当前版本 `2026.11.01.1` 内补充 summary 与功能项，`date` 保持 `2026-11-01`，符合版本-日期契约。
- 文档：`DESIGN.md`、`docs/high-priority-issues.md`、本验收报告。

WXML 结构未改，所有既有交互、数据绑定、aria 标签和触控尺寸保持不变；未新增 token、颜色字面量或字体字面量。

## 本地门禁结果

通过：`format:check`、`lint`、`typecheck`、`check:design`、`test:design`、`check:governance`、`check:release-notes`、`check:main-package`、`test:wxss-contract`、`test:ui-sync`、`build`、`git diff --check`，以及 `npm test` 全量 Vitest **93 个文件 / 1426 个用例全部通过**。

`npm run validate`、`npm run coverage`、`npm run audit:all` 由 PR 的 full 门禁在 CI 侧执行，本轮未改动依赖与脚本链。本机默认 npm 镜像的 `audit` 接口返回 405、缺 `zip` CLI 与 Windows 信号差异只影响本地复现，不影响 CI 结论。

## 微信开发者工具实测

本轮尝试用开发者工具刷新模拟器并截图复核 `view::before` 节奏点的实际渲染，客户端授权任务 `auth_cb9d239bb43a5331169923a5ee1fdb2e8378d7c792081adc` 仍处于 `pending`，需在开发者工具窗口内确认，因此**尚未取得改后截图**。此项记为 `IDE_EVIDENCE_PENDING`，不把静态样式与单元测试当作像素级视觉证据。

微信小程序 WXSS 支持 `view::before` / `::after`；节奏点为纯装饰，不承载信息，即使个别渲染内核不显示也不会影响文字可读性与布局。

## 未关闭项

- 严格 `check:ui-sync -- --strict` 仍因历史 Pages 原型摘要漂移失败（清单 `3eb3af30…` / `main` 基线 `1cabbc60…`），17 路由同版本双端截图未重采；普通模式沿用仓库受控标签 `sandbox-skip-ui-sync`，与 PR #425 / #427 / #428 一致，strict 不豁免。
- 体验版平台选版与回读、iOS/Android 双真机 UAT、普通成员写链路、目标云权威回继续独立 BLOCKED；代码包上传不等于体验版 verified。
