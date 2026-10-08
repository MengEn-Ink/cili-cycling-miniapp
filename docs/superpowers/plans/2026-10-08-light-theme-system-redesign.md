# Light Theme High-Contrast System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the drifted light-theme overrides with the approved high-contrast white, black/gray, and restrained orange visual system across every mini-program page.

**Architecture:** Keep the existing native WeChat mini-program structure and dark theme. Establish the light theme in `app.wxss` as the semantic source of truth, normalize shared primitives, then remove page-level dark literals from ordinary content surfaces while preserving fixed white copy inside photographic heroes. Lock the visual system with static CSS contracts, measured contrast tests, narrow-screen layout assertions, authenticated simulator screenshots, and the repository's full validation gate.

**Tech Stack:** Native WeChat mini-program WXML/WXSS/TypeScript, Vitest static contracts, Node test runners, WeChat DevTools automation, CloudBase deployment, miniprogram-ci.

---

## File Map

- `miniprogram/app.wxss`: light-theme semantic tokens, shared type/spacing roles, buttons, forms, cards, status primitives, fixed action bars.
- `miniprogram/components/activity-card/index.wxss`: activity card border, metrics, metadata, CTA, narrow-screen behavior.
- `miniprogram/components/state-view/index.wxss`: readable empty/loading/error states.
- `miniprogram/components/status-pill/index.wxss`: high-contrast semantic status pills.
- `miniprogram/pages/activities/index.wxss`: page axis, headline hierarchy, count and section alignment.
- `miniprogram/pages/activity-detail/index.wxss`: photographic hero boundary, metric grid, information rows and fixed CTA.
- `miniprogram/pages/registrations/index.wxss`: registration card hierarchy and narrow-screen metadata.
- `miniprogram/pages/profile/index.wxss`: photographic profile hero, centered metrics, readable edit and management actions.
- `miniprogram/pages/profile-edit/index.wxss`: light forms, media controls and save action.
- `miniprogram/pages/registration-form/index.wxss`: step rail, form sections, choices, Strava state and fixed actions.
- `miniprogram/pages/credential/index.wxss`: credential facts and actions.
- `miniprogram/pages/strava/index.wxss`: readiness states, metrics and OAuth controls.
- `miniprogram/pages/capability-card/index.wxss`: capability metrics and public card surfaces.
- `miniprogram/pages/settings/index.wxss`: settings rows, release notes and theme control.
- `miniprogram/pages/admin/activity-list/index.wxss`: activity management list and clone controls.
- `miniprogram/pages/admin/activity-edit/index.wxss`: activity form, media controls, route and danger actions.
- `miniprogram/pages/admin/reviews/index.wxss`: filter tabs and review cards.
- `miniprogram/pages/admin/review-detail/index.wxss`: capability hero boundary, profile facts, metrics and decisions.
- `tests/light-theme-high-contrast-system.test.ts`: approved palette, typography, alignment and hard-coded color guard.
- `tests/theme-accessibility-regressions.test.ts`: shared primitive and narrow-screen regressions.
- `tests/light-theme-color-calibration.test.ts`: measured semantic and page-specific contrast.
- `miniprogram/pages/settings/index.ts`: prepend the shipped light-theme redesign release note.

### Task 1: Lock The Approved Palette And Layout Contract

**Files:**
- Create: `tests/light-theme-high-contrast-system.test.ts`
- Modify: `tests/theme-accessibility-regressions.test.ts`
- Test: `tests/light-theme-high-contrast-system.test.ts`

- [ ] **Step 1: Write the failing palette and typography test**

