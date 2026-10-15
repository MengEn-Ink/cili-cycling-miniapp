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

  it('保持轮播降级、地图导航、双路线操作和真实 CTA 状态接线', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('wx:if="{{galleryImages.length > 1 && !coverFailed}}"');
    expect(template).toContain('binderror="galleryImageError"');
    expect(template).toContain('bindtap="navigate"');
    expect(template).toContain('bindtap="copyOfficialRoute"');
    expect(template).toContain('bindtap="downloadGpx"');
    expect(template).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
    expect(template).toContain('报名状态');
    expect(template).not.toContain('SIGN-UP STATUS');
  });

  it('官方路线与 GPX 详情各自清晰呈现，并通过三色语义令牌门禁', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('class="official-route-card"');
    expect(template).toContain('Strava 官方路线');
    expect(template).toContain('bindtap="copyOfficialRoute">复制路线链接');
    expect(template).not.toContain('bindtap="openOfficialRoute"');
    expect(template).toContain('class="gpx-route-card"');
    expect(template).toContain('bindtap="previewRouteImage"');
    expect(template).toContain('bindtap="downloadGpx"');
    expect(template).not.toContain('bindtap="copyActivityLink"');
    expect(template).not.toContain('poster-canvas');
    expect(styles).toContain('var(--color-status-success)');
    expect(styles).toContain('var(--color-brand)');
    expect(styles).toContain('var(--color-action)');
    expect(styles).toContain('min-height: var(--control-height)');
  });

  it('首屏使用独立头图、浅色信息卡、同行状态与集合重点区', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('class="detail-hero"');
    expect(template).toContain('class="info-bar"');
    expect(template).toContain('class="card time-card time-card--featured"');
    expect(template).toContain('class="meeting-location"');
    expect(template.match(/{{startTime \|\| '待公布'}}/g)).toHaveLength(1);
    expect(template.match(/{{viewerStatus.label}}/g)).toHaveLength(2);
    expect(template).toContain('已报名人员');
    expect(template).toContain('bindtap="editActivity">修改活动');
    expect(template).toContain('bindtap="adminRegistration">{{adminRegistrationLabel}}');
    expect(styles).toMatch(/\.detail-hero\s*\{[^}]*height:\s*360rpx/s);
    expect(styles).toMatch(
      /\.detail-page \.info-bar\s*\{[^}]*background:\s*var\(--color-surface\)/s,
    );
    expect(styles).toMatch(/\.time-card-primary\s*\{[^}]*font-size:\s*48rpx/s);
  });

  it('保留完整可发现功能，并以 token、路线详情和 chips 落地黑白橙票据', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    for (const marker of [
      '海拔曲线',
      '路线轮廓',
      'Strava 官方路线',
      '下载 GPX',
      '已报名人员',
      '活动群二维码',
      '路线概况',
      '终点导航',
      '时间安排',
      '装备与注意',
      '费用说明',
    ])
      expect(template).toContain(marker);
    expect(template).toContain('class="chip-list"');
    expect(template).toContain('class="gear-chip"');
    expect(template).toContain('class="notice-chip"');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(styles).toContain('min-height: var(--control-height)');
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it('内容区由同级分区卡片承载，不恢复嵌套单票卡', () => {
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(styles).toMatch(/\.content\s*\{[^}]*display:\s*flex;[^}]*gap:\s*var\(--card-gap\)/s);
    expect(styles).toMatch(/\.content > \.card,[\s\S]*margin-top:\s*0;/s);
    expect(styles).not.toMatch(/\.detail-page \.card\s*\{[^}]*border:\s*0/s);
  });

  it('头图与内容卡保持同级，使用统一圆角和近黑描边', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('wx:if="{{item}}" class="detail-unified-card"');
    expect(template).toContain('class="detail-hero"');
    expect(template).toContain('class="content"');
    expect(styles).toMatch(/\.detail-hero\s*\{[^}]*2rpx solid var\(--color-border\)/s);
    expect(styles).toMatch(/\.detail-hero\s*\{[^}]*var\(--radius-card\)/s);
  });

  it('集合点只在重点票卡展示名称和地图地址，同时保留点位导航', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('class="meeting-location__name">{{item.route.start}}');
    expect(template).toContain('class="meeting-location__address"');
    expect(template).toContain('data-target="start" bindtap="navigate">导航');
    expect(template.match(/>\{\{item\.route\.start\}\}</g)).toHaveLength(1);
    expect(template).not.toContain('class="hero-route"');
    expect(styles).toContain('min-height: var(--control-height)');
  });

  it('常见屏宽与小屏都完整展示报名状态提示，不隐藏下一步说明', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('class="decision-hint"');
    expect(styles).toMatch(/\.decision-hint\s*\{[^}]*color:\s*var\(--color-muted\)/s);
    expect(styles).not.toMatch(/\.decision-hint\s*\{[^}]*display:\s*none/s);
    expect(styles).not.toMatch(/\.decision-hint\s*\{[^}]*white-space:\s*nowrap/s);
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

  it('提供曲线空态、路线轮廓、圆形头像昵称列表与完整公开骑行名片', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('暂无有效海拔数据');
    expect(template).toContain('id="route-outline-canvas"');
    expect(template).not.toContain('起点坐标');
    expect(template).not.toContain('终点坐标');
    expect(template).not.toContain('routeStartCoordinate');
    expect(styles).toMatch(/\.route-outline-canvas,[\s\S]*?height:\s*440rpx/);
    expect(template).not.toContain('item.route.popularClimbs');
    expect(template).toContain('class="attendee-card-strip" scroll-x');
    expect(template).toContain('class="attendee-mini-card"');
    expect(template).toContain('bindtap="openAttendeeCard"');
    expect(template).toContain('头像与昵称经本人授权展示');
    expect(template).toContain('已报名人员头像与昵称');
    expect(template).toContain('完整公开骑行名片');
    expect(template).toContain('昵称、头像与照片由骑友本人维护，仅展示公开资料');
    expect(template).toContain('wx:if="{{item.avatarUrl}}" class="attendee-avatar"');
    expect(template).toContain('wx:if="{{selectedAttendee.backgroundUrl}}"');
    expect(template).toContain('attendee-avatar--placeholder');
    expect(template).toContain('rider-card-photo__placeholder');
    expect(template).not.toContain('defaultAttendeeAvatar');
    expect(template).toContain('binderror="selectedAttendeeBackgroundError"');
    expect(template).toContain('class="gender-pill {{selectedAttendee.genderClass}}"');
    expect(template).toContain('{{selectedAttendee.genderLabel}}');
    expect(template).not.toContain('selectedAttendee.title');
    expect(template).not.toContain('骑行爱好者');
    expect(template).toContain('昵称、头像与照片由骑友本人维护，仅展示公开资料');
    expect(template).not.toContain('attendee-avatar--default">骑');
    expect(template).not.toContain('selectedAttendee.card');
    expect(template).toContain('class="rider-modal-mask" bindtap="closeAttendeeCard"');
    expect(template).toContain('class="rider-card-close"');
    expect(styles).toMatch(
      /\.attendee-mini-card\s*\{[^}]*flex:\s*0 0 112rpx;[^}]*min-height:\s*160rpx;/s,
    );
    expect(styles).toMatch(
      /\.attendee-avatar\s*\{[^}]*width:\s*88rpx;[^}]*height:\s*88rpx;[^}]*border-radius:\s*50%/s,
    );
    expect(styles).toContain('min-height: var(--control-height)');
    expect(styles).toMatch(/\.rider-card-photo\s*\{[^}]*height:\s*400rpx;/s);
    expect(styles).toMatch(/\.rider-name\s*\{[^}]*font-size:\s*48rpx/s);
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

  it('使用两列核心指标、同级卡片和轻量安全区 CTA', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template).toContain('<metric-grid class="metric-panel"');
    expect(template).toContain("value: estimatedRideTime || '--'");
    expect(template).toContain("label: '已通过'");
    expect(template).toContain('columns="2" narrow-columns="2"');
    expect(styles).toContain('var(--radius-card)');
    expect(styles).toContain('env(safe-area-inset-bottom)');
  });
});

