# Release Blockers and Capability Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `main@c50f145` release-safe by closing the reviewed activity, notification, CTA, form-lifecycle, Strava metadata, identity-document, and capability-card media defects.

**Architecture:** Keep CloudBase and the existing repository/service boundaries. Put reusable decisions in pure domain functions, keep external notification delivery behind a fenced outbox state machine, and resolve private cloud media only after server-side authorization. The activity lifecycle expansion to `registration_closed/formed/in_progress/cancelled` remains a separate follow-up after these blockers are green.

**Tech Stack:** WeChat Mini Program, TypeScript, WXML/WXSS, Node.js Cloud Functions, CloudBase transactions, Vitest, Node test runner.

---

## File map

- Activity read policy: `cloudfunctions/activity-read/index.js`, new `cloudfunctions/activity-read/policy.js`, tests beside the function.
- Activity round-trip: `cloudfunctions/activity-admin/domain.js`, `miniprogram/models/index.ts`, `miniprogram/repositories/types.ts`, `miniprogram/repositories/cloud.ts`, admin editor and focused tests.
- Notification state machine: `cloudfunctions/notification-send/core.js`, new `store.js`, `index.js`, tests, package and deployment-package checks.
- Subscription permission: notification function config action, repository contract, registration page, WeChat typings, tests and deployment docs.
- CTA and page lifecycle: `miniprogram/utils/activity.ts`, activity detail, credential, registration form, Strava view metadata, and focused page tests.
- Capability media: `cloudfunctions/admin-review/capability-card.js`, `index.js`, `miniprogram/utils/capability-card.ts`, review detail UI, and privacy tests.

### Task 1: Preserve activity access and nested fields

