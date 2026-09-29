import { afterEach, describe, expect, it, vi } from 'vitest';
import { CloudRepository, CloudRepositoryError } from '../miniprogram/repositories/cloud';
import { MockRepository } from '../miniprogram/repositories/mock';

type CloudCall = { name: string; data?: unknown };
type Queued = unknown | Error;

function cloudWith(...queued: Queued[]) {
  const callFunction = vi.fn(async (options: CloudCall) => {
    void options;
    const next = queued.shift();
    if (next instanceof Error) throw next;
    return { result: next };
  });
  return { cloud: { callFunction }, callFunction };
}
const success = (data: unknown) => ({ ok: true, data });

const activity = {
  _id: 'a1',
  title: '环湖骑行',
  cover_image: 'cloud://covers/a1.jpg',
  event_start: '2026-10-18T00:00:00.000Z',
  event_end: new Date('2026-10-18T08:00:00.000Z'),
  signup_deadline: '2026-10-15T12:00:00.000Z',
  status: 'published',
  capacity: 20,
  occupied_count: 3,
  description: '说明',
  route: {
    start: '起点',
    end: '终点',
    distance_km: 80,
    elevation_m: 600,
    level: '进阶',
    gpx_file_id: 'cloud://routes/a1.gpx',
  },
  schedule: [{ time: '08:00', title: '集合', location: '起点', remark: '停车场集合' }],
  notices: ['守规'],
  equipment: ['头盔'],
  fee: { included: ['保险'], excluded: ['午餐'], remark: '无报名费' },
  registration_state: 'open',
  closed_reason: null,
  server_now: '2026-09-29T04:00:00.000Z',
};
const registration = {
  _id: 'r1',
  activity_id: 'a1',
  status: 'pending',
  profile_snapshot: {
    nickname: '骑手',
    real_name_masked: '曹*',
    phone_masked: '138****5678',
    id_number_masked: '11******1234',
  },
  options: { gathering_mode: 'support_vehicle', experience: 'regular', remark: '无忌口' },
  strava_status: 'connected',
  strava_snapshot: {
    years_on_strava: 4,
    total_km: 1200,
    activities_90d: 32,
    longest_km: 168,
    total_elevation_m: 1850,
    weighted_avg_speed_kmh: 27.4,
    latest_activity_at: null,
    synced_at: '2026-09-29T04:00:00.000Z',
    coverage_from: '2026-07-01T04:00:00.000Z',
    coverage_to: '2026-09-29T04:00:00.000Z',
    coverage_complete: true,
  },
  review_history: [{ action: 'reject', comment: '补充资料' }],
  serial_no: 'RE-001',
  updated_at: new Date('2026-09-28T12:00:00.000Z'),
};
const readinessDto = {
  state: 'ready',
  can_register: true,
  athlete_name: 'Rider',
  snapshot: {
    total_km: 1200,
    activities_90d: 32,
    longest_km: null,
    total_elevation_m: 9000,
    weighted_avg_speed_kmh: 27.4,
    latest_activity_at: null,
    synced_at: '2026-09-29T04:00:00.000Z',
    coverage_from: '2026-07-01T04:00:00.000Z',
    coverage_to: '2026-09-29T04:00:00.000Z',
    coverage_complete: false,
  },
  error: null,
};
const personalCapabilityCardDto = {
  state: 'partial',
  generated_at: '2026-09-29T04:10:00.000Z',
  profile: {
    display_name: '山野骑手',
    title: '周末爬坡手',
  },
  backgrounds: [
    {
      url: 'https://temporary.example/ride-1.jpg',
      source: 'user_photo',
      category: 'ride',
    },
    {
      url: 'https://temporary.example/bike-1.jpg',
      source: 'user_photo',
      category: 'bike',
    },
  ],
  summary: {
    total_km_90d: 812.5,
    rides_90d: 28,
    longest_km: null,
    elevation_m_90d: 9300,
    weighted_avg_speed_kmh: 25.6,
  },
  coverage: {
    from: '2026-07-01T04:00:00.000Z',
    to: '2026-09-29T04:00:00.000Z',
    complete: false,
  },
  synced_at: '2026-09-29T04:05:00.000Z',
};

function expectCall(callFunction: ReturnType<typeof vi.fn>, name: string, data: unknown) {
  expect(callFunction).toHaveBeenLastCalledWith({ name, data });
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toMatchObject({ name: 'CloudRepositoryError', code });
}

describe('CloudRepository 活动读取适配', () => {
  it('列表使用 activity-read/list 并完整映射公开 DTO', async () => {
    const { cloud, callFunction } = cloudWith(success([activity]));
    const result = await new CloudRepository(cloud).listActivities();

    expectCall(callFunction, 'activity-read', { action: 'list' });
    expect(result).toEqual([
      {
        id: 'a1',
        title: '环湖骑行',
        date: '2026-10-18T00:00:00.000Z',
        startAt: '2026-10-18T00:00:00.000Z',
        endAt: '2026-10-18T08:00:00.000Z',
        deadline: '2026-10-15T12:00:00.000Z',
        status: 'published',
        capacity: 20,
        occupiedCount: 3,
        description: '说明',
        coverImage: 'cloud://covers/a1.jpg',
        route: {
          start: '起点',
          end: '终点',
          distanceKm: 80,
          elevationM: 600,
          level: '进阶',
          gpxFileId: 'cloud://routes/a1.gpx',
        },
        schedule: activity.schedule,
        notices: ['守规'],
        equipment: ['头盔'],
        fee: '无报名费',
        feeIncluded: ['保险'],
        feeExcluded: ['午餐'],
        registrationState: 'open',
        closedReason: null,
        serverNow: '2026-09-29T04:00:00.000Z',
      },
    ]);
  });

  it('详情使用 detail action，并处理字符串费用与边界默认值', async () => {
    const edge = {
      _id: 'a2',
      title: '极简活动',
      status: 'finished',
      capacity: 1,
      fee: '免费',
      event_start: new Date('invalid'),
      event_end: 1,
      signup_deadline: null,
      route: { start: 1, distance_km: '80' },
      schedule: {},
      notices: null,
      equipment: '头盔',
      registration_state: 'closed',
      closed_reason: 'finished',
      server_now: '2026-09-29T04:00:00.000Z',
    };
    const { cloud, callFunction } = cloudWith(success(edge));
    const result = await new CloudRepository(cloud).getActivity('a2');

    expectCall(callFunction, 'activity-read', { action: 'detail', activityId: 'a2' });
    expect(result).toMatchObject({
      id: 'a2',
      status: 'finished',
      fee: '免费',
      occupiedCount: undefined,
      date: '',
      endAt: '',
      deadline: '',
      description: '',
      route: { start: '', end: '', distanceKm: 0, elevationM: 0, level: '' },
      schedule: [],
      notices: [],
      equipment: [],
      registrationState: 'closed',
      closedReason: 'finished',
      serverNow: '2026-09-29T04:00:00.000Z',
    });
  });

  it('费用对象无 remark 时返回空字符串', async () => {
    const { cloud } = cloudWith(success({ ...activity, fee: {} }));
    await expect(new CloudRepository(cloud).getActivity('a1')).resolves.toMatchObject({ fee: '' });
  });

  it.each([
    { name: 'missing state', patch: { registration_state: undefined } },
    { name: 'missing reason', patch: { closed_reason: undefined } },
    { name: 'missing server time', patch: { server_now: undefined } },
    { name: 'invalid state', patch: { registration_state: 'full' } },
    { name: 'open with reason', patch: { closed_reason: 'full' } },
    { name: 'closed without reason', patch: { registration_state: 'closed', closed_reason: null } },
    { name: 'invalid server time', patch: { server_now: 'not-a-date' } },
  ])('公开活动缺失或伪造服务端裁决字段时 fail closed: $name', async ({ patch }) => {
    const dto = { ...activity, ...patch };
    const { cloud } = cloudWith(success([dto]));

    await expectCode(new CloudRepository(cloud).listActivities(), 'INVALID_RESPONSE');
  });
});

