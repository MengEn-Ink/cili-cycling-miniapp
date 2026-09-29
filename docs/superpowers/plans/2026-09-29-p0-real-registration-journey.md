# P0 Real Registration Journey Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Strava OAuth automatically converge to a server-verifiable readiness state, then complete registration, approval, credential, cancellation, and resubmission with transactional audit evidence.

**Architecture:** Preserve the native Mini Program, `CloudRepository`, CloudBase collections, encryption, and capacity transactions. Treat `strava_credentials + strava_snapshots` as the only readiness source, coordinate sync through a two-minute fenced lease, and expose one nullable readiness DTO to a bounded client poller. This is plan 1 of 3 and covers design stages 0 and 1; the activity/review UI rebuild and later admin capabilities get separate plans after P0 is green.

**Tech Stack:** WeChat Mini Program TypeScript/WXML/WXSS, CloudBase Node.js 20 functions, `wx-server-sdk` 4.0.2, Node test runner, Vitest 5, Prettier, ESLint.

---

## Ownership and file map

Run this plan in an isolated worktree from the approved design commit. Do not touch the concurrent `feat/p0-activity-management` checkout.

Only edit shared sources during feature tasks:

- `cloudfunctions/strava-shared/core.js` owns OAuth/readiness logic. `strava-auth/oauth/*` and `strava-callback/oauth/*` are generated in Task 9.
- `cloudfunctions/shared/domain.js` and `cloudfunctions/shared/use-cases.js` own registration behavior. `activity-read/domain/*`, `registration/domain/*`, and `admin-review/domain/*` are generated in Task 9.
- A single integration owner runs `npm run cloud:prepare`; parallel workers never edit generated copies.

Files by responsibility:

- Contract/schema: `README.md`, `docs/requirements-design.md`, `docs/cloudbase-schema.md`, `scripts/bootstrap-cloudbase.mjs`, `scripts/bootstrap-cloudbase.node-test.mjs`.
- Strava domain: `cloudfunctions/strava-shared/core.js`, `cloudfunctions/strava-shared/core.node-test.js`.
- Strava adapter: `cloudfunctions/strava-auth/store.js`, `cloudfunctions/strava-auth/store.node-test.js`, `cloudfunctions/strava-auth/index.js`, `cloudfunctions/strava-auth/package.json`.
- OAuth HTTP: `cloudfunctions/strava-callback/http.js`, `cloudfunctions/strava-callback/http.node-test.js`, `cloudfunctions/strava-callback/index.js`, `cloudfunctions/strava-callback/package.json`, `cloudbaserc.json`.
- Registration: `cloudfunctions/shared/domain.js`, `cloudfunctions/shared/use-cases.js`, `cloudfunctions/shared/domain.node-test.js`, `cloudfunctions/registration/index.js`.
- Client contract: `miniprogram/models/index.ts`, `miniprogram/repositories/types.ts`, `miniprogram/repositories/cloud.ts`, `miniprogram/repositories/mock.ts`, `tests/cloud-repository.test.ts`.
- Client orchestration: `miniprogram/services/strava-readiness-service.ts`, `tests/strava-readiness-service.test.ts`, `miniprogram/utils/validation.ts`, `tests/domain.test.ts`, `miniprogram/pages/strava/*`, `miniprogram/pages/registration-form/*`, `miniprogram/pages/credential/*`.
- Evidence: `scripts/verify-journey-evidence.mjs`, `tests/fixtures/p0-journey-evidence.valid.json`, `docs/verification/p0-real-registration-journey.md`.

TDesign, global visual tokens, nine-branch activity CTA, and approval-page visual reconstruction are intentionally excluded from this P0 plan. They depend on the stable DTO produced here and belong to the P1 UI plan.

## Task 1: Freeze the contract and active-state index

**Files:**

- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`
- Modify: `scripts/bootstrap-cloudbase.mjs`
- Modify: `docs/requirements-design.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `README.md`

- [ ] **Step 1: Write the failing index assertion**

Add beside the existing OAuth index assertions:

```js
const activeStateIndex = INDEXES.find(
  (item) => item.name === 'oauth_states_openid_expires_at',
);
assert.deepEqual(activeStateIndex, {
  collection: 'oauth_states',
  name: 'oauth_states_openid_expires_at',
  keys: [
    ['openid', 1],
    ['expires_at', -1],
  ],
  unique: false,
});
assert.equal(COLLECTIONS.length, 8);
assert.equal(INDEXES.length, 11);
```

- [ ] **Step 2: Run the test and confirm the expected failure**

```bash
npm run test:bootstrap
```

Expected: FAIL because the active-state index is absent and the count is 10.

- [ ] **Step 3: Add the index**

Add to `INDEXES`:

```js
{
  collection: 'oauth_states',
  name: 'oauth_states_openid_expires_at',
  keys: [
    ['openid', 1],
    ['expires_at', -1],
  ],
  unique: false,
},
```

- [ ] **Step 4: Make the three contracts state the same rules**

Add these exact decisions to the requirements, schema, and README:

```text
第一批手机号规则：微信授权号码标记为 wechat/verified；个人主体可手填号码，标记为 manual/unverified。两者都满足第一批报名门禁，管理员审批详情必须展示来源。

Strava 报名资格唯一事实源：strava_credentials + strava_snapshots。profiles.strava 仅为兼容展示缓存，不参与报名判定。

快照新鲜度为 24 小时；同步租约为 2 分钟。覆盖度只描述最近 90 天；第 5 页仍满 200 条时 coverage_complete=false。完整空窗口的统计值可为 0，未知或不完整值为 null。
```

Document these credential fields:

```text
sync_status: pending|running|ready|failed
sync_error_code?: String
sync_started_at?: Date
sync_finished_at?: Date
sync_lease_id?: String
```

- [ ] **Step 5: Verify and commit**

```bash
npx prettier --check README.md docs/requirements-design.md docs/cloudbase-schema.md scripts/bootstrap-cloudbase.mjs scripts/bootstrap-cloudbase.node-test.mjs
npm run test:bootstrap
git add README.md docs/requirements-design.md docs/cloudbase-schema.md scripts/bootstrap-cloudbase.mjs scripts/bootstrap-cloudbase.node-test.mjs
git commit -m "docs(strava): freeze readiness and phone contracts"
```

Expected: formatting and bootstrap tests pass; the commit contains only these five files.

