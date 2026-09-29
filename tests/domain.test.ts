import { describe, it, expect } from 'vitest';
import { activityDisplayStatus } from '../miniprogram/utils/activity';
import { occupiedCount } from '../miniprogram/utils/capacity';
import { canTransition, transition } from '../miniprogram/utils/registration';
import { validateRegistration } from '../miniprogram/utils/validation';
import { maskId, maskPhone } from '../miniprogram/utils/mask';
import { weightedAverageSpeed } from '../miniprogram/utils/strava';
import { activities, profile } from '../miniprogram/mock/fixtures';
import { runtimeConfig } from '../miniprogram/config/runtime';
import { initializeCloud } from '../miniprogram/config/cloud-init';

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
        stravaStatus: 'connected',
      }),
    ).toEqual([]));
  it('云端脱敏资料按 sensitiveStatus 校验', () => {
    const masked = {
      ...profile,
      realName: '曹**',
      phone: '138****5678',
      idNumber: '110***********1234',
      emergencyPhone: '139****5678',
      sensitiveStatus: { realName: true, phone: true, idNumber: true, emergencyPhone: true },
    };
    expect(
      validateRegistration({
        profile: masked,
        bikeMode: '自带车',
        experience: '常骑',
        stravaStatus: 'connected',
      }),
    ).toEqual([]);
    expect(
      validateRegistration({
        profile: { ...masked, sensitiveStatus: { ...masked.sensitiveStatus, phone: false } },
        bikeMode: '自带车',
        experience: '常骑',
        stravaStatus: 'connected',
      }),
    ).toContain('手机号格式错误');
  });
  it('阻断无 Strava 与错误手机号', () => {
    const p = { ...profile, phone: '123' };
    expect(
      validateRegistration({ profile: p, bikeMode: '', experience: '', stravaStatus: 'pending' })
        .length,
    ).toBeGreaterThan(2);
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
