# UI Showcase Sync Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize the GitHub Pages prototype with `origin/main@7038e5c` and enforce a five-UI-commit/seven-day visual evidence budget in CI.

**Architecture:** A pure Node policy module classifies changed files, computes deterministic content digests, validates route and PNG evidence, and evaluates normal versus release-strict drift rules. A thin CLI obtains Git history and repository state, while a JSON manifest records the last synchronized UI baseline and route evidence. GitHub Pages remains dependency-free HTML/CSS/JavaScript and is updated from the current mini program layouts.

**Tech Stack:** Node.js 24 ESM, `node:test`, Vitest, static HTML/CSS/JavaScript, GitHub Actions, WeChat DevTools Automator.

---

### Task 1: Implement the drift policy with TDD

**Files:**
- Create: `scripts/ui-sync-policy.mjs`
- Create: `scripts/ui-sync-policy.node-test.mjs`

- [ ] **Step 1: Write failing classification and drift-budget tests**

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyUiPath,
  evaluateUiSyncPolicy,
} from './ui-sync-policy.mjs';

test('classifies page, component and asset files as UI', () => {
  assert.equal(classifyUiPath('miniprogram/pages/profile/index.ts').ui, true);
  assert.equal(classifyUiPath('miniprogram/components/brand-logo/index.wxss').immediate, true);
  assert.equal(classifyUiPath('cloudfunctions/profile/index.js').ui, false);
});

test('allows four pending UI commits and blocks the fifth', () => {
  assert.equal(evaluateUiSyncPolicy({ uiCommits: 4, ageDays: 3 }).ok, true);
  assert.match(evaluateUiSyncPolicy({ uiCommits: 5, ageDays: 3 }).reason, /5 个/);
});

