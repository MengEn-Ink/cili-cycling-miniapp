# Activity Location Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make activity route selection recover cleanly from cancellation, system-location failures, platform configuration failures, and save/selection races without requesting the obsolete `scope.userLocation`.

**Architecture:** Keep `wx.chooseLocation` inside the existing activity edit page and add one page-level selection state. A small error classifier maps raw platform failures to stable user actions; the page and WXML use the state to make route selection and activity saving mutually exclusive.

**Tech Stack:** WeChat Mini Program TypeScript/WXML, Vitest, existing page-definition test harness.

---

### Task 1: Lock The Failure And Concurrency Contracts

**Files:**
- Modify: `tests/activity-media-location.test.ts`

- [ ] **Step 1: Extend the WeChat test double**

Add promise-style modal behavior while preserving call inspection:

```ts
wxApi = {
  cloud: { uploadFile: vi.fn(), deleteFile: vi.fn().mockResolvedValue({ fileList: [] }) },
  chooseMedia: vi.fn(),
  chooseLocation: vi.fn(),
  showToast: vi.fn(),
  showModal: vi.fn().mockResolvedValue({ confirm: true, cancel: false }),
  pageScrollTo: vi.fn(),
};
```

- [ ] **Step 2: Write cancellation and system-location RED tests**

```ts
it('取消地图选点不报错，系统定位关闭时给出可操作提示', async () => {
  await page.onLoad({ id: 'a1' });
  wxApi.chooseLocation.mockRejectedValueOnce({
    errMsg: 'chooseLocation:fail cancel',
  });
  await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'start' } } });
  expect(page.data.error).toBe('');
  expect(wxApi.showModal).not.toHaveBeenCalled();
  expect(page.data.choosingLocation).toBe('');

  wxApi.chooseLocation.mockRejectedValueOnce({
    errMsg: 'chooseLocation:fail system permission denied',
  });
  await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'start' } } });
  expect(wxApi.showModal).toHaveBeenCalledWith({
    title: '无法打开地图选点',
    content: '请在系统设置中开启微信的定位权限和定位服务后重试。',
    showCancel: false,
  });
  expect(page.data.choosingLocation).toBe('');
});
```

- [ ] **Step 3: Write platform-configuration RED test**

```ts
it('接口或隐私配置缺失时提示管理员处理且不回显原始错误', async () => {
  await page.onLoad({ id: 'a1' });
  wxApi.chooseLocation.mockRejectedValue({
    errMsg: 'chooseLocation:fail api scope is not declared in the privacy agreement',
  });
  await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'end' } } });
  expect(wxApi.showModal).toHaveBeenCalledWith({
    title: '地图选点暂不可用',
    content: '请联系管理员检查微信后台接口权限和用户隐私保护指引。',
    showCancel: false,
  });
  expect(page.data.error).not.toContain('api scope');
});
```

- [ ] **Step 4: Write selection/save mutual-exclusion RED test**

