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
  athleteName: 'Rider',
  snapshot: null,
  error: null,
};
const registration = { id: 'r1' } as Registration;

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

  afterEach(() => vi.unstubAllGlobals());

  it('onShow 预加载审核模板 ID', async () => {
    page.data.notificationTemplateIds = [];
    await page.onShow();
    expect(rideService.getReviewNotificationTemplateIds).toHaveBeenCalledOnce();
    expect(page.data.notificationTemplateIds).toEqual(['approved-template', 'rejected-template']);
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
    page.data.bikeMode = '';
    await page.submit();
    expect(rideService.requestReviewNotificationSubscription).not.toHaveBeenCalled();
    expect(rideService.saveRegistration).not.toHaveBeenCalled();

    page.data.bikeMode = '自带车';
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
