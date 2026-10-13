# Strava Official Embed + GPX Route Design

## Context

The Strava real-account validation cycle is complete. The product no longer needs account
authorization, athlete statistics, token refresh, or OAuth callback handling.

Route support remains useful, but it must be split into two explicit user-facing levels:

1. A Strava public-route URL opens Strava's official route embed without extracting or persisting
   Strava page data.
2. An organizer-supplied GPX file provides native route metrics, elevation data, downloadable route
   content, and a generated visual for the activity.

This replaces the current mixed model where `strava-auth` owns OAuth, public-page parsing, route
preview, and GPX export.

## Goals

- Remove Strava OAuth from the mini program, CloudBase functions, gateway, data model, and runtime
  configuration.
- Keep public Strava route links useful through the official embed experience.
- Require GPX for native elevation charts and detailed route metrics.
- Make the upgrade path clear to organizers without exposing implementation language.
- Preserve readable, high-contrast UI in the light theme.
- Remove stored credentials, authorization attempts, athlete snapshots, and copied Strava account
  data after the new release no longer reads them.

## Non-Goals

- Scraping or parsing Strava route pages, embeds, map images, or undocumented endpoints.
- Reimplementing Strava route planning, social data, segments, popular climbs, or personalized
  moving-time estimates.
- Supporting private Strava routes.
- Supporting TCX, FIT, or KML in the first release.
- Rendering third-party map tiles without an approved map-service agreement.

## User Experience

### Activity Editor

The route section has two independent controls.

**Official route**

- Label: `Strava 官方路线（可选）`
- Input placeholder: `粘贴公开路线链接`
- Primary action: `添加官方路线`
- Success copy: `已添加。参与者可查看 Strava 官方路线。`
- Help copy: `这里只保存路线链接。如需在活动中展示海拔曲线和完整数据，请继续上传 GPX。`
- Secondary action after validation: `查看官方路线`

Adding a URL performs strict local and server-side URL validation only. It does not fetch Strava
HTML or metadata.

**Detailed route**

- Label: `GPX 路线详情（推荐）`
- Primary action: `上传 GPX`
- Help copy: `上传后可展示里程、爬升、海拔曲线和路线图，参与者也可下载原文件。`
- Loading copy: `正在读取路线`
- Success copy: `路线详情已准备好`
- Replace action: `更换 GPX`
- Remove action: `移除路线详情`

After parsing, the editor shows:

- route name;
- distance;
- elevation gain and loss;
- minimum and maximum elevation;
- estimated riding time labeled `此里估算`;
- a native elevation chart;
- a generated route-outline preview.

An organizer can choose either an uploaded activity photo or the generated route visual as the
activity background. The generated visual is never presented as a geographic basemap.

### Activity Detail

When only a Strava URL exists, the page shows a compact `Strava 官方路线` row with the action
`查看官方路线`. Opening it navigates to a dedicated full-page web view that hosts Strava's official
route embed.

When GPX details exist, the native page additionally shows:

- distance and elevation metrics;
- minimum and maximum elevation;
- a distance-based elevation chart;
- start and end points when usable coordinates exist;
- a generated route-outline image;
- `下载 GPX`.

GPX metrics are authoritative for the mini program. The Strava URL remains a source reference and
never overrides GPX data.

### Error Copy

Errors explain the recovery action:

- `没有选中文件，请重新选择`
- `文件超过 4 MB，请选择更小的 GPX`
- `这个文件不是有效的 GPX，请重新导出后上传`
- `GPX 中没有海拔信息，暂时无法生成海拔曲线`
- `路线点过多，请先简化路线后再上传`
- `路线读取失败，请稍后重试`

No user-facing copy mentions OAuth, scopes, XML parsing, tokens, callback states, or internal error
codes.

## Architecture

### Official Embed Path

The activity stores only a normalized HTTPS URL and route ID:

```text
route.external_provider = "strava"
route.external_route_id
route.external_route_url
```

A minimal first-party HTML endpoint accepts a validated numeric route ID and renders Strava's
documented embed snippet. The mini program opens that endpoint in a dedicated `web-view` page. The
endpoint does not request, parse, cache, proxy, or rewrite Strava route data.

The CloudBase web domain must be present in the mini-program business-domain allowlist. If the
embed cannot load, the page offers `复制路线链接` and returns cleanly to the activity.

### GPX Upload Path

1. The client chooses one `.gpx` file with `wx.chooseMessageFile`.
2. The client rejects files over 4 MB and uploads to
   `activity-routes/<openid>/<sha256>.gpx`.
3. The client calls `activity-admin.previewRouteGpx` with the cloud file ID and digest.
4. `activity-admin` verifies admin access, owner-isolated storage path, size, digest, and extension.
5. The function downloads the file and parses it with a maintained XML parser configured to reject
   DTDs and external entities.
6. The function stores a short-lived, server-only `route_previews` record and returns a bounded
   preview.
7. The client renders the preview, generates the route-outline image on Canvas, and uploads the
   result under the same owner and digest.
8. Saving the activity sends the preview ID, GPX file ID, and optional generated image ID.
9. The transaction verifies preview ownership, digest, file IDs, expiry, and parsed summary before
   copying trusted route data into the activity.

Client-supplied route metrics are never trusted.

### GPX Parsing

The parser accepts GPX track points and route points:

- `trk/trkseg/trkpt`;
- `rte/rtept`;
- namespace-prefixed equivalents.

