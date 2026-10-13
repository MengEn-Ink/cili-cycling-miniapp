# Strava Official Embed + GPX Route Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Strava account authorization and replace it with a validated official-route embed plus organizer-uploaded GPX details, elevation, outline, background, and download.

**Architecture:** `activity-admin` becomes the trust boundary for GPX files: it validates owner-scoped uploads, parses bounded XML, stores short-lived previews, and consumes those previews transactionally when an activity is saved. A small public `route-web` function renders only Strava's documented embed from a numeric route ID; the mini program opens it in a dedicated `web-view`. Existing Strava account, snapshot, page-scraping, and token-dependent code is removed only after route read/write paths no longer depend on it.

**Tech Stack:** WeChat Mini Program TypeScript/WXML/Canvas 2D, CloudBase Node.js 20 functions, `fast-xml-parser`, Node test runner, Vitest, CloudBase CLI, WeChat DevTools automation.

---

## File Structure

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `cloudfunctions/activity-admin/gpx.js` | Parse bounded GPX, smooth elevation, calculate metrics, sample profile, and simplify outline |
| Create | `cloudfunctions/activity-admin/gpx.node-test.js` | GPX parser, limits, namespace, geometry, and hostile XML tests |
| Create | `cloudfunctions/activity-admin/route-preview.js` | Validate owner path/digest, create and consume short-lived trusted route previews |
| Create | `cloudfunctions/activity-admin/route-preview.node-test.js` | Preview ownership, expiry, digest, generated image, and idempotency tests |
| Modify | `cloudfunctions/activity-admin/index.js` | Expose `previewRouteGpx`, wire storage download and preview persistence |
| Modify | `cloudfunctions/activity-admin/domain.js` | Validate generic external route and GPX-backed persisted route shape |
| Modify | `cloudfunctions/activity-admin/use-cases.js` | Consume trusted preview during save; queue replaced/deleted route media |
| Modify | `cloudfunctions/activity-admin/package.json` | Add the maintained XML parser dependency |
| Modify | `cloudfunctions/activity-admin/package-lock.json` | Lock the parser dependency |
| Create | `cloudfunctions/route-web/index.js` | Render the official Strava route embed without fetching Strava data |
| Create | `cloudfunctions/route-web/index.node-test.js` | Validate route ID, CSP, escaping, and fallback link |
| Create | `cloudfunctions/route-web/package.json` | Define the dependency-free HTTP function package |
| Create | `cloudfunctions/route-web/package-lock.json` | Lock the HTTP function package |
| Create | `cloudfunctions/route-maintenance/index.js` | Clean expired previews/unattached files and perform bounded retirement migration |
| Create | `cloudfunctions/route-maintenance/index.node-test.js` | Cleanup cursor, attachment protection, and migration/purge tests |
| Create | `cloudfunctions/route-maintenance/package.json` | Define the maintenance function package |
| Create | `cloudfunctions/route-maintenance/package-lock.json` | Lock the maintenance function package |
| Modify | `cloudfunctions/activity-read/index.js` | Resolve generated route media and return original GPX bytes for published activities |
| Modify | `cloudfunctions/activity-read/index.node-test.js` | Route media resolution and GPX download authorization tests |
| Modify | `cloudbaserc.json` | Add route web/maintenance functions, embed route, and cleanup timer; remove OAuth functions/routes |
| Modify | `scripts/bootstrap-cloudbase.mjs` | Replace OAuth collections/indexes with `route_previews` and route cleanup indexes |
| Modify | `scripts/bootstrap-cloudbase.node-test.mjs` | Lock the new collection/index contract and absence of OAuth resources |
| Modify | `scripts/prepare-cloudfunctions.mjs` | Remove OAuth deployment-copy preparation |
| Modify | `scripts/verify-cloud-packages.mjs` | Verify route functions and stop expecting OAuth packages |
| Modify | `package.json` | Install/test/audit the new functions and remove OAuth commands |
| Modify | `.github/workflows/ci.yml` | Cache route-function locks and remove OAuth package locks |
| Modify | `cloudstorage.rules.json` | Permit authenticated owner uploads only below `activity-routes/<openid>/` and existing profile paths |
| Modify | `miniprogram/models/index.ts` | Replace Strava preview/readiness types with external-route and GPX preview types |
| Modify | `miniprogram/repositories/types.ts` | Add URL validation, GPX preview, generated preview binding, and GPX download methods |
| Modify | `miniprogram/repositories/cloud.ts` | Strictly map generic route DTOs and call `activity-admin`/`activity-read` |
| Modify | `miniprogram/repositories/cached.ts` | Remove Strava cache namespace and forward route methods |
| Modify | `miniprogram/repositories/mock.ts` | Keep mock parity for generic route and GPX methods |
| Create | `miniprogram/utils/route.ts` | Normalize Strava URLs, digest GPX files, map route errors, and format estimates |
| Create | `miniprogram/utils/route-outline.ts` | Project route points and draw deterministic high-contrast Canvas route visuals |
| Create | `tests/route-utils.test.ts` | Client URL, digest/path, copy, and estimate tests |
| Create | `tests/route-outline.test.ts` | Projection, stable bounds, empty input, and Canvas drawing tests |
| Modify | `miniprogram/pages/admin/activity-edit/index.ts` | Upload/preview/replace/remove GPX, render route preview, select generated background, cleanup session files |
| Modify | `miniprogram/pages/admin/activity-edit/index.wxml` | User-first official route and detailed GPX controls |
| Modify | `miniprogram/pages/admin/activity-edit/index.wxss` | Responsive route metrics, charts, preview, and accessible controls |
| Modify | `miniprogram/pages/admin/activity-edit/index.json` | Keep page configuration aligned with new Canvas controls |
| Modify | `tests/activity-admin-edit.test.ts` | GPX lifecycle, URL validation, route precedence, background choice, and user copy |
| Create | `miniprogram/pages/route-view/index.ts` | Build the allowlisted first-party embed URL and copy fallback |
| Create | `miniprogram/pages/route-view/index.wxml` | Full-page `web-view` plus fallback state |
| Create | `miniprogram/pages/route-view/index.wxss` | High-contrast fallback layout |
| Create | `miniprogram/pages/route-view/index.json` | Route viewer navigation configuration |
| Modify | `miniprogram/app.json` | Register the route viewer and keep the OAuth page absent |
| Modify | `miniprogram/config/runtime.ts` | Declare the fixed first-party route embed origin |
| Modify | `miniprogram/pages/activity-detail/index.ts` | Open official route, render GPX outline/elevation, and download uploaded GPX |
| Modify | `miniprogram/pages/activity-detail/index.wxml` | Separate official route from native GPX details |
| Modify | `miniprogram/pages/activity-detail/index.wxss` | Responsive native route detail and light-theme contrast |
| Modify | `tests/activity-detail-design.test.ts` | Official viewer, GPX metrics, outline, download, and fallback tests |
| Delete | `miniprogram/pages/strava/index.ts` | Remove account authorization UI |
| Delete | `miniprogram/pages/strava/index.wxml` | Remove account authorization UI |
| Delete | `miniprogram/pages/strava/index.wxss` | Remove account authorization UI |
| Delete | `miniprogram/pages/strava/index.json` | Remove account authorization UI |
| Delete | `miniprogram/services/strava-readiness-service.ts` | Remove polling/account state logic |
| Delete | `miniprogram/assets/strava/connect-with-strava.svg` | Remove obsolete authorization asset |
| Delete | `cloudfunctions/strava-auth/` | Remove OAuth, API, page parser, and token-dependent GPX function |
| Delete | `cloudfunctions/strava-callback/` | Remove OAuth callback HTTP function |
| Delete | `cloudfunctions/strava-shared/` | Remove shared token/API/page parser code |
| Modify | `cloudfunctions/profile/index.js` | Stop reading credentials/snapshots and remove Strava avatar import |
| Modify | `cloudfunctions/profile/capability-card.js` | Return profile/photo card data without third-party metrics |
| Delete | `cloudfunctions/profile/avatar-import.js` | Remove OAuth-derived avatar import |
| Delete | `cloudfunctions/profile/avatar-import.node-test.js` | Remove retired import tests |
| Modify | `cloudfunctions/profile/core.js` | Restrict new avatar sources to WeChat/custom |
| Modify | `cloudfunctions/profile/store.js` | Remove credential leases and Strava-origin writes |
| Modify | `cloudfunctions/profile-media-cleanup/store.js` | Remove credential lease cleanup |
| Modify | `cloudfunctions/admin-review/capability-card.js` | Remove Strava metrics from admin rider cards |
| Modify | `cloudfunctions/admin-review/domain/domain.js` | Stop projecting registration Strava snapshots |
| Modify | `cloudfunctions/registration/domain/domain.js` | Remove dormant Strava selectors and snapshot projection |
| Modify | `cloudfunctions/shared/domain.js` | Keep shared registration domain free of account snapshots |
| Modify | `miniprogram/pages/capability-card/index.ts` | Remove sync/profile-link actions and show profile/photo-only card |
| Modify | `miniprogram/pages/capability-card/index.wxml` | Remove third-party status and metrics |
| Modify | `miniprogram/pages/profile/index.ts` | Remove hidden Strava profile copy behavior |
| Modify | `miniprogram/pages/admin/reviews/index.wxml` | Remove Strava status label |
| Modify | `miniprogram/pages/admin/review-detail/index.wxml` | Remove Strava metrics/status from review detail |
| Modify | `miniprogram/pages/activity-detail/index.wxml` | Remove legacy attendee snapshot metrics |
| Modify | `miniprogram/utils/personal-card.ts` | Build a profile/photo-only personal card view |
| Modify | `miniprogram/utils/capability-card.ts` | Remove registration snapshot status/metrics |
| Modify | `docs/requirements-design.md` | Document official-route + GPX behavior and no-account model |
| Modify | `docs/cloudbase-schema.md` | Document `route_previews`, route fields, cleanup, and removed OAuth collections |
| Modify | `docs/sandbox-environment-configuration.md` | Remove OAuth secrets/callback setup and document route embed domain |
| Modify | `README.md` | Replace OAuth deployment instructions with route deployment/acceptance |
| Modify | `docs/templates.js` | Synchronize showcase route editor/detail and remove authorization page |
| Modify | `docs/schema.js` | Update route and profile showcase copy/data |
| Modify | `docs/ui-sync-manifest.json` | Replace the Strava page route with route viewer evidence |
| Modify | `docs/high-priority-issues.md` | Record each commit/deploy/verification transition |

