# P0 真实旅程驱动基础 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立严格脱敏、可单测的 P0 真实旅程驱动核心，在任何写操作前执行普通成员与路线夹具预检，并统一页面等待、未知结果对账、审计投影和失败补偿。

**Architecture:** 单个无平台依赖的 Node.js 模块提供严格 schema 和四类编排原语，真实微信开发者工具与 CloudBase 连接由后续适配器注入。CLI 本轮只读取脱敏预检快照；驱动核心不保存凭证、不直接访问远端，也不会自动重试写操作或删除数据库记录。

**Tech Stack:** Node.js ESM、Node test runner、现有旅程证据签发/校验脚本、Prettier

---

## 文件结构

| 操作 | 文件 | 责任 |
| --- | --- | --- |
| Create | `scripts/p0-journey-driver.mjs` | 预检 schema、页面等待、写后对账、审计脱敏、补偿编排及 CLI |
| Create | `scripts/p0-journey-driver.node-test.mjs` | 驱动 API 和 CLI 的 Node 单元测试 |
| Modify | `package.json` | 增加预检命令并将驱动测试纳入旅程测试门禁 |
| Modify | `docs/verification/p0-real-registration-journey.md` | 记录预检文件、驱动不变量和现场适配边界 |

### Task 1: 严格预检模型与 CLI

**Files:**
- Create: `scripts/p0-journey-driver.node-test.mjs`
- Create: `scripts/p0-journey-driver.mjs`

- [ ] **Step 1: 写预检失败测试**

测试先导入尚不存在的 `evaluateJourneyPreflight`，并构造不含真实标识的基线：

```js
const readyPreflight = () => ({
  schemaVersion: 1,
  environment: { kind: 'test', deployed: true },
  member: {
    available: true,
    role: 'member',
    profileReady: true,
    stravaConnected: true,
    stravaReady: true,
    oauthFresh: true,
  },
  routeFixture: {
    available: true,
    ownedByMember: true,
    previewReady: true,
    gpxReady: true,
  },
});

test('完整普通成员和路线夹具预检通过', () => {
  assert.deepEqual(evaluateJourneyPreflight(readyPreflight()), {
    outcome: 'ready',
    blockers: [],
  });
});

test('所有缺失前置条件按稳定顺序标记为未执行', () => {
  const value = readyPreflight();
  value.environment = { kind: 'production', deployed: false };
  value.member = {
    available: false,
    role: 'admin',
    profileReady: false,
    stravaConnected: false,
    stravaReady: false,
    oauthFresh: false,
  };
  value.routeFixture = {
    available: false,
    ownedByMember: false,
    previewReady: false,
    gpxReady: false,
  };
  assert.deepEqual(evaluateJourneyPreflight(value), {
    outcome: 'not_executed',
    blockers: [
      'ENVIRONMENT_NOT_TEST',
      'DEPLOYMENT_NOT_READY',
      'MEMBER_UNAVAILABLE',
      'MEMBER_ROLE_INVALID',
      'MEMBER_PROFILE_NOT_READY',
      'STRAVA_NOT_CONNECTED',
      'STRAVA_NOT_READY',
      'OAUTH_NOT_FRESH',
      'ROUTE_FIXTURE_UNAVAILABLE',
      'ROUTE_FIXTURE_OWNER_MISMATCH',
      'ROUTE_PREVIEW_NOT_READY',
      'ROUTE_GPX_NOT_READY',
    ],
  });
});
```

再覆盖根节点、嵌套对象、类型和敏感字段：

