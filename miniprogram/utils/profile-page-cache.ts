import type { PersonalCapabilityCard, Profile } from '../models';

const STORAGE_KEY = 'cili-profile-page-cache-v3';
const CACHE_VERSION = 3;
export const PROFILE_PAGE_CACHE_TTL_MS = 6 * 60 * 60_000;
let cacheRevision = 0;
let cacheInvalidated = false;

export function getProfilePageCacheRevision() {
  return cacheRevision;
}

type CachedProfile = Pick<
  Profile,
  'nickname' | 'hasCompletedGuidance' | 'completeness' | 'missing' | 'clubs'
>;

type ImageCache = Record<string, string>;

function imageCacheKey(sourceUrl: string) {
  // 云存储临时链接会轮换鉴权参数；图片路径才代表同一资源，避免每次进页面都重复下载。
  return /^https:\/\//.test(sourceUrl) ? sourceUrl.replace(/[?#].*$/, '') : sourceUrl;
}

function cachedImage(images: ImageCache, sourceUrl: string) {
  const key = imageCacheKey(sourceUrl);
  if (images[key]) return images[key];
  if (images[sourceUrl]) return images[sourceUrl];
  const legacyKey = Object.keys(images).find((candidate) => imageCacheKey(candidate) === key);
  return legacyKey ? images[legacyKey] : '';
}

export interface ProfilePageCache {
  version: 3;
  ownerOpenid: string;
  cachedAt: number;
  profile: CachedProfile;
  card: PersonalCapabilityCard;
  images: ImageCache;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function safeRemoveSavedFile(filePath: string) {
  if (!filePath || typeof wx.removeSavedFile !== 'function') return;
  wx.removeSavedFile({ filePath, fail: () => undefined });
}

export function readProfilePageCache(): ProfilePageCache | null {
  if (cacheInvalidated) return null;
  try {
    const value: unknown = wx.getStorageSync(STORAGE_KEY);
    if (!isRecord(value)) return null;
    if (
      value.version !== CACHE_VERSION ||
      typeof value.ownerOpenid !== 'string' ||
      typeof value.cachedAt !== 'number' ||
      !Number.isFinite(value.cachedAt) ||
      !isRecord(value.profile) ||
      !isRecord(value.card) ||
      !isRecord(value.images)
    )
      return null;
    return value as unknown as ProfilePageCache;
  } catch {
    return null;
  }
}

export function isProfilePageCacheFresh(cache: ProfilePageCache, now = Date.now()) {
  return now - cache.cachedAt <= PROFILE_PAGE_CACHE_TTL_MS;
}

export function writeProfilePageCache(
  ownerOpenid: string,
  profile: Profile,
  card: PersonalCapabilityCard,
  images: ImageCache = {},
  cachedAt = Date.now(),
  revision = cacheRevision,
) {
  if (!ownerOpenid || revision !== cacheRevision) return false;
  const previous = readProfilePageCache();
  const cache: ProfilePageCache = {
    version: CACHE_VERSION,
    ownerOpenid,
    cachedAt,
    profile: {
      nickname: profile.nickname,
      clubs: profile.clubs,
      hasCompletedGuidance: profile.hasCompletedGuidance,
      completeness: profile.completeness,
      missing: Array.isArray(profile.missing) ? profile.missing : [],
    },
    card,
    images,
  };
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
    cacheInvalidated = false;
    // 新缓存提交成功后才能回收旧文件，避免页面隐藏或写缓存失败破坏仍在展示的图片。
    const retained = new Set(Object.values(images));
    for (const path of Object.values(previous?.images || {}))
      if (!retained.has(path)) safeRemoveSavedFile(path);
    return true;
  } catch {
    // 缓存失败不影响页面主流程。
    return false;
  }
}

export function clearProfilePageCache() {
  const previous = readProfilePageCache();
  cacheRevision += 1;
  cacheInvalidated = true;
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch {
    // 删除失败也不再读取旧卡片，直到当前 revision 的新缓存提交成功。
  }
  for (const path of Object.values(previous?.images || {})) safeRemoveSavedFile(path);
}

export function invalidateProfilePageCache() {
  clearProfilePageCache();
}

export function applyCachedImages(
  card: PersonalCapabilityCard,
  images: ImageCache,
): PersonalCapabilityCard {
  return {
    ...card,
    profile: {
      ...card.profile,
      avatarUrl: card.profile.avatarUrl
        ? cachedImage(images, card.profile.avatarUrl) || card.profile.avatarUrl
        : undefined,
    },
    backgrounds: card.backgrounds.map((background) => ({
      ...background,
      url: cachedImage(images, background.url) || background.url,
    })),
  };
}

function saveImage(sourceUrl: string, revision: number): Promise<string> {
  if (
    revision !== cacheRevision ||
    !/^https:\/\//.test(sourceUrl) ||
    typeof wx.getImageInfo !== 'function' ||
    typeof wx.saveFile !== 'function'
  )
    return Promise.resolve('');
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: sourceUrl,
      success: ({ path }: { path: string }) => {
        if (revision !== cacheRevision) {
          resolve('');
          return;
        }
        wx.saveFile({
          tempFilePath: path,
          success: ({ savedFilePath }: { savedFilePath: string }) => {
            if (revision !== cacheRevision) {
              safeRemoveSavedFile(savedFilePath);
              resolve('');
              return;
            }
            resolve(savedFilePath);
          },
          fail: () => resolve(''),
        });
      },
      fail: () => resolve(''),
    });
  });
}

export interface PersistedProfileCardImages {
  images: ImageCache;
  created: string[];
  complete: boolean;
}

export function discardPersistedProfileCardImages(paths: string[]) {
  for (const path of paths) safeRemoveSavedFile(path);
}

export async function persistProfileCardImages(
  card: PersonalCapabilityCard,
  previous: ImageCache = {},
  revision = cacheRevision,
): Promise<PersistedProfileCardImages> {
  if (revision !== cacheRevision) return { images: {}, created: [], complete: false };
  const sources = [card.profile.avatarUrl, ...card.backgrounds.map((item) => item.url)].filter(
    (value): value is string => Boolean(value),
  );
  const distinctSources = [
    ...new Map(sources.map((source) => [imageCacheKey(source), source])).entries(),
  ];
  const next: ImageCache = {};
  const created = new Set<string>();
  await Promise.all(
    distinctSources.map(async ([key, source]) => {
      const cached = cachedImage(previous, source);
      if (cached) {
        next[key] = cached;
        return;
      }
      const saved = await saveImage(source, revision);
      if (saved) {
        next[key] = saved;
        created.add(saved);
      }
    }),
  );
  if (revision !== cacheRevision) {
    discardPersistedProfileCardImages([...created]);
    return { images: {}, created: [], complete: false };
  }
  const complete = distinctSources.every(([key]) => Boolean(next[key]));
  // 成功项可独立复用；未保存的项不写映射，渲染时自然回退远端 URL。
  return { images: next, created: [...created], complete };
}
