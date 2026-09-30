// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drawElevationProfile,
  formatActivityDate,
  formatChinaDateTimeSeconds,
  validElevationProfile,
} from '../miniprogram/pages/activity-detail/format';

const read = (file: string) => readFileSync(file, 'utf8');

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('活动详情设计与日期契约', () => {
  it('显示中国标准时间到秒，且日历日期不偏移时区', () => {
    expect(formatActivityDate('2026-10-18')).toBe('10月18日 周日');
    expect(formatActivityDate('2026-09-30T23:00:00.000Z')).toBe('10月1日 周四');
    expect(formatChinaDateTimeSeconds('2026-09-30T23:00:01.000Z')).toBe('2026-10-01 07:00:01');
    expect(formatActivityDate('2026-02-30')).toBe('日期待公布');
  });

  it('保持轮播降级、地图导航、路线操作和真实 CTA 状态接线', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('wx:if="{{galleryImages.length > 1 && !coverFailed}}"');
    expect(template).toContain('binderror="galleryImageError"');
    expect(template).toContain('bindtap="navigate"');
    expect(template).toContain('bindtap="openStravaRoute"');
    expect(template).toContain('bindtap="copyActivityLink"');
    expect(template).toContain('bindtap="exportGpx"');
    expect(template).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
  });

  it('详情的开始、结束、截止时间全部使用共享秒级格式化函数', () => {
    const page = read('miniprogram/pages/activity-detail/index.ts');
    expect(page).toContain('startTime: formatChinaDateTimeSeconds(item.startAt)');
    expect(page).toContain('endTime: formatChinaDateTimeSeconds(item.endAt)');
    expect(page).toContain('deadlineTime: formatChinaDateTimeSeconds(item.deadline)');
  });

  it('canvas 绘制橙色曲线、渐变、坐标文字和最高最低点，无有效数据时不绘制', () => {
    const gradient = { addColorStop: vi.fn() };
    const context: any = {
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillText: vi.fn(),
      arc: vi.fn(),
    };
    expect(drawElevationProfile(context, 300, 150, [], 2)).toBe(false);
    expect(context.stroke).not.toHaveBeenCalled();
    expect(
      drawElevationProfile(
        context,
        300,
        150,
        [
          { distanceKm: 0, elevationM: 30 },
          { distanceKm: 4, elevationM: 120 },
          { distanceKm: 10, elevationM: 60 },
        ],
        2,
      ),
    ).toBe(true);
    expect(context.createLinearGradient).toHaveBeenCalled();
    expect(gradient.addColorStop).toHaveBeenCalledTimes(2);
    expect(context.fillText).toHaveBeenCalledTimes(4);
    expect(context.arc).toHaveBeenCalledTimes(2);
    expect(context.strokeStyle).toBe('#ff5722');
  });

  it('海拔数据过滤非法点并按里程排序', () => {
    expect(validElevationProfile(null)).toEqual([]);
    expect(
      validElevationProfile([
        null,
        'bad',
        {},
        { distanceKm: '1', elevationM: 10 },
        { distanceKm: Number.NaN, elevationM: 10 },
        { distanceKm: -1, elevationM: 10 },
        { distanceKm: 1, elevationM: '10' },
        { distanceKm: 1, elevationM: Number.POSITIVE_INFINITY },
        { distanceKm: 8, elevationM: 80 },
        { distanceKm: 0, elevationM: -5 },
      ]),
    ).toEqual([
      { distanceKm: 0, elevationM: -5 },
      { distanceKm: 8, elevationM: 80 },
    ]);
  });

  it('海拔绘制拒绝无效画布尺寸和同里程，并兼容缺少 setTransform 与异常像素比', () => {
    const gradient = { addColorStop: vi.fn() };
    const context: any = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      createLinearGradient: vi.fn(() => gradient),
      fillText: vi.fn(),
      arc: vi.fn(),
    };
    const profile = [
      { distanceKm: 0, elevationM: 50 },
      { distanceKm: 2, elevationM: 50 },
    ];
    expect(drawElevationProfile(null, 300, 150, profile)).toBe(false);
    expect(drawElevationProfile(context, 0, 150, profile)).toBe(false);
    expect(drawElevationProfile(context, 300, 0, profile)).toBe(false);
    expect(
      drawElevationProfile(context, 300, 150, [
        { distanceKm: 1, elevationM: 20 },
        { distanceKm: 1, elevationM: 30 },
      ]),
    ).toBe(false);
    expect(drawElevationProfile(context, 40, 30, profile, Number.NaN)).toBe(true);
    expect(drawElevationProfile(context, 300, 150, profile, 0)).toBe(true);
    expect(context.clearRect).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalledTimes(4);
  });

  it('提供曲线空态、热门爬坡、重叠头像与遮罩关闭的骑行卡', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('暂无有效海拔数据');
    expect(template).toContain('item.route.popularClimbs');
    expect(template).toContain('bindtap="openAttendeeCard"');
    expect(template).toContain('class="rider-modal-mask" bindtap="closeAttendeeCard"');
    expect(styles).toMatch(/\.attendee-avatar-button\s*\{[^}]*margin:\s*0 0 8rpx -14rpx;/s);
  });

  it('使用等宽三列指标、24rpx 展示圆角和轻量安全区 CTA', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template.match(/class="detail-metric"/g)).toHaveLength(3);
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(styles).toMatch(
      /\.detail-page \.card\s*\{[^}]*border-radius:\s*var\(--radius-display\);/s,
    );
    expect(read('miniprogram/app.wxss')).toContain('--radius-display: 24rpx;');
    expect(styles).toContain('calc(12rpx + env(safe-area-inset-bottom))');
  });
});