## Task 2: Implement pure readiness and coverage semantics

**Files:**

- Modify: `cloudfunctions/strava-shared/core.node-test.js`
- Modify: `cloudfunctions/strava-shared/core.js`

- [ ] **Step 1: Add failing readiness tests**

Import the new API and add:

```js
const {
  SNAPSHOT_MAX_AGE_MS,
  SYNC_LEASE_MS,
  deriveReadiness,
  fetchActivityWindow,
  statistics,
} = require('./core');

test('fresh canonical snapshot wins without a new sync', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const credential = { athlete_name: 'Rider', sync_status: 'failed' };
  const snapshot = { synced_at: new Date(now.getTime() - SNAPSHOT_MAX_AGE_MS + 1) };
  const result = deriveReadiness(
    { credential, snapshot, hasActiveOAuthState: false },
    now,
  );
  assert.equal(result.state, 'ready');
  assert.equal(result.can_register, true);
});

test('authorizing only exists for an active server state', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  assert.equal(
    deriveReadiness(
      { credential: undefined, snapshot: undefined, hasActiveOAuthState: true },
      now,
    ).state,
    'authorizing',
  );
  assert.equal(
    deriveReadiness(
      { credential: undefined, snapshot: undefined, hasActiveOAuthState: false },
      now,
    ).state,
    'disconnected',
  );
});
```

Add cases for pending/running → syncing, failed without a fresh snapshot → failed, exactly 24 hours old → syncing, invalid timestamp → syncing, and legacy credential + fresh snapshot → ready. Assert the constants are `86_400_000` and `120_000`.

- [ ] **Step 2: Add failing coverage tests**

```js
test('fifth full page marks the 90-day window incomplete', async () => {
  const api = {
    activities: async () => Array.from({ length: 200 }, () => ({ sport_type: 'Ride' })),
  };
  const result = await fetchActivityWindow(api, 'token', {
    after: 1,
    before: 2,
    maxPages: 5,
  });
  assert.equal(result.activities.length, 1000);
  assert.equal(result.coverageComplete, false);
});

test('complete empty data is zero while incomplete data is unknown', () => {
  const now = new Date('2026-09-29T04:00:00.000Z');
  const complete = statistics([], {
    now,
    coverageFrom: new Date('2026-07-01T04:00:00.000Z'),
    coverageTo: now,
    coverageComplete: true,
  });
  assert.equal(complete.total_km, 0);
  assert.equal(complete.activities_90d, 0);
  assert.equal(complete.latest_activity_at, null);

  const partial = statistics([{ sport_type: 'Ride', distance: 1000 }], {
    now,
    coverageFrom: new Date('2026-07-01T04:00:00.000Z'),
    coverageTo: now,
    coverageComplete: false,
  });
  assert.equal(partial.total_km, null);
  assert.equal(partial.weighted_avg_speed_kmh, null);
});
```

- [ ] **Step 3: Run the test and confirm failure**

```bash
node --test cloudfunctions/strava-shared/core.node-test.js
```

Expected: FAIL because the readiness API and coverage result do not exist.

- [ ] **Step 4: Implement readiness**

Add to `core.js`:

```js
const SNAPSHOT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SYNC_LEASE_MS = 2 * 60 * 1000;

function validDate(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function isSnapshotFresh(snapshot, now = new Date()) {
  const synced = validDate(snapshot && snapshot.synced_at);
  return Boolean(synced && now.getTime() - synced.getTime() < SNAPSHOT_MAX_AGE_MS);
}

function deriveReadiness({ credential, snapshot, hasActiveOAuthState }, now = new Date()) {
  if (!credential) {
    return {
      state: hasActiveOAuthState ? 'authorizing' : 'disconnected',
      can_register: false,
      athlete_name: null,
      snapshot: null,
      error: null,
    };
  }
  if (isSnapshotFresh(snapshot, now)) {
    return {
      state: 'ready',
      can_register: true,
      athlete_name: credential.athlete_name || null,
      snapshot,
      error: null,
    };
  }
  if (credential.sync_status === 'failed') {
    return {
      state: 'failed',
      can_register: false,
      athlete_name: credential.athlete_name || null,
      snapshot: null,
      error: {
        code: credential.sync_error_code || 'STRAVA_API_FAILED',
        message: 'Strava 数据准备失败，请重试',
        retryable: true,
      },
    };
  }
  return {
    state: 'syncing',
    can_register: false,
    athlete_name: credential.athlete_name || null,
    snapshot: null,
    error: null,
  };
}
```

- [ ] **Step 5: Return an explicit 90-day window result**

```js
async function fetchActivityWindow(api, accessToken, { after, before, maxPages = 5 }) {
  const activities = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const batch = await api.activities(accessToken, { after, before, page, per_page: 200 });
    if (!Array.isArray(batch)) throw new StravaError('STRAVA_API_INVALID', 'Strava 活动响应无效');
    activities.push(...batch);
    if (batch.length < 200) return { activities, coverageComplete: true };
  }
  return { activities, coverageComplete: false };
}
```

Change `statistics` to accept the window metadata:

```js
function statistics(
  activities,
  { now = new Date(), coverageFrom, coverageTo, coverageComplete },
) {
  const rides = activities.filter(ride);
  const distances = rides.map((item) => Number(item.distance));
  const movingTimes = rides.map((item) => Number(item.moving_time));
  const elevations = rides.map((item) => Number(item.total_elevation_gain));
  const dates = rides.map((item) => validDate(item.start_date));
  const distanceKnown = distances.every(Number.isFinite);
  const movingKnown = movingTimes.every((value) => Number.isFinite(value) && value >= 0);
  const elevationKnown = elevations.every(Number.isFinite);
  const datesKnown = dates.every(Boolean);
  const distance = distanceKnown ? distances.reduce((sum, value) => sum + value, 0) : null;
  const moving = movingKnown ? movingTimes.reduce((sum, value) => sum + value, 0) : null;
  const known = coverageComplete === true;
  return {
    total_km: known && distance !== null ? Number((distance / 1000).toFixed(2)) : null,
    activities_90d: known ? rides.length : null,
    longest_km:
      known && distanceKnown
        ? Number((Math.max(0, ...distances) / 1000).toFixed(2))
        : null,
    total_elevation_m:
      known && elevationKnown
        ? Number(elevations.reduce((sum, value) => sum + value, 0).toFixed(1))
        : null,
    weighted_avg_speed_kmh:
      !known || distance === null || moving === null
        ? null
        : rides.length === 0
          ? 0
          : moving > 0
            ? Number(((distance / moving) * 3.6).toFixed(2))
            : null,
    latest_activity_at:
      known && datesKnown && dates.length
        ? new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
        : null,
    synced_at: now,
    coverage_from: coverageFrom,
    coverage_to: coverageTo,
    coverage_complete: known,
  };
}
```

