# Dormant Rights Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute approved rights-port Task1 only, preserving source privacy semantics and keeping all contracts inactive.

**Architecture:** Pure CommonJS privacy and target-ledger contracts live under `scripts/rights`. Only focused tests import them. No cloud or miniprogram consumer, endpoint, Timer, prepare step, release metadata or runtime behavior changes.

**Tech Stack:** Node test runner, node:assert/strict, CommonJS, Prettier, ESLint.

## Authorization And Scope

- Implementation worktree: `/tmp/cili-pr341-rights`.
- Read-only source: `/tmp/cili-pr341-source`, `0908a0214f02b0817fcaefbe188e928905535d5b`.
- Approved split: `docs/superpowers/specs/2026-10-26-pr341-latest-main-split.md`.
- Approved execution: `/tmp/cili-pr341-implementation/rights-port-plan.md`, Task1.
- Allowed files: `scripts/rights/{privacy,ledger,fixture}.cjs`, three `*.node-test.cjs` files, root `package.json`, this document.
- Deliver evidence to `/tmp/cili-pr341-implementation/rights-contract-result.md`; no commit/push. Main agent owns specification review, code review, merge and delivery status.
- Only focused tests and format/lint run; full `validate`, cloud prepare, deployment and physical-device acceptance are NOT_EXECUTED.

## Unit Test Generation Task List

1. [x] Step1 测试准备: prepare_test.sh; current executor TMP_ROOT `/var/folders/xh/ty0hlc7s7438bsjdhcysj8x40000gn/T/tmp.e4HnMJ5hA4`, EXEC_SOURCE empty
2. [x] Step2 加载语言知识与全局上下文: javascript; built-in Node test, local format/lint resolved
3. [x] Step3 确定生成范围: explicit non_diff, approved new files only
4. [x] Step4 分析缺陷: BUG_MAP empty; new contracts have no current implementation
5. [x] Step5 生成、验证、修复: privacy 0/16, ledger 0/10 expected RED; inactive 5/5 PASS; implementation repair prohibited
6. [x] Step6 覆盖率统计与补充: skip; cov_config null, no required threshold, failed RED tests not counted
7. [x] Step7 输出报告: current executor utree flush exit 0; generation_duration_min=7.1

The seven steps run serially. Generation does not modify implementation. Every test file runs with `perl alarm 120`; the complete focused rights suite runs with `perl alarm 300`. Independent TDD implementation follows the completed generation workflow and its observed RED assertions.

## Execution Checklist

- [x] 生成前记录 TARGETS 和 BUG_MAP。
- [x] 使用合成 fixture 生成测试并观察缺失契约的断言 RED。
- [x] 独立实现前完成单测七步与报告。
- [x] 实现 source 语义一致的隐私导出与显式目标记账。
- [x] 逐文件验证 GREEN；完整 focused rights suite 31/31 通过。
- [x] 注册 `test:rights-contract` 并加入 `validate`，不执行全量 `validate`。
- [x] 验证 inactive 引用图、配置和运行目录零差异。
- [x] 完成 focused format/lint，并向主代理交付结果报告。

## Deferred Work

R01/R02/R12/R13/R15 runtime resolution, consent UI, complete generation transport, deletion transactions, workers, cloud readback and ordinary-member/physical-device journeys remain blocked/deferred. A contract PASS does not close any runtime P1 or independent P0.

## TARGETS

Scope: `non_diff`; `diff_context: null`; no business changes existed at intake. Each target is `source: explicit`, `hunks: []`. New files are located by approved Task1 signatures and the source references below, not invented diff hunks.

| File | Type / Symbols | Locator / Reason |
| --- | --- | --- |
| `scripts/rights/privacy.cjs` | file: source privacy exports, `registrationPublicEligible` | Source `cloudfunctions/shared/privacy.js:1-252`; Task1 requires source generation, privacy projection, contact, consent, driver and media-reference semantics |
| `scripts/rights/ledger.cjs` | function: `retainSnapshotTargets(request, snapshot)` | Source `cloudfunctions/privacy-maintenance/store.js:34-54`; Task1 requires explicit accounting and 256 unique-target bound |
| `scripts/rights/inactive.node-test.cjs` | file: inactive graph | Approved Task1 explicit architecture guard; no production imports, prepare copies, rights endpoint or Timer |

Fixture/configuration are test infrastructure, not business TARGETS. No runtime consumer is selected for implementation or bug fixing.

## BUG_MAP And Candidate Filtering

`BUG_MAP = []`. Missing planned modules are TDD feature gaps, not current-main defects.

| Candidate | Evidence Read | Disposition |
| --- | --- | --- |
| Missing ordinary g1 request generation | Source `privacy.js:90-96,181-188` | Intentional legacy compatibility; preserve it, not a defect |
| Falsy metadata in existing private/contact projections | Source `privacy.js:208-235`, source privacy tests | Preserve source semantics; the explicitly new public helper must validate metadata independently |
| Target overflow | Source `store.js:34-54` returns false, sets manual_required, leaves targets intact | Already bounded without truncation; explicit typed outcome is an approved contract extension |
| R01 physical delete / R02 signing graph | Approved reassessment and Task1 boundary | Existing known runtime migration blockers outside selected implementation; do not relabel as fixed |

