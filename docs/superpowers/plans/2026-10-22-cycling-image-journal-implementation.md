# 骑行影像志 Implementation Plan

> **For agentic workers:** 使用 executing-plans 按任务推进，交接时以本清单为准。用户已于2026-10-22明确授权前端、Pages、端到端验收、提交和部署；不重复请求设计或执行确认。

**Goal:** 将已确认的骑行影像志用于正式Pages与原生小程序，并完成真实可执行的验收和部署回读。

**Architecture:** 保留现有17条注册路由、领域服务与媒体处理；历史名片路由作为兼容入口跳转「我的」。在既有WXML/WXSS及Pages模板上重构展示，统一暖米白、墨黑、摄影标题和自然长屏；背景选填修复只改变资料展示校验，不削弱媒体归属或报名必填约束。

**Tech Stack:** TypeScript、原生微信小程序、CloudBase Node.js云函数、原生HTML/CSS/JS、Vitest、Node test、Playwright、miniprogram-automator、GitHub Actions。

---

## 文件职责与边界

- `docs/templates.js`、`docs/styles.css`、`docs/app.js`、`docs/schema.js`：正式Pages的17路由、状态、摄影与交互；独立设计稿继续留作参考。
- `miniprogram/components/activity-card/`、`pages/activities/`、`pages/activity-detail/`、`pages/profile/`、`pages/registrations/`、`pages/club/center/`：影像浏览、本人名片、行程及俱乐部。
- `miniprogram/pages/profile-edit/`、`registration-form/`、`credential/`、`settings/`、`pages/admin/`：表单、有效状态与管理操作。
- `miniprogram/pages/capability-card/`：兼容转跳，保留注册路由与旧文件的可回滚性。
- `cloudfunctions/profile/core.js`、对应Node测试：背景选填；7项完整度、头像专用保存、敏感字段及媒体安全保持。
- `scripts/wechat-devtools-e2e.cjs`、对应Node测试：真实只读E2E更新为名片转跳，保留原始私有证据。
- `docs/ui-sync-manifest.json`、`docs/evidence/ui-sync/`：新截图、真实内容摘要、脱敏与差异；不伪造物理设备结果。
- `DESIGN.md`、`docs/design-system.md`、`docs/high-priority-issues.md`、`miniprogram/config/release.ts`、设置更新日志：执行规范、当前状态和发布版本。

## Task 1：固化已确认方案及基线

- [x] 阅读高优清单、设计契约、正式规范、部署工作流。
- [x] 确认最新 `origin/main` 为 `64f756c027b72befa26d328240d652ed83b6feaf`，创建 `feat/cycling-image-journal-20261022`。
- [x] 核验DevTools已登录、官方CLI和automator可用。
- [x] 将已交付设计稿、规范和本计划作独立文档提交；不上传临时脚本或原始运行证据。

## Task 2：修复背景选填与历史名片入口

- [x] 在 `cloudfunctions/profile/core.node-test.js` 或现有对应测试中，先补无背景保存和移除背景用例，验证当前抛出错误。

```js
const patch = buildUpdate({ gender: '男', background_photo: null }, key, current);
assert.equal(patch.background_photo, null);
assert.equal(profileReadiness({ ...current, ...patch }).completeness, 100);
```

- [x] 校验用合成加密key和完整7项资料，不访问真实个人数据。
- [x] 从 `assertFullProfileReady` 去掉背景必填，保留性别和头像校验；更新背景公开就绪相关说明。
- [x] 对兼容路由写运行用例，期望调用 `wx.switchTab({url:'/pages/profile/index'})`，不再发独立名片请求；先观察旧行为失败后实现。
- [x] 更新既有名片测试以保留数据模型与媒体规则测试，替换独立UI旧断言；运行 `npm run test:cloud` 和定向Vitest。

## Task 3：原生浏览与本人名片

- [x] 将活动默认浏览由横向轮播收敛为摄影纵向列表；保留既有近期／历史、日期过滤、紧凑模式与分页行为。
- [x] 活动卡摄影标题采用底部深色承托，图外显示距离、爬升、时长和集合；整卡点击，移除重复详情／报名双按钮。
- [x] 「我的」使用已有头像和背景，独立预览，深色无人物兜底；显示昵称、性别和登录状态，完整度不足100%才出现缺失项与完善动作。
- [x] 行程使用票据布局和真实状态；公开名单静态昵称与授权头像；俱乐部保持唯一平台和成员只读。
- [x] 仅展示层修改用视觉检查；新列表行为复用并执行现有 `activities-page`、`profile-page` 与行程测试；必要的分页变化先新增失败用例。