describe('CloudRepository 个人骑行名片适配', () => {
  it('只调用 profile/capabilityCard 并映射固定 DTO', async () => {
    const { cloud, callFunction } = cloudWith(success(personalCapabilityCardDto));

    await expect(new CloudRepository(cloud).getPersonalCapabilityCard()).resolves.toEqual({
      state: 'partial',
      generatedAt: '2026-09-29T04:10:00.000Z',
      profile: {
        displayName: '山野骑手',
        title: '周末爬坡手',
      },
      backgrounds: [
        {
          url: 'https://temporary.example/ride-1.jpg',
          source: 'user_photo',
          category: 'ride',
        },
        {
          url: 'https://temporary.example/bike-1.jpg',
          source: 'user_photo',
          category: 'bike',
        },
      ],
      summary: {
        totalKm90d: 812.5,
        rides90d: 28,
        longestKm: null,
        elevationM90d: 9300,
        weightedAvgSpeedKmh: 25.6,
      },
      coverage: {
        from: '2026-07-01T04:00:00.000Z',
        to: '2026-09-29T04:00:00.000Z',
        complete: false,
      },
      syncedAt: '2026-09-29T04:05:00.000Z',
    });
    expectCall(callFunction, 'profile', { action: 'capabilityCard' });
  });

  it.each(['cloud://raw-photo', 'http://temporary.example/insecure.jpg'])(
    '拒绝非 HTTPS 名片背景 %s',
    async (url) => {
      const { cloud } = cloudWith(
        success({
          ...personalCapabilityCardDto,
          backgrounds: [{ ...personalCapabilityCardDto.backgrounds[0], url }],
        }),
      );
      await expectCode(new CloudRepository(cloud).getPersonalCapabilityCard(), 'INVALID_RESPONSE');
    },
  );

  it.each(['812.5', Number.POSITIVE_INFINITY])(
    '拒绝非 nullable finite number 指标 %#',
    async (totalKm90d) => {
      const { cloud } = cloudWith(
        success({
          ...personalCapabilityCardDto,
          summary: { ...personalCapabilityCardDto.summary, total_km_90d: totalKm90d },
        }),
      );
      await expectCode(new CloudRepository(cloud).getPersonalCapabilityCard(), 'INVALID_RESPONSE');
    },
  );
});

