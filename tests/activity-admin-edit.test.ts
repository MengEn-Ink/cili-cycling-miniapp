import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getAdminActivity: vi.fn(),
  saveActivity: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  role: 'admin',
  authStatus: 'authenticated',
  refreshIdentity: vi.fn(),
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
    appStore.refreshIdentity.mockReset().mockResolvedValue(undefined);
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
});