## Task 4：原生表单与管理页面

- [x] 单列标签常驻、自然长屏和足够留白；所有主按钮至少96rpx、次操作至少88rpx。
- [x] 头像即时保存及背景上传阶段继续锁定整表；7项校验不新增个人介绍、能力指标或国际电话能力。
- [x] 报名经验三档、默认自行前往、审核／公开／候补结果；凭证只分享活动，不提供图片保存或条码核销。
- [x] 设置按次订阅、微信隐私、安全缓存、管理员Strava状态；六项审核3×2，待审核通过／驳回，已通过确认签到。
- [x] 活动编辑保留实际字段、自动截止、最多3封面、可选群二维码与Strava＋GPX；预览绑定和媒体未完成均锁定发布。
- [x] 执行各页面现有行为测试，避免将视觉约束测试删成空用例；同步版本与更新说明。

## Task 5：正式Pages适配

- [x] 从批准设计的摄影与排版映射到现有 `window.pageTemplates`，保留`data-go`及现有模拟交互约定。
- [x] 摄影用批准方案生成的现有本地WebP，不把人物演示照作为真实用户缺图兜底。
- [x] 历史名片地址回到「我的」；17路由清单不减项，目录不再提供独立名片入口。
- [x] 更新首屏与交付中心入口，提供一键查看最终方案；保留技术文章、历史材料及真实业务边界。
- [x] 用浏览器验证340／375／430px、桌面、所有主状态、长中文、失效图片、报名至取消重报和管理签到；临时脚本及原始截图放`/tmp`。

## Task 6：证据与工程门禁

- [x] 更新DevTools旧名片用例为兼容转跳，先修改 `scripts/wechat-devtools-e2e.node-test.mjs`并看到失败，再改官方runner。
- [x] 运行 `npm run test:devtools:e2e`，记录当前SHA、dirty、版本、环境、真实公开媒体与未覆盖项；只读运行不修改现有用户资料。
- [x] 新采集17路由Pages与可执行DevTools证据；公开截图脱敏，差异/无法获取的真实状态标为blocked。
- [x] 根据真实文件计算UI和Pages摘要，不用历史图片证明新UI已验收。
- [x] 运行 `npm run check:design`、`npm run check:ui-sync -- --strict`、`npm run check:governance`。
- [x] 运行 `npm run validate`、`npm run coverage`、`npm run audit:all`；任何失败修复后完成相应检查。
- [x] 普通成员完整写链路和双物理设备依赖真实可用账号、隔离环境与设备；可执行部分继续推进，条件缺失如实保留blocker，不将mock或管理员smoke签为完整通过。

## Task 7：提交、合入、部署与最终成果

- [x] 按文档、背景修复、UI与证据分组提交；使用Conventional Commits，不把工程配置混入功能修复。
- [x] 推送分支并建立PR，按仓库模板写明问题、影响、实际验收和未覆盖边界。
- [x] 修复PR checks后按本次提交部署授权合入主线；不绕过保护规则，不强推。
- [x] 等待main CI、Pages、CloudBase与微信开发版Actions，读取对应SHA和receipt；必要时仅触发受影响部署。
- [x] 在正式Pages核对最终版与资源，在DevTools复验部署后的客户端和云端响应；每次提交/部署/阻塞变化同步高优清单。
- [x] 生成可查看的最终成果页和有限验收报告，给出正式URL、PR/提交、版本与已验证/未执行事实。

部署记录：PR #342 合入 `f3071cbfe4465695579990a1fb84b1d7edac6455`；main CI、CodeQL、Pages、CloudBase 和微信开发版全部成功。线上 Pages 56/56、51/51、六资源摘要一致；干净主线 DevTools 27/27、零异常，公开媒体缺样使完整 outcome BLOCKED。微信 receipt 版本 `0.0.344.1`，客户端 `2026.10.22.2`；详细结果见本轮 verification 报告。

## 验收不变量

任何照片、排版或页面结构修改都不改变媒体归属、本人/管理员信息可见性、报名名额幂等、取消补偿、单俱乐部权限。设计与模拟器通过只证明对应层；部署回读、普通成员写链路和iOS/Android真机必须分别留证。
