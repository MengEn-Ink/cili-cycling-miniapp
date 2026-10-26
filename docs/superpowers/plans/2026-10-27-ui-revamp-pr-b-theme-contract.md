# UI Revamp PR B Theme Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user has already authorized inline execution; do not reopen design selection or dispatch parallel writers.

**Goal:** Deliver PR B as a zero-pixel-change governance slice that centralizes all 53 page/component color literals and the one hard-coded font stack, adds a machine-readable theme/native contract, and makes `check:design` a required part of `validate`.

**Architecture:** `miniprogram/config/theme-contract.json` is the machine-readable contract for WXSS tokens, native appearance sources, deliberate source-specific differences, contrast pairs, and literal policy. `scripts/check-design.mjs` exports pure validators for Node tests and provides the repository CLI; it scans every registered page/component WXSS, app/page native JSON, `theme.ts`, the 53-row migration ledger, and documented npm commands. PR B changes only expression ownership: every currently effective literal keeps the same value, four fallback-only literals are removed after proving their global tokens win, and all later V1 target values stay out of this slice.

**Tech Stack:** Node.js ESM and `node:test`, JSON contracts, native WeChat Mini Program WXSS/JSON/TypeScript, Prettier, Vitest, existing UI-sync/DevTools harness, GitHub Actions.

---

## Approved baseline and ownership

- Approved specification commit: `6c3c8556` on `docs/ui-revamp-v1-spec-20261027`.
- Specification: `docs/superpowers/specs/2026-10-27-ui-revamp-v1-design.md`.
- One writer owns PR B files. TraeX 审判者 remains read-only and reviews RED evidence, the 53-row ledger, token value preservation, and gates.
- PR B must branch from the latest `origin/main` after the specification/plan documentation PR merges. Record the resulting base SHA in the branch ledger; do not implement on the documentation worktree.
- Any unrelated dirty file, HEAD movement, or overlapping writer stops execution. Preserve the worktree and report instead of cleaning it.

## File map

**Create**

- `miniprogram/config/theme-contract.json` — schema v2 contract for WXSS, `theme.ts`, app/page JSON, source-specific native roles, contrast, and literal policy.
- `scripts/check-design.mjs` — pure validators plus repository CLI.
- `scripts/check-design.node-test.mjs` — Node RED/GREEN tests for contract, mapping, fallback, literals, contrast, and documented commands.
- `docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md` — exactly 53 color rows plus one font row bound to the frozen pre-migration files.
- `docs/verification/2026-10-27-ui-revamp-pr-b-theme-contract.md` — immutable implementation and evidence report.

**Modify**

- `miniprogram/app.wxss` — define value-preserving component tokens in the single allowed literal source.
- `miniprogram/components/activity-card/index.wxss` — replace the one hard-coded editorial font stack.
- `miniprogram/pages/activities/index.wxss`
- `miniprogram/pages/activity-detail/index.wxss`
- `miniprogram/pages/admin/activity-edit/index.wxss`
- `miniprogram/pages/admin/activity-list/index.wxss`
- `miniprogram/pages/admin/club-application-detail/index.wxss`
- `miniprogram/pages/admin/club-applications/index.wxss`
- `miniprogram/pages/admin/review-detail/index.wxss`
- `miniprogram/pages/club/center/index.wxss`
- `miniprogram/pages/credential/index.wxss`
- `miniprogram/pages/profile/index.wxss`
- `miniprogram/pages/registrations/index.wxss` — replace all 53 color occurrences with tokens, preserving computed values.
- `package.json` — add `test:design`, `check:design`, and wire both into `validate`.
- `README.md` and `docs/verification/wechat-devtools-e2e.md` — make documented design commands match real scripts and evidence semantics.
- `docs/superpowers/specs/2026-10-26-governance-hygiene-v2-design.md` — correct the historical 50 count to the approved current 53+1 baseline and link the migration ledger.
- `docs/high-priority-issues.md` — keep UI V1 and Governance V2 rows synchronized at every commit/review/merge/deploy transition.

**Must not change**

