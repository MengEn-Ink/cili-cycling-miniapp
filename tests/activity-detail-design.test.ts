// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  drawElevationProfile,
  formatActivityDate,
  formatChinaDateTimeSeconds,
  validElevationProfile,
} from '../miniprogram/pages/activity-detail/format';
import { drawActivityPoster } from '../miniprogram/pages/activity-detail/poster';

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
    expect(template).toContain('bindtap="copyStravaRoute"');
    expect(template).toContain('bindtap="exportGpx"');
    expect(template).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
    expect(template).toContain('报名状态');
    expect(template).not.toContain('SIGN-UP STATUS');
  });

  it('轨迹链接只保留复制与下载，并通过三色语义令牌门禁', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    const styles = readFileSync('miniprogram/pages/activity-detail/index.wxss', 'utf8');
    const routeStyles = styles.slice(styles.indexOf('/* Strava 轨迹操作统一使用'));
    expect(template).toContain('class="strava-route-url"');
    expect(template).toContain('{{item.route.stravaRouteUrl}}');
    expect(template).toContain("{{item.route.routeName || 'Strava 轨迹'}}");
    expect(template).toContain('item.route.previewImageUrl');
    expect(template).toContain('bindtap="copyStravaRoute"');
    expect(template).toContain('user-select="true"');
    expect(template).toContain('>复制</button>');
    expect(template).toContain('bindtap="exportGpx"');
    expect(template).toContain('item.route.stravaGpxAvailable !== false');
    expect(template).toContain('此公开路线不提供 GPX 下载。');
    expect(template).toContain("{{exportingGpx ? '下载中' : '下载 GPX'}}");
    expect(template).not.toContain('bindtap="copyActivityLink"');
    expect(template).not.toContain('复制活动链接');
    expect(template).not.toContain('bindtap="generatePoster"');
    expect(template).not.toContain('保存分享海报');
    expect(template).not.toContain('poster-canvas');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) auto auto');
    expect(styles).toContain('@media (max-width: 360px)');
    expect(routeStyles).toContain('background: var(--color-surface)');
    expect(routeStyles).toContain('color: var(--color-brand)');
    expect(routeStyles).toContain('background: var(--color-action)');
    expect(routeStyles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('突出集合时间、仅展示审核通过人数，并为管理员提供修改和报名双入口', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('class="card time-card time-card--featured"');
    expect(template).toContain('class="time-card-primary"');
    expect(template).toContain('{{item.approvedRegistrationCount || 0}}');
    expect(template).toContain('已报名人员');
    expect(template).not.toContain('不限</text><text>报名人数');
    expect(template).toContain('bindtap="editActivity">修改活动');
    expect(template).toContain('bindtap="adminRegistration">{{adminRegistrationLabel}}');
    expect(styles).toMatch(/\.time-card-primary\s*\{[^}]*font-size:\s*46rpx;/s);
    expect(styles).toContain('grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);');
    expect(styles).toMatch(/\.detail-hero--media\s*\{[^}]*min-height:\s*460rpx;/s);
    expect(styles).toMatch(
      /\.time-card--featured\s*\{[^}]*background:\s*var\(--color-text\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
  });

  it('使用单一完整票卡承载顶部照片与全部活动信息', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('wx:if="{{item}}" class="detail-unified-card"');
    expect(styles).toMatch(
      /\.detail-unified-card\s*\{[^}]*border:\s*4rpx solid var\(--color-card-border\)/s,
    );
    expect(styles).toMatch(
      /\.detail-unified-card \.card\s*\{[^}]*border:\s*0;[^}]*box-shadow:\s*none;/s,
    );
    expect(styles).toMatch(
      /\.detail-unified-card \.time-card--featured\s*\{[^}]*background:\s*var\(--color-text\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
  });

  it('集合点同时展示自定义名称和地图地址，并保留点位导航', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('class="route-location-name">{{item.route.start}}');
    expect(template).toContain('class="route-location-address"');
    expect(template).toContain('data-target="start" bindtap="navigate">地图导航');
  });

  it('详情日期与集合时间拆开展示，结束和截止时间保留共享秒级格式', () => {
    const page = read('miniprogram/pages/activity-detail/index.ts');
    expect(page).toContain('startTime: formatActivityTime(item.startAt)');
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

  it('提供曲线空态、热门爬坡、圆形头像昵称列表与完整公开骑行名片', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('暂无有效海拔数据');
    expect(template).toContain('item.route.popularClimbs');
    expect(template).toContain('class="attendee-card-strip" scroll-x');
    expect(template).toContain('class="attendee-mini-card"');
    expect(template).toContain('bindtap="openAttendeeCard"');
    expect(template).toContain('头像与昵称经本人授权展示');
    expect(template).toContain('已报名人员头像与昵称');
    expect(template).toContain('完整公开骑行名片');
    expect(template).toContain('数据来自报名时的 Strava 骑行快照');
    expect(template).toContain('wx:if="{{item.avatarUrl}}" class="attendee-avatar"');
    expect(template).toContain('wx:if="{{selectedAttendee.avatarUrl}}"');
    expect(template).toContain('attendee-avatar--placeholder');
    expect(template).toContain('rider-card-photo__placeholder');
    expect(template).not.toContain('defaultAttendeeAvatar');
    expect(template).toContain('binderror="selectedAttendeeAvatarError"');
    expect(template).toContain('class="gender-pill {{selectedAttendee.genderClass}}"');
    expect(template).toContain('{{selectedAttendee.genderLabel}}');
    expect(template).not.toContain('selectedAttendee.title');
    expect(template).not.toContain('骑行爱好者');
    expect(template).toContain('照片沿用骑友公开头像设置，不展示私人骑行照片');
    expect(template).not.toContain('attendee-avatar--default">骑');
    expect(
      template.match(/<text wx:if="\{\{selectedAttendee\.card\.[a-zA-Z0-9]+ !== null\}\}">/g),
    ).toHaveLength(4);
    expect(template).toContain('class="rider-modal-mask" bindtap="closeAttendeeCard"');
    expect(template).toContain('class="rider-card-close"');
    expect(styles).toMatch(
      /\.attendee-mini-card\s*\{[^}]*width:\s*120rpx;[^}]*min-height:\s*176rpx;/s,
    );
    expect(styles).toMatch(
      /\.attendee-avatar\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx;[^}]*border-radius:\s*50%/s,
    );
    expect(styles).toMatch(
      /\.route-actions button\s*\{[^}]*min-height:\s*var\(--control-height\)/s,
    );
    expect(styles).toMatch(
      /\.rider-card\.rider-card--photo\s*\{[^}]*max-height:\s*calc\(100vh - 96rpx\)/s,
    );
    expect(styles).toMatch(/\.rider-card-photo\s*\{[^}]*height:\s*560rpx;/s);
    expect(styles).toMatch(/\.rider-name\s*\{[^}]*overflow-wrap:\s*anywhere/s);
    expect(styles).toMatch(/\.rider-stats > view > text:last-child\s*\{/s);
    expect(styles).not.toMatch(/\.rider-stats text:last-child/);
  });

  it('覆盖访客、报名状态与管理角色，并严格门禁群二维码和骑友卡片', () => {
    const page = read('miniprogram/pages/activity-detail/index.ts');
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    for (const label of [
      '未登录',
      '未报名',
      '待审核',
      '候补中',
      '已通过',
      '已签到',
      '未通过',
      '已取消',
      '组织者',
      '管理员',
    ])
      expect(page).toContain(`label: '${label}'`);
    expect(page).toContain('groupQrVisible(');
    expect(page).toContain("registration?.status === 'approved'");
    expect(page).toContain("registration?.status === 'checked_in'");
    expect(template).toContain('wx:if="{{groupQrVisible && item.groupQrCode}}"');
    expect(page).toContain('报名审核通过后可查看活动群二维码');
    expect(template).toContain('wx:if="{{attendeesVisible}}"');
    expect(template).not.toMatch(/phone|联系电话|紧急联系人|emergency/i);
  });

  it('费用卡支持费用说明、包含与不包含三段', () => {
    const template = readFileSync('miniprogram/pages/activity-detail/index.wxml', 'utf8');
    expect(template).toContain('fee-block-title">费用包含');
    expect(template).toContain('fee-block-title">费用不包含');
    expect(template).toContain('wx:for="{{item.feeIncluded}}"');
    expect(template).toContain('wx:for="{{item.feeExcluded}}"');
  });

  it('分享海报包含活动、集合、审核通过报名与活动群二维码', () => {
    const texts: string[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
      drawImage: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    };
    const groupQrImage = { id: 'qr' };
    const rendered = drawActivityPoster(
      context,
      375,
      700,
      {
        title: '周末环湖骑行',
        description: '一起看湖景',
        route: { distanceKm: 80, elevationM: 600, level: '进阶' },
      } as any,
      {
        displayTime: '2026-10-18 08:00:00',
        locationName: '桥下咖啡集合',
        locationAddress: '滨江路 1 号',
        approvedCount: 2,
        attendeeNames: ['小李', '小王'],
        groupQrImage,
      },
    );

    expect(rendered).toBe(true);
    expect(texts.join('|')).toContain('周末环湖骑行');
    expect(texts.join('|')).toContain('2026-10-18 08:00:00');
    expect(texts.join('|')).toContain('桥下咖啡集合');
    expect(texts.join('|')).toContain('已通过 2 人');
    expect(texts.join('|')).toContain('小李、小王');
    expect(texts.join('|')).toContain('扫码加入活动群');
    expect(context.drawImage).toHaveBeenCalledWith(groupQrImage, 221, 524, 126, 126);
  });

  it('海报长标题截断时保留最后一个可见字符', () => {
    const texts: string[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string) => texts.push(text)),
      drawImage: vi.fn(),
      measureText: vi.fn((text: string) => ({
        width: [...text].reduce((sum, char) => sum + (char === '…' ? 4 : 12), 0),
      })),
    };

    expect(
      drawActivityPoster(context, 375, 700, { title: '一'.repeat(53), route: {} } as any, {
        displayTime: '2026-10-18 08:00:00',
        locationName: '桥下咖啡集合',
        approvedCount: 0,
        attendeeNames: [],
        groupQrImage: { id: 'qr' },
      }),
    ).toBe(true);
    expect(texts).toContain(`${'一'.repeat(26)}…`);
  });

  it('海报报名名单只占二维码左侧单行区域', () => {
    const textDraws: { text: string; x: number; y: number }[] = [];
    const context: any = {
      fillStyle: '',
      font: '',
      fillRect: vi.fn(),
      fillText: vi.fn((text: string, x: number, y: number) => textDraws.push({ text, x, y })),
      drawImage: vi.fn(),
      measureText: vi.fn((text: string) => ({ width: text.length * 12 })),
    };

    expect(
      drawActivityPoster(
        context,
        375,
        700,
        {
          title: '两行标题用于压满海报上方空间并验证名单区域安全',
          description: '两行活动说明用于验证报名名单不会向下覆盖活动群二维码区域。',
          route: { distanceKm: 120, elevationM: 1600, level: '挑战' },
        } as any,
        {
          displayTime: '2026-10-18 08:00:00',
          locationName: '很长的集合地点名称用于验证海报换行安全区域',
          locationAddress: '北京市朝阳区很长的集合地点详细地址 100 号',
          approvedCount: 6,
          attendeeNames: Array.from({ length: 6 }, (_, index) => `骑友${index + 1}号长名字`),
          groupQrImage: { id: 'qr' },
        },
      ),
    ).toBe(true);

    const attendeeDraws = textDraws.filter(({ text }) => text.includes('骑友'));
    expect(attendeeDraws).toHaveLength(1);
    expect(attendeeDraws[0].y).toBeLessThan(524);
  });

  it('使用等宽四列指标、32rpx 展示圆角和轻量安全区 CTA', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template.match(/class="detail-metric"/g)).toHaveLength(4);
    expect(template).toContain('{{estimatedRideTime}}');
    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).toMatch(
      /\.detail-page \.card\s*\{[^}]*border-radius:\s*var\(--radius-display\);/s,
    );
    expect(read('miniprogram/app.wxss')).toContain('--radius-display: 32rpx;');
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
      showModal: vi.fn(),
      previewImage: vi.fn(({ success }: any) => success?.()),
      setClipboardData: vi.fn(function (this: any, { success, fail }: any) {
        if (this !== wx) {
          fail(new Error('setClipboardData:fail invalid receiver'));
          return;
        }
        success();
      }),
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

  it('群二维码保留点击放大和长按菜单，不展示保存按钮', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('bindtap="previewGroupQr"');
    expect(template).toContain('show-menu-by-longpress="{{true}}"');
    expect(template).toContain('点击图片可放大查看');
    expect(template).not.toContain('bindtap="saveGroupQr"');
    expect(template).not.toContain('保存到相册');
    expect(styles).not.toContain('.group-qr-save');
  });

  it('仅对有权限的可见二维码开放预览', async () => {
    const { definition, context } = await loadPage(async () => ({}));
    context.data.item.groupQrCode = 'cloud://bucket/group.jpg';
    context.data.groupQrVisible = false;
    definition.previewGroupQr.call(context);
    expect(wx.previewImage).not.toHaveBeenCalled();

    context.data.groupQrVisible = true;
    definition.previewGroupQr.call(context);
    expect(wx.previewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        current: 'cloud://bucket/group.jpg',
        urls: ['cloud://bucket/group.jpg'],
      }),
    );

    vi.mocked(wx.previewImage).mockImplementationOnce(({ fail }: any) => fail());
    definition.previewGroupQr.call(context);
    expect(wx.showToast).toHaveBeenCalledWith({ title: '二维码预览失败，请重试', icon: 'none' });

    vi.clearAllMocks();
    context.data.item.groupQrCode = '   ';
    definition.previewGroupQr.call(context);
    expect(wx.previewImage).not.toHaveBeenCalled();
  });

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
    expect(context.data.defaultAttendeeAvatar).toBeUndefined();
  });

  it('复制 Strava 路线并生成分享 path', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item.route.stravaRouteUrl = 'https://www.strava.com/routes/123';
    await definition.copyStravaRoute.call(context);
    expect(wx.setClipboardData).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: 'https://www.strava.com/routes/123' }),
    );
    expect(wx.showToast).toHaveBeenLastCalledWith({ title: '轨迹链接已复制', icon: 'success' });
    expect(definition.onShareAppMessage.call(context)).toEqual({
      title: '周末骑行',
      path: 'pages/activity-detail/index?id=a%2F1',
    });
  });

  it('Strava 路线复制失败时明确提示重试', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item.route.stravaRouteUrl = 'https://www.strava.com/routes/123';
    vi.mocked(wx.setClipboardData).mockImplementationOnce(({ fail }: any) =>
      fail({ errMsg: 'setClipboardData:fail no permission', errno: 112 }),
    );

    await definition.copyStravaRoute.call(context);

    expect(wx.showModal).toHaveBeenLastCalledWith({
      title: '复制失败',
      content: 'setClipboardData:fail no permission\n可长按轨迹链接手动复制。',
      showCancel: false,
      confirmText: '知道了',
    });
  });

  it('分享给好友使用 https 封面并保留当前活动 id 与队伍参数', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item = {
      id: 'act/current',
      title: '夜骑浦江',
      coverImage: 'https://temporary.example/cover.jpg',
      images: ['https://temporary.example/first.jpg'],
      route: {},
    };
    context.data.registration = { isTeamLeader: true, teamId: 'team_leader_12345678' };

    expect(definition.onShareAppMessage.call(context)).toEqual({
      title: '夜骑浦江',
      path: 'pages/activity-detail/index?id=act%2Fcurrent&team_id=team_leader_12345678',
      imageUrl: 'https://temporary.example/cover.jpg',
    });
  });

  it('分享到朋友圈使用同一封面降级规则并保留 query 语义', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item = {
      id: 'act-timeline',
      title: '周日爬坡',
      images: ['https://temporary.example/gallery-first.jpg'],
      route: {},
    };
    context.data.teamId = 'team_from_share_12345678';

    expect(definition.onShareTimeline.call(context)).toEqual({
      title: '周日爬坡',
      query: 'id=act-timeline&team_id=team_from_share_12345678',
      imageUrl: 'https://temporary.example/gallery-first.jpg',
    });
  });

  it('缺少封面或封面为 cloud:// 时分享安全降级且不写入 imageUrl', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'a.gpx',
    }));
    context.data.item = { id: 'act-no-cover', title: '无图活动', route: {} };
    expect(definition.onShareAppMessage.call(context)).toEqual({
      title: '无图活动',
      path: 'pages/activity-detail/index?id=act-no-cover',
    });

    context.data.item = {
      id: 'act-cloud-cover',
      title: '云存储原图',
      coverImage: 'cloud://env/path/cover.jpg',
      route: {},
    };
    const share = definition.onShareTimeline.call(context);
    expect(share).toEqual({ title: '云存储原图', query: 'id=act-cloud-cover' });
    expect(share).not.toHaveProperty('imageUrl');
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
