# C1 Content Callback Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 approved content-port-plan Task 1 的 C1 认证回调纯协议，不接入任何运行入口。

**Architecture:** 单一 canonical CommonJS 模块认证合成 AES-CBC envelope，验证签名、padding、AppID 和 v2 事件后返回 decision/retryable union。只接受整数 errcode 0 或 -1008；未知错误与未认证输入均拒绝。HTTP、数据库 ACK、store/index 和业务激活属于后续任务。

**Tech Stack:** Node.js crypto、node:test、CommonJS、Prettier、ESLint。

---

## 授权与文件边界

- 已批准依据：`docs/superpowers/specs/2026-10-26-pr341-latest-main-split.md` 和 `/tmp/cili-pr341-implementation/content-port-plan.md` Task 1。
- executor 只实现 C1；规格符合性与代码质量两阶段 review 由外层流程执行，本文件不把实现自检标为独立 review。
- Create: `scripts/content-safety/callback.cjs`。
- Test: `scripts/content-safety/callback.node-test.cjs`，AES fixture 保持在测试文件内。
- Modify: `package.json`，仅将 callback 测试加入 `test:content-contract`。
- Document: 本文件；外部交付记录仅写 `/tmp/cili-pr341-implementation/content-callback-result.md`。
- `/tmp/cili-pr341-source` 只读，根和其他工作树不写；不改 prepare、miniprogram、配置、版本，不 commit/push/deploy。

## 单测七步任务列表

- [x] Step1 测试准备：复用已安装 utree，prepare 的 TMP_ROOT 限于 content 工作树。
- [x] Step2 加载语言知识与全局上下文：串行读取 default-context 及其 JS/TS 参考。
- [x] Step3 确定生成范围：仅 canonical 回调协议，先输出 TARGETS。
- [x] Step4 分析缺陷：核对 source 已确认 R03 和严格类型拒绝，输出 BUG_MAP 后才生成用例。
- [x] Step5 生成、验证、修复：测试先写、独立 RED、最小实现、GREEN；每次测试以 Perl alarm 120 秒约束。
- [x] Step6 覆盖率统计与补充：按技能 CHECK_COV_MODE=skip 结束，无门槛、非 flux 来源，不执行覆盖率或全量门禁。
- [x] Step7 输出报告：flush 已完成，精确命令/日志/接口/文件边界已落盘；明确未接入口、未现场验证。

## Task 1: 认证回调协议

- [x] 合成 Token/AESKey/AppID 和真实 AES-CBC 安全消息 fixture。
- [x] 无 result 的认证 -1008 返回 `{ traceId, outcome: 'retryable', errorCode: -1008 }`。
- [x] 整数 errcode 0、version 2 和有效 pass/review/risky 返回 `{ traceId, outcome: 'decision', suggest, detail }`。
- [x] 字符串 0/2、错 AppID/Event/签名、坏 padding、缺 trace、未知错误与无有效成功决策全部拒绝。
- [x] 独立 RED/GREEN 留证后注册 focused 测试，执行 Prettier 与 lint。
- [ ] 外层规格 review：待执行，不在本次 executor 范围。
- [ ] 外层质量 review：待执行，不在本次 executor 范围。

## 当前状态

Step1-Step7 已按序完成，Step6 按技能规则跳过。`LANG=javascript`，`EXEC_SOURCE` 为空，`TMP_ROOT=/tmp/cili-pr341-content`。依赖预检 `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/cili-pr341-content/node_modules/.npm-cache --registry=https://registry.npmjs.org` 通过；原有 `test:content-contract` 7/7 通过。

`TARGETS` 为 explicit/non_diff 文件级 `scripts/content-safety/callback.cjs`，无 hunk。Step4 时新模块尚不存在，`BUG_MAP=[]`，不将代码缺失判为新缺陷；已确认 source `callback.js:108-119` 的 R03 与 Number 类型强转作为移植约束保留，不重复开问题。