- WXML/TypeScript product behavior, `miniprogram/config/release.ts`, cloud functions, native color values, UI-sync digests, release notes, or V1 target `rgba(17, 15, 12, …)` values.
- `docs/ui-sync-manifest.json` and `docs/evidence/phase3-three-width/` stay byte-identical; visual validation writes to `/tmp`.

## Frozen 53-occurrence migration map

The implementation ledger expands every comma-separated line below into one Markdown row. A source line containing two literals produces two rows. The four `fallback-only` rows keep the effective global token value, not the fallback literal value.

| File | Frozen line(s) and literal | Token | Type |
| --- | --- | --- | --- |
| `pages/activities/index.wxss` | 310,311 `rgba(12,10,7,0)` | `--scrim-activity-cover-clear` | direct ×2 |
| same | 312 `rgba(12,10,7,0.68)` | `--scrim-activity-cover-strong` | direct |
| same | 334 `rgba(12,10,7,0.72)` | `--surface-media-tag` | direct |
| `pages/activity-detail/index.wxss` | 37,38 `rgba(12,10,7,0)` | `--scrim-activity-detail-cover-clear` | direct ×2 |
| same | 39 `rgba(12,10,7,0.72)` | `--scrim-activity-detail-cover-strong` | direct |
| same | 61 `rgba(12,10,7,0.72)` | `--surface-media-tag` | direct |
| same | 103 `rgba(12,10,7,0.6)` | `--surface-countdown` | direct |
| same | 714 `rgba(12,10,7,0.68)` | `--surface-dialog-backdrop` | direct |
| same | 734 `rgba(12,10,7,0.56)` | `--surface-dialog-control` | direct |
| same | 759 `rgba(12,10,7,0.76)` | `--scrim-attendee-card-strong` | direct |
| same | 759 `rgba(12,10,7,0)` | `--scrim-attendee-card-clear` | direct |
| same | 785 `rgba(255,255,255,0.18)` | `--surface-attendee-avatar-glass` | direct |
| `pages/admin/activity-edit/index.wxss` | 291 `rgba(12,10,7,0.78)` | `--surface-media-index` | direct |
| same | 319 `rgba(12,10,7,0.82)` | `--surface-media-action` | direct |
| same | 326 `rgba(165,42,28,0.92)` | `--surface-media-danger` | direct |
| `pages/admin/activity-list/index.wxss` | 180 `#fff` | `--color-on-action` | direct |
| same | 190 `rgba(0,0,0,0.08)` | `--shadow-swipe-color` | direct |
| same | 351,450 `rgba(192,50,31,0.08)` | `--color-status-warning-soft` | fallback-only ×2 |
| same | 540 `rgba(12,10,7,0.56)` | `--surface-photo-count` | direct |
| `pages/admin/club-application-detail/index.wxss` | 160 `rgba(255,255,255,0.3)` | `--surface-upload-progress-track` | direct |
| `pages/admin/club-applications/index.wxss` | 70 `#fff` | `--color-on-media` | fallback-only |
| same | 106 `rgba(12,10,7,0.1)` | `--scrim-club-admin-top` | direct |
| same | 107 `rgba(12,10,7,0.05)` | `--scrim-club-admin-mid` | direct |
| same | 108 `rgba(12,10,7,0.72)` | `--scrim-club-admin-strong` | direct |
| same | 122 `rgba(255,255,255,0.86)` | `--color-club-admin-eyebrow` | direct |
| same | 134 `#fff` | `--color-on-media` | direct |
| `pages/admin/review-detail/index.wxss` | 319 `rgba(192,50,31,0.08)` | `--color-status-warning-soft` | fallback-only |
| `pages/club/center/index.wxss` | 34 `rgba(255,255,255,0.08)` | `--surface-club-fallback-shine` | direct |
| same | 34 `rgba(255,255,255,0)` | `--surface-club-fallback-clear` | direct |
| same | 35 `rgba(255,255,255,0.12)` | `--surface-club-fallback-glow` | direct |
| same | 46 `rgba(12,10,7,0.1)` | `--scrim-club-cover-top` | direct |
| same | 47 `rgba(12,10,7,0.05)` | `--scrim-club-cover-mid` | direct |
| same | 48 `rgba(12,10,7,0.78)` | `--scrim-club-cover-strong` | direct |
| same | 56 `rgba(255,255,255,0.7)` | `--border-club-location` | direct |
| same | 63 `rgba(12,10,7,0.4)` | `--surface-club-location` | direct |
| same | 80 `rgba(12,10,7,0.42)` | `--surface-club-identity` | direct |
| same | 89 `rgba(255,255,255,0.85)` | `--border-club-avatar` | direct |
| same | 119 `rgba(255,255,255,0.84)` | `--color-club-intro` | direct |
| `pages/credential/index.wxss` | 86 `rgba(255,255,255,0.3)` | `--border-credential-divider` | direct |
| same | 107 `rgba(255,255,255,0.12)` | `--surface-credential-chip` | direct |
| same | 109 `rgba(255,255,255,0.2)` | `--border-credential-chip` | direct |
| `pages/profile/index.wxss` | 53 `rgba(12,10,7,0.08)` | `--scrim-profile-hero-top` | direct |
| same | 54 `rgba(12,10,7,0.04)` | `--scrim-profile-hero-soft` | direct |
| same | 55 `rgba(12,10,7,0.42)` | `--scrim-profile-hero-mid` | direct |
| same | 56 `rgba(12,10,7,0.94)` | `--scrim-profile-hero-strong` | direct |
| same | 111 `rgba(255,255,255,0.78)` | `--color-profile-eyebrow` | direct |
| same | 139 `rgba(255,255,255,0.86)` | `--color-profile-meta` | direct |
| `pages/registrations/index.wxss` | 214 `#fff` | `--color-on-action` | direct |
| same | 262 `rgba(0,0,0,0)` | `--scrim-registration-cover-clear` | direct |
| same | 262 `rgba(0,0,0,0.35)` | `--scrim-registration-cover-strong` | direct |

