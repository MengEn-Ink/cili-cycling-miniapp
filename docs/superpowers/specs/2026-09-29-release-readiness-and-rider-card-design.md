# Release Readiness and Rider Capability Card Design

## Context

`main@c50f145` contains the Strava readiness flow, activity administration, notification outbox, rider-facing UI, removal of identity-document collection, and the first multi-photo capability card. The repository is an integration baseline, not a releasable build, because independent review found nine P1 behavior defects and the CloudBase environment still lacks five declared resources.

This design separates the immediate release-blocker repair from the later, larger activity-state expansion. It preserves the native Mini Program + CloudBase architecture, server-trusted WXContext identity, deny-by-default collection rules, encrypted secrets, and transactional capacity accounting.

## Scope A: Release blockers to implement now

### Activity visibility

- The public activity list continues to contain only `published` activities.
- Authenticated users may read a non-deleted `published` or `finished` activity detail. This keeps approved credentials and registration history usable after an event ends.
- `draft` and deleted activities remain unavailable through `activity-read`.

### Lossless activity editing

The activity DTO and admin save payload preserve every schema field even when the current editor does not expose a control for it:

- `schedule[].remark`
- `route.gpx_file_id`
- `fee.included`
- `fee.excluded`
- `fee.remark`

The UI may continue editing only fee remark and the currently supported route/schedule fields, but a read-edit-save cycle must round-trip hidden fields unchanged. Field preservation is explicit in the typed model and repository mapper; it is not implemented by guessing array positions on the server.

### Activity CTA and page lifecycle

A single pure `resolveActivityAction` function is the source of truth for activity detail, credential retry, and registration-form entry. Its priority is:

1. `pending` or `approved` registration: view registration.
2. `rejected` or `cancelled` and activity open: resubmit.
3. `rejected` or `cancelled` and activity closed: view history.
4. No registration and finished: disabled, activity ended.
5. No registration and deadline reached: disabled, registration closed.
6. No registration and capacity full: disabled, full.
7. No registration and status not published or occupancy unknown: disabled, unavailable.
8. No registration and open: register.

Both WXML state and event handlers enforce this decision. Registration-list failures are surfaced and never downgraded into an enabled registration action.

Registration form controls are fully controlled by page data. Navigation to profile or Strava is disabled while submitting. A submission generation is invalidated on hide/unload so a late response cannot redirect from a background page.

The Strava ready view displays the exact 90-day coverage interval, completeness, and synchronization time. Missing coverage is shown as unknown; incomplete coverage is explicit text and never represented only by color.

Browser-authorization recovery is bounded by the same 30-second total deadline as readiness synchronization, including each in-flight status request. If the user leaves the page, every unresolved start/copy/modal/poll continuation is invalidated before it can create a side effect. Cancelling the browser guide consumes the current user's active OAuth state through a server action and returns the page to `disconnected`; reconnecting always creates a fresh state.

### Notification delivery semantics

WeChat subscription-message sending exposes no provider idempotency key or delivery-status query. Therefore database state and the external send cannot be made strictly exactly-once.

The chosen policy is at-most-once automatic external delivery with durable in-app registration state as the authority:

```text
pending/retryable
  -> claimed(unique lease_id, attempt_no)
  -> dispatching(unique lease_id, attempt_no)
  -> sent
  -> retryable          only for an explicit provider rejection before acceptance
  -> delivery_unknown   transport ambiguity, worker loss after dispatch begins, or ACK uncertainty
```

- Expired `claimed` work can be safely reclaimed because no external call has started.
- `dispatching` is persisted before calling WeChat and is never automatically resent.
- Expired `dispatching` becomes `delivery_unknown` for manual reconciliation.
- `beginDispatch`, `markSent`, `markRetryable`, and `markDeliveryUnknown` use transactions and require exact `lease_id` and `attempt_no` matches.
- A stale worker receives `LEASE_LOST` and cannot overwrite a newer state.
- If WeChat reports success but `markSent` fails, the current process may retry only the fenced database ACK; it must never call WeChat again.
- Approval status remains visible in the Mini Program even if the external reminder is unknown or unavailable.

### Subscription permission

The registration page fetches configured review template IDs during page load from an authenticated read-only endpoint. On the explicit “submit registration” tap, after local validation and before the registration request, it invokes `wx.requestSubscribeMessage` directly so the user gesture is preserved.

Accept, reject, ban, and API failure do not block registration. The result is used only for user feedback and operational observability; the server remains authoritative and WeChat enforces the actual permission.

Only the two allowlisted template IDs are returned. No other environment variables are exposed.

## Scope B: Identity and capability card

### Identity-document removal

Identity document type and number are no longer required or collected:

- no form fields;
- no client DTO fields;
- no profile update inputs;
- no completeness or registration gate dependency;
- no registration snapshot field;
- no admin or social response field;
- no UI display.

Existing encrypted identity-document fields remain untouched in storage for this release but are never decrypted or returned. Any later physical deletion is a separate, audited migration requiring explicit environment authorization.

### Capability-card media

The card uses up to three deduplicated user photos, ordered as riding/training photos first, then bike/other user photos, then avatar fallback. All three profile categories (`ride`, `bike`, `other`) are valid for the administrator view. Multiple images use a native swiper as full-bleed backgrounds; one image renders statically; no image renders a brand fallback. Every image has a dark gradient overlay and a fixed text-safe region.

Stored `cloud://` file IDs are not client image URLs. After administrator authorization, the server resolves the allowlisted profile file IDs through CloudBase temporary-file URL generation and returns short-lived URLs only. Invalid, failed, or non-allowlisted resolutions are omitted. The client never receives another user's raw file IDs.

Two projections share presentation structure but not data:

- Admin review card: nickname, title, masked real name, phone provenance/masked phone outside the visual hero, registration options, Strava status/metrics/coverage/sync time, and temporary photo URLs.
- Social card: nickname, title, explicitly public photos, and a smaller allowlist of non-sensitive ride metrics. It excludes real name, phone, emergency contact, registration notes, openid, tokens, raw file IDs, and audit data.

The first release exposes the admin card and a self-preview. A public rider directory is out of scope until photo visibility controls are designed and approved.

## Scope C: Activity lifecycle next phase

The desired product lifecycle is:

```text
draft -> published -> registration_closed -> formed -> in_progress -> finished
                         \-> cancelled
published -------------------------------> cancelled
```

- `published`: registration may be open, full, or deadline-closed according to capacity/time.
- `registration_closed`: no new submission; pending reviews may still be resolved.
- `formed`: requires zero pending reviews and an explicit administrator action; route, start/end, capacity, and fee become locked.
- `in_progress`: event has started.
- `finished`: history and credentials remain readable.
- `cancelled`: no new registration; all participants see the cancellation reason.

This state expansion is not mixed into the immediate blocker patch. It gets a separate implementation plan after Scope A is green, because it changes persisted state, validation, notifications, and migration rules.

## Error handling and verification

- Every blocker starts with a failing regression test on its base commit.
- Server DTOs fail closed and return stable error codes without PII or token text.
- Missing activity/Strava/photo data is shown as unavailable, never fabricated as zero or success.
- Final acceptance requires focused suites, full `npm run validate`, coverage, audit, an independent incremental review, and the real CloudBase journey after environment authorization.

## Explicit assumptions

- The notification policy prefers no duplicate external messages over automatic retry after an ambiguous send; the in-app registration state is the durable source of truth.
- Existing encrypted identity-document data is retained but inaccessible until a separately authorized cleanup migration.
- No public/social rider directory is shipped in this patch; only the separate safe projection contract and self-preview boundary are established.
