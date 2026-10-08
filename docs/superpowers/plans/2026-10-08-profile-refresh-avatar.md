# Personal Profile Refresh And Attendee Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simplify the personal center, expose refresh feedback only during pull-to-refresh, and always render attendee avatars as images without weakening public-avatar privacy checks.

**Architecture:** Keep the existing native WeChat pull-down refresh and profile cache pipeline. Add a small page-local refresh feedback state machine, remove the capability-card disclosure state, and provide a packaged avatar fallback entirely in the activity-detail presentation layer.

**Tech Stack:** Native WeChat Mini Program WXML/WXSS/TypeScript, Vitest, Node test runner.

---

## File Map

- `miniprogram/pages/profile/index.ts`: refresh feedback state and pull gesture handling.
- `miniprogram/pages/profile/index.wxml`: always-expanded card, conditional completeness, transient refresh strip.
- `miniprogram/pages/profile/index.wxss`: refresh strip motion and removal of obsolete static status styling.
- `miniprogram/pages/activity-detail/index.ts`: packaged attendee-avatar fallback and error handling.
- `miniprogram/pages/activity-detail/index.wxml`: image-only attendee avatars in list and modal.
- `tests/profile-page.test.ts`: profile hierarchy and refresh-state behavior.
- `tests/activity-detail-design.test.ts`: avatar fallback and image-error behavior.
- `tests/editorial-performance-layout.test.ts`: updated profile layout contract.
- `miniprogram/pages/settings/index.ts`: one new release-note entry required by the product-change gate.

### Task 1: Lock The Simplified Profile Contract

**Files:**
- Modify: `tests/profile-page.test.ts`
- Modify: `tests/editorial-performance-layout.test.ts`
- Modify: `miniprogram/pages/profile/index.wxml`

- [x] **Step 1: Write failing template tests**

Assert that the capability card has no `bindtap="toggleCard"`, secondary metrics and coverage are unconditional, `最近同步` and `页面数据` are absent, and completeness uses:

```xml
wx:if="{{profile && profile.completeness < 100}}"
```

Also assert that the old photo pull hint, dynamic `heroImageMode`, and static cache/refresh blocks are absent.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx vitest run tests/profile-page.test.ts tests/editorial-performance-layout.test.ts
```

Expected: failures report the existing collapsed card, static update text, and unconditional completeness region.

- [x] **Step 3: Implement the minimal template change**

Render both metric groups directly, retain only `heroCard.coverageText` inside details, remove card toggling semantics, use `mode="aspectFill"` for the Hero image, and conditionally render incomplete profiles.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the same Vitest command. Expected: all selected tests pass.

### Task 2: Add The Pull Refresh Feedback State Machine

**Files:**
- Modify: `tests/profile-page.test.ts`
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`

- [x] **Step 1: Write failing behavior tests**

Cover these transitions:

```text
idle -> pulling -> ready -> refreshing -> success -> idle
idle -> refreshing -> error -> idle
```

Verify that a pull at page scroll position zero exposes the last-update text, reaching the threshold changes the title to `松开刷新`, and Hero image mode never changes. Use fake timers to verify success hides after 1200 ms and failure hides after 1600 ms.

- [x] **Step 2: Run the profile test and verify RED**

Run:

```bash
npx vitest run tests/profile-page.test.ts
```

Expected: failures report missing `refreshStage`, `refreshTouchStart`, `refreshTouchMove`, and transient feedback markup.

- [x] **Step 3: Implement the minimal state machine**

Add page data:

```ts
refreshStage: 'idle' as 'idle' | 'pulling' | 'ready' | 'refreshing' | 'success' | 'error',
refreshTitle: '',
refreshDetail: '',
refreshPullProgress: 0,
```

Track pull distance only while the page is at the top. On native `onPullDownRefresh`, set the refreshing state, await both profile and capability-card work, call `wx.stopPullDownRefresh()`, then show success or failure briefly. Clear timers in `onHide` and `onUnload`.

- [x] **Step 4: Add the transient feedback strip**

Bind touch handlers on the profile page root. Render the strip only when `refreshStage !== 'idle'`, with separate icon treatments for pulling, ready, refreshing, success, and error. Animate only opacity and transforms, and include a reduced-motion override.

- [x] **Step 5: Run the profile test and verify GREEN**

Run:

```bash
npx vitest run tests/profile-page.test.ts
```

Expected: all profile tests pass without timer leaks.

### Task 3: Always Render Attendee Avatar Images

**Files:**
- Modify: `tests/activity-detail-design.test.ts`
- Modify: `miniprogram/pages/activity-detail/index.ts`
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/pages/activity-detail/index.wxss`

- [x] **Step 1: Write failing avatar tests**

Require both list and modal markup to use:

```xml
src="{{item.avatarUrl || defaultAttendeeAvatar}}"
src="{{selectedAttendee.avatarUrl || defaultAttendeeAvatar}}"
```

Assert that no text fallback remains, the packaged fallback path exists, a failed remote list avatar clears only that attendee URL, and a failed modal avatar clears only the selected attendee URL.

- [x] **Step 2: Run the activity-detail test and verify RED**

Run:

```bash
npx vitest run tests/activity-detail-design.test.ts
```

Expected: failures report conditional image markup and the missing modal error handler.

- [x] **Step 3: Implement the image-only fallback**

Add:

```ts
const DEFAULT_ATTENDEE_AVATAR = '/assets/profile/avatars/cili-orange.png';
```

Expose it in page data, render list and modal avatars as `image` elements, and fall back after remote image errors without changing backend avatar authorization or DTO mapping.

- [x] **Step 4: Run the activity-detail test and verify GREEN**

Run the same Vitest command. Expected: all selected tests pass.

### Task 4: Release Note And Full Verification

**Files:**
- Modify: `miniprogram/pages/settings/index.ts`
- Modify: `tests/settings-page.test.ts`

- [x] **Step 1: Write the failing release-note expectation**

Expect a new latest entry `2026.10.08.2` describing the simpler full profile card, pull refresh feedback, and attendee-avatar fallback.

- [x] **Step 2: Run the settings test and verify RED**

Run:

```bash
npx vitest run tests/settings-page.test.ts
```

Expected: the latest version assertion still sees `2026.10.08.1`.

- [x] **Step 3: Add the release note**

Insert `2026.10.08.2` first, mark it as the sole `latest: true` item, and mark the previous entry false.

- [x] **Step 4: Run focused and full verification**

Run:

```bash
npx vitest run tests/profile-page.test.ts tests/activity-detail-design.test.ts tests/editorial-performance-layout.test.ts tests/settings-page.test.ts
npm run validate
```

Expected: all focused tests and the repository quality gate pass.

- [x] **Step 5: Preview and commit**

Use the repository's existing WeChat developer-tool CLI auto-preview flow, inspect the personal center and activity-detail avatar states, then stage only the plan, source, tests, and release note:

```bash
git add docs/superpowers/plans/2026-10-08-profile-refresh-avatar.md \
  miniprogram/pages/profile/index.ts \
  miniprogram/pages/profile/index.wxml \
  miniprogram/pages/profile/index.wxss \
  miniprogram/pages/activity-detail/index.ts \
  miniprogram/pages/activity-detail/index.wxml \
  miniprogram/pages/activity-detail/index.wxss \
  miniprogram/pages/settings/index.ts \
  tests/profile-page.test.ts \
  tests/activity-detail-design.test.ts \
  tests/editorial-performance-layout.test.ts \
  tests/settings-page.test.ts
git commit -m "feat(ui): 简化个人中心并统一报名头像"
```