describe('CloudRepository 队员报名适配', () => {
  it('提供审核通知订阅配置与请求边界', () => {
    const repository = new CloudRepository(cloudWith().cloud) as any;
    expect(typeof repository.getReviewNotificationTemplateIds).toBe('function');
    expect(typeof repository.requestReviewNotificationSubscription).toBe('function');
  });

  it('读取审核通知模板只调用 authenticated subscription-config', async () => {
    const { cloud, callFunction } = cloudWith(
      success({ template_ids: ['approved-template', 'rejected-template'] }),
    );
    const result = await new CloudRepository(cloud).getReviewNotificationTemplateIds();

    expect(result).toEqual(['approved-template', 'rejected-template']);
    expectCall(callFunction, 'notification-send', { action: 'subscription-config' });
  });

  it('拒绝异常订阅配置响应', async () => {
    const { cloud } = cloudWith(success({ template_ids: ['valid', 42] }));
    await expectCode(
      new CloudRepository(cloud).getReviewNotificationTemplateIds(),
      'INVALID_RESPONSE',
    );
  });

  it.each(['accept', 'reject', 'ban'])('订阅结果 %s 都完成请求而不改变报名流程', async (value) => {
    const requestSubscribeMessage = vi.fn(({ success }) => success({ 'approved-template': value }));
    vi.stubGlobal('wx', { requestSubscribeMessage });
    const repository = new CloudRepository(cloudWith().cloud);

    await repository.requestReviewNotificationSubscription([
      'approved-template',
      '',
      'approved-template',
    ]);

    expect(requestSubscribeMessage).toHaveBeenCalledWith({
      tmplIds: ['approved-template'],
      success: expect.any(Function),
      fail: expect.any(Function),
    });
    vi.unstubAllGlobals();
  });

  it('订阅 API 失败映射稳定错误且不泄漏底层信息', async () => {
    vi.stubGlobal('wx', {
      requestSubscribeMessage: vi.fn(({ fail }) => fail({ errMsg: 'private platform detail' })),
    });
    await expectCode(
      new CloudRepository(cloudWith().cloud).requestReviewNotificationSubscription(['template']),
      'SUBSCRIPTION_REQUEST_FAILED',
    );
    vi.unstubAllGlobals();
  });

  it('我的报名和本人详情使用 registration 的 mine/detail', async () => {
    const { cloud, callFunction } = cloudWith(success([registration]), success(registration));
    const repository = new CloudRepository(cloud);

    const mine = await repository.listRegistrations();
    expectCall(callFunction, 'registration', { action: 'mine' });
    const detail = await repository.getRegistration('r1');
    expectCall(callFunction, 'registration', { action: 'detail', registrationId: 'r1' });
    expect(mine[0]).toEqual(detail);
    expect(detail).toMatchObject({
      id: 'r1',
      activityId: 'a1',
      status: 'pending',
      gatheringMode: '需要后援车',
      experience: '常骑',
      remark: '无忌口',
      reviewComment: '补充资料',
      serialNo: 'RE-001',
      profile: {
        nickname: '骑手',
        realName: '曹*',
        phone: '138****5678',
      },
      strava: {
        status: 'connected',
        years: 4,
        totalKm: 1200,
        rides90d: 32,
        longestKm: 168,
        elevationM: 1850,
        speedKmh: 27.4,
        latestActivityAt: null,
        syncedAt: '2026-09-29T04:00:00.000Z',
        coverage: {
          from: '2026-07-01T04:00:00.000Z',
          to: '2026-09-29T04:00:00.000Z',
          complete: true,
        },
      },
      updatedAt: '2026-09-28T12:00:00.000Z',
    });
  });

  it('提交只发送白名单字段，运行时脏对象不能透传可信字段', async () => {
    const { cloud, callFunction } = cloudWith(success(registration));
    const dirty = {
      activityId: 'a1',
      gatheringMode: 'self_drive',
      experience: '有一定经验',
      remark: '正常',
      openid: 'forged',
      role: 'admin',
      status: 'approved',
      capacity: 999,
      amount: 1,
      reviewer_openid: 'forged-admin',
      review_history: [{ action: 'approve' }],
      serial_no: 'forged',
      options: { status: 'approved' },
    } as any;
    await new CloudRepository(cloud).saveRegistration(dirty);

    expectCall(callFunction, 'registration', {
      action: 'submit',
      activityId: 'a1',
      options: {
        gathering_mode: 'self_drive',
        experience: 'intermediate',
        remark: '正常',
      },
    });
    const sent = JSON.stringify(callFunction.mock.calls[0][0]);
    expect(sent).not.toContain('bike_mode');
    for (const forbidden of [
      'openid',
      'role',
      'status',
      'capacity',
      'amount',
      'reviewer_openid',
      'review_history',
      'serial_no',
    ]) {
      expect(sent).not.toContain(forbidden);
    }
  });

  it('运行时对象不能伪装成 ID 透传敏感字段', async () => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      new CloudRepository(cloud).saveRegistration({
        activityId: { openid: 'forged', status: 'approved', capacity: 99, amount: 1 },
        gatheringMode: 'self_drive',
        experience: '常骑',
      } as any),
      'VALIDATION_FAILED',
    );
    await expectCode(
      new CloudRepository(cloud).getReviewRegistration({
        role: 'admin',
        reviewer_openid: 'x',
      } as any),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('驳回后重报仍发送同一个 submit action，服务端 DTO 决定新状态', async () => {
    const rejected = { ...registration, status: 'rejected' };
    const pending = { ...registration, status: 'pending' };
    const { cloud, callFunction } = cloudWith(success(rejected), success(pending));
    const repository = new CloudRepository(cloud);
    const submission = {
      activityId: 'a1',
      gatheringMode: 'support_vehicle' as const,
      experience: '新手',
    };

    expect((await repository.saveRegistration(submission)).status).toBe('rejected');
    expect((await repository.saveRegistration(submission)).status).toBe('pending');
    expect(callFunction).toHaveBeenCalledTimes(2);
    expect(callFunction.mock.calls[0][0]).toEqual(callFunction.mock.calls[1][0]);
  });

  it('提交字段类型异常时使用安全默认值，不透传对象', async () => {
    const { cloud, callFunction } = cloudWith(success(registration));
    await new CloudRepository(cloud).saveRegistration({
      activityId: 'a1',
      gatheringMode: '未知',
      experience: '未知',
      remark: 10,
    } as any);
    expectCall(callFunction, 'registration', {
      action: 'submit',
      activityId: 'a1',
      options: { gathering_mode: undefined, experience: undefined, remark: '' },
    });
  });

  it('取消只发送 registration/cancel', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...registration, status: 'cancelled' }));
    const result = await new CloudRepository(cloud).updateRegistration(
      'r1',
      'cancelled',
      '应被忽略',
    );
    expectCall(callFunction, 'registration', { action: 'cancel', registrationId: 'r1' });
    expect(result.status).toBe('cancelled');
  });

  it('显式取消命令只发送 registration/cancel', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...registration, status: 'cancelled' }));
    const result = await new CloudRepository(cloud).cancelRegistration('r1');
    expectCall(callFunction, 'registration', { action: 'cancel', registrationId: 'r1' });
    expect(result.status).toBe('cancelled');
  });

  it('将 self_drive 集合方式映射为自驾', async () => {
    const selfDrive = {
      ...registration,
      options: { gathering_mode: 'self_drive', experience: 'regular' },
    };
    const { cloud } = cloudWith(success(selfDrive));

    await expect(new CloudRepository(cloud).getReviewRegistration('r1')).resolves.toMatchObject({
      gatheringMode: '自驾',
    });
  });

  it('历史报名缺少 gathering_mode 时兼容读取，且不把 bike_mode 映射成集合方式', async () => {
    const legacy = {
      ...registration,
      options: { bike_mode: 'rent', experience: 'regular', remark: '历史数据' },
    };
    const { cloud } = cloudWith(success(legacy));

    await expect(new CloudRepository(cloud).getRegistration('r1')).resolves.toMatchObject({
      gatheringMode: '',
      experience: '常骑',
      remark: '历史数据',
    });
  });

  it('未知 gathering_mode 读取为空且不阻断管理员详情', async () => {
    const unknown = {
      ...registration,
      options: { gathering_mode: 'unknown', experience: 'regular', remark: '未知值' },
    };
    const { cloud } = cloudWith(success(unknown));

    await expect(new CloudRepository(cloud).getReviewRegistration('r1')).resolves.toMatchObject({
      gatheringMode: '',
      experience: '常骑',
      remark: '未知值',
    });
  });

  it('报名 DTO 缺少可选对象时使用空值，并映射 exempted', async () => {
    const edge = {
      _id: 'r2',
      activity_id: 'a2',
      status: 'approved',
      strava_status: 'exempted',
      exemption: { reason: '人工核验' },
      profile_snapshot: null,
      options: null,
      review_history: [null],
      updated_at: '刚刚',
    };
    const { cloud } = cloudWith(success(edge));
    const result = await new CloudRepository(cloud).getRegistration('r2');
    expect(result).toMatchObject({
      gatheringMode: '',
      experience: '',
      remark: '',
      reviewComment: undefined,
      profile: { nickname: '', realName: '', phone: '' },
      strava: {
        status: 'exempted',
        reason: '人工核验',
        years: null,
        totalKm: null,
        rides90d: null,
        longestKm: null,
        elevationM: null,
        speedKmh: null,
        latestActivityAt: null,
        syncedAt: '',
        coverage: null,
      },
      updatedAt: '刚刚',
    });
  });

  it.each([
    ['缺失', {}],
    ['非有限值', { years_on_strava: Number.POSITIVE_INFINITY }],
  ])('报名 DTO 的 Strava 年限%s时保留为 null', async (_label, stravaSnapshot) => {
    const { cloud } = cloudWith(
      success({
        ...registration,
        strava_snapshot: stravaSnapshot,
      }),
    );

    await expect(new CloudRepository(cloud).getRegistration('r1')).resolves.toMatchObject({
      strava: { years: null },
    });
  });
});