## RED/GREEN 与接口

所有 Node 测试外层均使用 `perl -e 'alarm 120; exec @ARGV'`。

1. 只读 source 对照：`env CILI_CALLBACK_CONTRACT=/tmp/cili-pr341-source/cloudfunctions/compliance-shared/callback.js node --test --test-name-pattern='authenticated download failure without result|rejects string errcode zero|rejects string version two' scripts/content-safety/callback.node-test.cjs`。退出 1，0/3 通过；-1008 报 CALLBACK_DECISION_INVALID，字符串 0/2 均 Missing expected exception。
2. canonical 未实现 RED：`node --test --test-name-pattern='authenticated download failure without result' scripts/content-safety/callback.node-test.cjs`。退出 1，MODULE_NOT_FOUND；此结果不代替语义 RED。
3. canonical 认证/严格成功分支首轮：`node --test scripts/content-safety/callback.node-test.cjs`。退出 1，64/67 通过；两项 -1008 为预期 RED，单字节 JSON 0 的 fixture 提前触发长度校验。
4. 测试修复循环：给 JSON 0 加合法 JSON 空白，到达事件校验，未放宽断言；同命令退出 1，65/67 通过，仅两项 -1008 报 CALLBACK_DECISION_INVALID。
5. 独立生产 TDD 增量：只将整数 -1008 加入明确允许集合，并在读取 result 前返回 retryable；同命令退出 0，67/67 通过。
6. 注册后 `npm run test:content-contract` 退出 0，74/74 通过；`npm exec -- prettier --write scripts/content-safety/callback.cjs scripts/content-safety/callback.node-test.cjs package.json` 完成；对应 `--check` 与 `npm exec -- eslint scripts/content-safety/callback.cjs scripts/content-safety/callback.node-test.cjs` 均退出 0。

```js
const { parseMediaCheckCallback } = require('./scripts/content-safety/callback.cjs');
const decision = parseMediaCheckCallback({
  token, encodingAesKey, appId, timestamp, nonce, msgSignature, encrypted,
});
// Authenticated errcode 0:
// { traceId, outcome: 'decision', suggest: 'pass' | 'review' | 'risky', detail: [] }
// Authenticated errcode -1008 (no result required):
// { traceId, outcome: 'retryable', errorCode: -1008 }
```

保留 source 六项导出：`CallbackError`、`decryptSafeMessage`、`parseMediaCheckCallback`、`sha1Signature`、`verifyUrlSignature`、`verifyMessageSignature`。trace 字符串 trim 后长度 1-128，version 必须为整数 2，errcode 必须为整数 0/-1008。验签在解密及分类之前；密文必须为 canonical base64，解密校验 1-32 字节 PKCS#7、长度头、嵌入 AppID；JSON 事件 appid 再独立核对。异常只包含固定通用消息及代码，无 payload、密文、trace 或个人信息。

## 交付状态

`LOCAL_PASS / NOT_CONNECTED / NOT_DEPLOYED`。格式化后复跑 focused 74/74 通过，0 失败/跳过；`utree flush` 退出 0，输出 `generation_duration_min=10.1`，准备工具生成的元数据均已使用 apply_patch 清理。最终 content 工作树仅保留本计划、callback 源码/测试和 package 单行注册变更。

完整结果：`/tmp/cili-pr341-implementation/content-callback-result.md`。用户续行通知媒体 #372 已合 `main@3fd6abfd`；本 executor 按指令保留原工作树基线 `b00647db9f0f339a3902cc25ffc7409aeb80588d`，未重新启动、rebase、commit、push 或部署。主代理接手两阶段 review、全量、rebase 与合并。

没有创建 cloud callback core/store/index、HTTP handler、运行副本或接线；平台 envelope、密钥配置、目标环境回读、HTTP/DB ACK、普通成员写链路及物理真机均未现场验证，本地合成契约不能替代上述验收。
