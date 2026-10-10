# Profile Background Slot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one explicit profile background slot without truncating or deleting legacy multi-photo profile media.

**Architecture:** `profiles.background_photo` becomes the nullable single-slot source of truth, while `profiles.photos` remains a read-only legacy review archive. Missing slots fall back to the first valid legacy photo; new clients write only the slot, and old zero/one-photo writes are translated to slot updates without replacing the archive.

**Tech Stack:** TypeScript WeChat Mini Program, Vitest, Node.js `node:test`, CloudBase cloud functions, Markdown schema and release contracts.

---

## File Map

- `cloudfunctions/profile/core.js`: slot parsing, legacy write translation, response projection, reference-aware media validation.
- `cloudfunctions/profile/index.js`: include slot media in registry reads and persist slot updates transactionally.
- `cloudfunctions/profile/capability-card.js`: resolve exactly one effective background.
- `cloudfunctions/profile-media-cleanup/core.js`: treat the slot as a live media reference.
- `cloudfunctions/admin-review/capability-card.js`: current background first, then legacy review media, then avatar; cap at three.
- `miniprogram/models/index.ts`: expose a nullable single background in the client model.
- `miniprogram/repositories/cloud.ts`: strict slot mapping and payload serialization.
- `miniprogram/repositories/mock.ts`: preserve mock repository parity.
- `miniprogram/pages/profile-edit/index.ts`: stop truncating `photos`; edit and submit only `backgroundPhoto`.
- `miniprogram/pages/profile-edit/index.wxml`: render count/action labels from the slot.
- `docs/cloudbase-schema.md`: document slot and legacy archive semantics.
- `miniprogram/pages/settings/index.ts`: add the required release note.
- Focused tests live beside each cloud function and under `tests/`.

### Task 1: Lock Server Slot Contract

**Files:**
- Modify: `cloudfunctions/profile/core.node-test.js`
- Modify: `cloudfunctions/profile/core.js`

- [ ] **Step 1: Write failing domain tests**

Add tests proving:

```js
test('背景槽位显式 null 阻止 legacy photos 首图回退', () => {
  assert.equal(
    effectiveBackgroundPhoto({
      background_photo: null,
      photos: [{ file_id: 'cloud://legacy', category: 'ride' }],
    }),
    null,
  );
});

test('旧客户端零或单图写入转换成背景槽位且不生成 photos 覆盖', () => {
  assert.deepEqual(buildUpdate({ photos: [] }, key, {}), { background_photo: null });
  assert.deepEqual(
    buildUpdate({ photos: [{ file_id: 'cloud://next', category: 'ride' }] }, key, {}),
    { background_photo: { file_id: 'cloud://next', category: 'ride' } },
  );
});

test('新旧背景协议不可混用且旧多图继续拒绝', () => {
  assert.throws(
    () =>
      buildUpdate(
        {
          background_photo: null,
          photos: [{ file_id: 'cloud://next', category: 'ride' }],
        },
        key,
        {},
      ),
    { code: 'VALIDATION_FAILED' },
  );
  assert.throws(
    () =>
      buildUpdate(
        {
          photos: [
            { file_id: 'cloud://a', category: 'ride' },
            { file_id: 'cloud://b', category: 'bike' },
          ],
        },
        key,
        {},
      ),
    { code: 'VALIDATION_FAILED' },
  );
});
```

Also assert `response()` emits `background_photo` only when the source document owns the field and preserves all legacy `photos`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npm --prefix cloudfunctions/profile test
```

Expected: FAIL because `effectiveBackgroundPhoto` is not exported and `buildUpdate` still writes or validates `photos` directly.

- [ ] **Step 3: Implement slot normalization**

In `core.js`, add:

```js
function validPhoto(value) {
  return Boolean(
    value &&
      typeof value.file_id === 'string' &&
      value.file_id &&
      ['ride', 'bike', 'other'].includes(value.category),
  );
}

function effectiveBackgroundPhoto(profile) {
  const value = profile && typeof profile === 'object' ? profile : {};
  if (Object.prototype.hasOwnProperty.call(value, 'background_photo')) {
    return validPhoto(value.background_photo)
      ? { file_id: value.background_photo.file_id, category: value.background_photo.category }
      : null;
  }
  const legacy = Array.isArray(value.photos) ? value.photos.find(validPhoto) : undefined;
  return legacy ? { file_id: legacy.file_id, category: legacy.category } : null;
}
```

Update `buildUpdate` so `background_photo` accepts only `null` or one valid photo, legacy `photos` accepts only zero or one item, both inputs together fail, and both protocols produce only `data.background_photo`.

Update `response()`:

```js
const output = {
  // existing fields
  photos: Array.isArray(doc.photos) ? doc.photos : [],
};
if (Object.prototype.hasOwnProperty.call(doc, 'background_photo')) {
  output.background_photo = validPhoto(doc.background_photo)
    ? { file_id: doc.background_photo.file_id, category: doc.background_photo.category }
    : null;
}
return output;
```

Export `effectiveBackgroundPhoto` and `validPhoto`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm --prefix cloudfunctions/profile test
```

