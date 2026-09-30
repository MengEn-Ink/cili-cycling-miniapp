# Profile Media Phase 2 Follow-up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the five remaining profile-media P1 findings and the related client error-state P2 findings without changing deployment state.

**Architecture:** Keep the existing owner-bound path and `profile_media_imports` recovery model. Retry transient DNS failures inside the shared five-second download budget, validate Strava avatar availability with the importer policy, replace whole-buffer CloudBase downloads with trusted-temp-URL HEAD plus bounded streaming, and persist a deterministic client-upload intent before returning a cloud path. Client error rendering uses one formatter for inline and toast output and request generations prevent preview success from clearing newer failures.

**Tech Stack:** Node.js CommonJS cloud functions, wx-server-sdk 4.0.2, TypeScript WeChat Mini Program, node:test, Vitest.

---

### Task 1: DNS retry and trusted Strava avatar readiness

**Files:**
- Modify: `cloudfunctions/profile/avatar-import.js`
- Modify: `cloudfunctions/profile/avatar-import.node-test.js`
- Modify: `cloudfunctions/strava-shared/core.js`
- Modify: `cloudfunctions/strava-shared/core.node-test.js`
- Generate: `cloudfunctions/strava-auth/oauth/core.js`
- Generate: `cloudfunctions/strava-callback/oauth/core.js`

- [ ] Add a failing default-path test where `lookup` returns `EAI_AGAIN` once and succeeds on the second call while the real `boundedRequest` adapter receives the response.
- [ ] Add failing readiness tests for HTTP, credential-bearing, explicit-port, IP, and non-allowlisted avatar URLs.
- [ ] Implement one bounded DNS retry that recomputes remaining time from the original five-second deadline.
- [ ] Add the importer-equivalent trusted avatar URL predicate to the Strava shared source and use it for OAuth capture plus readiness.
- [ ] Run `node --test cloudfunctions/profile/avatar-import.node-test.js cloudfunctions/strava-shared/core.node-test.js` and `npm run cloud:prepare`.

### Task 2: Owner-first, bounded object verification

**Files:**
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile/core.node-test.js`
- Modify: `cloudfunctions/profile/smoke.node-test.js`

- [ ] Add a failing handler-level test proving a cross-owner fileID never calls `getTempFileURL` or HTTPS request code.
- [ ] Add failing default-adapter tests for HEAD size rejection, missing size, early stream abort above 5MiB, and JPEG/PNG/WebP magic.
- [ ] Validate `isOwnerMedia` before any storage operation.
- [ ] Return the trusted temporary URL from object discovery, perform HEAD preflight, then stream GET while retaining only the first 12 bytes and aborting above the cap.
- [ ] Remove `cloud.downloadFile` from the registration path and run `npm --prefix cloudfunctions/profile test`.

### Task 3: Durable client-upload intent and cleanup recovery

**Files:**
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/store.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile/store.node-test.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.node-test.js`
- Modify: `cloudfunctions/profile-media-cleanup/store.node-test.js`

- [ ] Add a failing test that `mediaUploadPath` persists a deterministic `client_upload` intent before the path can be returned.
- [ ] Add a failing transaction test that successful `registerMedia` atomically creates the registry record and completes the matching intent.
- [ ] Add a failing cleanup test for an expired prepared client-upload intent whose upload landed but response was lost.
- [ ] Implement deterministic intent IDs from cloudPath, owner/path validation, and idempotent prepare/complete transitions in `profile_media_imports`.
- [ ] Reuse the existing fenced path-recovery cleanup and run both profile and cleanup suites.

### Task 4: Stable client error presentation

**Files:**
- Modify: `miniprogram/pages/profile-edit/index.ts`
- Modify: `tests/profile-edit-avatar.test.ts`

- [ ] Add failing tests asserting inline and toast use the same text for every media stage and that `MEDIA_TOO_LARGE` says to compress or choose another image.
- [ ] Add a failing race test where a preview started before a later upload error succeeds afterward and must not clear that later error.
- [ ] Return one formatted `{ code, message, detail }` result from the media error helper and use it for both surfaces.
- [ ] Tag preview errors with their request generation and only clear a matching preview error after a successful preview.
- [ ] Run `npx vitest run tests/profile-edit-avatar.test.ts`.