Export all new constants and functions.

- [ ] **Step 6: Verify and commit**

```bash
node --test cloudfunctions/strava-shared/core.node-test.js cloudfunctions/strava-shared/api.node-test.js
git add cloudfunctions/strava-shared/core.js cloudfunctions/strava-shared/core.node-test.js
git commit -m "feat(strava): define readiness and coverage semantics"
```

Expected: all shared Strava tests pass.

## Task 3: Add the fenced synchronization lease

**Files:**

- Modify: `cloudfunctions/strava-shared/core.node-test.js`
- Modify: `cloudfunctions/strava-shared/core.js`
- Create: `cloudfunctions/strava-auth/store.js`
- Create: `cloudfunctions/strava-auth/store.node-test.js`
- Modify: `cloudfunctions/strava-auth/index.js`
- Modify: `cloudfunctions/strava-auth/package.json`

- [ ] **Step 1: Write failing orchestration tests**

Add tests for fresh fast-path, active lease, expired lease takeover, concurrent single winner, fencing, safe failure, and token refresh. The two most important assertions are:

```js
const result = await ensureReadyFlow({
  openid: 'user-1',
  env,
  store: freshStore,
  api,
  now: new Date('2026-09-29T04:00:00.000Z'),
  randomUUID: () => 'lease-new',
});
assert.equal(result.state, 'ready');
assert.equal(freshStore.claims.length, 0);
assert.equal(api.activities.mock.callCount(), 0);

assert.equal(
  await fencedStore.completeSync('user-1', {
    leaseId: 'lease-old',
    credential,
    snapshot,
    finishedAt: now,
    audit,
  }),
  false,
);
assert.equal(fencedStore.snapshot, undefined);
```

- [ ] **Step 2: Run the test and confirm failure**

```bash
node --test cloudfunctions/strava-shared/core.node-test.js
```

Expected: FAIL because `ensureReadyFlow` and the lease store contract do not exist.

- [ ] **Step 3: Separate network computation from persistence**

Implement this signature in `core.js`:

```js
async function buildSyncResult({
  openid,
  env,
  credential,
  api,
  now = new Date(),
  maxPages = 5,
}) {
  const cfg = config(env);
  if (!credential) throw new StravaError('STRAVA_NOT_CONNECTED', '尚未绑定 Strava');
  const refreshed = await usableCredential({ openid, credential, cfg, api, now });
  const coverageTo = now;
  const coverageFrom = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const window = await fetchActivityWindow(api, refreshed.accessToken, {
    after: Math.floor(coverageFrom.getTime() / 1000),
    before: Math.ceil(coverageTo.getTime() / 1000),
    maxPages,
  });
  return {
    credential: refreshed.document,
    snapshot: {
      _id: openid,
      openid,
      ...statistics(window.activities, {
        now,
        coverageFrom,
        coverageTo,
        coverageComplete: window.coverageComplete,
      }),
    },
  };
}
```

`usableCredential` returns `{ accessToken, document }`; it may call refresh but never writes. Delete persistence from the old `syncFlow`.

- [ ] **Step 4: Implement the orchestrator**

```js
async function ensureReadyFlow({ openid, env, store, api, now = new Date(), randomUUID = crypto.randomUUID }) {
  let bundle = await store.readReadiness(openid, now);
  let readiness = deriveReadiness(bundle, now);
  if (readiness.state === 'ready' || readiness.state === 'disconnected' || readiness.state === 'authorizing')
    return readiness;

  const leaseId = randomUUID();
  const claim = await store.acquireSyncLease(openid, {
    leaseId,
    now,
    staleBefore: new Date(now.getTime() - SYNC_LEASE_MS),
    audit: syncAudit(openid, 'strava.sync.started', now),
  });
  if (!claim.acquired) return deriveReadiness({ ...claim, hasActiveOAuthState: false }, now);

  try {
    const built = await buildSyncResult({ openid, env, credential: claim.credential, api, now });
    await store.completeSync(openid, {
      leaseId,
      ...built,
      finishedAt: now,
      audit: syncAudit(openid, 'strava.sync.succeeded', now, { coverage_complete: built.snapshot.coverage_complete }),
    });
  } catch (error) {
    const code = error instanceof StravaError ? error.code : 'STRAVA_API_FAILED';
    await store.failSync(openid, {
      leaseId,
      errorCode: code,
      finishedAt: now,
      audit: syncAudit(openid, 'strava.sync.failed', now, { error_code: code }),
    });
  }
  bundle = await store.readReadiness(openid, now);
  return deriveReadiness(bundle, now);
}
```

If a stale worker loses fencing, its `completeSync` or `failSync` returns false and the final read returns the new owner’s state.

- [ ] **Step 5: Test then implement the CloudBase adapter**

Create `store.node-test.js` with a fake transaction and assert:

- acquisition re-reads credential/snapshot inside `runTransaction`;
- fresh snapshot returns `acquired:false` without writes;
- an unexpired running lease returns `acquired:false`;
- expired running can be replaced;
- completion and failure write only when `sync_lease_id` matches;
- success atomically writes credential, snapshot, profile compatibility cache, and audit;
- failure stores only a stable error code and audit;
- disconnect reads profile through the transaction object.

Implement `store.js` with this transaction structure:

