# 2026-11-05 品牌红文字对比度修复与视觉对齐验收

本文件只记录本轮真实执行结果，不把历史运行重标为当前版本，也不把模拟器或开发版证据当作真机与体验版验收。

## 范围与基线

- 基线 `origin/main@4676626`，工作分支 `fix/brand-text-contrast`，提交 `0c5b5b6`，PR #427。
- 范围：浅暗主题品牌红文字可读性、主题对比度机器契约、主包上传口径、设置页 App 更新说明。
- 不涉及云函数、数据库、权限、业务状态机、新增字段或接口。

## 修改方案

`miniprogram/app.wxss` 新增文字专用语义 token `--color-brand-text`，根值沿用暗色品牌红；`miniprogram/config/appearance.ts` 按模式覆盖为暗色 `#f06464`、浅色 `#b72c2c`。12 个 WXSS 共 20 处红色小字、强调标签与可点击文字从 `--color-brand` / `--color-brand-active` / `--color-action` / `--color-action-active` 统一切换；移除 `.conclusion-label` 的 `opacity: 0.76`。填充、边框、渐变与图标继续用原 token，按非文字 3:1 判定；按钮白字由既有静态 `text-on-action`（4.63:1）保证。

`miniprogram/config/theme-contract.json` 的 `appearanceContrast` 新增画布 / 卡片 / raised 三组浅暗对比度与一组启动首帧静态对，覆盖 31 → 37 组；`requiredForegrounds` 加入 `--color-brand-text`。`scripts/check-design.mjs` 新增 `collectBrandTextTokenViolations`，禁止把填充 / 边界 token 直接用作 `color:`，并接入 `runRepositoryCheck`；`scripts/check-design.node-test.mjs` 从 18 增至 20 个用例，含浅色品牌红文字回归与 legacy 文字色 fail-closed。

`project.config.json` 用 `packOptions.ignore` 把 checker-only、运行时零 import 的 `theme-contract.json` 排除上传；`scripts/check-main-package-size.mjs` 读取该配置，使主包门禁按微信实际打包口径计算，硬限额 459315 字节未放宽。

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

通过：`format:check`、`lint`、`typecheck`、`check:design`（37 组对比度、0 个未定义 token、0 个页面颜色/字体字面量）、`test:design`（20/20）、`check:governance`、`check:release-notes`、`check:main-package`、`test:wxss-contract`、`test:ui-sync`、`test:release-notes`、`test:journey-evidence`、`test:bootstrap`、`build`、`check:ui-sync`（非 strict）、`test:ci-contract` 与 `test:deploy` 的其余用例。

未通过，均为本机环境或历史欠账，不是本轮代码回归：

- `npm test`：Vitest 5.0.5 worker 收集阶段报 `Cannot read properties of undefined (reading 'config')`；最小探针、Node 22.22.2 与 24.22.2、空配置、`--pool=forks`、单 worker 均复现，本机无法给出全量 Vitest 结论。
- `check:ui-sync -- --strict`：历史 Pages 原型摘要漂移，清单 `3eb3af30…` / 当前 `1cabbc60…`；按 AGENTS.md 未重采同版本 17 路由双端证据，不擅自改摘要。
- `test:ci-contract` 3 项、`test:deploy` 2 项：缺 `zip` CLI、Windows 下 SIGTERM/SIGKILL 差异、以及依赖 Vitest 的 pr-preflight 前置用例。

`npm run validate`、`npm run coverage`、`npm run audit:all` 因上述本机 Vitest 阻塞未完整执行；`git diff --check` 通过。

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
