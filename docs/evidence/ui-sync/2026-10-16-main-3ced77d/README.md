# UI 同步证据：main 3ced77d

- 源代码基线：`3ced77dc07cc39091dbd05c00872a63af30d50f6`
- 客户端版本：`2026.10.16.68`
- 采集时间：2026-10-16 04:07–04:09 UTC
- 微信开发者工具：从 `3ced77d` 独立临时克隆运行；为采集设置页证据，临时克隆应用了本变更最终提交的 `scripts/wechat-devtools-e2e.cjs` 设置页检查补丁，应用源码仍保持 `3ced77d` 不变
- 自动化结果：15 项通过、0 项失败、0 个运行时异常，详见 `devtools-results.json`
- 复现方式：检出本变更最终提交后运行 `npm run test:devtools:e2e`；结果文件中的 `git` 字段标识被测小程序源码基线，不表示 E2E 驱动文件未应用补丁

## 覆盖路由

| 路由 | 微信开发者工具 | GitHub Pages |
| --- | --- | --- |
| 活动首页 | `activities-devtools.png` | `activities-pages.png` |
| 活动编辑 | `admin-activity-edit-devtools.png` | `admin-activity-edit-pages.png` |
| 设置与版本 | `settings-devtools.png` | `settings-pages.png` |

本次重新采集了最新 main 的微信开发者工具截图。Pages 原型摘要与上一基线完全一致，因此复用上一基线中同一摘要对应的脱敏 Pages 截图；未伪造或人工修改截图内容。人物与业务数据均为演示数据，仓库证据不包含访问凭证、真实联系方式或受保护媒体地址。

## 验收结论

- 活动、图片回显、行程、凭证、个人资料、骑行名片和设置页版本检查均通过。
- 设置页首条版本日志与运行时版本 `2026.10.16.68` 一致。
- 清单的 UI 源摘要绑定到上述完整 Git SHA；后续普通与严格 UI 同步门禁均从该基线计算漂移。
