# 浅暗主题可读性优化实施计划

**Goal:** 在现有浅暗主题机制上减少装饰框线并提高字体与信息层级可读性。

**Architecture:** 复用 `appearance.ts` 的双主题覆盖及 `aihero-layout.wxss` 的共享布局。正式 `docs/styles.css` 镜像同步，历史设计 snapshot 不改。现有业务和切换机制保持。

**Tech Stack:** 原生微信 WXML/WXSS、TypeScript、Pages HTML/CSS、Vitest、Playwright。

本会话直接按已授权方案执行；不创建提交、不推送、不部署。

执行结果：代码完成；生产CSS消费与Pages各136组合、应用1425项、Node/消费者648项、云包572项通过。完整validate被7份已有研究产物格式阻断，剩余阶段独立执行通过；strict和DevTools实际执行但未通过，保留阻塞。已更新DESIGN、高优清单与[验证记录](../../verification/2026-11-03-theme-readability.md)。下列勾选表示任务执行完成，不代表正式验收通过。

## 1. 建立可失败的消费验证

- [x] 在浏览器回归 `tests/theme-consumer-regression.node-test.mjs` 增加真实样式消费断言：两主题必要控件边界至少 3:1，三列指标无外框/竖线，标签至少 14px（375px 对应）。
- [x] 执行 `node --test tests/theme-consumer-regression.node-test.mjs`，保存预期失败到私有临时路径。
- [x] 对照 `tests/theme-runtime-integration.test.ts` 的双端同值与 4.5:1 门禁，确认媒体和二维码保留独立角色。

## 2. 主题与共享布局

- [x] 修改 `miniprogram/config/appearance.ts` 的浅色页面、文字及原生浅色背景；必要边界加强，装饰边界独立。
- [x] 修改 `miniprogram/styles/aihero-layout.wxss`：连续章节移除装饰线，指标保持列数、去竖线并放大标签，辅助文字与正文层级优化。
- [x] 修改 `miniprogram/app.wxss` 中 AI Hero 消费范围：自然语言字段、标签不泛用等宽字体；标题仍无衬线，数字保留等宽。
- [x] 同步正式 `docs/styles.css` 的主题块与当前 AI Hero 布局，保持 1rpx=0.5px 换算。
- [x] 运行浏览器消费回归与主题测试，修复由实际布局或对比引起的失败。

## 3. 页面与静态契约

- [x] 逐页对照 17 条路由和当前 Pages 骨架，核对媒体标题、状态、底部操作、长值和窄屏。
- [x] 执行 `npm run check:design`、`npm run check:main-package`。
- [x] 仅同步旧浅色值与更新说明文案的精确断言，不削弱门禁；新增覆盖属于浏览器UI回归。

## 4. 验证与交付

- [x] 执行 `node scripts/check-appearance-pages.mjs`，四宽度 × 两主题 × 17 路由，实际查看核心截图。
- [x] 使用 `scripts/pages-visual-acceptance/capture-routes.mjs` 补充正式 Pages 路由截图；原始结果留私有临时路径。
- [x] 尝试官方 DevTools 只读补采；7通过/9失败/1超时，无法完成17路由，保留 strict 阻塞，不重签历史截图。
- [x] 执行 `npm run check:ui-sync -- --strict`、`npm run check:governance`、`npm run validate`，逐项记录真实结果。
- [x] 更新 `DESIGN.md`、本轮验证报告和高优清单的本轮状态及下一步；说明部署、成员写链路和双物理真机未执行。
