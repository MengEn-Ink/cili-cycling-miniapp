import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { activityDisplayStatus } from '../miniprogram/utils/activity';
import { occupiedCount } from '../miniprogram/utils/capacity';
import { canTransition, transition } from '../miniprogram/utils/registration';
import { validateRegistration } from '../miniprogram/utils/validation';
import { activities, profile } from '../miniprogram/mock/fixtures';
import { runtimeConfig } from '../miniprogram/config/runtime';
import { initializeCloud } from '../miniprogram/config/cloud-init';

const registrationProfile = {
  ...profile,
  avatarId: 'cloud://avatar',
  backgroundPhoto: { id: 'cloud://bg', category: 'ride' },
  photos: [{ id: 'cloud://bg', category: 'ride' }],
};
const pageRideService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getReviewNotificationTemplateIds: vi.fn(),
  requestReviewNotificationSubscription: vi.fn(),
  saveRegistration: vi.fn(),
  getRegistration: vi.fn(),
  getActivity: vi.fn(),
  listRegistrations: vi.fn(),
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
  it('列表只使用服务端报名裁决，不受设备时间或本地名额重算影响', () => {
    const a = activities[0];
    expect(
      activityDisplayStatus({
        ...a,
        endAt: '2000-01-01T00:00:00.000Z',
        deadline: '2000-01-01T00:00:00.000Z',
        occupiedCount: a.capacity,
        registrationState: 'open',
        closedReason: null,
      }),
    ).toBe('报名中');
    expect(activityDisplayStatus({ ...a, registrationState: 'closed', closedReason: 'full' })).toBe(
      '名额已满',
    );
    expect(
      activityDisplayStatus({ ...a, registrationState: 'closed', closedReason: 'deadline' }),
    ).toBe('报名已截止');
    expect(
      activityDisplayStatus({ ...a, registrationState: 'closed', closedReason: 'finished' }),
    ).toBe('活动已结束');
    expect(
      activityDisplayStatus({ ...a, registrationState: undefined, closedReason: undefined }),
    ).toBe('活动状态不可用');
  });
});
describe('名额占用', () => {
  it('pending、approved 和 checked_in 占位', () =>
    expect(
      occupiedCount([
        { status: 'pending' },
        { status: 'approved' },
        { status: 'checked_in' },
        { status: 'rejected' },
        { status: 'cancelled' },
      ]),
    ).toBe(3));
});
describe('报名迁移', () => {
  it('允许审批、签到、取消和重报', () => {
    expect(canTransition('pending', 'approved')).toBe(true);
    expect(canTransition('approved', 'checked_in')).toBe(true);
    expect(canTransition('rejected', 'pending')).toBe(true);
    expect(canTransition('cancelled', 'pending')).toBe(true);
  });
  it('签到后不可取消且重复状态不走普通迁移', () => {
    expect(canTransition('checked_in', 'cancelled')).toBe(false);
    expect(canTransition('checked_in', 'checked_in')).toBe(false);
  });
  it('拒绝非法迁移', () => expect(() => transition('approved', 'rejected')).toThrow());
});
describe('表单校验', () => {
  it('完整表单通过', () =>
    expect(
      validateRegistration({
        profile: registrationProfile,
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toEqual([]));
  it.each(['', 'unknown'])('缺失或未知集合方式 %s 时阻断', (gatheringMode) => {
    expect(
      validateRegistration({
        profile: registrationProfile,
        gatheringMode,
        experience: '常骑',
      }),
    ).toContain('请选择集合方式');
  });
  it('云端脱敏资料按 sensitiveStatus 校验', () => {
    const masked = {
      ...registrationProfile,
      realName: '曹**',
      phone: '138****5678',
      emergencyPhone: '139****5678',
      sensitiveStatus: { realName: true, phone: true, emergencyPhone: true },
    };
    expect(
      validateRegistration({
        profile: masked,
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toEqual([]);
    expect(
      validateRegistration({
        profile: { ...masked, sensitiveStatus: { ...masked.sensitiveStatus, phone: false } },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请填写有效联系电话');
  });
  it('资料完整度门禁包含昵称', () => {
    expect(
      validateRegistration({
        profile: { ...registrationProfile, nickname: '' },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请授权并填写微信昵称');
  });
  it('缺少真实姓名时阻断（真实姓名为报名硬门槛）', () => {
    expect(
      validateRegistration({
        profile: {
          ...registrationProfile,
          realName: '',
          sensitiveStatus: { realName: false, phone: true, emergencyPhone: true },
        },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请填写真实姓名');
  });
  it('错误手机号与空选项仍然阻断', () => {
    const p = { ...registrationProfile, phone: '123' };
    expect(
      validateRegistration({
        profile: p,
        gatheringMode: '',
        experience: '',
      }).length,
    ).toBeGreaterThan(2);
  });
  it('缺少性别时阻断并提示先在个人资料选择', () => {
    expect(
      validateRegistration({
        profile: { ...registrationProfile, gender: '' },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请在个人资料中选择性别');
  });
  it('性别为非法值时同样阻断', () => {
    expect(
      validateRegistration({
        profile: { ...registrationProfile, gender: '保密' },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请在个人资料中选择性别');
  });
  it('缺失头像时阻断', () => {
    expect(
      validateRegistration({
        profile: { ...registrationProfile, avatarId: '' },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toContain('请设置非默认头像');
  });
  it('个人照片不再作为报名强制项', () => {
    expect(
      validateRegistration({
        profile: { ...registrationProfile, backgroundPhoto: null, photos: [] },
        gatheringMode: 'self_drive',
        experience: '常骑',
      }),
    ).toEqual([]);
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

  it('onShow 只加载报名所需资料', async () => {
    page.data.activityId = activities[0].id;
    pageRideService.getProfile.mockResolvedValue(profile);
    pageRideService.getActivity.mockResolvedValue(activities[0]);
    pageRideService.listRegistrations.mockResolvedValue([]);

    await page.onShow();

    expect(page.data.profile).toMatchObject(profile);
  });

  it('提交中忽略重复提交', async () => {
    page.data = { ...page.data, profile, submitting: true };

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
      page.data = {
        ...definition.data,
        item: { id: 'r1', activityId: 'a1', status: 'pending' },
      };
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

  it('已签到时取消入口不可调用', async () => {
    page.data.item.status = 'checked_in';

    await page.cancel();

    expect(showModal).not.toHaveBeenCalled();
    expect(pageRideService.cancelRegistration).not.toHaveBeenCalled();
  });

  it('取消处理中忽略重复点击', async () => {
    page.data.cancelling = true;

    await page.cancel();

    expect(showModal).not.toHaveBeenCalled();
    expect(pageRideService.cancelRegistration).not.toHaveBeenCalled();
  });
});
describe('个人信息完整显示', () => {
  it('本人资料的手机号和紧急联系电话完整显示，不打星号', () => {
    expect(profile.phone).toMatch(/^1\d{10}$/);
    expect(profile.emergencyPhone).toBe('13900005678');
    expect(`${profile.realName}${profile.phone}${profile.emergencyPhone}`).not.toContain('*');
  });
});
