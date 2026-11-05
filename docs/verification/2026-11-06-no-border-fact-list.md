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
- 影院模式移除 `.detail-page .detailrow` 的独立面板底色，并同步去掉 `.detail-page .btn.secondary` 的高优先级描边覆盖，避免去框后变成一排色块或又出现描边按钮。
- 实测发现共享基线 `miniprogram/styles/aihero-layout.wxss` 的 `.aihero-page.aihero-page .detailrow` 仍带 `border-bottom` 且优先级高于各页规则，会在浅色下把三条行线加回来；已删除该声明与对应 `:last-child` 规则，统一改为 `padding: 8rpx 0 8rpx 20rpx` 给节奏点留位，并去掉 `.settings-page.aihero-page .detailrows` 的外框。设置页自身的入口分隔行按其契约保留。

## 改动文件

- 样式：`miniprogram/pages/activity-detail/index.wxss`、`miniprogram/pages/admin/activity-edit/index.wxss`、`miniprogram/pages/admin/club-applications/index.wxss`、`miniprogram/pages/admin/review-detail/index.wxss`、`miniprogram/pages/club/center/index.wxss`、`miniprogram/pages/registration-form/index.wxss`，以及共享基线 `miniprogram/styles/aihero-layout.wxss`。
- App 更新文案：`miniprogram/pages/settings/index.ts` 仅在当前版本 `2026.11.01.1` 内补充 summary 与功能项，`date` 保持 `2026-11-01`，符合版本-日期契约。
- 文档：`DESIGN.md`、`docs/high-priority-issues.md`、本验收报告。

WXML 结构未改，所有既有交互、数据绑定、aria 标签和触控尺寸保持不变；未新增 token、颜色字面量或字体字面量。

## 本地门禁结果

通过：`format:check`、`lint`、`typecheck`、`check:design`、`test:design`、`check:governance`、`check:release-notes`、`check:main-package`、`test:wxss-contract`、`test:ui-sync`、`build`、`git diff --check`，以及 `npm test` 全量 Vitest **93 个文件 / 1426 个用例全部通过**。共享基线 `aihero-layout.wxss` 修复后，上述门禁与全量 Vitest 再次复跑，结果一致。

`npm run validate`、`npm run coverage`、`npm run audit:all` 由 PR 的 full 门禁在 CI 侧执行，本轮未改动依赖与脚本链。本机默认 npm 镜像的 `audit` 接口返回 405、缺 `zip` CLI 与 Windows 信号差异只影响本地复现，不影响 CI 结论。

## 微信开发者工具实测

客户端授权完成后，用开发者工具重新编译并实测，结论为 `IDE_VERIFIED_LIGHT_DARK`：

- 路径：活动列表 → 往期影像（9 场）→ 首场活动详情 → 滚动到「集合与出发」；浅色与暗色各截图一次，最后恢复默认暗色。
- 浅色：四行（集合时间 / 集合地点 / 预计结束 / 报名截止）完整，表格外框与三条行分隔线均消失，每行标签前有红色方点，眉标与值的字重层级清楚；「费用说明」为无内部线框的白卡；「查看完整路线分析」与「修改活动」为无描边的浅色填充，主 CTA 仍是红色填充。
- 暗色 / 影院：同样无外框与行线，节奏点随 `--color-cinema-red` 呈现，次级按钮无白色描边。
- 首轮实测曾发现两处遗漏并已修复：`.detail-page .btn.secondary` 的高优先级描边覆盖，以及共享 `aihero-layout.wxss` 的 `.aihero-page.aihero-page .detailrow` 行线；修复后重新编译复核，两套主题均达到上述效果。
- console 仅见开发者工具内部 `inspectee MPPage.getCurrent error: Cannot destructure property 'rawPath' ...`，属 IDE 页面元数据查询错误，不是小程序业务报错；页面切换与滚动过程中无业务 error。

截图证据：`C:\Users\89786\AppData\Local\Temp\no-border-light-fixed2.png`（浅色）、`no-border-dark-fixed.png`（暗色）。改前用户截图见会话内 `tmp_444d49b773ba51dcac3df3fbffb30d18.png`。

## 合并、main CI 与部署回读

| 项目 | 结果 |
| --- | --- |
| 合并 | [PR #430](https://github.com/MengEn-Ink/cili-cycling-miniapp/pull/430) 于 2026-11-05T23:34:55Z 以 squash 合入 `main@4ae96e7e512a510031194aec4cf7600edd9ffac0`，源分支 `design/no-border-fact-list` 的远程引用已随合并删除 |
| PR 门禁 | 最终一轮 CI `42129581029` 的 `affected-pr` / `pr-submission` / `validate` 全绿，CodeQL `42128490688` 通过；首个 `synchronize` 运行 `42128490704` 的 `pr-submission` 抓到旧 PR 描述而失败，由后续干净 `edited` 运行覆盖，不视为当前代码失败 |
| main CI | push 运行 `42130474342` 的 `main-validate` / `main-coverage` / `main-audit` / `upload-decision` 全部通过，CodeQL `42130474517` 通过，Pages `42130473737` 发布成功 |
| 自动部署 | main CI 成功后按 `workflow_run` 触发 `微信开发版自动上传 42130944431` 与 `CloudBase 自动部署 42130944404`，两者 head SHA 均为 `4ae96e7e` |

### 部署结果

- 开发版：`微信开发版自动上传 42130944431` 成功。上传回执记录 `version=0.0.419.1`、`robot=1`、`mainSha=4ae96e7e…`；发布回执的 `outcome=SUCCEEDED`、`sideEffectsStarted=true`、`checks.deployment/readback/cleanup` 三项均为 true、`sourceTree=90a4878b3305574e88134cd9bbf070b08a94cc90`，上传诊断为 `UPLOADED / sdk-confirmed`。不可变 artifact 为 `miniprogram-release-receipt-…-1`（`13462688636`）与 `miniprogram-upload-receipt-…`（`13462643701`）。
- CloudBase：`42130944404` 成功结束，但不可变 outcome 明确为 `SKIPPED` / `sideEffectsStarted=false`：本次纯前端样式与文档改动不影响云资源，属于安全跳过，不是实际资源变更。
- 体验版：`微信体验版晋级证据门禁 42131051248` 在 `Require zero GitHub Pages UI drift` 步骤失败，`npm run check:ui-sync -- --strict` 报清单摘要 `sha256:3eb3af30…` 与当前 `sha256:1036334d…` 不匹配；本轮未生成 candidate 或 verified，也没有微信公众平台选版回读。

分支阶段没有手动上传，最终交付只以 main 自动上传的 `0.0.419.1` 为准。开发版上传不等于体验版 verified。

## 未关闭项

- 严格 `check:ui-sync -- --strict` 仍因历史 Pages 原型摘要漂移失败（清单 `3eb3af30…` / `main` 基线 `1cabbc60…`），17 路由同版本双端截图未重采；普通模式沿用仓库受控标签 `sandbox-skip-ui-sync`，与 PR #425 / #427 / #428 一致，strict 不豁免。
- 体验版平台选版与回读、iOS/Android 双真机 UAT、普通成员写链路、目标云权威回读仍独立 BLOCKED；代码包上传不等于体验版 verified。