```js
const { isSnapshotFresh, writableDocument } = require('./oauth/core');

async function maybeGet(collection, id) {
  try {
    return (await collection.doc(id).get()).data;
  } catch (error) {
    if (Number(error && error.errCode) === -502001 || /not exist|not found/i.test(String(error && error.errMsg)))
      return undefined;
    throw error;
  }
}

function createReadinessStore(db) {
  const command = db.command;
  return {
    async readReadiness(openid, now) {
      const [credential, snapshot, active] = await Promise.all([
        maybeGet(db.collection('strava_credentials'), openid),
        maybeGet(db.collection('strava_snapshots'), openid),
        db
          .collection('oauth_states')
          .where({
            openid,
            expires_at: command.gt(now),
            consumed_at: command.exists(false),
          })
          .limit(1)
          .get(),
      ]);
      return {
        credential,
        snapshot,
        hasActiveOAuthState: Boolean(active.data && active.data.length),
      };
    },
    acquireSyncLease(openid, { leaseId, now, staleBefore, audit }) {
      return db.runTransaction(async (tx) => {
        const credential = await maybeGet(tx.collection('strava_credentials'), openid);
        const snapshot = await maybeGet(tx.collection('strava_snapshots'), openid);
        if (!credential || isSnapshotFresh(snapshot, now))
          return { acquired: false, credential, snapshot };
        const startedAt = new Date(credential.sync_started_at);
        const activeLease =
          credential.sync_status === 'running' &&
          Number.isFinite(startedAt.getTime()) &&
          startedAt > staleBefore;
        if (activeLease) return { acquired: false, credential, snapshot };
        await tx.collection('strava_credentials').doc(openid).update({
          data: {
            sync_status: 'running',
            sync_lease_id: leaseId,
            sync_started_at: now,
            sync_error_code: command.remove(),
            updated_at: now,
          },
        });
        await tx.collection('audit_logs').add({ data: audit });
        return {
          acquired: true,
          credential: {
            ...credential,
            sync_status: 'running',
            sync_lease_id: leaseId,
            sync_started_at: now,
          },
          snapshot,
        };
      });
    },
    completeSync(openid, { leaseId, credential, snapshot, finishedAt, audit }) {
      return db.runTransaction(async (tx) => {
        const current = await maybeGet(tx.collection('strava_credentials'), openid);
        if (!current || current.sync_lease_id !== leaseId) return false;
        const profile = (await maybeGet(tx.collection('profiles'), openid)) || {};
        await tx.collection('strava_credentials').doc(openid).set({
          data: writableDocument({
            ...current,
            ...credential,
            sync_status: 'ready',
            sync_finished_at: finishedAt,
            updated_at: finishedAt,
          }),
        });
        await tx.collection('strava_credentials').doc(openid).update({
          data: {
            sync_error_code: command.remove(),
            sync_lease_id: command.remove(),
          },
        });
        await tx.collection('strava_snapshots').doc(openid).set({
          data: writableDocument(snapshot),
        });
        await tx.collection('profiles').doc(openid).set({
          data: writableDocument({
            ...profile,
            strava: { status: 'connected', snapshot },
            updated_at: finishedAt,
          }),
        });
        await tx.collection('audit_logs').add({ data: audit });
        return true;
      });
    },
    failSync(openid, { leaseId, errorCode, finishedAt, audit }) {
      return db.runTransaction(async (tx) => {
        const current = await maybeGet(tx.collection('strava_credentials'), openid);
        if (!current || current.sync_lease_id !== leaseId) return false;
        await tx.collection('strava_credentials').doc(openid).update({
          data: {
            sync_status: 'failed',
            sync_error_code: errorCode,
            sync_lease_id: command.remove(),
            sync_finished_at: finishedAt,
            updated_at: finishedAt,
          },
        });
        await tx.collection('audit_logs').add({ data: audit });
        return true;
      });
    },
  };
}
module.exports = { createReadinessStore };
```

Add `disconnect(openid, audit)` using the existing transaction, but read the profile through `tx.collection('profiles')` before updating it. Every mutating method uses `db.runTransaction`. Strava HTTP calls never run inside these transactions.

- [ ] **Step 6: Route the actions**

In `strava-auth/index.js`:

```js
if (event.action === 'status') {
  const now = new Date();
  return ok(deriveReadiness(await store.readReadiness(OPENID, now), now));
}
if (event.action === 'ensureReady' || event.action === 'sync') {
  return ok(await ensureReadyFlow({ openid: OPENID, env: process.env, store, api: stravaApi }));
}
```

Keep `sync` as one-release compatibility alias. `readReadiness` derives authorizing only from a non-expired, unconsumed `oauth_states` record for the current openid.

- [ ] **Step 7: Verify and commit**

Change the package test command to `node --test *.node-test.js`, then run:

```bash
node --test cloudfunctions/strava-shared/core.node-test.js cloudfunctions/strava-shared/api.node-test.js
npm --prefix cloudfunctions/strava-auth test
git add cloudfunctions/strava-shared/core.js cloudfunctions/strava-shared/core.node-test.js cloudfunctions/strava-auth/index.js cloudfunctions/strava-auth/store.js cloudfunctions/strava-auth/store.node-test.js cloudfunctions/strava-auth/package.json
git commit -m "feat(strava): add fenced readiness synchronization"
```

Expected: all readiness, lease, fencing, and existing OAuth tests pass.

## Task 4: Return from OAuth through fixed, query-free pages

**Files:**

- Create: `cloudfunctions/strava-callback/http.js`
- Create: `cloudfunctions/strava-callback/http.node-test.js`
- Modify: `cloudfunctions/strava-callback/index.js`
- Modify: `cloudfunctions/strava-callback/package.json`
- Modify: `cloudbaserc.json`

- [ ] **Step 1: Write failing HTTP tests**

```js
const redirect = redirect303('https://example.com/strava/success');
assert.equal(redirect.statusCode, 303);
assert.equal(redirect.headers.location, 'https://example.com/strava/success');
assert.doesNotMatch(JSON.stringify(redirect), /code-secret|state-secret|openid/);

const page = renderResultPage({ success: true, nonce: 'nonce-123' });
assert.match(page.headers['content-security-policy'], /https:\/\/res\.wx\.qq\.com/);
assert.match(page.headers['content-security-policy'], /'nonce-nonce-123'/);
assert.doesNotMatch(page.headers['content-security-policy'], /unsafe-eval|\*/);
assert.match(page.body, /setTimeout/);
assert.match(page.body, /800/);
assert.match(page.body, /wx\.miniProgram\.navigateBack/);
```

Add a handler test with `code-secret` and `state-secret`; assert neither appears in the 303 response or the final page.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npm --prefix cloudfunctions/strava-callback test
```

Expected: FAIL because fixed result routes do not exist.

- [ ] **Step 3: Implement the response helpers**

Create `http.js`:

```js
function redirect303(location) {
  return {
    statusCode: 303,
    headers: {
      location,
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer',
    },
    body: '',
  };
}

