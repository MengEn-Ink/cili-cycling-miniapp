import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { activityDisplayStatus } from '../miniprogram/utils/activity';
import { occupiedCount } from '../miniprogram/utils/capacity';
import { canTransition, transition } from '../miniprogram/utils/registration';
import { validateRegistration } from '../miniprogram/utils/validation';
import { maskId, maskPhone } from '../miniprogram/utils/mask';
import { weightedAverageSpeed } from '../miniprogram/utils/strava';
import { activities, profile } from '../miniprogram/mock/fixtures';
import { runtimeConfig } from '../miniprogram/config/runtime';
import { initializeCloud } from '../miniprogram/config/cloud-init';

const ready = { state: 'ready' as const, canRegister: true };
const syncing = { state: 'syncing' as const, canRegister: false };
const failed = { state: 'failed' as const, canRegister: false };
const pageRideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getStravaReadiness: vi.fn(),
  ensureStravaReady: vi.fn(),
  getReviewNotificationTemplateIds: vi.fn(),
  requestReviewNotificationSubscription: vi.fn(),
  saveRegistration: vi.fn(),
  getRegistration: vi.fn(),
  getActivity: vi.fn(),
  cancelRegistration: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService: pageRideService }));

describe('运行时配置', () => {
  it('使用此里公开配置并固定云数据模式', () => {
    expect(runtimeConfig).toEqual({
      brandName: '此里',
      cloudEnvId: 'cloudbase-d0gizacy77a1ab017',
      dataMode: 'cloud',
    });
  });

  it('云能力缺失时跳过，存在时使用配置环境初始化', () => {
    expect(initializeCloud(undefined)).toBe('unavailable');
    const calls: unknown[] = [];
    const cloud = { init: (options: unknown) => calls.push(options) };
    expect(initializeCloud(cloud)).toBe('initialized');
    expect(calls).toEqual([{ env: runtimeConfig.cloudEnvId, traceUser: true }]);
    expect(
      initializeCloud({
        init: () => {
          throw new Error('init failed');
        },
      }),
    ).toBe('failed');
  });
});

describe('活动状态', () => {
  it('区分报名中、满员、截止、结束', () => {
    const a = activities[0];
    expect(activityDisplayStatus(a, 1, new Date('2026-09-28'))).toBe('报名中');
    expect(activityDisplayStatus(a, 18, new Date('2026-09-28'))).toBe('已满');
    expect(activityDisplayStatus(a, 1, new Date('2026-10-16'))).toBe('已截止');
    expect(activityDisplayStatus(a, 1, new Date('2026-10-19'))).toBe('已结束');
  });
});
describe('名额占用', () => {
  it('仅 pending 和 approved 占位', () =>
    expect(
      occupiedCount([
        { status: 'pending' },
        { status: 'approved' },
        { status: 'rejected' },
        { status: 'cancelled' },
      ]),
    ).toBe(2));
});
describe('报名迁移', () => {
  it('允许审批、取消和重报', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('rejected', 'pending')).toBe(true);
    expect(canTransition('cancelled', 'pending')).toBe(true);
  });
  it('拒绝非法迁移', () => expect(() => transition('approved', 'rejected')).toThrow());
});
describe('表单校验', () => {
  it('完整表单通过', () =>
    expect(
      validateRegistration({
        profile,
        bikeMode: '自带车',
        experience: '常骑',
        readiness: ready,
      }),
    ).toEqual([]));
  it('云端脱敏资料按 sensitiveStatus 校验', () => {
    const masked = {
      ...profile,
      realName: '曹**',
      phone: '138****5678',
      emergencyPhone: '139****5678',
      sensitiveStatus: { realName: true, phone: true, emergencyPhone: true },
    };
    expect(
      validateRegistration({
        profile: masked,
        bikeMode: '自带车',
        experience: '常骑',
        readiness: ready,
      }),
    ).toEqual([]);
    expect(
      validateRegistration({
        profile: { ...masked, sensitiveStatus: { ...masked.sensitiveStatus, phone: false } },
        bikeMode: '自带车',
        experience: '常骑',
        readiness: ready,
      }),
    ).toContain('手机号格式错误');
  });
  it('资料完整度门禁包含昵称', () => {
    expect(
      validateRegistration({
        profile: { ...profile, nickname: '' },
        bikeMode: '自带车',
        experience: '常骑',
        readiness: ready,
      }),
    ).toContain('请填写昵称');
  });
  it('ready 但服务端不允许报名时阻断', () => {
    expect(
      validateRegistration({
        profile,
        bikeMode: '自带车',
        experience: '常骑',
        readiness: { state: 'ready', canRegister: false },
      }),
    ).toContain('Strava 数据尚未准备完成');
  });
  it('同步中提示正在准备', () => {
    expect(
      validateRegistration({ profile, bikeMode: '自带车', experience: '常骑', readiness: syncing }),
    ).toContain('Strava 数据正在准备');
  });
  it('失败时提示重试准备', () => {
    expect(
      validateRegistration({ profile, bikeMode: '自带车', experience: '常骑', readiness: failed }),
    ).toContain('请重试 Strava 数据准备');
  });
  it('阻断未绑定 Strava 与错误手机号', () => {
    const p = { ...profile, phone: '123' };
    expect(
      validateRegistration({
        profile: p,
        bikeMode: '',
        experience: '',
        readiness: { state: 'disconnected', canRegister: false },
      }).length,
    ).toBeGreaterThan(2);
  });
});

