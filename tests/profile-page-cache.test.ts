import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PersonalCapabilityCard, Profile } from '../miniprogram/models';

const profile: Profile = {
  avatarRevision: 1,
  nickname: '缓存骑手',
  title: '',
  realName: '',
  phone: '',
  gender: '',
  emergencyName: '',
  emergencyPhone: '',
  photos: [],
  completeness: 80,
};

const card: PersonalCapabilityCard = {
  state: 'ready',
  generatedAt: '2026-09-30T12:00:00.000Z',
  profile: {
    displayName: '缓存骑手',
    gender: '男',
    avatarUrl: 'https://image.example/avatar.jpg',
  },
  backgrounds: [
    {
      url: 'https://image.example/background.jpg',
      source: 'user_photo',
      category: 'ride',
    },
  ],
  summary: {
    totalKm90d: 500,
    rides90d: 20,
    longestKm: 100,
    elevationM90d: 5000,
    weightedAvgSpeedKmh: 25,
  },
  coverage: null,
  syncedAt: '2026-09-30T11:00:00.000Z',
};

describe('个人中心缓存', () => {
  let storage: Record<string, unknown>;

  beforeEach(() => {
    vi.resetModules();
    storage = {};
    vi.stubGlobal('wx', {
      getStorageSync: vi.fn((key: string) => storage[key]),
      setStorageSync: vi.fn((key: string, value: unknown) => {
        storage[key] = value;
      }),
      removeStorageSync: vi.fn((key: string) => {
        delete storage[key];
      }),
      removeSavedFile: vi.fn(),
      getImageInfo: vi.fn(({ src, success }) => success({ path: `tmp://${src}` })),
      saveFile: vi.fn(({ tempFilePath, success }) =>
        success({ savedFilePath: `saved://${tempFilePath}` }),
      ),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('按账号保存缓存并使用六小时 TTL', async () => {
    const {
      PROFILE_PAGE_CACHE_TTL_MS,
      isProfilePageCacheFresh,
      readProfilePageCache,
      writeProfilePageCache,
    } = await import('../miniprogram/utils/profile-page-cache');
    const now = Date.UTC(2026, 8, 30, 12);

    writeProfilePageCache('openid-a', profile, card, {}, now);
    const cache = readProfilePageCache();

    expect(cache).toMatchObject({ ownerOpenid: 'openid-a', cachedAt: now });
    expect(isProfilePageCacheFresh(cache!, now + PROFILE_PAGE_CACHE_TTL_MS)).toBe(true);
    expect(isProfilePageCacheFresh(cache!, now + PROFILE_PAGE_CACHE_TTL_MS + 1)).toBe(false);
  });

  it('优先使用已保存图片，并为新 URL 建立持久缓存', async () => {
    const { applyCachedImages, persistProfileCardImages } =
      await import('../miniprogram/utils/profile-page-cache');
    const existing = { 'https://image.example/avatar.jpg': 'saved://avatar.jpg' };

    const persisted = await persistProfileCardImages(card, existing);
    const cached = applyCachedImages(card, persisted.images);

    expect(persisted.complete).toBe(true);
    expect(wx.getImageInfo).toHaveBeenCalledTimes(1);
    expect(cached.profile.avatarUrl).toBe('saved://avatar.jpg');
    expect(cached.backgrounds[0].url).toContain('saved://');
  });

  it('任一图片持久化失败时回滚本轮新增文件并保留旧映射', async () => {
    const { persistProfileCardImages } = await import('../miniprogram/utils/profile-page-cache');
    const existing = { 'https://image.example/avatar.jpg': 'saved://avatar.jpg' };
    vi.mocked(wx.saveFile).mockImplementation(({ tempFilePath, success, fail }: any) => {
      if (String(tempFilePath).includes('background')) fail?.();
      else success?.({ savedFilePath: `saved://${tempFilePath}` });
    });
    const cardWithTwoNewImages = {
      ...card,
      backgrounds: [
        ...card.backgrounds,
        { url: 'https://image.example/second.jpg', source: 'user_photo', category: 'ride' },
      ],
    } as PersonalCapabilityCard;

    const persisted = await persistProfileCardImages(cardWithTwoNewImages, existing);

    expect(persisted).toEqual({ images: existing, created: [], complete: false });
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: expect.stringContaining('second.jpg') }),
    );
  });

  it('资料更新后只标记缓存过期并保留已保存图片', async () => {
    const { invalidateProfilePageCache, readProfilePageCache, writeProfilePageCache } =
      await import('../miniprogram/utils/profile-page-cache');
    writeProfilePageCache('openid-a', profile, card, {
      'https://image.example/avatar.jpg': 'saved://avatar.jpg',
    });

    invalidateProfilePageCache();

    expect(readProfilePageCache()).toMatchObject({ cachedAt: 0 });
    expect(wx.removeSavedFile).not.toHaveBeenCalled();
  });

  it('过渡状态即使未超过 TTL 也会触发刷新', async () => {
    const { isProfilePageCacheFresh, readProfilePageCache, writeProfilePageCache } =
      await import('../miniprogram/utils/profile-page-cache');
    const now = Date.UTC(2026, 8, 30, 12);

    for (const state of ['partial', 'syncing', 'failed', 'disconnected'] as const) {
      writeProfilePageCache('openid-a', profile, { ...card, state }, {}, now);
      expect(isProfilePageCacheFresh(readProfilePageCache()!, now + 1)).toBe(false);
    }
  });

  it('新缓存成功提交后才删除旧图片', async () => {
    const { persistProfileCardImages, writeProfilePageCache } =
      await import('../miniprogram/utils/profile-page-cache');
    const oldImages = { 'https://old.example/avatar.jpg': 'saved://old-avatar.jpg' };
    writeProfilePageCache('openid-a', profile, card, oldImages);
    vi.mocked(wx.removeSavedFile).mockClear();

    const persisted = await persistProfileCardImages(card, oldImages);
    expect(wx.removeSavedFile).not.toHaveBeenCalled();

    expect(writeProfilePageCache('openid-a', profile, card, persisted.images)).toBe(true);
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://old-avatar.jpg' }),
    );
  });

  it('缓存写入失败时保留旧图片供当前页面继续使用', async () => {
    const { writeProfilePageCache } = await import('../miniprogram/utils/profile-page-cache');
    const oldImages = { 'https://image.example/avatar.jpg': 'saved://old-avatar.jpg' };
    writeProfilePageCache('openid-a', profile, card, oldImages);
    vi.mocked(wx.removeSavedFile).mockClear();
    vi.mocked(wx.setStorageSync).mockImplementationOnce(() => {
      throw new Error('storage full');
    });

    expect(writeProfilePageCache('openid-a', profile, card, {})).toBe(false);
    expect(wx.removeSavedFile).not.toHaveBeenCalled();
  });

  it('清空缓存时同步删除已持久化图片', async () => {
    const { clearProfilePageCache, writeProfilePageCache } =
      await import('../miniprogram/utils/profile-page-cache');
    writeProfilePageCache('openid-a', profile, card, {
      'https://image.example/avatar.jpg': 'saved://avatar.jpg',
    });

    clearProfilePageCache();

    expect(wx.removeStorageSync).toHaveBeenCalled();
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://avatar.jpg' }),
    );
  });
});