describe('CloudRepository 管理员审批适配', () => {
  it.each(['pending', 'approved', 'rejected', 'cancelled'] as const)(
    '审批列表传递合法过滤状态 %s',
    async (status) => {
      const { cloud, callFunction } = cloudWith(success([registration]));
      await new CloudRepository(cloud).listReviewRegistrations('a1', status);
      expectCall(callFunction, 'admin-review', {
        action: 'list',
        activityId: 'a1',
        filterStatus: status,
      });
    },
  );

  it('审批列表不传过滤条件时省略 filterStatus', async () => {
    const { cloud, callFunction } = cloudWith(success([]));
    await new CloudRepository(cloud).listReviewRegistrations('a1');
    expectCall(callFunction, 'admin-review', { action: 'list', activityId: 'a1' });
  });

  it('运行时伪造审批列表状态被客户端拒绝', async () => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      new CloudRepository(cloud).listReviewRegistrations('a1', 'owner' as any),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('管理员详情只映射 https 临时媒体 URL 且忽略 raw file ID 和敏感脏字段', async () => {
    const dto = {
      ...registration,
      capability_profile: {
        nickname: '山野骑手',
        title: '爬坡王',
        phone_source: 'manual',
        phone_verified: false,
        avatar_url: 'https://temporary.example/avatar',
        avatar_file_id: 'cloud://raw-avatar',
        photos: [
          {
            url: 'https://temporary.example/training',
            file_id: 'cloud://raw-training',
            category: 'bike',
            source: 'user',
            token: 'secret',
          },
          { url: 'http://temporary.example/insecure', category: 'ride', source: 'user' },
        ],
        access_token: 'secret',
        openid: 'private',
      },
    };
    const { cloud, callFunction } = cloudWith(success(dto));
    const result = await new CloudRepository(cloud).getReviewRegistration('r1');
    expectCall(callFunction, 'admin-review', { action: 'detail', registrationId: 'r1' });
    expect(result?.profile).toMatchObject({
      nickname: '山野骑手',
      title: '爬坡王',
      avatarId: 'https://temporary.example/avatar',
      photos: [{ id: 'https://temporary.example/training', category: 'bike' }],
      sensitiveStatus: { phoneSource: 'manual', phoneVerified: false },
    });
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('cloud://');
    expect(JSON.stringify(result)).not.toContain('http://');
    expect(JSON.stringify(result)).not.toContain('id_number');
  });

  it('通过只发送服务端审批命令', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...registration, status: 'approved' }));
    const result = await new CloudRepository(cloud).updateRegistration('r1', 'approved', undefined);
    expectCall(callFunction, 'admin-review', {
      action: 'review',
      registrationId: 'r1',
      decision: 'approve',
      reason: undefined,
    });
    expect(result.status).toBe('approved');
  });

  it('显式审批命令映射 approved 为服务端 approve', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...registration, status: 'approved' }));
    const result = await new CloudRepository(cloud).reviewRegistration(
      'r1',
      'approved',
      '资料完整',
    );
    expectCall(callFunction, 'admin-review', {
      action: 'review',
      registrationId: 'r1',
      decision: 'approve',
      reason: '资料完整',
    });
    expect(result.status).toBe('approved');
  });

  it('驳回发送 reject 与字符串理由，运行时对象理由不会透传', async () => {
    const first = cloudWith(success({ ...registration, status: 'rejected' }));
    await new CloudRepository(first.cloud).updateRegistration('r1', 'rejected', '能力不匹配');
    expectCall(first.callFunction, 'admin-review', {
      action: 'review',
      registrationId: 'r1',
      decision: 'reject',
      reason: '能力不匹配',
    });

    const second = cloudWith(success({ ...registration, status: 'rejected' }));
    await new CloudRepository(second.cloud).updateRegistration('r1', 'rejected', {
      openid: 'forged',
    } as any);
    expectCall(second.callFunction, 'admin-review', {
      action: 'review',
      registrationId: 'r1',
      decision: 'reject',
      reason: undefined,
    });
  });

  it('拒绝客户端请求非法状态迁移且不调用云函数', async () => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      new CloudRepository(cloud).updateRegistration('r1', 'pending'),
      'INVALID_TRANSITION',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });
});

