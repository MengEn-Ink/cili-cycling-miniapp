# Task 2 Public Disclosure Consent/Withdrawal Report

Status: **IN_PROGRESS**. Local implementation only; controller independent review and operational acceptance remain unverified. No delivery-complete claim.

## Review Base

- `REVIEW_BASE`: `767521e32f0de99c8d277be93a984731dbd14e37`
- Branch/worktree: `feat/launch-compliance-20261021`, `/tmp/cili-compliance-20261021`.
- Rebase: `git rebase origin/main`, exit 0, no conflicts.
- Target: `origin/main` `2251479d5a7b3184d59ea833c9130ac077871252` (PR #332).
- Previous HEAD: `444de19f85407078dd9d0cb9195c3c9b83034922`; prior Task 1 commit IDs were rewritten. Task 1 local scoped review I1-I4 ADDRESSED, zero new Important findings; operational acceptance still unverified.
- Shared sources are authoritative; regenerated copies must match.

## Execution Checklist

- [x] Read Task 2 brief/context, AGENTS/high-priority issues, applicable skills and relevant memory.
- [x] Verify clean local branch and rebase onto requested origin/main.
- [x] Record actual rewritten HEAD before Task 2 implementation.
- [x] Run relevant rebase integration tests: deletion guard, public/approval signup, promoted waiting.
- [x] Add initial behavioral tests and observe RED for independent consent, binding invalidation, withdrawal, public projection/URL/card, private-photo save and driver attestation.
- [x] Implement minimal backend contract and regenerate shared copies.
- [x] Run focused GREEN iterations, affected package suites and cross-end contract tests.
- [x] Self-review scope, privacy fail-closed behavior, generation/runtime guards and generated parity.
- [x] Update high-priority issues with Task 1 local-review ruling and Task 2 unverified acceptance.
- [x] Make one local Task 2 commit; no push.

## Approved Scope And Method

Apply the existing approved design without another approval or subagents. TDD applies to behavioral changes. Profile consent uses separate explicit default-false nickname/media choices, policy/version/current-value bindings, and Task 1 transactional generation/deletion fencing. All public media and participant projections use current consent; self/admin access stays private. Optional private photos cannot block signup. Driver confirmation is organizer attestation of consent obtained, bound to actual public fields/activity version, never a driver signature.

No TypeScript models/repositories/UI changes (Task 5). No browser, production credentials, deploy/apply, real data changes, push, or root workspace WIP changes.

## Rebase Verification

`node --test cloudfunctions/shared/privacy.node-test.js cloudfunctions/profile/privacy.node-test.js cloudfunctions/registration/registration-experience.node-test.js cloudfunctions/registration/domain.node-test.js cloudfunctions/activity-admin/activity-admin.node-test.js`

Exit 0: **103 tests, 103 passed, 0 failed/skipped**. Covers Task 1 durable deletion/upload/recreation fencing and fail-closed snapshot lookup, open ordinary-member automatic approval, approval/legacy pending behavior, open/admin FIFO waiting promotion, and PR #332 event-day deadline/activity saves. Rebase had no source conflicts and required no manual resolution. No unrelated map/UI edits and no full validation claimed.

## RED/GREEN Evidence

Initial RED, before implementation:

1. `node --test cloudfunctions/profile/public-consent.node-test.js cloudfunctions/activity-admin/driver-consent.node-test.js`
   Exit 1: **11 tests, 0 passed, 11 failed**. Missing consent/driver-version APIs are explicit assertions, not module errors. Existing behavior signs unconsented avatars, selects public automatically, accepts ordinary-save public opt-in, publishes drivers without attestation and exposes legacy driver fields.
2. `node --test --test-name-pattern='current consent controls|club response cannot' cloudfunctions/activity-read/index.node-test.js cloudfunctions/club-application/media.node-test.js`
   Exit 1: **2 tests, 0 passed, 2 failed**. Unconsented publisher leaks current nickname; club response signs a personal canonical avatar from a stale snapshot.

Focused GREEN:

1. Initial RED commands above rerun after implementation: **11/11** and **2/2** passed, exit 0.
2. Supplemental RED: `node --test --test-name-pattern='media consent binds|withdrawal needs|management DTO exposes|review carries|modern canonical' cloudfunctions/profile/public-consent.node-test.js cloudfunctions/activity-admin/driver-consent.node-test.js cloudfunctions/activity-read/public-avatar.node-test.js`
   Exit 1: **5 tests, 2 passed, 3 failed**. Found missing legacy-photo binding, category crossover and missing management binding DTO; withdrawal validation and review carry-forward already passed.
3. Canonical-reference RED: `node --test --test-name-pattern='current canonical|previous generation registry' cloudfunctions/activity-read/index.node-test.js cloudfunctions/activity-read/public-avatar.node-test.js cloudfunctions/profile/public-consent.node-test.js`
   Exit 1: **3 tests, 1 passed, 2 failed** on canonical reference lookup. The generation test initially passed because its fixture omitted `canonical_category`; corrected the fixture, then ran `node --test --test-name-pattern='previous generation registry' cloudfunctions/profile/public-consent.node-test.js`, exit 1: **1 failed**, attempted old-generation signing. No implementation change between these fixture corrections.
4. Generation/revision RED: `node --test --test-name-pattern='explicit consent requires generation|disclosure revisions' cloudfunctions/profile/public-consent.node-test.js`
   Exit 1: **2 failed** on omitted first-generation confirmation and revision overflow.
5. After fixes: `node --test cloudfunctions/profile/public-consent.node-test.js cloudfunctions/activity-admin/driver-consent.node-test.js cloudfunctions/activity-read/public-avatar.node-test.js cloudfunctions/profile/capability-card.node-test.js`
   Exit 0: **27 passed, 0 failed/skipped**.
6. `node --test cloudfunctions/activity-read/index.node-test.js cloudfunctions/activity-admin/activity-admin.node-test.js cloudfunctions/shared/domain.node-test.js`
   Exit 0: **132 passed, 0 failed/skipped**.
7. Runtime/no-photo/GREEN: `node --test cloudfunctions/profile/public-consent.node-test.js cloudfunctions/profile/index.node-test.js cloudfunctions/activity-admin/driver-consent.node-test.js cloudfunctions/registration/registration-experience.node-test.js`
   Exit 0: **41 passed, 0 failed/skipped**. Expected rejection logs only the bounded `DRIVER_CONSENT_REQUIRED` code. Both open and approval ordinary-member flows retain self/admin private nickname access with no background/legacy photos and explicit false disclosure.

Iteration package command `node --test cloudfunctions/profile/*.node-test.js cloudfunctions/shared/*.node-test.js cloudfunctions/activity-read/*.node-test.js cloudfunctions/activity-admin/*.node-test.js cloudfunctions/club-application/*.node-test.js` initially returned **372 tests, 341 passed, 31 failed** on obsolete public defaults/photo-required assertions. Updated synthetic fixtures with explicit evidence, never grandfathered production consent. A second iteration had 7 fixture failures (legacy version normalization/raw driver fields and one missed list fixture), subsequently fixed and covered by focused GREEN and the final affected-package run.

Self-review regressions:

1. `node --test --test-name-pattern='club response rejects legacy' cloudfunctions/club-application/media.node-test.js`
   RED exit 1: **1 failed**; the filter signed legacy personal `profiles/<alias>/...` uploads. GREEN exit 0: **1 passed** after changing only the shared source and regenerating copies. Personal source paths, encoded HTTPS paths and output file-ID aliases are rejected; nonpersonal club media is preserved.
2. `node --test --test-name-pattern='duplicate or capped canonical' cloudfunctions/activity-read/index.node-test.js`
   Initial fixture passed because detail publisher and attendee lookups ran separately, not as a capped batch. Corrected it to a two-publisher list batch without implementation changes. RED exit 1: **1 failed**, signed a canonical reference whose duplicate lay beyond the 100-record query cap. GREEN exit 0: **1 passed** after failing closed for the capped batch; duplicate uncapped results already fail closed.
3. `node --test --test-name-pattern='public card consumes' cloudfunctions/profile/capability-card.node-test.js`
   Additional verification, no production change: exit 0, **1 passed**. Nickname-only choice issues no media URL; media-only choice signs a valid current image but uses anonymous name and empty gender.

## Final Local Verification

All commands executed in `/tmp/cili-compliance-20261021`, after scoped formatting and shared regeneration. Output and process-exit metadata were checked; all processes exited.

| Check | Result |
| --- | --- |
| Affected Node packages, command below | Exit 0; **528 passed, 0 failed/skipped** |
| Existing cross-end contracts/flows, command below | Exit 0; **9 files, 471 passed, 0 failed/skipped** |
| `npm run verify:cloud-packages` | Exit 0; self-contained packages, registry dependencies and shared-copy parity pass |
| Scoped ESLint across the nine affected packages and two changed scripts | Exit 0 |
| Scoped Prettier check on all 29 edited source/test/script files | Exit 0 |
| `git diff --check` | Exit 0 |

Affected packages:

```sh
node --test cloudfunctions/profile/*.node-test.js cloudfunctions/shared/*.node-test.js cloudfunctions/activity-read/*.node-test.js cloudfunctions/activity-admin/*.node-test.js cloudfunctions/club-application/*.node-test.js cloudfunctions/registration/*.node-test.js cloudfunctions/admin-review/*.node-test.js cloudfunctions/privacy-maintenance/*.node-test.js cloudfunctions/profile-media-cleanup/*.node-test.js
```

Cross-end contracts/flows:

```sh
npm test -- tests/domain.test.ts tests/cloud-repository.test.ts tests/registration-experience.test.ts tests/activity-admin-edit.test.ts tests/activity-media-location-repository.test.ts tests/profile-edit-avatar.test.ts tests/profile-page.test.ts tests/club-foundation-m0-contract.test.ts tests/registration-form-readiness-lifecycle.test.ts
```

Static scope:

```sh
./node_modules/.bin/eslint cloudfunctions/activity-admin cloudfunctions/activity-read cloudfunctions/admin-review cloudfunctions/club-application cloudfunctions/privacy-maintenance cloudfunctions/profile-media-cleanup cloudfunctions/profile cloudfunctions/registration cloudfunctions/shared scripts/prepare-cloudfunctions.mjs scripts/verify-cloud-packages.mjs
```

These existing client contracts passing do not implement or accept Task 5 consent/generation UX. No full `validate`, full coverage percentage, UI/screenshot gate, browser run, deployment, storage revocation or real-device acceptance is claimed.

## Backend DTO/Action Contract

Implemented contract:

- `profile/publicConsentStatus`: trusted caller only; default false per independent nickname/media choice; return current generation, policy version and opaque current-value versions, never plaintext bindings or internal evidence.
- `profile/setPublicConsent`: required `generation`, `policyVersion` plus one or both `nickname`/`media` `{ consented, version }` choices. A true choice must bind the current version; false withdrawal need not supply a version. Strict field allowlists, boolean validation and atomic update. Transaction reads current profile, obeys deletion/generation locks and refuses missing-profile resurrection.
- Ordinary saves cannot set consent; nickname/background changes bump independent revisions, avatar selection remains private and bumps avatar revision. Public nickname defaults to `匿名骑友`; media/card/publisher/attendee readers consume the same shared current consent fact.
- Media binding covers current avatar/source/revision, background, all legacy photos and media revision; generation changes invalidate consent. Canonical source and canonical reference paths retain registry ID/source/owner/category/origin/status/hash/size/MIME/path/generation checks. Duplicate or capped canonical-reference queries fail closed. Club snapshot personal canonical and legacy source paths cannot bypass consent. Previously signed URLs are not retroactively revoked by these server projections.
- `activity-admin/save` top-level `driverConsent`: `{ confirmed: true, policyVersion, activityVersion, fieldsVersion }`. Version matches expected current activity version; fieldsVersion binds normalized nickname/license_plate/contact_phone. Server generates internal `driver_public_attestation` record bound to activity ID, exact fields and version; record is organizer attestation, not driver signature. Unchanged fields can carry the verified record forward to the next activity version. Changed fields require reconfirmation before publish; review cannot bypass it. Public shared activity DTO suppresses unsupported legacy driver fields, while authorized management retains private field access.
- Authorized activity-management DTO includes `driver_consent_status: { policyVersion, activityVersion, fieldsVersion, attested }`, not internal actor/evidence/record IDs. Task 5 can first save draft normalized fields, read current binding, then explicitly confirm publish; editing published driver fields needs fresh confirmation or unpublish/draft flow. This task does not add a new frontend flow.

## Commits

- Task 2 local commit: the single commit containing this report, subject `feat(privacy): 补齐公开同意与撤回`, with parent `767521e32f0de99c8d277be93a984731dbd14e37`. Final report/priority-state notes are folded into that same local commit, not a second implementation commit.
- Its exact final SHA is supplied in the controller handoff rather than embedded in its own commit content. No push. Local implementation committed; delivery/operational acceptance remains **IN_PROGRESS**.

## Self-Review And Concerns

Scoped local self-review used the `bits-code-guard` serial fallback, without subagents or remote custom workflow lookup. Three groups plus cross-group checks covered 40 source/test/script files (including generated copies), all seven general dimensions and JavaScript async/DTO/auth rules: profile writes/cards, public projections/media, driver authority/packaging. Scope starts at `REVIEW_BASE`, including new files, not earlier Task 1 commits. The legacy-personal-source bypass and capped-registry uniqueness gap were fixed with observed RED/GREEN tests. No remaining confirmed P0-P2 finding was identified in this self-review; this is not controller independent review.

Private local review artifacts: `/tmp/cili-task2-review-20261021/review_groups.md`, `final_comments.json`, `report.md`, `report.html`. No browser opened, no raw test-output or real-data evidence committed.

Outstanding acceptance/coordination concerns:

- Independent controller review and deployment are unverified. Task 2 remains **IN_PROGRESS**, not delivery-complete.
- Withdrawal blocks new public projections and signing, not URLs already issued or cards/images already downloaded. Target-environment signed-URL expiry/revocation and cache behavior require separate operational acceptance.
- Client consent/withdrawal UX and DTO/generation integration belong to Task 5. Existing client ordinary-save public opt-in is intentionally rejected; passing legacy client tests is not consent UX acceptance.
- Legacy unconsented names/images and un-attested driver fields are deliberately suppressed, not grandfathered. Driver attestation is an organizer assertion, not driver signature or proof of external consent; exact fields/policy/activity version must be reconfirmed through Task 5.
- Target cloud configuration/ACL/index/readback, ordinary-member full write chain, storage old-address checks and iOS/Android physical devices are unverified. Open/approval signup and FIFO waiting promotion pass local regressions only.
- Content-safety moderation belongs to Task 4; no invented passing status for legacy assets.

## Fix Round 1/5: Important I1

Status: **Local fix implemented and verified; controller scoped rereview pending. Task 2 remains IN_PROGRESS.** This round addresses only I1 from `task-2-review.md`; it is not independent review approval or launch/operational acceptance.

### Base And Scope

- `FIX_BASE`: `aee03ee575f1cc830e35adc709936b99f26c0471`, verified as the clean starting HEAD.
- Worktree/branch: `/tmp/cili-compliance-20261021`, `feat/launch-compliance-20261021`.
- Requirements read in order: AGENTS/high-priority issues, `task-2-brief.md`, `task-2-context.md`, existing report, then `task-2-review.md`.
- Only amended production source: `cloudfunctions/activity-read/index.js`. Only amended test file: `cloudfunctions/activity-read/index.node-test.js`. Documentation: this appended report and Task 2 status in `docs/high-priority-issues.md`.
- No shared-source, public-avatar, activity-admin, profile, club, client, dependency or packaging-source edits. No root workspace WIP changes, subagents, self-dispatched reviewer, browser, deployment, credential-based verification, real-user data, push or model override. Execution used the inherited default model.

### Defect Analysis And Implementation

I1's retained-data trigger remains relevant: unchanged activity images/cover can pass the existing ownership validator. The public projection must therefore enforce disclosure independently of the writer or future Task 4 moderation.

The common actual runtime resolver now applies a purpose-aware guard to cover/images (`activity-image`), group QR (`activity-group-qr`) and generated/URL route previews (`activity-route-preview`). It parses URL paths, decodes encoded aliases, suppresses personal avatar/background, legacy personal `profiles/<alias>/...` and old untyped canonical references, and rejects recognized canonical/source category crossovers. Suppression is unconditional in these activity slots, including where personal consent might otherwise exist; those slots do not establish current owner/generation/registry-bound disclosure authorization.

Projection happens **before** cloud file-ID collection/signing, including the no-file-IDs early return. URL/file-ID fallback and resolved activity media are guarded again. Suppressed images are removed rather than left as raw personal aliases; suppressed scalar references become empty strings. Existing club filtering is retained, not used as a blanket activity-purpose allowlist. Legitimate purpose-bound activity media and existing nonpersonal legacy fallbacks remain usable. Authorized private preview implementations were not changed.

### Covering Tests And RED/GREEN

`cloudfunctions/activity-read/index.node-test.js` invokes the actual `index.main` with the existing in-memory database/synthetic SDK boundary. Added six top-level tests, including 27 independently executed state/signing subtests: **33 Node-reported tests, 30 leaf scenarios**. The only harness addition is `command.neq` for actual history `listPage` queries.

Covered actions: `detail`, history `list`, and history `listPage`, all using the same production media resolver. Each action tests missing owner, existing owner without consent, and consent explicitly granted then withdrawn through the actual `createPrivacyService` persistence transaction. Cover references exercise modern personal canonical, old untyped canonical, and legacy personal source values. Images additionally cover background, ride/bike/other sources, modern upload sources, standalone avatar paths and encoded HTTPS aliases.

For every state, successful signing, empty signing response and thrown signing failure are tested. Separate no-signing raw-HTTPS cases cover the early return, purpose crossovers and personal route/QR aliases.

Focused command, with a 120-second outer timeout:

```sh
perl -e 'alarm shift; exec @ARGV' 120 node --test --test-name-pattern='retained personal activity media|activity media purposes' cloudfunctions/activity-read/index.node-test.js
```

1. Initial RED before production edits: exit 1, **6 failed, 0 passed**. Personal aliases entered actual signing requests; raw output retained personal/mismatched-purpose media.
2. Refined RED, still before any production edit: split the state/signing loop into independent subtests and added a standalone-avatar alias. Same command: exit 1, **33 failed, 0 passed/skipped**. Missing-owner, no-consent and withdrawn cases independently failed on personal IDs entering signing; the three raw-URL cases failed on unsafe returned images. Failures were assertions, not import/harness errors. No expectation was weakened.
3. GREEN after the guard: same command, exit 0, **33 passed, 0 failed/skipped**. All state transitions and signing modes ran. Formatting afterward made no semantic change.

Actual safe results asserted for all three actions:

| State/output | Observed safe result |
| --- | --- |
| Missing owner, no consent, or persisted withdrawal | `cover_image = ''`; personal canonical/source/encoded aliases absent from DTO and signing requests |
| Successful mixed-media signing | Signing request is exactly `[activity-group-qr, activity-route-preview, activity-image]`; images contain only the legitimate signed activity image |
| Empty/throwing signer | Only legitimate activity file IDs survive fallback; no personal raw ID or URL returns |
| Legitimate purpose controls | Group QR remains signed/readable; route preview retains its legitimate file ID and signed URL; legitimate HTTPS activity cover remains readable |
| No cloud IDs/raw HTTPS | No signing call; personal media and recognized cross-purpose images disappear before the early return; personal QR/route aliases are empty |

### Final Local Verification

After focused GREEN, the five Task 2 backend package suites and relevant existing cross-end contracts were each run once. No shared source changed, so `cloud:prepare` was not needed or run; shared/package parity was verified directly.

```sh
perl -e 'alarm shift; exec @ARGV' 300 node --test cloudfunctions/activity-read/*.node-test.js cloudfunctions/profile/*.node-test.js cloudfunctions/shared/*.node-test.js cloudfunctions/activity-admin/*.node-test.js cloudfunctions/club-application/*.node-test.js
```

Exit 0: **420 passed, 0 failed/cancelled/skipped**. This includes all activity-read runtime/public-avatar/smoke/list-page tests and existing profile consent/private/card, shared privacy/domain, driver/activity-admin and club media tests. Existing negative tests emit bounded `DRIVER_CONSENT_REQUIRED` and synthetic `resolve media failed temporary failure` messages; these are expected, not new runtime PII logging.

```sh
perl -e 'alarm shift; exec @ARGV' 300 npm test -- tests/cloud-repository.test.ts tests/activity-media-location-repository.test.ts tests/domain.test.ts
```

Exit 0: **3 files, 273 passed, 0 failed/skipped**. No client files were edited; these existing contracts do not accept Task 5 UX.

| Scoped check | Command/result |
| --- | --- |
| Self-contained packages and shared parity | `npm run verify:cloud-packages`: exit 0 |
| Static analysis | `./node_modules/.bin/eslint cloudfunctions/activity-read/index.js cloudfunctions/activity-read/index.node-test.js`: exit 0 |
| Format | `./node_modules/.bin/prettier --check cloudfunctions/activity-read/index.js cloudfunctions/activity-read/index.node-test.js docs/high-priority-issues.md .superpowers/sdd/2026-10-21-launch-compliance/task-2-report.md`: exit 0 |
| Whitespace/scope | `git diff --check`, explicit four-file staging and staged diff check: exit 0 |

Test workflow: preparation/context/scope/defect mapping completed before generation; generation -> assertion RED -> confirmed I1 -> TDD implementation -> GREEN -> final covering verification completed serially without subagents. Test tooling preparation and `utree flush --repo-path /tmp/cili-compliance-20261021` exited 0 under an empty environment/isolated temporary HOME. Coverage-percentage collection was skipped: this single-source fix requested covering regressions, not a CI coverage-percentage target. No full `validate`, UI gates, physical device, storage revocation or deployed behavior is claimed.

### Commit And Remaining Boundaries

One local fix commit contains the two activity-read files, this report append and the high-priority status update. Subject: `fix(privacy): 阻断活动媒体绕过公开同意`; parent: `aee03ee575f1cc830e35adc709936b99f26c0471`. As with the original Task 2 report, its exact final SHA is supplied in the controller handoff rather than embedded recursively in its own content. No push.

Controller performs the next scoped rereview against `FIX_BASE`; no reviewer was dispatched by this round. I1 is locally fixed/tested, not independently ruled addressed yet.

- CV1/CV2: Task 5 client consent/withdrawal/export and driver-confirmation consumers remain separate and unverified.
- CV3: Task 4 moderation remains separate and unimplemented here; active media or disclosure guards are not moderation approval.
- CV4/CV5: Target package/config/ACL/index/readback, issued-URL expiry/revocation/cache/concurrent-signing behavior, ordinary-member full write chain, storage checks and iOS/Android physical-device acceptance remain separate and unverified.
- This fix prevents new activity-slot disclosure of recognizable personal aliases. It neither retroactively revokes already issued opaque URLs/downloads nor proves their storage/cache revocation.