describe('报名页面门禁', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(pageRideService)) value.mockReset();
    pageRideService.getReviewNotificationTemplateIds.mockResolvedValue([]);
    pageRideService.requestReviewNotificationSubscription.mockResolvedValue(undefined);
    vi.stubGlobal('wx', { navigateTo: vi.fn(), redirectTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/registration-form/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('onShow 自动准备 Strava 并保存完整 readiness', async () => {
    pageRideService.getProfile.mockResolvedValue(profile);
    pageRideService.getStravaReadiness.mockResolvedValue({
      ...syncing,
      athleteName: null,
      snapshot: null,
      error: null,
    });
    pageRideService.ensureStravaReady.mockResolvedValue({
      ...ready,
      athleteName: 'Rider',
      snapshot: null,
      error: null,
    });

    await page.onShow();

    expect(pageRideService.ensureStravaReady).toHaveBeenCalledOnce();
    expect(page.data.readiness).toMatchObject({ state: 'ready', canRegister: true });
  });

  it('readiness 请求失败时保持失败门禁而非伪装未绑定', async () => {
    pageRideService.getProfile.mockResolvedValue(profile);
    pageRideService.getStravaReadiness.mockRejectedValue(new Error('网络暂不可用'));

    await page.onShow();

    expect(page.data.readiness).toMatchObject({ state: 'failed', canRegister: false });
    expect(page.data.errors).toContain('网络暂不可用');
  });

  it('提交中忽略重复提交', async () => {
    page.data = { ...page.data, profile, readiness: ready, submitting: true };

    await page.submit();

    expect(pageRideService.saveRegistration).not.toHaveBeenCalled();
  });
});

describe('报名取消操作', () => {
  let page: any;
  let showModal: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    for (const value of Object.values(pageRideService)) value.mockReset();
    showModal = vi.fn();
    vi.stubGlobal('wx', { showModal, redirectTo: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data, item: { id: 'r1', activityId: 'a1' } };
      page.setData = (patch: Record<string, unknown>) => Object.assign(page.data, patch);
    });
    await import('../miniprogram/pages/credential/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('取消报名需确认，用户拒绝时不发请求', async () => {
    showModal.mockImplementation(({ success }: any) => success({ confirm: false }));

    await page.cancel();

    expect(showModal).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '确认取消报名',
        content: '取消后将释放活动名额，可在报名开放期间重新提交。',
      }),
    );
    expect(pageRideService.cancelRegistration).not.toHaveBeenCalled();
    expect(page.data.cancelling).toBe(false);
  });

  it('取消处理中忽略重复点击', async () => {
    page.data.cancelling = true;

    await page.cancel();

    expect(showModal).not.toHaveBeenCalled();
    expect(pageRideService.cancelRegistration).not.toHaveBeenCalled();
  });
});
describe('脱敏', () => {
  it('脱敏手机号和证件', () => {
    expect(maskPhone('13812345678')).toBe('138****5678');
    expect(maskId('110101199001011234')).toBe('110********1234');
  });
});
describe('Strava 加权速度', () => {
  it('按总距离/总移动时间计算', () =>
    expect(
      weightedAverageSpeed([
        { distanceM: 10000, movingTimeS: 1800 },
        { distanceM: 50000, movingTimeS: 7200 },
      ]),
    ).toBe(24));
  it('空数据返回 0', () => expect(weightedAverageSpeed([])).toBe(0));
});