describe('CloudRepository 稳定 envelope 与失败边界', () => {
  it('保留合法业务错误码和消息', async () => {
    const { cloud } = cloudWith({
      ok: false,
      error: { code: 'CAPACITY_FULL', message: '活动名额已满' },
    });
    await expect(new CloudRepository(cloud).listActivities()).rejects.toEqual(
      expect.objectContaining({ code: 'CAPACITY_FULL', message: '活动名额已满' }),
    );
  });

  it('调用异常统一映射 CALL_FAILED 且不泄漏底层错误', async () => {
    const { cloud } = cloudWith(new Error('network token should not escape'));
    await expect(new CloudRepository(cloud).listActivities()).rejects.toEqual(
      expect.objectContaining({ code: 'CALL_FAILED', message: '云函数调用失败' }),
    );
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { ok: 'yes', data: [] },
    { ok: true },
    { ok: false },
    { ok: false, error: null },
    { ok: false, error: { code: '', message: 'x' } },
    { ok: false, error: { code: 'X', message: 1 } },
  ])('空或异常 envelope %# 返回 INVALID_RESPONSE', async (response) => {
    const { cloud } = cloudWith(response);
    await expectCode(new CloudRepository(cloud).listActivities(), 'INVALID_RESPONSE');
  });

  it('成功 envelope 的列表和详情 DTO 形状异常时拒绝', async () => {
    const first = cloudWith(success({}));
    await expectCode(new CloudRepository(first.cloud).listActivities(), 'INVALID_RESPONSE');
    const second = cloudWith(success([null]));
    await expectCode(new CloudRepository(second.cloud).listActivities(), 'INVALID_RESPONSE');
    const third = cloudWith(success({ _id: 'a1', title: 1, status: 'published', capacity: 1 }));
    await expectCode(new CloudRepository(third.cloud).getActivity('a1'), 'INVALID_RESPONSE');
    const fourth = cloudWith(success({ _id: 'r1', activity_id: 'a1', status: 'unknown' }));
    await expectCode(new CloudRepository(fourth.cloud).getRegistration('r1'), 'INVALID_RESPONSE');
  });

  it('无注入且 wx.cloud 不可用时返回 CLOUD_UNAVAILABLE', async () => {
    await expectCode(new CloudRepository().listActivities(), 'CLOUD_UNAVAILABLE');
  });

  it('Profile 只发送白名单，手填手机号按普通资料提交', async () => {
    const dto = {
      nickname: '骑手',
      completeness: 50,
      real_name_masked: '曹*',
      phone_masked: '138****5678',
      sensitive_status: {
        real_name: true,
        phone: true,
        phone_verified: false,
        phone_source: 'manual',
      },
    };
    const { cloud, callFunction } = cloudWith(success(dto), success(dto), success(dto));
    const repository = new CloudRepository(cloud);
    const profile = await repository.getProfile();
    expect(profile.realName).toBe('曹*');
    expect(profile.sensitiveStatus).toMatchObject({
      phone: true,
      phoneVerified: false,
      phoneSource: 'manual',
    });
    const unknown = cloudWith(
      success({
        ...dto,
        sensitive_status: { ...dto.sensitive_status, phone_source: 'forged' },
      }),
    );
    expect(
      (await new CloudRepository(unknown.cloud).getProfile()).sensitiveStatus?.phoneSource,
    ).toBe('');
    await repository.updateProfile({
      nickname: '新昵称',
      avatarFileId: 'cloud://avatar',
      realName: '曹蒙恩',
      phone: '13812345678',
    });
    expectCall(callFunction, 'profile', {
      action: 'update',
      nickname: '新昵称',
      avatar_file_id: 'cloud://avatar',
      real_name: '曹蒙恩',
      phone: '13812345678',
    });
    await repository.getPhoneNumber('dynamic-code');
    expectCall(callFunction, 'profile', { action: 'getPhoneNumber', code: 'dynamic-code' });
  });

  it('请求 owner-bound 媒体上传路径且不发送客户端身份', async () => {
    const { cloud, callFunction } = cloudWith(
      success({
        cloud_path:
          'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
      }),
    );
    await expect(new CloudRepository(cloud).getProfileMediaUploadPath()).resolves.toBe(
      'profiles/0123456789abcdef0123456789abcdef/123e4567-e89b-42d3-a456-426614174000.jpg',
    );
    expectCall(callFunction, 'profile', { action: 'mediaUploadPath' });
  });

  it('上传完成后注册媒体记录且不发送客户端身份', async () => {
    const { cloud, callFunction } = cloudWith(success({ registered: true }));
    await expect(
      new CloudRepository(cloud).registerProfileMedia(
        'cloud://env/profiles/owner/photo.jpg',
        'other',
      ),
    ).resolves.toBeUndefined();
    expectCall(callFunction, 'profile', {
      action: 'registerMedia',
      fileId: 'cloud://env/profiles/owner/photo.jpg',
      category: 'other',
    });
  });

  it('删除失败后可上报 orphan 且不发送客户端身份', async () => {
    const { cloud, callFunction } = cloudWith(success({ reported: true }));
    await expect(
      new CloudRepository(cloud).reportProfileMediaOrphan(
        'cloud://env/profiles/owner/photo.jpg',
        'other',
      ),
    ).resolves.toBeUndefined();
    expectCall(callFunction, 'profile', {
      action: 'reportOrphan',
      fileId: 'cloud://env/profiles/owner/photo.jpg',
      category: 'other',
    });
  });

  it('Profile 完整可选字段与照片分支均按真实值映射', async () => {
    const { cloud } = cloudWith(
      success({
        nickname: '完整骑手',
        completeness: 100,
        title: '领队',
        avatar_file_id: 'cloud://avatar',
        real_name_masked: '曹*',
        phone_masked: '138****5678',
        id_type: '护照',
        id_number_masked: 'E1****89',
        gender: '男',
        emergency_name: '紧急联系人',
        emergency_phone_masked: '139****0000',
        photos: [{ file_id: 'cloud://photo-1', category: 'ride' }, null],
        sensitive_status: {
          real_name: true,
          id_number: true,
          phone: true,
          phone_verified: true,
          phone_source: 'wechat',
          emergency_phone: true,
        },
      }),
    );

    const mapped = await new CloudRepository(cloud).getProfile();
    expect(mapped).toMatchObject({
      title: '领队',
      avatarId: 'cloud://avatar',
      gender: '男',
      emergencyName: '紧急联系人',
      emergencyPhone: '139****0000',
      photos: [{ id: 'cloud://photo-1', category: 'ride' }],
      sensitiveStatus: {
        realName: true,
        phone: true,
        phoneVerified: true,
        phoneSource: 'wechat',
        emergencyPhone: true,
      },
    });
    expect(mapped).not.toHaveProperty('idType');
    expect(mapped).not.toHaveProperty('idNumber');
    expect(mapped.sensitiveStatus).not.toHaveProperty('idNumber');
  });

  it('Strava 状态、授权、同步与解绑均调用真实云函数', async () => {
    const status = {
      connected: true,
      athlete_name: 'Test Rider',
      snapshot: {
        total_km: 42,
        activities_90d: 2,
        longest_km: 30,
        total_elevation_m: 500,
        weighted_avg_speed_kmh: 24,
        latest_activity_at: '2026-09-01',
        synced_at: '2026-09-02',
      },
    };
    const { cloud, callFunction } = cloudWith(
      success(status),
      success({
        authorization_url: 'https://www.strava.com/oauth/authorize?state=x',
        expires_at: '2026-09-01',
      }),
      success(status),
      success({ connected: false }),
    );
    const repository = new CloudRepository(cloud);
    expect((await repository.getStravaStatus()).snapshot?.totalKm).toBe(42);
    expect((await repository.startStrava()).authorizationUrl).toContain('https://');
    expect((await repository.syncStrava()).connected).toBe(true);
    await repository.disconnectStrava();
    expect(callFunction.mock.calls.map((x) => x[0])).toEqual([
      { name: 'strava-auth', data: { action: 'status' } },
      { name: 'strava-auth', data: { action: 'start' } },
      { name: 'strava-auth', data: { action: 'sync' } },
      { name: 'strava-auth', data: { action: 'disconnect' } },
    ]);
  });

  it('兼容滚动部署期间的旧版 Strava connected 响应', async () => {
    const legacyConnected = {
      connected: true,
      athlete_name: 'Legacy Rider',
      snapshot: {
        total_km: 42,
        activities_90d: 2,
        longest_km: 30,
        total_elevation_m: 500,
        weighted_avg_speed_kmh: 24,
        latest_activity_at: '2026-09-28T04:00:00.000Z',
        synced_at: '2026-09-29T04:00:00.000Z',
      },
    };
    const { cloud } = cloudWith(success(legacyConnected), success({ connected: false }));
    const repository = new CloudRepository(cloud);

    await expect(repository.getStravaReadiness()).resolves.toMatchObject({
      state: 'ready',
      canRegister: true,
      athleteName: 'Legacy Rider',
    });
    await expect(repository.getStravaReadiness()).resolves.toEqual({
      state: 'disconnected',
      canRegister: false,
      athleteName: null,
      snapshot: null,
      error: null,
    });
  });

  it('旧连接接口兼容新版 readiness 响应', async () => {
    const { cloud } = cloudWith(success(readinessDto), success(readinessDto));
    const repository = new CloudRepository(cloud);

    await expect(repository.getStravaStatus()).resolves.toMatchObject({
      connected: true,
      athleteName: 'Rider',
    });
    await expect(repository.syncStrava()).resolves.toMatchObject({ connected: true });
  });

  it('映射 Strava readiness，保留 null 指标与覆盖范围', async () => {
    const { cloud, callFunction } = cloudWith(success(readinessDto), success(readinessDto));
    const repository = new CloudRepository(cloud);

    await expect(repository.getStravaReadiness()).resolves.toEqual({
      state: 'ready',
      canRegister: true,
      athleteName: 'Rider',
      snapshot: {
        totalKm: 1200,
        rides90d: 32,
        longestKm: null,
        elevationM: 9000,
        speedKmh: 27.4,
        latestActivityAt: null,
        syncedAt: '2026-09-29T04:00:00.000Z',
        coverage: {
          from: '2026-07-01T04:00:00.000Z',
          to: '2026-09-29T04:00:00.000Z',
          complete: false,
        },
      },
      error: null,
    });
    await expect(repository.ensureStravaReady()).resolves.toMatchObject({ state: 'ready' });
    expect(callFunction.mock.calls.map((call) => call[0])).toEqual([
      { name: 'strava-auth', data: { action: 'status' } },
      { name: 'strava-auth', data: { action: 'ensureReady' } },
    ]);
  });

  it('取消浏览器授权只发送 cancelAuthorization action', async () => {
    const { cloud, callFunction } = cloudWith(success({ cancelled: 1 }));

    await new CloudRepository(cloud).cancelStravaAuthorization();

    expectCall(callFunction, 'strava-auth', { action: 'cancelAuthorization' });
  });

  it('映射失败的 Strava readiness，保留可重试错误且不伪造快照', async () => {
    const { cloud } = cloudWith(
      success({
        state: 'failed',
        can_register: false,
        athlete_name: null,
        snapshot: null,
        error: {
          code: 'STRAVA_API_FAILED',
          message: 'Strava 暂时不可用',
          retryable: true,
        },
      }),
    );

    await expect(new CloudRepository(cloud).getStravaReadiness()).resolves.toEqual({
      state: 'failed',
      canRegister: false,
      athleteName: null,
      snapshot: null,
      error: {
        code: 'STRAVA_API_FAILED',
        message: 'Strava 暂时不可用',
        retryable: true,
      },
    });
  });

  it('readiness 快照存在最近活动时保留严格校验后的时间', async () => {
    const { cloud } = cloudWith(
      success({
        ...readinessDto,
        snapshot: {
          ...readinessDto.snapshot,
          latest_activity_at: '2026-09-28T04:00:00.000Z',
        },
      }),
    );

    await expect(new CloudRepository(cloud).getStravaReadiness()).resolves.toMatchObject({
      snapshot: { latestActivityAt: '2026-09-28T04:00:00.000Z' },
    });
  });

  it('拒绝非字符串的 readiness 运动员名称', async () => {
    const { cloud } = cloudWith(success({ ...readinessDto, athlete_name: 42 }));

    await expectCode(new CloudRepository(cloud).getStravaReadiness(), 'INVALID_RESPONSE');
  });

  it('readiness 的旧快照缺少覆盖范围时映射为 null', async () => {
    const snapshot = { ...readinessDto.snapshot } as Record<string, unknown>;
    delete snapshot.coverage_from;
    delete snapshot.coverage_to;
    delete snapshot.coverage_complete;
    const { cloud } = cloudWith(success({ ...readinessDto, snapshot }));

    await expect(new CloudRepository(cloud).getStravaReadiness()).resolves.toMatchObject({
      snapshot: { coverage: null },
    });
  });

  it.each([
    { ...readinessDto, state: 'complete' },
    {
      ...readinessDto,
      snapshot: { ...readinessDto.snapshot, total_km: Number.POSITIVE_INFINITY },
    },
    {
      ...readinessDto,
      error: { code: 'STRAVA_API_FAILED', message: '失败', retryable: 'yes' },
    },
  ])('拒绝异常 readiness 状态、指标或错误对象 %#', async (dto) => {
    const { cloud } = cloudWith(success(dto));
    await expectCode(new CloudRepository(cloud).getStravaReadiness(), 'INVALID_RESPONSE');
  });

  it('拒绝字段不完整的 readiness 覆盖范围', async () => {
    const { cloud } = cloudWith(
      success({
        ...readinessDto,
        snapshot: { ...readinessDto.snapshot, coverage_to: undefined },
      }),
    );
    await expectCode(new CloudRepository(cloud).getStravaReadiness(), 'INVALID_RESPONSE');
  });

  it('拒绝不可解析的 readiness 时间字段', async () => {
    const { cloud } = cloudWith(
      success({
        ...readinessDto,
        snapshot: { ...readinessDto.snapshot, coverage_from: 'not-a-date' },
      }),
    );
    await expectCode(new CloudRepository(cloud).getStravaReadiness(), 'INVALID_RESPONSE');
  });

  it('拒绝无效 Profile/Strava DTO 与动态 code', async () => {
    const first = cloudWith(success({ nickname: 'x' }));
    await expectCode(new CloudRepository(first.cloud).getProfile(), 'INVALID_RESPONSE');
    const second = cloudWith(success({ connected: 'yes' }));
    await expectCode(new CloudRepository(second.cloud).getStravaStatus(), 'INVALID_RESPONSE');
    const third = cloudWith();
    await expectCode(new CloudRepository(third.cloud).getPhoneNumber(''), 'VALIDATION_FAILED');
    const fourth = cloudWith(success({ authorization_url: 'javascript:bad', expires_at: 'x' }));
    await expectCode(new CloudRepository(fourth.cloud).startStrava(), 'INVALID_RESPONSE');
  });

  it('CloudRepositoryError 保持稳定名称', () => {
    expect(new CloudRepositoryError('X', 'x')).toMatchObject({
      name: 'CloudRepositoryError',
      code: 'X',
    });
  });
});