```js
assert.throws(
  () => evaluateJourneyPreflight({ ...readyPreflight(), openid: 'forbidden' }),
  (error) => error.code === 'PREFLIGHT_SCHEMA_INVALID',
);
assert.throws(
  () =>
    evaluateJourneyPreflight({
      ...readyPreflight(),
      member: { ...readyPreflight().member, accessToken: 'forbidden' },
    }),
  (error) => error.code === 'PREFLIGHT_SCHEMA_INVALID',
);
assert.throws(
  () =>
    evaluateJourneyPreflight({
      ...readyPreflight(),
      routeFixture: { ...readyPreflight().routeFixture, available: 'yes' },
    }),
  (error) => error.code === 'PREFLIGHT_SCHEMA_INVALID',
);
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: FAIL，`scripts/p0-journey-driver.mjs` 不存在。

- [ ] **Step 3: 实现最小预检模型**

在实现中定义固定错误：

```js
const ERROR_MESSAGES = Object.freeze({
  PREFLIGHT_SCHEMA_INVALID: '预检文件结构无效',
  PAGE_NOT_READY: '目标页面未就绪',
  WRITE_OUTCOME_UNKNOWN: '写操作结果无法确认',
  AUDIT_SCHEMA_INVALID: '审计记录结构无效',
  COMPENSATION_INCOMPLETE: '失败补偿未完成',
});

export class JourneyDriverError extends Error {
  constructor(code) {
    super(ERROR_MESSAGES[code]);
    this.name = 'JourneyDriverError';
    this.code = code;
  }
}
```

使用精确 key 集合和布尔类型校验输入，不在错误中插入字段值。按规格中的稳定顺序累积
blocker，并返回：

```js
return {
  outcome: blockers.length === 0 ? 'ready' : 'not_executed',
  blockers,
};
```

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: 预检测试 PASS。

- [ ] **Step 5: 写 CLI 失败测试**

在临时目录分别写入 ready、blocked 和非法 JSON 文件，使用 `spawnSync` 调用脚本：

```js
const ready = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', readyPath], {
  encoding: 'utf8',
});
assert.equal(ready.status, 0);
assert.equal(ready.stdout, 'P0 真实旅程预检通过\n');
assert.equal(ready.stderr, '');

const blocked = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', blockedPath], {
  encoding: 'utf8',
});
assert.equal(blocked.status, 2);
assert.match(blocked.stderr, /^P0 真实旅程预检未执行: [A-Z_,]+\n$/);
assert.doesNotMatch(blocked.stderr, /openid|token|forbidden/i);