```ts
it('地图选点与保存互斥且重复选点不会启动第二个请求', async () => {
  await page.onLoad({ id: 'a1' });
  let resolveLocation!: (value: unknown) => void;
  wxApi.chooseLocation.mockReturnValue(
    new Promise((resolve) => {
      resolveLocation = resolve;
    }),
  );
  const choosing = page.chooseRouteLocation({
    currentTarget: { dataset: { target: 'start' } },
  });
  expect(page.data.choosingLocation).toBe('start');

  await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'end' } } });
  await page.save({ currentTarget: { dataset: { status: 'draft' } } });
  expect(wxApi.chooseLocation).toHaveBeenCalledTimes(1);
  expect(rideService.saveActivity).not.toHaveBeenCalled();

  resolveLocation({
    name: '集合广场',
    address: '湖滨路 1 号',
    latitude: 30.2,
    longitude: 120.1,
  });
  await choosing;
  expect(page.data.choosingLocation).toBe('');

  page.data.saving = true;
  await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'end' } } });
  expect(wxApi.chooseLocation).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 5: Write WXML and privacy-boundary RED assertions**

Extend the existing successful selection test:

```ts
expect(template).toContain(
  'loading="{{choosingLocation === \'start\'}}" disabled="{{saving || !!choosingLocation}}"',
);
expect(template).toContain(
  'disabled="{{saving || uploading || !!choosingLocation}}"',
);
const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
expect(appConfig.requiredPrivateInfos).toEqual(['chooseLocation']);
expect(appConfig.permission).toBeUndefined();
```

- [ ] **Step 6: Run focused tests and verify RED**

Run:

```bash
npx vitest run tests/activity-media-location.test.ts
```

Expected: failures for missing `choosingLocation`, missing modal classification, missing mutual exclusion, and missing WXML bindings.

- [ ] **Step 7: Commit the tests-only RED**

```bash
git add tests/activity-media-location.test.ts
git commit -m "test(activity): lock location selection recovery"
```

### Task 2: Implement The Minimal Recovery State Machine

**Files:**
- Modify: `miniprogram/pages/admin/activity-edit/index.ts`
- Modify: `miniprogram/pages/admin/activity-edit/index.wxml`

- [ ] **Step 1: Add a stable failure classifier**

Add below `isCancel`:

```ts
type LocationFailure = 'cancel' | 'system-location' | 'platform-config' | 'unknown';

function locationFailure(error: unknown): LocationFailure {
  const message =
    typeof (error as { errMsg?: unknown })?.errMsg === 'string'
      ? (error as { errMsg: string }).errMsg.toLowerCase()
      : '';
  if (message.includes('cancel')) return 'cancel';
  if (
    /system permission denied|location service|location unavailable|gps|定位服务/.test(message)
  )
    return 'system-location';
  if (
    /privacy|not declared|requiredprivateinfos|api scope|api.*not.*open|errno[:= ]*112/.test(
      message,
    )
  )
    return 'platform-config';
  return 'unknown';
}
```

- [ ] **Step 2: Add page selection state**

Add to `data`:

```ts
choosingLocation: '' as '' | 'start' | 'end',
```

- [ ] **Step 3: Implement mutual exclusion and stable error handling**

Replace `chooseRouteLocation` with:

```ts
async chooseRouteLocation(event: any) {
  if (this.data.saving || this.data.choosingLocation) return;
  const target = event.currentTarget.dataset.target === 'end' ? 'end' : 'start';
  this.setData({ choosingLocation: target, error: '' });
  try {
    const selected = await wx.chooseLocation({});
    if (
      typeof selected.latitude !== 'number' ||
      typeof selected.longitude !== 'number' ||
      !Number.isFinite(selected.latitude) ||
      !Number.isFinite(selected.longitude)
    )
      throw new Error('所选地点缺少有效坐标');
    const location: ActivityLocation = {
      name: typeof selected.name === 'string' ? selected.name : '',
      address: typeof selected.address === 'string' ? selected.address : '',
      latitude: selected.latitude,
      longitude: selected.longitude,
    };
    const text = location.name || location.address;
    if (!text) throw new Error('所选地点缺少名称或地址');
    this.setData(
      target === 'start'
        ? { 'form.routeStart': text, routeStartLocation: location }
        : { 'form.routeEnd': text, routeEndLocation: location },
    );
    this.recomputePublishReadiness();
  } catch (error) {
    const failure = locationFailure(error);
    if (failure === 'system-location') {
      await wx.showModal({
        title: '无法打开地图选点',
        content: '请在系统设置中开启微信的定位权限和定位服务后重试。',
        showCancel: false,
      });
    } else if (failure === 'platform-config') {
      await wx.showModal({
        title: '地图选点暂不可用',
        content: '请联系管理员检查微信后台接口权限和用户隐私保护指引。',
        showCancel: false,
      });
    } else if (failure !== 'cancel') {
      this.setData({ error: '地点选择失败，请重试' });
    }
  } finally {
    this.setData({ choosingLocation: '' });
  }
},
```

Update the save guard:

```ts
if (this.data.saving || this.data.uploading || this.data.choosingLocation) return;
```

- [ ] **Step 4: Bind loading and disabled UI states**

Update both route buttons:

```xml
<button class="inline-action-button location-quick-button" loading="{{choosingLocation === 'start'}}" disabled="{{saving || !!choosingLocation}}" data-target="start" bindtap="chooseRouteLocation" aria-label="在地图中选择集合点">地图选点</button>
<button class="inline-action-button location-quick-button" loading="{{choosingLocation === 'end'}}" disabled="{{saving || !!choosingLocation}}" data-target="end" bindtap="chooseRouteLocation" aria-label="在地图中选择路线终点">地图选点</button>
```

Add `|| !!choosingLocation` to every save/publish/finish button's `disabled` expression.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx vitest run tests/activity-media-location.test.ts
```

