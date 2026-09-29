import { describe, expect, it } from 'vitest';

const baseCard = {
  state: 'ready' as const,
  generatedAt: '2026-09-29T04:10:00.000Z',
  profile: { displayName: '山野骑手', title: '周末爬坡手' },
  backgrounds: [
    {
      url: 'https://temporary.example/ride-1.jpg',
      source: 'user_photo' as const,
      category: 'ride' as const,
    },
  ],
  summary: {
    totalKm90d: 812.5,
    rides90d: 28,
    longestKm: 126.3,
    elevationM90d: 9300,
    weightedAvgSpeedKmh: 25.6,
  },
  coverage: {
    from: '2026-07-01T04:00:00.000Z',
    to: '2026-09-29T04:00:00.000Z',
    complete: true,
  },
  syncedAt: '2026-09-29T04:05:00.000Z',
};

async function build(card: typeof baseCard | any) {
  const { personalCardViewModel } = await import('../miniprogram/utils/personal-card');
  return personalCardViewModel(card);
}

describe('个人骑行名片 view model', () => {
  it('真实零值保留为指标而不是隐藏', async () => {
    const view = await build({
      ...baseCard,
      summary: {
        totalKm90d: 0,
        rides90d: 0,
        longestKm: 0,
        elevationM90d: 0,
        weightedAvgSpeedKmh: 0,
      },
    });

    expect(view.metrics.map((metric: any) => metric.value)).toEqual(['0', '0', '0', '0', '0']);
  });

  it('null 指标从布局中省略', async () => {
    const view = await build({
      ...baseCard,
      summary: {
        ...baseCard.summary,
        rides90d: null,
        longestKm: null,
        weightedAvgSpeedKmh: null,
      },
    });

    expect(view.metrics.map((metric: any) => metric.key)).toEqual(['totalKm90d', 'elevationM90d']);
  });

  it('不完整覆盖范围与同步时间保持明确', async () => {
    const view = await build({
      ...baseCard,
      state: 'partial',
      coverage: { ...baseCard.coverage, complete: false },
    });

    expect(view.statusLabel).toBe('数据不完整');
    expect(view.coverageText).toBe('2026-07-01 至 2026-09-29 · 覆盖不完整');
    expect(view.syncedAtText).toBe('同步于 2026-09-29 04:05 UTC');
  });

  it('无背景图时启用品牌山景并提示完善资料', async () => {
    const view = await build({ ...baseCard, backgrounds: [] });

    expect(view).toMatchObject({
      backgrounds: [],
      hasBackgrounds: false,
      hasMultipleBackgrounds: false,
      needsProfilePhoto: true,
    });
  });

  it('单图不启用轮播自动切换', async () => {
    const view = await build(baseCard);
    expect(view.hasMultipleBackgrounds).toBe(false);
  });

  it('三图保持服务端排序', async () => {
    const backgrounds = ['ride-1', 'bike-1', 'other-1'].map((name, index) => ({
      url: `https://temporary.example/${name}.jpg`,
      source: index === 2 ? ('avatar' as const) : ('user_photo' as const),
      category:
        index === 0 ? ('ride' as const) : index === 1 ? ('bike' as const) : ('other' as const),
    }));
    const view = await build({ ...baseCard, backgrounds });

    expect(view.backgrounds.map((background: any) => background.url)).toEqual(
      backgrounds.map((background) => background.url),
    );
    expect(view.hasMultipleBackgrounds).toBe(true);
  });

  it('先分组三项核心摘要，再放入其余真实指标', async () => {
    const view = await build(baseCard);

    expect(view.primaryMetrics.map((metric: any) => metric.key)).toEqual([
      'totalKm90d',
      'rides90d',
      'longestKm',
    ]);
    expect(view.secondaryMetrics.map((metric: any) => metric.key)).toEqual([
      'elevationM90d',
      'weightedAvgSpeedKmh',
    ]);
  });

  it('识别旧 Strava 用户并建议重授权以获取头像', async () => {
    const view = await build({ ...baseCard, needsStravaReauth: true });
    expect(view.needsStravaRepair).toBe(true);
    expect(view.isOldStravaUser).toBe(true);
  });

  it('头像 URL 优先于默认字母展示', async () => {
    const view = await build({
      ...baseCard,
      profile: { ...baseCard.profile, avatarUrl: 'https://avatar.jpg' },
    });
    expect(view.avatarUrl).toBe('https://avatar.jpg');
  });
});
