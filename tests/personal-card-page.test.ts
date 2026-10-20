// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalCapabilityCard } from '../miniprogram/models';

const rideService = vi.hoisted(() => ({
  getPersonalCapabilityCard: vi.fn(),
}));

vi.mock('../miniprogram/services/ride-service', () => ({ rideService }));

const card: PersonalCapabilityCard = {
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: {
    displayName: '山野骑手',
    gender: '男',
    avatarUrl: 'https://temporary.example/avatar.jpg',
  },
  backgrounds: [
    { url: 'https://temporary.example/a.jpg', source: 'user_photo', category: 'ride' },
    { url: 'https://temporary.example/b.jpg', source: 'user_photo', category: 'bike' },
  ],
};

describe('个人骑行名片页面行为', () => {
  let page: any;

  beforeEach(async () => {
    vi.resetModules();
    rideService.getPersonalCapabilityCard.mockReset().mockResolvedValue(card);
    vi.stubGlobal('wx', {
      navigateTo: vi.fn(),
      showToast: vi.fn(),
    });
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/capability-card/index');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('页面加载只读取一次个人名片响应', async () => {
    await page.onShow();
    expect(rideService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
    expect(page.data.card).toMatchObject({
      displayName: '山野骑手',
      hasBackgrounds: true,
      hasMultipleBackgrounds: true,
      experienceLabel: '未填写',
    });
  });

  it('较慢的旧请求不能覆盖较新的 onShow 响应', async () => {
    let resolveOld!: (value: PersonalCapabilityCard) => void;
    rideService.getPersonalCapabilityCard
      .mockImplementationOnce(
        () =>
          new Promise<PersonalCapabilityCard>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({
        ...card,
        profile: { ...card.profile, displayName: '新资料' },
      });

    const old = page.onShow();
    await page.onShow();
    resolveOld(card);
    await old;
    expect(page.data.card.displayName).toBe('新资料');
  });

  it('单张加载失败时只移除对应背景并重算轮播状态', async () => {
    await page.onShow();
    await page.backgroundError({
      currentTarget: { dataset: { index: 0, url: card.backgrounds[0].url } },
    });
    expect(page.data.card.backgrounds).toHaveLength(1);
    expect(page.data.card.hasMultipleBackgrounds).toBe(false);
    expect(page.data.card.needsProfilePhoto).toBe(false);
  });

  it('缺少背景图时跳转资料编辑', async () => {
    rideService.getPersonalCapabilityCard.mockResolvedValueOnce({ ...card, backgrounds: [] });
    await page.onShow();
    page.completeProfile();
    expect(wx.navigateTo).toHaveBeenCalledWith({ url: '/pages/profile-edit/index' });
  });

  it('头像图片加载失败后降级占位，不留下空白头像容器', async () => {
    await page.onShow();
    expect(page.data.avatarFailed).toBe(false);
    page.avatarError();
    expect(page.data.avatarFailed).toBe(true);
  });
});

describe('个人骑行名片静态页面契约', () => {
  it('只展示公开资料和照片，不包含账号指标或同步入口', () => {
    const template = readFileSync('miniprogram/pages/capability-card/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/capability-card/index.ts', 'utf8');
    expect(template).toContain('公开骑行名片');
    expect(template).toContain('昵称、头像和照片由你维护');
    expect(template).toContain('bindtap="completeProfile"');
    expect(`${template}\n${script}`).not.toMatch(
      /STRAVA|Strava|refreshStrava|openStravaProfile|骑行指标|同步最新/,
    );
  });

  it('大图海报压边头像必须渲染下发的 avatarUrl，失败有占位', () => {
    const template = readFileSync('miniprogram/pages/capability-card/index.wxml', 'utf8');
    expect(template).toContain('src="{{card.avatarUrl}}"');
    expect(template).toContain('binderror="avatarError"');
    expect(template).toMatch(/card-avatar/);
  });

  it('补充骑行经验与公开范围标签—值行，公开边界不含实名与电话', () => {
    const template = readFileSync('miniprogram/pages/capability-card/index.wxml', 'utf8');
    expect(template).toContain('骑行经验');
    expect(template).toContain('{{card.experienceLabel}}');
    expect(template).toContain('公开范围');
    expect(template).toContain('所有骑友可见昵称、性别、头像与照片');
    expect(template).not.toMatch(/realName|\.phone|实名|电话/);
  });

  it('swiper 指示器使用媒体语义色数据绑定，不内联魔法色值', () => {
    const template = readFileSync('miniprogram/pages/capability-card/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/capability-card/index.ts', 'utf8');
    expect(template).toContain('indicator-color="{{colorMediaMuted}}"');
    expect(template).toContain('indicator-active-color="{{colorOnMedia}}"');
    expect(template).not.toMatch(/indicator-color="(?!\{\{)/);
    expect(script).toContain("colorMediaMuted: '#d4d4d4'");
    expect(script).toContain("colorOnMedia: '#ffffff'");
  });
});
