# UI Revamp Route Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans and superpowers:test-driven-development for each slice. Steps use checkbox (`- [ ]`) syntax for tracking. Only one route-family writer is active at a time.

**Goal:** Apply the approved global B content-first language to all 17 routes through five independently testable/revertible PRs, with B+C on detail and B+A on management/forms, then upload and verify each slice without mixing product-performance work.

**Architecture:** Shared V1 component tokens and small presentational primitives land with the first route slice after PR B/PR C. Each following slice changes only its route family and its explicit tests, while the 17-route harness guards global navigation. Data models, permissions, privacy, CloudBase behavior, route count, and business copy remain unchanged except the approved slogan relocation and CTA preservation.

**Tech Stack:** Native WeChat Mini Program WXML/WXSS/TypeScript, existing Vitest/Node tests, `check:design`, strict UI sync, WeChat DevTools real-cloud-readonly harness, Task 0 visual environment, miniprogram-ci/GitHub Actions.

---

## Preconditions and shared invariants

- PR B and PR C are merged on main; `e2e/visual-environment.json` is independently approved.
- Every slice starts from latest main in a clean dedicated worktree and owns only its route family plus shared components explicitly listed for that slice.
- Each slice begins with behavior/visual contract RED tests, then minimal WXML/WXSS changes, then 17-route comparison.
- No new fields, fake avatars, fake statistics, remote fonts, CloudBase writes, or performance claims.
- Hit areas ≥44px, adjacent hit areas ≥8px, 340/375/430 widths, light text contrast, image loaded/loading/absent/error states, iOS safe area, Android font fallback.
- The current CTA remains `查看活动`; `每一次转弯，都有值得记住的风景。` moves only to the past-images empty/description surface.
- Stable performance measurement is a separate later line. First-card eager is verified for media strategy but not labeled a performance win.

## Shared evidence loop for every slice

- [ ] Record start HEAD/porcelain, approved Task 0 manifest hash, DevTools/SDK/device, account role, content summary, and PII redaction plan.
- [ ] Run targeted RED, targeted GREEN, `test:design`, `check:design`, route tests, strict UI sync, three widths with `OUT_DIR=/tmp/<slice>-phase3`, full validate/coverage/audit, and end HEAD/porcelain.
- [ ] Run all 17 registered routes. Changed routes get Task 0 before/after screenshots and state captures; unchanged routes get current runtime reachability plus `NO_VISUAL_CHANGE_EXPECTED`.
- [ ] Store original PII screenshots privately; public evidence masks names, phone numbers, OpenIDs, cloud identifiers, and recognizable avatars.
- [ ] Judge performs read-only diff/test/screenshot review before PR. PR/main CI, development upload receipt, experience selection, and physical UAT remain separate status transitions.

## Slice D: Activities home and shared activity card

**Files:**

- Modify: `miniprogram/pages/activities/index.wxml`, `index.wxss`, and only necessary presentation fields in `index.ts`.
- Modify: `miniprogram/components/activity-card/index.wxml`, `index.wxss`, component properties/tests.
- Modify: existing activities/activity-card Vitest files; add a dedicated V1 contract test if no single current test owns the behavior.

- [ ] RED-test that the first visible card receives `lazy-load="{{false}}"` while later cards remain lazy; no business-order change.
- [ ] RED-test compact masthead, underline tabs, `共 N 场` from existing array length, menu-button inset, 4:3 media, two-line title, three-column metrics, and 44px round arrow.
- [ ] RED-test four media states without a blank container and ensure no fake avatar/field appears.
- [ ] Replace the tall manifesto header with the compact B masthead; relocate the approved slogan to past-images empty/description state.
- [ ] Keep CTA text `查看活动` and existing detail route. Card tap/arrow share the existing navigation handler.
- [ ] Introduce V1 target scrim component tokens only in this slice, after bright `lakeside.jpg` contrast evidence; do not change unrelated route tokens.
- [ ] Capture recent/past, multiple activities, empty, loading, absent image, failed image, long mixed-language title, and bright photo states.
- [ ] Commit implementation and evidence separately; merge/upload/UAT using the shared loop.

## Slice E: Activity detail and route analysis

**Files:**

- Modify: `miniprogram/pages/activity-detail/index.wxml`, `index.wxss`, presentation-only state/tests.
- Modify: `miniprogram/pages/route-analysis/index.wxml`, `index.wxss`, presentation-only state/tests.
- Modify: attendee-card/dialog tests and detail summary/full-source tests.

- [ ] RED-test 4:3 edge-to-edge hero, 40rpx lower radius, 24rpx sheet gutter, 32rpx sheet radius/padding, and 48rpx overlap.
- [ ] RED-test that summary/sheet renders before hero decode and before complete-source promise settles; existing route/attendee/full-copy data arrives later without clearing summary.
- [ ] RED-test loaded/loading/absent/error hero states, long two-line title, safe-area CTA, and 44px round controls.
- [ ] Keep attendee modal as the true other-rider card surface; verify owner/admin full identity vs other-rider nickname privacy without adding fields.
- [ ] Route analysis puts map and existing headline metrics immediately after compact masthead; map failure still exposes route facts.
- [ ] Capture `03-detail-attendee-card`, summary-only, full-source, no-image/error, route map success/failure, long waypoint, and Android serif fallback.
- [ ] Merge/upload/UAT through the shared loop; no cloud response optimization in this slice.