## Generation Verification Log

Commands ran serially from `/tmp/cili-pr341-rights`:

| Phase | Command | Exit / Result |
| --- | --- | --- |
| privacy Loop-A/B/C/D | `perl -e 'alarm shift; exec @ARGV' 120 node --test scripts/rights/privacy.node-test.cjs` | 1; 16 assertion failures, every API absent; no infrastructure error; keep assertions |
| ledger Loop-A/B/C/D | `perl -e 'alarm shift; exec @ARGV' 120 node --test scripts/rights/ledger.node-test.cjs` | 1; 10 assertions `Task1 ledger contract not implemented`; keep assertions |
| inactive Loop-A/B/C/D | `perl -e 'alarm shift; exec @ARGV' 120 node --test scripts/rights/inactive.node-test.cjs` | 0; 5 passed; no production graph changes |
| Step7 | `utree flush --repo-path /tmp/cili-pr341-rights` with current executor TMP_ROOT / empty EXEC_SOURCE | 0; generation_duration_min=7.1 |

Generation conclusion: implementation repair prohibited by scope, not an all-pass generation claim. The explicit user-authorized independent TDD implementation owns GREEN.

## Independent TDD And Handoff

- 原有 19 个 source 导出与全部原始 AST 语句复验一致，仅增加 `registrationPublicEligible`。
- 新公开资格 helper 对 malformed metadata 返回 false，不改变原有 private/contact 的 source 投影语义；资格不是公开同意，后续运行消费者仍须独立核对同意。
- `retainSnapshotTargets` 返回 `{ ok: true, added, total }`；超过 256 个唯一目标返回 `{ ok: false, code: 'MEDIA_TARGET_ACCOUNTING_LIMIT', total }`，异常记账返回 `{ ok: false, code: 'MEDIA_TARGET_ACCOUNTING_INVALID' }`。
- 失败保持 `media_targets` 原数组与标识不变，并在合法 request 上置 `manual_required`；不截断、解码或重写 source/canonical/snapshot 目标。
- GREEN：privacy 16/16、ledger 10/10、inactive 5/5；`perl -e 'alarm 300; exec @ARGV' npm run test:rights-contract` 为 31/31、退出 0。
- focused Prettier、ESLint、`git diff --check` 通过；`cloudfunctions`、`miniprogram`、prepare、cloudbaserc、package-lock、workflow 与 HEAD 无差异。
- `.rights-ut/` 为生成工具临时证据，不属于交付暂存清单。并发执行器同范围修改已重新读取并保留，主代理仅按允许路径暂存，不使用 `git add .`。
- 完整结果：`/tmp/cili-pr341-implementation/rights-contract-result.md`。实现完成待主代理两阶段 review；未提交、未部署、未激活。

## Contract Results

- `privacy.cjs` retains all 19 original exports verbatim, including missing g1 generation and the original private/contact semantics. Only `registrationPublicEligible` is added.
- `registrationPublicEligible(registration, profile)` requires existing object records, absent-or-active deletion status, no enrolled `privacy_generation`, absent-or-false public suppression, valid matching positive safe-integer generations. Absent generation is legacy g1; present null is invalid. This is an enrollment/generation gate, not a substitute for public consent or media validation.
- `retainSnapshotTargets(request, snapshot)` returns `{ok: true, added, total}` on success, `{ok: false, code: 'MEDIA_TARGET_ACCOUNTING_LIMIT', total}` on overflow, or `{ok: false, code: 'MEDIA_TARGET_ACCOUNTING_INVALID'}` on malformed accounting. Original identifiers and first-seen ordering are preserved.
- The helper mutates only successful `media_targets` or the failure `manual_required` flag, never truncates, rewrites paths, drops a valid source/canonical target, or clears manual/lease/replay/cursor state. Future consumers MUST branch on `result.ok`, not object truthiness.
- Missing/empty optional snapshot references retain source behavior. Malformed nonempty accounting fails explicitly; runtime worker/store extraction is deferred.

## 最终验证与 Review 交接

- 独立 TDD 逐文件 GREEN：privacy 16/16、ledger 10/10、inactive 5/5；每文件外层 `perl alarm 120`。
- `perl -e 'alarm shift; exec @ARGV' 300 npm run test:rights-contract`：退出 0，31/31，0 skipped/cancelled/todo，`duration_ms 315.032875`。
- focused Prettier 和 ESLint 均退出 0；文档按仓库规则忽略格式/lint，不扩大到全仓。
- TypeScript AST 与导出只读对照：source 19 个原导出和顶层语句一致，仅新增 helper/export。运行目录、prepare、cloudbaserc、版本及 lockfile 无 diff，也无新增未跟踪运行文件。
- `.rights-ut/` 与先前 3.9 分钟日志为并发产生记录，本 executor 不创建/清理；当前七步及精确日志以交付报告为准。
- 状态 `READY_FOR_MAIN_AGENT_REVIEW`：主代理执行独立规格 review，再执行代码质量 review；只有主代理负责提交、组合 validate、部署和清单更新。没有宣称 review 已通过或运行缺陷已修复。