function resultLocation(callbackUrl, success) {
  const url = new URL(callbackUrl);
  url.pathname = success ? '/strava/success' : '/strava/failure';
  url.search = '';
  url.hash = '';
  return url.toString();
}

function renderResultPage({ success, nonce }) {
  const title = success ? '绑定成功' : '绑定失败';
  const csp = [
    "default-src 'none'",
    "style-src 'nonce-" + nonce + "'",
    "script-src 'nonce-" + nonce + "' https://res.wx.qq.com",
    "img-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    statusCode: success ? 200 : 400,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': csp,
      'referrer-policy': 'no-referrer',
    },
    body: `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style nonce="${nonce}">body{font-family:sans-serif;padding:32px;color:#173c2d}button{min-height:44px}</style><h2>${title}</h2><p>${success ? '数据将自动准备。' : '请返回小程序查看原因并重试。'}</p><button id="back">返回小程序</button><script nonce="${nonce}" src="https://res.wx.qq.com/open/js/jweixin-1.6.0.js"></script><script nonce="${nonce}">const go=()=>window.wx&&wx.miniProgram&&wx.miniProgram.navigateBack({delta:1});document.getElementById('back').addEventListener('click',go);setTimeout(go,800);</script>`,
  };
}

module.exports = { redirect303, resultLocation, renderResultPage };
```

- [ ] **Step 4: Dispatch callback and result routes**

In `strava-callback/index.js`, inspect the request path before parsing query. `/strava/success` and `/strava/failure` render fixed pages with `crypto.randomBytes(18).toString('base64url')` as nonce. `/strava/callback` consumes state, saves a credential initialized with `sync_status:'pending'`, then returns 303. Failures log only the stable error code and redirect to the fixed failure page.

- [ ] **Step 5: Add the routes**

Add both entries to `cloudbaserc.json`:

```json
{
  "path": "/strava/success",
  "target": "function:strava-callback",
  "enableAuth": false,
  "domain": "*"
},
{
  "path": "/strava/failure",
  "target": "function:strava-callback",
  "enableAuth": false,
  "domain": "*"
}
```

- [ ] **Step 6: Verify and commit**

Set the package test command to `node --test *.node-test.js`, then run:

```bash
npm --prefix cloudfunctions/strava-callback test
git add cloudbaserc.json cloudfunctions/strava-callback/index.js cloudfunctions/strava-callback/http.js cloudfunctions/strava-callback/http.node-test.js cloudfunctions/strava-callback/package.json
git commit -m "feat(strava): return safely from OAuth callback"
```

Expected: redirect, CSP, replay, and smoke tests pass.

## Task 5: Enforce canonical readiness in the registration transaction

**Files:**

- Modify: `cloudfunctions/shared/domain.node-test.js`
- Modify: `cloudfunctions/shared/domain.js`
- Modify: `cloudfunctions/shared/use-cases.js`
- Modify: `cloudfunctions/registration/index.js`

- [ ] **Step 1: Extend the memory transaction store**

Add credential and snapshot maps plus:

```js
getStravaCredential: async (id) => state.credentials.get(id),
getStravaSnapshot: async (id) => state.snapshots.get(id),
addAudit: async (value) => state.audits.push(value),
```

Seed successful tests with a credential containing both encrypted-token envelopes and a snapshot synced less than 24 hours before the test clock.

- [ ] **Step 2: Add failing canonical and audit tests**

```js
await assert.rejects(
  submitRegistration(storeWithProfileCacheOnly(), input, now),
  (error) => error.code === 'STRAVA_NOT_READY',
);