## Slice F: Profile, legacy capability redirect, settings, and club center

**Files:**

- Modify: `miniprogram/pages/profile/index.wxml`, `index.wxss`.
- Modify: `miniprogram/pages/capability-card/index.wxml`, `index.wxss` only for fallback; preserve redirect TypeScript behavior.
- Modify: `miniprogram/pages/settings/index.wxml`, `index.wxss`.
- Modify: `miniprogram/pages/club/center/index.wxml`, `index.wxss`.
- Modify: existing profile/settings/club/capability redirect tests.

- [ ] RED-test profile compact identity masthead, hero/media four states, -32rpx permission-card overlap, avatar/name baseline, and 44px round menu affordances.
- [ ] Keep capability-card success as `switchTab('/pages/profile/index')`; screenshot evidence records `REDIRECT_SURFACE`. Its injected failure state uses B error typography and ≥44px retry, with no invented card UI.
- [ ] Settings uses compact masthead, light section dividers, round direction affordances, natural long-copy wrapping, and no forced photography.
- [ ] Club center uses existing cover/identity/statistics only; ordinary members never receive admin actions.
- [ ] Capture self/admin/other privacy where the real surfaces exist, 100%/incomplete profile, missing/failed media, redirect success/failure, settings member/admin, and club long-name/no-cover.
- [ ] Merge/upload/UAT through the shared loop.

## Slice G: Registration form, journeys, and credential

**Files:**

- Modify: `miniprogram/pages/registration-form/index.wxml`, `index.wxss`.
- Modify: `miniprogram/pages/registrations/index.wxml`, `index.wxss`.
- Modify: `miniprogram/pages/credential/index.wxml`, `index.wxss`.
- Modify: existing form/journey/credential tests.

- [ ] RED-test compact mastheads, first-content visibility, light section grouping, permanent labels, natural errors, keyboard/safe-area behavior, and ≥44px controls.
- [ ] Journeys keep real pending/approved/waitlist/cancelled states and next actions; long titles cannot push status off-screen.
- [ ] Credential keeps QR integrity, current share semantics, and personal-information policy. No image-save/barcode feature is added.
- [ ] Capture empty/filled/error, public/review/waitlist, cancel/reapply, valid/invalid credential, QR decode, long title, and ordinary-member privacy.
- [ ] Merge/upload/UAT through the shared loop.

## Slice H: Profile edit and all six admin routes

**Files:**

- Modify: `miniprogram/pages/profile-edit/index.wxml`, `index.wxss`.
- Modify: all six `miniprogram/pages/admin/**/index.wxml` and `index.wxss`; TypeScript only for presentation-derived fields.
- Modify: existing profile-edit/admin/club single-mode tests.

- [ ] RED-test B compact masthead and light group language across all seven forms/admin surfaces, preserving A's safe single-column structure.
- [ ] Profile edit retains independent avatar save, 0/1 background, seven-field validation, upload lock, and no new introduction/ability fields.
- [ ] Activity edit retains 0–3 covers, public/review mode, deadline, Strava/GPX, QR, preview binding, and publish locks.
- [ ] Reviews keep 3×2 filters without shrinking typography; review detail keeps pending approve/reject and post-approval check-in rules.
- [ ] Single-club admin preserves empty-create, one-existing, and multiple-existing failure semantics; no application list or second club is reintroduced.
- [ ] Capture all form error/upload/locked states, six review filters, approve/reject/check-in, activity image four states, Strava/GPX degradation, and club cardinality states.
- [ ] Merge/upload/UAT through the shared loop.

## Final integrated release

- [ ] On a single latest main SHA, run full validate/coverage/audit, strict UI sync, Task 0-bound 17-route screenshots, real-cloud-readonly harness, development upload, experience selection, and iOS/Android physical UAT.
- [ ] UAT includes permissions, album, location, QR, Canvas, save/share, Strava/GPX, weak network, safe area, Android serif fallback, brightest-photo scrim, and ordinary-member write journey; missing human/device evidence stays PENDING.
- [ ] Compare page-open timing only under the separate performance protocol; do not credit UI work without segmented measurements.
- [ ] Update both linked P1 rows after each slice. Remove UI V1 only after every slice, main CI, receipt, experience verification, and physical UAT are complete. Governance V2 remains until its Ruleset/document/branch work also closes.

## Self-review

- [ ] Exactly 17 routes remain registered; capability-card stays a redirect.
- [ ] Every visible value comes from existing data; no fake avatar/statistic/module.
- [ ] All route families consume global B language; only detail adds C and forms/admin use A structure.
- [ ] Every slice is independently revertible and has its own tests/evidence/PR/receipt status.
- [ ] Task 0 baseline and 390 simulator functional evidence are never conflated.
- [ ] Product performance, card defect diagnosis, and CloudBase behavior remain outside visual slices.