describe('MockRepository readiness 与显式报名命令', () => {
  let stored: unknown;

  function installStorage() {
    vi.stubGlobal('wx', {
      getStorageSync: vi.fn(() => stored),
      setStorageSync: vi.fn((_key: string, value: unknown) => {
        stored = value;
      }),
    });
  }

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['self_drive', '自驾'],
    ['support_vehicle', '需要后援车'],
  ] as const)('新建报名将集合方式 %s 映射为展示值 %s', async (gatheringMode, expected) => {
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    stored = JSON.parse(JSON.stringify(repository.read()));

    const result = await repository.saveRegistration({
      activityId: `new-${gatheringMode}`,
      gatheringMode,
      experience: '有一定经验',
      remark: '补给点见',
      internalOnly: '不应持久化',
    });

    expect(result).toMatchObject({
      activityId: `new-${gatheringMode}`,
      gatheringMode: expected,
      experience: '有一定经验',
      remark: '补给点见',
    });
    expect(result).not.toHaveProperty('internalOnly');
  });

  it('重报时用本次提交字段替换旧报名内容', async () => {
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    state.registrations[0] = {
      ...state.registrations[0],
      status: 'rejected',
      gatheringMode: '自驾',
      experience: '常骑',
      remark: '旧备注',
    };
    stored = state;

    const result = await repository.saveRegistration({
      activityId: state.registrations[0].activityId,
      gatheringMode: 'support_vehicle',
      experience: '新手',
      remark: '新备注',
      internalOnly: '不应持久化',
    });

    expect(result).toMatchObject({
      status: 'pending',
      gatheringMode: '需要后援车',
      experience: '新手',
      remark: '新备注',
    });
    expect(result).not.toHaveProperty('internalOnly');
  });

  it('ensureStravaReady 从 disconnected 收敛到确定的 ready 快照', async () => {
    installStorage();
    const repository = new MockRepository();
    await repository.disconnectStrava();

    await expect(repository.getStravaReadiness()).resolves.toMatchObject({
      state: 'disconnected',
      canRegister: false,
      snapshot: null,
    });
    await expect(repository.ensureStravaReady()).resolves.toMatchObject({
      state: 'ready',
      canRegister: true,
      athleteName: 'Mock Rider',
      snapshot: {
        longestKm: 168,
        coverage: { complete: true },
      },
    });
  });

  it('显式取消与审批命令复用确定的状态迁移', async () => {
    installStorage();
    const repository = new MockRepository();
    const initial = JSON.parse(JSON.stringify(repository.read()));
    const reviewState = JSON.parse(JSON.stringify(initial));
    stored = initial;

    await expect(repository.cancelRegistration('r1')).resolves.toMatchObject({
      status: 'cancelled',
    });
    stored = reviewState;
    await expect(
      repository.reviewRegistration('r1', 'approved', '资料完整'),
    ).resolves.toMatchObject({
      status: 'approved',
      reviewComment: '资料完整',
    });
  });

  it('提供确定的自用骑行名片响应', async () => {
    installStorage();
    await expect(new MockRepository().getPersonalCapabilityCard()).resolves.toMatchObject({
      state: 'ready',
      profile: { displayName: expect.any(String) },
      backgrounds: expect.any(Array),
      summary: {
        totalKm90d: expect.any(Number),
        rides90d: expect.any(Number),
      },
    });
  });
});