### Task 1: Add Bounded GPX Domain Parsing

**Files:**
- Create: `cloudfunctions/activity-admin/gpx.js`
- Create: `cloudfunctions/activity-admin/gpx.node-test.js`
- Modify: `cloudfunctions/activity-admin/package.json`
- Modify: `cloudfunctions/activity-admin/package-lock.json`

- [x] **Step 1: Write failing parser tests**

```js
test('parses namespaced track and route points into bounded native metrics', () => {
  const parsed = parseGpx(Buffer.from(NAMESPACED_GPX), { fileName: 'weekend.gpx' });
  assert.equal(parsed.route_name, '周末环湖');
  assert.equal(parsed.elevation_profile.length <= 120, true);
  assert.equal(parsed.route_outline.length <= 240, true);
  assert.equal(parsed.elevation_loss_m > 0, true);
});

test('rejects DTD, entities, missing elevation, invalid coordinates and point overflow', () => {
  for (const [xml, code] of hostileFixtures)
    assert.throws(() => parseGpx(Buffer.from(xml)), { code });
});
```

- [x] **Step 2: Run the tests and confirm the parser is missing**

Run: `node --test cloudfunctions/activity-admin/gpx.node-test.js`

Expected: FAIL because `./gpx` does not exist.

- [x] **Step 3: Implement the parser**