const invalid = spawnSync(process.execPath, [scriptPath, 'preflight', '--input', invalidPath], {
  encoding: 'utf8',
});
assert.equal(invalid.status, 1);
assert.equal(invalid.stderr, 'P0 真实旅程预检失败: 预检文件结构无效\n');
```

- [ ] **Step 6: 运行测试确认 RED**

Expected: FAIL，CLI 未实现或退出码不符合要求。

- [ ] **Step 7: 实现 CLI**

仅接受：

```text
preflight --input <absolute-or-relative-json-path>
```

解析失败、参数错误和 schema 错误统一输出固定失败消息并设置退出码 `1`。blocker
只连接固定枚举值，设置退出码 `2`。使用 `pathToFileURL(process.argv[1])` 保护模块被
测试导入时不执行 CLI。

- [ ] **Step 8: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: 预检与 CLI 测试全部 PASS。

- [ ] **Step 9: 提交**

```bash
git add scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs
git commit -m "feat(e2e): add sanitized journey preflight"
```

### Task 2: 页面就绪与写后对账

**Files:**
- Modify: `scripts/p0-journey-driver.node-test.mjs`
- Modify: `scripts/p0-journey-driver.mjs`

- [ ] **Step 1: 写页面等待失败测试**

使用可控时钟验证空 meta、旧页面和业务数据未就绪都不会提前成功：

```js
test('页面路径和业务数据在同一次读取中就绪才成功', async () => {
  const pages = [
    { path: '', data: null },
    { path: 'pages/activity/list', data: { registration: null } },
    { path: 'pages/activity/detail', data: { registration: null } },
    { path: 'pages/activity/detail', data: { registration: { status: 'pending' } } },
  ];
  let time = 0;
  const result = await waitForPageReady({
    readPage: async () => pages.shift(),
    expectedPath: 'pages/activity/detail',
    isDataReady: (data) => data?.registration?.status === 'pending',
    timeoutMs: 100,
    intervalMs: 10,
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
  });
  assert.deepEqual(result, { attempts: 4, elapsedMs: 30 });
});
```

超时测试把页面数据放入 sentinel，并断言错误消息不包含 sentinel：

```js
await assert.rejects(
  waitForPageReady({
    readPage: async () => ({ path: 'old', data: { secret: 'PAGE_SENTINEL' } }),
    expectedPath: 'target',
    isDataReady: () => false,
    timeoutMs: 20,
    intervalMs: 10,
    now: () => time,
    wait: async (ms) => {
      time += ms;
    },
  }),
  (error) =>
    error.code === 'PAGE_NOT_READY' &&
    !error.message.includes('PAGE_SENTINEL'),
);
```

- [ ] **Step 2: 运行测试确认 RED**

Expected: FAIL，`waitForPageReady` 未导出。

- [ ] **Step 3: 实现页面等待**

每轮只调用一次 `readPage()`，在同一快照上判断：

```js
if (page?.path === expectedPath && isDataReady(page.data)) {
  return { attempts, elapsedMs: Math.max(0, now() - startedAt) };
}
```

到达 timeout 后抛出 `new JourneyDriverError('PAGE_NOT_READY')`。返回值和错误均不得
包含 `page.data`。

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: 页面等待测试 PASS。

- [ ] **Step 5: 写写后对账失败测试**

覆盖成功、超时但已提交、明确未提交和未知四类结果，并在每类断言 `execute` 只调用一次：

```js
test('写调用抛错但回读已提交时不重试写操作', async () => {
  let writes = 0;
  const result = await runReconciledWrite({
    execute: async () => {
      writes += 1;
      throw new Error('AUTOMATION_TIMEOUT_SENTINEL');
    },
    reconcile: async () => 'committed',
    timeoutMs: 0,
    intervalMs: 0,
  });
  assert.equal(writes, 1);
  assert.deepEqual(result, {
    outcome: 'committed',
    source: 'reconciled_after_error',
    reconciliationAttempts: 1,
  });
});