Expected: all profile tests PASS.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/profile/core.js cloudfunctions/profile/core.node-test.js
git commit -m "feat(profile): add explicit background slot contract"
```

### Task 2: Preserve Every Live Media Reference

**Files:**
- Modify: `cloudfunctions/profile/core.node-test.js`
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/index.node-test.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.node-test.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.js`

- [ ] **Step 1: Write failing reference tests**

Add a `validateMediaUpdate` test with current `photos=[legacyA, legacyB]`, no current slot, and update `background_photo=next`. Assert:

```js
assert.deepEqual(plan.data, {
  background_photo: { file_id: nextFileId, category: 'ride' },
});
assert.deepEqual(plan.activate_ids, [mediaDocumentId(nextFileId)]);
assert.deepEqual(plan.demote_ids, []);
```

Add a second test where an explicit old slot is replaced and is absent from avatar and legacy `photos`; assert only that old slot is demoted.

Add an index integration test that seeds a three-photo profile, calls:

```js
await main({
  action: 'update',
  background_photo: { file_id: nextFileId, category: 'ride' },
});
```

and asserts the stored `photos` array is byte-for-byte unchanged.

Add cleanup tests:

```js
assert.equal(
  profileReferences(
    { _id: 'owner', background_photo: { file_id: record.file_id, category: 'ride' }, photos: [] },
    record.file_id,
  ),
  true,
);
assert.equal(
  claimDecision(
    record,
    { _id: 'owner', background_photo: { file_id: record.file_id, category: 'ride' }, photos: [] },
    now,
    'lease-1',
    mediaSecret,
  ).kind,
  'referenced',
);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm --prefix cloudfunctions/profile test
npm --prefix cloudfunctions/profile-media-cleanup test
```

Expected: profile tests FAIL because slot media is absent from registry reads and reference sets; cleanup tests FAIL because `profileReferences` ignores the slot.

- [ ] **Step 3: Implement reference-safe updates**

In `validateMediaUpdate`, include effective current and next slots in `currentIds` and `nextIds`. Validate a submitted non-null slot with the existing `accept()` owner/registry logic. Keep all legacy `photos` IDs in both sets unless a dedicated migration changes them; this task never writes `photos`.

In `profile/index.js`, include `profile.background_photo.file_id` in `profileMediaIds()`. Existing spread merge then persists the slot while retaining `current.photos`.

In cleanup `profileReferences()`:

```js
if (profile.background_photo?.file_id === fileId) return true;
```

Export `profileReferences` for direct domain coverage if it is not already exported.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm --prefix cloudfunctions/profile test
npm --prefix cloudfunctions/profile-media-cleanup test
```

Expected: both suites PASS with the legacy archive unchanged.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/profile cloudfunctions/profile-media-cleanup/core.js cloudfunctions/profile-media-cleanup/core.node-test.js
git commit -m "fix(profile): retain legacy media references"
```

### Task 3: Separate Personal and Admin Media Views

**Files:**
- Modify: `cloudfunctions/profile/capability-card.node-test.js`
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/admin-review/capability-card.node-test.js`
- Modify: `cloudfunctions/admin-review/capability-card.js`

- [ ] **Step 1: Write failing capability tests**

Personal card test:

```js
const card = await buildCapabilityCard(
  {
    profile: {
      background_photo: { file_id: currentBackground, category: 'other' },
      photos: [
        { file_id: legacyRide, category: 'ride' },
        { file_id: legacyBike, category: 'bike' },
      ],
    },
    credential,
    snapshot,
    mediaRecords,
  },
  options,
);
assert.deepEqual(card.backgrounds, [
  { url: currentUrl, source: 'user_photo', category: 'other' },
]);
```

Add a legacy test with no `background_photo` and assert only the first valid historical photo is returned. Add explicit `background_photo:null` and assert no fallback occurs.

Admin test:

```js
assert.deepEqual(
  adminCapabilityMedia(
    {
      background_photo: { file_id: 'cloud://current', category: 'other' },
      photos: [
        { file_id: 'cloud://ride-1', category: 'ride' },
        { file_id: 'cloud://current', category: 'other' },
        { file_id: 'cloud://ride-2', category: 'bike' },
      ],
      avatar_file_id: 'cloud://avatar',
    },
    records,
    owner,
    mediaSecret,
  ).file_ids,
  ['cloud://current', 'cloud://ride-1', 'cloud://ride-2'].map(
    (fileId) => canonicalFor(fileId).canonicalFileId,
  ),
);
```

- [ ] **Step 2: Verify RED**

Run:

```bash
npm --prefix cloudfunctions/profile test
npm --prefix cloudfunctions/admin-review test
```

Expected: personal card chooses legacy `photos[0]`; admin review omits or misorders the explicit slot.

- [ ] **Step 3: Implement distinct projections**

Change `ownerMedia()` to build candidates from `[effectiveBackgroundPhoto(profile)]` only, then apply existing owner/registry/canonical checks and return at most one item.

In admin review, normalize `background_photo` only when it is an object with a supported category. Construct candidates in this order:

```js
const ordered = [
  ...backgrounds,
  ...photos.filter((photo) => isRidingCategory(photo.category)),
  ...photos.filter((photo) => !isRidingCategory(photo.category)),
  ...avatars,
];
```

Keep canonical validation and the existing three-item de-duplication cap unchanged.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npm --prefix cloudfunctions/profile test
npm --prefix cloudfunctions/admin-review test
```