```js
function parseGpx(bytes, { fileName = 'route.gpx' } = {}) {
  assertBoundedXml(bytes);
  const document = parser.parse(bytes.toString('utf8'));
  const points = collectTrackOrRoutePoints(document);
  const measured = measureRoute(points);
  return {
    route_name: routeName(document, fileName),
    distance_km: round(measured.distanceMeters / 1000, 2),
    elevation_m: Math.round(measured.gainMeters),
    elevation_loss_m: Math.round(measured.lossMeters),
    elevation_min_m: round(measured.minimumElevation, 1),
    elevation_max_m: round(measured.maximumElevation, 1),
    estimated_moving_time_seconds: estimateRideSeconds(measured),
    estimation_source: 'cili',
    elevation_profile: distributeByDistance(measured.points, 120),
    route_outline: simplifyOutline(measured.points, 240),
    route_bounds: measured.bounds,
    start: coordinate(measured.points[0]),
    end: coordinate(measured.points.at(-1)),
  };
}
```

Configure `fast-xml-parser` with `processEntities: false`, `htmlEntities: false`, strict attribute handling, and a pre-parse rejection for `<!DOCTYPE`/`<!ENTITY`.

- [x] **Step 4: Run parser tests**

Run: `npm --prefix cloudfunctions/activity-admin test`

Expected: PASS, including parser geometry and hostile XML cases.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/activity-admin/gpx.js cloudfunctions/activity-admin/gpx.node-test.js cloudfunctions/activity-admin/package.json cloudfunctions/activity-admin/package-lock.json
git commit -m "feat(route): parse uploaded GPX details"
```

### Task 2: Add Trusted GPX Preview and Transactional Save

**Files:**
- Create: `cloudfunctions/activity-admin/route-preview.js`
- Create: `cloudfunctions/activity-admin/route-preview.node-test.js`
- Modify: `cloudfunctions/activity-admin/index.js`
- Modify: `cloudfunctions/activity-admin/domain.js`
- Modify: `cloudfunctions/activity-admin/use-cases.js`
- Modify: `cloudfunctions/activity-admin/activity-admin.node-test.js`
- Replace: `cloudfunctions/activity-admin/strava-route.node-test.js`

- [x] **Step 1: Write failing preview and save tests**

```js
test('preview binds owner path, sha256 and parsed route for two hours', async () => {
  const result = await previewRouteGpx(deps, {
    openid: 'owner',
    fileId: 'cloud://env/activity-routes/owner/<digest>.gpx',
    sha256: digest,
    fileName: 'route.gpx',
  }, now);
  assert.equal(result.gpx_sha256, digest);
  assert.equal(saved.owner_openid, 'owner');
  assert.equal(saved.expires_at.getTime(), now.getTime() + 2 * 60 * 60 * 1000);
});

test('save ignores client metrics and consumes only the matching trusted preview', async () => {
  const saved = await saveActivity(store, requestWithPreview, now);
  assert.equal(saved.route.distance_km, trusted.distance_km);
  assert.equal(saved.route.external_provider, 'strava');
  assert.equal(saved.route.preview_image_url, undefined);
});
```

- [x] **Step 2: Run tests and confirm the new actions fail**

Run: `npm --prefix cloudfunctions/activity-admin test`

Expected: FAIL for missing preview functions and unsupported route fields.

- [x] **Step 3: Implement preview creation and save consumption**

```js
const preview = await tx.getRoutePreviewById(route.gpx_preview_id);
assertUsablePreview(preview, {
  openid,
  sha256: route.gpx_sha256,
  sourceFileId: route.gpx_file_id,
  generatedFileId: route.generated_preview_file_id,
  now,
});
effectiveActivity.route = mergeTrustedRoute(effectiveActivity.route, preview.summary);
await tx.consumeRoutePreview(preview._id, now);
```

The server accepts only:

```text
external_provider/external_route_id/external_route_url
gpx_preview_id/gpx_file_id/gpx_sha256/generated_preview_file_id
```

All native metrics copied into the activity come from `preview.summary`.

- [x] **Step 4: Run activity-admin tests**

Run: `npm --prefix cloudfunctions/activity-admin test`

Expected: PASS for owner isolation, digest mismatch, expiry, generated-image binding, one-time consumption, retry of an already attached preview, and legacy URL rewrite.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/activity-admin
git commit -m "feat(route): trust GPX previews when saving activities"
```