describe('活动详情复制、分享与 GPX 导出', () => {
  async function loadPage(exporter: (id: string) => Promise<any>) {
    let definition: any;
    const fileSystem = { writeFile: vi.fn(({ success }) => success()) };
    vi.stubGlobal('wx', {
      env: { USER_DATA_PATH: '/tmp/user' },
      showShareMenu: vi.fn(),
      showToast: vi.fn(),
      setClipboardData: vi.fn(({ success }) => success()),
      getFileSystemManager: vi.fn(() => fileSystem),
      shareFileMessage: vi.fn(({ success }) => success()),
      saveFile: vi.fn(({ success }) => success()),
    });
    vi.stubGlobal('Page', (value: any) => {
      definition = value;
    });
    vi.resetModules();
    const { repository } = await import('../miniprogram/repositories');
    vi.spyOn(repository, 'exportActivityGpx').mockImplementation(exporter);
    await import('../miniprogram/pages/activity-detail/index');
    const context = {
      ...definition,
      data: { ...definition.data, item: { id: 'a/1', title: '周末骑行', route: {} } },
      setData(patch: Record<string, unknown>, callback?: () => void) {
        Object.assign(this.data, patch);
        callback?.();
      },
    };
    return { definition, context, repository };
  }

  it('复制 Strava/活动链接并生成分享 path', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item.route.stravaRouteUrl = 'https://www.strava.com/routes/123';
    definition.openStravaRoute.call(context);
    expect(wx.setClipboardData).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: 'https://www.strava.com/routes/123' }),
    );
    definition.copyActivityLink.call(context);
    expect(wx.setClipboardData).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: 'pages/activity-detail/index?id=a%2F1' }),
    );
    expect(definition.onShareAppMessage.call(context)).toEqual({
      title: '周末骑行',
      path: 'pages/activity-detail/index?id=a%2F1',
    });
  });

  it('GPX 成功写入并优先分享，busy 时不重复调用', async () => {
    const exporter = vi.fn(async () => ({ base64: 'eA==', fileName: 'route.gpx' }));
    const { definition, context } = await loadPage(exporter);
    await definition.exportGpx.call(context);
    expect(exporter).toHaveBeenCalledWith('a/1');
    expect(wx.getFileSystemManager().writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ encoding: 'base64' }),
    );
    expect(wx.shareFileMessage).toHaveBeenCalled();
    context.exportBusy = true;
    await definition.exportGpx.call(context);
    expect(exporter).toHaveBeenCalledTimes(1);
  });

  it('不支持分享文件时保存 GPX 并明确提示', async () => {
    const loaded = await loadPage(async () => ({ base64: 'eA==', fileName: 'route.gpx' }));
    (wx as any).shareFileMessage = undefined;
    await loaded.definition.exportGpx.call(loaded.context);
    expect(wx.saveFile).toHaveBeenCalledWith(
      expect.objectContaining({ tempFilePath: '/tmp/user/route.gpx' }),
    );
    expect(wx.showToast).toHaveBeenCalledWith({ title: 'GPX 已保存', icon: 'success' });
  });

  it('GPX 超过 4MB 或服务失败时提示且不写文件', async () => {
    const oversized = await loadPage(async () => ({
      base64: 'A'.repeat(5_592_408),
      fileName: 'large.gpx',
    }));
    await oversized.definition.exportGpx.call(oversized.context);
    expect(wx.getFileSystemManager().writeFile).not.toHaveBeenCalled();
    expect(wx.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('4MB') }),
    );

    const failed = await loadPage(async () => {
      throw new Error('导出服务不可用');
    });
    await failed.definition.exportGpx.call(failed.context);
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '导出服务不可用' }));
  });
});
