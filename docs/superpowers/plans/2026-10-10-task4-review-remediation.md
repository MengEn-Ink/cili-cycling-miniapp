# Task 4 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two P1 and two P2 findings from the independent review of Task 4 without changing the public `listPage` protocol, the legacy `listActivities(filter?)` contract, or any B/HP-13 files.

**Architecture:** Keep the three remediation areas independent. The page controller gets method-level mutual exclusion and request-owner fencing; CloudBase bootstrap becomes the single source of truth for the two planner-proven index shapes; MockRepository implements the new public timeline contract independently from the legacy list path and derives DTO state from the cursor-frozen `asOf`. Each area follows a tests-only RED commit, then a minimal GREEN commit.

**Tech Stack:** TypeScript, WeChat Mini Program page modules, Vitest, Node.js `node:test`, CloudBase bootstrap CLI, Conventional Commits.

---

## File responsibility map

- `tests/activity-home-timeline.test.ts`: real page-module race reproductions; no production helpers are mocked beyond the repository boundary.
- `miniprogram/pages/activities/index.ts`: per-view load/loadMore ownership, revision fencing, method-level mutual exclusion, and volatile UI state.
- `scripts/bootstrap-cloudbase.node-test.mjs`: exact index shapes, missing/create, conflict, zero-action verify, and documentation count contracts.
- `scripts/bootstrap-cloudbase.mjs`: the authoritative managed collection/index declarations and plan/verify behavior.
- `README.md`, `docs/cloudbase-schema.md`, `scripts/seed-cloudbase/README.md`: user/operator-visible managed index count and exact activity index facts.
- `tests/cloud-repository.test.ts`: Cloud/Mock repository protocol and parity tests, including future/history pagination and derived DTO state.
- `miniprogram/repositories/mock.ts`: mock-only timeline candidate selection, frozen-time DTO derivation, UTF-8 binary ordering, and keyset pagination. The legacy `listActivities(filter?)` implementation remains byte-for-byte unchanged.
- `docs/high-priority-issues.md`: evidence-layer status only; it must not claim target-environment index presence before read-only verification.

## Task 1: Page race tests-only RED

**Files:**

- Modify: `tests/activity-home-timeline.test.ts`

- [ ] **Step 1: Add the loadMore → refresh interleaving test**

Add a real page-controller test that begins with a cached page and cursor, starts pagination, then starts a same-view refresh before pagination resolves:

```ts
it('同视图 loadMore 后 refresh 会立即失效旧分页且迟到完成零写入', async () => {
  const page = await loadPage();
  rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
  await page.load();

  const oldMore = deferred<ReturnType<typeof pageResult>>();
  const refresh = deferred<ReturnType<typeof pageResult>>();
  rideService.listActivityPage
    .mockReturnValueOnce(oldMore.promise)
    .mockReturnValueOnce(refresh.promise);

  const oldRequest = page.loadMore();
  const refreshRequest = page.load();
  expect(page.data.loadingMore).toBe(false);

  oldMore.resolve(pageResult(['stale-more'], 'cursor-stale'));
  await oldRequest;
  expect(page.data.items.map((item: Activity) => item.id)).toEqual(['cached']);
  expect(page.data.nextCursor).toBe('cursor-old');

  refresh.resolve(pageResult(['fresh'], 'cursor-new'));
  await refreshRequest;
  expect(page.data.items.map((item: Activity) => item.id)).toEqual(['fresh']);
  expect(page.data).toMatchObject({ nextCursor: 'cursor-new', loadingMore: false });
});
```

- [ ] **Step 2: Add the refresh → loadMore method-gate test**

The method must refuse pagination while the current same-view first-page request is in flight, even if WXML is bypassed:

