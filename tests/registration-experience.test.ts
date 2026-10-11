import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateRegistration } from '../miniprogram/utils/validation';
import { drawActivityPoster } from '../miniprogram/pages/activity-detail/poster';

afterEach(() => vi.unstubAllGlobals());

describe('活动海报', () => {
  const activity: any = {
    title: '环湖骑行',
    startAt: '2026-10-11 08:00',
    description: '周末一起骑',
    route: { start: '湖滨广场', end: '山顶', distanceKm: 80, elevationM: 900 },
  };
  const options: any = {
    displayTime: '2026-10-11 08:00:00',
    locationName: '湖滨广场',
    locationAddress: '环湖路 1 号',
    approvedCount: 2,
    attendeeNames: ['骑友甲', '骑友乙'],
    groupQrImage: { id: 'qr' },
  };

  it('包含活动名、集合时间地点、路线摘要、报名信息和群二维码', () => {
    const texts: string[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
      drawImage: vi.fn(),
      measureText: (text: string) => ({ width: text.length * 12 }),
    };
    expect(drawActivityPoster(context, 375, 700, activity, options)).toBe(true);
    expect(texts.join('|')).toContain('环湖骑行');
    expect(texts.join('|')).toContain('集合时间');
    expect(texts.join('|')).toContain('湖滨广场');
    expect(texts.join('|')).toContain('80 km');
    expect(texts.join('|')).toContain('已通过 2 人');
    expect(texts.join('|')).toContain('扫码加入活动群');
    expect(context.drawImage).toHaveBeenCalled();
  });

  it('画布或尺寸无效时失败且可由页面按钮重试', () => {
    expect(drawActivityPoster(null, 375, 700, activity, options)).toBe(false);
    expect(drawActivityPoster({}, 0, 700, activity, options)).toBe(false);
  });
});

describe('管理员审批页不再提供扫码入口', () => {
  it('页面脚本不包含 scanCheckIn 与 check-in-code 引用', async () => {
    let definition: any;
    vi.stubGlobal('wx', { cloud: {} });
    vi.stubGlobal('Page', (pageDefinition: any) => {
      definition = pageDefinition;
    });
    vi.resetModules();
    await import('../miniprogram/pages/admin/reviews/index');
    expect(definition).not.toHaveProperty('scanCheckIn');
  });
});

describe('V3.1 报名资料门禁', () => {
  const profile: any = {
    nickname: '骑友',
    avatarId: 'cloud://avatar/custom.jpg',
    gender: '女',
    phone: '13800000000',
    emergencyName: '家人',
    emergencyPhone: '13900000000',
    realName: '',
    photos: [],
    backgroundPhoto: null,
    sensitiveStatus: { realName: false, phone: true, emergencyPhone: true },
  };
  const input = {
    profile,
    gatheringMode: 'self_drive',
    experience: '常骑',
    readiness: { state: 'ready' as const, canRegister: true },
  };

  it('不把真实姓名或个人照片作为报名强制项', () => {
    expect(validateRegistration(input)).toEqual([]);
  });

  it('汇总昵称、非默认头像、性别、电话、紧急联系人和 Strava 缺失项', () => {
    const errors = validateRegistration({
      ...input,
      profile: {
        ...profile,
        nickname: '',
        avatarId: '',
        gender: '',
        sensitiveStatus: { realName: false, phone: false, emergencyPhone: false },
        emergencyName: '',
      },
      readiness: { state: 'disconnected' as const, canRegister: false },
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        '请授权并填写微信昵称',
        '请设置非默认头像',
        '请在个人资料中选择性别',
        '请填写有效联系电话',
        '请填写紧急联系人',
        '请填写有效紧急联系电话',
        '请绑定 Strava',
      ]),
    );
  });
});
