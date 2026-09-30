// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity, EditableActivity } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
  previewStravaRoute: vi.fn(),
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
  supportVehicleDriver: {
    nickname: '王师傅',
    licensePlate: '粤B12345',
    contactPhone: '13812345678',
  },
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
  schedule: [{ time: '08:00', title: '集合', location: '起点', remark: '停车场集合' }],
  notices: ['守规'],
  equipment: ['头盔'],
  fee: '无报名费',
  feeIncluded: ['保险'],
  feeExcluded: ['午餐'],
};

describe('管理员普通编辑保留未展示的活动字段', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(activity);
    rideService.saveActivity.mockReset().mockResolvedValue({ ...activity, version: 8 });
    rideService.previewStravaRoute.mockReset();
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    vi.stubGlobal('wx', { cloud: {}, showToast: vi.fn() });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
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

  it('只改标题时仍提交 schedule remark、GPX 与费用明细', async () => {
    await page.onLoad({ id: activity.id });
    expect(appStore.ensureIdentity).toHaveBeenCalledWith(wx.cloud);
    page.data.form.title = '新标题';

    await page.save({ currentTarget: { dataset: {} } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: '新标题',
        schedule: activity.schedule,
        route: expect.objectContaining({ gpxFileId: activity.route.gpxFileId }),
        fee: activity.fee,
        feeIncluded: activity.feeIncluded,
        feeExcluded: activity.feeExcluded,
        supportVehicleCapacity: 8,
        selfDriveCapacity: 12,
        supportVehicleDriver: activity.supportVehicleDriver,
      }),
      activity.id,
      7,
    );
    expect(page.data.version).toBe(8);
  });

  it('模板草稿显示清空字段提示并允许缺少运营字段时保存', async () => {
    const cloneDraft: EditableActivity = {
      id: 'activity_clone_new',
      version: 1,
      title: '环湖骑行副本',
      status: 'draft',
      capacity: 20,
      occupiedCount: 0,
      description: '说明',
      route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 600, level: '进阶' },
      schedule: activity.schedule,
      notices: activity.notices,
      equipment: activity.equipment,
      fee: activity.fee,
    };
    rideService.getAdminActivity.mockResolvedValueOnce(cloneDraft);
    rideService.saveActivity.mockResolvedValueOnce({ ...cloneDraft, version: 2 });

    await page.onLoad({ id: cloneDraft.id, fromTemplate: '1' });

    expect(page.data.fromTemplate).toBe(true);
    expect(page.data.canPublish).toBe(false);
    expect(readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8')).toContain(
      '已复制内容，日期、交通名额和司机信息需重新确认',
    );
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted).not.toHaveProperty('deadline');
    expect(submitted).not.toHaveProperty('startAt');
    expect(submitted).not.toHaveProperty('endAt');
    expect(submitted).not.toHaveProperty('supportVehicleCapacity');
    expect(submitted).not.toHaveProperty('selfDriveCapacity');
    expect(submitted).not.toHaveProperty('supportVehicleDriver');
    expect(page.data.version).toBe(2);
  });

  it('发布按钮受完整重填清单保护，缺字段时不会调用保存', async () => {
    await page.onLoad({ id: activity.id });
    page.data.status = 'draft';
    page.data.form.startAt = '';
    page.recomputePublishReadiness();

    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('发布');
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('重新确认清单');
    expect(template).toContain('名额、报名截止、费用和封面可后续补充');
    expect(template).toContain('封面文件 ID（选填）');
    expect(template).toContain('路线文件 ID（选填）');
    expect(template).toMatch(/data-status="published"[^>]*disabled="{{saving \|\| !canPublish}}"/);
  });

  it('无封面和 GPX 但有费用清单的完整草稿可以发布', async () => {
    const draft: EditableActivity = {
      ...activity,
      status: 'draft',
      coverImage: '',
      route: { ...activity.route, gpxFileId: '' },
      fee: '',
      feeIncluded: ['往返车费'],
      feeExcluded: [],
    };
    rideService.getAdminActivity.mockResolvedValueOnce(draft);
    rideService.saveActivity.mockResolvedValueOnce({ ...draft, status: 'published', version: 8 });

    await page.onLoad({ id: draft.id });
    expect(page.data.canPublish).toBe(true);
    await page.save({ currentTarget: { dataset: { status: 'published' } } });

    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', coverImage: '' }),
      draft.id,
      draft.version,
    );
  });

  it.each(['published', 'finished'] as const)(
    '报名截止后允许 published 活动保存为 %s',
    async (nextStatus) => {
      const historical = {
        ...activity,
        status: 'published' as const,
        deadline: '2025-10-15T12:00:00.000Z',
        startAt: '2025-10-18T00:00:00.000Z',
        endAt: '2025-10-18T08:00:00.000Z',
      };
      rideService.getAdminActivity.mockResolvedValueOnce(historical);
      rideService.saveActivity.mockResolvedValueOnce({
        ...historical,
        status: nextStatus,
        version: 8,
      });

      await page.onLoad({ id: historical.id });
      await page.save({ currentTarget: { dataset: { status: nextStatus } } });

      expect(rideService.saveActivity).toHaveBeenCalledWith(
        expect.objectContaining({ status: nextStatus }),
        historical.id,
        historical.version,
      );
    },
  );

  it('同步 Strava 路线后自动回填里程爬升并提交服务端预览字段', async () => {
    const preview = {
      stravaRouteId: '12345',
      stravaRouteUrl: 'https://www.strava.com/routes/12345',
      distanceKm: 42.3,
      elevationM: 880,
      elevationProfile: [
        { distanceKm: 0, elevationM: 10 },
        { distanceKm: 42.3, elevationM: 20 },
      ],
      routeBounds: { south: 22, west: 113, north: 23, east: 114 },
      popularClimbs: [
        {
          id: '8',
          name: '测试坡',
          distanceKm: 2,
          elevationGainM: 200,
          averageGrade: 10,
          maxGrade: 15,
          climbCategory: 2,
          popularity: 99,
          popularityLabel: '99 收藏',
        },
      ],
    };
    rideService.previewStravaRoute.mockResolvedValueOnce(preview);
    await page.onLoad({ id: activity.id });
    page.data.form.stravaRouteUrl = preview.stravaRouteUrl;

    await page.syncStravaRoute();
    await page.save({ currentTarget: { dataset: {} } });

    expect(rideService.previewStravaRoute).toHaveBeenCalledWith(preview.stravaRouteUrl);
    expect(page.data.form.distanceKm).toBe('42.3');
    expect(page.data.form.elevationM).toBe('880');
    expect(rideService.saveActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        route: expect.objectContaining({
          stravaRouteId: '12345',
          stravaRouteUrl: preview.stravaRouteUrl,
          elevationProfile: preview.elevationProfile,
          routeBounds: preview.routeBounds,
          popularClimbs: preview.popularClimbs,
          distanceKm: 42.3,
          elevationM: 880,
        }),
      }),
      activity.id,
      activity.version,
    );
    expect(readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8')).toContain(
      '同步路线',
    );
  });

  it('修改 Strava URL 后必须重新同步，不能提交旧曲线', async () => {
    await page.onLoad({ id: activity.id });
    page.field({
      currentTarget: { dataset: { name: 'stravaRouteUrl' } },
      detail: { value: 'https://www.strava.com/routes/999' },
    });
    await page.save({ currentTarget: { dataset: {} } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('先同步');
  });
});
