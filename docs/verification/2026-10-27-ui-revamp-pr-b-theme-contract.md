# UI 改版 V1 · PR B 主题契约验收

## 结论

PR B 本地候选在 `main@c0bd3b56ebe8ea44e8d5b3c7203d765e52b8b826` 上完成，实现冻结 SHA 为 `84ae8a7edbdfad03bd576202d4b8e572fabd4c37`：

- 53 处颜色字面量、1 处字体字面量全部按 1:1 现值迁移到主题 token；页面 WXSS 已为零 hex/rgba/rgb 与零非 token 字体。
- V1 新增的 4 个叠层目标值未启用，不改业务、权限、隐私、WXML/TS/JSON 结构、native 颜色或设置页可见更新说明。
- `check:design` 、release-notes 保值例外与 ui-sync 保值谱系均已机械化；release-notes 和 ui-sync 共用 `scripts/theme-preservation-policy.mjs`，不存在两份启发式实现。
- clean base/head 同主机、同 Chromium 重采的 16 页 × 340/375/430 三宽共 48 图逐 RGBA 通道零差异；PNG 容器字节也 48/48 完全一致。
- 全量 `validate`、coverage 和 `audit:all` 在 clean `84ae8a7e` 前后围栏下全部 exit 0。

因此本片可交审判侧做独立复核。当前仍是 `LOCAL_GATES_PASS / REVIEW_PENDING`，不是已合入、已部署或真机 UAT 完成。

## 改动边界

`c0bd3b56..84ae8a7e` 共 29 文件、`+2948/-101`：

- 表现层：`miniprogram/app.wxss`、12 个页面/组件 WXSS 和新增 checker-only `miniprogram/config/theme-contract.json`。运行时代码对该 JSON 零 import。
- 门禁：`check-design`、release-notes、ui-sync 及其 Node 契约测试，共享保值分类器，`package.json` 与文档契约。
- 证据：[53+1 映射](../designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md)、[16×3 像素报告](2026-10-27-ui-revamp-pr-b-pixels.json) 和 `docs/ui-sync-manifest.json` 单条 provenance。
- 禁止边界已通过测试锁定：alpha 偷改、selector/属性改动、token 不等值、V1 新值、夹带 WXML/TS/JSON/新功能、映射行数/位置/内容篡改均不得豁免。

## TDD 证据

### RED

- 主题基线：`/tmp/cili-pr-b-red/repository-red.log`，SHA-256 `f6efde4c...e13`；53 颜色 + 1 字体字面量使契约门禁失败。
- release-notes 冲突：`/tmp/cili-pr-b-red/release-notes-theme-exemption-red.log`，SHA-256 `5a63135b...02f`；保值 WXSS 迁移被旧门禁拒绝。
- ui-sync 谱系：`/tmp/cili-pr-b-red/ui-sync-provenance-red.log`，SHA-256 `e708a333...5a6`；共享分类器与 provenance API 未存在时 2/2 失败。
- 格式化边界：`/tmp/cili-pr-b-red/theme-preservation-multiline-map-red.log`，SHA-256 `e576f300...863`；base 位置对应的 head token 被 Prettier 折成多行时 1 项真实失败。
- 像素报告内容：`/tmp/cili-pr-b-red/ui-sync-pixel-report-content-red.log`，SHA-256 `8b1746bb...261`；更新报告 hash 后仍声明有差异的证据在实现前未被拒绝，1 项失败。

### GREEN

- `node --test scripts/check-release-notes.node-test.mjs scripts/check-ui-sync.node-test.mjs`：30/30，包含共享分类、map 篡改、from/to 篡改、像素内容、后续 UI 漂移自动失效和 prototype 漂移。日志 `/tmp/cili-pr-b-green/theme-preservation-pixel-report-green.log`，SHA-256 `edde355e...35e`。
- 真实 release-notes CLI：`App 更新保值迁移豁免通过： base=c0bd3b56 ... colors=53 direct=49 fallback=4 font=1`。
- 真实 strict ui-sync CLI：`发布严格模式：主题 token 保值谱系已机械复算（旧截图仍绑定原摘要，PR C Task 0 日落）`。日志 `/tmp/cili-pr-b-green/ui-sync-provenance-real-green.log`，SHA-256 `7cea0772...f74`。