The font row is separate: `miniprogram/components/activity-card/index.wxss:58`, `'Songti SC', STSong, serif` → `--font-family-editorial`.

## Task 1: Freeze the implementation branch and RED ledger

**Files:**

- Modify: `docs/high-priority-issues.md`
- Create outside Git: `/tmp/cili-pr-b-red/`

- [ ] **Step 1: merge the approved docs PR before implementation**

  Fetch `origin/main`, prove the docs PR head contains `6c3c8556`, wait for required checks, merge with match-head protection, and record the new main SHA. Do not squash implementation into the docs PR.

- [ ] **Step 2: create the isolated PR B worktree**

  ```bash
  git fetch origin main
  git worktree add /tmp/cili-ui-pr-b -b chore/ui-theme-contract-v2-20261027 origin/main
  git -C /tmp/cili-ui-pr-b rev-parse HEAD
  git -C /tmp/cili-ui-pr-b status --porcelain
  ```

  Expected: HEAD equals the post-docs `origin/main`; porcelain is empty.

- [ ] **Step 3: capture the mechanical RED baseline**

  ```bash
  mkdir -p /tmp/cili-pr-b-red
  rg -n --glob '*.wxss' --glob '!miniprogram/app.wxss' '#[0-9a-fA-F]{3,8}|rgba?\(' miniprogram > /tmp/cili-pr-b-red/color-literals.txt
  rg -n --glob '*.wxss' --glob '!miniprogram/app.wxss' 'font-family\s*:' miniprogram > /tmp/cili-pr-b-red/font-families.txt
  ```

  A Node count over the same regex must report exactly `53` colors; manual filtering must identify exactly one non-token font declaration. Save start HEAD and porcelain beside the logs.

- [ ] **Step 4: update both linked P1 rows**

  Set UI V1 to `DESIGN_APPROVED / PR_B_TDD_RED` and Governance V2 to include `PR_B_TDD_RED`; record approved spec `6c3c8556` and implementation base SHA. Do not mark implementation complete.

- [ ] **Step 5: commit the ledger transition**

  ```bash
  git add docs/high-priority-issues.md
  git commit -m "docs(ui): 启动主题契约 PR B"
  ```

## Task 2: Add fail-closed checker policy tests

**Files:**

- Create: `scripts/check-design.node-test.mjs`
- Create: `scripts/check-design.mjs`

