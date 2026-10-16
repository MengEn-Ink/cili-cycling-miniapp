# Pages 与微信运行态验收实施计划

**Goal:** 以 `40324f1b` 最新主干及其 Pages 为起点，完成可复现的模拟器验收、视觉校准、统一设计规范和约束门禁。

**Architecture:** 继续使用原生 WXML/WXSS/TypeScript、官方 miniprogram-automator 和现有 Pages。真实云端 smoke 与脱敏视觉证据分开记录；任何模拟器结果均不能关闭 iOS/Android 物理真机 UAT。

**Tech Stack:** Node.js 24、Vitest、Node test、微信开发者工具、CloudBase、HTML/CSS/JS、GitHub Actions。

本次按用户“开始实操、基于最新 Pages 校准并提交”的授权直接执行；不引入新主题候选。

## 1. 基线和问题

- [x] 同步 `origin/main`，确认当前无开放 PR，主线 CI/Pages 成功。
- [x] 阅读高优清单、现有主题规范、Pages 源码、E2E 驱动与运行手册。
- [x] 启动现有只读云端 smoke，原始输出保存于仓库外 `/tmp/cili-e2e-20261016/baseline`。
- [x] 查看在线 Pages 及微信活动首页、活动编辑截图。

已确认：Pages 与全局小程序主操作颜色冲突；旧主题规范与线上 Pages 不一致；照片删除按钮白底白字；旧 P0 手册仍要求已退役 OAuth；截图门禁只有三个路由，E2E 文档与实际脚本覆盖范围也不符。

## 2. 统一设计约束

- [x] 新增 `docs/design-system.md`，明确最新版 Pages 的结构、统一色彩、按钮、输入、间距、安全区和例外。
- [x] 新增 `docs/design-contract.json` 与 `scripts/check-design-contract.mjs`，使用可计算的颜色对比度、两端 token 一致性、必要页面范围和可见交互规范。
- [x] 使用 Node test 对颜色漂移、对比度不足、遗漏页面、缺失截图及错误状态记录写反例，运行确认失败。
- [x] 修复 `miniprogram/app.wxss`、活动编辑照片操作及相关页面与 Pages 样式。保留当前橙色主操作方向，但采用满足白字 4.5:1 的深橙，不使用亮橙白字。
- [x] 更新旧主题规范入口，避免同时出现两个“唯一标准”。

## 3. 实操与证据

- [x] 增强 `scripts/wechat-devtools-e2e.cjs`：按条件等待，失败也落盘，记录完整 SHA/版本/设备/时间，覆盖 13 个可达页面及可用关键状态。
- [x] 单独记录真实云端读取、表单交互、角色及样本不足的阻塞；不将缺少的普通成员、发布写链路或真机权限验证计为通过。
- [x] 原始截图留在受控本地；公开证据仅使用确认无个人信息的截图，脱敏采集必须明确标注，不替代真实云端断言。
- [x] 在相同 CSS 宽度采集 Pages、微信截图，检查主操作、输入框和长文本；状态与角色不同的页面逐项说明，不标完全一致。
- [x] 校准后再跑 smoke 与视觉采集：24 项通过、13 对截图、长编号和媒体解码实测；更新 v2 清单和逐页差异，禁止只改摘要宣称验收通过。

## 4. Pages 与验收手册

- [x] 更新 `docs/verification/wechat-devtools-e2e.md` 与 `docs/verification/p0-real-registration-journey.md`：基线、部署、数据、角色、13 页覆盖、写后回读、补偿、证据、UAT、回退。
- [x] 在 `docs/delivery-center.js` 接入当前设计规范、验收步骤、命令、范围、阻塞和证据入口；删除过时的 OAuth/原型先行描述。
- [x] 在 Pages 实际检查入口、导航、宽窄屏和错误状态；修复 340px 长命令裁切，新增双端截图对照页。

## 5. 验证与交付

- [x] 执行定向回归、`npm run validate`、覆盖率与依赖审计；新增门禁经 validate 进入 CI。
- [x] 更新高优清单；保留 P0 真机、业务写链路及尚未收敛的结构差异，不因模拟器成功关闭。
- [x] 中文语义提交经 PR #233 合入为 `0f0a39c4`；PR checks 与 main CI 全部成功，来源分支已删除。
- [x] Pages 发布后 38 文件逐一匹配；微信实际上传版本 `0.0.238.1` 的回执与合并 SHA 一致；部署后客户端 `2026.10.16.69` 再测 24 项通过、0 异常，启动时工作区干净。

功能交付与部署后报告见 [本轮验收记录](../../verification/2026-10-16-design-e2e-acceptance.md)。后续纯文档归档提交不改变已核验客户端产物；iOS/Android 物理真机、普通成员写链路和体验版 UAT 继续独立验收。