test('blocks stale, immediate and release-strict drift', () => {
  assert.equal(evaluateUiSyncPolicy({ uiCommits: 1, ageDays: 8 }).ok, false);
  assert.equal(
    evaluateUiSyncPolicy({ uiCommits: 1, ageDays: 1, immediateFiles: ['miniprogram/app.wxss'] }).ok,
    false,
  );
  assert.equal(evaluateUiSyncPolicy({ uiCommits: 1, ageDays: 1, strict: true }).ok, false);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node --test scripts/ui-sync-policy.node-test.mjs`

Expected: FAIL because `scripts/ui-sync-policy.mjs` does not exist.

- [ ] **Step 3: Implement path classification and policy evaluation**

```js
const UI_PATH =
  /^miniprogram\/(?:app\.(?:json|wxss)|(?:pages|components|assets)\/)/;
const IMMEDIATE_PATH =
  /^miniprogram\/(?:app\.(?:json|wxss)|assets\/brand\/|components\/brand-logo\/)/;

export function classifyUiPath(file) {
  return { ui: UI_PATH.test(file), immediate: IMMEDIATE_PATH.test(file) };
}

export function evaluateUiSyncPolicy({
  uiCommits,
  ageDays,
  immediateFiles = [],
  strict = false,
  maxUiCommits = 4,
  maxAgeDays = 7,
}) {
  if (uiCommits === 0) return { ok: true, remaining: maxUiCommits };
  if (strict) return { ok: false, reason: '发布严格模式要求 UI 零漂移' };
  if (immediateFiles.length) {
    return { ok: false, reason: `即时同步文件存在：${immediateFiles.join(', ')}` };
  }
  if (uiCommits > maxUiCommits) {
    return { ok: false, reason: `已有 ${uiCommits} 个未同步 UI 提交` };
  }
  if (ageDays > maxAgeDays) {
    return { ok: false, reason: `距离上次同步已 ${ageDays} 天` };
  }
  return { ok: true, remaining: maxUiCommits - uiCommits };
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run: `node --test scripts/ui-sync-policy.node-test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit the policy**

```bash
git add scripts/ui-sync-policy.mjs scripts/ui-sync-policy.node-test.mjs
git commit -m "feat(ci): define UI synchronization drift policy"
```

### Task 2: Validate manifest digests, route coverage and PNG evidence

**Files:**
- Modify: `scripts/ui-sync-policy.mjs`
- Modify: `scripts/ui-sync-policy.node-test.mjs`
- Create: `scripts/check-ui-sync.mjs`
- Create: `scripts/check-ui-sync.node-test.mjs`
- Create: `docs/ui-sync-manifest.json`

- [ ] **Step 1: Add failing tests for deterministic digests and evidence**

```js
test('digestFiles is independent of caller path order', () => {
  const files = new Map([
    ['b.txt', 'B'],
    ['a.txt', 'A'],
  ]);
  assert.equal(digestFiles(files), digestFiles(new Map([...files].reverse())));
});

test('validateManifest rejects missing route and invalid PNG', () => {
  assert.throws(
    () => validateManifest({ routes: [] }, { appPages: ['pages/activities/index'] }),
    /路由映射不完整/,
  );
  assert.throws(
    () => validatePng(Buffer.from('not png'), 'activities-pages.png'),
    /无效 PNG/,
  );
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test scripts/ui-sync-policy.node-test.mjs scripts/check-ui-sync.node-test.mjs`

Expected: FAIL because digest and manifest APIs are not implemented.

- [ ] **Step 3: Implement deterministic SHA-256 and PNG IHDR validation**

```js
import { createHash } from 'node:crypto';

export function digestFiles(files) {
  const hash = createHash('sha256');
  for (const [file, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    hash.update(`${file}\0`);
    hash.update(content);
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

export function validatePng(buffer, file) {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) {
    throw new Error(`无效 PNG：${file}`);
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  if (!width || !height) throw new Error(`PNG 尺寸无效：${file}`);
  return { width, height };
}
```

- [ ] **Step 4: Implement CLI repository inspection**

`scripts/check-ui-sync.mjs` must:

1. Read `docs/ui-sync-manifest.json`.
2. Validate all `miniprogram/app.json` pages map to one manifest route.
3. Recompute UI and prototype digests.
4. List commits and changed UI files after `syncedThrough`.
5. Validate every evidence pair referenced by the manifest.
6. Evaluate normal mode or `--strict`.
7. Print the drift count, age, immediate files and remaining budget.

- [ ] **Step 5: Run tests and verify GREEN**

Run: `node --test scripts/ui-sync-policy.node-test.mjs scripts/check-ui-sync.node-test.mjs`

Expected: all tests pass, including temporary-repository CLI cases.

- [ ] **Step 6: Commit manifest validation**

```bash
git add scripts/ui-sync-policy.mjs scripts/ui-sync-policy.node-test.mjs \
  scripts/check-ui-sync.mjs scripts/check-ui-sync.node-test.mjs docs/ui-sync-manifest.json
git commit -m "feat(ci): validate UI prototype synchronization evidence"
```

### Task 3: Wire normal and release-strict CI gates

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/promote-miniprogram-experience.yml`
- Modify: `scripts/miniprogram-experience-release.node-test.mjs`

- [ ] **Step 1: Add failing workflow contract assertions**

```js
test('experience promotion requires zero UI drift', async () => {
  const workflow = await readFile('.github/workflows/promote-miniprogram-experience.yml', 'utf8');
  assert.match(workflow, /npm run check:ui-sync -- --strict/);
});
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test scripts/miniprogram-experience-release.node-test.mjs`

Expected: FAIL because the strict command is absent.

- [ ] **Step 3: Add package scripts and workflow steps**

Add:

```json
"test:ui-sync": "node --test scripts/ui-sync-policy.node-test.mjs scripts/check-ui-sync.node-test.mjs",
"check:ui-sync": "node scripts/check-ui-sync.mjs"
```

Run `npm run test:ui-sync` from `validate`, run `npm run check:ui-sync` in normal CI, and run `npm run check:ui-sync -- --strict` before experience evidence validation.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm run test:ui-sync && npm run test:deploy`

Expected: all UI sync and release workflow tests pass.

- [ ] **Step 5: Commit CI integration**

```bash
git add package.json .github/workflows/ci.yml \
  .github/workflows/promote-miniprogram-experience.yml \
  scripts/miniprogram-experience-release.node-test.mjs
git commit -m "ci: enforce periodic UI showcase synchronization"
```

### Task 4: Synchronize the 13-route Pages prototype

**Files:**
- Modify: `docs/index.html`
- Modify: `docs/styles.css`
- Modify: `docs/schema.js`
- Modify: `docs/templates.js`
- Modify: `docs/app.js`
- Modify: `tests/showcase-pages-contract.test.ts`

- [ ] **Step 1: Add failing prototype contracts**

Add assertions that require:

- current baseline label `7038e5c`;
- shared image Logo asset;
- four detail metrics and registration decision block;
- Strava preview, copy and GPX controls;
- four activity-management filters;
- latest runtime fixture titles and times.

```ts
expect(html).toContain('main@7038e5c');
expect(templates).toContain('预计骑行');
expect(templates).toContain('报名状态');
expect(templates).toContain('下载 GPX');
expect(templates).toContain('已下架');
expect(templates).toContain('已上线');
expect(templates).toContain('已结束');
```

- [ ] **Step 2: Run test and verify RED**

Run: `npx vitest run tests/showcase-pages-contract.test.ts`

Expected: FAIL on the new baseline and UI assertions.

- [ ] **Step 3: Update schema and templates from current mini program**

Use the current runtime fixtures:

- activity: `云蒙山&喇叭沟 RIDE`, `10月18日 周日`, `早上 6 点 20 分`;
- trip: `黑分解 RIDE`, `10月17日 周六`, `早上 8 点整`;
- activity detail: four metrics, organizer state, combined meeting block, attendee and QR sections;
- route controls: preview image, selectable link, copy and GPX buttons;
- management: `全部 / 已下架 / 已上线 / 已结束`.

- [ ] **Step 4: Update styles and interaction**

Match the 375×812 DevTools screenshots:

- use the generated Logo asset rather than a CSS-drawn mark;
- preserve black, warm white and orange only;
- keep 24 px page gutters and 44 px controls;
- use four-column detail metrics and black meeting ticket;
- make management filters four columns and cards use the shared border/shadow tokens;
- retain responsive desktop/mobile showcase framing.

- [ ] **Step 5: Run prototype contracts and browser smoke**

Run: `npx vitest run tests/showcase-pages-contract.test.ts`

Expected: PASS.

Serve `docs/` locally and verify all 13 hashes render without console errors.

- [ ] **Step 6: Commit the synchronized prototype**

```bash
git add docs/index.html docs/styles.css docs/schema.js docs/templates.js docs/app.js \
  tests/showcase-pages-contract.test.ts
git commit -m "feat(prototype): sync showcase with current mini program UI"
```

### Task 5: Capture and register dual visual evidence

**Files:**
- Create: `docs/evidence/ui-sync/2026-10-13-main-7038e5c/README.md`
- Create: `docs/evidence/ui-sync/2026-10-13-main-7038e5c/manifest.json`
- Create: `docs/evidence/ui-sync/2026-10-13-main-7038e5c/*-devtools.png`
- Create: `docs/evidence/ui-sync/2026-10-13-main-7038e5c/*-pages.png`
- Modify: `docs/ui-sync-manifest.json`

- [ ] **Step 1: Capture WeChat DevTools screenshots**

Run the read-only Automator flow against the task worktree. Capture at least:

- activities;
- registrations;
- activity-detail;
- credential;
- admin-activity-list.

Expected: seven existing E2E assertions pass, no runtime exceptions, screenshots are 726×1570 or another recorded device viewport.

- [ ] **Step 2: Capture matching Pages screenshots**

Serve `docs/`, open the corresponding hash route, and capture the phone frame at the same logical route and viewport.

Expected: every affected route has both `-devtools.png` and `-pages.png`.

- [ ] **Step 3: Generate evidence manifest and digests**

Record:

```json
{
  "schemaVersion": 1,
  "sourceBaseline": "7038e5c",
  "routes": [
    {
      "id": "activities",
      "devtools": "activities-devtools.png",
      "pages": "activities-pages.png"
    }
  ]
}
```

Update `docs/ui-sync-manifest.json` with the final UI and prototype digests.

- [ ] **Step 4: Run gate in normal and strict modes**

Run:

```bash
npm run check:ui-sync
npm run check:ui-sync -- --strict
```

Expected: both commands pass with zero UI drift.

- [ ] **Step 5: Commit visual evidence**

```bash
git add docs/evidence/ui-sync/2026-10-13-main-7038e5c docs/ui-sync-manifest.json
git commit -m "test(ui): record current showcase visual baseline"
```

### Task 6: Governance, full validation and deployment

**Files:**
- Modify: `docs/high-priority-issues.md`
- Modify: `docs/sandbox-environment-configuration.md`

- [ ] **Step 1: Document the active gate**

Add the periodic budget, immediate triggers, local commands, evidence directory, CI behavior and experience-release strict mode. Add a P1 item until GitHub Pages deployment and online screenshot verification pass.

- [ ] **Step 2: Run focused and full validation**

Run:

```bash
npm run test:ui-sync
npx vitest run tests/showcase-pages-contract.test.ts
npm run check:ui-sync
npm run validate
git diff --check
```

Expected: all commands pass with no formatting, lint, type, unit, cloud package or build failures.

- [ ] **Step 3: Commit governance updates**

```bash
git add docs/high-priority-issues.md docs/sandbox-environment-configuration.md
git commit -m "docs(ui): document prototype synchronization governance"
```

- [ ] **Step 4: Push branch and create PR**

Push `feat/ui-showcase-sync-gate`, create a PR to `main`, and wait for CI plus the development-version upload decision.

- [ ] **Step 5: Merge and verify GitHub Pages**

After required checks pass, merge the PR, wait for GitHub Pages deployment, and verify:

- production URL loads the merged revision;
- all 13 routes render;
- mobile and desktop screenshots match the committed Pages evidence;
- normal CI reports zero UI drift.

- [ ] **Step 6: Update the high-priority list**

Remove the temporary P1 synchronization item only after the production Pages URL and screenshots are verified. Keep physical iOS/Android visual acceptance items open.