- [ ] **Step 1: write the policy tests first**

  The test file imports the following exact API:

  ```js
  import assert from 'node:assert/strict';
  import test from 'node:test';
  import {
    collectStyleLiteralViolations,
    contrastRatio,
    parseMigrationTable,
    parseWxssTokens,
    validateContractSnapshot,
    validateDocumentedScripts,
    validateMigrationRows,
  } from './check-design.mjs';
  ```

  Add tests with these assertions:

  ```js
  test('page colors and literal font families fail closed', () => {
    const issues = collectStyleLiteralViolations([
      ['miniprogram/app.wxss', 'page{--x:#fff;--font-family-editorial:serif;}'],
      ['miniprogram/pages/a.wxss', '.a{color:#fff;background:rgba(0,0,0,.3);font-family:serif;}'],
    ]);
    assert.deepEqual(issues.map((item) => item.kind), ['color', 'color', 'font-family']);
  });

  test('53 rows require 49 direct and four fallback-only entries', () => {
    const rows = parseMigrationTable(mappingMarkdownFixture);
    assert.equal(rows.length, 53);
    assert.equal(rows.filter((row) => row.type === 'direct').length, 49);
    assert.equal(rows.filter((row) => row.type === 'fallback-only').length, 4);
    assert.doesNotThrow(() => validateMigrationRows(rows, tokensFixture));
  });

  test('direct values cannot drift and fallback effective tokens must exist', () => {
    assert.throws(() => validateMigrationRows(directMismatchRows, tokensFixture), /保值/);
    assert.throws(() => validateMigrationRows(missingFallbackTokenRows, tokensFixture), /fallback/);
  });

  test('native source-specific values and declared equivalents are both enforced', () => {
    assert.doesNotThrow(() => validateContractSnapshot(validSnapshot));
    assert.throws(() => validateContractSnapshot({...validSnapshot, appJson: badApp}), /tabBar/);
    assert.throws(() => validateContractSnapshot({...validSnapshot, themeSource: badTheme}), /theme\.ts/);
  });

  test('documented npm commands must resolve', () => {
    assert.deepEqual(validateDocumentedScripts('npm run check:design', { 'check:design': 'node x' }), []);
    assert.match(validateDocumentedScripts('npm run missing', {})[0], /missing/);
  });

  test('contrast uses WCAG luminance', () => {
    assert.equal(contrastRatio('#ffffff', '#000000'), 21);
    assert.ok(contrastRatio('#211f1c', '#fbf5ea') >= 4.5);
  });
  ```

- [ ] **Step 2: run RED**

  ```bash
  node --test scripts/check-design.node-test.mjs | tee /tmp/cili-pr-b-red/policy-red.log
  ```

  Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-design.mjs`.

- [ ] **Step 3: implement the pure API and CLI shell**

  `scripts/check-design.mjs` must:

  - parse the first `page {}` token block with `/((--[\w-]+)\s*:\s*([^;]+);)/g`;
  - normalize only hex case and `#fff` → `#ffffff`, never round alpha values;
  - scan all `.wxss` below `miniprogram/`, allowing color/font literals only in `miniprogram/app.wxss`;
  - parse Markdown mapping rows by the fixed columns `# / file:line / literal / migration type / token / token current value`;
  - require 53 unique numbered rows, 49 `direct`, 4 `fallback-only`, and a separate font row;
  - compare direct rows to the named token value; for fallback-only rows require the effective token to exist but do not equate it with the fallback;
  - calculate WCAG contrast for six-digit hex tokens;
  - export `runRepositoryCheck(root = process.cwd())` and set a non-zero exit code with sorted path-specific issues.

  Use recursive `readdirSync(..., {recursive:true})`; do not add glob dependencies.

- [ ] **Step 4: run GREEN policy tests**

  ```bash
  node --test scripts/check-design.node-test.mjs
  ```

  Expected: all policy tests PASS. The real repository CLI is not connected yet.

- [ ] **Step 5: commit the checker policy**

  ```bash
  git add scripts/check-design.mjs scripts/check-design.node-test.mjs
  git commit -m "test(design): 锁定主题契约失败边界"
  ```

## Task 3: Add the real contract and 53-row ledger

**Files:**

- Create: `miniprogram/config/theme-contract.json`
- Create: `docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md`
- Modify: `scripts/check-design.node-test.mjs`