### Task 3: Read and Download GPX-Backed Route Details

**Files:**
- Modify: `cloudfunctions/activity-read/index.js`
- Modify: `cloudfunctions/activity-read/index.node-test.js`
- Modify: `cloudfunctions/activity-read/package.json`
- Modify: `cloudfunctions/activity-read/package-lock.json`

- [x] **Step 1: Write failing read/download tests**

```js
test('detail resolves generated route preview media without exposing storage internals', async () => {
  const result = await main({ action: 'detail', activityId: 'published' });
  assert.equal(result.data.route.generated_preview_url, 'https://temp.example/route.png');
});

test('downloadRouteGpx returns the original attached GPX only for a visible activity', async () => {
  const result = await main({ action: 'downloadRouteGpx', activityId: 'published' });
  assert.equal(result.data.content_type, 'application/gpx+xml');
  assert.equal(Buffer.from(result.data.base64, 'base64').toString(), sourceXml);
});
```

- [x] **Step 2: Run tests and confirm the action is absent**

Run: `npm --prefix cloudfunctions/activity-read test`

Expected: FAIL because generated route media and `downloadRouteGpx` are not implemented.

- [x] **Step 3: Implement bounded media resolution and download**

```js
if (event.action === 'downloadRouteGpx') {
  const activity = await visiblePublishedActivity(event.activityId);
  const fileId = safeAttachedGpxFileId(activity.route);
  const bytes = await cloud.downloadFile({ fileID: fileId });
  assertGpxDownload(bytes.fileContent);
  return ok({
    base64: Buffer.from(bytes.fileContent).toString('base64'),
    filename: safeRouteFileName(activity.route.route_name, activity._id),
    content_type: 'application/gpx+xml',
  });
}
```

- [x] **Step 4: Run activity-read tests**

Run: `npm --prefix cloudfunctions/activity-read test`

Expected: PASS, including draft/deleted/missing/oversize rejection.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/activity-read
git commit -m "feat(route): serve attached GPX details and downloads"
```

### Task 4: Add the Official Embed Endpoint

**Files:**
- Create: `cloudfunctions/route-web/index.js`
- Create: `cloudfunctions/route-web/index.node-test.js`
- Create: `cloudfunctions/route-web/package.json`
- Create: `cloudfunctions/route-web/package-lock.json`
- Modify: `cloudbaserc.json`

- [x] **Step 1: Write failing HTTP tests**

```js
test('renders only the documented Strava embed for a numeric route id', async () => {
  const response = await main({ path: '/route/embed', queryStringParameters: { id: '42' } });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /data-embed-id="42"/);
  assert.match(response.body, /https:\/\/strava-embeds\.com\/embed\.js/);
  assert.doesNotMatch(response.body, /fetch\(|XMLHttpRequest|api\/v3/);
});
```

- [x] **Step 2: Run tests and confirm the function is missing**

Run: `node --test cloudfunctions/route-web/index.node-test.js`

Expected: FAIL because the function does not exist.

- [x] **Step 3: Implement CSP-protected embed HTML**

```html
<div class="strava-embed-placeholder" data-embed-type="route" data-embed-id="42"></div>
<script src="https://strava-embeds.com/embed.js"></script>
```

Return a strict CSP that allows scripts and frames only from the documented Strava embed origin. Include a visible `在 Strava 查看` fallback link; do not request, parse, proxy, cache, or rewrite Strava content.

- [x] **Step 4: Run endpoint tests**

Run: `node --test cloudfunctions/route-web/index.node-test.js`

Expected: PASS for valid ID, invalid ID, CSP, cache policy, and fallback URL.

- [x] **Step 5: Commit**

```bash
git add cloudfunctions/route-web cloudbaserc.json
git commit -m "feat(route): host official Strava route embed"
```

### Task 5: Replace Client Route Contracts

**Files:**
- Modify: `miniprogram/models/index.ts`
- Modify: `miniprogram/repositories/types.ts`
- Modify: `miniprogram/repositories/cloud.ts`
- Modify: `miniprogram/repositories/cached.ts`
- Modify: `miniprogram/repositories/mock.ts`
- Create: `miniprogram/utils/route.ts`
- Create: `tests/route-utils.test.ts`
- Modify: `tests/cloud-repository.test.ts`
- Modify: `tests/caching-repository.test.ts`
- Modify: `tests/caching-repository-persist.test.ts`

- [ ] **Step 1: Write failing repository and utility tests**

```ts
expect(normalizeStravaRouteUrl('https://www.strava.com/zh-CN/routes/42/')).toEqual({
  provider: 'strava',
  routeId: '42',
  url: 'https://www.strava.com/routes/42',
});