```ts
it('同视图 refresh 在途时 loadMore 在方法内零调用，完成后才允许新 cursor 分页', async () => {
  const page = await loadPage();
  rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
  await page.load();

  const refresh = deferred<ReturnType<typeof pageResult>>();
  rideService.listActivityPage.mockReturnValueOnce(refresh.promise);
  const refreshRequest = page.load();
  await page.loadMore();
  expect(rideService.listActivityPage).toHaveBeenCalledTimes(2);

  refresh.resolve(pageResult(['fresh'], 'cursor-new'));
  await refreshRequest;
  rideService.listActivityPage.mockResolvedValueOnce(pageResult(['next']));
  await page.loadMore();
  expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-new');
});
```

- [ ] **Step 3: Add refresh failure / old cursor retry test**

```ts
it('同视图 refresh 失败保留旧 cursor 并释放互斥以便再次分页', async () => {
  const page = await loadPage();
  rideService.listActivityPage.mockResolvedValueOnce(pageResult(['cached'], 'cursor-old'));
  await page.load();
  rideService.listActivityPage.mockRejectedValueOnce(new Error('刷新失败'));

  await page.load();
  expect(page.data).toMatchObject({
    nextCursor: 'cursor-old',
    loading: false,
    refreshing: false,
    loadingMore: false,
    refreshError: '刷新失败',
  });

  rideService.listActivityPage.mockResolvedValueOnce(pageResult(['next']));
  await page.loadMore();
  expect(rideService.listActivityPage).toHaveBeenLastCalledWith('future', 'cursor-old');
});
```

- [ ] **Step 4: Run the focused test and verify deterministic RED**

Run:

```bash
npx vitest run tests/activity-home-timeline.test.ts
```

Expected: the three new tests fail only because old pagination ownership/flags survive refresh and `loadMore()` calls the repository during refresh. Existing tests remain green.

- [ ] **Step 5: Commit the tests-only RED**

```bash
git add tests/activity-home-timeline.test.ts
git commit -m "test(activity): reproduce timeline refresh races"
```

Record the parent SHA, RED SHA, test count, exact failing test names, and confirm `miniprogram/pages/activities/index.ts` is byte-identical to the parent.

## Task 2: Page race minimal GREEN

**Files:**

- Modify: `miniprogram/pages/activities/index.ts`
- Test: `tests/activity-home-timeline.test.ts`

- [ ] **Step 1: Add per-request owner identity**

Add an owner map next to the existing handles:

```ts
loadMoreOwners: {} as Partial<Record<PublicActivityView, symbol>>,
```

When `load()` invalidates the current view, clear the old pagination owner and handle before rendering:

```ts
const previous = invalidateTimelineView(this.viewStates[view]);
delete this.loadMoreOwners[view];
delete this.loadMoreHandles[view];
```

Also clear `loadMoreOwners[view]` in `invalidateAllViews()` and `switchView()` wherever the corresponding handle is cleared.

- [ ] **Step 2: Add the reverse method-level gate**

At the start of `loadMore()`, inspect the view state before repository access:

```ts
const view = this.data.activeView as PublicActivityView;
const state = this.viewStates[view];
if (this.loadHandles[view] || state.loading || state.refreshing) return;
const existing = this.loadMoreHandles[view];
if (existing) return existing;
```

- [ ] **Step 3: Fence pagination cleanup by revision and owner**

Replace `loadMore()` with the same request/state transitions plus a unique owner and the method-level gate:

```ts
async loadMore() {
  const view = this.data.activeView as PublicActivityView;
  const state = this.viewStates[view];
  if (this.loadHandles[view] || state.loading || state.refreshing) return;
  const existing = this.loadMoreHandles[view];
  if (existing) return existing;
  const cursor = state.nextCursor;
  if (!cursor) return;
  const revision = state.revision;
  this.viewStates[view] = { ...state, loadingMore: true, refreshError: '' };
  this.renderActiveView();
  const owner = Symbol(`loadMore:${view}:${revision}`);
  this.loadMoreOwners[view] = owner;
  const request = (async () => {
    try {
      const result = await rideService.listActivityPage(view, cursor);
      if (!this.isCurrent(view, revision, cursor)) return;
      this.viewStates[view] = {
        ...this.viewStates[view],
        items: appendUniqueActivities(this.viewStates[view].items, result.items),
        nextCursor: result.nextCursor,
        loadingMore: false,
        refreshError: '',
      };
      this.renderActiveView();
    } catch (error) {
      if (!this.isCurrent(view, revision, cursor)) return;
      this.viewStates[view] = {
        ...this.viewStates[view],
        loadingMore: false,
        refreshError: error instanceof Error ? error.message : '更多活动加载失败，请稍后重试',
      };
      this.renderActiveView();
    } finally {
      if (this.viewStates[view].revision === revision && this.loadMoreOwners[view] === owner) {
        delete this.loadMoreOwners[view];
        delete this.loadMoreHandles[view];
      }
    }
  })();
  this.loadMoreHandles[view] = request;
  await request;
},
```