```ts
import { describe, expect, it } from 'vitest';
import {
  contrast,
  declaration,
  effectiveBlock,
  read,
  resolvedHex,
  themeTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const light = themeTokens(app, 'light');

describe('approved high-contrast light theme', () => {
  it('uses the approved white, ink, gray and restrained orange palette', () => {
    expect(light['--color-bg']).toBe('#ffffff');
    expect(light['--color-surface']).toBe('#ffffff');
    expect(light['--color-raised']).toBe('#f1f1ef');
    expect(light['--color-text']).toBe('#080808');
    expect(light['--color-muted']).toBe('#4f4f4c');
    expect(light['--color-border']).toBe('#bdbdb8');
    expect(light['--color-border-strong']).toBe('#111111');
    expect(light['--color-brand']).toBe('#bd3f00');
    expect(light['--color-brand-active']).toBe('#8e2e00');
    expect(light['--color-on-brand']).toBe('#ffffff');
  });

  it('keeps body and button text above WCAG AA', () => {
    expect(contrast(light['--color-text'], light['--color-bg'])).toBeGreaterThanOrEqual(7);
    expect(contrast(light['--color-muted'], light['--color-bg'])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(light['--color-on-brand'], light['--color-brand'])).toBeGreaterThanOrEqual(4.5);
  });

  it('uses stable centered controls without negative letter spacing', () => {
    const button = effectiveBlock(app, '.btn');
    expect(declaration(button, 'justify-content')).toBe('center');
    expect(declaration(button, 'letter-spacing')).toBe('0');
  });
});
```

- [ ] **Step 2: Write the failing page-alignment guard**

Add assertions that:

```ts
const detail = read('miniprogram/pages/activity-detail/index.wxss');
const profile = read('miniprogram/pages/profile/index.wxss');
const form = read('miniprogram/pages/registration-form/index.wxss');

expect(declaration(effectiveBlock(detail, '.detail-metric'), 'text-align')).toBe('center');
expect(declaration(effectiveBlock(profile, '.edit-button'), 'background')).toBe(
  'var(--color-text)',
);
expect(declaration(effectiveBlock(profile, '.edit-button'), 'color')).toBe(
  'var(--color-bg)',
);
expect(declaration(effectiveBlock(form, '.form-title'), 'text-align')).toBe('center');
expect(form).toMatch(
  /@media \(max-width: 320px\)[\s\S]*?\.identity-card\s*\{[^}]*grid-template-columns:\s*1fr/s,
);
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run:

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/theme-accessibility-regressions.test.ts
```

Expected: FAIL on the current cream palette, gradient CTA, nonzero button letter spacing, low-contrast profile edit button, and missing narrow identity-card rule.

- [ ] **Step 4: Commit the tests**

```bash
git add tests/light-theme-high-contrast-system.test.ts tests/theme-accessibility-regressions.test.ts
git commit -m "test(ui): 锁定浅色高对比视觉系统"
```

### Task 2: Establish Global Light Tokens And Shared Primitives

**Files:**
- Modify: `miniprogram/app.wxss`
- Modify: `tests/light-theme-color-calibration.test.ts`
- Test: `tests/light-theme-high-contrast-system.test.ts`

- [ ] **Step 1: Replace only the light semantic token assignments**

Use the approved values:

```css
.theme-light {
  --color-bg: #ffffff;
  --color-surface: #ffffff;
  --color-raised: #f1f1ef;
  --color-text: #080808;
  --color-muted: #4f4f4c;
  --color-subtle: #666662;
  --color-border: #bdbdb8;
  --color-border-strong: #111111;
  --color-input-bg: #ffffff;
  --color-fixed-bar: rgba(255, 255, 255, 0.98);
  --color-shadow: rgba(8, 8, 8, 0.1);
  --color-brand: #bd3f00;
  --color-brand-active: #8e2e00;
  --color-brand-soft: #f7e8e1;
  --color-on-brand: #ffffff;
}
```

Keep the existing dark token block unchanged.

- [ ] **Step 2: Normalize global text and control primitives**

Implement:

```css
.btn,
.secondary {
  min-height: var(--control-height);
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm) !important;
  font-size: 28rpx;
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: 0;
}

.btn {
  background: var(--color-brand) !important;
  color: var(--color-on-brand) !important;
}

.theme-light .card {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: none;
}

.theme-light .input,
.theme-light .textarea {
  border-color: var(--color-border-strong);
  background: var(--color-input-bg);
  color: var(--color-text);
}
```

Remove the decorative gradient and clipped-corner geometry from shared light controls. Preserve focus/pressed and disabled semantics.

- [ ] **Step 3: Update contrast expectations**

