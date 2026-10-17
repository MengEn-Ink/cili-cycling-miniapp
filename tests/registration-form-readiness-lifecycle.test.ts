import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getActivity: vi.fn(),
  listRegistrations: vi.fn(),
  getReviewNotificationTemplateIds: vi.fn(),
  requestReviewNotificationSubscription: vi.fn(),
  saveRegistration: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const profile: Profile = {
  avatarRevision: 0,
  clubs: [],
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

async function flushMicrotasks(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await Promise.resolve();
}

describe('报名页请求代际', () => {
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

  it('日常活动默认自行前往且不展示后援车选择', async () => {
    rideService.getProfile.mockResolvedValue(profile);

    page.onLoad({ id: 'a1' });
    await page.onShow();

    expect(page.data).toMatchObject({
      gatheringMode: 'self_drive',
      showGatheringChoice: false,
    });
  });

  it('骑行经验默认不选，未选时提交按钮置灰并提示还差 1 项', async () => {
    rideService.getProfile.mockResolvedValue(profile);

    page.onLoad({ id: 'a1' });
    await page.onShow();

    expect(page.data.experience).toBe('');
    expect(page.data.submitBlockedHint).toBe('还差 1 项：骑行经验');

    page.set({ currentTarget: { dataset: { key: 'experience' } }, detail: { value: '新手' } });
    expect(page.data.experience).toBe('新手');
    expect(page.data.submitBlockedHint).toBe('');
  });

  it('资料与集合方式同时缺失时汇总剩余项数', async () => {
    rideService.getProfile.mockResolvedValue({ ...profile, phone: '' });

    page.onLoad({ id: 'a1' });
    await page.onShow();
    page.set({ currentTarget: { dataset: { key: 'gatheringMode' } }, detail: { value: '' } });

    expect(page.data.submitBlockedHint).toBe('还差 3 项：个人资料、集合方式、骑行经验');
  });

  it('配置后援车名额的活动继续展示集合方式选择', async () => {
    rideService.getProfile.mockResolvedValue(profile);
    rideService.getActivity.mockResolvedValue({
      id: 'a1',
      status: 'published',
      capacity: 20,
      occupiedCount: 1,
      registrationState: 'open',
      deadline: '2099-10-15T12:00:00.000Z',
      endAt: '2099-10-18T08:00:00.000Z',
      supportVehicleCapacity: 4,
      selfDriveCapacity: 16,
    });

    page.onLoad({ id: 'a1' });
    await page.onShow();

    expect(page.data).toMatchObject({
      gatheringMode: 'self_drive',
      showGatheringChoice: true,
    });
  });

  it('重复 onShow 时忽略较早请求的迟到结果', async () => {
    let resolveFirstProfile!: (value: Profile) => void;
    const newerProfile = { ...profile, nickname: '新请求' };
    rideService.getProfile
      .mockImplementationOnce(
        () =>
          new Promise<Profile>((resolve) => {
            resolveFirstProfile = resolve;
          }),
      )
      .mockResolvedValueOnce(newerProfile);

    const firstShow = page.onShow();
    const secondShow = page.onShow();
    await secondShow;
    expect(page.data.profile.nickname).toBe('新请求');

    resolveFirstProfile(profile);
    await firstShow;
    expect(page.data.profile.nickname).toBe('新请求');
  });

  it.each(['onHide', 'onUnload'] as const)('%s 后忽略在途请求结果', async (lifecycle) => {
    let resolveProfile!: (value: Profile) => void;
    rideService.getProfile.mockImplementationOnce(
      () =>
        new Promise<Profile>((resolve) => {
          resolveProfile = resolve;
        }),
    );
    const show = page.onShow();
    page[lifecycle]?.();
    page.setData.mockClear();
    resolveProfile(profile);
    await show;

    expect(page.setData).not.toHaveBeenCalled();
  });

  it('提交期间禁止跳转资料页', () => {
    page.data.submitting = true;

    page.profile();

    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it.each(['onHide', 'onUnload'] as const)(
    '%s 后迟到的提交成功不得 redirect',
    async (lifecycle) => {
      let resolveSubmission!: (value: { id: string }) => void;
      rideService.getProfile.mockResolvedValue(profile);
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
      page.data.experience = '常骑';

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
    rideService.saveRegistration.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSubmission = resolve;
        }),
    );
    page.onLoad({ id: 'a1' });
    await page.onShow();
    page.data.gatheringMode = 'self_drive';
    page.data.experience = '常骑';

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