await expect(repository.previewRouteGpx(input)).resolves.toMatchObject({
  previewId: expect.any(String),
  routeName: '周末环湖',
  elevationProfile: expect.any(Array),
  routeOutline: expect.any(Array),
});
```

- [ ] **Step 2: Run client tests and confirm the contracts are absent**

Run: `npx vitest run tests/route-utils.test.ts tests/cloud-repository.test.ts tests/caching-repository.test.ts tests/caching-repository-persist.test.ts`

Expected: FAIL for missing route utility/types and obsolete OAuth methods.

- [ ] **Step 3: Implement strict route contracts**

```ts
export interface RouteGpxPreview {
  previewId: string;
  gpxFileId: string;
  gpxSha256: string;
  routeName: string;
  distanceKm: number;
  elevationGainM: number;
  elevationLossM: number;
  elevationMinM: number;
  elevationMaxM: number;
  estimatedMovingTimeSeconds: number;
  elevationProfile: RouteElevationPoint[];
  routeOutline: RouteCoordinate[];
  routeBounds: RouteBounds;
}
```

Remove account readiness, authorization, sync, disconnect, public-page preview, route-owner GPX, and Strava avatar methods from `RideRepository`.

- [ ] **Step 4: Run repository and utility tests**

Run: `npx vitest run tests/route-utils.test.ts tests/cloud-repository.test.ts tests/caching-repository.test.ts tests/caching-repository-persist.test.ts`

Expected: PASS with no `strava-auth` cloud calls.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/models miniprogram/repositories miniprogram/utils/route.ts tests/route-utils.test.ts tests/cloud-repository.test.ts tests/caching-repository.test.ts tests/caching-repository-persist.test.ts
git commit -m "refactor(route): replace account APIs with GPX contracts"
```

### Task 6: Implement GPX Editor Lifecycle and Generated Route Visual

**Files:**
- Create: `miniprogram/utils/route-outline.ts`
- Create: `tests/route-outline.test.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxml`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxss`
- Modify: `miniprogram/pages/admin/activity-edit/index.json`
- Modify: `tests/activity-admin-edit.test.ts`

- [ ] **Step 1: Write failing page and Canvas tests**

```ts
it('uploads one GPX, requests a trusted preview, and shows user-facing metrics', async () => {
  await page.chooseRouteGpx();
  expect(rideService.previewRouteGpx).toHaveBeenCalledWith(expect.objectContaining({
    gpxFileId: 'cloud://env/activity-routes/owner/<digest>.gpx',
  }));
  expect(page.data.routePreview.routeName).toBe('周末环湖');
});

it('replace/remove/unload clean only unattached session files', async () => {
  page.removeRouteGpx();
  page.onUnload();
  expect(wx.cloud.deleteFile).toHaveBeenCalledWith({ fileList: sessionFiles });
});
```

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npx vitest run tests/route-outline.test.ts tests/activity-admin-edit.test.ts`

Expected: FAIL for missing GPX controls, preview state, and outline renderer.

- [ ] **Step 3: Implement the upload and preview flow**

```ts
const selected = await wx.chooseMessageFile({ count: 1, type: 'file', extension: ['gpx'] });
const file = assertSelectedGpx(selected.tempFiles?.[0]);
const sha256 = await fileSha256(file.path);
const cloudPath = `activity-routes/${appStore.openid}/${sha256}.gpx`;
const upload = await wx.cloud.uploadFile({ cloudPath, filePath: file.path });
const preview = await rideService.previewRouteGpx({
  gpxFileId: upload.fileID,
  gpxSha256: sha256,
  fileName: file.name,
});
```

Render the elevation chart and route outline on Canvas. Export the outline as PNG, upload it to `activity-routes/<openid>/<sha256>.png`, bind it to the preview, and offer it as a background choice beside uploaded activity photos.

- [ ] **Step 4: Use user-first route copy**

The template must include these exact visible strings:

```text
Strava 官方路线（可选）
粘贴公开路线链接
添加官方路线
已添加。参与者可查看 Strava 官方路线。
这里只保存路线链接。如需在活动中展示海拔曲线和完整数据，请继续上传 GPX。
GPX 路线详情（推荐）
上传 GPX
上传后可展示里程、爬升、海拔曲线和路线图，参与者也可下载原文件。
路线详情已准备好
```

The page must not contain account authorization, scopes, tokens, callbacks, XML parsing, or internal error codes.

- [ ] **Step 5: Run editor tests and typecheck**

Run: `npx vitest run tests/route-outline.test.ts tests/activity-admin-edit.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add miniprogram/pages/admin/activity-edit miniprogram/utils/route-outline.ts tests/route-outline.test.ts tests/activity-admin-edit.test.ts
git commit -m "feat(route): upload GPX and preview native details"
```

### Task 7: Add Route Viewer and Native Detail Experience

