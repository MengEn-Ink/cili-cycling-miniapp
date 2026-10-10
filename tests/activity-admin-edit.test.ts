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
      startAt: formatLocalDateTime(activity.startAt),
      routeStart: '起点',
      description: '说明',
      stravaRouteUrl: 'https://www.strava.com/routes/123',
    });
    expect(page.data.images).toEqual(activity.images?.slice(0, 3));
    expect(page.data.form).not.toHaveProperty('endAt');
    expect(page.data.form).not.toHaveProperty('capacity');
    expect(page.data.form).not.toHaveProperty('fee');
  });

  it('发布只要求集合时间和集合地点', async () => {
    await page.onLoad({});
    await page.save({ currentTarget: { dataset: { status: 'published' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ content: '请选择集合时间' }),
    );

    page.data.form.startAt = '2026-10-18 08:00:00';
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

  it('新活动自动生成兼容字段，草稿可在最小字段未完成时保存', async () => {
    await page.onLoad({});
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: expect.stringContaining('骑行'),
        status: 'draft',
        capacity: 500,
        registrationUnlimited: true,
        fee: '免费',
        route: expect.objectContaining({ end: '', distanceKm: 0, elevationM: 0, level: '' }),
      }),
      undefined,
      undefined,
    );
    const payload = rideService.saveActivity.mock.calls[0][0];
    expect(new Date(payload.deadline).getTime()).toBe(new Date(payload.startAt).getTime() - 60_000);
    expect(new Date(payload.endAt).getTime()).toBe(
      new Date(payload.startAt).getTime() + 14_400_000,
    );
  });

  it('日期和时间选择器共同写入集合时间', async () => {
    await page.onLoad({});
    page.dateTimePicker({
      currentTarget: { dataset: { part: 'date' } },
      detail: { value: '2026-10-20' },
    });
    page.dateTimePicker({
      currentTarget: { dataset: { part: 'time' } },
      detail: { value: '07:30' },
    });
    expect(page.data.form.startAt).toBe('2026-10-20 07:30:00');
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

  it('不限人数标记会让列表和详情隐藏旧路线与费用信息', () => {
    const card = readFileSync('miniprogram/components/activity-card/index.wxml', 'utf8');
    const detail = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(card).toContain("item.registrationUnlimited ? '不限'");
    expect(detail).toContain("item.registrationUnlimited ? '集合时间'");
    expect(detail).toContain('!item.registrationUnlimited && item.route.end');
    expect(detail).toContain('!item.registrationUnlimited && (item.fee');
    expect(detail).toContain('route-profile-card" wx:if="{{!item.registrationUnlimited}}"');
  });

  it('界面只暴露极简字段且不提供 Strava 同步入口', () => {
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('集合时间');
    expect(template).toContain('集合地点');
    expect(template).toContain('最多 3 张');
    expect(template).toContain('备注说明');
    expect(template).toContain('仅保存链接，不再同步');
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
