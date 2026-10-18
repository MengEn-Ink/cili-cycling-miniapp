# 统一界面风格验收记录

## 版本与范围

- 日期：2026-10-18
- 客户端版本：`2026.10.18.8`
- 范围：小程序全局主题、共享控件、运行时原生外观、Pages 跨端映射、设置页更新说明与契约测试。
- 明确不改：`cloudfunctions/**`、后端、CloudBase、业务流程、Pages 原型结构、完整路线分析的图表语义色与 Canvas 绘图色、俱乐部圆形头像。

## 实现结果

1. `miniprogram/app.wxss` 按 Primitive、Semantic、Component 三层组织主题变量，保留原有语义变量名，并补齐间距、边框、排版、动效与焦点变量。
2. 品牌基线保持朱红 `#e13b2b`、米白 `#fbf5ea`、墨黑 `#211f1c`；圆角收敛为 8 / 12 / 20 / 28 / 32rpx，阴影同步减弱。
3. 全局按钮、卡片、输入、标签、分段和焦点样式优先使用组件层变量；未对局部页面做机械替换。
4. 新增 `miniprogram/config/theme.ts`，作为原生外观 API 的运行时颜色事实源；`theme-service.ts` 不再重复颜色字面量。`app.json` 继续使用平台要求的静态颜色，并由测试核对一致性。
5. `docs/design-contract.json` 与 `docs/styles.css` 已同步 1rpx = 0.5px 的 Pages 映射。
6. 设置页当前更新说明为“界面风格统一”，并在变基时保留最新 main 的 `2026.10.18.7`“图片上传稳定性升级”为历史项。
7. `docs/ui-sync-manifest.json` 的 source / prototype 摘要由仓库工具算法计算更新；17 条正式路由的 Pages 截图已使用本地 Aime 浏览器重采为 375×812，DevTools 证据继续保持 `blocked`。

## 实际验证

全量验证首次运行时，6 个旧视觉契约文件共暴露 10 项失败；失败断言仍要求旧语义变量、旧圆角和旧行高。核对产品样式后确认这是组件层变量与圆角收敛带来的契约更新，不是共享卡片遗漏迁移；小程序样式中未发现共享卡片硬编码 `36rpx`，Pages 中保留的 `18px` 位于俱乐部头像窄屏规则，属于圆形头像豁免。随后仅更新对应契约断言，没有回退视觉实现或放宽断言。

- `npx vitest run tests/remaining-pages-visual-contract.test.ts tests/ui-brand-product-polish-contract.test.ts tests/boiling-point-full-page-contrast-contract.test.ts tests/editorial-performance-layout.test.ts tests/cili-activity-theme-contract.test.js tests/boiling-point-first-batch-contract.test.ts`：修复后通过，6 个文件、55 项测试。
- `npx vitest run tests/*theme*.test.ts tests/*design*.test.ts tests/settings-page.test.ts tests/*route*.test.ts`：通过，17 个文件、160 项测试。
- `npx vitest run tests/unified-theme-tokens-contract.test.ts tests/theme-service.test.ts tests/theme-runtime-integration.test.ts tests/theme-token-settings-controls.test.ts tests/theme-accessibility-regressions.test.ts tests/boiling-point-theme-contract.test.ts tests/boiling-point-high-contrast-system.test.ts tests/boiling-point-color-calibration.test.ts tests/unified-boiling-point-ui-contract.test.ts tests/ui-system-components-contract.test.ts tests/settings-page.test.ts tests/route-analysis-contract.test.ts tests/route-analysis.test.ts tests/route-analysis-runtime.test.ts tests/route-visual-unification.test.ts tests/route-feedback-fixes.test.ts`：通过，16 个文件、111 项测试。
- `npm run test:design`：通过，9 项测试。
- `npm run check:design`：通过，95 个双端变量、15 组对比度。
- `npm run check:release-notes`：通过。
- `npm run validate`：修复旧视觉契约后全量通过。
- `npm run coverage`：修复后全量通过；CloudBase `cloud.ts` 覆盖率门禁为 lines 90.52%、branches 88.67%、functions 96.24%、statements 89.26%。
- `npm run check:ui-sync`：通过，当前 UI 与 Pages 摘要一致，未同步 UI 提交为 0。
- `npx prettier --check <本次变更文件>`：通过。
- `git diff --check`：通过。

## 证据边界

Pages 视觉验收使用**本地 Aime 浏览器**访问 `http://127.0.0.1:4174/index.html`，逐一打开 17 条正式 hash 路由并重采 375×812 截图；浏览器 `errors` 与 `console` 均为空。微信开发者工具与真机证据仍保持 `blocked`，本次没有把 Pages 截图冒充双端真实验收；主题开发版由合并后的 GitHub Actions 上传后再核对。