describe('活动详情官方路线、分享与 GPX 下载', () => {
  async function loadPage(downloader: (id: string) => Promise<any>) {
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
      navigateTo: vi.fn(),
    });
    vi.stubGlobal('Page', (value: any) => {
      definition = value;
    });
    vi.resetModules();
    const { repository } = await import('../miniprogram/repositories');
    vi.spyOn(repository, 'downloadRouteGpx').mockImplementation(downloader);
    await import('../miniprogram/pages/activity-detail/index');
    const context = {
      ...definition,
      data: {
        ...definition.data,
        hasGpxRoute: true,
        item: {
          id: 'a/1',
          title: '周末骑行',
          route: {
            gpxFileId: 'cloud://env/activity-routes/owner/route.gpx',
            gpxSha256: 'a'.repeat(64),
          },
        },
      },
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

  it('路线预览图支持点击全屏查看并处理打开失败', async () => {
    const { definition, context } = await loadPage(async () => ({}));
    context.data.item.route.generatedPreviewUrl = 'https://images.example/route.jpg';

    definition.previewRouteImage.call(context);
    expect(wx.previewImage).toHaveBeenCalledWith(
      expect.objectContaining({
        current: 'https://images.example/route.jpg',
        urls: ['https://images.example/route.jpg'],
      }),
    );

    vi.mocked(wx.previewImage).mockImplementationOnce(({ fail }: any) => fail());
    definition.previewRouteImage.call(context);
    expect(wx.showToast).toHaveBeenCalledWith({
      title: '路线预览图打开失败，请重试',
      icon: 'none',
    });

    vi.clearAllMocks();
    context.data.item.route.generatedPreviewUrl = '   ';
    definition.previewRouteImage.call(context);
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
      backgroundUrl: 'https://temporary.example/background.jpg',
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

  it('远端头像和名片背景加载失败时分别回退默认图片', async () => {
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
      backgroundUrl: 'https://temporary.example/modal-background.jpg',
    };

    definition.attendeeAvatarError.call(context, {
      currentTarget: { dataset: { index: 0 } },
    });
    expect(context.data.attendees[0].avatarUrl).toBe('');

    definition.selectedAttendeeBackgroundError.call(context);
    expect(context.data.selectedAttendee.backgroundUrl).toBe('');
    expect(context.data.defaultAttendeeAvatar).toBeUndefined();
  });

  it('复制经过验证和规范化的官方路线并保留活动分享 path', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'route.gpx',
    }));
    context.data.officialRouteUrl = 'https://www.strava.com/routes/42';
    definition.copyOfficialRoute.call(context);
    expect(wx.setClipboardData).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: 'https://www.strava.com/routes/42' }),
    );
    expect(wx.navigateTo).not.toHaveBeenCalled();
    expect(definition.onShareAppMessage.call(context)).toEqual({
      title: '周末骑行',
      path: 'pages/activity-detail/index?id=a%2F1',
    });
  });

  it('缺少规范官方路线链接时不复制也不导航', async () => {
    const { definition, context } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'route.gpx',
    }));
    context.data.officialRouteUrl = '';
    definition.copyOfficialRoute.call(context);
    expect(wx.setClipboardData).not.toHaveBeenCalled();
    expect(wx.navigateTo).not.toHaveBeenCalled();
  });

  it('以可信 GPX 生成原生状态，且通用官方路线字段存在时不回退旧字段', async () => {
    const { definition, context, repository } = await loadPage(async () => ({
      base64: 'eA==',
      fileName: 'route.gpx',
    }));
    vi.spyOn(repository, 'getActivity').mockResolvedValue({
      id: 'a/1',
      title: '周末骑行',
      images: [],
      route: {
        start: '',
        end: '',
        distanceKm: 80,
        elevationM: 900,
        level: '',
        gpxFileId: 'cloud://env/activity-routes/owner/route.gpx',
        gpxSha256: 'a'.repeat(64),
        estimatedMovingTimeSeconds: 14_400,
        elevationProfile: [
          { distanceKm: 0, elevationM: 20 },
          { distanceKm: 80, elevationM: 120 },
        ],
        routeOutline: [
          { latitude: 22.123456, longitude: 114.123456 },
          { latitude: 22.223456, longitude: 114.223456 },
        ],
        externalProvider: 'strava',
        externalRouteId: '42',
        externalRouteUrl: 'https://evil.example/routes/42',
        stravaRouteId: '99',
        stravaRouteUrl: 'https://www.strava.com/routes/99',
      },
      schedule: [],
      notices: [],
      equipment: [],
    } as any);
    vi.spyOn(repository, 'listRegistrations').mockResolvedValue([]);
    context.drawElevation = vi.fn();
    context.drawRouteOutline = vi.fn();

    await definition.performLoad.call(context, 'a/1');

    expect(context.data.hasGpxRoute).toBe(true);
    expect(context.data.item.route.elevationProfile).toHaveLength(2);
    expect(context.data.hasElevationProfile).toBe(true);
    expect(context.data.hasRouteOutline).toBe(true);
    expect(context.data).not.toHaveProperty('routeStartCoordinate');
    expect(context.data).not.toHaveProperty('routeEndCoordinate');
    expect(context.data.estimatedRideTime).toBe('4 小时');
    expect(context.data.officialRouteId).toBe('');
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

  it('下载活动上传的原始 GPX 并优先分享，busy 时不重复调用', async () => {
    const downloader = vi.fn(async () => ({ base64: 'eA==', fileName: 'route.gpx' }));
    const { definition, context } = await loadPage(downloader);
    await definition.downloadGpx.call(context);
    expect(downloader).toHaveBeenCalledWith('a/1');
    expect(wx.getFileSystemManager().writeFile).toHaveBeenCalledWith(
      expect.objectContaining({ encoding: 'base64' }),
    );
    expect(wx.shareFileMessage).toHaveBeenCalled();
    context.downloadBusy = true;
    await definition.downloadGpx.call(context);
    expect(downloader).toHaveBeenCalledTimes(1);
  });

  it('不支持分享文件时保存 GPX 并明确提示', async () => {
    const loaded = await loadPage(async () => ({ base64: 'eA==', fileName: 'route.gpx' }));
    (wx as any).shareFileMessage = undefined;
    await loaded.definition.downloadGpx.call(loaded.context);
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
    await oversized.definition.downloadGpx.call(oversized.context);
    expect(wx.getFileSystemManager().writeFile).not.toHaveBeenCalled();
    expect(wx.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining('4MB') }),
    );

    const failed = await loadPage(async () => {
      throw new Error('下载服务不可用');
    });
    await failed.definition.downloadGpx.call(failed.context);
    expect(wx.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: '下载服务不可用' }));
  });
});

describe('官方路线不再提供站内查看页', () => {
  it('不注册 route-view 页面，也不保留 Embed 域名配置', () => {
    const app = JSON.parse(read('miniprogram/app.json'));
    const runtime = read('miniprogram/config/runtime.ts');
    expect(app.pages).not.toContain('pages/route-view/index');
    expect(app.pages).not.toContain('pages/strava/index');
    expect(runtime).not.toContain('routeEmbedOrigin');
  });
});