describe('CloudRepository 管理员活动写入契约', () => {
  it('管理员列表和详情只调用独立 activity-admin', async () => {
    const { cloud, callFunction } = cloudWith(success([activity]), success(activity));
    const repository = new CloudRepository(cloud);
    expect((await repository.listAdminActivities())[0].id).toBe('a1');
    expectCall(callFunction, 'activity-admin', { action: 'list' });
    await repository.getAdminActivity('a1');
    expectCall(callFunction, 'activity-admin', { action: 'detail', activityId: 'a1' });
  });

  it('创建仅发送活动白名单并调用 save', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...activity, status: 'draft' }));
    const input = {
      title: '环湖骑行',
      description: '说明',
      startAt: activity.event_start,
      endAt: '2026-10-18T08:00:00.000Z',
      deadline: activity.signup_deadline,
      status: 'draft' as const,
      capacity: 20,
      route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 600, level: '进阶' },
      schedule: activity.schedule,
      notices: ['守规'],
      equipment: ['头盔'],
      fee: '免费',
    };
    await new CloudRepository(cloud).saveActivity({
      ...input,
      occupiedCount: 999,
      created_by: 'forged',
    } as any);
    expectCall(callFunction, 'activity-admin', {
      action: 'save',
      activity: {
        title: '环湖骑行',
        cover_image: '',
        description: '说明',
        schedule: activity.schedule,
        route: { start: '起点', end: '终点', distance_km: 80, elevation_m: 600, level: '进阶' },
        notices: ['守规'],
        equipment: ['头盔'],
        fee: '免费',
        capacity: 20,
        signup_deadline: activity.signup_deadline,
        event_start: activity.event_start,
        event_end: '2026-10-18T08:00:00.000Z',
        status: 'draft',
      },
    });
    expect(JSON.stringify(callFunction.mock.calls[0][0])).not.toContain('occupiedCount');
    expect(JSON.stringify(callFunction.mock.calls[0][0])).not.toContain('created_by');
  });

  it('已有活动只改标题和容量时完整保留嵌套活动 DTO', async () => {
    const updated = { ...activity, title: '新标题', capacity: 25 };
    const { cloud, callFunction } = cloudWith(success(activity), success(updated));
    const repository = new CloudRepository(cloud);
    const current = await repository.getAdminActivity('a1');

    await repository.saveActivity({ ...current!, title: '新标题', capacity: 25 }, 'a1');

    const payload = (callFunction.mock.calls[1][0].data as any).activity;
    expect(payload.cover_image).toBe(activity.cover_image);
    expect(payload.schedule).toEqual(activity.schedule);
    expect(payload.route.gpx_file_id).toBe(activity.route.gpx_file_id);
    expect(payload.fee).toEqual(activity.fee);
    expect(payload.title).toBe('新标题');
    expect(payload.capacity).toBe(25);
  });

  it('更新携带可信格式活动 ID，空 ID 在客户端拒绝', async () => {
    const { cloud, callFunction } = cloudWith(success(activity));
    const value = {
      title: activity.title,
      description: '',
      startAt: activity.event_start,
      endAt: '2026-10-18T08:00:00.000Z',
      deadline: activity.signup_deadline,
      status: 'published' as const,
      capacity: 20,
      route: { start: '', end: '', distanceKm: 0, elevationM: 0, level: '' },
      schedule: [],
      notices: [],
      equipment: [],
      fee: '',
    };
    await new CloudRepository(cloud).saveActivity(value, 'a1');
    expect((callFunction.mock.calls[0][0].data as any).activityId).toBe('a1');
    const invalid = cloudWith();
    await expectCode(
      new CloudRepository(invalid.cloud).saveActivity(value, ''),
      'VALIDATION_FAILED',
    );
    expect(invalid.callFunction).not.toHaveBeenCalled();
  });
});

