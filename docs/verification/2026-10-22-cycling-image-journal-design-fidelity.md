# 骑行影像志 16 页设计稿逐页对齐验收

## 验收结论

本轮基于最新 `main` 与本地设计源 `http://localhost:63741/?page=profile`，复核活动、详情、路线、报名、行程、凭证、个人资料、设置、俱乐部及管理端共 16 个核心页面。最新主线已经承载设计稿中的页面布局、样式与交互，本次补齐三端字体主题令牌和标题语义后，代码层验收为 **PASS**。

合并后的正式 Pages、main CI 与微信开发版上传必须继续按 workflow 结果复核；在这些结果产生前，环境交付结论保持 **BLOCKED**。

## 复现与根因

- 设计源、正式 Pages 与小程序端分别硬编码宋体、系统正文字体和等宽数字字体。
- 表单、凭证、设置和管理页虽然已采用骑行影像志布局，但标题节点没有统一的 `editorial` 语义。
- 页面后续调整时可能出现设计源与产品端字体漂移，现有测试无法逐页阻断。

## 解决方案

- 在三端声明同名 `--font-family-body`、`--font-family-editorial`、`--font-family-mono`。
- 摄影首页、详情、路线、行程、个人名片和俱乐部页改为消费编辑标题令牌。
- 报名、凭证、资料编辑、设置及管理页标题补齐 `editorial` 语义。
- 客户端版本升级至 `2026.10.22.3`，同步正式 Pages Schema 与 UI 摘要。

## 页面覆盖

| 旅程 | 页面 |
| --- | --- |
| 活动发现 | 活动、活动详情、完整路线分析 |
| 报名交付 | 填写报名、我的行程、骑行凭证 |
| 骑友资料 | 我的、编辑个人资料、设置 |
| 俱乐部 | 俱乐部 |
| 组织管理 | 活动管理、编辑活动、报名审核、审核报名、俱乐部管理、俱乐部资料 |

页面结构、跳转、表单、审核、媒体预览与管理操作复用最新 main 的现有实现；本轮不新增后端能力、不修改接口或数据契约。

## 验证结果

| 类型 | 命令 | 结果 |
| --- | --- | --- |
| 定向契约 | `npx vitest run tests/cycling-image-journal-theme-token.test.ts tests/cycling-image-journal-pages.test.ts tests/settings-page.test.ts tests/boiling-point-high-contrast-system.test.ts` | PASS，4 个文件、41 个测试 |
| 全量校验 | `npm run validate` | PASS，106 个文件、1356 个测试 |
| 覆盖率 | `npm run coverage` | PASS；Lines 86.55%、Branches 77.47%、Functions 82.41%、Statements 83.17% |
| 云端覆盖率 | `npm run coverage` | PASS；Lines 91.02%、Branches 89.00%、Functions 96.60%、Statements 90.06% |
| 安全审计 | `npm run audit:all` | PASS；除微信上传工具已登记例外外无高危漏洞 |
| UI 同步 | `npm run check:ui-sync -- --strict` | PASS，双端摘要一致 |
| 提交门禁 | `verify_squash.sh` | PASS，单提交、中文提交、trailer 与远端同步均满足 |

## 适用边界

- 小程序不保证所有设备安装相同中文字体；令牌按 `Songti SC`、`STSong`、`serif` 顺序降级，正文按系统中文字体降级。
- 本轮未改变图片来源和业务数据，页面真实内容长度仍会影响自然换行，这是数据适配而非设计漂移。
- CloudBase 不适用：没有云函数、索引、权限或 Schema 变更。