Expected: both suites PASS; personal output is at most one and admin output at most three.

- [ ] **Step 5: Commit**

```bash
git add cloudfunctions/profile cloudfunctions/admin-review
git commit -m "feat(profile): separate background and review media"
```

### Task 4: Move the Mini Program to the Slot API

**Files:**
- Modify: `tests/cloud-repository.test.ts`
- Modify: `tests/profile-edit-avatar.test.ts`
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/repositories/mock.ts`
- Modify: `miniprogram/pages/profile-edit/index.ts`
- Modify: `miniprogram/pages/profile-edit/index.wxml`

- [ ] **Step 1: Write failing repository and page tests**

Repository tests must assert:

```ts
expect(await repository.getProfile()).toMatchObject({
  backgroundPhoto: { id: 'cloud://current', category: 'ride' },
  photos: [
    { id: 'cloud://legacy-a', category: 'ride' },
    { id: 'cloud://legacy-b', category: 'bike' },
  ],
});

await repository.updateProfile({
  backgroundPhoto: { id: 'cloud://next', category: 'ride' },
});
expectCall(callFunction, 'profile', {
  action: 'update',
  background_photo: { file_id: 'cloud://next', category: 'ride' },
});
```

Also assert `background_photo:null` maps to `backgroundPhoto:null` and serializes back as null.

Page test must load a profile with three `photos` and no slot, then assert:

```ts
expect(page.data.p.photos).toHaveLength(3);
expect(page.data.backgroundPhoto).toEqual(profile.photos[0]);
await page.save();
expect(rideService.updateProfile).toHaveBeenCalledWith(
  expect.objectContaining({ backgroundPhoto: profile.photos[0] }),
);
expect(rideService.updateProfile.mock.calls[0][0]).not.toHaveProperty('photos');
```

After `addPhoto()`, assert `backgroundPhoto` changes while `p.photos` remains unchanged.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/cloud-repository.test.ts tests/profile-edit-avatar.test.ts
```

Expected: FAIL because the model has no slot, repository ignores it, and the page truncates `photos`.

- [ ] **Step 3: Implement model and repository mapping**

Add:

```ts
export interface ProfilePhoto {
  id: string;
  category: string;
}

export interface Profile {
  // existing fields
  backgroundPhoto?: ProfilePhoto | null;
  photos: ProfilePhoto[];
}

export interface ProfileUpdate {
  // existing fields
  backgroundPhoto?: ProfilePhoto | null;
}
```

In `mapProfile`, map `background_photo` only when the property exists; accept only `null` or an object with non-empty string `file_id` and supported category, otherwise reject the response.

Remove `photos` from `ProfileUpdate`. In `updateProfile`, serialize only `backgroundPhoto` as `background_photo`; no client update path may serialize the read-only legacy `photos` archive. In the mock repository, merge `backgroundPhoto` while always retaining `current.photos`.

- [ ] **Step 4: Implement page slot state**

Delete `normalizeBackgroundProfile`. Add:

```ts
function effectiveClientBackground(profile: Profile): ProfilePhoto | null {
  if (profile.backgroundPhoto !== undefined) return profile.backgroundPhoto;
  return profile.photos[0] || null;
}
```

Store `backgroundPhoto` separately in page data. `loadPhotoPreviews()` resolves only this item. `addPhoto()` updates only `backgroundPhoto` and local preview state. `save()` sends:

```ts
rideService.updateProfile({
  gender: p.gender,
  emergencyName: p.emergencyName,
  backgroundPhoto: this.data.backgroundPhoto,
  realName: p.realName.includes('*') ? undefined : p.realName,
  phone: p.phone.includes('*') ? undefined : p.phone,
  emergencyPhone: p.emergencyPhone.includes('*') ? undefined : p.emergencyPhone,
});
```

Update WXML action labels and count from `backgroundPhoto`, while continuing to render `photoItems` as a zero/one list.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npx vitest run tests/cloud-repository.test.ts tests/profile-edit-avatar.test.ts tests/profile-page.test.ts
npm run typecheck
npm run lint
```

Expected: all focused tests, typecheck, and lint PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram tests/cloud-repository.test.ts tests/profile-edit-avatar.test.ts
git commit -m "feat(profile): edit one background without truncation"
```

### Task 5: Document and Announce the Contract

**Files:**
- Modify: `docs/cloudbase-schema.md`
- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`
- Modify: `tests/settings-page.test.ts`
- Modify: `miniprogram/pages/settings/index.ts`
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: Write failing schema and release tests**

Add assertions that schema contains:

```text
background_photo: null | { file_id, category: ride|bike|other }
photos ... 只读存量审核媒体
```

Add a settings test requiring the newest entry `2026.10.10.14 / 单背景图数据保护`.

- [ ] **Step 2: Verify RED**

Run:

```bash
npx vitest run tests/settings-page.test.ts
node --test scripts/bootstrap-cloudbase.node-test.mjs
```

Expected: FAIL because schema and release note do not mention the slot.

- [ ] **Step 3: Update docs and release note**

Document the missing/null/fallback rules, old-client write translation, cleanup references, and admin three-media projection in `docs/cloudbase-schema.md`.

Add the next release entry with user-facing points:

- 单背景图独立保存和预览。
- 存量多图资料在普通保存和替换背景时继续保留。

Update HP-10 with RED/GREEN test counts and current evidence, but retain `IN_PROGRESS` until full validation and deployment.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run tests/settings-page.test.ts
node --test scripts/bootstrap-cloudbase.node-test.mjs
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add docs/cloudbase-schema.md docs/high-priority-issues.md miniprogram/pages/settings/index.ts tests/settings-page.test.ts scripts/bootstrap-cloudbase.node-test.mjs
git commit -m "docs(profile): announce background data protection"
```

### Task 6: Full Gate, Remote Delivery, and Runtime Readback

**Files:**
- Modify: `docs/high-priority-issues.md`
- Create only when runtime evidence exists: `docs/evidence/2026-10-10-profile-background-slot/README.md`

- [ ] **Step 1: Run full local gates**

```bash
npm run validate
npm run audit:all
git status --short
```

Expected: all tests, typecheck, lint, formatting, package checks, cloud package parity, build, and high-severity audits PASS.

- [ ] **Step 2: Rebase safely and rerun critical gates**

```bash
git fetch origin
git rebase origin/main
npm run validate
```

Expected: clean rebase and full PASS. Do not overwrite unrelated user changes.

- [ ] **Step 3: Push and observe immutable remote evidence**

```bash
git push origin main
gh run list --branch main --limit 10
```

Wait for the main CI and development upload workflows for the pushed SHA. Record run IDs and the actual uploaded version.

- [ ] **Step 4: Deploy affected cloud functions**

Deploy `profile`, `profile-media-cleanup`, and `admin-review` from the exact validated SHA using the repository CloudBase deployment workflow. Read back each function as `Active`, download `$LATEST`, and compare every deployed package file with the local deployment package.

- [ ] **Step 5: Run data-safe runtime smoke**

Use an isolated test profile with three canonical active legacy media records:

1. Read profile and record all `photos` IDs and media statuses.
2. Save non-media profile fields with the new client payload.
3. Read profile again and assert the same ordered `photos` IDs and active statuses.
4. Replace `background_photo` with a newly registered media object.
5. Assert `background_photo` points to the new object, legacy `photos` remains identical, personal card returns one new background, and admin detail returns no more than three media with the new background first.
6. Run or wait for cleanup eligibility readback and prove all legacy references remain non-deletable.
7. Remove all isolated test documents and objects, then verify zero marker records remain.

Do not use synthetic smoke as a substitute for the required physical-device preview check.

- [ ] **Step 6: Update issue status**

If code, CI, upload, deploy, online package comparison, and automated runtime readback all pass but physical-device and independent review remain, set HP-10 to `PENDING_EVIDENCE`. Delete HP-10 only after every closure condition is independently evidenced.

- [ ] **Step 7: Commit and push evidence**

```bash
git add docs/high-priority-issues.md docs/evidence/2026-10-10-profile-background-slot
git commit -m "docs(issues): record background slot delivery"
git push origin main
```
