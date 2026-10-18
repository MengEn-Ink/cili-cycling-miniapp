# 2026-10-18 俱乐部中心 Pages 交互原型验收

## 版本与范围

- 分支：`feat/club-center-pages-prototype`
- 原型入口：`docs/index.html#club-center`
- 范围：仅更新 GitHub Pages 设计原型，不修改小程序生产页面、CloudBase 接口或应用发布日志。

## 验收路径

1. 从研发交付中心进入“真实运行页 · 俱乐部主页”。
2. 检查顶部背景、叠压头像、身份、用户数 2 人和容量 50 人。
3. 切换活动、成员、俱乐部资料页签，并使用方向键、Home、End 验证键盘导航。
4. 在成员或资料页签打开更多菜单，确认关闭后仍保留当前页签。
5. 验证加载、活动空态、网络失败、背景失败与重新加载背景状态。

## 自动化验证

- `npx vitest run tests/showcase-pages-contract.test.ts`：66 个用例通过。
- `npm run coverage`：95 个测试文件、1215 个用例通过；CloudBase 覆盖率门禁通过。
- `CILI_SKIP_UI_SYNC=1 npm run validate`：通过；本次 Pages-only 变更未伪造或替换小程序 DevTools 截图证据。
- `npm run audit:all`：通过。
- `node scripts/check-design-contract.mjs`：32 个双端变量、15 组对比度通过。
- `git diff --check`：通过。

## 静态视觉验收

使用 `html_vision` 分别检查活动态与成员态：

- 顶部背景、头像、三栏容量数据与三页签渲染正常。
- 容量区没有白色卡片，也没有“还可加入多少骑友”或邀请话术。
- 移动原型框内无溢出、遮挡或破损资源。
- 页面控制台无错误。

## 状态与无障碍

- 页签使用 `tablist`、`tab` 和 `tabpanel` 语义，维护 `aria-selected`、`tabindex` 与 `hidden`。
- 方向键、Home、End 在页签内部切换并恢复焦点，不触发全局原型导航。
- 更多菜单维护 `aria-expanded`，打开和关闭不会重置当前页签。
- 背景加载失败进入明确降级态，可执行重新加载。
- 页面标明“设计原型 / Mock 数据”，未把活动和成员示例伪装为已接入数据。

## 结论与发布边界

本地 Pages 契约、全量测试、覆盖率、设计契约、安全审计和静态视觉验收均通过。合并后只需等待 GitHub Pages workflow 发布并回读正式 URL；本次不部署 CloudBase，也不上传微信开发版。