### Task 5: Verification and review handoff

**Files:**
- Verify only: repository-wide generated copies and package manifests

- [ ] Run `npm run cloud:prepare` and verify generated OAuth cores are byte-identical to the shared source.
- [ ] Run `npm run validate` and expect every test, package check, and build to pass.
- [ ] Run `npm run coverage` and preserve the existing `cloud.ts` thresholds.
- [ ] Run `npm run audit:all` and expect zero high-or-greater vulnerabilities.
- [ ] Run `npm run cloudbase:plan` and expect zero actions and zero conflicts.
- [ ] Confirm the worktree is clean and report only `de1856b..HEAD`; do not merge, deploy, or upload before independent review.

### Task 6: Bind registered media to immutable canonical objects

**Files:**
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile/store.js`
- Modify: `cloudfunctions/profile/capability-card.js`
- Modify: `cloudfunctions/admin-review/capability-card.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.js`
- Modify: corresponding node tests
- Create: `cloudstorage.rules.json`
- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`

- [ ] Add failing tests proving source overwrite cannot change profile/admin resolved URLs and that records without a canonical binding are hidden.
- [ ] Make bounded GET return bytes, SHA-256, size, MIME, and extension from the exact verified stream.
- [ ] Persist a separate `canonical_upload` intent before uploading to `profile-canonical/<owner>/<source-hash>/<content-hash>.<ext>`.
- [ ] Atomically bind `source_file_id`, `canonical_file_id`, hash, size, and MIME to the registry and complete source/canonical intents.
- [ ] Add failing tests for canonical upload response unknown, canonicalization failure, idempotent repeat registration, and cleanup of both source and canonical objects.
- [ ] Add and validate a storage rule that permits client writes only below the staging `profiles/` prefix and denies `profile-canonical/` writes.
- [ ] Document and require a post-deploy client overwrite smoke before uploading the Mini Program build.

### Task 7: Close immutable recovery races and client-state follow-ups

**Files:**
- Modify: `cloudfunctions/profile-media-cleanup/core.js`
- Modify: `cloudfunctions/profile-media-cleanup/store.js`
- Modify: `cloudfunctions/profile/store.js`
- Modify: `cloudfunctions/profile-media-cleanup/core.node-test.js`
- Modify: `cloudfunctions/profile-media-cleanup/store.node-test.js`
- Modify: `cloudfunctions/profile/store.node-test.js`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile-edit/index.ts`
- Modify: `tests/profile-page.test.ts`
- Modify: `tests/profile-edit-avatar.test.ts`

- [ ] Add a failing store test proving every recovery operation accepts the same kind-aware path predicate: `client_upload` and Strava intents use `profiles/`, while `canonical_upload` uses its validated `profile-canonical/` path.
- [ ] Add a failing executor test where source deletion succeeds and canonical deletion reports not-found through a whole-call exception; require a retryable failure instead of marking the registry deleted.
- [ ] Add failing transaction and cleanup tests where a legacy active source is canonicalized, the source intent carries its known `file_id/media_id`, and recovery cannot probe, attach, or delete the referenced source.
- [ ] Introduce one `validIntentCloudPath(record, secret)` helper and use it in claim, lease-current, attach, and reclaim checks. Re-read the profile before probe/attach/delete and reject a lease once its source target becomes referenced.
- [ ] Delete source and canonical targets one at a time. Accept success or trusted not-found only for the exact requested target; if any target lacks its own terminal result, keep the record retryable and do not call `markDeleted`.
- [ ] When backfilling a missing source intent for an existing source object, persist `file_id` and `media_id` immediately so claim-time reference protection applies.
- [ ] Add failing UI tests for blank profile nickname falling back to card displayName, disconnected versus connected-without-avatar guidance, and absent `wx.cloud` using one stable inline/toast error string.
- [ ] Implement the minimal template and profile-edit state changes, then run the three focused suites, full `npm run validate`, coverage, audit, read-only plan, and `git diff --check`.
