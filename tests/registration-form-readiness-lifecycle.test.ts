import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile, StravaReadiness } from '../miniprogram/models';

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
  photos: [{ id: 'cloud://bg', category: 'ride' }],
  backgroundPhoto: { id: 'cloud://bg', category: 'ride' },
  avatarId: 'cloud://avatar',
};

function readiness(state: StravaReadiness['state']): StravaReadiness {
  return {
    state,
    canRegister: state === 'ready',
    avatarAvailable: state === 'ready',
    athleteName: state === 'ready' ? 'Rider' : null,
    snapshot: null,
    error: null,
  };
}

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('报名页 Strava readiness 请求代际', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(rideService)) value.mockReset();
    rideService.getReviewNotificationTemplateIds.mockResolvedValue([]);
    rideService.requestReviewNotificationSubscription.mockResolvedValue(undefined);
    vi.stubGlobal('wx', { navigateTo: vi.fn(), redirectTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
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
    await import('../miniprogram/pages/registration-form/index');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('重复 onShow 时忽略较早请求的迟到结果', async () => {
    let resolveFirstProfile!: (value: Profile) => void;
    rideService.getProfile
      .mockImplementationOnce(
        () =>
          new Promise<Profile>((resolve) => {
            resolveFirstProfile = resolve;
          }),
      )
      .mockResolvedValueOnce(profile);
    rideService.getStravaReadiness
      .mockResolvedValueOnce(readiness('disconnected'))
      .mockResolvedValueOnce(readiness('ready'));

    const firstShow = page.onShow();
    const secondShow = page.onShow();
    await secondShow;
    expect(page.data.readiness).toEqual(readiness('ready'));

    resolveFirstProfile(profile);
    await firstShow;
    expect(page.data.readiness).toEqual(readiness('ready'));
  });

  it.each(['onHide', 'onUnload'] as const)('%s 后忽略在途请求结果', async (lifecycle) => {
    let resolveProfile!: (value: Profile) => void;
    rideService.getProfile.mockImplementationOnce(
      () =>
        new Promise<Profile>((resolve) => {
          resolveProfile = resolve;
        }),
    );
    rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));

    const show = page.onShow();
    page[lifecycle]?.();
    page.setData.mockClear();
    resolveProfile(profile);
    await show;

    expect(page.setData).not.toHaveBeenCalled();
  });

  it.each(['onHide', 'onUnload'] as const)(
    '%s 后当前 ensure 返回 syncing 时不再发起下一轮',
    async (lifecycle) => {
      vi.useFakeTimers();
      let resolveEnsure!: (value: StravaReadiness) => void;
      rideService.getProfile.mockResolvedValue(profile);
      rideService.getStravaReadiness.mockResolvedValue(readiness('syncing'));
      rideService.ensureStravaReady
        .mockImplementationOnce(
          () =>
            new Promise<StravaReadiness>((resolve) => {
              resolveEnsure = resolve;
            }),
        )
        .mockResolvedValueOnce(readiness('ready'));

      const show = page.onShow();
      await flushMicrotasks();
      expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();

      page[lifecycle]();
      resolveEnsure(readiness('syncing'));
      await flushMicrotasks();
      await vi.advanceTimersByTimeAsync(1500);
      await show;

      expect(rideService.ensureStravaReady).toHaveBeenCalledOnce();
    },
  );

  it('提交期间禁止跳转资料页和 Strava 页', () => {
    page.data.submitting = true;

    page.profile();
    page.strava();

    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it.each(['onHide', 'onUnload'] as const)(
    '%s 后迟到的提交成功不得 redirect',
    async (lifecycle) => {
      let resolveSubmission!: (value: { id: string }) => void;
      rideService.getProfile.mockResolvedValue(profile);
      rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));
      rideService.saveRegistration.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSubmission = resolve;
          }),
      );
      page.onLoad({ id: 'a1' });
      await page.onShow();
      expect(page.data.activityCanSubmit).toBe(true);
      page.data.gatheringMode = 'self_drive';

      const submission = page.submit();
      await flushMicrotasks();
      expect(rideService.saveRegistration).toHaveBeenCalledOnce();
      page[lifecycle]();
      resolveSubmission({ id: 'r1' });
      await submission;

      expect(wx.redirectTo).not.toHaveBeenCalled();
    },
  );

  it('在途提交返回前再次 onShow 仍保持锁定且不能重复提交', async () => {
    let resolveSubmission!: (value: { id: string }) => void;
    rideService.getProfile.mockResolvedValue(profile);
    rideService.getStravaReadiness.mockResolvedValue(readiness('ready'));
    rideService.saveRegistration.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    page.onLoad({ id: 'a1' });
    await page.onShow();
    page.data.gatheringMode = 'self_drive';

    const firstSubmission = page.submit();
    await flushMicrotasks();
    page.onHide();
    await page.onShow();

    expect(page.data.submitting).toBe(true);
    const secondSubmission = page.submit();
    expect(rideService.saveRegistration).toHaveBeenCalledOnce();

    resolveSubmission({ id: 'r1' });
    await Promise.all([firstSubmission, secondSubmission]);
    expect(page.data.submitting).toBe(false);
    expect(wx.redirectTo).not.toHaveBeenCalled();
  });
});