Update `tests/light-theme-color-calibration.test.ts` and existing theme tests to expect the approved palette without weakening any `4.5:1` or `3:1` minimum.

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/light-theme-color-calibration.test.ts tests/theme-accessibility-regressions.test.ts
```

Expected: palette and shared primitive tests PASS; page-specific tests may remain failing until later tasks.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/app.wxss tests/light-theme-color-calibration.test.ts
git commit -m "feat(ui): 建立浅色高对比主题基础"
```

### Task 3: Normalize Activity Discovery And Detail

**Files:**
- Modify: `miniprogram/pages/activities/index.wxss`
- Modify: `miniprogram/components/activity-card/index.wxss`
- Modify: `miniprogram/pages/activity-detail/index.wxss`
- Modify: `miniprogram/components/status-pill/index.wxss`
- Test: `tests/light-theme-high-contrast-system.test.ts`
- Test: `tests/activity-detail-design.test.ts`

- [ ] **Step 1: Add failing activity page tests**

Assert that light activity cards use semantic surfaces, metrics are centered, CTA text uses `--color-on-brand`, the detail metric panel uses a strong square boundary, and date rows use a fixed label plus flexible value column.

```ts
expect(declaration(effectiveBlock(card, '.activity-card'), 'background')).toBe(
  'var(--color-surface)',
);
expect(declaration(effectiveBlock(card, '.metric-item'), 'text-align')).toBe('center');
expect(declaration(effectiveBlock(detail, '.detail-line'), 'grid-template-columns')).toBe(
  '148rpx minmax(0, 1fr)',
);
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/activity-detail-design.test.ts
```

Expected: FAIL because ordinary card content still inherits dark literals and detail information rows do not use the approved stable grid.

- [ ] **Step 3: Implement list and card normalization**

Use semantic colors for ordinary card content while retaining white text over media:

```css
.theme-light .activity-card {
  border-color: var(--color-border-strong);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  box-shadow: none;
}

.theme-light .activity-title,
.theme-light .metric-value,
.theme-light .level {
  color: var(--color-text);
}

.theme-light .route-line,
.theme-light .metric-unit,
.theme-light .card-meta {
  color: var(--color-muted);
}
```

Keep `.date-value` and media-overlay copy white.

- [ ] **Step 4: Implement detail information alignment**

Use strong borders for the metric panel, semantic surfaces below the hero, and:

```css
.detail-line {
  display: grid;
  grid-template-columns: 148rpx minmax(0, 1fr);
  gap: 16rpx;
}

.detail-line > text:last-child {
  min-width: 0;
  font-variant-numeric: tabular-nums;
  text-align: right;
  overflow-wrap: anywhere;
}
```

At `max-width: 320px`, allow the value to wrap without shrinking the label.

- [ ] **Step 5: Run focused tests and commit**

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/activity-detail-design.test.ts tests/activity-media-location.test.ts
git add miniprogram/pages/activities/index.wxss miniprogram/components/activity-card/index.wxss miniprogram/components/status-pill/index.wxss miniprogram/pages/activity-detail/index.wxss tests/light-theme-high-contrast-system.test.ts tests/activity-detail-design.test.ts
git commit -m "feat(ui): 重整浅色活动浏览与详情"
```

### Task 4: Normalize Registrations And Profile

**Files:**
- Modify: `miniprogram/pages/registrations/index.wxss`
- Modify: `miniprogram/pages/profile/index.wxss`
- Modify: `miniprogram/pages/capability-card/index.wxss`
- Test: `tests/light-theme-high-contrast-system.test.ts`
- Test: `tests/profile-page.test.ts`
- Test: `tests/personal-card-page.test.ts`

- [ ] **Step 1: Add failing card and profile-action tests**

Assert that registration cards use strong readable type, status colors remain semantic, profile metrics are centered, and the edit action is ink-on-white inverted:

```ts
expect(declaration(effectiveBlock(profile, '.edit-button'), 'background')).toBe(
  'var(--color-text)',
);
expect(declaration(effectiveBlock(profile, '.edit-button'), 'color')).toBe(
  'var(--color-bg)',
);
expect(declaration(effectiveBlock(profile, '.profile-metric'), 'text-align')).toBe('center');
```

- [ ] **Step 2: Run focused tests and verify failure**

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/profile-page.test.ts tests/personal-card-page.test.ts
```