Do not weaken `isCurrent`; old resolve/reject/finally must remain zero-write after revision invalidation.

- [ ] **Step 4: Run focused page tests**

Run:

```bash
npx vitest run tests/activity-home-timeline.test.ts tests/tab-page-refresh.test.ts tests/theme-accessibility-regressions.test.ts
```

Expected: all tests pass, including all three new interleavings.

- [ ] **Step 5: Run typecheck and commit GREEN**

```bash
npm run typecheck
git add miniprogram/pages/activities/index.ts
git commit -m "fix(activity): fence timeline refresh races"
```

## Task 3: Bootstrap exact-index tests-only RED

**Files:**

- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`

- [ ] **Step 1: Replace the obsolete homepage-index assertion with exact shapes**

Add named expected constants in the test file and assert key order/direction exactly:

```js
const PUBLIC_EVENT_START = {
  collection: 'activities',
  name: 'activities_public_event_start',
  keys: [
    ['status', 1],
    ['event_start', 1],
    ['_id', 1],
    ['event_end', 1],
  ],
  unique: false,
};
const PUBLIC_EVENT_END = {
  collection: 'activities',
  name: 'activities_public_event_end',
  keys: [
    ['status', 1],
    ['event_end', -1],
    ['_id', -1],
    ['event_start', -1],
  ],
  unique: false,
};
```

- [ ] **Step 2: Lock missing/create, conflict, complete/verify, and count contracts**

```js
test('活动首页 planner 索引纳入 bootstrap exact plan 与 verify', () => {
  assert.deepEqual(
    INDEXES.filter((index) => index.name.startsWith('activities_public_event_')),
    [PUBLIC_EVENT_START, PUBLIC_EVENT_END],
  );
  assert.equal(INDEXES.length, 28);

  const missing = completeState();
  missing.indexes.set(
    'activities',
    missing.indexes
      .get('activities')
      .filter((index) => !index.name.startsWith('activities_public_event_')),
  );
  assert.deepEqual(
    buildPlan(missing).actions.filter((action) => action.type === 'create_index'),
    [
      { type: 'create_index', collection: 'activities', index: PUBLIC_EVENT_START },
      { type: 'create_index', collection: 'activities', index: PUBLIC_EVENT_END },
    ],
  );
  assert.deepEqual(verifyState(missing), [
    'activities.activities_public_event_start: 索引缺失',
    'activities.activities_public_event_end: 索引缺失',
  ]);

  const conflict = completeState();
  conflict.indexes
    .get('activities')
    .find((index) => index.name === 'activities_public_event_start').keys = [['status', -1]];
  assert.deepEqual(buildPlan(conflict).conflicts, [
    {
      collection: 'activities',
      index: 'activities_public_event_start',
      reason: '同名索引定义不一致',
    },
  ]);

  assert.deepEqual(buildPlan(completeState()), { actions: [], conflicts: [] });
  assert.deepEqual(verifyState(completeState()), []);
});
```

- [ ] **Step 3: Lock documentation against the same exported counts**

Update existing assertions to require 28, and add exact schema rows for both index shapes:

```js
assert.match(readme, /12 个集合、28 个业务索引/);
assert.match(schema, /activities \| status ASC, event_start ASC, _id ASC, event_end ASC/);
assert.match(schema, /activities \| status ASC, event_end DESC, _id DESC, event_start DESC/);
assert.match(schema, /全拒绝规则与 28 索引/);
```

- [ ] **Step 4: Run bootstrap tests and verify RED**

Run:

```bash
node --test scripts/bootstrap-cloudbase.node-test.mjs
```

Expected: failures show both missing exported index definitions, the old 26 count, and missing exact documentation rows. No production/bootstrap file is modified.

- [ ] **Step 5: Commit the tests-only RED**

```bash
git add scripts/bootstrap-cloudbase.node-test.mjs
git commit -m "test(cloudbase): require timeline planner indexes"
```

## Task 4: Bootstrap exact-index minimal GREEN and read-only verify

**Files:**

- Modify: `scripts/bootstrap-cloudbase.mjs`
- Modify: `README.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `scripts/seed-cloudbase/README.md`
- Modify: `docs/high-priority-issues.md`
- Test: `scripts/bootstrap-cloudbase.node-test.mjs`

