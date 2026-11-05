# 2026-11-05 品牌红文字对比度修复与视觉对齐验收

本文件只记录本轮真实执行结果，不把历史运行重标为当前版本，也不把模拟器或开发版证据当作真机与体验版验收。

## 范围与基线

- 基线 `origin/main@4676626`，工作分支 `fix/brand-text-contrast`，提交 `0c5b5b6`、`53312d8` 及 CI 契约回归修复提交，PR #427。
- 范围：浅暗主题品牌红文字可读性、主题对比度机器契约、主包上传口径、设置页 App 更新说明。
- 不涉及云函数、数据库、权限、业务状态机、新增字段或接口。

## 修改方案

`miniprogram/app.wxss` 新增文字专用语义 token `--color-brand-text`，根值沿用暗色品牌红；`miniprogram/config/appearance.ts` 按模式覆盖为暗色 `#f06464`、浅色 `#b72c2c`。12 个 WXSS 共 20 处红色小字、强调标签与可点击文字从 `--color-brand` / `--color-brand-active` / `--color-action` / `--color-action-active` 统一切换；移除 `.conclusion-label` 的 `opacity: 0.76`。填充、边框、渐变与图标继续用原 token，按非文字 3:1 判定；按钮白字由既有静态 `text-on-action`（4.63:1）保证。

`miniprogram/config/theme-contract.json` 的 `appearanceContrast` 新增画布 / 卡片 / raised 三组浅暗对比度与一组启动首帧静态对，覆盖 31 → 37 组；`requiredForegrounds` 加入 `--color-brand-text`。`scripts/check-design.mjs` 新增 `collectBrandTextTokenViolations`，禁止把填充 / 边界 token 直接用作 `color:`，并接入 `runRepositoryCheck`；`scripts/check-design.node-test.mjs` 从 18 增至 20 个用例，含浅色品牌红文字回归与 legacy 文字色 fail-closed。

`project.config.json` 用 `packOptions.ignore` 把 checker-only、运行时零 import 的 `theme-contract.json` 排除上传；`scripts/check-main-package-size.mjs` 读取该配置，使主包门禁按微信实际打包口径计算，硬限额 459315 字节未放宽。

CI 契约回归修复：`docs/styles.css` 的 `:root` 与浅暗镜像块同步新增 `--color-brand-text`（暗 `#f06464` / 浅 `#b72c2c`，与 `appearance.ts` 同值；基础块回退到 `--color-brand-active`），满足「Pages 浅暗语义覆盖与生产同值」契约，Pages 视觉无变化；设置页 App 更新的 `date` 回退到 `2026-11-01`，与版本 `2026.11.01.1` 的版本-日期契约保持一致，本轮只修订同一版本的说明文案与功能项。

## 量化结果

| 前景 / 背景 | 修复前 | 修复后 | 口径 |
| --- | --- | --- | --- |
| 浅色画布小字 | 3.74:1 | 5.69:1 | 文字 4.5:1 |
| 浅色白卡片小字 | 4.05:1 | 6.16:1 | 文字 4.5:1 |
| 浅色 raised 小字 | 3.45:1 | 5.25:1 | 文字 4.5:1 |
| 暗色画布小字 | 4.26:1 | 6.31:1 | 文字 4.5:1 |
| 按钮填充 + 白字 | 4.63:1 | 4.63:1 | 文字 4.5:1 |
| 浅色原生 TabBar 选中 | 5.69:1 | 5.69:1 | 文字 4.5:1 |

主包门禁：`541235 → 452890` 字节，减少 88345 字节，硬限额余量 6425 字节（本机工作树已统一为 LF，与 CI 口径一致）。

## 本地门禁结果

通过：`format:check`、`lint`、`typecheck`、`npm test`（Vitest 5.0.5，93 个文件 / 1426 个用例全部通过）、`check:design`（37 组对比度、0 个未定义 token、0 个页面颜色/字体字面量）、`test:design`（20/20）、`check:governance`、`check:release-notes`、`check:main-package`、`test:wxss-contract`、`test:ui-sync`、`test:release-notes`、`test:journey-evidence`、`test:bootstrap`、`build`，以及 `test:ci-contract` / `test:deploy` 中与环境无关的用例。