## 摘要与谱系

- 旧截图真实绑定保持为 `source.digest=sha256:f67ae16f6629d8701016a22cd4beae1ecb190ba3d5eebfa74065a90b2b84aae8`。
- 当前 UI 摘要为 `sha256:f34403aaa3235d36799e95476d38afaca8856ae770ead916e69a9191c2ea650a`；prototype 摘要仍为 `sha256:e5f0c10871963e1d7eada3fa9dfb189aa14c5c36f59ee233995510ebbe7136ca`。
- provenance 严格复算 `base=c0bd3b56`、from/to、53/49/4/1 映射、像素报告 SHA-256 `f64c916a...49ab` 和报告内部 16×3 零差异契约。
- 任何后续 UI 字节改动使 current digest 不再等于 `toDigest` 时立即失败；摘要自然对齐时仍保留谱系也失败。
- PR C Task 0 必须在目标主机重采 16×3，更新 `source.digest` 并删除该谱系。

## 像素与运行证据

### 16×3 主证明

- base：`c0bd3b56`，`/tmp/cili-pr-b-phase3-base-final.R0uubQ`；start/end HEAD 一致、porcelain 为空。冻结工作树无安装依赖，因此在 clean start 后临时连接同 lockfile 的 `node_modules`，采集后解除，clean end 时无残留。
- head：`792da57b`，`/tmp/cili-pr-b-phase3-head-current.7r4vWK`；start/end HEAD 一致、porcelain 为空。该 SHA 已含共享分类器；后续 `84ae8a7e` 仅增强 checker/证据/manifest，不改变受摘要覆盖的 UI 文件。
- 结果：48/48 尺寸一致，共 57,158,400 像素，`differentPixels=0`、`maxChannelDelta=0`、`meanAbsoluteChannelDelta=0`、`containerByteDifferences=0`。无容差、无 mask。

### 390 运行辅助巡检

- `9eb43a9f` 干净 DevTools 重跑：`startupOutcome=PASS`、`productVerdict=PASS`、30/30 检查、17 个导航时序、20 张运行截图、0 失败、0 blocker、0 exception、`dirty=false`。证据 `/tmp/cili-pr-b-e2e-after-9eb43a9f`。
- base 与 `102da088` 的 20 张解码比较：原始差异 277,038 像素均位于已声明的原生状态/导航、profile 原生 tabBar 和 club 远程 hero 解码区；屏蔽后产品像素 20/20 精确一致。该 390 证据只是功能巡检，不是 16×3 主证明、Task 0 或真机结论。

## 全量门禁

- `OUT_DIR=/tmp/cili-pr-b-final-validate.A8Dr8B npm run validate`：`VALIDATE_STATUS=0`，前后 HEAD 均为 `84ae8a7e`、porcelain 为空。
- Vitest 89/89 文件、1376/1376；journey evidence 130/130；三宽 16×3；design 10/10；ui-sync 26/26；主包 434,460 字节，距 459,315 硬上限余 24,855 字节。
- `npm run coverage`：exit 0；根 All files statements 82.84%、branches 77.30%、functions 81.35%、lines 86.09%；`cloud.ts` lines 91.02%、branches 89.02%、functions 96.60%、statements 90.06%。
- `npm run audit:all`：exit 0；根与 13 个云包均 `found 0 vulnerabilities`；微信上传工具 4 个无上游修复告警仍按既有 allowlist 评估，例外到期 `2027-01-15`。
- coverage/audit 共享围栏前后 HEAD 均为 `84ae8a7e`、porcelain 为空。

## 尚未完成

- 审判侧尚未对 `84ae8a7e` 整包独立复算；PR 尚未创建，GitHub CI / CodeQL、match-head 合入、main 回读与开发版 receipt 均待执行。
- PR C Task 0 尚未在目标主机重新校准，因此 provenance 必须保留；路由族 D–H 不得在日落前开始改可见像素。
- 本报告不证明性能改善、普通成员写链路、体验版或 iOS/Android 真机 UAT。
