// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { existsSync, readFileSync } from 'node:fs';
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

  it('路线操作完整保留复制 Strava 路线、活动链接、海报与 GPX 四项', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(template).toContain('bindtap="openStravaRoute"');
    expect(template).toContain('复制 Strava 路线');
    expect(template).toContain('bindtap="copyActivityLink"');
    expect(template).toContain('复制活动链接');
    expect(template).toContain('bindtap="generatePoster"');
    expect(template).toContain('保存分享海报');
    expect(template).toContain('bindtap="exportGpx"');
    expect(template).toContain('导出 GPX');
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

  it('提供曲线空态、热门爬坡、可触控头像与完整公开骑行名片', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('暂无有效海拔数据');
    expect(template).toContain('item.route.popularClimbs');
    expect(template).toContain('bindtap="openAttendeeCard"');
    expect(template).toContain('点击头像查看公开骑行名片');
    expect(template).toContain('公开骑行名片');
    expect(template).toContain('数据来自报名时的 Strava 骑行快照');
    expect(template).toContain('src="{{item.avatarUrl || defaultAttendeeAvatar}}"');
    expect(template).toContain('src="{{selectedAttendee.avatarUrl || defaultAttendeeAvatar}}"');
    expect(template).toContain('binderror="selectedAttendeeAvatarError"');
    expect(template).toContain('class="gender-pill {{selectedAttendee.genderClass}}"');
    expect(template).toContain('{{selectedAttendee.genderLabel}}');
    expect(template).not.toContain('selectedAttendee.title');
    expect(template).not.toContain('骑行爱好者');
    expect(template).toContain('头像按骑友公开设置展示');
    expect(template).not.toContain('attendee-avatar--default">骑');
    expect(existsSync('miniprogram/assets/profile/avatars/cili-orange.png')).toBe(true);
    expect(
      template.match(/<text wx:if="\{\{selectedAttendee\.card\.[a-zA-Z0-9]+ !== null\}\}">/g),
    ).toHaveLength(4);
    expect(template).toContain('class="rider-modal-mask" bindtap="closeAttendeeCard"');
    expect(template).toContain('class="rider-card-close"');
    expect(styles).toMatch(
      /\.attendee-avatar-button\s*\{[^}]*width:\s*var\(--control-height\)[^}]*height:\s*var\(--control-height\)/s,
    );
    expect(styles).toMatch(
      /\.route-actions button\s*\{[^}]*min-height:\s*var\(--control-height\)/s,
    );
    expect(styles).toMatch(/\.rider-card\s*\{[^}]*max-height:\s*calc\(100vh - 96rpx\)/s);
    expect(styles).toMatch(/\.rider-name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(styles).toMatch(/\.rider-identity\s*\{[^}]*padding-right:\s*120rpx/s);
    expect(styles).toMatch(/\.rider-stats > view > text:last-child\s*\{/s);
    expect(styles).not.toMatch(/\.rider-stats text:last-child/);
  });

  it('费用卡支持费用说明、包含与不包含三段', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(template).toContain('fee-block-title">费用包含');
    expect(template).toContain('fee-block-title">费用不包含');
    expect(template).toContain('wx:for="{{item.feeIncluded}}"');
    expect(template).toContain('wx:for="{{item.feeExcluded}}"');
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

  it('点击有效头像打开名片，关闭后清空当前骑友', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'route.gpx',
    }));
    const attendee = {
      id: 'rider-1',
      displayName: '长距离骑行者',
      gender: '女',
      avatarUrl: '',
      status: 'approved',
      card: { rides90d: null, longestKm: 180, elevationM: 3200, speedKmh: 26.5 },
    };
    context.data.attendees = [attendee];
    context.data.selectedAttendee = null;

    definition.openAttendeeCard.call(context, { currentTarget: { dataset: { index: 0 } } });
    expect(context.data.selectedAttendee).toEqual({
      ...attendee,
      genderLabel: '女',
      genderClass: 'gender-female',
    });
    definition.closeAttendeeCard.call(context);
    expect(context.data.selectedAttendee).toBeNull();

    definition.openAttendeeCard.call(context, { currentTarget: { dataset: { index: 9 } } });
    expect(context.data.selectedAttendee).toBeNull();
  });

  it('远端头像加载失败时列表和弹窗都回退默认图片', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'route.gpx',
    }));
    context.data.attendees = [
      {
        id: 'rider-1',
        displayName: '山野骑手',
        avatarUrl: 'https://temporary.example/avatar.jpg',
      },
    ];
    context.data.selectedAttendee = {
      ...context.data.attendees[0],
      avatarUrl: 'https://temporary.example/modal-avatar.jpg',
    };

    definition.attendeeAvatarError.call(context, {
      currentTarget: { dataset: { index: 0 } },
    });
    expect(context.data.attendees[0].avatarUrl).toBe('');

    definition.selectedAttendeeAvatarError.call(context);
    expect(context.data.selectedAttendee.avatarUrl).toBe('');
    expect(context.data.defaultAttendeeAvatar).toBe('/assets/profile/avatars/cili-orange.png');
  });

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
