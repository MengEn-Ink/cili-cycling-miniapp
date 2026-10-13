// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models';
import { formatLocalDateTime } from '../miniprogram/utils/date-time';
import { sha256Hex } from '../miniprogram/utils/route';

const rideService = vi.hoisted(() => ({
  previewRouteGpx: vi.fn(),
  bindRoutePreviewImage: vi.fn(),
  previewPublicStravaRoute: vi.fn(),
  previewStravaRoute: vi.fn(),
  getStravaReadiness: vi.fn(),
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  openid: 'owner-openid',
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
    rideService.previewRouteGpx.mockReset();
    rideService.bindRoutePreviewImage.mockReset();
    rideService.previewPublicStravaRoute.mockReset();
    rideService.previewStravaRoute.mockReset();
    rideService.getStravaReadiness.mockReset().mockResolvedValue({ state: 'ready' });
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
          externalProvider: 'strava',
          externalRouteId: '999',
          externalRouteUrl: 'https://www.strava.com/routes/999',
        }),
      }),
      activity.id,
      7,
    );
    expect(rideService.previewPublicStravaRoute).not.toHaveBeenCalled();
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(payload.route).not.toHaveProperty('elevationProfile');
    expect(payload.route).not.toHaveProperty('routeBounds');
  });

  it('历史 Strava 链接未修改时改写为通用官方路线字段', async () => {
    await page.onLoad({ id: activity.id });
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(payload.route).toMatchObject({
      externalProvider: 'strava',
      externalRouteId: '123',
      externalRouteUrl: 'https://www.strava.com/routes/123',
    });
    expect(payload.route).not.toHaveProperty('stravaRouteId');
    expect(payload.route).not.toHaveProperty('elevationProfile');
  });

  it('草稿可暂存 Strava 合法链接，编辑时清空链接不会写入 payload', async () => {
    await page.onLoad({ id: activity.id });
    page.data.form.stravaRouteUrl = 'https://www.strava.com/routes/456';
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity.mock.calls[0][0].route).toMatchObject({
      externalProvider: 'strava',
      externalRouteId: '456',
      externalRouteUrl: 'https://www.strava.com/routes/456',
    });
    expect(rideService.previewPublicStravaRoute).not.toHaveBeenCalled();

    rideService.saveActivity.mockClear();
    page.data.form.stravaRouteUrl = '';
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity.mock.calls[0][0].route).not.toHaveProperty('externalRouteUrl');
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

  it('日常活动详情隐藏旧路线费用和不限人数话术，并只为可信 GPX 展示路线详情', () => {
    const card = readFileSync('miniprogram/components/activity-card/index.wxml', 'utf8');
    const detail = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(card).toContain('item.registrationUnlimited ? item.occupied');
    expect(card).toContain(
      "item.capacity > 0 ? (item.occupied + ' / ' + item.capacity) : '待确认'",
    );
    expect(card).toContain("item.capacity <= 0 ? '名额' : '报名'");
    expect(card).not.toContain('人已报名');
    expect(card).toContain("item.route.start || '集合地点待公布'");
    expect(card).not.toContain("item.route.end || '终点待公布'");
    expect(detail).toContain('class="time-card-primary"');
    expect(detail).not.toContain('不限</text><text>报名人数');
    expect(detail).toContain('!item.registrationUnlimited && item.route.end');
    expect(detail).toContain('!item.registrationUnlimited && (item.fee');
    expect(detail).toContain('class="gpx-route-card" wx:if="{{hasGpxRoute}}"');
    expect(detail).not.toContain('route-profile-card');
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

  it('添加官方路线只校验并归一化链接，不请求 Strava 页面数据', async () => {
    await page.onLoad({});
    page.data.form.stravaRouteUrl = 'https://www.strava.com/zh-CN/routes/42/';

    page.addOfficialRoute();

    expect(page.data.form.stravaRouteUrl).toBe('https://www.strava.com/routes/42');
    expect(page.data.officialRoute).toEqual({
      provider: 'strava',
      routeId: '42',
      url: 'https://www.strava.com/routes/42',
    });
    expect(rideService.previewPublicStravaRoute).not.toHaveBeenCalled();
    expect(rideService.previewStravaRoute).not.toHaveBeenCalled();
    expect(wx.showToast).toHaveBeenCalledWith({
      title: '已添加。参与者可查看 Strava 官方路线。',
      icon: 'none',
    });
  });

  it('选择 GPX 后按 SHA-256 所有者路径上传并读取可信详情', async () => {
    const source = new TextEncoder().encode('<gpx>route</gpx>');
    const digest = sha256Hex(source);
    const fileId = `cloud://env/activity-routes/${appStore.openid}/${digest}.gpx`;
    const preview = {
      previewId: 'a'.repeat(64),
      gpxFileId: fileId,
      gpxSha256: digest,
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
    };
    const uploadFile = vi.fn().mockResolvedValue({ fileID: fileId });
    Object.assign(wx, {
      chooseMessageFile: vi.fn().mockResolvedValue({
        tempFiles: [{ name: 'weekend.gpx', path: '/tmp/weekend.gpx', size: source.byteLength }],
      }),
      getFileSystemManager: () => ({
        readFile: ({ success }: any) => success({ data: source.buffer }),
      }),
    });
    Object.assign(wx.cloud!, { uploadFile, deleteFile: vi.fn().mockResolvedValue({}) });
    rideService.previewRouteGpx.mockResolvedValue(preview);
    await page.onLoad({});

    await page.chooseRouteGpx();

    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath: `activity-routes/${appStore.openid}/${digest}.gpx`,
      filePath: '/tmp/weekend.gpx',
    });
    expect(rideService.previewRouteGpx).toHaveBeenCalledWith({
      gpxFileId: fileId,
      gpxSha256: digest,
      fileName: 'weekend.gpx',
      requestId: expect.stringMatching(/^[A-Za-z0-9_-]{8,128}$/),
    });
    expect(page.data.routePreview).toEqual(preview);
    expect(page.data.routeStatusMessage).toBe('路线详情已准备好');
    expect(page.data.sessionRouteFileIds).toEqual([fileId]);
  });

  it('路线轮廓 Canvas 生成 PNG 后绑定为同摘要预览图', async () => {
    const digest = 'b'.repeat(64);
    const generatedFileId = `cloud://env/activity-routes/${appStore.openid}/${digest}.png`;
    const preview = {
      previewId: 'a'.repeat(64),
      gpxFileId: `cloud://env/activity-routes/${appStore.openid}/${digest}.gpx`,
      gpxSha256: digest,
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
    };
    const gradient = { addColorStop: vi.fn() };
    const context = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      closePath: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
    };
    const outlineCanvas = { getContext: vi.fn(() => context), width: 0, height: 0 };
    const elevationCanvas = { getContext: vi.fn(() => context), width: 0, height: 0 };
    Object.assign(wx, {
      getWindowInfo: () => ({ pixelRatio: 2 }),
      createSelectorQuery: () => {
        let selector = '';
        const query = {
          in: () => query,
          select: (value: string) => {
            selector = value;
            return query;
          },
          fields: () => query,
          exec: (callback: (value: any[]) => void) =>
            callback([
              {
                node: selector.includes('outline') ? outlineCanvas : elevationCanvas,
                width: 320,
                height: selector.includes('outline') ? 180 : 140,
              },
            ]),
        };
        return query;
      },
      canvasToTempFilePath: vi.fn(({ success }: any) =>
        success({ tempFilePath: '/tmp/route.png' }),
      ),
    });
    const uploadFile = vi.fn().mockResolvedValue({ fileID: generatedFileId });
    Object.assign(wx.cloud!, { uploadFile });
    rideService.bindRoutePreviewImage.mockResolvedValue({
      ...preview,
      generatedPreviewFileId: generatedFileId,
    });
    page.data.routePreview = preview;

    await page.renderRouteVisuals();

    expect(uploadFile).toHaveBeenCalledWith({
      cloudPath: `activity-routes/${appStore.openid}/${digest}.png`,
      filePath: '/tmp/route.png',
    });
    expect(rideService.bindRoutePreviewImage).toHaveBeenCalledWith(
      preview.previewId,
      generatedFileId,
    );
    expect(page.data.routePreview.generatedPreviewFileId).toBe(generatedFileId);
    expect(page.data.sessionRouteFileIds).toContain(generatedFileId);
  });

  it('GPX 取消选择不报错，超限文件在上传前给出明确操作', async () => {
    Object.assign(wx, {
      chooseMessageFile: vi
        .fn()
        .mockRejectedValueOnce({ errMsg: 'chooseMessageFile:fail cancel' })
        .mockResolvedValueOnce({
          tempFiles: [{ name: 'large.gpx', path: '/tmp/large.gpx', size: 4 * 1024 * 1024 + 1 }],
        }),
    });
    Object.assign(wx.cloud!, { uploadFile: vi.fn() });
    await page.onLoad({});

    await page.chooseRouteGpx();
    expect(page.data.error).toBe('');

    await page.chooseRouteGpx();
    expect(page.data.error).toBe('文件超过 4 MB，请选择更小的 GPX');
    expect(wx.cloud!.uploadFile).not.toHaveBeenCalled();
  });

  it('移除未保存 GPX 会清理本次会话文件', () => {
    const fileId = `cloud://env/activity-routes/${appStore.openid}/${'b'.repeat(64)}.gpx`;
    const deleteFile = vi.fn().mockResolvedValue({});
    Object.assign(wx.cloud!, { deleteFile });
    page.data.routePreview = { previewId: 'a'.repeat(64), gpxFileId: fileId };
    page.data.sessionRouteFileIds = [fileId];

    page.removeRouteDetails();

    expect(deleteFile).toHaveBeenCalledWith({ fileList: [fileId] });
    expect(page.data.routePreview).toBeUndefined();
    expect(page.data.sessionRouteFileIds).toEqual([]);
  });

  it('保存时 GPX 指标优先并与官方路线字段独立提交', async () => {
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '路线双模式',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '湖边广场',
      stravaRouteUrl: 'https://www.strava.com/routes/42',
    });
    page.addOfficialRoute();
    page.data.routePreview = {
      previewId: 'a'.repeat(64),
      gpxFileId: `cloud://env/activity-routes/${appStore.openid}/${'b'.repeat(64)}.gpx`,
      gpxSha256: 'b'.repeat(64),
      generatedPreviewFileId: `cloud://env/activity-routes/${appStore.openid}/${'b'.repeat(64)}.png`,
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
    };

    await page.save({ currentTarget: { dataset: { status: 'draft' } } });

    expect(rideService.saveActivity.mock.calls[0][0].route).toMatchObject({
      externalProvider: 'strava',
      externalRouteId: '42',
      externalRouteUrl: 'https://www.strava.com/routes/42',
      gpxPreviewId: 'a'.repeat(64),
      gpxSha256: 'b'.repeat(64),
      routeName: '周末环湖',
      distanceKm: 52.4,
      elevationM: 680,
      elevationLossM: 675,
      elevationMinM: 12,
      elevationMaxM: 486,
      estimationSource: 'cili',
    });
    expect(rideService.previewPublicStravaRoute).not.toHaveBeenCalled();
  });

  it('发布只保存官方路线链接，不调用页面读取服务', async () => {
    const routeUrl = 'https://www.strava.com/routes/2995569663284766500';
    rideService.previewPublicStravaRoute.mockRejectedValue(new Error('不应调用旧页面读取服务'));
    rideService.saveActivity.mockImplementation(async (payload: any) =>
      savedActivityFromPayload(payload),
    );
    await page.onLoad({});
    Object.assign(page.data.form, {
      title: '公开路线测试',
      startDate: '2026-10-20',
      startTime: '07:30',
      routeStart: '中关村广场',
      stravaRouteUrl: routeUrl,
    });

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.previewPublicStravaRoute).not.toHaveBeenCalled();
    expect(rideService.saveActivity).toHaveBeenCalledTimes(2);
    expect(rideService.saveActivity.mock.calls[1][0].route).toMatchObject({
      externalProvider: 'strava',
      externalRouteId: '2995569663284766500',
      externalRouteUrl: routeUrl,
      distanceKm: 0,
      elevationM: 0,
    });
  });

  it('界面保持极简字段并提供官方路线与 GPX 增强', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('活动标题');
    expect(template).toContain('集合时间');
    expect(template).toContain('集合地点');
    expect(template).toContain('最多 3 张');
    expect(template).toContain('备注说明');
    expect(template).toContain('活动群二维码');
    expect(template).toContain('二维码可能已过期');
    expect(template).toContain('Strava 官方路线（可选）');
    expect(template).toContain('添加官方路线');
    expect(template).toContain('查看官方路线');
    expect(template).toContain('GPX 路线详情（推荐）');
    expect(template).toContain('上传 GPX');
    expect(template).toContain('路线详情已准备好');
    expect(template).toContain('此里估算 {{routeTimeLabel}}');
    expect(template).toContain('routePreview.routeName');
    expect(template).toContain('id="route-outline-canvas"');
    expect(template).toContain('id="route-elevation-canvas"');
    expect(template).not.toMatch(/OAuth|授权|令牌|回调|完整识别|自动解析/);
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
    expect(page.addOfficialRoute).toBeTypeOf('function');
    expect(page.chooseRouteGpx).toBeTypeOf('function');
    expect(page.removeRouteDetails).toBeTypeOf('function');
  });
});