describe('CloudRepository 活动后援车字段映射', () => {
  it('映射存在的容量拆分和司机字段，并兼容非法可选值', async () => {
    const complete = {
      ...activity,
      support_vehicle_capacity: 8,
      self_drive_capacity: 12,
      support_vehicle_driver: {
        nickname: '王师傅',
        license_plate: '粤B12345',
        contact_phone: '138****5678',
      },
    };
    const malformed = {
      ...activity,
      support_vehicle_capacity: '8',
      self_drive_capacity: null,
      support_vehicle_driver: {
        nickname: 1,
        license_plate: null,
        contact_phone: false,
      },
    };
    const { cloud } = cloudWith(success(complete), success(malformed));
    const repository = new CloudRepository(cloud);

    await expect(repository.getActivity('a1')).resolves.toMatchObject({
      supportVehicleCapacity: 8,
      selfDriveCapacity: 12,
      supportVehicleDriver: {
        nickname: '王师傅',
        licensePlate: '粤B12345',
        contactPhone: '138****5678',
      },
    });
    const mapped = await repository.getActivity('a1');
    expect(mapped).not.toHaveProperty('supportVehicleCapacity');
    expect(mapped).not.toHaveProperty('selfDriveCapacity');
    expect(mapped.supportVehicleDriver).toEqual({
      nickname: '',
      licensePlate: '',
      contactPhone: '',
    });
  });

  it('写入时映射完整字段，非法可选司机值收敛为空字符串', async () => {
    const { cloud, callFunction } = cloudWith(success(activity), success(activity));
    const repository = new CloudRepository(cloud);
    const base = {
      title: '活动',
      description: '',
      capacity: 20,
      deadline: activity.signup_deadline,
      startAt: activity.event_start,
      endAt: '2026-10-18T08:00:00.000Z',
      status: 'draft' as const,
      route: { start: '', end: '', distanceKm: 0, elevationM: 0, level: '' },
      schedule: [],
      notices: [],
      equipment: [],
      fee: '',
    };
    await repository.saveActivity({
      ...base,
      supportVehicleCapacity: 8,
      selfDriveCapacity: 12,
      supportVehicleDriver: {
        nickname: '王师傅',
        licensePlate: '粤B12345',
        contactPhone: '13812345678',
      },
    });
    expect((callFunction.mock.calls[0][0].data as any).activity).toMatchObject({
      support_vehicle_capacity: 8,
      self_drive_capacity: 12,
      support_vehicle_driver: {
        nickname: '王师傅',
        license_plate: '粤B12345',
        contact_phone: '13812345678',
      },
    });

    await repository.saveActivity({
      ...base,
      supportVehicleCapacity: 8.5,
      selfDriveCapacity: '12' as any,
      supportVehicleDriver: { nickname: 1, licensePlate: null, contactPhone: false } as any,
    });
    const payload = (callFunction.mock.calls[1][0].data as any).activity;
    expect(payload).not.toHaveProperty('support_vehicle_capacity');
    expect(payload).not.toHaveProperty('self_drive_capacity');
    expect(payload.support_vehicle_driver).toEqual({
      nickname: '',
      license_plate: '',
      contact_phone: '',
    });
  });
});