- [ ] **Step 1: Add exactly two managed index declarations**

Insert these objects into `INDEXES` without deleting or renaming existing indexes:

```js
{
  collection: 'activities',
  name: 'activities_public_event_start',
  keys: [
    ['status', 1],
    ['event_start', 1],
    ['_id', 1],
    ['event_end', 1],
  ],
  unique: false,
},
{
  collection: 'activities',
  name: 'activities_public_event_end',
  keys: [
    ['status', 1],
    ['event_end', -1],
    ['_id', -1],
    ['event_start', -1],
  ],
  unique: false,
},
```

The existing generic activity indexes remain managed; removal is outside this task.

- [ ] **Step 2: Update operator documentation from 26 to 28**

- README must say bootstrap manages 12 collections and 28 business indexes, including the two exact timeline indexes.
- `docs/cloudbase-schema.md` must list both exact rows and say verify checks 28 indexes.
- `scripts/seed-cloudbase/README.md` must derive/display 28 from the current exported configuration.
- `docs/high-priority-issues.md` must say the branch now manages 28, but target-environment presence remains `PENDING_EVIDENCE` until read-only verify.

- [ ] **Step 3: Run bootstrap and documentation tests**

```bash
node --test scripts/bootstrap-cloudbase.node-test.mjs
npm run test:bootstrap
```

Expected: all pass; complete state has zero plan actions and zero verify failures.

- [ ] **Step 4: Run only read-only target checks**

Run the configured default plan and verify commands without `--apply`:

```bash
npm run cloudbase:plan
npm run cloudbase:verify
```

Expected: no CloudBase write action is executed. If either exact index is absent, capture the read request IDs and retain `PENDING_EVIDENCE`; do not run `cloudbase:apply` and do not edit the environment.

- [ ] **Step 5: Commit GREEN**

```bash
git add scripts/bootstrap-cloudbase.mjs README.md docs/cloudbase-schema.md scripts/seed-cloudbase/README.md docs/high-priority-issues.md
git commit -m "fix(cloudbase): manage timeline planner indexes"
```

## Task 5: Mock public-timeline tests-only RED

**Files:**

- Modify: `tests/cloud-repository.test.ts`

- [ ] **Step 1: Add a test-state helper without modifying production code**

Reuse `installStorage()` and clone `repository.read()`. Build activities from an existing fixture so all required public fields remain realistic. The helper must set `stored` directly and must not call production-only mutation APIs.

- [ ] **Step 2: Lock public visibility, valid time, and frozen-time DTO derivation**

Create a mixed state containing:

- a published future activity with `capacity: 0` that remains visible and returns `registrationState: 'closed'`, `closedReason: 'unavailable'`, `registrationSetupPending: true`, and `serverNow === page.asOf`;
- a published activity whose deadline is before `asOf`, returning `closed/deadline`;
- a published full activity returning `open/null` and `waitlistOnly: true`;
- finished and naturally ended history activities returning `closed/finished`;
- draft, unknown-status, soft-deleted, invalid-date, missing-time, and reversed-time records that never appear.

