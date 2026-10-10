// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Activity } from '../miniprogram/models';
import { formatActivityDate, formatChinaDateTime } from '../miniprogram/utils/date-time';

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
  version: 1,
  title: '日常骑行',
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T04:00:00.000Z',
  deadline: '2026-10-17T23:59:00.000Z',
  status: 'draft',
  capacity: 500,
  description: '',
  images: ['cloud://one.jpg'],
  coverImage: 'cloud://one.jpg',
  route: { start: '集合点', end: '集合点', distanceKm: 0, elevationM: 0, level: '' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '免费',
};

describe('活动日期展示', () => {
  it('使用紧凑中文日期且非法或空日期明确显示待公布', () => {
    expect(formatActivityDate('2026-10-18T00:00:00.000Z')).toContain('10月18日');
    expect(formatActivityDate('')).toBe('日期待公布');
    expect(formatActivityDate('bad')).toBe('日期待公布');
  });

  it('完整时间固定按 UTC+8 展示到秒，非法值为空', () => {
    expect(formatChinaDateTime('2026-10-18T00:00:00.000Z')).toBe('2026-10-18 08:00:00');
    expect(formatChinaDateTime('bad')).toBe('');
  });
});

describe('日常活动封面、说明与地图', () => {
  let page: any;
  let chooseMedia: ReturnType<typeof vi.fn>;
  let chooseLocation: ReturnType<typeof vi.fn>;
  let uploadFile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(activity);
    rideService.saveActivity.mockReset().mockResolvedValue(activity);
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    chooseMedia = vi.fn();
    chooseLocation = vi.fn();
    uploadFile = vi.fn();
    vi.stubGlobal('wx', {
      cloud: { uploadFile, deleteFile: vi.fn().mockResolvedValue({}) },
      chooseMedia,
      chooseLocation,
      showToast: vi.fn(),
      showModal: vi.fn().mockResolvedValue({}),
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

  it('说明输入固定 5000 字且运行时超长不得提交', async () => {
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('maxlength="5000"');
    await page.onLoad({ id: activity.id });
    page.data.form.description = 'x'.repeat(5001);
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ content: '备注说明不能超过 5000 字' }),
    );
  });

  it('按剩余数量选图且总数最多三张', async () => {
    await page.onLoad({ id: activity.id });
    chooseMedia.mockResolvedValue({
      tempFiles: [{ tempFilePath: '/tmp/two.png' }, { tempFilePath: '/tmp/three.jpg' }],
    });
    uploadFile
      .mockResolvedValueOnce({ fileID: 'cloud://two.png' })
      .mockResolvedValueOnce({ fileID: 'cloud://three.jpg' });
    await page.chooseImages();
    expect(chooseMedia).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2, mediaType: ['image'] }),
    );
    expect(page.data.images).toEqual(['cloud://one.jpg', 'cloud://two.png', 'cloud://three.jpg']);

    await page.chooseImages();
    expect(chooseMedia).toHaveBeenCalledTimes(1);
    expect(page.data.error).toContain('最多 3 张');
  });

  it('支持把任意照片设为封面和删除照片', async () => {
    await page.onLoad({ id: activity.id });
    page.data.images = ['cloud://one.jpg', 'cloud://two.jpg', 'cloud://three.jpg'];
    page.setCover({ currentTarget: { dataset: { index: 2 } } });
    expect(page.data.images[0]).toBe('cloud://three.jpg');
    expect(page.data.coverImage).toBe('cloud://three.jpg');
    page.removeImage({ currentTarget: { dataset: { index: 0 } } });
    expect(page.data.images).toEqual(['cloud://one.jpg', 'cloud://two.jpg']);
  });

  it('地图只选择起点并保存坐标，手改地点会清除旧坐标', async () => {
    await page.onLoad({});
    chooseLocation.mockResolvedValue({
      name: '奥森南门',
      address: '林萃路',
      latitude: 39.9,
      longitude: 116.4,
    });
    await page.chooseRouteLocation();
    expect(page.data.form.routeStart).toBe('奥森南门');
    expect(page.data.routeStartLocation).toEqual(
      expect.objectContaining({ latitude: 39.9, longitude: 116.4 }),
    );
    page.field({
      currentTarget: { dataset: { name: 'routeStart' } },
      detail: { value: '手动地点' },
    });
    expect(page.data.routeStartLocation).toBeUndefined();
  });

  it('取消地图选点不报错，定位权限关闭时给出恢复提示', async () => {
    chooseLocation.mockRejectedValueOnce({ errMsg: 'chooseLocation:fail cancel' });
    await page.chooseRouteLocation();
    expect(page.data.error).toBe('');

    chooseLocation.mockRejectedValueOnce({
      errMsg: 'chooseLocation:fail system permission denied',
    });
    await page.chooseRouteLocation();
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: '无法打开地图选点', showCancel: false }),
    );
  });

  it('隐私配置缺失时给出管理员提示且不回显底层错误', async () => {
    chooseLocation.mockRejectedValueOnce({
      errMsg: 'chooseLocation:fail privacy api scope not open',
    });
    await page.chooseRouteLocation();
    expect(wx.showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: '地图选点暂不可用', showCancel: false }),
    );
    expect(page.data.error).not.toContain('api scope');
  });
});
