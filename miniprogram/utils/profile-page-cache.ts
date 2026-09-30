import type { PersonalCapabilityCard, Profile } from '../models';

const STORAGE_KEY = 'cili-profile-page-cache-v1';
const CACHE_VERSION = 1;
export const PROFILE_PAGE_CACHE_TTL_MS = 6 * 60 * 60_000;

type CachedProfile = Pick<Profile, 'nickname' | 'hasCompletedGuidance' | 'completeness'>;

type ImageCache = Record<string, string>;

export interface ProfilePageCache {
  version: 1;
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
) {
  if (!ownerOpenid) return;
  const cache: ProfilePageCache = {
    version: CACHE_VERSION,
    ownerOpenid,
    cachedAt,
    profile: {
      nickname: profile.nickname,
      hasCompletedGuidance: profile.hasCompletedGuidance,
      completeness: profile.completeness,
    },
    card,
    images,
  };
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
  } catch {
    // 缓存失败不影响页面主流程。
  }
}

export function clearProfilePageCache() {
  const previous = readProfilePageCache();
  try {
    wx.removeStorageSync(STORAGE_KEY);
  } catch {
    // 清理失败时仍允许后续网络请求覆盖旧数据。
  }
  for (const path of Object.values(previous?.images || {})) safeRemoveSavedFile(path);
}

export function invalidateProfilePageCache() {
  const previous = readProfilePageCache();
  if (!previous) return;
  try {
    // 保留旧图片供返回个人中心时平滑展示，仅把缓存标记为过期以触发后台刷新。
    wx.setStorageSync(STORAGE_KEY, { ...previous, cachedAt: 0 });
  } catch {
    // 失效标记失败不影响资料保存主流程。
  }
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
        ? images[card.profile.avatarUrl] || card.profile.avatarUrl
        : undefined,
    },
    backgrounds: card.backgrounds.map((background) => ({
      ...background,
      url: images[background.url] || background.url,
    })),
  };
}

function saveImage(sourceUrl: string): Promise<string> {
  if (
    !/^https:\/\//.test(sourceUrl) ||
    typeof wx.getImageInfo !== 'function' ||
    typeof wx.saveFile !== 'function'
  )
    return Promise.resolve('');
  return new Promise((resolve) => {
    wx.getImageInfo({
      src: sourceUrl,
      success: ({ path }: { path: string }) => {
        wx.saveFile({
          tempFilePath: path,
          success: ({ savedFilePath }: { savedFilePath: string }) => resolve(savedFilePath),
          fail: () => resolve(''),
        });
      },
      fail: () => resolve(''),
    });
  });
}

export async function persistProfileCardImages(
  card: PersonalCapabilityCard,
  previous: ImageCache = {},
): Promise<ImageCache> {
  const sources = [card.profile.avatarUrl, ...card.backgrounds.map((item) => item.url)].filter(
    (value): value is string => Boolean(value),
  );
  const next: ImageCache = {};
  const created = new Set<string>();
  await Promise.all(
    sources.map(async (source) => {
      if (previous[source]) {
        next[source] = previous[source];
        return;
      }
      const saved = await saveImage(source);
      if (saved) {
        next[source] = saved;
        created.add(saved);
      }
    }),
  );
  const complete = sources.every((source) => Boolean(next[source]));
  if (!complete) {
    // 图片采用整组原子替换；部分失败时回滚本轮文件，避免产生无引用的持久文件。
    for (const path of created) safeRemoveSavedFile(path);
    return previous;
  }
  const retained = new Set(Object.values(next));
  for (const path of Object.values(previous)) if (!retained.has(path)) safeRemoveSavedFile(path);
  return next;
}