**Files:**
- Create: `cloudfunctions/activity-read/policy.js`
- Create: `cloudfunctions/activity-read/read.node-test.js`
- Modify: `cloudfunctions/activity-read/index.js`
- Modify: `cloudfunctions/activity-read/package.json`
- Modify: `cloudfunctions/activity-admin/domain.js`
- Modify: `cloudfunctions/activity-admin/activity-admin.node-test.js`
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.ts`
- Modify: `tests/cloud-repository.test.ts`
- Modify: `docs/cloudbase-schema.md`

- [ ] **Step 1: Add failing activity-read policy tests**

```js
assert.equal(canReadActivityDetail({ status: 'published', is_deleted: false }), true);
assert.equal(canReadActivityDetail({ status: 'finished', is_deleted: false }), true);
assert.equal(canReadActivityDetail({ status: 'draft', is_deleted: false }), false);
assert.equal(canReadActivityDetail({ status: 'finished', is_deleted: true }), false);
```

- [ ] **Step 2: Run the policy tests and observe RED**

Run: `node --test cloudfunctions/activity-read/read.node-test.js`

Expected: failure because `policy.js` or `canReadActivityDetail` does not exist.

- [ ] **Step 3: Add the minimal detail policy and keep list published-only**

```js
function canReadActivityDetail(activity) {
  return Boolean(
    activity &&
      activity.is_deleted !== true &&
      (activity.status === 'published' || activity.status === 'finished'),
  );
}
module.exports = { canReadActivityDetail };
```

- [ ] **Step 4: Add failing nested-field round-trip tests**

Use a fixture containing:

```js
schedule: [{ time: '08:00', title: '集合', location: '南门', remark: '停车场集合' }],
route: { start: 'A', end: 'B', distance_km: 80, elevation_m: 600, level: '进阶', gpx_file_id: 'cloud://route/a1.gpx' },
fee: { included: ['保险'], excluded: ['午餐'], remark: '现场结算' },
```

Assert both `validateActivityInput` and a client read-edit-save cycle preserve all four hidden values.

- [ ] **Step 5: Run focused tests and observe RED**

Run: `node --test cloudfunctions/activity-admin/activity-admin.node-test.js && npx vitest run tests/cloud-repository.test.ts`

Expected: nested-field assertions fail because current mapper/payload/validator drops them.

- [ ] **Step 6: Extend typed DTOs and validators without changing visible editor scope**

```ts
type ActivityScheduleItem = { time: string; title: string; location: string; remark?: string };
type ActivityRoute = {
  start: string;
  end: string;
  distanceKm: number;
  elevationM: number;
  level: string;
  gpxFileId?: string;
};
type ActivityFee = { included: string[]; excluded: string[]; remark: string };
```

Keep the current editor bound to `fee.remark`; carry the remaining fields in page data and payload unchanged.

- [ ] **Step 7: Run focused and full tests**

Run: `node --test cloudfunctions/activity-read/*.node-test.js cloudfunctions/activity-admin/*.node-test.js && npx vitest run tests/cloud-repository.test.ts && npm run typecheck`

Expected: all pass.

- [ ] **Step 8: Commit the activity fix**

```bash
git add cloudfunctions/activity-read cloudfunctions/activity-admin miniprogram/models/index.ts miniprogram/repositories/types.ts miniprogram/repositories/cloud.ts miniprogram/pages/admin/activity-edit/index.ts tests/cloud-repository.test.ts docs/cloudbase-schema.md
git commit -m "fix(activity): preserve history and nested fields"
```

### Task 2: Fence notification delivery and quarantine ambiguous outcomes

**Files:**
- Create: `cloudfunctions/notification-send/store.js`
- Create: `cloudfunctions/notification-send/store.node-test.js`
- Modify: `cloudfunctions/notification-send/core.js`
- Modify: `cloudfunctions/notification-send/core.node-test.js`
- Modify: `cloudfunctions/notification-send/index.js`
- Modify: `cloudfunctions/notification-send/outbox-worker.node-test.js`
- Modify: `cloudfunctions/notification-send/package.json`
- Modify: `scripts/verify-cloud-packages.mjs`
- Modify: `docs/cloudbase-schema.md`

- [ ] **Step 1: Add failing state-machine tests**

Cover these exact behaviors:

```js
// expired claimed may be reclaimed
assert.equal(await claimExpiredClaimed(), 'claimed');
// expired dispatching is quarantined and never sent again
assert.equal(await recoverExpiredDispatching(), 'delivery_unknown');
assert.equal(senderCalls, 1);
// stale worker cannot overwrite a newer lease
assert.equal(await markSent('o1', 'lease-a', 1), false);
assert.equal(await markFailed('o1', 'lease-a', 1, 'OLD'), false);
```

- [ ] **Step 2: Run tests and observe RED**

Run: `node --test cloudfunctions/notification-send/*.node-test.js`

Expected: failures show missing lease token checks and resend after ACK failure.

- [ ] **Step 3: Implement the explicit state machine**

Use these store boundaries:

```js
claim(id, { claimant, leaseId, now, maxAttempts, leaseMs });
beginDispatch(id, { leaseId, attemptNo, now });
markSent(id, { leaseId, attemptNo, now });
markRetryable(id, { leaseId, attemptNo, errorCode, now });
markDeliveryUnknown(id, { leaseId, attemptNo, errorCode, now });
```

Each method re-reads in a CloudBase transaction and compares status, `lease_id`, and `attempt_no`. `dispatching` is excluded from automatic ready queries. Recovery converts expired `dispatching` to `delivery_unknown` and never calls WeChat.

- [ ] **Step 4: Separate provider failure from ACK failure**

```js
await store.beginDispatch(outboxId, lease);
let result;
try {
  result = await sender.send(message);
} catch {
  await store.markDeliveryUnknown(outboxId, { ...lease, errorCode: 'SEND_RESULT_UNKNOWN', now });
  fail('DELIVERY_STATE_UNCERTAIN', '通知发送结果未知，请在小程序内查看审批状态');
}
if (providerExplicitlyRejected(result)) {
  await store.markRetryable(outboxId, { ...lease, errorCode: providerCode(result), now });
  fail('WECHAT_SEND_FAILED', '微信订阅消息发送失败');
}
await retryFencedAck(() => store.markSent(outboxId, { ...lease, now }));
```

The ACK retry never invokes `sender.send` again.

- [ ] **Step 5: Verify focused tests**

Run: `node --test cloudfunctions/notification-send/*.node-test.js && npm run verify:cloud-packages`

Expected: stale completions fail closed, ambiguous outcomes do not re-enter the send queue, and all package checks pass.

- [ ] **Step 6: Commit the notification fix**

```bash
git add cloudfunctions/notification-send scripts/verify-cloud-packages.mjs docs/cloudbase-schema.md
git commit -m "fix(notification): fence delivery attempts"
```

### Task 3: Request subscription permission from the registration gesture

**Files:**
- Modify: `cloudfunctions/notification-send/core.js`
- Modify: `cloudfunctions/notification-send/index.js`
- Modify: `cloudfunctions/notification-send/core.node-test.js`
- Modify: `cloudfunctions/notification-send/access.node-test.js`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/pages/registration-form/index.ts`
- Modify: `typings/wx.d.ts`
- Create: `tests/registration-subscription.test.ts`
- Modify: `README.md`
- Modify: `cloudfunctions/.env.example`

- [ ] **Step 1: Add failing server and client tests**

```ts
expect(callFunction).toHaveBeenCalledWith({
  name: 'notification-send',
  data: { action: 'subscription-config' },
});
expect(requestSubscribeMessage.mock.invocationCallOrder[0])
  .toBeLessThan(saveRegistration.mock.invocationCallOrder[0]);
```

Also assert invalid forms and duplicate submits never prompt, while reject/ban/API failure still submit.

- [ ] **Step 2: Run tests and observe RED**

Run: `node --test cloudfunctions/notification-send/*.node-test.js && npx vitest run tests/cloud-repository.test.ts tests/registration-subscription.test.ts`

- [ ] **Step 3: Add a narrow authenticated config endpoint**

```js
function subscriptionTemplateIds(env) {
  return ['REVIEW_APPROVED_TEMPLATE_ID', 'REVIEW_REJECTED_TEMPLATE_ID']
    .map((name) => String(env[name] || '').trim())
    .filter(Boolean);
}
```

`subscription-config` requires a trusted WXContext identity but no admin role and returns only `{ template_ids: string[] }`.

- [ ] **Step 4: Add the client adapter and tap-time request**

```ts
getReviewNotificationTemplateIds(): Promise<string[]>;
requestReviewNotificationSubscription(templateIds: string[]): Promise<void>;
```

Preload IDs in `onShow`. In `submit()`, validate first, call `wx.requestSubscribeMessage` directly from the tap flow, then submit regardless of accept/reject/ban/API failure.

- [ ] **Step 5: Verify and commit**

Run: `node --test cloudfunctions/notification-send/*.node-test.js && npx vitest run tests/cloud-repository.test.ts tests/registration-subscription.test.ts && npm run typecheck`

```bash
git add cloudfunctions/notification-send miniprogram/repositories miniprogram/pages/registration-form/index.ts typings/wx.d.ts tests README.md cloudfunctions/.env.example
git commit -m "feat(notification): request review subscriptions"
```

### Task 4: Centralize CTA decisions and cancel stale form actions

**Files:**
- Modify: `miniprogram/utils/activity.ts`
- Create: `tests/activity-cta.test.ts`
- Modify: `miniprogram/pages/activity-detail/index.ts`
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/pages/credential/index.ts`
- Modify: `miniprogram/pages/credential/index.wxml`
- Modify: `miniprogram/pages/registration-form/index.ts`
- Modify: `miniprogram/pages/registration-form/index.wxml`
- Modify: `tests/registration-form-readiness-lifecycle.test.ts`
- Create: `tests/registration-form-view-contract.test.ts`

- [ ] **Step 1: Add the failing nine-branch decision table**

```ts
expect(resolveActivityAction(open, pending, now).kind).toBe('view-registration');
expect(resolveActivityAction(open, rejected, now).kind).toBe('resubmit');
expect(resolveActivityAction(finished, rejected, now).kind).toBe('view-history');
expect(resolveActivityAction(full, undefined, now)).toMatchObject({ kind: 'closed', enabled: false });
expect(resolveActivityAction(deadlineReached, undefined, now).label).toBe('报名已截止');
expect(resolveActivityAction(finished, undefined, now).label).toBe('活动已结束');
```

- [ ] **Step 2: Run the focused tests and observe RED**

Run: `npx vitest run tests/activity-cta.test.ts tests/registration-form-readiness-lifecycle.test.ts tests/registration-form-view-contract.test.ts`

- [ ] **Step 3: Implement the pure action resolver and page guards**

```ts
export type ActivityAction =
  | { kind: 'view-registration' | 'resubmit' | 'view-history' | 'register'; label: string; enabled: true; registrationId?: string }
  | { kind: 'closed'; label: string; enabled: false };
```

Activity detail, credential retry, and registration submit use this single resolver. Fetch failure produces a disabled error state. `go()` and `retry()` check the action again before navigation.

- [ ] **Step 4: Make form controls controlled and submission cancellable**

Bind every radio `checked` expression to page data. Add `submitRequestId` and `pageVisible`; invalidate both on hide/unload. Disable profile, Strava, radio, textarea, and submit controls while submitting. Only the current visible generation may redirect.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/activity-cta.test.ts tests/registration-form-readiness-lifecycle.test.ts tests/registration-form-view-contract.test.ts && npm run typecheck`

```bash
git add miniprogram/utils/activity.ts miniprogram/pages/activity-detail miniprogram/pages/credential miniprogram/pages/registration-form tests
git commit -m "fix(miniprogram): enforce activity actions"
```

### Task 5: Resolve private media and finish capability-card contracts

**Files:**
- Modify: `cloudfunctions/admin-review/capability-card.js`
- Modify: `cloudfunctions/admin-review/capability-card.node-test.js`
- Modify: `cloudfunctions/admin-review/index.js`
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/utils/capability-card.ts`
- Modify: `miniprogram/pages/admin/review-detail/index.ts`
- Modify: `miniprogram/pages/admin/review-detail/index.wxml`
- Modify: `miniprogram/pages/admin/review-detail/index.wxss`
- Modify: `tests/capability-card.test.ts`
- Modify: `tests/cloud-repository.test.ts`
- Create: `tests/strava-view-contract.test.ts`

- [ ] **Step 1: Add failing privacy and rendering tests**

```js
assert.deepEqual(adminCapabilityMedia(profile), {
  file_ids: ['cloud://ride-1', 'cloud://ride-2', 'cloud://avatar'],
});
assert.equal(JSON.stringify(response).includes('cloud://'), false);
assert.equal(JSON.stringify(response).includes('id_number'), false);
```

Client tests require up to three `https://` temporary URLs, deduplication, riding-photo priority, avatar fallback, and no raw file ID rendering.

- [ ] **Step 2: Run focused tests and observe RED**

Run: `node --test cloudfunctions/admin-review/*.node-test.js && npx vitest run tests/capability-card.test.ts tests/cloud-repository.test.ts tests/strava-view-contract.test.ts`

- [ ] **Step 3: Resolve media after admin authorization**

The detail handler extracts allowlisted file IDs, calls `cloud.getTempFileURL({ fileList })`, rejects failed entries, and returns:

```js
capability_profile: {
  photos: [{ url: 'https://temporary.example/ride-1', category: 'ride', source: 'user' }],
  avatar_url: 'https://temporary.example/avatar',
}
```

Never return `file_id`, openid, token fields, identity-document fields, or unrecognized profile properties.

- [ ] **Step 4: Separate admin and social projections**

```js
adminCapabilityView(registration, profile, resolvedMedia);
socialCapabilityView(profile, resolvedMedia);
```

The admin view may include masked name, phone provenance, registration choices, and Strava metrics. The social view excludes real name, phone, emergency contact, remarks, identifiers, and audit data. Do not expose a public directory in this patch.

- [ ] **Step 5: Render scheme A and Strava metadata**

Use up to three temporary URLs in the swiper, a dark gradient, and a fixed text-safe region. Show exact coverage range, completeness text, and formatted sync time; no-data and incomplete states must be textual.

- [ ] **Step 6: Verify and commit**

Run: `node --test cloudfunctions/admin-review/*.node-test.js && npx vitest run tests/capability-card.test.ts tests/cloud-repository.test.ts tests/strava-readiness-service.test.ts tests/strava-view-contract.test.ts && npm run typecheck`

```bash
git add cloudfunctions/admin-review miniprogram/models/index.ts miniprogram/repositories/cloud.ts miniprogram/utils/capability-card.ts miniprogram/pages/admin/review-detail tests
git commit -m "fix(profile): serve safe capability media"
```

### Task 6: Integrate, validate, and hand off real-environment verification

**Files:**
- Modify: `README.md`
- Modify: `docs/requirements-design.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `docs/verification/p0-real-registration-journey.md`
- Modify generated deployment copies only through `npm run cloud:prepare`

- [ ] **Step 1: Regenerate deployable copies**

Run: `npm run cloud:prepare`

Expected: shared domain and Strava copies match their canonical sources.

- [ ] **Step 2: Run all local gates**

Run:

```bash
npm run validate
npm run coverage
npm run audit:all
git diff --check main...HEAD
```

Expected: all pass with no P1 regression.

- [ ] **Step 3: Request independent review**

Provide separate `base..HEAD` ranges for activity/notification, client behavior, and media/privacy changes. Review must reproduce each RED on the base and GREEN on the fix.

- [ ] **Step 4: Integrate to main only after review**

Use fast-forward or reviewed squash without force pushing. Re-run `npm run validate` on the exact final `main` commit.

- [ ] **Step 5: Keep remote mutation separate**

Run `npm run cloudbase:plan` read-only. Do not run apply, deploy functions/routes, or upload a Mini Program build until the environment owner explicitly authorizes those remote changes.
