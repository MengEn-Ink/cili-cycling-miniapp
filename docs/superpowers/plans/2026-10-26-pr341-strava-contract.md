# Strava 非激活状态机 Task1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 当前环境采用已批准的主代理委派执行；executor 仅实现，规格与代码两阶段 review 由主代理分别执行。

**Goal:** 移植 source `0908a021` 的 Strava 算法，修复 R07/R08、数据库缺失分类与 revoke ACK 预算，以无运行引用的单一源码交付 Task1。

**Architecture:** core/store 仅存在于 `scripts/strava-state-machine/`，没有 cloud、miniprogram 或 prepare 引用。store 强制注入三个 privacy 导出，fixture 提供纯合成契约与事务数据库；最终激活时迁移唯一算法源码并改为导入权益片的正式 `privacy-contract`，不维护两份算法。

**Tech Stack:** CommonJS、node:test、AES-256-GCM v1、合成串行事务/回滚/重试、现有 affected-ci。

---

## 批准依据

- [拆合设计](../specs/2026-10-26-pr341-latest-main-split.md)。
- `/tmp/cili-pr341-implementation/strava-port-plan.md` 的 Task1 与第4节。
- [高优清单](../../high-priority-issues.md) 的独立现场 P0 和 Strava 迁移阻塞继续保留。
- source 工作树只读保全；最终实现从当时最新 `origin/main@3f1494b6` 建立独立工作树，不修改旧草案。

## 文件职责

| 文件 | 职责 |
| --- | --- |
| `scripts/strava-state-machine/core.cjs` | 原 core 唯一协议算法：state/crypto、token、callback、refresh、下载/预览、revoke；保留原行为和错误码 |
| `scripts/strava-state-machine/store.cjs` | sentinel、匹配尝试、operation 唯一结算、材料账本、事务 fence 与有界 drain |
| `scripts/strava-state-machine/fixture.cjs` | 合成隐私契约、串行回滚事务、一次性故障和提交重试、start/callback helpers；不是运行隐私协议 |
| `scripts/strava-state-machine/core.node-test.cjs` | crypto/config/state、token/revoke、下载与解析依赖注入契约 |
| `scripts/strava-state-machine/revocation.node-test.cjs` | R07/R08、拒绝/过期恢复、迟到/重放、未知/DB失败、lease及事务重试 |
| `package.json` | 注册 `test:strava-contract` 并加入现有 validate，不改依赖/锁/版本 |
| `scripts/affected-ci.mjs` 与同名测试 | 五个 foundation 文件均映射到两个契约，根配置/选择器自身全量规则不降级 |

## Task1 执行

- [x] Step1：读取高优、批准设计/计划、TDD 与 bits-unit-test-gen；完成测试准备、语言、TARGETS 和 BUG_MAP。
- [x] Step2：core 测试先落盘，批准原算法移植后 14/14 通过；初次缺模块记为基础设施错误，不记缺陷 RED。
- [x] Step3：store 未修 donor 上 37 项测试 18通过/19失败，R07/R08、stored fence、重复结算与账本错误获得真实 RED。
- [x] Step4：独立修算法，37/37 GREEN；补充 unknown/事务重试后 41/44，继续独立修复后 44/44 GREEN。
- [x] Step5：affected 映射与根注册两项 RED 后实现；命令与最终结果见独立执行记录。
- [x] Step6：最新主线补充两项 P1 RED；严格缺失分类与 ACK 预消费预算实现后 GREEN。
- [x] Step7：独立分组审查发现并修复 3 个 core P1、1 个 store P1 与 4 个 store P2；scope、401 恢复、ledger、材料调度与 operation 到期元数据均补 RED/GREEN，Strava 76/76，终局复审清零。
- [ ] Step8：主代理合并与 PR/main 门禁、实际 receipt 或累计安全跳过。

### 关键契约

```javascript
createStravaStore(db, { env, cloud, privacy });
// privacy 必须具有三个函数，没有可选或 permissive fallback：
// profileGeneration / isProfileDeleted / assertProfileWritable
store.start(owner, state, now, expectedProfileGeneration);
// reserve 返回 operation_id、kind、oauth_generation、profile_generation。
store.finishMint(owner, fence, value, encryptedMaterial, now);
store.failMint(owner, fence, uncertain, now);
store.disconnectTx(tx, owner, now, expectedProfileGeneration);
store.deletionStatusTx(tx, owner, oauthGeneration, expectedProfileGeneration);
store.checkPreviewTx(tx, preview);
```

R07 只终结存储行证明的匹配操作，迟到400/401不改 revoking/材料/计数；未知结果保留 uncertain。R08 以 hash、expiry、双方 generation 与无预占操作识别未 mint 尝试，拒绝/缺 code/过期提交终态，status/start 惰性恢复；旧回调不能清除更新尝试或撤销屏障。

正常 callback 必须明确授予 `read` scope；拒绝 scope 时不预占、不换 token 并结束 authorizing。refresh 在预占 operation 前解密材料，避免本地损坏制造虚假 uncertain；路线接口 401 强制 refresh 并仅重试一次，仍未授权则进入持久撤销屏障。

材料 ID 为 `mint-${operation_id}`，resolved 保留 saved disposition，重复不写凭证或材料。DB 读取只接受明确文档不存在错误码，或 `-502001/-1` 与明确 document-missing 文案的组合；通用数据库错误传播。材料/操作/ACK 失败不能返回成功。

共享账本核对用于 status/start/deletion/fence/drain。非 completed/resolved 的未知状态、缺 pointer、计数不一致、错误 fence、非法 attempts、损坏 retry/lease 或 operation 到期元数据、uncertain 均阻断外呼和完成；时间字段只接受持久层契约写入的有效 `Date`。单次 ledger 查询上限100，饱和时 fail-closed 为 manual_review，不把部分扫描当完整证明；正式 CloudBase 查询能力/索引和故障回读由最终激活验收验证。

保留 8秒外部超时、2分钟 mint lease、30秒 revoke lease、每轮最多2次 revoke、8次尝试及封顶指数退避。每次 revoke 外呼前在 claim 事务内持久消耗一次预算；ACK 失败不记完成，但不能绕过 8 次上限，预算耗尽后不发起第 9 次外呼并转人工复核。只有匹配 lease 的 DB ACK 才记完成；其他材料 revoke 成功不终结未知 mint。

## 最小验证

每个文件串行、每次外层120秒：

```sh
perl -e 'alarm shift; exec @ARGV' 120 npm run test:strava-contract
perl -e 'alarm shift; exec @ARGV' 120 npm run test:affected:self
perl -e 'alarm shift; exec @ARGV' 120 npm run test:content-contract
perl -e 'alarm shift; exec @ARGV' 120 npm run test:rights-contract
```

定向通过后对改动文件运行 Prettier、ESLint 与 diff check；独立代码审查通过后再运行全量 `validate` 和 `audit:all`。注册 validate 或本地全量通过不代表生产启用、目标云回读、真实 OAuth/GPX 或真机验收。

## 后续边界

Task2 的可信独立手动 GPX 路径/intent/R09、Task3 权益/媒体事务消费者、客户端状态与最终配置/生成副本迁移均未实现。此片不能证明真实 OAuth、删除 worker、GPX 解析/上传、活动保存/公开读取或 iOS/Android 验收，不能启用任何生产行为或关闭高优 P0。
