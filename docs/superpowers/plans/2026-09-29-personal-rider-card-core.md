# Personal Rider Card Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a self-only personal rider card backed by one authenticated CloudBase response, existing 90-day Strava data, and owner-validated temporary photo URLs.

**Architecture:** Extend the profile domain with owner-bound media path issuance and a `capabilityCard` read action. The Mini Program repository maps one strict DTO into a dedicated page; a pure view model hides unavailable modules and renders scheme A without raw storage identifiers.

**Tech Stack:** WeChat Mini Program, TypeScript, WXML/WXSS, Node.js Cloud Functions, CloudBase storage/database, Vitest, Node test runner.

---

### Task 1: Owner-bind profile media

**Files:**
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/core.node-test.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `scripts/bootstrap-cloudbase.mjs`
- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`
- Modify: `docs/cloudbase-schema.md`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/pages/profile-edit/index.ts`
- Modify: `tests/cloud-repository.test.ts`
- Modify: `tests/profile-edit-avatar.test.ts`

- [ ] Add RED tests proving another user’s `cloud://` ID is rejected and legacy unowned media is not card-visible.
- [ ] Add RED tests for an authenticated `mediaUploadPath` action and client call before `cloud.uploadFile`.
- [ ] Derive an opaque owner alias from the trusted OPENID and server secret; return `profiles/<alias>/<uuid>.jpg` only.
- [ ] Add `profile_media` with deny-by-default client rules and an owner/status index. After upload, call `registerMedia` to persist `{file_id, owner_openid, category, status, created_at}` under a deterministic file hash ID.
- [ ] Validate every photo/avatar against an active media record whose `owner_openid` matches WXContext. Keep stored legacy IDs untouched but exclude them from card media.
- [ ] On `registerMedia` failure, do not append the image to profile data and best-effort delete the just-uploaded file.
- [ ] Run profile and client focused tests, then commit `fix(profile): bind uploaded media to owners`.

### Task 2: Build the single personal-card response

**Files:**
- Create: `cloudfunctions/profile/capability-card.js`
- Create: `cloudfunctions/profile/capability-card.node-test.js`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile/package.json`
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `tests/cloud-repository.test.ts`

- [ ] Add RED tests for WXContext-only identity, state derivation, null preservation, and the exact allowlist.
- [ ] Add RED tests that whole-call/per-file temporary URL failures return fewer/no backgrounds rather than an error.
- [ ] Query the current profile, canonical credential, and canonical snapshot in one server action.
- [ ] Resolve only owner-bound media to HTTPS temporary URLs and return no raw IDs.
- [ ] Return the exact `state/generated_at/profile/backgrounds/summary/coverage/synced_at` contract.
- [ ] Add a strict repository mapper and reject malformed state, raw IDs, non-HTTPS URLs, and numeric strings.
- [ ] Run focused tests, typecheck, and package verification; commit `feat(profile): expose personal rider card`.

### Task 3: Build the card view model and page

**Files:**
- Create: `miniprogram/utils/personal-card.ts`
- Create: `tests/personal-card.test.ts`
- Create: `miniprogram/pages/capability-card/index.ts`
- Create: `miniprogram/pages/capability-card/index.json`
- Create: `miniprogram/pages/capability-card/index.wxml`
- Create: `miniprogram/pages/capability-card/index.wxss`
- Create: `tests/personal-card-page.test.ts`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/profile/index.wxml`
- Modify: `miniprogram/pages/profile/index.wxss`

- [ ] Add RED view-model tests for real zero, null omission, partial coverage, no photo, one photo, and multi-photo ordering.
- [ ] Add RED page tests for one repository call, Strava/profile repair navigation, and absence of public sharing hooks.
- [ ] Build an alpine editorial 3:4 hero with native swiper, dark gradient text-safe area, and compact dark metric sheet.
- [ ] Render only metrics present in the view model. Show coverage/sync time and the self-only label.
- [ ] Add profile-page entry and register the page.
- [ ] Run focused tests, typecheck, lint, and format; commit `feat(miniprogram): add personal rider card`.

### Task 4: Integrate and verify

**Files:**
- Modify: `README.md`
- Modify: `docs/requirements-design.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `docs/verification/p0-real-registration-journey.md`

- [ ] Regenerate deployable copies only through `npm run cloud:prepare` if canonical shared sources changed.
- [ ] Run `npm run validate`, `npm run coverage`, `npm run audit:all`, and `git diff --check main...HEAD`.
- [ ] Independently review privacy, owner binding, temporary URL fallback, null semantics, and no-share boundary.
- [ ] Integrate to main only after review; do not deploy CloudBase without explicit remote-environment authorization.
