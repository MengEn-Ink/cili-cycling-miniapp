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
  version: 7,
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
    gender: '女',
    real_name: '曹蒙恩',
    real_name_masked: '曹*',
    phone: '13812345678',
    phone_masked: '138****5678',
    id_number_masked: '11******1234',
  },
  options: { gathering_mode: 'support_vehicle', experience: 'regular', remark: '无忌口' },
  strava_status: 'connected',
  strava_snapshot: {
    lifetime_rides: 486,
    lifetime_distance_km: 18240.7,
    lifetime_moving_hours: 734.5,
    lifetime_elevation_m: 215400,
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
const personalCapabilityCardDto = {
  generated_at: '2026-09-29T04:10:00.000Z',
  profile: {
    display_name: '山野骑手',
    gender: '女',
    avatar_url: '',
  },
  backgrounds: [
    {
      file_id: 'cloud://env/profiles/owner/ride-1.jpg',
      url: 'https://temporary.example/ride-1.jpg',
      source: 'user_photo',
      category: 'ride',
    },
    {
      file_id: 'cloud://env/profiles/owner/bike-1.jpg',
      url: 'https://temporary.example/bike-1.jpg',
      source: 'user_photo',
      category: 'bike',
    },
  ],
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
        version: 7,
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

  it('活动发布人映射为昵称与头像地址，头像缺失时为空字符串', async () => {
    const withPublisher = {
      ...activity,
      publisher: { nickname: '阿强', avatar_url: 'https://temp.example/a.jpg' },
    };
    const { cloud } = cloudWith(success([withPublisher]));

    const [result] = await new CloudRepository(cloud).listActivities();

    expect(result.publisher).toEqual({
      nickname: '阿强',
      avatarUrl: 'https://temp.example/a.jpg',
    });
  });

  it('活动发布人头像字段缺失时映射为空头像地址', async () => {
    const withPublisher = { ...activity, publisher: { nickname: '骑友' } };
    const { cloud } = cloudWith(success([withPublisher]));

    const [result] = await new CloudRepository(cloud).listActivities();

    expect(result.publisher).toEqual({ nickname: '骑友', avatarUrl: '' });
  });

  it('活动列表把未来或历史筛选透传给云函数', async () => {
    const first = cloudWith(success([]));
    const second = cloudWith(success([]));

    await new CloudRepository(first.cloud).listActivities('upcoming');
    await new CloudRepository(second.cloud).listActivities('history');

    expectCall(first.callFunction, 'activity-read', { action: 'list', filter: 'upcoming' });
    expectCall(second.callFunction, 'activity-read', { action: 'list', filter: 'history' });
  });

  it('公开预告兼容容量 0 与 unavailable，并映射报名待开放标记', async () => {
    const preview = {
      ...activity,
      capacity: 0,
      registration_state: 'closed',
      closed_reason: 'unavailable',
      registration_setup_pending: true,
    };
    const { cloud } = cloudWith(success([preview]));

    const [result] = await new CloudRepository(cloud).listActivities();

    expect(result).toMatchObject({
      capacity: 0,
      registrationState: 'closed',
      closedReason: 'unavailable',
      registrationSetupPending: true,
    });
  });

  it('详情使用 detail action，并处理字符串费用与边界默认值', async () => {
    const edge = {
      _id: 'a2',
      title: '极简活动',
      status: 'finished',
      capacity: 1,
      approved_registration_count: 2,
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
      approvedRegistrationCount: 2,
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

describe('CloudRepository 活动时间线分页适配', () => {
  const page = {
    items: [activity],
    next_cursor: 'cursor-2',
    as_of: '2026-10-09T04:00:00.000Z',
  };

  it('首屏与游标页使用独立 listPage action，并严格映射分页 envelope', async () => {
    const { cloud, callFunction } = cloudWith(
      success(page),
      success({ ...page, next_cursor: null }),
    );
    const repository = new CloudRepository(cloud);

    await expect(repository.listActivityPage('future')).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'a1', title: '环湖骑行' })],
      nextCursor: 'cursor-2',
      asOf: '2026-10-09T04:00:00.000Z',
    });
    expectCall(callFunction, 'activity-read', {
      action: 'listPage',
      view: 'future',
      page_size: 20,
    });

    await expect(repository.listActivityPage('history', 'cursor-1')).resolves.toMatchObject({
      items: [expect.objectContaining({ id: 'a1' })],
      nextCursor: null,
      asOf: '2026-10-09T04:00:00.000Z',
    });
    expectCall(callFunction, 'activity-read', {
      action: 'listPage',
      view: 'history',
      page_size: 20,
      cursor: 'cursor-1',
    });
  });

  it.each([
    null,
    [],
    { ...page, items: {} },
    { ...page, items: [{ ...activity, title: 42 }] },
    { ...page, next_cursor: undefined },
    { ...page, next_cursor: '' },
    { ...page, next_cursor: 'x'.repeat(513) },
    { ...page, as_of: 'not-a-date' },
    { ...page, as_of: new Date('2026-10-09T04:00:00.000Z') },
    { ...page, extra: true },
  ])('拒绝非法或非精确分页 envelope %#', async (data) => {
    const { cloud } = cloudWith(success(data));
    await expectCode(new CloudRepository(cloud).listActivityPage('future'), 'INVALID_RESPONSE');
  });

  it.each([
    ['upcoming', undefined],
    ['future', ''],
    ['history', 'x'.repeat(513)],
  ])('拒绝非法分页输入 view=%s cursor=%s 且不发起调用', async (view, cursor) => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      new CloudRepository(cloud).listActivityPage(view as any, cursor),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('继续保留旧 listActivities(filter) 请求形状', async () => {
    const { cloud, callFunction } = cloudWith(success([]));
    await new CloudRepository(cloud).listActivities('history');
    expectCall(callFunction, 'activity-read', { action: 'list', filter: 'history' });
  });
});

describe('CloudRepository 个人骑行名片适配', () => {
  it('只调用 profile/capabilityCard 并映射资料与照片 DTO', async () => {
    const { cloud, callFunction } = cloudWith(success(personalCapabilityCardDto));

    await expect(new CloudRepository(cloud).getPersonalCapabilityCard()).resolves.toEqual({
      generatedAt: '2026-09-29T04:10:00.000Z',
      profile: {
        displayName: '山野骑手',
        gender: '女',
        avatarUrl: '',
      },
      backgrounds: [
        {
          id: 'cloud://env/profiles/owner/ride-1.jpg',
          url: 'https://temporary.example/ride-1.jpg',
          source: 'user_photo',
          category: 'ride',
        },
        {
          id: 'cloud://env/profiles/owner/bike-1.jpg',
          url: 'https://temporary.example/bike-1.jpg',
          source: 'user_photo',
          category: 'bike',
        },
      ],
    });
    expectCall(callFunction, 'profile', { action: 'capabilityCard' });
  });

  it('拒绝额外账号字段、非 HTTPS 背景和非法生成时间', async () => {
    for (const dto of [
      { ...personalCapabilityCardDto, summary: { rides_90d: 12 } },
      {
        ...personalCapabilityCardDto,
        backgrounds: [
          { ...personalCapabilityCardDto.backgrounds[0], url: 'http://example.test/ride.jpg' },
        ],
      },
      { ...personalCapabilityCardDto, generated_at: 'not-a-date' },
    ]) {
      const { cloud } = cloudWith(success(dto));
      await expectCode(new CloudRepository(cloud).getPersonalCapabilityCard(), 'INVALID_RESPONSE');
    }
  });
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

  it('订阅请求去重且最多传递三个模板', async () => {
    const requestSubscribeMessage = vi.fn(({ success }) => success({}));
    vi.stubGlobal('wx', { requestSubscribeMessage });
    const repository = new CloudRepository(cloudWith().cloud);

    await repository.requestReviewNotificationSubscription(['one', 'two', 'one', 'three', 'four']);

    expect(requestSubscribeMessage).toHaveBeenCalledWith({
      tmplIds: ['one', 'two', 'three'],
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

  it('我的报名和本人详情使用 registration 的 minePage/detail', async () => {
    const { cloud, callFunction } = cloudWith(
      success({ items: [registration], next_cursor: null }),
      success(registration),
    );
    const repository = new CloudRepository(cloud);

    const mine = await repository.listRegistrations();
    expectCall(callFunction, 'registration', { action: 'minePage', page_size: 50 });
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
        gender: '女',
        realName: '曹蒙恩',
        phone: '13812345678',
      },
      updatedAt: '2026-09-28T12:00:00.000Z',
    });
    expect(detail).not.toHaveProperty('strava');
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

  it('删除只发送 registration/delete', async () => {
    const { cloud, callFunction } = cloudWith(success({ deleted: true }));
    await expect(new CloudRepository(cloud).deleteRegistration('r1')).resolves.toBeUndefined();
    expectCall(callFunction, 'registration', { action: 'delete', registrationId: 'r1' });
  });

  it('管理员报名详情映射完整手机号并忽略历史第三方指标', async () => {
    const { cloud } = cloudWith(success(registration));

    const result = await new CloudRepository(cloud).getReviewRegistration('r1');
    expect(result).toMatchObject({ profile: { phone: '13812345678' } });
    expect(result).not.toHaveProperty('strava');
  });

  it('将 self_drive 集合方式映射为自行前往', async () => {
    const selfDrive = {
      ...registration,
      options: { gathering_mode: 'self_drive', experience: 'regular' },
    };
    const { cloud } = cloudWith(success(selfDrive));

    await expect(new CloudRepository(cloud).getReviewRegistration('r1')).resolves.toMatchObject({
      gatheringMode: '自行前往',
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

  it('报名 DTO 缺少可选对象时使用空值并忽略历史账号字段', async () => {
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
      updatedAt: '刚刚',
    });
    expect(result).not.toHaveProperty('strava');
  });
});

describe('CloudRepository 管理员审批适配', () => {
  it.each(['pending', 'approved', 'checked_in', 'rejected', 'cancelled'] as const)(
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
        gender: '男',
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
      gender: '男',
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

  it('签到使用独立 checkIn 命令并映射签到时间，不暴露操作人', async () => {
    const { cloud, callFunction } = cloudWith(
      success({
        ...registration,
        status: 'checked_in',
        checked_in_at: '2026-09-30T10:00:00.000Z',
        checkin_operator_openid: 'admin-secret',
      }),
    );

    const result = await new CloudRepository(cloud).checkInRegistration('r1');

    expectCall(callFunction, 'admin-review', { action: 'checkIn', registrationId: 'r1' });
    expect(result).toMatchObject({
      status: 'checked_in',
      checkedInAt: '2026-09-30T10:00:00.000Z',
    });
    expect(JSON.stringify(result)).not.toContain('admin-secret');
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
      real_name: '曹蒙恩',
      real_name_masked: '曹*',
      phone: '13812345678',
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
    expect(profile.realName).toBe('曹蒙恩');
    expect(profile.phone).toBe('13812345678');
    const maskedOnly = cloudWith(
      success({
        ...dto,
        real_name: undefined,
        phone: undefined,
        emergency_phone_masked: '139****0000',
      }),
    );
    const legacy = await new CloudRepository(maskedOnly.cloud).getProfile();
    // 本人资料不再把旧版 *_masked 当作展示值回退，避免页面出现星号。
    expect([legacy.realName, legacy.phone, legacy.emergencyPhone]).toEqual(['', '', '']);
    expect(legacy.sensitiveStatus?.realName).toBe(true);
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
    const dirtyRuntimeProfile = {
      nickname: '新昵称',
      avatarFileId: 'cloud://avatar',
      avatarVisibility: 'public' as const,
      realName: '曹蒙恩',
      phone: '13812345678',
    };
    await repository.updateProfile(dirtyRuntimeProfile);
    expectCall(callFunction, 'profile', {
      action: 'update',
      nickname: '新昵称',
      avatar_visibility: 'public',
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

  it('上传完成后仅以 wechat/custom 来源注册媒体且不发送客户端身份', async () => {
    const { cloud, callFunction } = cloudWith(success({ registered: true }));
    await expect(
      new CloudRepository(cloud).registerProfileMedia(
        'cloud://env/profiles/owner/photo.jpg',
        'other',
        'wechat',
      ),
    ).resolves.toBeUndefined();
    expectCall(callFunction, 'profile', {
      action: 'registerMedia',
      fileId: 'cloud://env/profiles/owner/photo.jpg',
      category: 'other',
      origin: 'wechat',
    });
  });

  it('客户端仓储拒绝伪造 strava 媒体来源', async () => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      (new CloudRepository(cloud) as any).registerProfileMedia(
        'cloud://env/profiles/owner/photo.jpg',
        'other',
        'strava',
      ),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  it('专用 setAvatar 只发送微信来源与 fileId 并严格映射响应', async () => {
    const dto = {
      nickname: '骑手',
      completeness: 25,
      avatar_file_id: 'cloud://env/profiles/owner/avatar.jpg',
      avatar_source: 'wechat',
      avatar_revision: 3,
    };
    const { cloud, callFunction } = cloudWith(success(dto));
    await expect(
      new CloudRepository(cloud).setAvatar('wechat', dto.avatar_file_id),
    ).resolves.toMatchObject({
      nickname: '骑手',
      avatarId: dto.avatar_file_id,
      avatarSource: 'wechat',
      avatarRevision: 3,
    });
    expectCall(callFunction, 'profile', {
      action: 'setAvatar',
      source: 'wechat',
      fileId: dto.avatar_file_id,
    });
  });

  it('专用 setAvatar 拒绝客户端新增自定义头像', async () => {
    const { cloud, callFunction } = cloudWith();
    await expectCode(
      (new CloudRepository(cloud) as any).setAvatar(
        'custom',
        'cloud://env/profiles/owner/avatar.jpg',
      ),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
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
      origin: 'custom',
    });
  });

  it('Profile 完整可选字段与照片分支均按真实值映射', async () => {
    const { cloud } = cloudWith(
      success({
        nickname: '完整骑手',
        completeness: 71,
        missing: ['填写紧急联系人姓名', 42],
        missingKeys: ['emergency_name', 42],
        title: '领队',
        avatar_file_id: 'cloud://avatar',
        avatar_source: 'custom',
        avatar_revision: 7,
        owner_openid: 'must-not-leak',
        origin: 'must-not-leak',
        status: 'active',
        real_name_masked: '曹*',
        phone_masked: '138****5678',
        id_type: '护照',
        id_number_masked: 'E1****89',
        gender: '男',
        emergency_name: '紧急联系人',
        emergency_phone: '13912345678',
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
      avatarSource: 'custom',
      avatarRevision: 7,
      completeness: 71,
      missing: ['填写紧急联系人姓名'],
      missingKeys: ['emergency_name'],
      gender: '男',
      emergencyName: '紧急联系人',
      emergencyPhone: '13912345678',
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
    expect(mapped).not.toHaveProperty('ownerOpenid');
    expect(mapped).not.toHaveProperty('origin');
    expect(mapped).not.toHaveProperty('status');
    expect(mapped.sensitiveStatus).not.toHaveProperty('idNumber');
  });

  it.each([
    { avatar_file_id: 'cloud://avatar' },
    { avatar_file_id: '', avatar_source: 'wechat' },
    { avatar_file_id: 'cloud://avatar', avatar_source: 'strava' },
    { avatar_file_id: 'cloud://avatar', avatar_source: 'forged' },
  ])('拒绝不一致或非法头像 DTO %#', async (avatar) => {
    const { cloud } = cloudWith(success({ nickname: '骑手', completeness: 25, ...avatar }));
    await expectCode(new CloudRepository(cloud).getProfile(), 'INVALID_RESPONSE');
  });

  it.each([-1, 1.5, '1'])('拒绝非法 avatar_revision %#', async (avatarRevision) => {
    const { cloud } = cloudWith(
      success({ nickname: '骑手', completeness: 25, avatar_revision: avatarRevision }),
    );
    await expectCode(new CloudRepository(cloud).getProfile(), 'INVALID_RESPONSE');
  });

  it('无头像时不伪造 avatarSource', async () => {
    const { cloud } = cloudWith(
      success({ nickname: '骑手', completeness: 25, avatar_file_id: '' }),
    );
    const profile = await new CloudRepository(cloud).getProfile();
    expect(profile.avatarId).toBe('');
    expect(profile).not.toHaveProperty('avatarSource');
    expect(profile.avatarRevision).toBe(0);
  });

  it('透明聚合 50+50+1 三页报名并传递不透明 cursor', async () => {
    const records = Array.from({ length: 101 }, (_, index) => ({
      ...registration,
      _id: `r-${String(index).padStart(3, '0')}`,
      activity_id: `a-${String(index).padStart(3, '0')}`,
    }));
    const { cloud, callFunction } = cloudWith(
      success({ items: records.slice(0, 50), next_cursor: 'page-2' }),
      success({ items: records.slice(50, 100), next_cursor: 'page-3' }),
      success({ items: records.slice(100), next_cursor: null }),
    );

    const result = await new CloudRepository(cloud).listRegistrations();

    expect(result.map((item) => item.id)).toEqual(records.map((item) => item._id));
    expect(callFunction).toHaveBeenNthCalledWith(1, {
      name: 'registration',
      data: { action: 'minePage', page_size: 50 },
    });
    expect(callFunction).toHaveBeenNthCalledWith(2, {
      name: 'registration',
      data: { action: 'minePage', page_size: 50, cursor: 'page-2' },
    });
    expect(callFunction).toHaveBeenNthCalledWith(3, {
      name: 'registration',
      data: { action: 'minePage', page_size: 50, cursor: 'page-3' },
    });
  });

  it('报名分页对异常 envelope、重复 cursor 和重复 ID fail closed', async () => {
    const unknownKey = cloudWith(
      success({ items: [], next_cursor: null, internal: 'must-not-pass' }),
    );
    await expectCode(new CloudRepository(unknownKey.cloud).listRegistrations(), 'INVALID_RESPONSE');

    const invalidCursor = cloudWith(success({ items: [], next_cursor: '' }));
    await expectCode(
      new CloudRepository(invalidCursor.cloud).listRegistrations(),
      'INVALID_RESPONSE',
    );

    const repeatedCursor = cloudWith(
      success({ items: [registration], next_cursor: 'same' }),
      success({
        items: [{ ...registration, _id: 'r2', activity_id: 'a2' }],
        next_cursor: 'same',
      }),
    );
    await expectCode(
      new CloudRepository(repeatedCursor.cloud).listRegistrations(),
      'INVALID_RESPONSE',
    );

    const repeatedId = cloudWith(
      success({ items: [registration], next_cursor: 'next' }),
      success({ items: [registration], next_cursor: null }),
    );
    await expectCode(new CloudRepository(repeatedId.cloud).listRegistrations(), 'INVALID_RESPONSE');
  });

  it('报名分页超过 200 页时 fail closed', async () => {
    const pages = Array.from({ length: 200 }, (_, index) =>
      success({ items: [], next_cursor: `page-${index + 2}` }),
    );
    const { cloud, callFunction } = cloudWith(...pages);

    await expectCode(new CloudRepository(cloud).listRegistrations(), 'INVALID_RESPONSE');
    expect(callFunction).toHaveBeenCalledTimes(200);
  });

  it('CloudRepositoryError 保持稳定名称', () => {
    expect(new CloudRepositoryError('X', 'x')).toMatchObject({
      name: 'CloudRepositoryError',
      code: 'X',
    });
  });

  it('背景槽位读写采用 background_photo 协议，服务端缺失字段时不新增键', async () => {
    const { cloud: readCloud } = cloudWith(
      success({
        nickname: '骑手',
        completeness: 25,
        background_photo: { file_id: 'cloud://bg', category: 'ride' },
        photos: [{ file_id: 'cloud://legacy', category: 'bike' }],
      }),
      success({ nickname: '骑手', completeness: 25, background_photo: null }),
      success({ nickname: '骑手', completeness: 25 }),
    );
    const readRepo = new CloudRepository(readCloud);
    expect(await readRepo.getProfile()).toMatchObject({
      backgroundPhoto: { id: 'cloud://bg', category: 'ride' },
      photos: [{ id: 'cloud://legacy', category: 'bike' }],
    });
    expect(await readRepo.getProfile()).toMatchObject({ backgroundPhoto: null });
    const noSlot = await readRepo.getProfile();
    expect(noSlot).not.toHaveProperty('backgroundPhoto');

    const { cloud: badCloud } = cloudWith(
      success({
        nickname: '骑手',
        completeness: 25,
        background_photo: { file_id: 'cloud://bg', category: 'forged' },
      }),
    );
    await expectCode(new CloudRepository(badCloud).getProfile(), 'INVALID_RESPONSE');

    const dto = {
      nickname: '骑手',
      completeness: 25,
      background_photo: { file_id: 'cloud://next', category: 'ride' },
    };
    const { cloud: writeCloud, callFunction: writeCall } = cloudWith(success(dto), success(dto));
    const writeRepo = new CloudRepository(writeCloud);
    await writeRepo.updateProfile({ backgroundPhoto: { id: 'cloud://next', category: 'ride' } });
    expectCall(writeCall, 'profile', {
      action: 'update',
      background_photo: { file_id: 'cloud://next', category: 'ride' },
    });
    await writeRepo.updateProfile({ backgroundPhoto: null });
    expectCall(writeCall, 'profile', { action: 'update', background_photo: null });
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

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('MockRepository 使用版本化游标稳定分页并拒绝篡改游标', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    const base = state.activities[0];
    state.activities = Array.from({ length: 21 }, (_, index) => ({
      ...base,
      id: `future-${String(index).padStart(2, '0')}`,
      startAt: `2026-10-${String(11 + Math.floor(index / 2)).padStart(2, '0')}T08:00:00.000Z`,
      endAt: `2026-10-${String(11 + Math.floor(index / 2)).padStart(2, '0')}T10:00:00.000Z`,
    }));
    stored = state;

    const first = await repository.listActivityPage('future');
    const second = await repository.listActivityPage('future', first.nextCursor || undefined);

    expect(first.items).toHaveLength(20);
    expect(first.nextCursor).toEqual(expect.any(String));
    expect(second.items).toHaveLength(1);
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(21);
    expect(second.asOf).toBe(first.asOf);
    await expect(repository.listActivityPage('future', 'tampered')).rejects.toThrow();
  });

  it('MockRepository 新分页独立保留公开预告并按冻结 asOf 派生报名状态', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    const base = state.activities[0];
    state.activities = [
      {
        ...base,
        id: 'setup-pending',
        startAt: '2026-10-12T08:00:00.000Z',
        endAt: '2026-10-12T10:00:00.000Z',
        deadline: undefined,
        capacity: 0,
        fee: '',
        registrationState: 'open',
        closedReason: null,
        waitlistOnly: true,
        serverNow: '2026-01-01T00:00:00.000Z',
      },
      {
        ...base,
        id: 'deadline-closed',
        startAt: '2026-10-13T08:00:00.000Z',
        endAt: '2026-10-13T10:00:00.000Z',
        deadline: '2026-10-09T20:00:00.000Z',
        registrationState: 'open',
        closedReason: null,
      },
      {
        ...base,
        id: 'full-open',
        startAt: '2026-10-14T08:00:00.000Z',
        endAt: '2026-10-14T10:00:00.000Z',
        deadline: '2026-10-13T20:00:00.000Z',
        capacity: 2,
        occupiedCount: 2,
        registrationState: 'closed',
        closedReason: 'full',
      },
      {
        ...base,
        id: 'history-finished',
        status: 'finished',
        startAt: '2026-10-15T08:00:00.000Z',
        endAt: '2026-10-15T10:00:00.000Z',
      },
      {
        ...base,
        id: 'history-ended',
        startAt: '2026-10-09T08:00:00.000Z',
        endAt: '2026-10-09T10:00:00.000Z',
      },
      { ...base, id: 'draft', status: 'draft' },
      { ...base, id: 'unknown', status: 'archived' },
      { ...base, id: 'deleted', isDeleted: true },
      { ...base, id: 'invalid', endAt: 'invalid' },
      { ...base, id: 'missing-time', startAt: undefined },
      {
        ...base,
        id: 'reversed',
        startAt: '2026-10-20T10:00:00.000Z',
        endAt: '2026-10-20T08:00:00.000Z',
      },
    ];
    stored = state;

    const future = await repository.listActivityPage('future');
    const history = await repository.listActivityPage('history');

    expect(future.items.map((item) => item.id)).toEqual([
      'setup-pending',
      'deadline-closed',
      'full-open',
    ]);
    expect(future.items[0]).toMatchObject({
      capacity: 0,
      deadline: '',
      registrationState: 'closed',
      closedReason: 'unavailable',
      registrationSetupPending: true,
      serverNow: future.asOf,
    });
    expect(future.items[0]).not.toHaveProperty('waitlistOnly');
    expect(future.items[1]).toMatchObject({
      registrationState: 'closed',
      closedReason: 'deadline',
      serverNow: future.asOf,
    });
    expect(future.items[2]).toMatchObject({
      registrationState: 'open',
      closedReason: null,
      waitlistOnly: true,
      serverNow: future.asOf,
    });
    expect(future.items[2]).not.toHaveProperty('registrationSetupPending');
    expect(history.items.map((item) => item.id)).toEqual(['history-finished', 'history-ended']);
    expect(history.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          registrationState: 'closed',
          closedReason: 'finished',
          serverNow: history.asOf,
        }),
      ]),
    );
  });

  it('MockRepository 新分页忽略陈旧 setup pending 并按完整配置重新开放报名', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    const base = state.activities[0];
    state.activities = [
      {
        ...base,
        id: 'stale-setup-pending',
        status: 'published',
        startAt: '2026-10-12T08:00:00.000Z',
        endAt: '2026-10-12T10:00:00.000Z',
        deadline: '2026-10-11T20:00:00.000Z',
        capacity: 10,
        occupiedCount: 0,
        fee: '100 元',
        registrationState: 'closed',
        closedReason: 'unavailable',
        registrationSetupPending: true,
        waitlistOnly: true,
        serverNow: '2026-01-01T00:00:00.000Z',
      },
    ];
    stored = state;

    const future = await repository.listActivityPage('future');

    expect(future.items).toHaveLength(1);
    expect(future.items[0]).toMatchObject({
      id: 'stale-setup-pending',
      registrationState: 'open',
      closedReason: null,
      serverNow: future.asOf,
    });
    expect(future.items[0]).not.toHaveProperty('registrationSetupPending');
    expect(future.items[0]).not.toHaveProperty('waitlistOnly');
  });

  it('MockRepository 新分页按 Mongo binary 双向排序且跨页固定 asOf 无漏重', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    const base = state.activities[0];
    const orderedSuffixes = [
      'aa-bb',
      'aaAb',
      'aa_bb',
      'aaab',
      ...Array.from({ length: 17 }, (_, index) => `zz${String(index).padStart(2, '0')}`),
    ];
    const futureIds = orderedSuffixes.map((suffix) => `future-${suffix}`);
    const historyIds = orderedSuffixes.map((suffix) => `history-${suffix}`);
    state.activities = [
      ...futureIds.map((id) => ({
        ...base,
        id,
        status: 'published',
        startAt: '2026-10-20T08:00:00.000Z',
        endAt: '2026-10-20T10:00:00.000Z',
        deadline: '2026-10-19T20:00:00.000Z',
      })),
      ...historyIds.map((id) => ({
        ...base,
        id,
        status: 'finished',
        startAt: '2026-10-09T08:00:00.000Z',
        endAt: '2026-10-09T10:00:00.000Z',
      })),
    ];
    stored = state;

    const futureFirst = await repository.listActivityPage('future');
    vi.setSystemTime(new Date('2026-11-01T00:00:00.000Z'));
    const futureSecond = await repository.listActivityPage(
      'future',
      futureFirst.nextCursor || undefined,
    );
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    const historyFirst = await repository.listActivityPage('history');
    const historySecond = await repository.listActivityPage(
      'history',
      historyFirst.nextCursor || undefined,
    );

    const futureAll = [...futureFirst.items, ...futureSecond.items].map((item) => item.id);
    const historyAll = [...historyFirst.items, ...historySecond.items].map((item) => item.id);
    expect(futureAll).toEqual(futureIds);
    expect(historyAll).toEqual([...historyIds].reverse());
    expect(new Set(futureAll).size).toBe(21);
    expect(new Set(historyAll).size).toBe(21);
    expect(futureSecond.asOf).toBe(futureFirst.asOf);
    expect(futureSecond.items.every((item) => item.serverNow === futureFirst.asOf)).toBe(true);
  });

  it('MockRepository 新分页实现不改变旧 listActivities 筛选语义', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-10T00:00:00.000Z'));
    stored = undefined;
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    const base = state.activities[0];
    state.activities = [
      {
        ...base,
        id: 'legacy-upcoming',
        startAt: '2026-10-12T08:00:00.000Z',
        endAt: '2026-10-12T10:00:00.000Z',
      },
      {
        ...base,
        id: 'legacy-history',
        status: 'finished',
        startAt: '2026-10-09T08:00:00.000Z',
        endAt: '2026-10-09T10:00:00.000Z',
      },
      { ...base, id: 'legacy-draft', status: 'draft' },
    ];
    stored = state;

    expect((await repository.listActivities('upcoming')).map((item) => item.id)).toEqual([
      'legacy-upcoming',
    ]);
    expect((await repository.listActivities('history')).map((item) => item.id)).toEqual([
      'legacy-history',
    ]);
  });

  it.each([
    ['self_drive', '自行前往'],
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
      gatheringMode: '自行前往',
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

  it('MockRepository 签到仅允许 approved 且重复调用幂等', async () => {
    installStorage();
    const repository = new MockRepository();
    const state = JSON.parse(JSON.stringify(repository.read()));
    state.registrations[0].status = 'approved';
    stored = state;

    const first = await repository.checkInRegistration(state.registrations[0].id);
    const second = await repository.checkInRegistration(state.registrations[0].id);

    expect(first).toMatchObject({ status: 'checked_in', checkedInAt: '刚刚' });
    expect(second).toMatchObject({ status: 'checked_in', checkedInAt: '刚刚' });
    expect(wx.setStorageSync).toHaveBeenCalledTimes(1);
    await expect(repository.cancelRegistration(state.registrations[0].id)).rejects.toThrow(
      '非法状态迁移',
    );
  });

  it('提供确定的自用骑行名片响应', async () => {
    installStorage();
    await expect(new MockRepository().getPersonalCapabilityCard()).resolves.toMatchObject({
      profile: { displayName: expect.any(String) },
      backgrounds: expect.any(Array),
      generatedAt: expect.any(String),
    });
  });

  it('MockRepository 复制历史活动时保持同样的安全草稿契约', async () => {
    installStorage();
    const repository = new MockRepository();
    const source = {
      ...repository.read().activities[0],
      id: 'history-mock',
      status: 'finished' as const,
      coverImage: 'cloud://covers/source.jpg',
      route: { ...repository.read().activities[0].route, gpxFileId: 'cloud://routes/source.gpx' },
      supportVehicleCapacity: 8,
      selfDriveCapacity: 10,
      supportVehicleDriver: {
        nickname: '王师傅',
        licensePlate: '粤B12345',
        contactPhone: '13812345678',
      },
      occupiedCount: 18,
    };
    stored = { ...repository.read(), activities: [source] };

    const first = await repository.cloneActivity({
      sourceActivityId: source.id,
      requestId: 'request-mock-0001',
    });
    const retried = await repository.cloneActivity({
      sourceActivityId: source.id,
      requestId: 'request-mock-0001',
    });

    expect(retried.id).toBe(first.id);
    expect(first).toMatchObject({ status: 'draft', version: 1, occupiedCount: 0 });
    expect(first).not.toHaveProperty('coverImage');
    expect(first.route).not.toHaveProperty('gpxFileId');
    expect(first).not.toHaveProperty('supportVehicleCapacity');
    expect(first).not.toHaveProperty('selfDriveCapacity');
    expect(first).not.toHaveProperty('supportVehicleDriver');
    expect(repository.read().activities).toHaveLength(2);
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

  it.each(['published', 'finished'] as const)(
    '管理 DTO 允许 %s 活动缺少运营字段并保留 optional',
    async (status) => {
      const incomplete = { ...activity, status } as Record<string, unknown>;
      delete incomplete.capacity;
      delete incomplete.signup_deadline;
      delete incomplete.fee;
      delete incomplete.support_vehicle_capacity;
      delete incomplete.self_drive_capacity;
      delete incomplete.support_vehicle_driver;
      const { cloud } = cloudWith(success(incomplete));

      const result = await new CloudRepository(cloud).getAdminActivity('a1');

      expect(result).toMatchObject({ id: 'a1', status });
      expect(result).not.toHaveProperty('capacity');
      expect(result).not.toHaveProperty('deadline');
      expect(result).not.toHaveProperty('fee');
    },
  );

  it('存量无 version 活动映射为 0 并可通过 expectedVersion=0 升级保存', async () => {
    const legacy = { ...activity } as Record<string, unknown>;
    delete legacy.version;
    const upgraded = { ...activity, version: 1 };
    const { cloud, callFunction } = cloudWith(success(legacy), success(upgraded));
    const repository = new CloudRepository(cloud);

    const current = await repository.getAdminActivity('a1');
    expect(current?.version).toBe(0);
    await repository.saveActivity({ ...current!, title: '存量活动升级' }, 'a1', current!.version);

    expect((callFunction.mock.calls[1][0].data as any).expectedVersion).toBe(0);
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
    await new CloudRepository(cloud).saveActivity(
      {
        ...input,
        occupiedCount: 999,
        created_by: 'forged',
      } as any,
      undefined,
      undefined,
      'create-request-0001',
    );
    expectCall(callFunction, 'activity-admin', {
      action: 'save',
      createRequestId: 'create-request-0001',
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

    await repository.saveActivity(
      { ...current!, title: '新标题', capacity: 25 },
      'a1',
      current!.version,
    );

    const request = callFunction.mock.calls[1][0].data as any;
    const payload = request.activity;
    expect(request.expectedVersion).toBe(7);
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
    const repository = new CloudRepository(cloud);
    await repository.saveActivity(value, 'a1', 7, undefined, '路线临时封闭');
    expect((callFunction.mock.calls[0][0].data as any).activityId).toBe('a1');
    expect((callFunction.mock.calls[0][0].data as any).expectedVersion).toBe(7);
    expect((callFunction.mock.calls[0][0].data as any).operationReason).toBe('路线临时封闭');
    callFunction.mockResolvedValueOnce({ result: { ok: true, data: { deleted: true } } });
    await repository.deleteActivity('a1', '清理活动');
    expect(callFunction.mock.calls[1][0].data).toEqual({
      action: 'delete',
      id: 'a1',
      reason: '清理活动',
    });
    const invalid = cloudWith();
    await expectCode(
      new CloudRepository(invalid.cloud).saveActivity(value, ''),
      'VALIDATION_FAILED',
    );
    expect(invalid.callFunction).not.toHaveBeenCalled();
  });

  it('clone 只发送源 ID、请求 ID 与可选新时间', async () => {
    const cloned = {
      ...activity,
      _id: 'activity_clone_0123456789abcdef0123456789abcdef',
      version: 1,
      status: 'draft',
      occupied_count: 0,
      cover_image: '',
      route: { ...activity.route, gpx_file_id: '' },
    };
    const { cloud, callFunction } = cloudWith(success(cloned));

    await new CloudRepository(cloud).cloneActivity({
      sourceActivityId: 'history-1',
      requestId: 'request-clone-0001',
      signupDeadline: '2026-10-20T00:00:00.000Z',
      eventStart: '2026-10-21T00:00:00.000Z',
      eventEnd: '2026-10-21T08:00:00.000Z',
      owner: 'attacker',
      status: 'published',
      occupiedCount: 99,
      supportVehicleDriver: { contactPhone: '13812345678' },
      coverImage: 'cloud://forged-cover',
      route: { gpxFileId: 'cloud://forged-route' },
      registrations: [{ realName: 'secret' }],
      audit: [{ actor: 'secret' }],
    } as any);

    expectCall(callFunction, 'activity-admin', {
      action: 'clone',
      sourceActivityId: 'history-1',
      requestId: 'request-clone-0001',
      signupDeadline: '2026-10-20T00:00:00.000Z',
      eventStart: '2026-10-21T00:00:00.000Z',
      eventEnd: '2026-10-21T08:00:00.000Z',
    });
    expect(JSON.stringify(callFunction.mock.calls[0][0])).not.toMatch(
      /attacker|published|13812345678|forged|registrations|audit/,
    );
  });

  it('clone 对请求 ID、源 ID 与响应草稿严格 fail closed', async () => {
    for (const input of [
      { sourceActivityId: '', requestId: 'request-valid-01' },
      { sourceActivityId: 'history-1', requestId: 'short' },
      { sourceActivityId: 'history-1', requestId: 'bad request id' },
    ]) {
      const invalid = cloudWith();
      await expectCode(
        new CloudRepository(invalid.cloud).cloneActivity(input),
        'VALIDATION_FAILED',
      );
      expect(invalid.callFunction).not.toHaveBeenCalled();
    }
    for (const response of [
      { ...activity, _id: '', version: 1, status: 'draft' },
      { ...activity, _id: 'activity_clone_valid', version: 0, status: 'draft' },
      { ...activity, _id: 'activity_clone_valid', version: 1, status: 'published' },
    ]) {
      await expectCode(
        new CloudRepository(cloudWith(success(response)).cloud).cloneActivity({
          sourceActivityId: 'history-1',
          requestId: 'request-valid-01',
        }),
        'INVALID_RESPONSE',
      );
    }
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

describe('CloudRepository 活动详情路线与公开成员', () => {
  it('兼容历史官方路线字段并忽略旧预览指标和成员账号卡', async () => {
    const { cloud } = cloudWith(
      success({
        ...activity,
        route: {
          ...activity.route,
          strava_route_id: '123',
          strava_route_url: 'https://www.strava.com/routes/123',
          route_name: '周末环湖',
          preview_image_url: 'https://images.example/route.jpg',
          elevation_profile: [
            { distance_km: 0, elevation_m: 20 },
            { distance_km: 5, elevation_m: 80 },
          ],
          popular_climbs: [
            {
              id: 'c1',
              name: '南山',
              distance_km: 3.2,
              elevation_gain_m: 260,
              average_grade: 8.1,
              max_grade: 15,
              climb_category: 2,
              popularity: 18,
              popularity_label: '18 人骑过',
            },
          ],
        },
        attendees: [
          {
            id: 'r1',
            display_name: '山野骑手',
            gender: '男',
            avatar_file_id: 'cloud://env/profile-canonical/r1/avatar.jpg',
            avatar_url: 'https://temp.example/avatar.jpg',
            background_file_id: 'cloud://env/profile-canonical/r1/background.jpg',
            background_url: 'https://temp.example/background.jpg',
            status: 'approved',
            card: { rides90d: 20, longestKm: 120, elevationM: 8000, speedKmh: 26.5 },
            openid: 'must-not-map',
            phone: '13812345678',
          },
        ],
      }),
    );
    const result: any = await new CloudRepository(cloud).getActivity('a1');
    expect(result.route).toMatchObject({
      stravaRouteId: '123',
      stravaRouteUrl: 'https://www.strava.com/routes/123',
      routeName: '周末环湖',
      elevationProfile: [
        { distanceKm: 0, elevationM: 20 },
        { distanceKm: 5, elevationM: 80 },
      ],
    });
    expect(result.route).not.toHaveProperty('previewImageUrl');
    expect(result.route).not.toHaveProperty('popularClimbs');
    expect(result.attendees).toEqual([
      {
        id: 'r1',
        displayName: '山野骑手',
        gender: '男',
        avatarUrl: 'https://temp.example/avatar.jpg',
        backgroundUrl: 'https://temp.example/background.jpg',
        status: 'approved',
      },
    ]);
    expect(JSON.stringify(result.attendees)).not.toMatch(/openid|phone|138/);
  });

  it('公开成员只保留白名单、限制 24 人并收敛非法值', async () => {
    const attendees = [
      null,
      {
        id: 7,
        display_name: false,
        gender: null,
        avatar_url: 'http://unsafe.example/avatar.jpg',
        status: 'checked_in',
        card: null,
        openid: 'secret',
      },
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `r${index}`,
        display_name: `骑手${index}`,
        gender: index === 0 ? '女' : '未知',
        avatar_url: 'https://example.com/avatar.jpg',
        status: 'unexpected',
        card: { rides90d: Number.NaN, longestKm: '120', elevationM: undefined, speedKmh: 0 },
      })),
    ];
    const { cloud } = cloudWith(success({ ...activity, attendees }));
    const result: any = await new CloudRepository(cloud).getActivity('a1');
    expect(result.attendees).toHaveLength(24);
    expect(result.attendees[0]).toEqual({
      id: '',
      displayName: '',
      gender: '',
      avatarUrl: '',
      backgroundUrl: '',
      status: 'checked_in',
    });
    expect(result.attendees[1]).toMatchObject({
      gender: '女',
      status: 'approved',
    });
    expect(result.attendees[2]).toMatchObject({ gender: '' });
    expect(JSON.stringify(result.attendees)).not.toContain('secret');
  });

  it('路线扩展字段过滤非法点并忽略旧预览字段、不安全 URL 与 bounds', async () => {
    const points = Array.from({ length: 81 }, (_, index) => ({
      distance_km: index,
      elevation_m: index + 10,
    }));
    const climbs = Array.from({ length: 4 }, (_, index) =>
      index === 0
        ? {
            id: 8,
            name: null,
            distance_km: 'bad',
            elevation_gain_m: Number.NaN,
            average_grade: undefined,
            max_grade: false,
            climb_category: null,
            popularity: {},
            popularity_label: 3,
          }
        : { id: `c${index}`, name: `坡${index}` },
    );
    const { cloud } = cloudWith(
      success({
        ...activity,
        route: {
          ...activity.route,
          strava_route_id: 123,
          strava_route_url: 'http://www.strava.com/routes/123',
          elevation_profile: [...points, null, { distance_km: 'x', elevation_m: 1 }],
          route_bounds: { south: 1, west: 2, north: Number.NaN, east: 4 },
          popular_climbs: climbs,
        },
      }),
    );
    const result: any = await new CloudRepository(cloud).getActivity('a1');
    expect(result.route).not.toHaveProperty('stravaRouteId');
    expect(result.route).not.toHaveProperty('stravaRouteUrl');
    expect(result.route).not.toHaveProperty('routeBounds');
    expect(result.route.elevationProfile).toHaveLength(80);
    expect(result.route).not.toHaveProperty('popularClimbs');
  });
});

describe('CloudRepository Strava 公开路线预览契约', () => {
  const routeUrl = 'https://www.strava.com/routes/123456';
  const previewDto = {
    preview_id: 'c'.repeat(64),
    external_provider: 'strava',
    external_route_id: '123456',
    external_route_url: routeUrl,
    strava_route_id: '123456',
    strava_route_url: routeUrl,
    route_name: '  城市绿道环线  ',
    distance_km: 52.4,
    elevation_m: 680,
    elevation_loss_m: 675,
    elevation_min_m: 12,
    elevation_max_m: 486,
    estimated_moving_time_seconds: 10800,
    estimation_source: 'cili',
    elevation_profile: [
      { distance_km: 0, elevation_m: 12 },
      { distance_km: 52.4, elevation_m: 30 },
    ],
    route_outline: [
      { latitude: 22, longitude: 114 },
      { latitude: 22.2, longitude: 114.2 },
    ],
    route_bounds: { south: 22, west: 114, north: 22.2, east: 114.2 },
    expires_at: '2026-10-13T09:30:00.000Z',
  };

  it('previewPublicStravaRoute 发送原始链接并完整映射可信响应', async () => {
    const { cloud, callFunction } = cloudWith(success(previewDto));

    await expect(new CloudRepository(cloud).previewPublicStravaRoute(routeUrl)).resolves.toEqual({
      previewId: previewDto.preview_id,
      externalProvider: 'strava',
      externalRouteId: '123456',
      externalRouteUrl: routeUrl,
      routeName: '城市绿道环线',
      distanceKm: 52.4,
      elevationM: 680,
      elevationLossM: 675,
      elevationMinM: 12,
      elevationMaxM: 486,
      estimatedMovingTimeSeconds: 10800,
      estimationSource: 'cili',
      elevationProfile: [
        { distanceKm: 0, elevationM: 12 },
        { distanceKm: 52.4, elevationM: 30 },
      ],
      routeOutline: [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114.2 },
      ],
      routeBounds: { south: 22, west: 114, north: 22.2, east: 114.2 },
      expiresAt: '2026-10-13T09:30:00.000Z',
    });
    expectCall(callFunction, 'activity-admin', {
      action: 'previewPublicRoute',
      routeUrl,
    });
  });

  it.each([
    ['非字符串', 123],
    ['超过 256 字符', `https://www.strava.com/routes/${'1'.repeat(230)}`],
  ])('previewPublicStravaRoute 在请求前拒绝%s链接', async (_label, invalidUrl) => {
    const { cloud, callFunction } = cloudWith();

    await expectCode(
      new CloudRepository(cloud).previewPublicStravaRoute(invalidUrl as string),
      'VALIDATION_FAILED',
    );
    expect(callFunction).not.toHaveBeenCalled();
  });

  const invalidCases: Array<[string, (value: Record<string, any>) => Record<string, any>]> = [
    ['非对象响应', () => null as unknown as Record<string, any>],
    ['非字符串 preview_id', (value) => ({ ...value, preview_id: 1 })],
    ['非法 preview_id', (value) => ({ ...value, preview_id: 'bad' })],
    ['错误 provider', (value) => ({ ...value, external_provider: 'garmin' })],
    ['非字符串路线 ID', (value) => ({ ...value, external_route_id: 123456 })],
    ['以零开头路线 ID', (value) => ({ ...value, external_route_id: '0123456' })],
    ['超长路线 ID', (value) => ({ ...value, external_route_id: '1'.repeat(21) })],
    ['不匹配 external URL', (value) => ({ ...value, external_route_url: `${routeUrl}/edit` })],
    ['不匹配 legacy ID', (value) => ({ ...value, strava_route_id: '654321' })],
    ['不匹配 legacy URL', (value) => ({ ...value, strava_route_url: `${routeUrl}?x=1` })],
    ['非字符串路线名', (value) => ({ ...value, route_name: 1 })],
    ['空路线名', (value) => ({ ...value, route_name: '   ' })],
    ['超长路线名', (value) => ({ ...value, route_name: '路'.repeat(121) })],
    ['非数字距离', (value) => ({ ...value, distance_km: '52.4' })],
    ['非有限距离', (value) => ({ ...value, distance_km: Infinity })],
    ['零距离', (value) => ({ ...value, distance_km: 0 })],
    ['过大距离', (value) => ({ ...value, distance_km: 2000.1 })],
    ['非数字爬升', (value) => ({ ...value, elevation_m: '680' })],
    ['非有限爬升', (value) => ({ ...value, elevation_m: NaN })],
    ['负爬升', (value) => ({ ...value, elevation_m: -1 })],
    ['过大爬升', (value) => ({ ...value, elevation_m: 30001 })],
    ['非数字下降', (value) => ({ ...value, elevation_loss_m: '675' })],
    ['非有限下降', (value) => ({ ...value, elevation_loss_m: Infinity })],
    ['非数字最低海拔', (value) => ({ ...value, elevation_min_m: '12' })],
    ['非有限最低海拔', (value) => ({ ...value, elevation_min_m: NaN })],
    ['非数字最高海拔', (value) => ({ ...value, elevation_max_m: '486' })],
    ['非有限最高海拔', (value) => ({ ...value, elevation_max_m: Infinity })],
    ['非整数预计时间', (value) => ({ ...value, estimated_moving_time_seconds: 60.5 })],
    ['过短预计时间', (value) => ({ ...value, estimated_moving_time_seconds: 59 })],
    ['错误估时来源', (value) => ({ ...value, estimation_source: 'strava' })],
    ['非数组海拔曲线', (value) => ({ ...value, elevation_profile: null })],
    [
      '过短海拔曲线',
      (value) => ({ ...value, elevation_profile: [{ distance_km: 0, elevation_m: 12 }] }),
    ],
    [
      '过长海拔曲线',
      (value) => ({
        ...value,
        elevation_profile: Array(81).fill({ distance_km: 0, elevation_m: 12 }),
      }),
    ],
    [
      '非对象海拔点',
      (value) => ({ ...value, elevation_profile: [null, value.elevation_profile[1]] }),
    ],
    [
      '海拔点含扩展字段',
      (value) => ({
        ...value,
        elevation_profile: [
          { ...value.elevation_profile[0], extra: true },
          value.elevation_profile[1],
        ],
      }),
    ],
    [
      '非数字曲线距离',
      (value) => ({
        ...value,
        elevation_profile: [{ distance_km: '0', elevation_m: 12 }, value.elevation_profile[1]],
      }),
    ],
    [
      '非有限曲线距离',
      (value) => ({
        ...value,
        elevation_profile: [{ distance_km: Infinity, elevation_m: 12 }, value.elevation_profile[1]],
      }),
    ],
    [
      '倒序曲线距离',
      (value) => ({
        ...value,
        elevation_profile: [
          { distance_km: 1, elevation_m: 12 },
          { distance_km: 0, elevation_m: 30 },
        ],
      }),
    ],
    [
      '非数字曲线海拔',
      (value) => ({
        ...value,
        elevation_profile: [{ distance_km: 0, elevation_m: '12' }, value.elevation_profile[1]],
      }),
    ],
    [
      '非有限曲线海拔',
      (value) => ({
        ...value,
        elevation_profile: [{ distance_km: 0, elevation_m: NaN }, value.elevation_profile[1]],
      }),
    ],
    ['非数组路线轮廓', (value) => ({ ...value, route_outline: null })],
    ['过短路线轮廓', (value) => ({ ...value, route_outline: [value.route_outline[0]] })],
    [
      '过长路线轮廓',
      (value) => ({ ...value, route_outline: Array(241).fill({ latitude: 22, longitude: 114 }) }),
    ],
    ['非对象轮廓点', (value) => ({ ...value, route_outline: [null, value.route_outline[1]] })],
    [
      '轮廓点含扩展字段',
      (value) => ({
        ...value,
        route_outline: [{ ...value.route_outline[0], extra: true }, value.route_outline[1]],
      }),
    ],
    [
      '非数字纬度',
      (value) => ({
        ...value,
        route_outline: [{ latitude: '22', longitude: 114 }, value.route_outline[1]],
      }),
    ],
    [
      '非有限纬度',
      (value) => ({
        ...value,
        route_outline: [{ latitude: Infinity, longitude: 114 }, value.route_outline[1]],
      }),
    ],
    [
      '非数字经度',
      (value) => ({
        ...value,
        route_outline: [{ latitude: 22, longitude: '114' }, value.route_outline[1]],
      }),
    ],
    [
      '非有限经度',
      (value) => ({
        ...value,
        route_outline: [{ latitude: 22, longitude: NaN }, value.route_outline[1]],
      }),
    ],
    ['非对象边界', (value) => ({ ...value, route_bounds: null })],
    [
      '边界含扩展字段',
      (value) => ({ ...value, route_bounds: { ...value.route_bounds, extra: true } }),
    ],
    [
      '边界含非数字值',
      (value) => ({ ...value, route_bounds: { ...value.route_bounds, south: '22' } }),
    ],
    [
      '边界含非有限值',
      (value) => ({ ...value, route_bounds: { ...value.route_bounds, east: Infinity } }),
    ],
    ['非法过期时间', (value) => ({ ...value, expires_at: 'not-a-date' })],
  ];

  it.each(invalidCases)('拒绝%s', async (_label, mutate) => {
    const response = mutate({ ...previewDto });

    await expect(
      new CloudRepository(cloudWith(success(response)).cloud).previewPublicStravaRoute(routeUrl),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
});

describe('CloudRepository GPX 路线契约', () => {
  const previewDto = {
    preview_id: 'a'.repeat(64),
    gpx_file_id: `cloud://env/activity-routes/owner/${'b'.repeat(64)}.gpx`,
    gpx_sha256: 'b'.repeat(64),
    generated_preview_file_id: `cloud://env/activity-routes/owner/${'b'.repeat(64)}.png`,
    route_name: '周末环湖',
    distance_km: 52.4,
    elevation_m: 680,
    elevation_loss_m: 675,
    elevation_min_m: 12,
    elevation_max_m: 486,
    estimated_moving_time_seconds: 10800,
    estimation_source: 'cili',
    elevation_profile: [
      { distance_km: 0, elevation_m: 12 },
      { distance_km: 52.4, elevation_m: 30 },
    ],
    route_outline: [
      { latitude: 22, longitude: 114 },
      { latitude: 22.2, longitude: 114.2 },
    ],
    route_bounds: { south: 22, west: 114, north: 22.2, east: 114.2 },
    expires_at: '2026-10-13T09:30:00.000Z',
  };

  it('previewRouteGpx 调用 activity-admin 并严格映射可信预览', async () => {
    const { cloud, callFunction } = cloudWith(success(previewDto));
    const repository = new CloudRepository(cloud);

    await expect(
      repository.previewRouteGpx({
        gpxFileId: previewDto.gpx_file_id,
        gpxSha256: previewDto.gpx_sha256,
        fileName: 'weekend.gpx',
        requestId: 'route_request_123',
      }),
    ).resolves.toEqual({
      previewId: previewDto.preview_id,
      gpxFileId: previewDto.gpx_file_id,
      gpxSha256: previewDto.gpx_sha256,
      generatedPreviewFileId: previewDto.generated_preview_file_id,
      routeName: '周末环湖',
      distanceKm: 52.4,
      elevationM: 680,
      elevationLossM: 675,
      elevationMinM: 12,
      elevationMaxM: 486,
      estimatedMovingTimeSeconds: 10800,
      estimationSource: 'cili',
      elevationProfile: [
        { distanceKm: 0, elevationM: 12 },
        { distanceKm: 52.4, elevationM: 30 },
      ],
      routeOutline: [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114.2 },
      ],
      routeBounds: { south: 22, west: 114, north: 22.2, east: 114.2 },
      expiresAt: '2026-10-13T09:30:00.000Z',
    });
    expectCall(callFunction, 'activity-admin', {
      action: 'previewRouteGpx',
      gpxFileId: previewDto.gpx_file_id,
      gpxSha256: previewDto.gpx_sha256,
      fileName: 'weekend.gpx',
      requestId: 'route_request_123',
    });
  });

  it('bindRoutePreviewImage 绑定同摘要 PNG 并返回更新预览', async () => {
    const { cloud, callFunction } = cloudWith(success(previewDto));
    const repository = new CloudRepository(cloud);

    await expect(
      repository.bindRoutePreviewImage(previewDto.preview_id, previewDto.generated_preview_file_id),
    ).resolves.toMatchObject({
      previewId: previewDto.preview_id,
      generatedPreviewFileId: previewDto.generated_preview_file_id,
    });
    expectCall(callFunction, 'activity-admin', {
      action: 'bindRoutePreviewImage',
      previewId: previewDto.preview_id,
      generatedPreviewFileId: previewDto.generated_preview_file_id,
    });
  });

  it('downloadRouteGpx 只调用 activity-read 并映射原始文件', async () => {
    const { cloud, callFunction } = cloudWith(
      success({
        base64: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+PGdweC8+',
        filename: 'activity-a1.gpx',
        content_type: 'application/gpx+xml',
      }),
    );
    const repository = new CloudRepository(cloud);

    await expect(repository.downloadRouteGpx('a1')).resolves.toEqual({
      base64: 'PD94bWwgdmVyc2lvbj0iMS4wIj8+PGdweC8+',
      fileName: 'activity-a1.gpx',
    });
    expectCall(callFunction, 'activity-read', {
      action: 'downloadRouteGpx',
      activityId: 'a1',
    });
  });

  it('活动详情映射通用官方路线、GPX 指标、轮廓与生成图地址', async () => {
    const { cloud } = cloudWith(
      success({
        ...activity,
        route: {
          ...activity.route,
          external_provider: 'strava',
          external_route_id: '42',
          external_route_url: 'https://www.strava.com/routes/42',
          gpx_preview_id: previewDto.preview_id,
          gpx_file_id: previewDto.gpx_file_id,
          gpx_sha256: previewDto.gpx_sha256,
          generated_preview_file_id: previewDto.generated_preview_file_id,
          generated_preview_url: 'https://temp.example/route.png',
          route_name: previewDto.route_name,
          elevation_loss_m: previewDto.elevation_loss_m,
          elevation_min_m: previewDto.elevation_min_m,
          elevation_max_m: previewDto.elevation_max_m,
          estimated_moving_time_seconds: previewDto.estimated_moving_time_seconds,
          estimation_source: 'cili',
          elevation_profile: previewDto.elevation_profile,
          route_outline: previewDto.route_outline,
          route_bounds: previewDto.route_bounds,
        },
      }),
    );

    const result = await new CloudRepository(cloud).getActivity('a1');

    expect(result?.route).toMatchObject({
      externalProvider: 'strava',
      externalRouteId: '42',
      externalRouteUrl: 'https://www.strava.com/routes/42',
      gpxPreviewId: previewDto.preview_id,
      gpxFileId: previewDto.gpx_file_id,
      gpxSha256: previewDto.gpx_sha256,
      generatedPreviewFileId: previewDto.generated_preview_file_id,
      generatedPreviewUrl: 'https://temp.example/route.png',
      elevationLossM: 675,
      elevationMinM: 12,
      elevationMaxM: 486,
      estimationSource: 'cili',
      routeOutline: [
        { latitude: 22, longitude: 114 },
        { latitude: 22.2, longitude: 114.2 },
      ],
    });
  });

  it('保存活动时保留可信生成路线图作为封面', async () => {
    const { cloud, callFunction } = cloudWith(success({ ...activity, status: 'draft' }));
    const repository = new CloudRepository(cloud);

    await repository.saveActivity({
      title: '路线封面',
      description: '',
      status: 'draft',
      images: ['cloud://env/profiles/photo.jpg'],
      coverImage: previewDto.generated_preview_file_id,
      route: {
        start: '集合点',
        end: '',
        distanceKm: previewDto.distance_km,
        elevationM: previewDto.elevation_m,
        level: '',
        gpxPreviewId: previewDto.preview_id,
        gpxFileId: previewDto.gpx_file_id,
        gpxSha256: previewDto.gpx_sha256,
        generatedPreviewFileId: previewDto.generated_preview_file_id,
        routeName: previewDto.route_name,
        elevationLossM: previewDto.elevation_loss_m,
        elevationMinM: previewDto.elevation_min_m,
        elevationMaxM: previewDto.elevation_max_m,
        estimatedMovingTimeSeconds: previewDto.estimated_moving_time_seconds,
        estimationSource: 'cili',
        elevationProfile: previewDto.elevation_profile.map((point) => ({
          distanceKm: point.distance_km,
          elevationM: point.elevation_m,
        })),
        routeOutline: previewDto.route_outline,
        routeBounds: previewDto.route_bounds,
      },
      schedule: [],
      notices: [],
      equipment: [],
      fee: '免费',
    });

    expect((callFunction.mock.calls[0][0].data as any).activity.cover_image).toBe(
      previewDto.generated_preview_file_id,
    );
  });

  it('拒绝伪造的 GPX 预览响应', async () => {
    const invalid = [
      { ...previewDto, preview_id: 'bad' },
      { ...previewDto, gpx_sha256: 'bad' },
      { ...previewDto, estimation_source: 'strava' },
      { ...previewDto, elevation_profile: [{ distance_km: 0, elevation_m: 1 }] },
      { ...previewDto, route_outline: [{ latitude: 22, longitude: 114 }] },
      { ...previewDto, expires_at: 'not-a-date' },
    ];
    const repository = new CloudRepository(cloudWith(...invalid.map(success)).cloud);

    for (const value of invalid) {
      void value;
      await expect(
        repository.previewRouteGpx({
          gpxFileId: previewDto.gpx_file_id,
          gpxSha256: previewDto.gpx_sha256,
          fileName: 'weekend.gpx',
          requestId: 'route_request_123',
        }),
      ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    }
  });
});
