# 内容审核基础协议拆分 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 PR #341 的已授权实现中提取独立可测的内容审核协议，保留当前业务与发布行为，给后续完整链路移植提供单一源码。

**Architecture:** 以 `main@93ad577f` 为基线，新增未被运行入口引用的 `scripts/content-safety/content.cjs` 和原七项测试。根 `package.json` 只增量注册测试；不注册云函数、Timer、网关、集合或新配置。此拆分不是业务内容审核上线。

**Tech Stack:** Node.js 24、CommonJS、Node test、内建 crypto、现有 Harness 与 GitHub Actions。

本任务是用户“#341 根据最新版本考虑拆解合并”的执行部分，沿用原 PR 已批准设计；不新增产品行为。原分支、旧实现和全部待移植范围保全。可用技能未包含上述伴随技能，直接按 writing-plans 与 TDD 顺序执行。

## 文件边界

- 新建 `scripts/content-safety/content.cjs`：规范化白名单、分块、严格审核响应、摘要/版本绑定、媒体提交仅产生 pending 数据。
- 新建 `scripts/content-safety/content.node-test.cjs`：原 `0908a021` 的七项协议测试，仅调整 require 扩展名，不依赖云 SDK 或 native 包。
- 修改 `package.json`：新增 `test:content-contract`，在现有 `validate` 中调用；保留全部 CI、发布、视觉与审计入口。
- 新建本计划与 `docs/verification/2026-10-26-content-contract-foundation.md`；同步高优清单记录原 PR 仍待完整移植的边界。

## Task 1: 测试先进入新基线

- [x] 从 `0908a021` 提取原 `content.node-test.js`，不带 callback 或业务测试。
- [x] 执行 `node --test cloudfunctions/compliance-shared/content.node-test.js`，确认新主线尚无协议模块而失败。

## Task 2: 移植唯一协议源码

- [x] 提取同源 `content.js`；不复制 runtime content-contract 副本，不接 profile/activity/club。
- [x] 执行七项原测试，确认全部通过。
- [x] 核对模块引用、prepare 和函数列表，确认只有本协议测试使用 `./content.cjs`，当前生产入口没有引用。

## Task 3: 接入当前测试入口

- [x] 新增 `"test:content-contract": "node --test scripts/content-safety/content.node-test.cjs"`，在当前 `validate` 的 `npm test` 后追加 `npm run test:content-contract`，其他命令逐字保留。
- [x] 执行 `npm run test:content-contract`、严格 UI 同步、治理、全量 validate、coverage 与 high 审计；全部通过。
- [x] 写入有界验证报告，注明纯契约没有微信审核 API、真实回调、普通成员写链路或真机证据。

## Task 4: 正常 PR 合并与发布判定

最终预检将最初的 `cloudfunctions/` 目录归类为产品变更并要求更新客户端说明。基础片不启用运行行为，因此协议迁入脚本契约目录，CommonJS 使用现有 ESLint 已覆盖的 `.cjs`；后续实际业务接入再按正常产品版本门禁迁入运行时，不修改分类器或版本规则。

- [x] 最终 clean commit `2765458b` 固定后生成描述与最终 diff 统计，运行 `pr:preflight`，全量 Harness 通过。
- [x] PR #370 的 CI / CodeQL 通过，无 review/threads；正常 squash 合入 `0c7463e3`。
- [x] 主线 CI / CodeQL / Pages 全部通过；微信 `40281488762` 的 `0.0.374.1` 实际 receipt、云 `40281488773` 的可信累计范围 SKIPPED outcome 核对通过，无新增业务审核上线。
- [x] 已更新 #341 描述，记录 #370、剩余完整链路、确定缺陷和配置前置；保持 Draft，source `0908a021` 未变。