Limits:

- 4 MB input;
- 200,000 source points;
- valid latitude `[-90, 90]`;
- valid longitude `[-180, 180]`;
- valid elevation `[-1000, 10000]` meters;
- at least two usable points;
- at least two points with elevation.

Distance uses haversine geometry. Elevation is smoothed before gain/loss calculation to reduce GPS
noise. The service stores:

- up to 120 distance-distributed elevation points;
- up to 240 simplified route-outline points;
- route bounds;
- start and end coordinates;
- total distance;
- elevation gain and loss;
- minimum and maximum elevation;
- a route name from GPX metadata, falling back to the file name;
- an application estimate based on distance and elevation, explicitly labeled as an estimate.

The original GPX remains in cloud storage and is the downloadable source.

## Data Model

```text
route: {
  start,
  end,
  start_location?,
  end_location?,
  distance_km,
  elevation_m,                 // gain, retained for compatibility
  elevation_loss_m?,
  elevation_min_m?,
  elevation_max_m?,
  estimated_moving_time_seconds?,
  estimation_source?: "cili",
  elevation_profile?: [{ distance_km, elevation_m }],
  route_outline?: [{ latitude, longitude }],
  route_bounds?: { south, west, north, east },
  gpx_file_id?,
  gpx_sha256?,
  route_name?,
  generated_preview_file_id?,
  external_provider?: "strava",
  external_route_id?,
  external_route_url?
}
```

Legacy `strava_route_url` remains read-compatible during migration but is rewritten to the generic
external-route fields on the next save.

The new server-only `route_previews` collection contains owner, digest, source file ID, generated
file ID, parsed summary, expiry, and consumption timestamps. Client read/write access is denied.

## OAuth Retirement

The new release removes:

- the Strava authorization page, QR code, status polling, sync, retry, and disconnect actions;
- `strava-auth` and `strava-callback`;
- `/strava/callback`, `/strava/success`, and `/strava/failure`;
- Strava client ID, client secret, callback URL, and token-encryption configuration;
- token refresh, athlete statistics, route API, segment API, and OAuth GPX export code;
- repository methods and cache entries for Strava connection/readiness;
- Strava account state and metrics from profile, capability card, registration, and admin review;
- the OAuth-dependent route-owner field and GPX download path.

Data cleanup removes:

- `oauth_states`;
- `strava_credentials`;
- `strava_snapshots`;
- profile-level Strava compatibility snapshots;
- registration Strava snapshots and status fields;
- Strava-derived profile URLs and tenure;
- Strava-origin avatars that were copied through OAuth, falling back to an existing non-Strava
  avatar or the default avatar.

Existing activity route links are retained. Existing Strava preview-image URLs are removed.
Existing native route details remain only when they can be associated with an uploaded GPX;
otherwise the activity retains the external link and manual route fields.

## File Lifecycle

- Content-addressed paths make retries idempotent.
- Leaving the editor deletes files uploaded in the current session when they are not attached.
- Replacing a GPX marks the old object for delayed cleanup after the activity save succeeds.
- A bounded timer job removes expired previews and unattached GPX/preview objects after 24 hours.
- Published and finished activities retain their attached GPX until the activity is deleted.
- Activity deletion queues the GPX and generated preview for delayed deletion.

## Rollout

1. Deploy GPX preview/save/read/download support and the official embed endpoint.
2. Release the editor and detail UI without any new OAuth calls.
3. Verify existing activities still open and external links still work.
4. Migrate legacy external-route fields and remove unsupported preview-image URLs.
5. Purge OAuth states, credentials, snapshots, registration copies, and Strava-origin profile data.
6. Delete callback gateway routes and the OAuth cloud functions.
7. Remove OAuth secrets and obsolete collection/index declarations.
8. Read back deployed function code and verify OAuth collections contain no documents.

The purge occurs only after the deployed application no longer reads the old data.

## Testing

### Domain Tests

- GPX namespace handling, track/route variants, point ordering, and metadata name.
- Distance, smoothed gain/loss, min/max elevation, bounds, and sampling.
- Missing elevation, invalid coordinates, malformed XML, DTD/entity rejection, size and point caps.
- Preview ownership, digest binding, expiry, one-time consumption, and idempotent retry.
- Legacy route compatibility and generic external-route migration.

### Client Tests

- URL validation and official embed navigation.
- GPX select, cancel, oversize, upload, retry, replace, remove, and unload cleanup.
- Native elevation chart and route-outline rendering.
- Background selection between photos and generated route visual.
- GPX download/share behavior.
- User-facing copy contains actions and does not contain OAuth terminology.

### Runtime Acceptance

- Upload a real GPX in WeChat DevTools and on a physical device.
- Confirm distance, gain/loss, min/max elevation, chart, and outline match a desktop GPX viewer.
- Confirm the official Strava embed opens without any connected account in the mini program.
- Confirm a failed embed still allows copying the route link.
- Confirm light-theme text and controls remain visible at 375x812.
- Confirm OAuth pages, functions, gateway paths, credentials, and snapshots are absent after purge.

## Compliance References

- Official route embed documentation:
  `https://business.strava.com/pb/resources/how-to-embed-a-strava-route`
- Strava API Policy:
  `https://www.strava.com/legal/api_policy`
- Strava API Agreement:
  `https://www.strava.com/legal/api`
