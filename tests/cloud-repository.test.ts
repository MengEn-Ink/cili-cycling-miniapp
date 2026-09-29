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
  event_start: '2026-10-18T00:00:00.000Z',
  event_end: new Date('2026-10-18T08:00:00.000Z'),
  signup_deadline: '2026-10-15T12:00:00.000Z',
  status: 'published',
  capacity: 20,
  occupied_count: 3,
  description: '说明',
  route: { start: '起点', end: '终点', distance_km: 80, elevation_m: 600, level: '进阶' },
  schedule: [{ time: '08:00', title: '集合', location: '起点' }],
  notices: ['守规'],
  equipment: ['头盔'],
  fee: { remark: '无报名费' },
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
  options: { bike_mode: 'rent', experience: 'regular', remark: '无忌口' },
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
        route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 600, level: '进阶' },
        schedule: activity.schedule,
        notices: ['守规'],
        equipment: ['头盔'],
        fee: '无报名费',
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
    });
  });

  it('费用对象无 remark 时返回空字符串', async () => {
    const { cloud } = cloudWith(success({ ...activity, fee: {} }));
    await expect(new CloudRepository(cloud).getActivity('a1')).resolves.toMatchObject({ fee: '' });
  });
});

describe('CloudRepository 队员报名适配', () => {
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
      bikeMode: '租车',
      experience: '常骑',
      remark: '无忌口',
      reviewComment: '补充资料',
      serialNo: 'RE-001',
      profile: {
        nickname: '骑手',
        realName: '曹*',
        phone: '138****5678',
        idNumber: '11******1234',
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
      bikeMode: '自带车',
      experience: '有一定经验',
      rentalNeed: 'M 码',
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
        bike_mode: 'own',
        experience: 'intermediate',
        rental_need: 'M 码',
        remark: '正常',
      },
    });
    const sent = JSON.stringify(callFunction.mock.calls[0][0]);
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
        bikeMode: '自带车',
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
    const submission = { activityId: 'a1', bikeMode: '租车', experience: '新手' };

    expect((await repository.saveRegistration(submission)).status).toBe('rejected');
    expect((await repository.saveRegistration(submission)).status).toBe('pending');
    expect(callFunction).toHaveBeenCalledTimes(2);
    expect(callFunction.mock.calls[0][0]).toEqual(callFunction.mock.calls[1][0]);
  });

  it('提交字段类型异常时使用安全默认值，不透传对象', async () => {
    const { cloud, callFunction } = cloudWith(success(registration));
    await new CloudRepository(cloud).saveRegistration({
      activityId: 'a1',
      bikeMode: '未知',
      experience: '未知',
      rentalNeed: { status: 'approved' },
      remark: 10,
    } as any);
    expectCall(callFunction, 'registration', {
      action: 'submit',
      activityId: 'a1',
      options: { bike_mode: 'own', experience: undefined, rental_need: '', remark: '' },
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
      bikeMode: '自带车',
      experience: '',
      remark: '',
      reviewComment: undefined,
      profile: { nickname: '', realName: '', phone: '', idNumber: '' },
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

  it('管理员详情使用 admin-review/detail', async () => {
    const { cloud, callFunction } = cloudWith(success(registration));
    await new CloudRepository(cloud).getReviewRegistration('r1');
    expectCall(callFunction, 'admin-review', { action: 'detail', registrationId: 'r1' });
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
      realName: '曹蒙恩',
      phone: '13812345678',
    });
    expectCall(callFunction, 'profile', {
      action: 'update',
      nickname: '新昵称',
      real_name: '曹蒙恩',
      phone: '13812345678',
    });
    await repository.getPhoneNumber('dynamic-code');
    expectCall(callFunction, 'profile', { action: 'getPhoneNumber', code: 'dynamic-code' });
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
});