- [ ] **Step 1: write an integration test against the frozen repository**

  Add a test that calls `runRepositoryCheck()` and expects an error summary containing `53 color literals` and `1 font-family literal` before migration. This is the repository-level RED and must be saved verbatim.

- [ ] **Step 2: create schema v2 contract**

  The JSON uses these top-level keys and exact invariants:

  ```json
  {
    "schemaVersion": 2,
    "sources": {
      "wxss": "miniprogram/app.wxss",
      "themeTs": "miniprogram/config/theme.ts",
      "appJson": "miniprogram/app.json",
      "migrationMap": "docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md"
    },
    "literalPolicy": {
      "allowedWxssLiteralFiles": ["miniprogram/app.wxss"],
      "expectedColorRows": 53,
      "expectedDirectRows": 49,
      "expectedFallbackRows": 4,
      "forbidColorFallbacksOutsideRoot": true,
      "forbidFontLiteralsOutsideRoot": true
    },
    "native": {
      "page": {"navigationBarBackgroundColor":"#fbf5ea","navigationBarTextStyle":"black","backgroundColor":"#fbf5ea","backgroundColorTop":"#fbf5ea","backgroundColorBottom":"#fbf5ea"},
      "appWindow": {"navigationBarBackgroundColor":"#fbf5ea","navigationBarTextStyle":"black","backgroundColor":"#fbf5ea","backgroundColorTop":"#fbf5ea","backgroundColorBottom":"#fbf5ea"},
      "appTabBar": {"backgroundColor":"#ffffff","borderStyle":"white","color":"#6f675d","selectedColor":"#c0321f"},
      "runtimeTabBar": {"backgroundColor":"#ffffff","borderStyle":"white","color":"#6f675d","selectedColor":"#211f1c"}
    }
  }
  ```

  Preserve the deliberate app JSON/runtime selected-color difference as two source-specific roles with the reason `PR B preserves startup and runtime values; alignment requires a later visual slice`. Do not force them equal in `equivalentRoles`.

  `equivalentRoles` must at least bind brand (`THEME_COLORS.brand` ↔ `--color-brand`), background (`background` ↔ `--color-bg`), surface (`surface` ↔ `--color-surface`), ink (`ink` ↔ `--color-text`), and muted (`muted` ↔ `--color-muted`). Contract font values are body/editorial/mono exactly as currently defined in `app.wxss`.

- [ ] **Step 3: create the 53-row mapping ledger**

  Expand the frozen table in this plan into 53 numbered rows. Store normalized six-digit hex in `token current value`, retain the exact original literal in `current literal`, and mark the four fallback rows exactly. Add the font row below the color table. The checker must parse all rows rather than trust the prose count.

- [ ] **Step 4: run the real repository RED**

  ```bash
  node scripts/check-design.mjs | tee /tmp/cili-pr-b-red/repository-red.log
  ```

  Expected: non-zero with exactly 53 color literal locations and one font literal; native/contract/mapping checks already PASS.

- [ ] **Step 5: commit contract + truthful RED ledger**

  ```bash
  git add miniprogram/config/theme-contract.json scripts/check-design.node-test.mjs docs/designs/2026-10-27-ui-revamp-v1/pr-b-literal-token-map.md
  git commit -m "feat(design): 建立主题与原生外观契约"
  ```

## Task 4: Migrate literals without pixel changes

**Files:**

- Modify: `miniprogram/app.wxss`
- Modify: the 12 WXSS files listed in the file map

- [ ] **Step 1: add only current-value component tokens**

  Add the tokens from the frozen mapping table under the existing component-token section. Each token holds the exact current literal, including all distinct alphas. Do not add any `rgba(17, 15, 12, …)` V1 target values.

- [ ] **Step 2: replace each of the 49 direct literals**

  Replace literal occurrences one-for-one with `var(--token-name)` according to the ledger. Preserve gradient stops, `!important`, border widths, shadows, selector order, and declaration order.

- [ ] **Step 3: remove all four fallback-only literals**

  Use exactly:

  ```css
  background: var(--color-status-warning-soft);
  color: var(--color-on-media);
  ```

  `--color-status-warning-soft` remains `#fff2c7`; `--color-on-media` remains `#ffffff`. Do not replace either with the historical fallback value.