Expected: all tests in the file pass.

- [ ] **Step 6: Run adjacent activity tests**

Run:

```bash
npx vitest run tests/activity-admin-edit.test.ts tests/activity-cta.test.ts tests/unified-bright-first-batch-contract.test.ts
```

Expected: all tests pass with no snapshots or layout contracts changed unexpectedly.

- [ ] **Step 7: Commit the implementation**

```bash
git add miniprogram/pages/admin/activity-edit/index.ts miniprogram/pages/admin/activity-edit/index.wxml
git commit -m "fix(activity): recover from location selection failures"
```

### Task 3: Release Evidence And Full Verification

**Files:**
- Modify: `miniprogram/pages/settings/index.ts`
- Modify: `tests/settings-page.test.ts`
- Modify: `docs/high-priority-issues.md`

- [ ] **Step 1: Write release-note RED**

Update `tests/settings-page.test.ts` to require one additional release note whose first entry is:

```ts
expect(page.data.releaseNotes[0]).toMatchObject({
  version: '2026.10.10.13',
  latest: true,
  title: '活动地图选点恢复',
});
```

Run:

```bash
npx vitest run tests/settings-page.test.ts
```

Expected: FAIL because `2026.10.10.12` is still latest.

- [ ] **Step 2: Add the release note**

Prepend:

```ts
{
  version: '2026.10.10.13',
  date: '2026-10-10',
  title: '活动地图选点恢复',
  summary: '补齐活动起终点选点失败提示和保存竞态保护。',
  latest: true,
  features: [
    '取消选点不再误报错误，系统定位关闭时给出明确恢复指引',
    '接口或隐私配置异常时提示管理员检查后台配置',
    '选点与保存互斥，避免晚到坐标覆盖已提交表单',
  ],
},
```

Set `2026.10.10.12` to `latest: false`, then rerun the settings test and expect PASS.

- [ ] **Step 3: Run complete local validation**

Run:

```bash
npm run validate
```

Expected: formatting, lint, typecheck, Vitest, journey evidence, bootstrap, deployment tests, all cloud-function tests, package verification, and build pass.

- [ ] **Step 4: Update issue evidence**

Record tests-only RED SHA, implementation SHA, focused/full verification counts, and change HP-09 to `PENDING_EVIDENCE`. Keep physical-device and WeChat management-console checks explicit.

- [ ] **Step 5: Commit and push evidence**

```bash
git add miniprogram/pages/settings/index.ts tests/settings-page.test.ts docs/high-priority-issues.md
git commit -m "docs(activity): record location recovery gate"
git push origin main
```

- [ ] **Step 6: Track remote delivery**

Verify main CI success and actual WeChat development-version upload. Use `miniprogram-automator` to confirm the activity editor loads, both map buttons remain right-aligned, and initial `choosingLocation` is empty. Do not claim physical-device recovery or management-console approval from developer-tool evidence.