Use fake time `2026-10-10T00:00:00.000Z`, and assert that a second page preserves the first page `asOf` even after advancing the fake system clock.

- [ ] **Step 3: Lock UTF-8 binary ordering in both directions and across pages**

Create 21 future records sharing one `startAt` and 21 history records sharing one `endAt`; include IDs around the ASCII discriminator bytes:

```ts
const binaryIds = ['activity-aa-bb', 'activity-aaAb', 'activity-aa_bb', 'activity-aaab'];
```

Assert future order is ascending UTF-8 binary, history order is its exact reverse, and concatenating page 1 + page 2 yields every ID exactly once.

- [ ] **Step 4: Prove legacy list behavior remains unchanged**

Take a mixed state snapshot, call `listActivities('upcoming')` and `listActivities('history')`, and assert the outputs match the pre-remediation legacy filter expectations. This is a characterization test; do not rewrite it to match the new page path.

- [ ] **Step 5: Run repository tests and verify RED**

```bash
npx vitest run tests/cloud-repository.test.ts
```

Expected: new tests fail because `listActivityPage()` calls legacy `listActivities()`, retains stale DTO decisions, and does not enforce the full new-page candidate contract. Existing CloudRepository and legacy MockRepository tests remain green.

- [ ] **Step 6: Commit tests-only RED**

```bash
git add tests/cloud-repository.test.ts
git commit -m "test(activity): reproduce mock timeline drift"
```

## Task 6: Mock public-timeline minimal GREEN

**Files:**

- Modify: `miniprogram/repositories/mock.ts`
- Test: `tests/cloud-repository.test.ts`

- [ ] **Step 1: Use UTF-8 bytes for ID comparison**

Replace code-point comparison with the existing `utf8Bytes()` result:

```ts
function compareText(left: string, right: string): number {
  const a = utf8Bytes(left);
  const b = utf8Bytes(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    if (a[index] !== b[index]) return a[index] < b[index] ? -1 : 1;
  }
  return Math.sign(a.length - b.length);
}
```

- [ ] **Step 2: Add mock-only candidate and decision helpers**

Use camelCase `Activity` fields and do not import cloudfunction code into the miniprogram bundle:

```ts
type MockStoredActivity = (Activity | EditableActivity) & { isDeleted?: boolean };

function finiteTime(value: unknown): number | null {
  if (typeof value !== 'string' || !value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isPublicTimelineCandidate(item: MockStoredActivity): item is Activity {
  const start = finiteTime(item.startAt);
  const end = finiteTime(item.endAt);
  return (
    (item.status === 'published' || item.status === 'finished') &&
    item.isDeleted !== true &&
    start !== null &&
    end !== null &&
    start < end
  );
}
```

Add `deriveMockPublicActivity(item, asOf)` so stale decision fields are stripped before the frozen-time decision is rebuilt:

```ts
function deriveMockPublicActivity(item: Activity, asOf: string): Activity {
  const snapshot = new Date(asOf).getTime();
  const start = new Date(item.startAt).getTime();
  const end = new Date(item.endAt).getTime();
  const deadline = finiteTime(item.deadline);
  const output: Activity = { ...item, serverNow: asOf };
  delete output.registrationState;
  delete output.closedReason;
  delete output.registrationSetupPending;
  delete output.waitlistOnly;
  if (item.status === 'finished' || end <= snapshot)
    return { ...output, registrationState: 'closed', closedReason: 'finished' };
  if (deadline !== null && deadline <= snapshot)
    return { ...output, registrationState: 'closed', closedReason: 'deadline' };
  const setupReady =
    Number.isInteger(item.capacity) &&
    item.capacity > 0 &&
    deadline !== null &&
    deadline < start &&
    typeof item.fee === 'string' &&
    item.fee.trim().length > 0;
  if (!setupReady)
    return {
      ...output,
      registrationState: 'closed',
      closedReason: 'unavailable',
      registrationSetupPending: true,
    };
  const waitlistOnly =
    Number.isInteger(item.occupiedCount) && Number(item.occupiedCount) >= item.capacity;
  return {
    ...output,
    registrationState: 'open',
    closedReason: null,
    ...(waitlistOnly ? { waitlistOnly: true } : {}),
  };
}
```