- [ ] **Step 4: migrate the font literal**

  ```css
  font-family: var(--font-family-editorial);
  ```

- [ ] **Step 5: run GREEN and regression tests**

  ```bash
  node --test scripts/check-design.node-test.mjs
  node scripts/check-design.mjs
  npx vitest run tests/cycling-image-journal-theme-token.test.ts tests/theme-runtime-integration.test.ts tests/theme-service.test.ts tests/theme-token-settings-controls.test.ts
  ```

  Expected: checker reports zero page/component color literals, zero font literals, 53 validated migration rows, 17 native page configs, and all tests PASS.

- [ ] **Step 6: prove the migration is expression-only**

  Run a script that resolves every inserted `var(--token)` against `app.wxss` and compares it to the ledger. Save the JSON output under `/tmp/cili-pr-b-red/value-preservation.json`; require 49 direct matches and four fallback effective-token matches.

- [ ] **Step 7: commit the migration**

  ```bash
  git add miniprogram/app.wxss miniprogram/components/activity-card/index.wxss miniprogram/pages
  git commit -m "refactor(ui): 收口页面主题字面量"
  ```

## Task 5: Wire scripts, documentation, and validate

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/verification/wechat-devtools-e2e.md`
- Modify: `docs/superpowers/specs/2026-10-26-governance-hygiene-v2-design.md`
- Modify: `scripts/check-design.node-test.mjs`

- [ ] **Step 1: add a failing package wiring test**

  Read `package.json` and assert:

  ```js
  assert.equal(pkg.scripts['test:design'], 'node --test scripts/check-design.node-test.mjs');
  assert.equal(pkg.scripts['check:design'], 'node scripts/check-design.mjs');
  assert.match(pkg.scripts.validate, /npm run test:design/);
  assert.match(pkg.scripts.validate, /npm run check:design/);
  ```

  Run it before editing `package.json`; expected FAIL.

- [ ] **Step 2: add scripts and validate ordering**

  Add:

  ```json
  "test:design": "node --test scripts/check-design.node-test.mjs",
  "check:design": "node scripts/check-design.mjs"
  ```

  In `validate`, place `test:design && check:design` after `test:ui-sync` and before release/UI-sync checks so contract failure stops later evidence work.

- [ ] **Step 3: verify every documented command resolves**

  The CLI scans `README.md` and `docs/verification/wechat-devtools-e2e.md` for `npm run <name>` and fails if `package.json` lacks it. Update command descriptions to say the checker covers theme tokens, native sources, 53-row migration integrity, literal bans, fonts, and contrast. Correct Governance V2 from the obsolete 50 count to 53 colors + one font.

- [ ] **Step 4: run package GREEN**

  ```bash
  npm run test:design
  npm run check:design
  npm run check:governance
  npm run test:ui-sync
  npm run check:ui-sync -- --strict
  ```

  Expected: all PASS; `docs/ui-sync-manifest.json` remains unchanged.

- [ ] **Step 5: commit wiring/docs**

  ```bash
  git add package.json README.md docs/verification/wechat-devtools-e2e.md docs/superpowers/specs/2026-10-26-governance-hygiene-v2-design.md scripts/check-design.node-test.mjs
  git commit -m "build(design): 接入主题契约门禁"
  ```

## Task 6: Produce zero-pixel evidence and full gates

**Files:**

- Create: `docs/verification/2026-10-27-ui-revamp-pr-b-theme-contract.md`
- Modify: `docs/high-priority-issues.md`
- Temporary only: `/tmp/cili-pr-b-validate/`, `/tmp/cili-pr-b-e2e-before/`, `/tmp/cili-pr-b-e2e-after/`

- [ ] **Step 1: fence before validation**

  Save `git rev-parse HEAD`, `git status --porcelain`, tool versions, and SHA-256 of `docs/ui-sync-manifest.json` plus the tracked `docs/evidence/phase3-three-width` tree.

- [ ] **Step 2: run full gates with visual output isolated**

  ```bash
  OUT_DIR=/tmp/cili-pr-b-validate npm run validate
  npm run coverage
  npm run audit:all
  git diff --check origin/main...HEAD
  ```

  Expected: all PASS; no tracked 49-file phase3 side effect.

- [ ] **Step 3: run 17-route DevTools before/after comparison**

  Use the existing real-cloud-readonly harness on the frozen pre-migration base and PR B head with the same DevTools/SDK/device/data snapshot. Both runs must have 17 routes, 30/30 checks, no product failure, and report their startup outcome honestly. Redact public copies.

  Compare PNG header dimensions and decoded pixels route by route. Expected: exact pixel equality for stable content; dynamic text/time/media differences must be isolated and explained, never used to claim equality. If any deterministic pixel differs, stop PR B and find the unintended value change.

- [ ] **Step 4: write immutable verification report**

  Record base/head SHA, mapping counts, checker output, fallback effective values, product diff, UI digest, DevTools outcomes, pixel comparison, validate/coverage/audit, and any blocked physical-device boundary. Label 390 simulator evidence as functional/no-pixel-change evidence, not Task 0 baseline or performance proof.

- [ ] **Step 5: update both P1 rows**

  Set UI V1 and Governance V2 to `PR_B_IMPLEMENTED / REVIEW_PENDING`, link the plan/report, and preserve PR C/route slices as pending. Code implemented does not mean merged, uploaded, or UAT complete.

- [ ] **Step 6: commit evidence and ledger**

  ```bash
  git add docs/verification/2026-10-27-ui-revamp-pr-b-theme-contract.md docs/high-priority-issues.md
  git commit -m "docs(ui): 记录主题契约 PR B 证据"
  ```

## Task 7: Independent review, PR, merge, and main proof

**Files:**

- Modify only if review finds a defect: files owned by the relevant earlier task.
- Modify after state transitions: `docs/high-priority-issues.md`.

- [ ] **Step 1: hand off read-only review**

  Provide TraeX 审判者 the frozen head, commit list, real RED logs, 53-row ledger, checker output, value-preservation JSON, zero-product-behavior diff, full gates, and DevTools comparison. Reviewer must independently rerun policy tests, checker, UI sync, and verify the four fallback rows.

- [ ] **Step 2: open the PR after review fixes**

  Use the repository PR template and exact diff statistics. Title uses Chinese after conventional prefix, e.g. `chore(design): 建立主题契约与字面量门禁`. Do not include PR C or route-family UI changes.

- [ ] **Step 3: require all PR checks and match-head merge**

  Confirm head SHA has not moved, base is latest main, affected/validate/CodeQL/pr-submission are green, then merge using match-head protection. Never bypass or force push.

- [ ] **Step 4: verify main and deployment semantics**

  Fetch new `origin/main`, prove its tree contains the reviewed PR head, wait for main CI, and read deployment decisions. Theme expression changes may trigger a client build/upload; report the actual decision/receipt. CloudBase should be unaffected unless the cumulative diff says otherwise.

- [ ] **Step 5: synchronize ledger without declaring UI V1 complete**

  Mark PR B `MERGED` only after main checks and applicable receipt/safe-skip evidence. Keep PR C Task 0, route-family implementation, experience build, and physical UAT pending in both linked P1 rows.

## Self-review checklist

- [ ] Every requirement in the approved design spec maps to a task; PR B excludes V1 visual values and product behavior.
- [ ] The plan contains no `TBD`, implicit “same as above” task, unowned file, or unbounded retry.
- [ ] Function names used by tests match exported checker names.
- [ ] The migration table totals 53 colors: 49 direct + 4 fallback-only, plus one font row.
- [ ] `app.json` selected red and runtime selected ink remain separate declared current roles; PR B does not silently align them.
- [ ] `OUT_DIR` redirects phase3 artifacts; before/after HEAD and porcelain fences surround long checks.
- [ ] Completion language remains fail-closed: implementation, merge, upload, Task 0, and UAT are separate states.

## Execution mode

The user has already delegated implementation and merge decisions to the two bots, while repository policy assigns one writer and one read-only judge. Therefore execution proceeds **inline in the dedicated PR B worktree**, task by task with TDD and judge checkpoints; no subagents or parallel writers are used, and no additional execution-choice prompt is required.