test('持续未提交时返回 not_committed 且不重试写操作', async () => {
  let writes = 0;
  const result = await runReconciledWrite({
    execute: async () => {
      writes += 1;
    },
    reconcile: async () => 'not_committed',
    timeoutMs: 0,
    intervalMs: 0,
  });
  assert.equal(writes, 1);
  assert.equal(result.outcome, 'not_committed');
});
```

`reconcile()` 返回 `unknown`、非法值或抛出包含 sentinel 的错误时，断言固定
`WRITE_OUTCOME_UNKNOWN` 且消息不泄露 sentinel。

- [ ] **Step 6: 运行测试确认 RED**

Expected: FAIL，`runReconciledWrite` 未导出。

- [ ] **Step 7: 实现写后对账**

实现要求：

- `execute()` 在函数内只有一个调用点；
- 捕获写错误但不保存或输出其消息；
- `reconcile()` 可在 timeout 内轮询；
- `committed` 返回固定结果；
- timeout 时返回 `not_committed`；
- `unknown`、非法值或回读异常抛出固定错误；
- 不调用 `execute()` 第二次。

- [ ] **Step 8: 运行测试确认 GREEN 并提交**

```bash
node --test scripts/p0-journey-driver.node-test.mjs
git add scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs
git commit -m "feat(e2e): reconcile journey writes safely"
```

### Task 3: 审计脱敏与失败补偿

**Files:**
- Modify: `scripts/p0-journey-driver.node-test.mjs`
- Modify: `scripts/p0-journey-driver.mjs`

- [ ] **Step 1: 写审计脱敏失败测试**

输入故意使用真实 ID sentinel，输出必须是合成别名且按时间排序：

```js
const result = sanitizeJourneyAudits({
  audits: [
    {
      action: 'registration.submitted',
      target_id: 'REAL_REGISTRATION_SENTINEL',
      created_at: '2026-10-09T01:01:00.000Z',
    },
    {
      action: 'strava.sync.succeeded',
      target_id: 'REAL_OPENID_SENTINEL',
      created_at: '2026-10-09T01:00:00.000Z',
    },
  ],
  subjectId: 'REAL_OPENID_SENTINEL',
  registrationId: 'REAL_REGISTRATION_SENTINEL',
  subjectAlias: 'user_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  registrationAlias: 'reg_test_P0_20261009_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
});
assert.deepEqual(result.map((audit) => audit.action), [
  'strava.sync.succeeded',
  'registration.submitted',
]);
assert.doesNotMatch(JSON.stringify(result), /REAL_.*_SENTINEL/);
```

分别测试未知动作、错误 target、额外字段、重复动作和非规范时间戳，均抛出
`AUDIT_SCHEMA_INVALID` 且不回显输入。

- [ ] **Step 2: 运行测试确认 RED**

Expected: FAIL，`sanitizeJourneyAudits` 未导出。

- [ ] **Step 3: 实现审计脱敏**

定义动作到主体类型的固定映射。输入审计记录必须只含：

```js
new Set(['action', 'target_id', 'created_at'])
```

时间戳必须满足：

```js
Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value
```

先验证完整输入，再映射 alias 并按 `created_at` 升序返回，确保任何失败都不会返回部分
结果。

- [ ] **Step 4: 运行测试确认 GREEN**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: 审计测试 PASS。

- [ ] **Step 5: 写失败补偿测试**

测试初始状态含 `pending`、`approved`、`cancelled` 和 `checked_in`：

```js
test('补偿只取消可取消报名并在结束活动后回读归零', async () => {
  const calls = [];
  let reads = 0;
  const result = await compensateJourney({
    readState: async () => {
      reads += 1;
      return reads === 1
        ? {
            activityStatus: 'published',
            registrations: [
              { id: 'r1', status: 'pending' },
              { id: 'r2', status: 'approved' },
              { id: 'r3', status: 'cancelled' },
              { id: 'r4', status: 'checked_in' },
            ],
          }
        : {
            activityStatus: 'finished',
            registrations: [
              { id: 'r1', status: 'cancelled' },
              { id: 'r2', status: 'cancelled' },
              { id: 'r3', status: 'cancelled' },
              { id: 'r4', status: 'checked_in' },
            ],
          };
    },
    cancelRegistration: async (id) => calls.push(`cancel:${id}`),
    finishActivity: async () => calls.push('finish'),
  });
  assert.deepEqual(calls, ['cancel:r1', 'cancel:r2', 'finish']);
  assert.deepEqual(result, {
    outcome: 'completed',
    cancelledCount: 2,
    activityFinished: true,
  });
});
```

再覆盖动作抛错后仍执行后续补偿和最终回读；最终仍有 `waiting`、`pending` 或
`approved`，或活动不是 `finished` 时抛出固定 `COMPENSATION_INCOMPLETE`。

- [ ] **Step 6: 运行测试确认 RED**

Expected: FAIL，`compensateJourney` 未导出。

- [ ] **Step 7: 实现失败补偿**

初始读取失败直接抛固定错误。对每个可取消报名只调用一次取消，即使某次取消抛错也继续
处理剩余报名；尚未结束时只调用一次 `finishActivity()`。最后始终再读取一次状态：

```js
const remaining = finalState.registrations.filter((registration) =>
  ACTIVE_REGISTRATION_STATUSES.has(registration.status),
);
if (finalState.activityStatus !== 'finished' || remaining.length > 0) {
  throw new JourneyDriverError('COMPENSATION_INCOMPLETE');
}
```

返回值只含计数和布尔状态，不含报名 ID。

- [ ] **Step 8: 运行测试确认 GREEN 并提交**

```bash
node --test scripts/p0-journey-driver.node-test.mjs
git add scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs
git commit -m "feat(e2e): sanitize audits and compensate failures"
```

### Task 4: 门禁与现场手册接线

**Files:**
- Modify: `package.json`
- Modify: `docs/verification/p0-real-registration-journey.md`
- Modify: `scripts/p0-journey-driver.node-test.mjs`

- [ ] **Step 1: 写门禁与文档契约失败测试**

测试读取 `package.json` 和现场手册，断言：

```js
assert.equal(
  packageJson.scripts['check:journey-preflight'],
  'node scripts/p0-journey-driver.mjs preflight',
);
assert.match(
  packageJson.scripts['test:journey-evidence'],
  /scripts\/p0-journey-driver\.node-test\.mjs/,
);
assert.match(guide, /check:journey-preflight/);
assert.match(guide, /预检未通过.*未执行/s);
assert.match(guide, /runReconciledWrite/);
assert.match(guide, /compensateJourney/);
assert.match(guide, /不得.*删除数据库记录/s);
```

- [ ] **Step 2: 运行测试确认 RED**

Run:

```bash
node --test scripts/p0-journey-driver.node-test.mjs
```

Expected: FAIL，脚本和手册尚未接线。

- [ ] **Step 3: 修改 package scripts**

将脚本调整为：

```json
{
  "test:journey-evidence": "node --test tests/verify-journey-evidence.node-test.mjs scripts/p0-journey-driver.node-test.mjs",
  "check:journey-preflight": "node scripts/p0-journey-driver.mjs preflight"
}
```

- [ ] **Step 4: 更新现场手册**

在“现场验证前置条件”后新增“自动化预检”：

1. 现场适配器只写规格允许的布尔快照；
2. 运行 `npm run check:journey-preflight -- --input <path>`；
3. 退出码 `2` 必须记录为“未执行”，不得继续任何写操作；
4. 快照不得包含真实账号、路线 ID 或凭证；
5. DevTools/CloudBase 适配器必须复用 `waitForPageReady`、`runReconciledWrite`、
   `sanitizeJourneyAudits` 和 `compensateJourney`；
6. 补偿只允许业务取消和结束活动，不得借驱动核心删除数据库记录。

- [ ] **Step 5: 运行聚焦测试确认 GREEN**

```bash
npm run test:journey-evidence
```

Expected: 现有证据校验测试和新增驱动测试全部 PASS。

- [ ] **Step 6: 格式化并运行全量门禁**

```bash
npx prettier --write \
  scripts/p0-journey-driver.mjs \
  scripts/p0-journey-driver.node-test.mjs \
  docs/verification/p0-real-registration-journey.md \
  package.json
