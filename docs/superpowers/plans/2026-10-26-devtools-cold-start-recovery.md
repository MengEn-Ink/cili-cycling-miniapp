# DevTools Cold-Start Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the WeChat DevTools E2E runner distinguish framework readiness from business-data readiness, preserve sanitized startup diagnostics, and allow exactly one bounded fresh-session recovery for the two confirmed cold-start transient errors.

**Architecture:** Keep pure waiting, classification, redaction, and aggregation logic in `p0-journey-driver.mjs`; keep process/session lifecycle in `wechat-devtools-e2e.cjs`; keep final report derivation in `e2e-report.mjs`. A small batch CLI consumes completed reports so consecutive recovery states become an enforceable non-zero gate instead of an operator convention.

**Tech Stack:** Node.js 22, `node:test`, CommonJS runner with dynamic ESM imports, `miniprogram-automator@0.12.1`, WeChat DevTools CLI 2.02.2608070.

---

## File map

- Modify `scripts/p0-journey-driver.mjs`: pure startup error classification, diagnostic redaction, framework wait, page-wait observation hooks, single-attempt route readiness, batch outcome aggregation.
- Modify `scripts/p0-journey-driver.node-test.mjs`: RED/GREEN tests for the pure policy and 90s/30s deadline semantics.
- Modify `scripts/e2e-report.mjs`: derive `productVerdict` independently from `startupOutcome`, preserve blocked-vs-failed semantics, and serialize errors through a caller-supplied sanitizer.
- Modify `scripts/e2e-report.node-test.mjs`: report truth-table and sanitized-error tests.
- Modify `scripts/wechat-devtools-e2e.cjs`: bounded session orchestration, event capture, console/exception caps, report schema v4, and initial relaunch/data-ready events.
- Modify `scripts/wechat-devtools-e2e.node-test.mjs`: lifecycle tests with injected automator/session clocks and source-contract assertions.
- Create `scripts/check-devtools-e2e-batch.mjs`: read ordered result files, apply recovery-streak aggregation, and exit non-zero on blocked/failed/unstable batches.
- Create `scripts/check-devtools-e2e-batch.node-test.mjs`: CLI fixtures for clean, one-recovery, consecutive-recovery, blocked, and product-failure batches.
- Modify `package.json`: expose `check:devtools:e2e-batch` without adding it to platform-neutral `validate`.
- Modify `docs/high-priority-issues.md`: move the existing cold-start P1 from design-approved to implemented/review-pending only after all implementation and local evidence pass.

### Task 1: Pure framework policy and diagnostic safety

**Files:**
- Modify: `scripts/p0-journey-driver.node-test.mjs`
- Modify: `scripts/p0-journey-driver.mjs`

- [ ] **Step 1: Write RED tests for error classification and post-ready recovery lockout**

Add imports and focused tests:

```js
import {
  aggregateStartupOutcomes,
  classifyStartupReadError,
  redactDevtoolsDiagnostic,
  waitForFrameworkReady,
} from './p0-journey-driver.mjs';

test('只在框架首次就绪前识别两类冷启动瞬态错误', () => {
  assert.equal(
    classifyStartupReadError(
      new Error("Cannot destructure property 'rawPath' of 'getPageMetaByWebviewId(...)' as it is null"),
      { attempt: 1, frameworkEverReady: false },
    ),
    'STARTUP_PAGE_META_NULL',
  );
  assert.equal(
    classifyStartupReadError(new Error('timeout waiting for automator response'), {
      attempt: 1,
      frameworkEverReady: false,
    }),
    'STARTUP_AUTOMATOR_TIMEOUT',
  );
  assert.equal(
    classifyStartupReadError(new Error('timeout waiting for automator response'), {
      attempt: 1,
      frameworkEverReady: true,
    }),
    null,
  );
  assert.equal(
    classifyStartupReadError(new Error('timeout waiting for automator response'), {
      attempt: 2,
      frameworkEverReady: false,
    }),
    null,
  );
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```bash
node --test --test-name-pattern='只在框架首次就绪前' scripts/p0-journey-driver.node-test.mjs
```

Expected: FAIL because `classifyStartupReadError` is not exported.

- [ ] **Step 3: Implement the minimal classifier**

Add this pure function:

```js
export function classifyStartupReadError(error, { attempt, frameworkEverReady }) {
  if (attempt !== 1 || frameworkEverReady) return null;
  const message = String(error?.message || error || '');
  if (
    message.includes('getPageMetaByWebviewId') &&
    message.includes('rawPath') &&
    message.includes('null')
  ) {
    return 'STARTUP_PAGE_META_NULL';
  }
  if (message.includes('timeout waiting for automator response')) {
    return 'STARTUP_AUTOMATOR_TIMEOUT';
  }
  return null;
}
```

- [ ] **Step 4: Run the focused test and confirm GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Write RED tests for framework readiness and the shared deadline**

Use injected time so no wall-clock sleeps occur:

```js
test('框架可读不等待业务 loading 且受绝对 deadline 限制', async () => {
  let clock = 1_000;
  const errors = [];
  const pages = [
    new Error('timeout waiting for automator response'),
    { path: 'pages/activities/index', data: { loading: true } },
  ];
  const result = await waitForFrameworkReady({
    readPage: async () => {
      const next = pages.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    timeoutMs: 30_000,
    deadlineMs: 91_000,
    intervalMs: 250,
    now: () => clock,
    wait: async (milliseconds) => {
      clock += milliseconds;
    },
    onReadError: (entry) => errors.push(entry),
  });
  assert.equal(result.page.path, 'pages/activities/index');
  assert.equal(result.data.loading, true);
  assert.equal(result.attempts, 2);
  assert.equal(errors.length, 1);
});

test('框架等待使用 30 秒与绝对 deadline 的较小值', async () => {
  let clock = 10_000;
  await assert.rejects(
    waitForFrameworkReady({
      readPage: async () => {
        throw new Error('timeout waiting for automator response');
      },
      timeoutMs: 30_000,
      deadlineMs: 10_500,
      intervalMs: 250,
      now: () => clock,
      wait: async (milliseconds) => {
        clock += milliseconds;
      },
    }),
    (error) => error.code === 'PAGE_FRAMEWORK_NOT_READY' && error.diagnostics.elapsedMs === 500,
  );
});
```

- [ ] **Step 6: Run both framework tests and confirm RED**

Run:

```bash
node --test --test-name-pattern='框架可读|框架等待' scripts/p0-journey-driver.node-test.mjs
```

Expected: FAIL because `waitForFrameworkReady` and `PAGE_FRAMEWORK_NOT_READY` do not exist.

- [ ] **Step 7: Implement framework wait with safe diagnostics**

Extend `JourneyDriverError` to accept diagnostics and add `PAGE_FRAMEWORK_NOT_READY`. Implement:

```js
export async function waitForFrameworkReady({
  readPage,
  timeoutMs = 30_000,
  deadlineMs = Number.POSITIVE_INFINITY,
  intervalMs = 250,
  now = Date.now,
  wait = defaultWait,
  onReadError = () => {},
}) {
  const startedAt = now();
  const budgetMs = Math.max(0, Math.min(timeoutMs, deadlineMs - startedAt));
  let attempts = 0;
  let lastPath = null;
  for (;;) {
    attempts += 1;
    try {
      const page = await readPage();
      const data = page?.data;
      lastPath = typeof page?.path === 'string' ? page.path : null;
      if (lastPath) return { page, data, attempts, elapsedMs: Math.max(0, now() - startedAt) };
    } catch (error) {
      onReadError({ error, attempts, elapsedMs: Math.max(0, now() - startedAt) });
    }
    const elapsedMs = Math.max(0, now() - startedAt);
    if (elapsedMs >= budgetMs) {
      throw new JourneyDriverError('PAGE_FRAMEWORK_NOT_READY', {
        attempts,
        elapsedMs,
        lastPath,
      });
    }
    await wait(Math.min(intervalMs, budgetMs - elapsedMs));
  }
}
```

The runner supplies `readPage` as `currentPage()` plus `page.data()` so both calls must succeed.

- [ ] **Step 8: Run framework tests and confirm GREEN**

Run the Step 6 command. Expected: PASS.

- [ ] **Step 9: Write RED tests for redaction and batch aggregation**

```js
test('DevTools 诊断脱敏路径账号云资源和 URL 凭证', () => {
  const actual = redactDevtoolsDiagnostic(
    '/Users/test/project/a.js /Users/test user@example.com 13800138000 ou_secret cloud://env/file https://x.test/a?token=secret#frag',
    { projectPath: '/Users/test/project', homePath: '/Users/test' },
  );
  for (const secret of ['project/a.js', 'user@example.com', '13800138000', 'ou_secret', 'cloud://env/file', 'token=secret', '#frag']) {
    assert.equal(actual.includes(secret), false, secret);
  }
});

test('相邻两个恢复态升级环境不稳定且干净通过重置 streak', () => {
  assert.equal(
    aggregateStartupOutcomes(['PASS_WITH_STARTUP_RECOVERY', 'PASS_WITH_STARTUP_RECOVERY']).outcome,
    'BLOCKED_ENVIRONMENT_UNSTABLE',
  );
  assert.equal(
    aggregateStartupOutcomes(['PASS_WITH_STARTUP_RECOVERY', 'PASS', 'PASS_WITH_STARTUP_RECOVERY']).outcome,
    'PASS_WITH_STARTUP_RECOVERY',
  );
});
```

- [ ] **Step 10: Run redaction/aggregation tests and confirm RED**

Run:

```bash
node --test --test-name-pattern='诊断脱敏|相邻两个恢复态' scripts/p0-journey-driver.node-test.mjs
```

Expected: FAIL because both functions are missing.

- [ ] **Step 11: Implement redaction, aggregation, and page-read observation hooks**

Implement deterministic pure functions. `redactDevtoolsDiagnostic` must replace project/home/temp paths before applying phone, email, account ID, `cloud://`, CloudBase environment/file ID, URL query/fragment, token, and cookie patterns; return at most 2,048 characters. `aggregateStartupOutcomes` must stop on `BLOCKED`, return `BLOCKED_ENVIRONMENT_UNSTABLE` at streak 2, reset streak on `PASS`, and preserve a single recovery state.

Add optional `onReadError` and `onObservation` callbacks to `waitForPageReady`. Call `onObservation` with only `{attempts, elapsedMs, path, dataReady}` and call `onReadError` with the raw Error for caller-side redaction; never pass page data to either callback. Remove the retry loop from `relaunchWhenReady` so one navigation gets the full `timeoutMs` budget.

- [ ] **Step 12: Update the old route-retry test and run the full driver suite**

Replace “首次路由命令丢失时在总时限内重发一次” with a RED/GREEN test asserting one navigation call and `PAGE_NOT_READY` after the full budget. Then run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: all tests PASS.

- [ ] **Step 13: Commit Task 1**

```bash
git add scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs
git commit -m "fix(e2e): add bounded framework readiness policy"
```

### Task 2: Report truth table and sanitized failure serialization

**Files:**
- Modify: `scripts/e2e-report.node-test.mjs`
- Modify: `scripts/e2e-report.mjs`

- [ ] **Step 1: Write RED tests for runner/product outcome separation**

```js
test('启动三态与产品 verdict 独立派生', () => {
  const clean = finishReport({
    startupOutcome: 'PASS',
    productVerdict: 'NOT_EXECUTED',
    checks: [{ ok: true }],
    exceptions: [],
    blockers: [],
  });
  assert.equal(clean.outcome, 'passed');
  assert.equal(clean.productVerdict, 'PASS');

  const recovered = finishReport({
    startupOutcome: 'PASS_WITH_STARTUP_RECOVERY',
    productVerdict: 'NOT_EXECUTED',
    checks: [{ ok: true }],
    exceptions: [],
    blockers: [],
  });
  assert.equal(recovered.outcome, 'passed_with_startup_recovery');
  assert.equal(recovered.productVerdict, 'PASS');

  const blocked = finishReport({
    startupOutcome: 'BLOCKED',
    productVerdict: 'NOT_EXECUTED',
    checks: [],
    exceptions: [],
    blockers: ['DEVTOOLS_STARTUP_BLOCKED'],
  });
  assert.equal(blocked.outcome, 'blocked');
  assert.equal(blocked.productVerdict, 'NOT_EXECUTED');
});
```

- [ ] **Step 2: Run the report suite and confirm RED**

Run:

```bash
node --test scripts/e2e-report.node-test.mjs
```

Expected: FAIL because recovered startup is currently collapsed into `passed`.

- [ ] **Step 3: Implement the truth table**

Update `finishReport` so exceptions or failed checks set `productVerdict=FAIL` and `outcome=failed`; startup blocked or blockers/no checks set `outcome=blocked`; otherwise a recovered startup sets `outcome=passed_with_startup_recovery`, and a clean startup sets `outcome=passed`.

- [ ] **Step 4: Write RED test for caller-supplied error serialization**

```js
test('执行与关闭错误都通过调用方脱敏器保存', async () => {
  let saved;
  await runWithReport({
    report: { checks: [], exceptions: [], blockers: [] },
    execute: async () => { throw new Error('/secret/path'); },
    close: async () => { throw new Error('token=secret'); },
    serializeError: (phase) => ({ phase, message: '[redacted]' }),
    save: (value) => { saved = value; },
  });
  assert.deepEqual(saved.exceptions, [
    { phase: 'execute', message: '[redacted]' },
    { phase: 'close', message: '[redacted]' },
  ]);
});
```

- [ ] **Step 5: Run the focused test and confirm RED**

Run:

```bash
node --test --test-name-pattern='调用方脱敏器' scripts/e2e-report.node-test.mjs
```

Expected: FAIL because `serializeError` is ignored.

- [ ] **Step 6: Implement `serializeError` with a safe default and confirm GREEN**

Add `serializeError = (phase, error) => ({ phase, message: error.message })` to `runWithReport` arguments and use it for execute/close catches. Run the full report suite; expected all PASS.

- [ ] **Step 7: Commit Task 2**

```bash
git add scripts/e2e-report.mjs scripts/e2e-report.node-test.mjs
git commit -m "fix(e2e): separate startup and product verdicts"
```

### Task 3: Session lifecycle, event capture, and one fresh recovery

**Files:**
- Modify: `scripts/wechat-devtools-e2e.node-test.mjs`
- Modify: `scripts/wechat-devtools-e2e.cjs`

- [ ] **Step 1: Write a RED lifecycle test for 90s/30s budgets and one recovery**

Export `launchWithStartupRecovery` from the guarded CommonJS module and test it with injected dependencies:

```js
test('启动恢复共享 90 秒预算且只创建两个 session', async () => {
  let clock = 1_000;
  const launchTimeouts = [];
  const sessions = [
    { close: async () => {}, on: () => {} },
    { close: async () => {}, on: () => {} },
  ];
  let frameworkCalls = 0;
  const report = { console: [], exceptions: [], recoveredStartupFailure: false };
  const result = await driver.launchWithStartupRecovery({
    automator: {
      launch: async ({ timeout }) => {
        launchTimeouts.push(timeout);
        clock += 5_000;
        return sessions.shift();
      },
    },
    cliPath: '/cli',
    projectPath: '/project',
    report,
    now: () => clock,
    waitForFrameworkReady: async ({ timeoutMs, deadlineMs, onReadError }) => {
      frameworkCalls += 1;
      assert.equal(timeoutMs, 30_000);
      assert.equal(deadlineMs, 91_000);
      if (frameworkCalls === 1) {
        clock += 30_000;
        onReadError({ error: new Error('timeout waiting for automator response'), elapsedMs: 30_000 });
        throw Object.assign(new Error('页面框架未就绪'), { code: 'PAGE_FRAMEWORK_NOT_READY' });
      }
      clock += 1_000;
      return { page: { path: 'pages/activities/index' }, data: { loading: true } };
    },
    redactDiagnostic: (value) => String(value?.message || value),
  });
  assert.equal(result.miniProgram !== null, true);
  assert.deepEqual(launchTimeouts, [90_000, 55_000]);
  assert.equal(frameworkCalls, 2);
  assert.equal(report.startupOutcome, 'PASS_WITH_STARTUP_RECOVERY');
  assert.equal(report.recoveredStartupFailure, true);
  assert.equal(report.startup.attempts.length, 2);
});
```

- [ ] **Step 2: Run the focused lifecycle test and confirm RED**

Run:

```bash
node --test --test-name-pattern='启动恢复共享' scripts/wechat-devtools-e2e.node-test.mjs
```

Expected: FAIL because `launchWithStartupRecovery` is not exported.

- [ ] **Step 3: Implement minimal lifecycle orchestration**

Add constants `STARTUP_BUDGET_MS=90_000`, `FRAMEWORK_TIMEOUT_MS=30_000`, `MAX_STARTUP_ATTEMPTS=2`. Implement `launchWithStartupRecovery` so it:

1. creates one absolute deadline;
2. passes remaining milliseconds to `automator.launch`;
3. attaches console/exception listeners immediately after connect;
4. calls `waitForFrameworkReady` with `min(30_000, remaining)`;
5. records `spawn`, `connect`, `framework_error`, `close`, `framework_ready` events with attempt, ISO time, and elapsedMs;
6. retries only when attempt 1 recorded one or more errors and every recorded error class is one of the two recoverable startup classes;
7. closes only the current miniProgram session before attempt 2;
8. on any other startup failure, sets `startupOutcome=BLOCKED`, `productVerdict=NOT_EXECUTED`, adds `DEVTOOLS_STARTUP_BLOCKED`, and returns `{ miniProgram: null }` without throwing a product exception.

- [ ] **Step 4: Confirm lifecycle GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Add RED tests for forbidden retries**

Add separate tests proving:

- an unknown framework error produces `BLOCKED` with one session;
- a second-attempt error produces `BLOCKED` with exactly two sessions;
- `frameworkEverReady=true` followed by text `timeout waiting for automator response` never calls launch again;
- current session close failure produces `BLOCKED` and no second launch;
- deadline exhaustion prevents a second launch.

Each test must assert the launch count and report state, not only the thrown error text.

- [ ] **Step 6: Run forbidden-retry tests RED, implement minimal guards, then run GREEN**

Run:

```bash
node --test --test-name-pattern='未知框架|第二次启动|框架就绪后|session 关闭|预算耗尽' scripts/wechat-devtools-e2e.node-test.mjs
```

Expected RED before guards, then all PASS after the minimal guard implementation.

- [ ] **Step 7: Add bounded console/exception capture and redaction tests**

Test 201 synthetic console entries and a path/account/cloud sentinel. Assert only 200 entries remain, `consoleDropped===1`, each message is at most 2,048 characters, and no sentinel survives. Mirror the same test for exceptions.

- [ ] **Step 8: Implement bounded capture and confirm the full runner contract suite**

Run:

```bash
node --test scripts/wechat-devtools-e2e.node-test.mjs
```

Expected: all tests PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add scripts/wechat-devtools-e2e.cjs scripts/wechat-devtools-e2e.node-test.mjs
git commit -m "fix(e2e): recover one transient DevTools startup"
```

### Task 4: Integrate startup events with the real E2E flow

**Files:**
- Modify: `scripts/wechat-devtools-e2e.node-test.mjs`
- Modify: `scripts/wechat-devtools-e2e.cjs`

- [ ] **Step 1: Write RED source-contract and pure-flow tests**

Assert report schema v4 includes `localGitSha`, `startupOutcome`, `productVerdict`, `recoveredStartupFailure`, `startup.attempts`, `console`, `exceptions`, and dropped counts. Assert the runner calls `launchWithStartupRecovery` instead of direct `automator.launch`, and that `relaunchLoaded` records `relaunch` before navigation plus `data_ready` only after the business predicate returns.

- [ ] **Step 2: Run the runner suite and confirm RED**

```bash
node --test scripts/wechat-devtools-e2e.node-test.mjs
```

Expected: the new source-contract assertions FAIL.

- [ ] **Step 3: Wire the real main flow**

Change the report initializer to schema v4 and set:

```js
localGitSha: execFileSync('git', ['-C', projectPath, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
startupOutcome: null,
productVerdict: 'NOT_EXECUTED',
recoveredStartupFailure: false,
startup: { budgetMs: 90_000, frameworkTimeoutMs: 30_000, attempts: [] },
console: [],
consoleDropped: 0,
exceptions: [],
exceptionsDropped: 0,
```

Keep `git` as the same local SHA compatibility alias. Replace direct launch with `launchWithStartupRecovery`; return early when it yields no miniProgram. Record initial `relaunch` and `data_ready` events in the active successful attempt. Route read errors go through the same sanitized diagnostic recorder, but never trigger session recovery after framework readiness.

- [ ] **Step 4: Update exit semantics and error serialization**

Pass the runner redactor to `runWithReport.serializeError`. Treat both `passed` and `passed_with_startup_recovery` as zero-exit single-run outcomes; keep `blocked` as exit 2 and `failed` as exit 1. Preserve the explicit startup state so aggregators can distinguish recovered runs.

- [ ] **Step 5: Run all related suites**

```bash
node --test scripts/p0-journey-driver.node-test.mjs scripts/e2e-report.node-test.mjs scripts/wechat-devtools-e2e.node-test.mjs
```

Expected: all tests PASS with no warnings.

- [ ] **Step 6: Commit Task 4**

```bash
git add scripts/wechat-devtools-e2e.cjs scripts/wechat-devtools-e2e.node-test.mjs
git commit -m "feat(e2e): report DevTools startup phases"
```

### Task 5: Enforce the recovery-streak batch gate

**Files:**
- Create: `scripts/check-devtools-e2e-batch.node-test.mjs`
- Create: `scripts/check-devtools-e2e-batch.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write RED CLI tests with temporary report fixtures**

Spawn the CLI with ordered JSON files and assert:

- `PASS, PASS_WITH_STARTUP_RECOVERY, PASS` exits 0;
- two adjacent recovery states exit 2 and print `BLOCKED_ENVIRONMENT_UNSTABLE`;
- `startupOutcome=BLOCKED` exits 2 immediately;
- `productVerdict=FAIL` exits 1 immediately;
- invalid/missing JSON exits 2 and never passes.

- [ ] **Step 2: Run the new suite and confirm RED**

```bash
node --test scripts/check-devtools-e2e-batch.node-test.mjs
```

Expected: FAIL because the CLI file does not exist.

- [ ] **Step 3: Implement the minimal batch CLI**

The CLI must read paths from `process.argv.slice(2)`, require at least one report, validate both `startupOutcome` and `productVerdict`, stop on blocked/failed input, call `aggregateStartupOutcomes` for recovery streaks, print one JSON summary, and set exit 2 for blocked/invalid/unstable or exit 1 for product failure.

- [ ] **Step 4: Add the package command and confirm GREEN**

Add:

```json
"check:devtools:e2e-batch": "node scripts/check-devtools-e2e-batch.mjs"
```

Run:

```bash
node --test scripts/check-devtools-e2e-batch.node-test.mjs
npm run check:devtools:e2e-batch -- /tmp/nonexistent-result.json
```

Expected: tests PASS; the explicit missing-file probe exits 2 with a structured blocked result.

- [ ] **Step 5: Commit Task 5**

```bash
git add package.json scripts/check-devtools-e2e-batch.mjs scripts/check-devtools-e2e-batch.node-test.mjs
git commit -m "test(e2e): enforce DevTools recovery streak gate"
```

### Task 6: Complete local gates and update the authoritative ledger

**Files:**
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: Run formatting and focused tests**

```bash
npx prettier --check scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs scripts/e2e-report.mjs scripts/e2e-report.node-test.mjs scripts/wechat-devtools-e2e.cjs scripts/wechat-devtools-e2e.node-test.mjs scripts/check-devtools-e2e-batch.mjs scripts/check-devtools-e2e-batch.node-test.mjs package.json docs/high-priority-issues.md
node --test scripts/p0-journey-driver.node-test.mjs scripts/e2e-report.node-test.mjs scripts/wechat-devtools-e2e.node-test.mjs scripts/check-devtools-e2e-batch.node-test.mjs
npm run check:governance
git diff --check
```

Expected: all PASS and no diff-check output.

- [ ] **Step 2: Run full validation with isolated visual output**

```bash
validation_dir="$(mktemp -d /tmp/cili-validate-devtools-recovery.XXXXXX)"
start_head="$(git rev-parse HEAD)"
start_porcelain="$(git status --porcelain)"
OUT_DIR="$validation_dir/phase3-visual" npm run validate
test "$(git rev-parse HEAD)" = "$start_head"
test "$(git status --porcelain)" = "$start_porcelain"
```

Expected: `validate` exits 0 and the repository fence remains unchanged.

- [ ] **Step 3: Update the existing P1 status only**

Change the existing cold-start clause from `RUNNER_DESIGN_APPROVED / IMPLEMENTATION_PENDING` to `RUNNER_IMPLEMENTED / REVIEW_PENDING`. Record focused/full local gates, but do not claim cold/warm DevTools evidence until Task 7 succeeds and do not remove the P1.

- [ ] **Step 4: Commit Task 6**

```bash
git add docs/high-priority-issues.md
git commit -m "docs(e2e): mark startup runner ready for review"
```

### Task 7: Produce cold/warm DevTools evidence without mutating the repository

**Files:**
- No repository source changes expected.
- Evidence: four fresh `/tmp/cili-devtools-recovery-*` directories.

- [ ] **Step 1: Record the pre-run fence for every run**

Each evidence directory must contain environment `PWD`, `pwd -P`, Git toplevel, HEAD, porcelain, process snapshot, ports 9420/40694, DevTools version, and automator version. Derive project path only from `git rev-parse --show-toplevel`.

Create four independent destinations and retain the variables for Steps 2–5:

```bash
cold1_dir="$(mktemp -d /tmp/cili-devtools-recovery-cold1.XXXXXX)"
cold2_dir="$(mktemp -d /tmp/cili-devtools-recovery-cold2.XXXXXX)"
warm1_dir="$(mktemp -d /tmp/cili-devtools-recovery-warm1.XXXXXX)"
warm2_dir="$(mktemp -d /tmp/cili-devtools-recovery-warm2.XXXXXX)"
```

- [ ] **Step 2: Run cold pass 1**

Close only the project session, clear compile cache, wait until non-MCP project processes and 9420/40694 listeners are absent, then run the standard harness with `CILI_E2E_OUTPUT="$cold1_dir/output"`. Preserve stdout/stderr and `results.json`.

- [ ] **Step 3: Run cold pass 2 with the same controls**

Repeat cache clear and preconditions in a separate evidence directory. Do not reuse results or overwrite cold pass 1.

- [ ] **Step 4: Run warm passes 1 and 2**

Without clearing compile cache between warm passes, run the standard harness twice into two more evidence directories. Preserve each report independently.

- [ ] **Step 5: Apply the batch gate**

```bash
npm run check:devtools:e2e-batch -- \
  "$cold1_dir/output/results.json" \
  "$cold2_dir/output/results.json" \
  "$warm1_dir/output/results.json" \
  "$warm2_dir/output/results.json"
```

Expected: exit 0; every run has 30/30 checks and 17 registered routes; no adjacent recovery states. Any `PASS_WITH_STARTUP_RECOVERY` remains visible and is not renamed.

- [ ] **Step 6: Verify end fences and summarize for read-only review**

Confirm the current repository HEAD equals the start HEAD and porcelain is empty. Send evidence paths, result states, check/route counts, startup attempts, and budget events to TraeX 审判者. Do not claim development-build or physical-device coverage.

### Task 8: Final implementation commit review

**Files:**
- Review all files changed since `7168db6f`.

- [ ] **Step 1: Inspect commit series and scope**

```bash
git log --oneline --decorate 7168db6f..HEAD
git diff --stat 7168db6f..HEAD
git diff --name-status 7168db6f..HEAD
git status --short --branch
```

Expected: only the planned runner, tests, package script, plan, and existing ledger line changed; no product, visual, manifest, CloudBase, or tracked evidence files changed.

- [ ] **Step 2: Re-run diff and governance checks**

```bash
git diff --check 7168db6f..HEAD
npm run check:governance
```

Expected: PASS.

- [ ] **Step 3: Hand off for independent review**

Provide the frozen HEAD, commit list, RED/GREEN output paths, cold/warm evidence directories, batch-gate result, full validate result, and final porcelain fence. Keep the branch unmerged until TraeX 审判者 independently recomputes the evidence.