**Files:**
- Create: `miniprogram/pages/route-view/index.ts`
- Create: `miniprogram/pages/route-view/index.wxml`
- Create: `miniprogram/pages/route-view/index.wxss`
- Create: `miniprogram/pages/route-view/index.json`
- Modify: `miniprogram/app.json`
- Modify: `miniprogram/config/runtime.ts`
- Modify: `miniprogram/pages/activity-detail/index.ts`
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/pages/activity-detail/index.wxss`
- Modify: `tests/activity-detail-design.test.ts`

- [ ] **Step 1: Write failing viewer/detail tests**

```ts
it('opens a validated official route in the dedicated viewer', () => {
  definition.openOfficialRoute.call(context);
  expect(wx.navigateTo).toHaveBeenCalledWith({
    url: '/pages/route-view/index?id=42',
  });
});

it('downloads the uploaded original GPX without a route-owner token path', async () => {
  await definition.downloadGpx.call(context);
  expect(rideService.downloadRouteGpx).toHaveBeenCalledWith('activity-1');
});
```

- [ ] **Step 2: Run focused tests and confirm failures**

Run: `npx vitest run tests/activity-detail-design.test.ts`

Expected: FAIL for absent route viewer, generic fields, and uploaded GPX action.

- [ ] **Step 3: Implement viewer and native detail**

```ts
const src = `${runtimeConfig.routeEmbedOrigin}/route/embed?id=${encodeURIComponent(routeId)}`;
```

Detail behavior:

```text
external route only -> compact "Strava 官方路线" + "查看官方路线"
GPX attached -> native metrics, gain/loss, min/max, estimate, elevation chart,
                start/end coordinates, generated outline, "下载 GPX"
```

When the embed page fails, keep `复制路线链接` visible. GPX values always win over external-link data.

- [ ] **Step 4: Run detail tests and source validation**

Run: `npx vitest run tests/activity-detail-design.test.ts && npm run build`

Expected: PASS and the source completeness check reports 14 pages.

- [ ] **Step 5: Commit**

```bash
git add miniprogram/pages/route-view miniprogram/pages/activity-detail miniprogram/app.json miniprogram/config/runtime.ts tests/activity-detail-design.test.ts
git commit -m "feat(route): show official embed and native GPX details"
```

### Task 8: Remove OAuth and Third-Party Account Data from Product Code

**Files:**
- Delete: `miniprogram/pages/strava/`
- Delete: `miniprogram/services/strava-readiness-service.ts`
- Delete: `miniprogram/assets/strava/connect-with-strava.svg`
- Delete: `cloudfunctions/strava-auth/`
- Delete: `cloudfunctions/strava-callback/`
- Delete: `cloudfunctions/strava-shared/`
- Modify: `cloudfunctions/profile/index.js`
- Modify: `cloudfunctions/profile/capability-card.js`
- Delete: `cloudfunctions/profile/avatar-import.js`
- Delete: `cloudfunctions/profile/avatar-import.node-test.js`
- Modify: `cloudfunctions/profile/core.js`
- Modify: `cloudfunctions/profile/store.js`
- Modify: `cloudfunctions/profile-media-cleanup/store.js`
- Modify: `cloudfunctions/admin-review/capability-card.js`
- Modify: `cloudfunctions/admin-review/domain/domain.js`
- Modify: `cloudfunctions/registration/domain/domain.js`
- Modify: `cloudfunctions/shared/domain.js`
- Modify: `miniprogram/pages/capability-card/index.ts`
- Modify: `miniprogram/pages/capability-card/index.wxml`
- Modify: `miniprogram/pages/profile/index.ts`
- Modify: `miniprogram/pages/admin/reviews/index.wxml`
- Modify: `miniprogram/pages/admin/review-detail/index.wxml`
- Modify: `miniprogram/pages/activity-detail/index.wxml`
- Modify: `miniprogram/utils/personal-card.ts`
- Modify: `miniprogram/utils/capability-card.ts`
- Modify: all affected tests under `tests/` and cloud-function test files

- [ ] **Step 1: Add a failing retirement contract test**

```ts
it('contains no OAuth runtime, account page, credential collection, or user-facing account copy', () => {
  expect(allRuntimeSources).not.toMatch(/strava-auth|strava-callback|oauth_states|oauth_attempts/);
  expect(JSON.parse(appJson).pages).not.toContain('pages/strava/index');
  expect(allVisibleTemplates).not.toMatch(/授权 Strava|绑定 Strava|同步 Strava/);
});
```

- [ ] **Step 2: Run retirement tests and confirm current violations**

Run: `npx vitest run tests/strava-retirement.test.ts`

Expected: FAIL and list the remaining account/OAuth surfaces.

- [ ] **Step 3: Remove account APIs and projections**

Profile capability responses become:

```js
{
  generated_at,
  profile: { display_name, gender, avatar_url },
  backgrounds
}
```

Registration and admin-review responses omit `strava_status`, `strava_snapshot`, account metrics, profile URLs, tenure, and repair/sync actions. Existing stored fields remain unread until the purge phase.

- [ ] **Step 4: Remove OAuth runtime directories and obsolete tests**

Delete the three runtime directories and replace authorization/readiness tests with retirement and route tests. Preserve historical design/verification documents as history, but current requirements, schema, deployment, and UI artifacts must describe only the new model.

- [ ] **Step 5: Run all client and cloud tests**

Run: `npm test && npm run test:cloud`

Expected: PASS with zero runtime reference to `strava-auth`, `strava-callback`, OAuth state, token encryption, or page parsing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(strava): retire account authorization and metrics"
```

