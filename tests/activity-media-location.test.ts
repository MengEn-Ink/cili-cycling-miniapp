// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatActivityDate,
  formatLocalDateTime,
  parseLocalDateTime,
} from '../miniprogram/utils/date-time';

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

const baseActivity = {
  id: 'a1',
  version: 1,
  title: '活动',
  date: '2026-10-18T00:00:00.000Z',
  startAt: '2026-10-18T00:00:00.000Z',
  endAt: '2026-10-18T08:00:00.000Z',
  deadline: '2026-10-17T00:00:00.000Z',
  status: 'draft' as const,
  capacity: 20,
  description: '说明',
  coverImage: 'cloud://legacy-cover.jpg',
  route: { start: '起点', end: '终点', distanceKm: 80, elevationM: 500, level: '进阶' },
  schedule: [],
  notices: [],
  equipment: [],
  fee: '',
};

describe('活动日期展示', () => {
  it('使用紧凑中文日期且非法或空日期明确显示待公布', () => {
    expect(formatActivityDate('2026-10-18')).toBe('10月18日 周日');
    expect(formatActivityDate('2026-02-30')).toBe('日期待公布');
    expect(formatActivityDate('')).toBe('日期待公布');
    expect(formatActivityDate('2026-10-18T00:00:00.000Z')).toBe('10月18日 周日');
    expect(formatActivityDate('2026-09-30T23:00:00.000Z')).toBe('10月1日 周四');
  });
});

describe('活动编辑媒体、时间、说明与地图', () => {
  let page: any;
  let wxApi: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getAdminActivity.mockReset().mockResolvedValue(baseActivity);
    rideService.saveActivity.mockReset().mockImplementation(async (input) => ({
      ...baseActivity,
      ...input,
      version: 2,
    }));
    appStore.ensureIdentity.mockReset().mockResolvedValue(undefined);
    wxApi = {
      cloud: { uploadFile: vi.fn(), deleteFile: vi.fn().mockResolvedValue({ fileList: [] }) },
      chooseMedia: vi.fn(),
      chooseLocation: vi.fn(),
      showToast: vi.fn(),
    };
    vi.stubGlobal('wx', wxApi);
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

  it('加载时本地化时间且保存时严格还原 ISO，空草稿保持可空', async () => {
    await page.onLoad({ id: 'a1' });
    expect(page.data.form.startAt).toBe(formatLocalDateTime(baseActivity.startAt));
    expect(page.data.form.startAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    page.data.form.deadline = '';
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    const submitted = rideService.saveActivity.mock.calls[0][0];
    expect(submitted.startAt).toBe(parseLocalDateTime(page.data.form.startAt, '开始'));
    expect(submitted).not.toHaveProperty('deadline');

    page.data.form.startAt = '2026-02-30 10:00:00';
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).toHaveBeenCalledTimes(1);
    expect(page.data.error).toContain('有效的日期时间');
  });

  it('textarea 固定 5000 且运行时超长也不得提交', async () => {
    await page.onLoad({ id: 'a1' });
    page.data.form.description = '骑'.repeat(5001);
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    expect(page.data.error).toContain('5000');
    const template = readFileSync('miniprogram/pages/admin/activity-edit/index.wxml', 'utf8');
    expect(template).toContain('maxlength="5000"');
    expect(template).toContain('{{form.description.length}}/5000');
    expect(template).not.toMatch(/ISO/);
    const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8'));
    expect(appConfig.requiredPrivateInfos).toContain('chooseLocation');
    const detail = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    const credential = readFileSync('miniprogram/pages/credential/index.wxml', 'utf8');
    expect(detail).toContain('<swiper');
    expect(detail).toContain('bindtap="navigate"');
    expect(credential).toContain('bindtap="navigateToMeeting"');
  });

  it('最多按剩余数量选图，上传到允许前缀并支持封面前移和删除', async () => {
    await page.onLoad({ id: 'a1' });
    wxApi.chooseMedia.mockResolvedValue({ tempFiles: [{ tempFilePath: '/tmp/a.PNG' }] });
    wxApi.cloud.uploadFile.mockResolvedValue({ fileID: 'cloud://new.png' });
    await page.chooseImages();
    expect(wxApi.chooseMedia).toHaveBeenCalledWith({
      count: 8,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
    });
    expect(wxApi.cloud.uploadFile.mock.calls[0][0].cloudPath).toMatch(
      /^profiles\/activity-media\/\d+-[a-z0-9]+\.png$/,
    );
    expect(page.data.images).toEqual(['cloud://legacy-cover.jpg', 'cloud://new.png']);
    page.setCover({ currentTarget: { dataset: { index: 1 } } });
    expect(page.data.coverImage).toBe('cloud://new.png');
    page.removeImage({ currentTarget: { dataset: { index: 0 } } });
    expect(page.data.images).toEqual(['cloud://legacy-cover.jpg']);
  });

  it('批量上传中途失败会回收已上传文件，上传期间保存被锁住', async () => {
    await page.onLoad({ id: 'a1' });
    let release!: (value: unknown) => void;
    wxApi.chooseMedia.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const choosing = page.chooseImages();
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity).not.toHaveBeenCalled();
    release({ tempFiles: [{ tempFilePath: '/tmp/a.jpg' }, { tempFilePath: '/tmp/b.jpg' }] });
    wxApi.cloud.uploadFile
      .mockResolvedValueOnce({ fileID: 'cloud://uploaded-a.jpg' })
      .mockRejectedValueOnce(new Error('private'));
    await choosing;
    expect(page.data.error).toBe('第 2 张图片上传失败，请重试');
    expect(wxApi.cloud.deleteFile).toHaveBeenCalledWith({
      fileList: ['cloud://uploaded-a.jpg'],
    });
    expect(page.data.images).toEqual(['cloud://legacy-cover.jpg']);
    expect(page.data.uploading).toBe(false);
  });

  it('选择起终点保存文本与坐标，手改文本会清除旧坐标', async () => {
    await page.onLoad({ id: 'a1' });
    wxApi.chooseLocation
      .mockResolvedValueOnce({
        name: '集合广场',
        address: '湖滨路 1 号',
        latitude: 30.2,
        longitude: 120.1,
      })
      .mockResolvedValueOnce({ name: '山顶', address: '环山路', latitude: 30.3, longitude: 120.2 });
    await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'start' } } });
    await page.chooseRouteLocation({ currentTarget: { dataset: { target: 'end' } } });
    await page.save({ currentTarget: { dataset: { status: 'draft' } } });
    expect(rideService.saveActivity.mock.calls[0][0].route).toMatchObject({
      start: '集合广场',
      end: '山顶',
      startLocation: { address: '湖滨路 1 号', latitude: 30.2, longitude: 120.1 },
      endLocation: { address: '环山路', latitude: 30.3, longitude: 120.2 },
    });
    page.field({ currentTarget: { dataset: { name: 'routeStart' } }, detail: { value: '手填' } });
    expect(page.data.routeStartLocation).toBeUndefined();
  });
});
