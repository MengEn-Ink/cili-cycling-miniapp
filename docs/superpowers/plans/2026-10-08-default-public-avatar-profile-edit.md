# Default Public Avatar And Profile Edit Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove avatar visibility and display-title controls from profile editing while making every valid registered avatar publicly visible by default.

**Architecture:** Keep the existing profile DTO fields for compatibility, but stop using visibility fields as an activity-avatar gate. Avatar selection transactions will write a matching public visibility revision, while activity-read continues to require valid source, ownership, active registry state, canonical path, content metadata, and signed URL generation.

**Tech Stack:** Native WeChat Mini Program WXML/WXSS/TypeScript, Node.js CloudBase functions, Vitest, Node test runner.

---

## File Map

- `miniprogram/pages/profile-edit/index.wxml`: remove the visibility switch and display-title section; add the fixed public-use note.
- `miniprogram/pages/profile-edit/index.ts`: remove the obsolete visibility-change handler.
- `miniprogram/pages/profile-edit/index.wxss`: remove visibility-switch styles.
- `cloudfunctions/profile/store.js`: mark newly selected and imported avatars public at their new revision.
- `cloudfunctions/activity-read/public-avatar.js`: stop filtering otherwise valid avatars by historical visibility fields.
- `tests/profile-edit-avatar.test.ts`: lock the simplified edit UI and removed handler.
- `cloudfunctions/profile/store.node-test.js`: verify new avatars persist public visibility at the same revision.
- `cloudfunctions/activity-read/public-avatar.node-test.js`: verify missing, private, and stale visibility metadata no longer blocks an avatar.
- `cloudfunctions/activity-read/index.node-test.js`: verify historical private avatars resolve through canonical media while invalid external avatars remain hidden.
- `miniprogram/pages/settings/index.ts` and `tests/settings-page.test.ts`: record the user-visible policy and editor changes.

### Task 1: Simplify The Profile Editor

**Files:**
- Modify: `tests/profile-edit-avatar.test.ts`
- Modify: `miniprogram/pages/profile-edit/index.wxml`
- Modify: `miniprogram/pages/profile-edit/index.ts`
- Modify: `miniprogram/pages/profile-edit/index.wxss`

- [x] **Step 1: Write failing editor-contract tests**

Assert that the template contains `头像会展示在活动报名骑友列表中`, and does not contain `switch`, `onAvatarVisibilityChange`, `展示身份`, or `展示称号`. Assert that the page script no longer defines the visibility handler.

- [x] **Step 2: Run the profile-edit tests and verify RED**

Run:

```bash
npx vitest run tests/profile-edit-avatar.test.ts
```

Expected: failures report the existing switch, visibility handler, and display-title card.

- [x] **Step 3: Remove the controls and obsolete logic**

Replace the visibility row with the fixed public-use note, remove the display identity card, delete `onAvatarVisibilityChange`, and remove `.avatar-visibility-*` styles.

- [x] **Step 4: Run the profile-edit tests and verify GREEN**

Run the same Vitest command. Expected: all profile-edit tests pass.

### Task 2: Make New Avatars Public At Their Current Revision

**Files:**
- Modify: `cloudfunctions/profile/store.node-test.js`
- Modify: `cloudfunctions/profile/store.js`

- [x] **Step 1: Write failing transaction assertions**

For both `setAvatar` and `completeAvatarImport`, require the stored profile to contain:

```js
avatar_revision: 1,
avatar_visibility: 'public',
avatar_visibility_revision: 1,
```

- [x] **Step 2: Run the profile store tests and verify RED**

Run:

```bash
npm --prefix cloudfunctions/profile test -- --test-name-pattern="setAvatar|导入"
```

Expected: avatar transaction assertions fail because visibility is not advanced with the revision.

- [x] **Step 3: Update both avatar transactions**

Calculate the next revision once, then write it to `avatar_revision` and `avatar_visibility_revision`, with `avatar_visibility: 'public'`, in the same transaction that selects the avatar.

- [x] **Step 4: Run the profile store tests and verify GREEN**

Run:

```bash
npm --prefix cloudfunctions/profile test
```

Expected: all profile cloud-function tests pass.

### Task 3: Display Historical Valid Avatars Regardless Of Visibility Metadata

**Files:**
- Modify: `cloudfunctions/activity-read/public-avatar.node-test.js`
- Modify: `cloudfunctions/activity-read/index.node-test.js`
- Modify: `cloudfunctions/activity-read/public-avatar.js`

- [x] **Step 1: Write failing public-avatar tests**

Require `publicAvatarSource` to accept valid cloud avatars when visibility is missing, private, or bound to an older revision. Keep rejection cases for missing profile, invalid revision, invalid source, external URL, and oversized file ID.

At the activity-detail integration level, provide valid canonical media records for historical visibility cases and require HTTPS avatar URLs for them. Continue requiring an empty avatar for external URLs and invalid canonical records.

- [x] **Step 2: Run activity-read tests and verify RED**

Run:

```bash
npm --prefix cloudfunctions/activity-read test
```

Expected: historical visibility cases remain hidden under the old gate.

- [x] **Step 3: Remove only the visibility gate**

Delete checks for `avatar_visibility` and `avatar_visibility_revision` from `publicAvatarSource`. Leave every source, revision, file ID, owner, registry, canonical path, MIME, size, hash, status, and secret validation unchanged.

- [x] **Step 4: Run activity-read tests and verify GREEN**

Run the same command. Expected: all activity-read tests pass.

### Task 4: Release Note, Full Verification, Preview, And Commit

**Files:**
- Modify: `tests/settings-page.test.ts`
- Modify: `miniprogram/pages/settings/index.ts`

- [x] **Step 1: Write the failing release-note assertion**

Require `2026.10.08.3` as the latest entry with the title `头像默认展示与资料编辑简化`.

- [x] **Step 2: Run the settings test and verify RED**

Run:

```bash
npx vitest run tests/settings-page.test.ts
```

Expected: the latest entry remains `2026.10.08.2`.

- [x] **Step 3: Add the release note**

Insert the new entry first, mark it as the sole latest item, and mark `2026.10.08.2` as not latest.

- [x] **Step 4: Run full verification**

Run:

```bash
npm run validate
```

Expected: frontend tests, cloud tests, release-note checks, typecheck, lint, formatting, and build all pass.

- [x] **Step 5: Preview and commit**

Run the existing WeChat developer-tool `auto-preview`, inspect the profile editor and activity detail, and commit only this feature's plan, source, tests, and release note:

```bash
git commit -m "feat(profile): 默认公开头像并简化资料编辑"
```
