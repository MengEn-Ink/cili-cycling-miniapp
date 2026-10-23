// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

async function loadPage() {
  let definition: any;
  vi.stubGlobal('wx', {
    showShareMenu: vi.fn(),
    showModal: vi.fn(),
    navigateTo: vi.fn(),
  });
  vi.stubGlobal('Page', (value: any) => {
    definition = value;
  });
  vi.resetModules();
  const repositories = await import('../miniprogram/repositories');
  await import('../miniprogram/pages/activity-detail/index');
  const context: any = {
    ...definition,
    data: { ...definition.data },
    setData(patch: Record<string, unknown>, callback?: () => void) {
      Object.assign(this.data, patch);
      callback?.();
    },
  };
  return { definition, context, ...repositories };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('活动详情路线、授权媒体与性能契约', () => {
  it('已授权素材按真实地址展示，其他骑友缺素材时不生成任何默认头像或背景', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('wx:if="{{item.avatarUrl}}"');
    expect(template).toContain('wx:if="{{rider.backgroundUrl}}"');
    expect(template).toContain('wx:if="{{rider.avatarUrl}}"');
    expect(template).not.toMatch(
      /logo-circle-144|logo-share-500x400|头像首字|rider-card-avatar--placeholder/,
    );
    expect(template).not.toContain('<image wx:else class="attendee-avatar');
    expect(template).not.toContain('<image wx:else class="rider-card-photo__image');
  });

  it('仅本人缺素材时展示可重试入口，并明确保留昵称', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('item.isSelf && (!item.avatarUrl || !item.backgroundUrl)');
    // 新设计：按钮文案改为“授权头像与背景”，仍保留重试/重新授权态并通过昵称回退展示
    expect(template).toContain('授权头像与背景');
    expect(template).toContain("attendeeAuthorizationState === 'loading'");
    expect(template).toContain('加载失败，重试');
    expect(template).toContain('重新授权');
    // 昵称保留逻辑：无头像时仍以 displayName 回退展示
    expect(template).toContain("item.displayName || '骑友'");
  });

  it('授权说明等待期间防重复点击，拒绝和导航失败后均可重试', async () => {
    const { definition, context } = await loadPage();
    let resolveModal: ((result: { confirm: boolean }) => void) | undefined;
    vi.mocked(wx.showModal).mockImplementation(({ success }: any) => {
      resolveModal = success;
    });

    const first = definition.authorizeAttendeeMedia.call(context);
    const duplicate = definition.authorizeAttendeeMedia.call(context);
    expect(wx.showModal).toHaveBeenCalledTimes(1);
    expect(context.data.attendeeAuthorizationState).toBe('loading');
    resolveModal?.({ confirm: false });
    await Promise.all([first, duplicate]);
    expect(context.data.attendeeAuthorizationState).toBe('declined');

    vi.mocked(wx.showModal).mockImplementation(({ success }: any) => success({ confirm: true }));
    vi.mocked(wx.navigateTo).mockImplementation(({ fail }: any) =>
      fail(new Error('navigate failed')),
    );
    await definition.authorizeAttendeeMedia.call(context);
    expect(context.data.attendeeAuthorizationState).toBe('failed');

    vi.mocked(wx.navigateTo).mockImplementation(({ success }: any) => success());
    await definition.authorizeAttendeeMedia.call(context);
    expect(context.data.attendeeAuthorizationState).toBe('idle');
  });

  it('命中新鲜详情缓存时先同步渲染，再失效详情缓存并后台刷新', async () => {
    const { definition, context, repositoryCache } = await loadPage();
    const cached = {
      id: 'a1',
      title: '缓存活动',
      date: '2026-10-21',
      startAt: '2026-10-21T00:00:00.000Z',
      endAt: '',
      deadline: '',
      images: [],
      route: { distanceKm: 80, elevationM: 500, level: '' },
    } as any;
    vi.spyOn(repositoryCache, 'peekActivity').mockReturnValue(cached);
    const invalidate = vi.spyOn(repositoryCache, 'invalidateActivity');
    context.load = vi.fn().mockResolvedValue(undefined);

    definition.onLoad.call(context, { id: 'a1' });

    expect(context.data.item).toBe(cached);
    expect(context.data.loading).toBe(false);
    expect(invalidate).toHaveBeenCalledWith('a1');
    expect(context.load).toHaveBeenCalledWith('a1', true);
  });

  it('管理员复用公开详情结果，不再追加管理员详情请求', () => {
    const source = read('miniprogram/pages/activity-detail/index.ts');
    expect(source).toMatch(/isLoggedIn\s*&&\s*!isAdmin\s*&&\s*!isOrganizer[\s\S]*getAdminActivity/);
  });

  it('详情不初始化路线 Canvas，完整分析分包由详情页预加载', () => {
    const source = read('miniprogram/pages/activity-detail/index.ts');
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const app = JSON.parse(read('miniprogram/app.json'));
    expect(source).not.toMatch(
      /createSelectorQuery|canvasToTempFilePath|drawElevation|drawRouteOutline/,
    );
    expect(template).not.toContain('<canvas');
    expect(template).toContain('bindtap="openRouteAnalysis"');
    expect(app.preloadRule['pages/activity-detail/index']).toEqual({
      network: 'all',
      packages: ['pages/route-analysis'],
    });
  });
});