Expected: FAIL on the profile edit action and page-level layout rules.

- [ ] **Step 3: Implement registration hierarchy**

Remove light-theme shadows, use `--color-text` for titles and detail links, `--color-muted` for metadata, semantic borders for statuses, and keep dates orange.

- [ ] **Step 4: Implement profile hierarchy**

Keep the photographic hero dark. Normalize content below it:

```css
.theme-light .edit-button {
  border-color: var(--color-text);
  background: var(--color-text) !important;
  color: var(--color-bg) !important;
}

.theme-light .profile-metric,
.theme-light .hero-capability-metric {
  text-align: center;
}

.theme-light .menu-list,
.theme-light .menu-card {
  border-radius: 0;
  box-shadow: none;
}
```

Long metric values must wrap or size down at the existing narrow breakpoint without ellipsis.

- [ ] **Step 5: Run tests and commit**

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/profile-page.test.ts tests/personal-card-page.test.ts tests/registrations-page-compact-contract.test.ts
git add miniprogram/pages/registrations/index.wxss miniprogram/pages/profile/index.wxss miniprogram/pages/capability-card/index.wxss tests/light-theme-high-contrast-system.test.ts
git commit -m "feat(ui): 统一浅色行程与个人中心"
```

If the named compact test is absent, run `tests/registration-pages-compact-contract.test.ts`, which is the repository's existing registration compact-layout suite.

### Task 5: Normalize Forms, Settings And Admin Surfaces

**Files:**
- Modify: `miniprogram/pages/profile-edit/index.wxss`
- Modify: `miniprogram/pages/registration-form/index.wxss`
- Modify: `miniprogram/pages/credential/index.wxss`
- Modify: `miniprogram/pages/strava/index.wxss`
- Modify: `miniprogram/pages/settings/index.wxss`
- Modify: `miniprogram/pages/admin/activity-list/index.wxss`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxss`
- Modify: `miniprogram/pages/admin/reviews/index.wxss`
- Modify: `miniprogram/pages/admin/review-detail/index.wxss`
- Modify: `miniprogram/components/state-view/index.wxss`
- Test: `tests/light-theme-high-contrast-system.test.ts`
- Test: `tests/theme-accessibility-regressions.test.ts`

- [ ] **Step 1: Add failing hard-coded light-surface guard**

Build a page list and reject dark literals inside final theme bridges:

```ts
const themedFiles = [
  'miniprogram/pages/profile-edit/index.wxss',
  'miniprogram/pages/registration-form/index.wxss',
  'miniprogram/pages/credential/index.wxss',
  'miniprogram/pages/strava/index.wxss',
  'miniprogram/pages/settings/index.wxss',
  'miniprogram/pages/admin/activity-list/index.wxss',
  'miniprogram/pages/admin/activity-edit/index.wxss',
  'miniprogram/pages/admin/reviews/index.wxss',
  'miniprogram/pages/admin/review-detail/index.wxss',
];

for (const file of themedFiles) {
  const source = read(file);
  expect(source).toMatch(/var\(--color-bg\)/);
  expect(source).toMatch(/var\(--color-text\)/);
}
```

Also assert the 320px identity and action layouts collapse to one column.

- [ ] **Step 2: Run the focused tests and verify failure**

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/theme-accessibility-regressions.test.ts tests/profile-edit-avatar.test.ts tests/registration-form-view-contract.test.js
```

Expected: FAIL on low-contrast literals and missing narrow-screen form layout.

- [ ] **Step 3: Normalize form controls**

For profile, registration and activity forms:

```css
.theme-light .field input,
.theme-light .field textarea,
.theme-light .input,
.theme-light .remark {
  border-color: var(--color-border-strong);
  background: var(--color-input-bg);
  color: var(--color-text);
}