- [ ] **Step 3: Make `listActivityPage()` independent from legacy list**

Replace:

```ts
const visible = await this.listActivities();
```

with direct read/candidate selection and derived DTOs:

```ts
const visible = this.read().activities
  .filter(isPublicTimelineCandidate)
  .map((item) => deriveMockPublicActivity(item, asOf));
```

Keep the existing cursor validation, frozen `asOf`, view classification, keyset boundary, 20-item page size, and opaque cursor shape. Do not edit `listActivities(filter?)`.

- [ ] **Step 4: Run focused repository tests and typecheck**

```bash
npx vitest run tests/cloud-repository.test.ts
npm run typecheck
```

Expected: all tests pass, both directions use exact binary order, and legacy characterization stays unchanged.

- [ ] **Step 5: Commit GREEN**

```bash
git add miniprogram/repositories/mock.ts
git commit -m "fix(activity): align mock timeline contract"
```

## Task 7: Integrated regression, evidence update, and freeze

**Files:**

- Modify: `docs/high-priority-issues.md` only if test/read-only verify evidence changed after Tasks 4 and 6.
- No B/HP-13 files.

- [ ] **Step 1: Run focused suites in dependency order**

```bash
npx vitest run tests/activity-home-timeline.test.ts tests/tab-page-refresh.test.ts tests/theme-accessibility-regressions.test.ts
node --test scripts/bootstrap-cloudbase.node-test.mjs
npm run test:bootstrap
npx vitest run tests/cloud-repository.test.ts
npm --prefix cloudfunctions/activity-read test
npm run verify:cloud-packages
```

Expected: every command exits 0 with no warnings or unexpected skips.

- [ ] **Step 2: Run the original full gate from a non-hidden detached worktree**

Create a detached worktree under `/private/tmp` at the exact candidate SHA, reuse dependency symlinks without committing them, and run:

```bash
npm run validate
```

Expected: format, lint, typecheck, Vitest, journey, bootstrap, deploy, release notes, every cloudfunction suite, cloud package verifier, and build all exit 0.

- [ ] **Step 3: Synchronize truthful evidence and commit only if needed**

The high-priority item must distinguish:

- code/focused/full-validate evidence;
- read-only target index verification and request IDs;
- absence of PR/CI/merge/deployment/real-page smoke.

If the file changes, commit it separately:

```bash
git add docs/high-priority-issues.md
git commit -m "docs(activity): record task4 remediation evidence"
```

- [ ] **Step 4: Freeze immutable evidence**

```bash
git diff --check origin/main...HEAD
git status --short --branch
git diff --name-status origin/main...HEAD
git diff --stat origin/main...HEAD
git log --oneline --no-merges origin/main..HEAD
shasum -a 256 miniprogram/pages/activities/index.ts scripts/bootstrap-cloudbase.mjs miniprogram/repositories/mock.ts tests/activity-home-timeline.test.ts scripts/bootstrap-cloudbase.node-test.mjs tests/cloud-repository.test.ts docs/high-priority-issues.md
```

Expected: diff-check passes, worktree is clean, and every reported SHA/hash is stable.

- [ ] **Step 5: Independent-review handoff**

Send the exact base/head interval, test-only RED and GREEN SHAs for all three areas, focused/full-gate results, read-only index verification result, exact file list, hashes, and clean status to TraeX 审判者. Keep the candidate frozen. Do not create a PR or deploy until the independent verdict passes.

## Execution choice

Execute inline in this existing isolated worktree. The user delegated implementation and asked to receive final results rather than intermediate choices; current coordination rules also prohibit spawning additional agents for this phase. Use the TDD checkpoints above as the review boundaries.
