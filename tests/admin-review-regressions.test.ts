// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const rideService = vi.hoisted(() => ({
  getReviewRegistration: vi.fn(),
  updateRegistration: vi.fn(),
  listActivities: vi.fn(),
  listReviewRegistrations: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'admin',
  authStatus: 'authenticated',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const activities = [
  { id: 'a1', title: '活动一' },
  { id: 'a2', title: '活动二' },
];
const registration = (id: string, activityId: string) => ({
  id,
  activityId,
  status: 'pending',
  profile: {
    nickname: '骑手',
    title: '',
    realName: '曹*',
    phone: '138****5678',
    gender: '',
    emergencyName: '',
    emergencyPhone: '',
    photos: [],
    sensitiveStatus: {
      realName: true,
      phone: true,
      phoneVerified: true,
      phoneSource: 'wechat',
      emergencyPhone: false,
    },
  },
  gatheringMode: '自驾',
  experience: '常骑',
  remark: '',
  strava: {
    status: 'connected',
    years: 3,
    totalKm: 800,
    rides90d: 20,
    longestKm: 100,
    elevationM: 5000,
    speedKmh: 25,
  },
  updatedAt: '2026-09-29T00:00:00.000Z',
});

function installPageCapture() {
  let page: any;
  vi.stubGlobal('Page', (definition: any) => {
    page = definition;
    page.data = { ...definition.data };
    page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
  });
  return () => page;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

describe('管理员审核详情回归', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    appStore.role = 'admin';
    appStore.authStatus = 'authenticated';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    rideService.getReviewRegistration.mockResolvedValue(registration('r1', 'a1'));
    vi.stubGlobal('wx', { cloud: {}, showToast: vi.fn(), navigateBack: vi.fn() });
    const getPage = installPageCapture();
    await import('../miniprogram/pages/admin/review-detail/index');
    page = getPage();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('展示服务端已脱敏手机号并与验证来源同时保留', async () => {
    await page.onLoad({ id: 'r1' });
    const template = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');

    expect(page.data.phone).toBe('138****5678');
    expect(page.data.phoneSource).toBe('微信授权 · 已验证');
    expect(template).toContain('{{phone}}');
    expect(template).toContain('{{phoneSource}}');
  });

  it('把详情中的报名状态映射为中文展示文案', async () => {
    await page.onLoad({ id: 'r1' });
    const template = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');

    expect(page.data.statusText).toBe('待审核');
    expect(template).toContain('{{statusText}}');
    expect(template).not.toContain('{{x.status}}');
  });

  it('离开详情页后丢弃迟到的详情响应', async () => {
    const pending = deferred<ReturnType<typeof registration>>();
    rideService.getReviewRegistration.mockReturnValueOnce(pending.promise);

    const loading = page.onLoad({ id: 'r1' });
    page.onUnload();
    pending.resolve(registration('late', 'a1'));
    await loading;

    expect(page.data.x).toBeNull();
    expect(page.data.loading).toBe(true);
  });

  it('审批中拦截重复点击并在模板上禁用按钮', async () => {
    const pending = deferred<void>();
    rideService.updateRegistration.mockReturnValueOnce(pending.promise);
    await page.onLoad({ id: 'r1' });

    const first = page.act({ currentTarget: { dataset: { s: 'approved' } } });
    await vi.waitFor(() => expect(page.data.submitting).toBe(true));
    await page.act({ currentTarget: { dataset: { s: 'approved' } } });

    expect(rideService.updateRegistration).toHaveBeenCalledOnce();
    const template = readFileSync('miniprogram/pages/admin/review-detail/index.wxml', 'utf8');
    expect(template).toContain('disabled="{{submitting}}"');
    expect(template).toContain('loading="{{submitting}}"');

    pending.resolve();
    await first;
    expect(page.data.submitting).toBe(false);
    expect(page.data.statusText).toBe('已通过');
  });
});

describe('管理员审核列表回归', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    appStore.role = 'admin';
    appStore.authStatus = 'authenticated';
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    rideService.listActivities.mockResolvedValue(activities);
    vi.stubGlobal('wx', { cloud: {}, navigateTo: vi.fn() });
    const getPage = installPageCapture();
    await import('../miniprogram/pages/admin/reviews/index');
    page = getPage();
  });

  afterEach(() => vi.unstubAllGlobals());

  it('切换活动后立即进入加载态并清空旧审核数据', async () => {
    page.data.activities = activities;
    page.data.activityId = 'a1';
    page.data.selectedActivityTitle = '活动一';
    page.data.all = [registration('r1', 'a1')];
    page.data.items = [registration('r1', 'a1')];
    const pending = deferred<ReturnType<typeof registration>[]>();
    rideService.listReviewRegistrations.mockReturnValue(pending.promise);

    page.choose({ detail: { value: '1' } });

    expect(page.data.loading).toBe(true);
    expect(page.data.all).toEqual([]);
    expect(page.data.items).toEqual([]);

    pending.resolve([registration('r2', 'a2')]);
    await vi.waitFor(() => expect(page.data.loading).toBe(false));
  });

  it('丢弃比最新活动请求更晚返回的旧响应', async () => {
    const oldRequest = deferred<ReturnType<typeof registration>[]>();
    const newRequest = deferred<ReturnType<typeof registration>[]>();
    rideService.listReviewRegistrations.mockImplementation((activityId: string) =>
      activityId === 'a1' ? oldRequest.promise : newRequest.promise,
    );

    page.data.activityId = 'a1';
    const oldLoad = page.load();
    await vi.waitFor(() => expect(rideService.listReviewRegistrations).toHaveBeenCalledWith('a1'));

    page.data.activityId = 'a2';
    const newLoad = page.load();
    await vi.waitFor(() => expect(rideService.listReviewRegistrations).toHaveBeenCalledWith('a2'));

    newRequest.resolve([registration('r2', 'a2')]);
    await newLoad;
    oldRequest.resolve([registration('r1', 'a1')]);
    await oldLoad;

    expect(page.data.activityId).toBe('a2');
    expect(page.data.selectedActivityTitle).toBe('活动二');
    expect(page.data.all.map((item: { id: string }) => item.id)).toEqual(['r2']);
  });

  it('活动加载失败后不会恢复旧审核列表', async () => {
    page.data.activities = activities;
    page.data.activityId = 'a1';
    page.data.selectedActivityTitle = '活动一';
    page.data.all = [registration('r1', 'a1')];
    page.data.items = [registration('r1', 'a1')];
    rideService.listReviewRegistrations.mockRejectedValue(new Error('加载活动二失败'));

    page.choose({ detail: { value: '1' } });
    await vi.waitFor(() => expect(page.data.error).toBe('加载活动二失败'));

    expect(page.data.loading).toBe(false);
    expect(page.data.selectedActivityTitle).toBe('活动二');
    expect(page.data.all).toEqual([]);
    expect(page.data.items).toEqual([]);
  });
});