### Task 9: Add Cleanup, Migration, and Resource Governance

**Files:**
- Create: `cloudfunctions/route-maintenance/index.js`
- Create: `cloudfunctions/route-maintenance/index.node-test.js`
- Create: `cloudfunctions/route-maintenance/package.json`
- Create: `cloudfunctions/route-maintenance/package-lock.json`
- Modify: `cloudbaserc.json`
- Modify: `scripts/bootstrap-cloudbase.mjs`
- Modify: `scripts/bootstrap-cloudbase.node-test.mjs`
- Modify: `scripts/prepare-cloudfunctions.mjs`
- Modify: `scripts/verify-cloud-packages.mjs`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `cloudstorage.rules.json`

- [ ] **Step 1: Write failing governance and cleanup tests**

```js
test('bootstrap manages route_previews and no OAuth collections', () => {
  assert.equal(COLLECTIONS.includes('route_previews'), true);
  for (const retired of ['oauth_states', 'oauth_attempts', 'strava_credentials', 'strava_snapshots'])
    assert.equal(COLLECTIONS.includes(retired), false);
});

test('cleanup never deletes attached GPX or generated route images', async () => {
  const result = await cleanupBatch(store, now);
  assert.deepEqual(result.deletedFileIds, unattachedExpiredFiles);
});
```

- [ ] **Step 2: Run governance tests and confirm failures**

Run: `npm run test:bootstrap && node --test cloudfunctions/route-maintenance/index.node-test.js`

Expected: FAIL for missing route resources and remaining OAuth resources.

- [ ] **Step 3: Implement bounded cleanup and retirement migration**

The maintenance function processes stable `_id` cursor batches and:

```text
1. removes expired, unconsumed route previews;
2. deletes GPX/PNG objects only when no activity references them and they are older than 24h;
3. rewrites legacy strava_route_url/id to generic external route fields;
4. removes unsupported Strava preview image URLs;
5. removes profile/registration Strava compatibility fields and demotes Strava-origin avatar media;
6. purges OAuth state, attempt, credential, snapshot, and old route-preview documents after
   OAUTH_RETIREMENT_PURGE_ENABLED=1 is set on the maintenance function.
```

- [ ] **Step 4: Update build/install/audit and storage policy**

`package.json` and CI install, test, cache, and audit `route-web`/`route-maintenance`; no command mentions the deleted OAuth packages. Storage allows only authenticated owner writes to:

```text
profiles/<openid>/...
activity-routes/<openid>/...
```

- [ ] **Step 5: Run governance and package verification**

Run: `npm run test:bootstrap && npm run verify:cloud-packages && npm run cloudbase:plan`

Expected: PASS; the read-only plan targets the configured environment, adds route resources, and reports no OAuth resources in desired state.

- [ ] **Step 6: Commit**

```bash
git add cloudfunctions/route-maintenance cloudbaserc.json cloudstorage.rules.json scripts package.json package-lock.json .github/workflows/ci.yml
git commit -m "chore(cloud): govern route previews and OAuth retirement"
```

### Task 10: Synchronize Current Documentation and UI Showcase

**Files:**
- Modify: `README.md`
- Modify: `docs/requirements-design.md`
- Modify: `docs/cloudbase-schema.md`
- Modify: `docs/sandbox-environment-configuration.md`
- Modify: `docs/templates.js`
- Modify: `docs/schema.js`
- Modify: `docs/ui-sync-manifest.json`
- Modify: `docs/high-priority-issues.md`
- Modify: relevant current tests under `tests/`

- [ ] **Step 1: Write failing current-document and showcase contracts**

```ts
expect(requirements).toContain('Strava 官方路线');
expect(requirements).toContain('GPX');
expect(currentDeploymentDocs).not.toMatch(/STRAVA_CLIENT_SECRET|STRAVA_TOKEN_ENCRYPTION_KEY/);
expect(showcaseTemplates).toContain('上传 GPX');
expect(showcaseTemplates).toContain('查看官方路线');
```

- [ ] **Step 2: Run documentation/UI tests and confirm failures**

Run: `npm run test:ui-sync && npm run check:ui-sync && npm run test:release-notes`

Expected: FAIL until current artifacts describe the new route experience.

- [ ] **Step 3: Update current product/deployment documents and showcase**

Historical specs, plans, releases, and evidence remain unchanged. Current requirements, schema, README, sandbox setup, Pages prototype, route manifest, and high-priority status describe the new model and user-first copy.

- [ ] **Step 4: Run documentation/UI gates**