本机干净重装依赖后，先前记录的 Vitest worker 异常（`Cannot read properties of undefined (reading 'config')`）不再复现，因此本轮已能给出全量 Vitest 结论；`git diff --check` 通过。

仍未通过，且均不是本轮代码回归：

- `check:ui-sync`（普通模式）与 `check:ui-sync -- --strict`：历史 Pages 原型摘要漂移。清单 `3eb3af30…`，`origin/main@4676626` 已是 `1cabbc60…`，本轮同步 Pages 镜像后为 `1036334d…`。按 AGENTS.md 未重采同版本 17 路由双端证据，不擅自改摘要，也不把旧截图重标为当前版本。
- `test:ci-contract` / `test:deploy` 个别用例：本机缺 `zip` CLI、Windows 下 SIGTERM/SIGKILL 语义差异；CI 为 Linux，不受该限制。

## PR CI 失败定位与修复

首个 CI 运行 `42057981405` 的 `affected-pr` 因 `npm test` 的 3 个断言失败而中断，`validate` 聚合任务随之失败：

| 失败用例 | 根因 | 修复 |
| --- | --- | --- |
| `tests/settings-page.test.ts:69` | 设置页 `date` 被改为 `2026-11-05`，与版本 `2026.11.01.1` 的版本-日期契约不一致 | 回退为 `2026-11-01`，保留同一版本的说明文案与功能项更新 |
| `tests/theme-runtime-integration.test.ts:88` | 源码契约要求包含 `date: '2026-11-01'` | 同上 |
| `tests/theme-runtime-integration.test.ts:78` | 新增 `--color-brand-text` 未同步到 `docs/styles.css` 浅暗镜像，解析结果为 `undefined` | 在 `:root` 与浅暗两个块补齐同值 token，Pages 视觉零变化 |

本 PR 因改动 `project.config.json` 命中全局风险规则，`affected-pr` 走 full 模式（完整 `validate` + `coverage` + `audit:all`）。对于历史视觉证据欠账，PR 沿用前序已合并 UI PR #425 的仓库受控标签 `sandbox-skip-ui-sync`，其定义是「经授权的沙箱交付可跳过普通 CI 视觉证据同步；严格发布门禁不跳过」。该标签只跳过普通模式的视觉证据同步，不跳过严格发布门禁；17 路由双端证据、真机 UAT 与体验版平台回读仍独立 BLOCKED。

## 微信开发者工具实测

- CLI 授权有效、登录账号蒙恩、skill 版本 0.3.11（`versionRelation: equal`）。
- 编译刷新成功；浅色 / 暗色在设置页切换成功，活动首页与路线分析页截图已复核。
- 浅色路线分析页错误态：暖白纸面，「重新加载」文字为深红（新文字 token），描边、叹号与底部填充按钮仍为亮品牌红，符合「文字 4.5:1 / 非文字 3:1」的分工。
- 编译产物 `dist/config/appearance.js` 已确认暗 `#f06464`、浅 `#b72c2c`。
- 自动化查询页面元数据时出现 `inspectee MPPage.getCurrent error`（开发者工具内部 inspectee 在页面切换瞬间的错误），非小程序业务 console 报错；业务页面无 error。
- 已恢复默认暗色主题。

## 上传与体验版

- `wechatide upload` 成功，版本 `0.0.427.1`，描述「视觉对齐：浅暗主题品牌红文字对比度修复」，包总大小 1188275 字节，主包 569432 字节。
- 该动作是代码包上传。按 `docs/releases/experience/README.md`，体验版须由发布负责人在微信公众平台选版并回读同版本、SHA 与入口，或由授权第三方通过开放平台 `commit` 生成；本轮没有平台选版回读证据，因此**不标记体验版 verified，不把上传成功称为体验版发布完成**。
- 历史阻塞未变：开发管理权限托管、严格 UI 同步摘要漂移、17 路由同版本双端证据、普通成员写链路与 iOS/Android 双真机 UAT。