npm run validate
```

Expected: 格式检查、ESLint、TypeScript、Vitest、全部 Node 测试、云函数测试、云包校验
和构建全部 PASS。

- [ ] **Step 7: 提交**

```bash
git add package.json docs/verification/p0-real-registration-journey.md \
  scripts/p0-journey-driver.mjs scripts/p0-journey-driver.node-test.mjs
git commit -m "test(e2e): gate P0 journey driver"
```

### Task 5: 推送与远端验证

**Files:**
- No file changes expected

- [ ] **Step 1: 检查提交和工作区**

```bash
git status --short --branch
git log -6 --oneline
```

Expected: 工作区干净；设计、计划、预检、对账、补偿和门禁提交边界清晰。

- [ ] **Step 2: 推送**

```bash
git push origin main
```

Expected: `main` 推送成功。

- [ ] **Step 3: 检查 GitHub Actions**

使用 `gh run list` 和 `gh run watch` 检查本次 `CI`。由于变更仅涉及
`scripts/p0-journey-driver*`、测试和文档，不属于微信开发版上传白名单，预期：

- CI 全部通过；
- 微信开发版自动上传工作流成功结束并明确跳过上传；
- 不消耗新的微信开发版本号。

## 计划自检

- 规格中的预检、页面等待、未知结果对账、审计脱敏、失败补偿和无删除边界均有对应任务。
- 新增生产函数均先有失败测试，再有最小实现。
- 对外错误码和状态名在所有任务中保持一致。
- 计划不包含真实平台凭证、账号标识、路线 ID 或远端写操作。