const result = await submitRegistration(readyStore, input, now);
assert.equal(result.status, 'pending');
assert.deepEqual(readyStore.state.audits.at(-1), {
  actor_openid: openid,
  action: 'registration.submitted',
  target_id: registrationId(activityId, openid),
  created_at: now,
  detail: {
    activity_id: activityId,
    from_status: null,
    to_status: 'pending',
  },
});
```

Add tests for missing credential, missing/stale snapshot, profile-only cache rejection, resubmitted/cancelled audit, nullable metric preservation, and rollback when audit write fails.

- [ ] **Step 3: Run tests and confirm failure**

```bash
npm --prefix cloudfunctions/shared test
```

Expected: FAIL because registration still reads `profiles.strava` and submit/cancel omit audit.

- [ ] **Step 4: Implement canonical selection**

In `domain.js`:

```js
function finiteNumberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function dateOrNull(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function selectCanonicalStrava(credential, snapshot, now = new Date()) {
  if (!credential || !credential.access_token_cipher || !credential.refresh_token_cipher)
    fail('STRAVA_NOT_READY', 'Strava 数据尚未准备完成');
  const syncedAt = dateOrNull(snapshot && snapshot.synced_at);
  if (!snapshot || !syncedAt || now.getTime() - syncedAt.getTime() >= 24 * 60 * 60 * 1000)
    fail('STRAVA_NOT_READY', 'Strava 数据已过期，请重新准备');
  return {
    status: 'connected',
    snapshot: {
      total_km: finiteNumberOrNull(snapshot.total_km),
      activities_90d: finiteNumberOrNull(snapshot.activities_90d),
      longest_km: finiteNumberOrNull(snapshot.longest_km),
      total_elevation_m: finiteNumberOrNull(snapshot.total_elevation_m),
      weighted_avg_speed_kmh: finiteNumberOrNull(snapshot.weighted_avg_speed_kmh),
      latest_activity_at: dateOrNull(snapshot.latest_activity_at),
      synced_at: syncedAt,
      coverage_from: dateOrNull(snapshot.coverage_from),
      coverage_to: dateOrNull(snapshot.coverage_to),
      coverage_complete: snapshot.coverage_complete === true,
    },
  };
}
```

Do not copy credential fields, token ciphertext, lease IDs, or openid into the public registration snapshot.

- [ ] **Step 5: Read five documents and write audit in the same transaction**

Change `submitRegistration` to read:

```js
const [activity, profile, existing, credential, snapshot] = await Promise.all([
  tx.getActivity(activityId),
  tx.getProfile(openid),
  tx.getRegistration(id),
  tx.getStravaCredential(openid),
  tx.getStravaSnapshot(openid),
]);
const strava = selectCanonicalStrava(credential, snapshot, now);
```

After writing registration and occupied count, add:

```js
await tx.addAudit(
  buildAudit(
    openid,
    existing ? 'registration.resubmitted' : 'registration.submitted',
    id,
    now,
    {
      activity_id: activityId,
      from_status: existing ? existing.status : null,
      to_status: 'pending',
    },
  ),
);
```

After cancellation updates registration and occupied count, add `registration.cancelled` with `activity_id`, `from_status`, and `to_status`.

- [ ] **Step 6: Expose the transaction methods**

Add to the object created inside `registration/index.js`:

```js
getStravaCredential: (openid) =>
  maybeGet(transaction.collection('strava_credentials'), openid),
getStravaSnapshot: (openid) =>
  maybeGet(transaction.collection('strava_snapshots'), openid),
addAudit: (audit) => transaction.collection('audit_logs').add({ data: audit }),
```

- [ ] **Step 7: Verify and commit**

```bash
npm --prefix cloudfunctions/shared test
git add cloudfunctions/shared/domain.js cloudfunctions/shared/use-cases.js cloudfunctions/shared/domain.node-test.js cloudfunctions/registration/index.js
git commit -m "feat(registration): enforce canonical Strava readiness"
```

Expected: capacity, canonical readiness, resubmission, cancellation, audit, and rollback tests pass.

## Task 6: Map readiness and nullable metrics in the client

**Files:**

- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/repositories/mock.ts`
- Modify: `tests/cloud-repository.test.ts`

- [ ] **Step 1: Add failing DTO tests**

Use this raw fixture:

```ts
const readinessDto = {
  state: 'ready',
  can_register: true,
  athlete_name: 'Rider',
  snapshot: {
    total_km: 1200,
    activities_90d: 32,
    longest_km: null,
    total_elevation_m: 9000,
    weighted_avg_speed_kmh: 27.4,
    latest_activity_at: null,
    synced_at: '2026-09-29T04:00:00.000Z',
    coverage_from: '2026-07-01T04:00:00.000Z',
    coverage_to: '2026-09-29T04:00:00.000Z',
    coverage_complete: false,
  },
  error: null,
};
```

Assert that `getStravaReadiness()` sends `{ action:'status' }`, `ensureStravaReady()` sends `{ action:'ensureReady' }`, nullable fields remain null, and coverage maps correctly. Add malformed state, metric, and error cases that yield `INVALID_RESPONSE`.

- [ ] **Step 2: Run tests and confirm failure**

```bash
npx vitest run tests/cloud-repository.test.ts
```

Expected: FAIL because the readiness methods and model do not exist.

- [ ] **Step 3: Define the client model**

In `miniprogram/models/index.ts`:

```ts
export type StravaReadinessState =
  | 'disconnected'
  | 'authorizing'
  | 'syncing'
  | 'ready'
  | 'failed';

export interface StravaCoverage {
  from: string;
  to: string;
  complete: boolean;
}

export interface StravaSnapshot {
  totalKm: number | null;
  rides90d: number | null;
  longestKm: number | null;
  elevationM: number | null;
  speedKmh: number | null;
  latestActivityAt: string | null;
  syncedAt: string;
  coverage: StravaCoverage | null;
}

export interface StravaReadiness {
  state: StravaReadinessState;
  canRegister: boolean;
  athleteName: string | null;
  snapshot: StravaSnapshot | null;
  error: null | { code: string; message: string; retryable: boolean };
}
```

Use the same nullable metrics in `Registration.strava`, plus `syncedAt` and `coverage`.

- [ ] **Step 4: Add explicit repository commands**

Add to `RideRepository`:

```ts
getStravaReadiness(): Promise<StravaReadiness>;
ensureStravaReady(): Promise<StravaReadiness>;
cancelRegistration(id: string): Promise<Registration>;
reviewRegistration(
  id: string,
  decision: 'approved' | 'rejected',
  reason?: string,
): Promise<Registration>;
```

Keep `updateRegistration` until Task 8 has migrated every caller. Remove `syncStrava` after Task 7 updates the Strava page.

- [ ] **Step 5: Implement strict mapping**

Create `mapStravaReadiness(raw)` in `repositories/cloud.ts`. Validate the state enum and `can_register` boolean. Each nullable metric accepts only null or a finite number. Missing legacy coverage maps to null; malformed present coverage throws `INVALID_RESPONSE`.

Add:

```ts
async getStravaReadiness() {
  return mapStravaReadiness(await this.call('strava-auth', { action: 'status' }));
}

async ensureStravaReady() {
  return mapStravaReadiness(await this.call('strava-auth', { action: 'ensureReady' }));
}
```

Add matching deterministic responses to `mock.ts`.

- [ ] **Step 6: Verify and commit**

```bash
npx vitest run tests/cloud-repository.test.ts
npm run typecheck
git add miniprogram/models/index.ts miniprogram/repositories/types.ts miniprogram/repositories/cloud.ts miniprogram/repositories/mock.ts tests/cloud-repository.test.ts
git commit -m "feat(miniprogram): consume Strava readiness contract"
```

Expected: repository tests and typecheck pass while compatibility methods remain for current pages.

## Task 7: Add bounded automatic polling

**Files:**

- Create: `miniprogram/services/strava-readiness-service.ts`
- Create: `tests/strava-readiness-service.test.ts`
- Modify: `miniprogram/pages/strava/index.ts`
- Modify: `miniprogram/pages/strava/index.wxml`

- [ ] **Step 1: Write failing polling tests**

```ts
it('polls every 1.5 seconds until ready', async () => {
  const states = [syncing, syncing, ready];
  const ensure = vi.fn(async () => states.shift()!);
  const sleep = vi.fn(async () => undefined);
  await expect(pollStravaReadiness(ensure, { sleep })).resolves.toEqual(ready);
  expect(ensure).toHaveBeenCalledTimes(3);
  expect(sleep).toHaveBeenNthCalledWith(1, 1500);
  expect(sleep).toHaveBeenNthCalledWith(2, 1500);
});

it('stops at 30 seconds with a retryable timeout', async () => {
  let elapsed = 0;
  const sleep = vi.fn(async (ms: number) => { elapsed += ms; });
  const ensure = vi.fn(async () => syncing);
  const result = await pollStravaReadiness(ensure, { sleep, now: () => elapsed });
  expect(result.state).toBe('failed');
  expect(result.error).toEqual({
    code: 'STRAVA_SYNC_TIMEOUT',
    message: '数据准备超时，请重试',
    retryable: true,
  });
  expect(elapsed).toBe(30000);
});
```

Also test immediate ready, failed, disconnected, and authorizing results.

- [ ] **Step 2: Run the test and confirm failure**

```bash
npx vitest run tests/strava-readiness-service.test.ts
```

Expected: FAIL because the poller does not exist.

- [ ] **Step 3: Implement the poller**

```ts
export async function pollStravaReadiness(
  ensureReady: () => Promise<StravaReadiness>,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
  } = {},
): Promise<StravaReadiness> {
  const intervalMs = options.intervalMs ?? 1500;
  const timeoutMs = options.timeoutMs ?? 30000;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  while (true) {
    const value = await ensureReady();
    if (value.state !== 'syncing') return value;
    const elapsed = now() - started;
    if (elapsed >= timeoutMs) {
      return {
        ...value,
        state: 'failed',
        canRegister: false,
        error: {
          code: 'STRAVA_SYNC_TIMEOUT',
          message: '数据准备超时，请重试',
          retryable: true,
        },
      };
    }
    await sleep(Math.min(intervalMs, timeoutMs - elapsed));
  }
}
```

- [ ] **Step 4: Drive the Strava page from readiness**

`onShow` loads status. A disconnected/authorizing response renders directly; syncing/failed triggers `pollStravaReadiness(() => rideService.ensureStravaReady())`. Replace `busy` with `busyAction: null | 'connect' | 'retry' | 'disconnect'`; each handler returns immediately when another action is active.

WXML removes “同步最近 90 天”. It displays `ready/syncing/failed/disconnected/authorizing`, renders null as “未获取”, and offers retry only when `error.retryable` is true. Disconnect must use `wx.showModal`, and its button has both `loading` and `disabled`.

- [ ] **Step 5: Verify and commit**

```bash
npx vitest run tests/strava-readiness-service.test.ts tests/cloud-repository.test.ts
npm run typecheck
git add miniprogram/services/strava-readiness-service.ts tests/strava-readiness-service.test.ts miniprogram/pages/strava/index.ts miniprogram/pages/strava/index.wxml
git commit -m "feat(strava): prepare ride data automatically"
```

Expected: polling and mapping tests pass; the page no longer calls `syncStrava`.

## Task 8: Gate registration and guard member actions

**Files:**

- Modify: `miniprogram/utils/validation.ts`
- Modify: `tests/domain.test.ts`
- Modify: `miniprogram/pages/registration-form/index.ts`
- Modify: `miniprogram/pages/registration-form/index.wxml`
- Modify: `miniprogram/pages/credential/index.ts`
- Modify: `miniprogram/pages/credential/index.wxml`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/repositories/types.ts`

- [ ] **Step 1: Write failing gate tests**

```ts
expect(validateRegistration({ ...valid, readiness: ready })).toEqual([]);
expect(
  validateRegistration({
    ...valid,
    readiness: { state: 'ready', canRegister: false },
  }),
).toContain('Strava 数据尚未准备完成');
expect(validateRegistration({ ...valid, readiness: syncing })).toContain(
  'Strava 数据正在准备',
);
expect(validateRegistration({ ...valid, readiness: failed })).toContain(
  '请重试 Strava 数据准备',
);
```

- [ ] **Step 2: Run the test and confirm failure**

```bash
npx vitest run tests/domain.test.ts
```

Expected: FAIL because validation accepts only the old string status.

- [ ] **Step 3: Validate the server capability**

Change the input to:

```ts
readiness: Pick<StravaReadiness, 'state' | 'canRegister'>;
```

Return state-specific messages and pass only when `canRegister === true`. Do not infer eligibility from labels.

- [ ] **Step 4: Update the registration page**

On `onShow`, load profile and bounded readiness. Store the full `readiness` object. At the first line of `submit`, return when `submitting` is true. Set:

```xml
<button
  class="btn"
  loading="{{submitting}}"
  disabled="{{loading || submitting || !profile || !readiness.canRegister}}"
  bindtap="submit"
>提交审核</button>
```

Show the current readiness message below the Strava gate. A readiness request error disables submission; it must not become disconnected.

- [ ] **Step 5: Split member and administrator repository commands**

```ts
async cancelRegistration(id: string) {
  return mapRegistration(await this.call('registration', {
    action: 'cancel',
    registrationId: requiredId(id, '报名 ID'),
  }));
}

async reviewRegistration(id: string, decision: 'approved' | 'rejected', reason?: string) {
  return mapRegistration(await this.call('admin-review', {
    action: 'review',
    registrationId: requiredId(id, '报名 ID'),
    decision: decision === 'approved' ? 'approve' : 'reject',
    reason: typeof reason === 'string' ? reason : undefined,
  }));
}
```

Update every caller, remove `updateRegistration`, and add repository tests for the two authorization boundaries.

- [ ] **Step 6: Confirm and guard cancellation**

Add `cancelling:false`. Return immediately when true. Call `wx.showModal` with title “确认取消报名” and content “取消后将释放活动名额，可在报名开放期间重新提交。” Call `cancelRegistration` only when confirmed, and release `cancelling` in `finally`. Bind both `loading` and `disabled` in WXML.

- [ ] **Step 7: Verify and commit**

```bash
npx vitest run tests/domain.test.ts tests/cloud-repository.test.ts tests/strava-readiness-service.test.ts
npm run typecheck
git add miniprogram/utils/validation.ts tests/domain.test.ts miniprogram/pages/registration-form/index.ts miniprogram/pages/registration-form/index.wxml miniprogram/pages/credential/index.ts miniprogram/pages/credential/index.wxml miniprogram/repositories/cloud.ts miniprogram/repositories/types.ts
git commit -m "feat(registration): gate submission on ready Strava data"
```

Expected: validation, repository commands, polling, and typecheck pass.

## Task 9: Generate deployable packages and pass offline gates

**Files:**

- Modify: `scripts/verify-cloud-packages.mjs`
- Generated: `cloudfunctions/activity-read/domain/*`
- Generated: `cloudfunctions/registration/domain/*`
- Generated: `cloudfunctions/admin-review/domain/*`
- Generated: `cloudfunctions/strava-auth/oauth/*`
- Generated: `cloudfunctions/strava-callback/oauth/*`

- [ ] **Step 1: Tighten the package verifier**

Add checks that both deployed OAuth cores equal `strava-shared/core.js`, all three deployed domain copies equal `shared/domain.js` and `shared/use-cases.js`, `strava-auth/store.js` exists, and `strava-callback/http.js` exists. Keep registry-only dependency validation.

- [ ] **Step 2: Confirm the verifier detects stale generated files**

```bash
npm run verify:cloud-packages
```

Expected: FAIL because shared sources changed before generated copies.

- [ ] **Step 3: Generate copies exactly once**

```bash
npm run cloud:prepare
git diff -- cloudfunctions/activity-read/domain cloudfunctions/registration/domain cloudfunctions/admin-review/domain cloudfunctions/strava-auth/oauth cloudfunctions/strava-callback/oauth
```

Expected: generated files contain the shared-source changes and no unique hand edits.

- [ ] **Step 4: Run every offline gate**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run test:bootstrap
npm run test:cloud
npm run verify:cloud-packages
npm run build
npm run audit:all
```

Expected: all commands exit 0. If registry access alone blocks `audit:all`, record the exact network error separately; do not report it as a dependency vulnerability.

- [ ] **Step 5: Commit generated files and verifier**

```bash
git add scripts/verify-cloud-packages.mjs cloudfunctions/activity-read/domain cloudfunctions/registration/domain cloudfunctions/admin-review/domain cloudfunctions/strava-auth/oauth cloudfunctions/strava-callback/oauth
git commit -m "chore(cloud): package readiness changes"
```

## Task 10: Define and validate the real-journey evidence bundle

**Files:**

- Create: `scripts/verify-journey-evidence.mjs`
- Create: `tests/fixtures/p0-journey-evidence.valid.json`
- Create: `docs/verification/p0-real-registration-journey.md`
- Modify: `package.json`

- [ ] **Step 1: Create a safe fixture**

```json
{
  "marker": "E2E_RESULT:P0_READY_JOURNEY_001",
  "registrationId": "reg_test_001",
  "statuses": ["pending", "approved", "cancelled", "pending"],
  "occupiedCounts": [3, 4, 4, 3, 4],
  "audits": [
    { "action": "strava.sync.succeeded", "target_id": "user_test_001", "created_at": "2026-09-29T04:00:00.000Z" },
    { "action": "registration.submitted", "target_id": "reg_test_001", "created_at": "2026-09-29T04:01:00.000Z" },
    { "action": "registration.approved", "target_id": "reg_test_001", "created_at": "2026-09-29T04:02:00.000Z" },
    { "action": "registration.cancelled", "target_id": "reg_test_001", "created_at": "2026-09-29T04:03:00.000Z" },
    { "action": "registration.resubmitted", "target_id": "reg_test_001", "created_at": "2026-09-29T04:04:00.000Z" }
  ]
}
```

- [ ] **Step 2: Implement the verifier**

The script accepts one JSON path and checks marker prefix, ordered statuses, occupied-count transitions, required audit actions, consistent target ID, and valid timestamps. Recursively reject keys or string values matching:

```js
const forbidden = /(phone|id_number|access_token|refresh_token|ciphertext|oauth_code|oauth_state)/i;
```

Print only `P0 真实旅程证据校验通过` on success. On failure, print a bounded reason without dumping the evidence object.

- [ ] **Step 3: Add the command and test pass/fail behavior**

Add:

```json
"verify:journey-evidence": "node scripts/verify-journey-evidence.mjs"
```

Run:

```bash
npm run verify:journey-evidence -- tests/fixtures/p0-journey-evidence.valid.json
cp tests/fixtures/p0-journey-evidence.valid.json /private/tmp/p0-invalid.json
node -e "const fs=require('fs');const p='/private/tmp/p0-invalid.json';const x=JSON.parse(fs.readFileSync(p));x.access_token='secret';fs.writeFileSync(p,JSON.stringify(x))"
! npm run verify:journey-evidence -- /private/tmp/p0-invalid.json
```

Expected: safe data passes; sensitive data fails without echoing `secret`.

- [ ] **Step 4: Write the live runbook**

Document this exact sequence in `docs/verification/p0-real-registration-journey.md`:

1. Create an isolated published activity with a unique marker and at least two free places.
2. Use a fresh test user with manual/unverified phone and complete safety profile.
3. Complete OAuth; confirm the initial callback has query parameters and the visible result page is `/strava/success` without query.
4. Return and confirm automatic syncing reaches ready without a manual sync action.
5. Submit once; verify pending, occupied count +1, and submitted audit.
6. Double-tap submit; verify one registration and one occupied increment.
7. Approve and verify the credential.
8. Cancel after confirmation; verify occupied count -1 and cancelled audit.
9. Resubmit; verify the same registration ID, preserved history, occupied count +1, and resubmitted audit.
10. Export only sanitized evidence accepted by the verifier.
11. Disable or delete the isolated activity after capture; cleanup failure is recorded and does not invalidate the journey result.

- [ ] **Step 5: Run the final gate and commit**

```bash
npm run validate
npm run audit:all
npm run verify:journey-evidence -- tests/fixtures/p0-journey-evidence.valid.json
git status --short
git add scripts/verify-journey-evidence.mjs tests/fixtures/p0-journey-evidence.valid.json docs/verification/p0-real-registration-journey.md package.json
git commit -m "test(e2e): define real registration journey evidence"
```

Expected: all offline gates pass and only intended P0 files are committed. Live verification begins only after the required CloudBase functions/routes and Mini Program build are deployed to the test environment.

## Dependency graph and safe parallelism

```text
Task 1 contract
  ├─ Task 2 readiness domain ─ Task 3 fenced sync ─ Task 6 client DTO ─ Task 7 polling ─ Task 8 registration UI
  ├─ Task 4 OAuth HTTP ───────────────────────────┘
  └─ Task 5 canonical registration ───────────────────────────────────────────────┐
                                                                                   ├─ Task 9 integration gates ─ Task 10 evidence
Task 3 + Task 4 + Task 5 may run in separate worktrees after Task 2 lands ─────────┘
```

Safe ownership after Task 2:

- OAuth HTTP worker: Task 4 files only.
- Registration worker: Task 5 files only.
- Main Strava worker: Task 3 files only.
- Client worker starts Task 6 after the Task 2 DTO is frozen and waits for Task 3 action semantics before Task 7.
- The integration owner alone runs Task 9 and resolves generated-copy changes.

Every worker hands back branch, commits, changed files, tests run, and remaining risks. No worker stashes, resets, cleans, or changes another worktree.
