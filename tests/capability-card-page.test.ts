import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPersonalCapabilityCard = vi.hoisted(() => vi.fn());
const invalidateProfiles = vi.hoisted(() => vi.fn());

vi.mock('../miniprogram/services/ride-service', () => ({
  rideService: { getPersonalCapabilityCard },
}));
vi.mock('../miniprogram/repositories/index', () => ({
  repositoryCache: { invalidateProfiles },
}));

const card = (url: string) => ({
  generatedAt: '2026-10-15T03:00:00.000Z',
  profile: {
    displayName: '山野骑手',
    gender: '男',
    avatarUrl: 'https://temporary.example/avatar.jpg',
  },
  backgrounds: [{ url, source: 'user_photo', category: 'ride' }],
});

describe('骑行名片页面媒体恢复', () => {
  let definition: any;
  let context: any;

  beforeEach(async () => {
    vi.resetModules();
    getPersonalCapabilityCard.mockReset();
    invalidateProfiles.mockReset();
    vi.stubGlobal('Page', (value: any) => {
      definition = value;
    });
    getPersonalCapabilityCard.mockResolvedValue(card('https://temporary.example/expired.jpg'));
    await import('../miniprogram/pages/capability-card/index');
    context = {
      ...definition,
      data: { ...definition.data },
      setData(patch: Record<string, unknown>) {
        Object.assign(this.data, patch);
      },
    };
  });

  it('图片失效时清理资料缓存并向云函数重新签发地址', async () => {
    await definition.load.call(context);
    getPersonalCapabilityCard.mockResolvedValueOnce(
      card('https://temporary.example/refreshed.jpg'),
    );

    await definition.backgroundError.call(context, {
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/expired.jpg' },
      },
    });

    expect(invalidateProfiles).toHaveBeenCalledTimes(1);
    expect(getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
    expect(context.data.card.backgrounds[0].url).toBe('https://temporary.example/refreshed.jpg');
  });

  it('服务端仍无法签发用户照片时回退到头像且保留完善照片入口', async () => {
    await definition.load.call(context);
    getPersonalCapabilityCard.mockResolvedValueOnce({ ...card(''), backgrounds: [] });

    await definition.backgroundError.call(context, {
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/expired.jpg' },
      },
    });

    expect(context.data.card.backgrounds).toEqual([
      {
        url: 'https://temporary.example/avatar.jpg',
        source: 'avatar',
        category: 'avatar',
      },
    ]);
    expect(context.data.card.needsProfilePhoto).toBe(true);
  });

  it('页面隐藏后忽略尚未完成的重新签发结果', async () => {
    await definition.load.call(context);
    let resolveRefresh!: (value: ReturnType<typeof card>) => void;
    getPersonalCapabilityCard.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const refresh = definition.backgroundError.call(context, {
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/expired.jpg' },
      },
    });
    definition.onHide.call(context);
    resolveRefresh(card('https://temporary.example/late.jpg'));
    await refresh;

    expect(context.data.card.backgrounds[0].url).toBe('https://temporary.example/expired.jpg');
  });

  it('同一图片槽位在一次页面周期内只自动重新签发一次', async () => {
    await definition.load.call(context);
    getPersonalCapabilityCard.mockResolvedValueOnce(
      card('https://temporary.example/refreshed.jpg'),
    );
    await definition.backgroundError.call(context, {
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/expired.jpg' },
      },
    });

    await definition.backgroundError.call(context, {
      currentTarget: {
        dataset: { index: 0, url: 'https://temporary.example/refreshed.jpg' },
      },
    });

    expect(getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
  });
});
