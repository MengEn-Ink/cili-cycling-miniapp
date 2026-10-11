// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models';
import { formatLocalDateTime } from '../miniprogram/utils/date-time';

const rideService = vi.hoisted(() => ({
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'admin',
  authStatus: 'authenticated',
  ensureIdentity: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

const activity: Activity = {
  id: 'a1',
  version: 7,
  title: '环湖骑行',
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  deadline: '2026-10-15T12:00:00.000Z',
  status: 'published',
  capacity: 20,
  supportVehicleCapacity: 8,
  selfDriveCapacity: 12,
  occupiedCount: 3,
  description: '说明',
  images: ['cloud://1.jpg', 'cloud://2.jpg', 'cloud://3.jpg', 'cloud://legacy.jpg'],
  coverImage: 'cloud://1.jpg',
  groupQrCode: 'cloud://group-qr.jpg',
  groupQrCodeUploadedAt: '2026-10-10T08:00:00.000Z',
  route: {
    start: '起点',
    end: '终点',
    distanceKm: 80,
    elevationM: 600,
    level: '进阶',
    stravaRouteId: '123',
    stravaRouteUrl: 'https://www.strava.com/routes/123',
    elevationProfile: [{ distanceKm: 0, elevationM: 20 }],
    routeBounds: { south: 39, west: 116, north: 40, east: 117 },
    popularClimbs: [],
  },
  schedule: [{ time: '08:00', title: '集合', location: '起点' }],
  notices: ['守规'],
  equipment: ['头盔'],
  fee: '无报名费',
};

const splitLocalDateTime = (value: string) => {
  const text = formatLocalDateTime(value);
  return { startDate: text.slice(0, 10), startTime: text.slice(11, 16) };
};

const savedActivityFromPayload = (payload: any, id = 'saved-activity'): Activity => ({
  ...activity,
  ...payload,
  id,
  version: 1,
  date: payload.startAt,
  startAt: payload.startAt,
  endAt: payload.endAt,
  deadline: payload.deadline,
  images: payload.images,
  coverImage: payload.coverImage,
  groupQrCode: payload.groupQrCode,
  groupQrCodeUploadedAt: payload.groupQrCodeUploadedAt,
  route: { ...activity.route, ...payload.route },
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};
const callFailed = (message: string) => Object.assign(new Error(message), { code: 'CALL_FAILED' });

describe('日常活动极简创建与编辑', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(activity);
    rideService.saveActivity.mockReset().mockResolvedValue({ ...activity, version: 8 });
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', {
      cloud: {},
      showToast: vi.fn(),
      showModal: vi.fn(),
      pageScrollTo: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data, form: { ...definition.data.form } };
      page.setData = (patch: Record<string, unknown>) => {
        for (const [key, value] of Object.entries(patch)) {
          if (key.startsWith('form.')) page.data.form[key.slice(5)] = value;
          else page.data[key] = value;
        }
      };
    });
    await import('../miniprogram/pages/admin/activity-edit/index');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('加载时只回填最小字段并把历史图片收敛为三张', async () => {
    await page.onLoad({ id: activity.id });
    expect(page.data.form).toEqual({
      title: '环湖骑行',
      ...splitLocalDateTime(activity.startAt),
      routeStart: '起点',
      description: '说明',
      stravaRouteUrl: 'https://www.strava.com/routes/123',
    });
    expect(page.data.images).toEqual(activity.images?.slice(0, 3));
    expect(page.data.form).not.toHaveProperty('startAt');
    expect(page.data.form).not.toHaveProperty('endAt');
    expect(page.data.form).not.toHaveProperty('capacity');
    expect(page.data.form).not.toHaveProperty('fee');
  });

  it('修改集合地点名称时保留地图点位以继续导航', async () => {
    await page.onLoad({ id: activity.id });
    page.data.routeStartLocation = {
      name: '旧集合点',
      address: '滨江路 1 号',
      latitude: 30.2,
      longitude: 120.1,
    };

    page.field({
      currentTarget: { dataset: { name: 'routeStart' } },
      detail: { value: '桥下咖啡集合' },
    });

    expect(page.data.form.routeStart).toBe('桥下咖啡集合');
    expect(page.data.routeStartLocation).toEqual({
      name: '桥下咖啡集合',
      address: '滨江路 1 号',
      latitude: 30.2,
      longitude: 120.1,
    });
  });

  it('发布要求活动标题、集合日期、集合时间和集合地点', async () => {
    await page.onLoad({});
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ content: '请输入活动标题' }),
    );

    page.data.form.title = '周末拉练';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '请选择集合日期' }),
    );

    page.data.form.startDate = '2026-10-18';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '请选择集合时间' }),
    );

    page.data.form.startTime = '08:00';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '请选择或填写集合地点' }),
    );
  });

  it('编辑存量活动时只更新可见字段并保留历史运营配置', async () => {
    await page.onLoad({ id: activity.id });
    page.data.form.routeStart = '新集合点';
    page.data.form.description = '带好水';
    page.data.form.stravaRouteUrl = 'https://www.strava.com/routes/999';

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        capacity: 20,
        images: activity.images,
        registrationUnlimited: undefined,
        supportVehicleCapacity: 8,
        selfDriveCapacity: 12,
        fee: '无报名费',
        schedule: activity.schedule,
        notices: activity.notices,
        equipment: activity.equipment,
        route: expect.objectContaining({
          start: '新集合点',
          end: '终点',
          distanceKm: 80,
          elevationM: 600,
          level: '进阶',
          stravaRouteUrl: 'https://www.strava.com/routes/999',
        }),
      }),
      activity.id,
      7,
    );
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(payload.route).not.toHaveProperty('stravaRouteId');
    expect(payload.route).not.toHaveProperty('elevationProfile');
    expect(payload.route).not.toHaveProperty('routeBounds');
  });

  it('Strava 链接未修改时保留历史同步路线数据', async () => {
    await page.onLoad({ id: activity.id });
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(payload.route).toMatchObject({
      stravaRouteId: '123',
      stravaRouteUrl: 'https://www.strava.com/routes/123',
      elevationProfile: activity.route.elevationProfile,
      routeBounds: activity.route.routeBounds,
    });
  });

  it('Strava 合法链接可保存，编辑时清空链接不会写入 payload', async () => {
    await page.onLoad({ id: activity.id });
    page.data.form.stravaRouteUrl = 'https://www.strava.com/routes/456';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity.mock.calls[0][0].route).toMatchObject({
      stravaRouteUrl: 'https://www.strava.com/routes/456',
    });

    rideService.saveActivity.mockClear();
    page.data.form.stravaRouteUrl = '';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity.mock.calls[0][0].route).not.toHaveProperty('stravaRouteUrl');
  });

  it('编辑缺少分类名额的旧活动时不会补写冲突默认值', async () => {
    const legacy = { ...activity };
    delete legacy.supportVehicleCapacity;
    delete legacy.selfDriveCapacity;
    rideService.getAdminActivity.mockResolvedValueOnce(legacy);
    await page.onLoad({ id: activity.id });
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(payload).not.toHaveProperty('supportVehicleCapacity');
    expect(payload).not.toHaveProperty('selfDriveCapacity');
    expect(payload.capacity).toBe(20);
  });

  it('新活动使用用户填写的标题和集合时间生成兼容字段', async () => {
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '周末晨骑',
      startDate: '2026-10-18',
      startTime: '07:00',
    });
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '周末晨骑',
        status: 'draft',
        capacity: 500,
        registrationUnlimited: true,
        fee: '免费',
        route: expect.objectContaining({ end: '', distanceKm: 0, elevationM: 0, level: '' }),
      }),
      undefined,
      undefined,
      expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
    );
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(new Date(payload.deadline).getTime()).toBe(new Date(payload.startAt).getTime() - 60_000);
    expect(new Date(payload.endAt).getTime()).toBe(
      new Date(payload.startAt).getTime() + 14_400_000,
    );
  });

  it('日期和时间选择器分别写入集合日期与时间', async () => {
    await page.onLoad({});
    page.dateTimePicker({
      currentTarget: { dataset: { part: 'date' } },
      detail: { value: '2026-10-20' },
    });
    expect(page.data.form.startDate).toBe('2026-10-20');
    expect(page.data.form.startTime).toBe('');

    page.dateTimePicker({
      currentTarget: { dataset: { part: 'time' } },
      detail: { value: '07:30' },
    });
    expect(page.data.form).toMatchObject({ startDate: '2026-10-20', startTime: '07:30' });
  });

  it('新建模式只选日期不会注入默认时间，补选时间后可发布并在重开时回显', async () => {
    let saved: Activity | undefined;
    rideService.saveActivity.mockImplementation(async (payload: any) => {
      saved = savedActivityFromPayload(payload, 'created-date-time');
      return saved;
    });
    await page.onLoad({});
    page.data.form.title = '晨骑训练';

    page.dateTimePicker({
      currentTarget: { dataset: { part: 'date' } },
      detail: { value: '2026-10-20' },
    });
    expect(page.data.form).toMatchObject({ startDate: '2026-10-20', startTime: '' });
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '请选择集合时间' }),
    );

    page.dateTimePicker({
      currentTarget: { dataset: { part: 'time' } },
      detail: { value: '07:30' },
    });
    page.data.form.routeStart = '湖边广场';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity).toHaveBeenCalledTimes(2);
    expect(rideService.saveActivity.mock.calls.map(([payload]) => payload.status)).toEqual([
      'draft',
      'published',
    ]);
    expect(saved).toBeDefined();

    rideService.getAdminActivity.mockResolvedValueOnce(saved);
    await page.onLoad({ id: saved!.id });
    expect(page.data.form).toMatchObject({ startDate: '2026-10-20', startTime: '07:30' });
  });

  it('新建直接发布先落草稿再按返回版本发布，第二步失败后保留草稿供重试', async () => {
    const calls: Array<{ status: string; id?: string; expectedVersion?: number }> = [];
    let publishAttempts = 0;
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        calls.push({ status: payload.status, id, expectedVersion });
        if (!id) {
          if (payload.status !== 'draft')
            throw new Error('INVALID_TRANSITION / 新活动必须先保存为草稿');
          return savedActivityFromPayload(payload, 'created-two-phase');
        }
        expect(id).toBe('created-two-phase');
        expect(expectedVersion).toBe(1);
        expect(payload.status).toBe('published');
        publishAttempts += 1;
        if (publishAttempts === 1) throw new Error('发布暂时失败，请重试');
        return { ...savedActivityFromPayload(payload, id), version: 2 };
      },
    );
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '两阶段发布晨骑',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(calls.map(({ status }) => status)).toEqual(['draft', 'published']);
    expect(page.data).toMatchObject({
      id: 'created-two-phase',
      version: 1,
      status: 'draft',
      originalActivity: expect.objectContaining({ id: 'created-two-phase', status: 'draft' }),
    });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '发布暂时失败，请重试' }),
    );

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(calls[calls.length - 1]).toEqual({
      status: 'published',
      id: 'created-two-phase',
      expectedVersion: 1,
    });
    expect(page.data).toMatchObject({
      id: 'created-two-phase',
      version: 2,
      status: 'published',
    });
  });

  it('首次创建响应丢失时复用同一幂等键并收敛到同一草稿', async () => {
    let serverDraft: Activity | undefined;
    let createWrites = 0;
    const createRequestIds: Array<string | undefined> = [];
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number, createRequestId?: string) => {
        if (!id) {
          createRequestIds.push(createRequestId);
          if (!serverDraft) {
            createWrites += 1;
            serverDraft = savedActivityFromPayload({ ...payload, status: 'draft' }, 'same-draft');
          }
          if (createRequestIds.length === 1) throw callFailed('草稿已保存但响应丢失');
          return serverDraft;
        }
        expect(id).toBe('same-draft');
        expect(expectedVersion).toBe(1);
        return { ...savedActivityFromPayload(payload, id), version: 2 };
      },
    );
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '幂等创建晨骑',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(createRequestIds).toHaveLength(2);
    expect(createRequestIds[0]).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
    expect(createRequestIds[1]).toBe(createRequestIds[0]);
    expect(createWrites).toBe(1);
    expect(page.data).toMatchObject({ id: 'same-draft', version: 2, status: 'published' });
  });

  it('发布已提交但响应丢失时按草稿 id 回读 published 新版本并收敛成功', async () => {
    let serverCurrent: Activity | undefined;
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        if (!id) {
          serverCurrent = savedActivityFromPayload(
            { ...payload, status: 'draft' },
            'publish-readback',
          );
          return serverCurrent;
        }
        expect(expectedVersion).toBe(1);
        serverCurrent = {
          ...savedActivityFromPayload(payload, id),
          version: 2,
          route: payload.route,
        };
        throw callFailed('发布已提交但响应丢失');
      },
    );
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '发布回读晨骑',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.getAdminActivity).toHaveBeenCalledWith('publish-readback');
    expect(page.data).toMatchObject({
      id: 'publish-readback',
      version: 2,
      status: 'published',
    });
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '保存成功', icon: 'success' });
  });

  it('发布已提交但响应丢失时将真实 mapper 空字段与服务端 trim 形态视为同一结果', async () => {
    let serverCurrent: Activity | undefined;
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        if (!id) {
          serverCurrent = savedActivityFromPayload(
            { ...payload, status: 'draft' },
            'publish-normalized-readback',
          );
          return serverCurrent;
        }
        expect(expectedVersion).toBe(1);
        serverCurrent = {
          ...savedActivityFromPayload(
            {
              ...payload,
              description: payload.description.trim(),
            },
            id,
          ),
          version: 2,
          route: {
            ...payload.route,
            start: payload.route.start.trim(),
            gpxFileId: '',
          },
        };
        delete (serverCurrent as Partial<Activity>).groupQrCodeUploadedAt;
        throw callFailed('发布已提交但响应丢失');
      },
    );
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '真实映射回读晨骑',
      description: '  带首尾空格的说明  ',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '  湖边广场  ',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.getAdminActivity).toHaveBeenCalledWith('publish-normalized-readback');
    expect(serverCurrent).toMatchObject({
      id: 'publish-normalized-readback',
      version: 2,
      status: 'published',
      description: '带首尾空格的说明',
      route: expect.objectContaining({ start: '湖边广场', gpxFileId: '' }),
    });
    expect(serverCurrent).not.toHaveProperty('groupQrCodeUploadedAt');
    expect(page.data).toMatchObject({
      id: 'publish-normalized-readback',
      version: 2,
      status: 'published',
    });
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '保存成功', icon: 'success' });
    expect(wx.showModal).not.toHaveBeenCalled();
  });

  it('零后援容量草稿的历史司机被服务端清空后仍收敛已提交的发布', async () => {
    let serverCurrent: Activity = {
      ...activity,
      id: 'publish-zero-support-driver',
      version: 1,
      status: 'draft',
      supportVehicleCapacity: 0,
      selfDriveCapacity: 20,
      supportVehicleDriver: {
        nickname: '历史司机',
        licensePlate: '京A12345',
        contactPhone: '13800000000',
      },
    };
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        expect(id).toBe('publish-zero-support-driver');
        expect(expectedVersion).toBe(1);
        expect(payload).toMatchObject({
          status: 'published',
          supportVehicleCapacity: 0,
          supportVehicleDriver: {
            nickname: '历史司机',
            licensePlate: '京A12345',
            contactPhone: '13800000000',
          },
        });
        serverCurrent = {
          ...savedActivityFromPayload(payload, id),
          version: 2,
          status: 'published',
          supportVehicleCapacity: 0,
          selfDriveCapacity: 20,
          supportVehicleDriver: { nickname: '', licensePlate: '', contactPhone: '' },
        };
        throw callFailed('发布已提交但响应丢失');
      },
    );
    await page.onLoad({ id: serverCurrent.id });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledTimes(1);
    expect(rideService.getAdminActivity).toHaveBeenCalledTimes(2);
    expect(serverCurrent).toMatchObject({
      id: 'publish-zero-support-driver',
      version: 2,
      status: 'published',
      supportVehicleCapacity: 0,
      supportVehicleDriver: { nickname: '', licensePlate: '', contactPhone: '' },
    });
    expect(page.data).toMatchObject({
      id: 'publish-zero-support-driver',
      version: 2,
      status: 'published',
    });
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '保存成功', icon: 'success' });
    expect(wx.showModal).not.toHaveBeenCalled();
  });

  it('非零后援容量回读到不同司机时仍以冲突关闭', async () => {
    const intendedDriver = {
      nickname: '本端司机',
      licensePlate: '京A12345',
      contactPhone: '13800000000',
    };
    let serverCurrent: Activity = {
      ...activity,
      id: 'publish-concurrent-support-driver',
      version: 1,
      status: 'draft',
      supportVehicleCapacity: 8,
      selfDriveCapacity: 12,
      supportVehicleDriver: intendedDriver,
    };
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        expect(id).toBe('publish-concurrent-support-driver');
        expect(expectedVersion).toBe(1);
        expect(payload.supportVehicleDriver).toEqual(intendedDriver);
        serverCurrent = {
          ...savedActivityFromPayload(payload, id),
          version: 2,
          status: 'published',
          supportVehicleDriver: {
            nickname: '另一会话司机',
            licensePlate: '沪aB54321',
            contactPhone: '13900000000',
          },
        };
        throw callFailed('本端发布未提交');
      },
    );
    await page.onLoad({ id: serverCurrent.id });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledTimes(1);
    expect(page.data).toMatchObject({
      id: 'publish-concurrent-support-driver',
      version: 1,
      status: 'draft',
    });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '活动已被其他人更新，请重新加载后再试' }),
    );
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '保存成功', icon: 'success' });
  });

  it('本端发布未提交而另一会话发布不同内容时冲突关闭', async () => {
    let serverCurrent: Activity | undefined;
    const publishedVersions: number[] = [];
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        if (!id) {
          serverCurrent = savedActivityFromPayload(
            { ...payload, status: 'draft' },
            'concurrent-published',
          );
          return serverCurrent;
        }
        publishedVersions.push(expectedVersion!);
        serverCurrent = {
          ...serverCurrent!,
          version: 2,
          status: 'published',
          title: '另一会话发布的标题',
        };
        throw callFailed('本端发布在服务端提交前失败');
      },
    );
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '本端准备发布的标题',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(publishedVersions).toEqual([1]);
    expect(serverCurrent).toMatchObject({
      version: 2,
      status: 'published',
      title: '另一会话发布的标题',
    });
    expect(page.data).toMatchObject({
      id: 'concurrent-published',
      version: 1,
      status: 'draft',
      title: '本端准备发布的标题',
    });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '活动已被其他人更新，请重新加载后再试' }),
    );
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '保存成功', icon: 'success' });
  });

  it('发布模糊失败回读发现草稿被并发修改时冲突关闭且不覆盖新内容', async () => {
    let serverCurrent: Activity | undefined;
    const publishedVersions: number[] = [];
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        if (!id) {
          serverCurrent = savedActivityFromPayload(
            { ...payload, status: 'draft' },
            'publish-retry',
          );
          return serverCurrent;
        }
        publishedVersions.push(expectedVersion!);
        if (publishedVersions.length === 1) {
          serverCurrent = { ...serverCurrent!, version: 3, title: '另一端已更新的标题' };
          throw callFailed('发布结果不确定');
        }
        serverCurrent = { ...savedActivityFromPayload(payload, id), version: 4 };
        return serverCurrent;
      },
    );
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '发布重试晨骑',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(publishedVersions).toEqual([1]);
    expect(serverCurrent).toMatchObject({
      version: 3,
      title: '另一端已更新的标题',
      status: 'draft',
    });
    expect(page.data).toMatchObject({ id: 'publish-retry', version: 1, status: 'draft' });
    expect(wx.showModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ content: '活动已被其他人更新，请重新加载后再试' }),
    );
    expect(wx.showToast).not.toHaveBeenCalledWith({ title: '保存成功', icon: 'success' });
  });

  it('发布有界重试已提交但响应再次丢失时二次回读 published 并收敛成功', async () => {
    let serverCurrent: Activity | undefined;
    const publishedVersions: number[] = [];
    rideService.saveActivity.mockImplementation(
      async (payload: any, id?: string, expectedVersion?: number) => {
        if (!id) {
          serverCurrent = savedActivityFromPayload(
            { ...payload, status: 'draft' },
            'publish-second-readback',
          );
          return serverCurrent;
        }
        publishedVersions.push(expectedVersion!);
        if (publishedVersions.length === 1) {
          throw callFailed('第一次发布在提交前失败');
        }
        serverCurrent = {
          ...savedActivityFromPayload(payload, id),
          version: 2,
          route: payload.route,
        };
        throw callFailed('第二次发布已提交但响应丢失');
      },
    );
    rideService.getAdminActivity.mockImplementation(async () => serverCurrent);
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '二次回读晨骑',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(publishedVersions).toEqual([1, 1]);
    expect(rideService.getAdminActivity).toHaveBeenCalledTimes(2);
    expect(page.data).toMatchObject({
      id: 'publish-second-readback',
      version: 2,
      status: 'published',
    });
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '保存成功', icon: 'success' });
    expect(wx.showModal).not.toHaveBeenCalled();
  });

  it('跨日深夜集合时间保存后重开仍保持原日期和时间', async () => {
    let saved: Activity | undefined;
    rideService.saveActivity.mockImplementation(async (payload: any) => {
      saved = savedActivityFromPayload(payload, 'created-cross-day');
      return saved;
    });
    await page.onLoad({});
    page.data.form.title = '夜骑训练';
    page.data.form.startDate = '2026-10-11';
    page.data.form.startTime = '23:30';
    page.data.form.routeStart = '夜骑起点';

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(formatLocalDateTime(rideService.saveActivity.mock.calls[0][0].startAt)).toBe(
      '2026-10-11 23:30:00',
    );
    rideService.getAdminActivity.mockResolvedValueOnce(saved);
    await page.onLoad({ id: saved!.id });
    expect(page.data.form).toMatchObject({ startDate: '2026-10-11', startTime: '23:30' });
  });

  it('图片选择本地预览、上传成功、保存与重开回读保持数量和顺序', async () => {
    const firstUpload = deferred<{ fileID: string }>();
    const secondUpload = deferred<{ fileID: string }>();
    const uploadFile = vi
      .fn()
      .mockReturnValueOnce(firstUpload.promise)
      .mockReturnValueOnce(secondUpload.promise);
    let saved: Activity | undefined;
    rideService.saveActivity.mockImplementation(async (payload: any) => {
      saved = savedActivityFromPayload(payload, 'created-images');
      return saved;
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/tmp/first.jpg' }, { tempFilePath: '/tmp/second.jpg' }],
      }),
    });
    Object.assign(wx.cloud!, { uploadFile });

    const choosing = page.chooseImages();
    await vi.waitFor(() => expect(page.data.pendingImages).toHaveLength(2));
    expect(page.data.pendingImages).toEqual([
      expect.objectContaining({ previewPath: '/tmp/first.jpg', status: 'uploading' }),
      expect.objectContaining({ previewPath: '/tmp/second.jpg', status: 'uploading' }),
    ]);

    firstUpload.resolve({ fileID: 'cloud://first.jpg' });
    secondUpload.resolve({ fileID: 'cloud://second.jpg' });
    await choosing;
    expect(page.data.images).toEqual(['cloud://first.jpg', 'cloud://second.jpg']);
    expect(page.data.coverImage).toBe('cloud://first.jpg');

    page.data.form.title = '周末骑行';
    page.data.form.startDate = '2026-10-20';
    page.data.form.startTime = '07:30';
    page.data.form.routeStart = '湖边广场';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity.mock.calls[0][0]).toMatchObject({
      images: ['cloud://first.jpg', 'cloud://second.jpg'],
      coverImage: 'cloud://first.jpg',
    });

    rideService.getAdminActivity.mockResolvedValueOnce(saved);
    await page.onLoad({ id: saved!.id });
    expect(page.data.images).toEqual(['cloud://first.jpg', 'cloud://second.jpg']);
    expect(page.data.coverImage).toBe('cloud://first.jpg');
  });

  it('图片失败项可重试恢复并在保存重开后完整回读', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ fileID: 'cloud://success.jpg' })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ fileID: 'cloud://retry.jpg' });
    let saved: Activity | undefined;
    rideService.saveActivity.mockImplementation(async (payload: any) => {
      saved = savedActivityFromPayload(payload, 'created-retry-images');
      return saved;
    });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/tmp/first.jpg' }, { tempFilePath: '/tmp/second.jpg' }],
      }),
    });
    Object.assign(wx.cloud!, { uploadFile });

    await page.chooseImages();
    expect(page.data.images).toEqual([]);
    expect(page.data.pendingImages).toEqual([
      expect.objectContaining({ previewPath: '/tmp/first.jpg', status: 'uploaded' }),
      expect.objectContaining({ previewPath: '/tmp/second.jpg', status: 'failed' }),
    ]);
    expect(page.data.error).toContain('上传失败');

    await page.retryImage({ currentTarget: { dataset: { id: page.data.pendingImages[1].id } } });
    expect(page.data.images).toEqual(['cloud://success.jpg', 'cloud://retry.jpg']);
    expect(page.data.pendingImages).toEqual([]);

    page.data.form.title = '周末骑行';
    page.data.form.startDate = '2026-10-20';
    page.data.form.startTime = '07:30';
    page.data.form.routeStart = '湖边广场';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    rideService.getAdminActivity.mockResolvedValueOnce(saved);
    await page.onLoad({ id: saved!.id });
    expect(page.data.images).toEqual(['cloud://success.jpg', 'cloud://retry.jpg']);
  });

  it('图片并行上传时保留成功项并为失败项提供独立重试状态', async () => {
    const uploadFile = vi
      .fn()
      .mockResolvedValueOnce({ fileID: 'cloud://success.jpg' })
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce({ fileID: 'cloud://retry.jpg' });
    Object.assign(wx, {
      chooseMedia: vi.fn().mockResolvedValue({
        tempFiles: [{ tempFilePath: '/tmp/first.jpg' }, { tempFilePath: '/tmp/second.jpg' }],
      }),
    });
    Object.assign(wx.cloud!, { uploadFile });

    await page.chooseImages();

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(page.data.images).toEqual([]);
    expect(page.data.pendingImages).toEqual([
      expect.objectContaining({
        previewPath: '/tmp/first.jpg',
        status: 'uploaded',
        fileId: 'cloud://success.jpg',
      }),
      expect.objectContaining({ previewPath: '/tmp/second.jpg', status: 'failed' }),
    ]);
    expect(page.data.error).toContain('1 张图片上传失败');
    expect(page.data.uploading).toBe(false);

    const failedId = page.data.pendingImages[1].id;
    await page.retryImage({ currentTarget: { dataset: { id: failedId } } });
    expect(page.data.images).toEqual(['cloud://success.jpg', 'cloud://retry.jpg']);
    expect(page.data.pendingImages).toEqual([]);
  });

  it('退出未保存页面时清理本次会话已上传的孤立文件', async () => {
    const deleteFile = vi.fn().mockResolvedValue({ fileList: [] });
    Object.assign(wx.cloud!, { deleteFile });
    page.data.sessionUploadedIds = ['cloud://orphan.jpg'];

    page.onUnload();
    await Promise.resolve();

    expect(deleteFile).toHaveBeenCalledWith({ fileList: ['cloud://orphan.jpg'] });

    deleteFile.mockClear();
    page.unloaded = false;
    page.saveInFlight = true;
    page.onUnload();
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('日常活动详情隐藏旧路线费用和不限人数话术，并突出集合时间', () => {
    const card = readFileSync('miniprogram/components/activity-card/index.wxml', 'utf8');
    const detail = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(card).toContain("item.registrationUnlimited ? (item.occupied + ' 人已报名')");
    expect(card).toContain("item.route.start || '集合地点待公布'");
    expect(card).not.toContain("item.route.end || '终点待公布'");
    expect(detail).toContain('class="time-card-primary"');
    expect(detail).not.toContain('不限</text><text>报名人数');
    expect(detail).toContain('!item.registrationUnlimited && item.route.end');
    expect(detail).toContain('!item.registrationUnlimited && (item.fee');
    expect(detail).toContain('route-profile-card" wx:if="{{!item.registrationUnlimited}}"');
  });

  it('活动群二维码可独立上传并随活动保存回读', async () => {
    const uploadFile = vi.fn().mockResolvedValue({ fileID: 'cloud://new-group-qr.jpg' });
    let saved: Activity | undefined;
    rideService.saveActivity.mockImplementation(async (payload: any) => {
      saved = savedActivityFromPayload(payload, 'created-group-qr');
      return saved;
    });
    Object.assign(wx, {
      chooseMedia: vi
        .fn()
        .mockResolvedValue({ tempFiles: [{ tempFilePath: '/tmp/group-qr.jpg' }] }),
    });
    Object.assign(wx.cloud!, { uploadFile });

    await page.onLoad({});
    await page.chooseGroupQrCode();

    expect(uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudPath: expect.stringContaining('profiles/activity-group-qr/'),
        filePath: '/tmp/group-qr.jpg',
      }),
    );
    expect(page.data.groupQrCode).toBe('cloud://new-group-qr.jpg');
    expect(page.data.groupQrCodeExpired).toBe(false);

    page.data.form.title = '周末骑行';
    page.data.form.startDate = '2026-10-20';
    page.data.form.startTime = '07:30';
    page.data.form.routeStart = '湖边广场';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity.mock.calls[0][0]).toMatchObject({
      groupQrCode: 'cloud://new-group-qr.jpg',
      groupQrCodeUploadedAt: expect.any(String),
    });
    rideService.getAdminActivity.mockResolvedValueOnce(saved);
    await page.onLoad({ id: 'created-group-qr' });
    expect(page.data.groupQrCode).toBe('cloud://new-group-qr.jpg');
  });

  it('界面只暴露极简字段且不提供 Strava 同步入口', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('活动标题');
    expect(template).toContain('集合时间');
    expect(template).toContain('集合地点');
    expect(template).toContain('最多 3 张');
    expect(template).toContain('备注说明');
    expect(template).toContain('活动群二维码');
    expect(template).toContain('二维码可能已过期');
    expect(template).toContain('仅保存链接，不再同步');
    expect(template).toContain('form.title');
    expect(template).toContain('form.startDate');
    expect(template).toContain('form.startTime');
    expect(template).not.toContain('form.startAt');
    expect(template).not.toContain('quick-row');
    expect(template).not.toContain('明早');
    expect(template).not.toContain('下周六');
    expect(template).not.toContain('DAILY RIDE');
    for (const removed of [
      '活动结束',
      '路线终点',
      '路线里程',
      '累计爬升',
      '路线难度',
      '报名名额',
      '费用说明',
    ])
      expect(template).not.toContain(removed);
    expect(page.syncStravaRoute).toBeUndefined();
  });
});
