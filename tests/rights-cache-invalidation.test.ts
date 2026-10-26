import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CachingRepository } from '../miniprogram/repositories/cached';
import { MemoryCacheStorage } from '../miniprogram/repositories/persistent';
import type { PersonalCapabilityCard, Profile } from '../miniprogram/models';

const pageService = vi.hoisted(() => ({
  getProfile: vi.fn(),
  getPersonalCapabilityCard: vi.fn(),
  updateProfile: vi.fn(),
}));
const appStore = vi.hoisted(() => ({
  openid: 'owner',
  role: 'member',
  isSuper: false,
  authStatus: 'authenticated',
  authError: '',
  identityHint: null,
  ensureIdentity: vi.fn(),
}));
vi.mock('../miniprogram/services/ride-service', () => ({ rideService: pageService }));
vi.mock('../miniprogram/store/app-store', () => ({ appStore }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function observe<T>(promise: Promise<T>) {
  return promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}

const repositoryReads = [
  {
    key: 'profile:self',
    method: 'getProfile',
    read: (repo: CachingRepository) => repo.getProfile(),
    invalidate: (repo: CachingRepository) => repo.cacheControl.invalidateProfiles(),
  },
  {
    key: 'profile:capability-card',
    method: 'getPersonalCapabilityCard',
    read: (repo: CachingRepository) => repo.getPersonalCapabilityCard(),
    invalidate: (repo: CachingRepository) => repo.cacheControl.invalidateProfiles(),
  },
  {
    key: 'act:item:a',
    method: 'getActivity',
    read: (repo: CachingRepository) => repo.getActivity('a'),
    invalidate: (repo: CachingRepository) => repo.cacheControl.invalidateActivity('a'),
  },
  {
    key: 'act:page:future:',
    method: 'listActivityPage',
    read: (repo: CachingRepository) => repo.listActivityPage('future'),
    invalidate: (repo: CachingRepository) => repo.cacheControl.invalidateActivities(),
  },
  {
    key: 'act:list:upcoming',
    method: 'listActivities',
    read: (repo: CachingRepository) => repo.listActivities('upcoming'),
    invalidate: (repo: CachingRepository) => repo.cacheControl.invalidateActivities(),
  },
  {
    key: 'reg:mine',
    method: 'listRegistrations',
    read: (repo: CachingRepository) => repo.listRegistrations(),
    invalidate: (repo: CachingRepository) => repo.cancelRegistration('r'),
  },
];

describe.each(repositoryReads)('CachingRepository $key', (entry) => {
  function fixture() {
    const load = vi.fn<() => Promise<unknown>>();
    const inner = {
      [entry.method]: load,
      cancelRegistration: vi.fn().mockResolvedValue({ id: 'r' }),
    } as unknown as ConstructorParameters<typeof CachingRepository>[0];
    const storage = new MemoryCacheStorage();
    const repo = new CachingRepository(inner, {
      storage,
      now: () => 1_000,
      ttlMs: 100,
      staleMs: 500,
    });
    storage.set(entry.key, { value: { state: 'old' }, expiresAt: 900 });
    return { load, storage, repo };
  }

  it.each(['prefix', 'clear'] as const)(
    '%s 后迟到失败不返回失效前的 persisted fallback',
    async (invalidation) => {
      const { load, storage, repo } = fixture();
      const pending = deferred<unknown>();
      load.mockReturnValueOnce(pending.promise);
      const result = observe(entry.read(repo) as Promise<unknown>);
      expect(load).toHaveBeenCalledOnce();

      if (invalidation === 'prefix') await entry.invalidate(repo);
      else repo.cacheControl.clear();
      const error = new Error('offline');
      pending.reject(error);

      expect(await result).toEqual({ error });
      expect(storage.get(entry.key)).toBeUndefined();
      expect(repo.cacheControl.getMetrics()).toMatchObject({ staleReads: 0, storageWrites: 0 });
    },
  );

  it.each(['prefix', 'clear'] as const)(
    '%s 后迟到成功不回填内存或磁盘，新读取必须回源',
    async (invalidation) => {
      const { load, storage, repo } = fixture();
      const pending = deferred<unknown>();
      load.mockReturnValueOnce(pending.promise).mockResolvedValue({ state: 'new' });
      const reading = entry.read(repo);
      if (invalidation === 'prefix') await entry.invalidate(repo);
      else repo.cacheControl.clear();
      pending.resolve({ state: 'old response' });

      await expect(reading).resolves.toEqual({ state: 'old response' });
      expect(storage.get(entry.key)).toBeUndefined();
      expect(repo.cacheControl.getMetrics()).toMatchObject({ originLoads: 1, storageWrites: 0 });
      await expect(entry.read(repo)).resolves.toEqual({ state: 'new' });
      expect(load).toHaveBeenCalledTimes(2);
      expect(storage.get(entry.key)).toEqual({ value: { state: 'new' }, expiresAt: 1_100 });
    },
  );

  it.each(['resolve', 'reject'] as const)(
    '旧请求 %s 不清理新请求所有权，也不覆盖新缓存',
    async (settlement) => {
      const { load, storage, repo } = fixture();
      const old = deferred<unknown>();
      const fresh = deferred<unknown>();
      load.mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
      const oldResult = observe(entry.read(repo) as Promise<unknown>);
      await entry.invalidate(repo);
      const freshReading = entry.read(repo);
      const error = new Error('old offline');
      if (settlement === 'resolve') old.resolve({ state: 'old response' });
      else old.reject(error);
      expect(await oldResult).toEqual(
        settlement === 'resolve' ? { value: { state: 'old response' } } : { error },
      );

      const coalesced = entry.read(repo);
      expect(load).toHaveBeenCalledTimes(2);
      fresh.resolve({ state: 'new' });
      await Promise.all([freshReading, coalesced]);
      await expect(entry.read(repo)).resolves.toEqual({ state: 'new' });
      expect(storage.get(entry.key)).toEqual({ value: { state: 'new' }, expiresAt: 1_100 });
      expect(repo.cacheControl.getMetrics()).toMatchObject({ staleReads: 0, storageWrites: 1 });
    },
  );

  it('无关命名空间失效不破坏当前离线功能和 metrics', async () => {
    const { load, storage, repo } = fixture();
    const pending = deferred<unknown>();
    load.mockReturnValueOnce(pending.promise);
    const reading = entry.read(repo);
    if (entry.key.startsWith('profile:')) repo.cacheControl.invalidateActivities();
    else repo.cacheControl.invalidateProfiles();
    pending.reject(new Error('offline'));

    await expect(reading).resolves.toEqual({ state: 'old' });
    expect(storage.get(entry.key)).toEqual({ value: { state: 'old' }, expiresAt: 900 });
    expect(repo.cacheControl.getMetrics()).toMatchObject({ staleReads: 1, storageWrites: 0 });
  });
});

const profile: Profile = {
  avatarRevision: 1,
  clubs: [],
  nickname: 'current rider',
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
  generatedAt: '2026-10-26T00:00:00.000Z',
  profile: { displayName: 'current rider', gender: '', avatarUrl: 'https://image.example/a.jpg' },
  backgrounds: [{ url: 'https://image.example/b.jpg', source: 'user_photo', category: 'ride' }],
};

type ImageCallbacks = {
  src: string;
  success: (value: { path: string }) => void;
  fail?: () => void;
};
type SaveCallbacks = {
  tempFilePath: string;
  success: (value: { savedFilePath: string }) => void;
  fail?: () => void;
};

function storageHost() {
  const storage = new Map<string, unknown>();
  vi.stubGlobal('wx', {
    cloud: {},
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => storage.set(key, value)),
    removeStorageSync: vi.fn((key: string) => storage.delete(key)),
    removeSavedFile: vi.fn(),
    getImageInfo: vi.fn(({ src, success }: ImageCallbacks) => success({ path: `tmp://${src}` })),
    saveFile: vi.fn(({ tempFilePath, success }: SaveCallbacks) =>
      success({ savedFilePath: `saved://${tempFilePath}` }),
    ),
    stopPullDownRefresh: vi.fn(),
    previewImage: vi.fn(),
  });
  return storage;
}

describe.each(['clear', 'invalidate'] as const)('profile-page-cache %s', (invalidation) => {
  beforeEach(() => {
    vi.resetModules();
    storageHost();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function fixture() {
    const cache = await import('../miniprogram/utils/profile-page-cache');
    const invalidate =
      invalidation === 'clear' ? cache.clearProfilePageCache : cache.invalidateProfilePageCache;
    return { cache, invalidate };
  }

  it('失效删除卡片与下载图片，不把旧卡片作为离线回落', async () => {
    const { cache, invalidate } = await fixture();
    cache.writeProfilePageCache('owner', profile, card, {
      'https://image.example/a.jpg': 'saved://old',
    });
    invalidate();

    expect(cache.readProfilePageCache()).toBeNull();
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://old' }),
    );
  });

  it('下载开始后失效，迟到的下载不再保存图片', async () => {
    const { cache, invalidate } = await fixture();
    const downloads: ImageCallbacks[] = [];
    vi.mocked(wx.getImageInfo).mockImplementation((options: any) => downloads.push(options));
    const persisting = cache.persistProfileCardImages(card);
    expect(downloads).toHaveLength(2);
    invalidate();
    for (const download of downloads) download.success({ path: `tmp://${download.src}` });

    expect(await persisting).toEqual({ images: {}, created: [], complete: false });
    expect(wx.saveFile).not.toHaveBeenCalled();
    expect(cache.readProfilePageCache()).toBeNull();
  });

  it('保存开始后失效，迟到保存的所有新文件都被回收', async () => {
    const { cache, invalidate } = await fixture();
    const saves: SaveCallbacks[] = [];
    vi.mocked(wx.saveFile).mockImplementation((options: any) => saves.push(options));
    const persisting = cache.persistProfileCardImages(card);
    expect(saves).toHaveLength(2);
    invalidate();
    for (const [index, save] of saves.entries())
      save.success({ savedFilePath: `saved://late-${index}` });

    expect(await persisting).toEqual({ images: {}, created: [], complete: false });
    expect(wx.removeSavedFile).toHaveBeenCalledTimes(2);
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://late-0' }),
    );
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://late-1' }),
    );
  });

  it('部分保存完成后失效，后续失败也不返回旧映射或泄漏成功文件', async () => {
    const { cache, invalidate } = await fixture();
    const previous = { 'https://image.example/a.jpg': 'saved://old' };
    cache.writeProfilePageCache('owner', profile, card, previous);
    const saves: SaveCallbacks[] = [];
    vi.mocked(wx.saveFile).mockImplementation((options: any) => saves.push(options));
    const twoNewImages: PersonalCapabilityCard = {
      ...card,
      backgrounds: [
        ...card.backgrounds,
        { url: 'https://image.example/c.jpg', source: 'user_photo', category: 'ride' },
      ],
    };
    const persisting = cache.persistProfileCardImages(twoNewImages, previous);
    expect(saves).toHaveLength(2);
    saves[0].success({ savedFilePath: 'saved://partial' });
    await Promise.resolve();
    invalidate();
    saves[1].fail?.();

    expect(await persisting).toEqual({ images: {}, created: [], complete: false });
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://old' }),
    );
    expect(wx.removeSavedFile).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'saved://partial' }),
    );
    expect(cache.readProfilePageCache()).toBeNull();
  });

  it('存储删除失败时本次运行也不能读回已失效卡片', async () => {
    const { cache, invalidate } = await fixture();
    cache.writeProfilePageCache('owner', profile, card);
    vi.mocked(wx.removeStorageSync).mockImplementationOnce(() => {
      throw new Error('storage unavailable');
    });
    invalidate();

    expect(cache.readProfilePageCache()).toBeNull();
    expect(cache.writeProfilePageCache('owner', profile, card)).toBe(true);
    expect(cache.readProfilePageCache()?.card).toEqual(card);
  });

  it('失效后的新下载与新卡片仍正常持久化供离线使用', async () => {
    const { cache, invalidate } = await fixture();
    invalidate();
    const persisted = await cache.persistProfileCardImages(card);
    expect(persisted.complete).toBe(true);
    expect(persisted.created).toHaveLength(2);
    expect(cache.writeProfilePageCache('owner', profile, card, persisted.images)).toBe(true);
    expect(cache.readProfilePageCache()).toMatchObject({ card, images: persisted.images });
    expect(wx.removeSavedFile).not.toHaveBeenCalled();
  });
});

