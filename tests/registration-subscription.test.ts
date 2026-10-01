import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, Registration, StravaReadiness } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getActivity: vi.fn(),
  listRegistrations: vi.fn(),
  getStravaReadiness: vi.fn(),
  ensureStravaReady: vi.fn(),
  getReviewNotificationTemplateIds: vi.fn(),
  requestReviewNotificationSubscription: vi.fn(),
  saveRegistration: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const profile: Profile = {
  avatarRevision: 0,
  nickname: 'Rider',
  title: 'Rider',
  realName: '骑手',
  phone: '13800138000',
  gender: '男',
  emergencyName: '联系人',
  emergencyPhone: '13900139000',
  photos: [],
};
const readiness: StravaReadiness = {
  state: 'ready',
  canRegister: true,
  avatarAvailable: true,
  athleteName: 'Rider',
  snapshot: null,
  error: null,
};
const registration = { id: 'r1' } as Registration;

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('报名提交订阅消息授权', () => {
  let page: any;
  let redirectTo: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    redirectTo = vi.fn();
    vi.stubGlobal('wx', { navigateTo: vi.fn(), redirectTo });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = {
        ...definition.data,
        activityId: 'a1',
        gatheringMode: 'self_drive',
        profile,
        readiness,
        notificationTemplateIds: ['approved-template', 'rejected-template'],
        activityAction: { kind: 'register', label: '立即报名', enabled: true },
        activityCanSubmit: true,
        loading: false,
      };
      page.pageVisible = true;
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    rideService.getProfile.mockResolvedValue(profile);
    rideService.getActivity.mockResolvedValue({
      id: 'a1',
      status: 'published',
      capacity: 20,
      occupiedCount: 1,
      registrationState: 'open',
      deadline: '2099-10-15T12:00:00.000Z',
      endAt: '2099-10-18T08:00:00.000Z',
    });
    rideService.listRegistrations.mockResolvedValue([]);
    rideService.getStravaReadiness.mockResolvedValue(readiness);
    rideService.getReviewNotificationTemplateIds.mockResolvedValue([
      'approved-template',
      'rejected-template',
    ]);
    rideService.requestReviewNotificationSubscription.mockResolvedValue(undefined);
    rideService.saveRegistration.mockResolvedValue(registration);
    await import('../miniprogram/pages/registration-form/index');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('onShow 预加载审核模板 ID', async () => {
    page.data.notificationTemplateIds = [];
    await page.onShow();
    await flushMicrotasks();
    expect(rideService.getReviewNotificationTemplateIds).toHaveBeenCalledOnce();
    expect(page.data.notificationTemplateIds).toEqual(['approved-template', 'rejected-template']);
  });

  it('onShow 对模板去重并限制单次授权最多三个', async () => {
    rideService.getReviewNotificationTemplateIds.mockResolvedValueOnce([
      'approved-template',
      'rejected-template',
      'approved-template',
      'promoted-template',
      'reminder-template',
    ]);
    page.data.notificationTemplateIds = [];

    await page.onShow();
    await flushMicrotasks();

    expect(page.data.notificationTemplateIds).toEqual([
      'approved-template',
      'rejected-template',
      'promoted-template',
    ]);
  });

  it('模板配置永不返回时主加载仍结束且报名资格不受影响', async () => {
    vi.useFakeTimers();
    rideService.getReviewNotificationTemplateIds.mockReturnValue(new Promise(() => undefined));
    page.data.notificationTemplateIds = [];

    await page.onShow();

    expect(page.data.loading).toBe(false);
    expect(page.data.activityCanSubmit).toBe(true);
    await page.submit();
    expect(rideService.saveRegistration).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(2000);
  });

  it('模板配置失败或 1 秒超时都清空旧模板且不阻塞主加载', async () => {
    rideService.getReviewNotificationTemplateIds.mockRejectedValueOnce(new Error('config failed'));
    page.data.notificationTemplateIds = ['stale-template'];
    await page.onShow();
    await flushMicrotasks();
    expect(page.data.loading).toBe(false);
    expect(page.data.notificationTemplateIds).toEqual([]);

    vi.useFakeTimers();
    rideService.getReviewNotificationTemplateIds.mockReturnValueOnce(new Promise(() => undefined));
    page.data.notificationTemplateIds = ['stale-template'];
    const loading = page.onShow();
    await flushMicrotasks();
    await loading;
    expect(page.data.loading).toBe(false);
    expect(page.data.notificationTemplateIds).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(page.data.notificationTemplateIds).toEqual([]);
  });

  it('较早页面代际的模板迟到响应不覆盖新列表', async () => {
    let resolveFirst!: (ids: string[]) => void;
    rideService.getReviewNotificationTemplateIds
      .mockImplementationOnce(
        () =>
          new Promise<string[]>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(['new-template']);

    await page.onShow();
    await page.onShow();
    await flushMicrotasks();
    expect(page.data.notificationTemplateIds).toEqual(['new-template']);

    resolveFirst(['stale-template']);
    await flushMicrotasks();
    expect(page.data.notificationTemplateIds).toEqual(['new-template']);
  });

  it('有效点击先请求订阅再提交报名', async () => {
    await page.submit();
    expect(rideService.requestReviewNotificationSubscription).toHaveBeenCalledWith([
      'approved-template',
      'rejected-template',
    ]);
    expect(
      rideService.requestReviewNotificationSubscription.mock.invocationCallOrder[0],
    ).toBeLessThan(rideService.saveRegistration.mock.invocationCallOrder[0]);
    expect(redirectTo).toHaveBeenCalledWith({ url: '/pages/credential/index?id=r1' });
  });

  it('无效表单和重复提交都不会弹订阅授权', async () => {
    page.data.gatheringMode = '';
    await page.submit();
    expect(rideService.requestReviewNotificationSubscription).not.toHaveBeenCalled();
    expect(rideService.saveRegistration).not.toHaveBeenCalled();

    page.data.gatheringMode = 'self_drive';
    page.data.submitting = true;
    await page.submit();
    expect(rideService.requestReviewNotificationSubscription).not.toHaveBeenCalled();
  });

  it('订阅 API 失败不阻断报名', async () => {
    rideService.requestReviewNotificationSubscription.mockRejectedValueOnce(
      new Error('subscription unavailable'),
    );

    await page.submit();

    expect(rideService.saveRegistration).toHaveBeenCalledOnce();
    expect(redirectTo).toHaveBeenCalledOnce();
  });
});