.theme-light .choice.selected,
.theme-light .segment.selected {
  border-color: var(--color-text);
  background: var(--color-raised);
  color: var(--color-text);
}
```

Center page-level form titles and buttons, but keep labels, values, hints and errors left-aligned.

- [ ] **Step 4: Normalize settings and admin views**

Replace dark ordinary surfaces with semantic white surfaces, use black strong borders for form and filter controls, keep status semantics, and remove decorative shadows. At 320px:

```css
@media (max-width: 320px) {
  .identity-card,
  .decision-actions,
  .clone-actions,
  .split {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 5: Run all theme and page-contract tests**

```bash
npx vitest run tests/light-theme-high-contrast-system.test.ts tests/light-theme-color-calibration.test.ts tests/theme-accessibility-regressions.test.ts tests/profile-edit-avatar.test.ts tests/registration-form-view-contract.test.js tests/admin-review-regressions.test.ts tests/settings-page.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/profile-edit/index.wxss miniprogram/pages/registration-form/index.wxss miniprogram/pages/credential/index.wxss miniprogram/pages/strava/index.wxss miniprogram/pages/settings/index.wxss miniprogram/pages/admin/activity-list/index.wxss miniprogram/pages/admin/activity-edit/index.wxss miniprogram/pages/admin/reviews/index.wxss miniprogram/pages/admin/review-detail/index.wxss miniprogram/components/state-view/index.wxss tests/light-theme-high-contrast-system.test.ts tests/theme-accessibility-regressions.test.ts
git commit -m "feat(ui): 收敛浅色表单与管理界面"
```

### Task 6: Add Release Note And Verify Real Screens

**Files:**
- Modify: `miniprogram/pages/settings/index.ts`
- Verify: `.superpowers/brainstorm/` remains ignored and untracked

- [ ] **Step 1: Add the release note**

Prepend a single entry describing the high-contrast light theme, readable forms, centered metrics/buttons and stable narrow-screen dates. Do not change prior release entries.

- [ ] **Step 2: Run the release-note gate**

```bash
npm run test:release-notes
npm run check:release-notes
```

Expected: both PASS.

- [ ] **Step 3: Capture authenticated light-theme screenshots**

Use the existing WeChat DevTools automation session to capture:

- activities;
- activity detail;
- registrations;
- profile;
- profile edit;
- registration form;
- Strava;
- settings;
- activity list/edit;
- reviews/detail.

Capture normal iPhone 15 Pro Max and a 320px-equivalent narrow viewport. Inspect every screenshot for overlap, clipping, off-center button text, low-contrast copy, unsafe fixed bars and inconsistent gutters.

- [ ] **Step 4: Capture dark-theme smoke screenshots**

Verify activity list, activity detail, profile and registration form remain readable and preserve their established dark visual identity.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/settings/index.ts
git commit -m "docs(release): 记录浅色主题视觉升级"
```

### Task 7: Full Validation, Deployment And Post-Deploy Smoke

**Files:**
- Verify: repository root and deployment config

- [ ] **Step 1: Run the complete gate**

```bash
npm run validate
```

Expected: formatting, lint, typecheck, 615+ frontend tests, evidence tests, bootstrap/deploy/release tests, cloud function tests, package verification and build all PASS.

- [ ] **Step 2: Verify clean and reviewable commits**

```bash
git status --short
git log --oneline -8
git diff origin/main...HEAD --stat
```

Expected: no generated screenshots, `.superpowers` files or unrelated changes are staged.

- [ ] **Step 3: Upload the mini-program**

Use the repository deployment command with the next patch version and a description tied to the final commit:

```bash
MINIPROGRAM_VERSION=0.0.18.2 \
MINIPROGRAM_DESCRIPTION="浅色高对比主题与布局校准" \
npm run deploy:miniprogram
```

Expected: miniprogram-ci upload succeeds for the current final SHA. Do not deploy CloudBase functions because this change is UI-only.

- [ ] **Step 4: Post-deploy smoke**

Open the uploaded development build and verify activities, detail, registrations, profile, profile edit and settings load real CloudBase data without error. Confirm the light theme matches the approved screenshots.

- [ ] **Step 5: Record final evidence**

Report:

- final commit SHA;
- uploaded version;
- focused and full test counts;
- normal and narrow screenshot coverage;
- dark-theme smoke result;
- any device-only rendering risk that remains.