describe.each(['clear', 'invalidate'] as const)('profile-page consumer %s', (invalidation) => {
  beforeEach(() => {
    vi.resetModules();
    storageHost();
    pageService.getProfile.mockReset().mockResolvedValue(profile);
    pageService.getPersonalCapabilityCard.mockReset().mockResolvedValue(card);
    pageService.updateProfile.mockReset().mockResolvedValue(profile);
    appStore.ensureIdentity.mockReset().mockResolvedValue({ status: 'authenticated' });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function fixture(withCache = false) {
    const cache = await import('../miniprogram/utils/profile-page-cache');
    if (withCache)
      cache.writeProfilePageCache(
        'owner',
        { ...profile, nickname: 'persisted rider' },
        { ...card, profile: { ...card.profile, displayName: 'persisted rider' } },
        { 'https://image.example/a.jpg': 'saved://old' },
        Date.now() - 7 * 60 * 60_000,
      );
    vi.mocked(wx.setStorageSync).mockClear();
    let page: any;
    vi.stubGlobal('Page', (definition: any) => {
      page = definition;
      page.data = { ...definition.data };
      page.setData = vi.fn((patch: Record<string, unknown>) => Object.assign(page.data, patch));
    });
    await import('../miniprogram/pages/profile/index');
    const invalidate =
      invalidation === 'clear' ? cache.clearProfilePageCache : cache.invalidateProfilePageCache;
    return { cache, page, invalidate };
  }

  it.each(['resolve', 'reject'] as const)(
    '资料与卡片读取开始后失效，迟到 %s 不应用或回填缓存',
    async (settlement) => {
      const { cache, page, invalidate } = await fixture();
      const profileRead = deferred<Profile>();
      const cardRead = deferred<PersonalCapabilityCard>();
      pageService.getProfile.mockReturnValueOnce(profileRead.promise);
      pageService.getPersonalCapabilityCard.mockReturnValueOnce(cardRead.promise);
      const loading = page.onShow();
      const cardLoading = page.cardLoadPromise;
      expect(pageService.getProfile).toHaveBeenCalledOnce();
      expect(pageService.getPersonalCapabilityCard).toHaveBeenCalledOnce();
      invalidate();
      if (settlement === 'resolve') {
        profileRead.resolve(profile);
        cardRead.resolve(card);
      } else {
        profileRead.reject(new Error('offline'));
        cardRead.reject(new Error('offline'));
      }
      await loading;
      await cardLoading;

      expect(page.data.profile).toBeNull();
      expect(page.data.heroCard).toBeNull();
      expect(cache.readProfilePageCache()).toBeNull();
      expect(wx.setStorageSync).not.toHaveBeenCalled();
      expect(wx.getImageInfo).not.toHaveBeenCalled();
      page.onUnload();
    },
  );

  it('有缓存的读取失效后迟到失败，不能继续展示失效前离线资料与图片', async () => {
    const { cache, page, invalidate } = await fixture(true);
    const profileRead = deferred<Profile>();
    const cardRead = deferred<PersonalCapabilityCard>();
    pageService.getProfile.mockReturnValueOnce(profileRead.promise);
    pageService.getPersonalCapabilityCard.mockReturnValueOnce(cardRead.promise);
    const loading = page.onShow();
    const cardLoading = page.cardLoadPromise;
    expect(page.data.profile.nickname).toBe('persisted rider');
    invalidate();
    profileRead.reject(new Error('offline'));
    cardRead.reject(new Error('offline'));
    await loading;
    await cardLoading;

    expect(page.data.profile).toBeNull();
    expect(page.data.heroCard).toBeNull();
    expect(page.data.heroAvatarUrl).toBe('');
    expect(page.data.usingCache).toBe(false);
    expect(page.data.refreshMessage).not.toContain('继续展示');
    expect(cache.readProfilePageCache()).toBeNull();
    expect(wx.setStorageSync).not.toHaveBeenCalled();
    page.onUnload();
  });

  it.each(['resolve', 'reject'] as const)(
    '卡片图片保存开始后失效，迟到 %s 清理新文件且不重新提交',
    async (settlement) => {
      const { cache, page, invalidate } = await fixture();
      const saves: SaveCallbacks[] = [];
      const savingStarted = deferred<void>();
      vi.mocked(wx.saveFile).mockImplementation((options: any) => {
        saves.push(options);
        if (saves.length === 2) savingStarted.resolve();
      });
      const loading = page.onShow();
      const cardLoading = page.cardLoadPromise;
      await savingStarted.promise;
      invalidate();
      for (const [index, save] of saves.entries()) {
        if (settlement === 'resolve' || index === 0)
          save.success({ savedFilePath: `saved://late-${index}` });
        else save.fail?.();
      }
      await loading;
      await cardLoading;

      expect(cache.readProfilePageCache()).toBeNull();
      expect(wx.setStorageSync).not.toHaveBeenCalled();
      expect(wx.removeSavedFile).toHaveBeenCalledTimes(settlement === 'resolve' ? 2 : 1);
      expect(page.data.heroCard).toBeNull();
      page.onUnload();
    },
  );

  it('失效后的新读取直接接管，迟到旧读取不能覆盖新资料和卡片', async () => {
    const { cache, page, invalidate } = await fixture();
    const profileRead = deferred<Profile>();
    const cardRead = deferred<PersonalCapabilityCard>();
    pageService.getProfile.mockReturnValueOnce(profileRead.promise);
    pageService.getPersonalCapabilityCard.mockReturnValueOnce(cardRead.promise);
    const oldLoading = page.onShow();
    const oldCardLoading = page.cardLoadPromise;
    invalidate();
    const freshLoading = page.load(false, true);
    // 旧请求尚未完成；新读必须已经开始，不可复用或排在失效请求后。
    expect(pageService.getProfile).toHaveBeenCalledTimes(2);
    const freshCardLoading = page.cardLoadPromise;
    await freshLoading;
    await freshCardLoading;
    profileRead.resolve({ ...profile, nickname: 'old response' });
    cardRead.resolve({ ...card, profile: { ...card.profile, displayName: 'old response' } });
    await oldLoading;
    await oldCardLoading;

    expect(page.data.profile.nickname).toBe('current rider');
    expect(page.data.heroCard.displayName).toBe('current rider');
    expect(cache.readProfilePageCache()?.profile.nickname).toBe('current rider');
    expect(wx.setStorageSync).toHaveBeenCalledOnce();
    page.onUnload();
  });

  it('指引保存确认新 revision 后，迟到卡片不能清空刚更新的资料', async () => {
    const { page } = await fixture();
    const cardRead = deferred<PersonalCapabilityCard>();
    const updatedProfile = { ...profile, hasCompletedGuidance: true, nickname: 'updated rider' };
    pageService.getPersonalCapabilityCard.mockReturnValueOnce(cardRead.promise);
    pageService.updateProfile.mockResolvedValueOnce(updatedProfile);

    await page.onShow();
    const staleCardLoading = page.cardLoadPromise;
    expect(page.data.profile.nickname).toBe('current rider');

    await page.dismissGuidance();
    expect(page.data.profile).toEqual(updatedProfile);
    expect(page.data.hasGuidance).toBe(false);

    cardRead.resolve(card);
    await staleCardLoading;

    expect(page.data.profile).toEqual(updatedProfile);
    expect(page.data.hasGuidance).toBe(false);
    expect(page.data.heroCard).toBeNull();
    page.onUnload();
  });

  it('失效前排队的强刷新复用失效后新请求，不再额外抢占', async () => {
    const { page, invalidate } = await fixture();
    const oldProfileRead = deferred<Profile>();
    const oldCardRead = deferred<PersonalCapabilityCard>();
    const freshProfileRead = deferred<Profile>();
    const freshCardRead = deferred<PersonalCapabilityCard>();
    const freshProfile = { ...profile, nickname: 'fresh rider' };
    const freshCard = {
      ...card,
      profile: { ...card.profile, displayName: 'fresh rider' },
    };
    pageService.getProfile
      .mockReturnValueOnce(oldProfileRead.promise)
      .mockReturnValueOnce(freshProfileRead.promise);
    pageService.getPersonalCapabilityCard
      .mockReturnValueOnce(oldCardRead.promise)
      .mockReturnValueOnce(freshCardRead.promise);
    page.pageVisible = true;
    page.lifecycleRevision += 1;

    const weakLoading = page.load(false, false);
    const weakCardLoading = page.cardLoadPromise;
    const queuedStrongLoading = page.load(false, true);
    invalidate();
    const freshLoading = page.load(false, true);
    const freshCardLoading = page.cardLoadPromise;

    oldProfileRead.resolve({ ...profile, nickname: 'old rider' });
    oldCardRead.resolve({
      ...card,
      profile: { ...card.profile, displayName: 'old rider' },
    });
    await Promise.all([weakLoading, weakCardLoading]);
    freshProfileRead.resolve(freshProfile);
    freshCardRead.resolve(freshCard);
    await Promise.all([queuedStrongLoading, freshLoading, freshCardLoading]);

    expect(pageService.getProfile).toHaveBeenCalledTimes(2);
    expect(pageService.getPersonalCapabilityCard).toHaveBeenCalledTimes(2);
    expect(page.data.profile).toEqual(freshProfile);
    expect(page.data.heroCard.displayName).toBe('fresh rider');
    page.onUnload();
  });
});