Run: `npm run test:ui-sync && npm run check:ui-sync && npm run test:release-notes && npm run check:release-notes`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add README.md docs
git commit -m "docs(route): document official embed and GPX details"
```

### Task 11: Full Local Validation and Visual Gate

**Files:**
- Create: `docs/evidence/ui-sync/2026-10-13-route-embed-gpx-no-oauth/README.md`
- Create: `docs/evidence/ui-sync/2026-10-13-route-embed-gpx-no-oauth/manifest.json`
- Create: affected `*-devtools.png` and `*-pages.png` evidence files
- Modify: `docs/ui-sync-manifest.json`
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: Run focused suites**

Run:

```bash
npx vitest run tests/route-utils.test.ts tests/route-outline.test.ts tests/activity-admin-edit.test.ts tests/activity-detail-design.test.ts tests/strava-retirement.test.ts
npm --prefix cloudfunctions/activity-admin test
npm --prefix cloudfunctions/activity-read test
node --test cloudfunctions/route-web/index.node-test.js cloudfunctions/route-maintenance/index.node-test.js
```

Expected: PASS.

- [ ] **Step 2: Run repository validation**

Run: `npm run validate`

Expected: PASS for format, lint, typecheck, client tests, cloud tests, schema/bootstrap, release notes, package verification, UI sync, and build.

- [ ] **Step 3: Capture 375x812 visual evidence**

Run the Pages prototype and WeChat DevTools against:

```text
pages/admin/activity-edit/index
pages/activity-detail/index
pages/route-view/index
pages/profile/index
pages/capability-card/index
pages/admin/reviews/index
pages/admin/review-detail/index
```

Expected: matching route identity, visible light-theme copy and controls, no overlap, route charts/outline visible, and no account authorization UI.

- [ ] **Step 4: Update evidence and high-priority status**

Record the commit, exact test commands, image dimensions, compared routes, and remaining physical-device checks. Do not mark the P0 complete before deployed runtime and device acceptance.

- [ ] **Step 5: Commit**

```bash
git add docs/evidence docs/ui-sync-manifest.json docs/high-priority-issues.md
git commit -m "test(route): capture GPX route visual evidence"
```

### Task 12: Deploy, Purge, Read Back, and Accept

**Files:**
- Modify: `docs/high-priority-issues.md`
- Create: `docs/verification/2026-10-13-route-embed-gpx-no-oauth.md`

- [ ] **Step 1: Apply and verify desired CloudBase resources**

Run:

```bash
npm run cloudbase:plan
npm run cloudbase:apply
npm run cloudbase:verify
```

Expected: `route_previews`, route indexes, `route-web`, and `route-maintenance` desired resources are present; OAuth resources are absent from desired configuration.

- [ ] **Step 2: Deploy new route functions before the mini program**

Run:

```bash
npx --yes -p @cloudbase/cli@3.8.4 tcb fn deploy activity-admin
npx --yes -p @cloudbase/cli@3.8.4 tcb fn deploy activity-read
npx --yes -p @cloudbase/cli@3.8.4 tcb fn deploy route-web
npx --yes -p @cloudbase/cli@3.8.4 tcb fn deploy route-maintenance
```

Expected: every function reaches Active state and deployed code readback matches the local package.

- [ ] **Step 3: Upload and verify the mini program**

Run: `npm run deploy:miniprogram`

Expected: CI upload succeeds for the exact validated commit.

- [ ] **Step 4: Execute runtime acceptance before purge**

In WeChat DevTools and on one physical device:

```text
upload a real GPX -> verify distance/gain/loss/min/max/chart/outline
save and reopen -> verify trusted details persist
download GPX -> verify bytes equal the uploaded source
open official route -> verify embed works without an app account
simulate embed failure -> verify route link can still be copied
replace/remove GPX -> verify old files become cleanup candidates
```

- [ ] **Step 5: Enable the one-time purge and verify absence**

Set `OAUTH_RETIREMENT_PURGE_ENABLED=1` only after Step 4 passes, invoke/await bounded maintenance until complete, then delete the two retired OAuth functions and their gateway routes/secrets.

Read back:

```text
oauth_states = 0
oauth_attempts = 0
strava_credentials = 0
strava_snapshots = 0
strava_route_previews = 0
no profile/registration Strava snapshot fields
no deployed strava-auth or strava-callback function
no /strava/callback, /strava/success, /strava/failure route
```

- [ ] **Step 6: Record acceptance and update the P0**

Document deployed versions, readback hashes, GPX fixture checksum, metric comparison, DevTools/device screenshots, and residual iOS/Android checks. Remove the P0 row only after both platforms pass.

- [ ] **Step 7: Commit delivery evidence**

```bash
git add docs/verification/2026-10-13-route-embed-gpx-no-oauth.md docs/high-priority-issues.md
git commit -m "docs(route): record deployment and acceptance evidence"
```

## Self-Review

- Spec coverage: official embed, strict URL validation, GPX parsing, trusted preview/save, metrics, elevation, outline, generated background, original download, lifecycle cleanup, legacy migration, OAuth retirement, purge, documentation, visual gate, deployment, and device acceptance all map to Tasks 1-12.
- Placeholder scan: no implementation step delegates unspecified error handling, validation, tests, or code.
- Type consistency: client `RouteGpxPreview` maps server `route_previews.summary`; activity route fields use `externalProvider`, `externalRouteId`, `externalRouteUrl`, `gpxPreviewId`, `gpxFileId`, `gpxSha256`, and `generatedPreviewFileId` consistently.
- Rollout consistency: purge is gated until the deployed app no longer reads old data and runtime acceptance passes.
