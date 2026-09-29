# Personal Rider Card Core Design

## Source and product goal

This design combines the Lark document “此里 Strava 骑行能力卡技术方案与交接说明” (revision 6), its V2 visual reference, the approved scheme A multi-photo background, and the current repository at `c50f145` plus reviewed release fixes.

The first deliverable is a truthful, self-visible personal rider card that loads from one server response. It must be useful with the data already implemented today and must not pretend that future Strava history, power, segment, training-status, follower, or club modules exist.

## Core scope

The personal card contains:

- display name and optional title;
- up to three user-uploaded photos as full-bleed swipeable backgrounds;
- avatar or branded alpine fallback when no usable photo exists;
- current Strava state;
- existing recent-90-day metrics: distance, ride count, longest ride, elevation, weighted average speed;
- exact snapshot coverage interval, completeness, and synchronization time;
- snapshot generation time and a clear “仅自己可见” privacy label.

Missing metrics are omitted from the layout. `0` is displayed only when the server returns a real numeric zero. Unknown or incomplete values are not replaced with fake values, dashes, or future metrics.

## Explicitly deferred modules

The following items from the source document remain later phases:

- three-year and full-history aggregation;
- riding years derived from the full athlete profile;
- Strava activity primary photos;
- followers, following, and user-selected primary club;
- P5/P10/P20 power bests;
- the four segment PRs;
- derived riding-status score;
- webhook-driven incremental synchronization;
- public/social sharing and a public rider directory.

The card DTO reserves no fake placeholder values for these modules. They are added only when their backend sources and privacy controls exist.

## Visual direction

The direction is “alpine editorial identity card”:

- a 3:4 photo-dominant hero inspired by the supplied V2 reference;
- deep navy-to-transparent gradient for a fixed text-safe area;
- large, restrained rider name and a compact “此里 · STRAVA 已连接/同步中” label;
- a dark translucent metric sheet anchored below the hero rather than generic white cards;
- fluorescent turquoise used only for verified data highlights and status, not decorative gradients;
- Chinese-first typography with tabular numerals for metrics;
- native swiper for multiple images; no autoplay when only one image exists;
- narrow-screen and long-name behavior must preserve metric readability.

The card never says “STRAVA VERIFIED” unless a future product decision defines that term. Current states use “已连接”, “同步中”, “数据不完整”, or “需要重新授权”.

## Single-response contract

The Mini Program calls one authenticated server action for the current user:

```json
{
  "action": "capabilityCard"
}
```

The server response is:

```json
{
  "state": "ready|partial|syncing|failed|disconnected",
  "generated_at": "ISO-8601",
  "profile": {
    "display_name": "骑手昵称",
    "title": "可选称号"
  },
  "backgrounds": [
    {
      "url": "https://short-lived-cloudbase-url",
      "source": "user_photo|avatar",
      "category": "ride|bike|other"
    }
  ],
  "summary": {
    "total_km_90d": 812.5,
    "rides_90d": 28,
    "longest_km": 126.3,
    "elevation_m_90d": 9300,
    "weighted_avg_speed_kmh": 25.6
  },
  "coverage": {
    "from": "ISO-8601",
    "to": "ISO-8601",
    "complete": true
  },
  "synced_at": "ISO-8601"
}
```

Every summary field is `number | null` at the server boundary. The client adapter preserves `null`; the view model filters it out. `backgrounds` contains HTTPS temporary URLs only and never raw cloud file IDs.

## Identity and media ownership

- The action trusts only WXContext OPENID and never accepts a client openid.
- Identity-document type and number remain absent from collection, response, and card.
- The card response contains no real name, phone, emergency contact, registration remark, token, ciphertext, audit data, or raw storage identifier.
- A new photo upload first requests an owner-bound upload path from the profile function. The path uses an HMAC-derived opaque owner alias plus a random filename.
- Profile updates accept new avatar/photo IDs only when they match the current user’s issued prefix. Existing unverified legacy file IDs remain stored for compatibility but are not rendered on the card.
- Temporary URL generation happens after identity validation. A whole-call or per-file failure degrades to fewer/no backgrounds instead of failing the card.
- The default card is self-only. There is no share entry or public route in this release.

## State derivation

- `ready`: credential usable, fresh canonical snapshot exists, and coverage is complete.
- `partial`: usable snapshot exists but coverage is incomplete or some summary metrics are null.
- `syncing`: authorization exists and snapshot preparation is pending/running.
- `failed`: readiness has a stable failure requiring retry or reauthorization.
- `disconnected`: no usable credential.

When Strava is unavailable, the server may return the last valid snapshot with `state=partial` and its original `synced_at`; it never manufactures current data.

## Page and navigation

- Add `pages/capability-card/index` and register it in `app.json`.
- Add a prominent “我的骑行名片” entry in the profile page.
- The page handles loading, error, disconnected, syncing, partial, and ready states.
- Disconnected/failed states link to the existing Strava page; missing personal photos link to profile editing.
- The page itself performs no multi-endpoint orchestration and does not resolve cloud file IDs.

## Verification

- Server tests cover current-user isolation, owner-bound media, no raw IDs/PII, whole-call media failure, partial per-file failure, and state derivation.
- Repository tests reject raw `cloud://`, non-HTTPS URLs, malformed state, and non-nullable numeric strings.
- View-model tests cover real zero, null omission, incomplete coverage, no photos, one photo, and three-photo ordering.
- Page tests cover navigation fallbacks and ensure no share handler/public API is registered.
- Final validation includes full repository gates plus an independent privacy review.

## Source-document alignment

The implementation follows the source document’s “single snapshot read”, “missing modules hidden”, “coverage and generated time explicit”, “server-only token handling”, and “default self-only” decisions. It intentionally prioritizes user-uploaded photos over future Strava activity photos because the user explicitly selected multi-photo personal uploads for scheme A.
