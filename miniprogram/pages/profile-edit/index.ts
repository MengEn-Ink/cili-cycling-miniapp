import type {
  AvatarSource,
  ClientAvatarSource,
  PersonalCapabilityCard,
  Profile,
} from '../../models';
import { repositoryCache } from '../../repositories/index';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { mediaSourceKind, reportMediaDiagnostic } from '../../utils/media-diagnostic';
import { invalidateProfilePageCache } from '../../utils/profile-page-cache';
import { getSharedTempFileUrlCache, type TempFileUrlCache } from '../../utils/temp-file-url';
import { validateRegistrationProfile } from '../../utils/validation';
import { uploadMedia } from '../../utils/media-upload';

const AVATAR_PREVIEW_DEADLINE_MS = 8_000;
const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_BACKGROUND_SOURCE_BYTES = 20 * 1024 * 1024;
const BACKGROUND_COMPRESS_QUALITY = 82;
const BACKGROUND_COMPRESS_WIDTH = 1600;
const BACKGROUND_COMPRESS_HEIGHT = 900;
const PROFILE_BACKGROUND_CATEGORY = 'ride' as const;
type MediaStage = 'selection' | 'authorize' | 'upload' | 'finalize' | 'setAvatar' | 'preview';
type SelectedImage = { path: string; size?: number };
type PhotoItem = {
  id: string;
  category: string;
  previewUrl: string;
  previewState: 'ready' | 'loading' | 'failed';
};
type ProfileUploadTask = {
  abort?(): void;
  onProgressUpdate?(callback: (event: { progress?: unknown }) => void): void;
  offProgressUpdate?(callback: (event: { progress?: unknown }) => void): void;
  then?: Promise<{ fileID: string }>['then'];
};

function safeHttpsUrl(value: unknown): string {
  return typeof value === 'string' && /^https:\/\/[^\s/]+(?:\/[^\s]*)?$/i.test(value) ? value : '';
}

function isUserCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { errMsg?: unknown; message?: unknown };
  const message =
    typeof value.errMsg === 'string'
      ? value.errMsg
      : typeof value.message === 'string'
        ? value.message
        : '';
  return /(?:^|[\s:])(?:cancel(?:led)?|abort(?:ed)?)(?:$|[\s:])/i.test(message);
}

function isUnsupportedApi(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { errMsg?: unknown; message?: unknown };
  return /(?:api )?not supported|not available|version too low|基础库版本过低/i.test(
    String(value.errMsg || value.message || ''),
  );
}

function safeErrorCode(error: unknown, fallback: string): string {
  const value =
    error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : '';
  return /^[A-Z0-9_]{1,64}$/.test(value) ? value : fallback;
}

function mediaStageError(error: unknown, stage: MediaStage, fallbackCode: string): Error {
  if (isUserCancellation(error)) return error as Error;
  return Object.assign(new Error('媒体操作失败'), {
    code: safeErrorCode(error, fallbackCode),
    mediaStage: stage,
  });
}

function mediaCloudUnavailableError(): Error {
  return Object.assign(new Error('media unavailable'), {
    code: 'MEDIA_CLOUD_UNAVAILABLE',
    mediaStage: 'upload' as MediaStage,
  });
}

function mediaOperationAbortError(): Error {
  return Object.assign(new Error('media operation aborted'), {
    errMsg: 'media:fail abort',
  });
}

// 计算本地图片内容 md5 作为会话内幂等键；基础库不支持或取指纹失败时返回空串，
// 调用方据此走完整上传链路，保证可用性优先，跨会话重复由云端 canonical 机制兜底。
async function contentDigest(filePath: string): Promise<string> {
  try {
    if (typeof wx.getFileInfo !== 'function') return '';
    const info: { digest?: unknown } = await wx.getFileInfo({
      filePath,
      digestAlgorithm: 'md5',
    });
    return typeof info.digest === 'string' ? info.digest : '';
  } catch {
    return '';
  }
}

function mediaFailureDetail(error: unknown): string {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const stage =
    typeof value.mediaStage === 'string'
      ? value.mediaStage
      : typeof value.stage === 'string'
        ? value.stage
        : '';
  const fallbackByStage: Record<string, string> = {
    selection: 'MEDIA_SELECTION_FAILED',
    authorize: 'MEDIA_UPLOAD_PATH_FAILED',
    upload: 'MEDIA_UPLOAD_FAILED',
    finalize: 'MEDIA_REGISTER_FAILED',
    setAvatar: 'AVATAR_SET_FAILED',
    preview: 'AVATAR_PREVIEW_FAILED',
  };
  const messageByStage: Record<string, string> = {
    selection: '选择图片失败，请确认已允许使用相册或相机，也可稍后再试',
    authorize: '图片准备失败，请检查网络后重试',
    upload: '图片上传失败，请重新选择图片后重试',
    finalize: '图片校验失败，请重新选择图片后重试',
    setAvatar: '头像保存未确认，请稍后重试',
    preview: '头像预览暂不可用，请稍后重试',
  };
  const causeCode = safeErrorCode(error, '');
  const specificCodes = new Set([
    'MEDIA_TOO_LARGE',
    'MEDIA_SOURCE_TOO_LARGE',
    'MEDIA_SIZE_UNAVAILABLE',
    'MEDIA_OBJECT_NOT_FOUND',
    'MEDIA_OBJECT_VERIFY_FAILED',
    'MEDIA_OBJECT_TOO_LARGE',
    'MEDIA_OBJECT_TYPE_INVALID',
    'MEDIA_CLOUD_UNAVAILABLE',
  ]);
  const code = specificCodes.has(causeCode)
    ? causeCode
    : fallbackByStage[stage] || 'MEDIA_OPERATION_FAILED';
  const messageByCode: Record<string, string> = {
    MEDIA_TOO_LARGE: '图片超过 5MB，请压缩或更换图片后重试',
    MEDIA_SOURCE_TOO_LARGE: '原图超过 20MB，请选择更小的图片后重试',
    MEDIA_SIZE_UNAVAILABLE: '无法确认图片大小，请重新选择图片或升级微信后重试',
    MEDIA_OBJECT_TOO_LARGE: '图片超过 5MB，请压缩或更换图片后重试',
    MEDIA_OBJECT_TYPE_INVALID: '图片格式无效，请选择 JPEG、PNG 或 WebP 图片',
    MEDIA_OBJECT_NOT_FOUND: '图片暂未准备好，请稍后重试',
    MEDIA_OBJECT_VERIFY_FAILED: '图片暂未准备好，请稍后重试',
    MEDIA_CLOUD_UNAVAILABLE: '当前环境暂不支持图片上传，请更新微信后重试',
  };
  const userMessage =
    messageByCode[causeCode] || messageByStage[stage] || '媒体操作失败，请稍后重试';
  // 技术码仅用于内部诊断（console.warn / 异常对象字段），不展示给用户。
  try {
    const diagnosticMessage =
      error &&
      typeof error === 'object' &&
      typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
    // eslint-disable-next-line no-console
    console.warn('[profile-edit] media failure', { code, stage, diagnosticMessage });
  } catch {
    // 诊断日志不影响用户路径。
  }
  if (error && typeof error === 'object') {
    try {
      (error as { diagnosticCode?: string }).diagnosticCode = code;
    } catch {
      // ignore
    }
  }
  return userMessage;
}

function settleBeforeDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    void promise.then(
      (value) => finish(value),
      () => finish(null),
    );
  });
}

function firstTempImage(choice: unknown): SelectedImage | null {
  const files =
    choice &&
    typeof choice === 'object' &&
    Array.isArray((choice as { tempFiles?: unknown }).tempFiles)
      ? (choice as { tempFiles: unknown[] }).tempFiles
      : [];
  const file = files[0];
  if (file && typeof file === 'object') {
    const path =
      (file as { tempFilePath?: unknown; path?: unknown }).tempFilePath ||
      (file as { path?: unknown }).path;
    const size = (file as { size?: unknown }).size;
    if (typeof path === 'string' && path)
      return { path, ...(typeof size === 'number' && Number.isFinite(size) ? { size } : {}) };
  }
  const paths =
    choice &&
    typeof choice === 'object' &&
    Array.isArray((choice as { tempFilePaths?: unknown }).tempFilePaths)
      ? (choice as { tempFilePaths: unknown[] }).tempFilePaths
      : [];
  return typeof paths[0] === 'string' && paths[0] ? { path: paths[0] } : null;
}

function finiteFileSize(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readLocalImageSize(image: SelectedImage): Promise<number> {
  const knownSize = finiteFileSize(image.size);
  if (knownSize !== undefined) return knownSize;

  if (typeof wx.getFileInfo === 'function') {
    try {
      const info = await wx.getFileInfo({ filePath: image.path });
      const size = finiteFileSize(info?.size);
      if (size !== undefined) return size;
    } catch {
      // 继续使用文件系统 stat 兜底。
    }
  }

  try {
    const manager =
      typeof wx.getFileSystemManager === 'function' ? wx.getFileSystemManager() : undefined;
    if (manager && typeof manager.stat === 'function') {
      const result = await new Promise<{ stats?: { size?: unknown } }>((resolve, reject) => {
        manager.stat({ path: image.path, success: resolve, fail: reject });
      });
      const size = finiteFileSize(result?.stats?.size);
      if (size !== undefined) return size;
    }
  } catch {
    // 统一在下方 fail-closed。
  }

  throw Object.assign(new Error('无法读取图片大小'), {
    code: 'MEDIA_SIZE_UNAVAILABLE',
    mediaStage: 'selection' as MediaStage,
  });
}

async function ensureLocalImageSize(image: SelectedImage): Promise<SelectedImage> {
  const size = await readLocalImageSize(image);
  if (size > MAX_LOCAL_IMAGE_BYTES)
    throw Object.assign(new Error('图片不能超过 5MB'), { code: 'MEDIA_TOO_LARGE' });
  return { ...image, size };
}

async function ensureBackgroundSourceSize(image: SelectedImage): Promise<SelectedImage> {
  const size = await readLocalImageSize(image);
  if (size > MAX_BACKGROUND_SOURCE_BYTES)
    throw Object.assign(new Error('源图片过大'), { code: 'MEDIA_SOURCE_TOO_LARGE' });
  return { ...image, size };
}

async function chooseSingleImage(): Promise<SelectedImage | null> {
  if (typeof wx.chooseMedia === 'function') {
    try {
      return firstTempImage(
        await wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        }),
      );
    } catch (error) {
      if (
        isUserCancellation(error) ||
        !isUnsupportedApi(error) ||
        typeof wx.chooseImage !== 'function'
      )
        throw mediaStageError(error, 'selection', 'MEDIA_SELECTION_FAILED');
    }
  }
  if (typeof wx.chooseImage !== 'function') return null;
  try {
    return firstTempImage(
      await wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }),
    );
  } catch (error) {
    throw mediaStageError(error, 'selection', 'MEDIA_SELECTION_FAILED');
  }
}

async function cropBackgroundImage(image: SelectedImage): Promise<SelectedImage> {
  if (typeof wx.cropImage !== 'function') return image;
  try {
    const result = await new Promise<{ tempFilePath?: string }>((resolve, reject) => {
      wx.cropImage({
        src: image.path,
        cropScale: '16:9',
        success: resolve,
        fail: reject,
      });
    });
    const path = result?.tempFilePath;
    return typeof path === 'string' && path ? { path } : image;
  } catch (error) {
    if (isUserCancellation(error)) throw error;
    // 部分旧基础库虽暴露方法但运行时仍会报告不支持，此时保留原图继续上传。
    if (isUnsupportedApi(error)) return image;
    throw mediaStageError(error, 'selection', 'MEDIA_SELECTION_FAILED');
  }
}

async function compressBackgroundImage(image: SelectedImage): Promise<SelectedImage> {
  if (typeof wx.compressImage !== 'function') {
    reportMediaDiagnostic('profile-edit.background', 'compress-fallback', {
      reason: 'api-unavailable',
    });
    return image;
  }
  try {
    const result = await new Promise<{ tempFilePath?: string }>((resolve, reject) => {
      wx.compressImage({
        src: image.path,
        quality: BACKGROUND_COMPRESS_QUALITY,
        compressedWidth: BACKGROUND_COMPRESS_WIDTH,
        compressedHeight: BACKGROUND_COMPRESS_HEIGHT,
        success: resolve,
        fail: reject,
      });
    });
    if (typeof result?.tempFilePath !== 'string' || !result.tempFilePath) {
      reportMediaDiagnostic('profile-edit.background', 'compress-fallback', {
        reason: 'invalid-result',
      });
      return image;
    }
    reportMediaDiagnostic('profile-edit.background', 'compress-success', {});
    return { path: result.tempFilePath };
  } catch (error) {
    reportMediaDiagnostic('profile-edit.background', 'compress-fallback', {
      reason: isUnsupportedApi(error) ? 'api-unsupported' : 'compress-failed',
    });
    return image;
  }
}

function mergeAvatarFields(current: Profile | null, authoritative: Profile): Profile {
  if (!current) return authoritative;
  const merged = {
    ...current,
    avatarRevision: authoritative.avatarRevision,
    avatarVisibility: authoritative.avatarVisibility,
    avatarVisibilityRevision: authoritative.avatarVisibilityRevision,
  };
  if (authoritative.avatarId) {
    merged.avatarId = authoritative.avatarId;
    if (authoritative.avatarSource) merged.avatarSource = authoritative.avatarSource;
    else delete merged.avatarSource;
  } else {
    delete merged.avatarId;
    delete merged.avatarSource;
  }
  return merged;
}

function canEditProfileDetails(profile: Profile | null): boolean {
  if (!profile) return false;
  const hasValue = (value: unknown) => typeof value === 'string' && value.trim().length > 0;
  return Boolean(
    profile.avatarId ||
    hasValue(profile.realName) ||
    hasValue(profile.phone) ||
    hasValue(profile.gender) ||
    hasValue(profile.emergencyName) ||
    hasValue(profile.emergencyPhone) ||
    profile.photos.length,
  );
}

function normalizeBackgroundProfile(profile: Profile | null): Profile | null {
  if (!profile) return null;
  const slot =
    profile.backgroundPhoto !== undefined
      ? profile.backgroundPhoto
      : profile.photos[0]
        ? { ...profile.photos[0], category: PROFILE_BACKGROUND_CATEGORY }
        : null;
  return {
    ...profile,
    photos: slot ? [{ ...slot, category: PROFILE_BACKGROUND_CATEGORY }] : [],
    backgroundPhoto: slot ? { ...slot, category: PROFILE_BACKGROUND_CATEGORY } : null,
  };
}

type SensitiveValues = Pick<Profile, 'realName' | 'phone' | 'emergencyPhone'>;

function sensitiveValues(profile: Profile | null): SensitiveValues {
  return {
    realName: profile?.realName || '',
    phone: profile?.phone || '',
    emergencyPhone: profile?.emergencyPhone || '',
  };
}

function profileSaveValidationMessage(profile: Profile, loaded: SensitiveValues): string {
  if (!profile.avatarId?.trim()) return '请先设置头像，再保存资料';
  // 未改动的字段沿用服务端填写状态（兼容旧版云函数未回传完整值）；改动或清空后按当前表单值校验。
  const filled = (key: keyof SensitiveValues, valid: boolean) =>
    profile[key] === loaded[key] && profile.sensitiveStatus
      ? profile.sensitiveStatus[key] === true
      : valid;
  const sensitiveStatus = {
    realName: filled('realName', !!profile.realName.trim()),
    phone: filled('phone', /^1\d{10}$/.test(profile.phone)),
    emergencyPhone: filled('emergencyPhone', /^1\d{10}$/.test(profile.emergencyPhone)),
  };
  // 资料保存、完整度和报名门槛共用同一 7 项口径，避免“保存成功后仍无法报名”。
  return validateRegistrationProfile({ ...profile, sensitiveStatus })[0] || '';
}

function confirmsAvatar(
  profile: Profile,
  expected: { source: AvatarSource; fileId?: string; revisionAfter?: number },
): boolean {
  return Boolean(
    profile.avatarId &&
    profile.avatarSource === expected.source &&
    (!expected.fileId || profile.avatarId === expected.fileId) &&
    (expected.revisionAfter === undefined || profile.avatarRevision > expected.revisionAfter),
  );
}

Page({
  unloaded: false,
  avatarMediaGeneration: 0,
  backgroundMediaGeneration: 0,
  avatarUploadTask: null as ProfileUploadTask | null,
  backgroundUploadTask: null as ProfileUploadTask | null,
  avatarPreviewRequestId: 0,
  photoPreviewRequestId: 0,
  mediaErrorRevision: 0,
  mediaErrorStage: '',
  localPhotoPreviews: {} as Record<string, string>,
  // 会话内“用途 + 内容指纹 -> 已登记 fileId”映射：仅同用途重复选择可复用，避免头像与背景跨 category 串用。
  uploadedMediaDigests: new Map<string, string>(),
  // 跨页面共享 fileID -> 临时地址；相同照片只解析一次，失效时由 binderror 主动淘汰。
  photoPreviewRetryIds: new Set<string>(),
  // 头像在一次页面展示周期内最多自动重试一次，避免动态签名 URL 持续失效时循环回源。
  avatarPreviewRetryAttempted: false,
  // 加载/保存后服务端回传的实名与电话原值：未改动的字段保存时不重复提交。
  loadedSensitive: sensitiveValues(null),
  data: {
    loading: true,
    error: '',
    p: null as Profile | null,
    saving: false,
    avatarBusy: false,
    photoBusy: false,
    mediaProgress: '',
    mediaError: '',
    avatarPreviewUrl: '',
    canEditDetails: false,
    photoItems: [] as PhotoItem[],
  },
  async onLoad() {
    this.unloaded = false;
    const state = await runPageTask(() => rideService.getProfile(), '资料加载失败');
    const loadedProfile = normalizeBackgroundProfile(state.data || null);
    this.loadedSensitive = sensitiveValues(loadedProfile);
    this.safeSetData({
      loading: false,
      error: state.error,
      p: loadedProfile,
      canEditDetails: canEditProfileDetails(loadedProfile),
    });
    if (loadedProfile) {
      void this.loadAvatarPreview();
      void this.loadPhotoPreviews();
    }
  },
  async onShow() {
    this.avatarPreviewRetryAttempted = false;
    const cardPromise = settleBeforeDeadline(
      rideService.getPersonalCapabilityCard(),
      AVATAR_PREVIEW_DEADLINE_MS,
    );
    await Promise.all([this.loadAvatarPreview(cardPromise), this.loadPhotoPreviews(cardPromise)]);
  },
  onHide() {
    this.avatarPreviewRequestId += 1;
    this.photoPreviewRequestId += 1;
  },
  onUnload() {
    this.unloaded = true;
    this.avatarMediaGeneration += 1;
    this.backgroundMediaGeneration += 1;
    try {
      this.avatarUploadTask?.abort?.();
    } catch {
      // 页面销毁优先，UploadTask abort 异常不阻断卸载。
    }
    try {
      this.backgroundUploadTask?.abort?.();
    } catch {
      // 页面销毁优先，UploadTask abort 异常不阻断卸载。
    }
    this.avatarUploadTask = null;
    this.backgroundUploadTask = null;
    this.avatarPreviewRequestId += 1;
    this.photoPreviewRequestId += 1;
  },
  safeSetData(value: Record<string, unknown>, callback?: () => void) {
    if (!this.unloaded) this.setData(value, callback);
  },
  assertAvatarMediaCurrent(generation: number) {
    if (this.unloaded || generation !== this.avatarMediaGeneration)
      throw mediaOperationAbortError();
  },
  assertBackgroundMediaCurrent(generation: number) {
    if (this.unloaded || generation !== this.backgroundMediaGeneration)
      throw mediaOperationAbortError();
  },
  async loadAvatarPreview(cardPromise?: Promise<PersonalCapabilityCard | null>) {
    if (!this.data.p?.avatarId) {
      this.safeSetData({ avatarPreviewUrl: '' });
      return;
    }
    const requestId = ++this.avatarPreviewRequestId;
    const errorRevision = this.mediaErrorRevision;
    const card = await (cardPromise ||
      settleBeforeDeadline(rideService.getPersonalCapabilityCard(), AVATAR_PREVIEW_DEADLINE_MS));
    if (requestId !== this.avatarPreviewRequestId) return;
    if (!card) {
      if (
        this.mediaErrorRevision !== errorRevision ||
        (this.mediaErrorStage && this.mediaErrorStage !== 'preview')
      )
        return;
      this.mediaErrorRevision += 1;
      this.mediaErrorStage = 'preview';
      this.safeSetData({
        mediaError: mediaFailureDetail(
          Object.assign(new Error('preview unavailable'), {
            code: 'AVATAR_PREVIEW_FAILED',
            mediaStage: 'preview',
          }),
        ),
      });
      return;
    }
    const patch: Record<string, unknown> = {
      avatarPreviewUrl: safeHttpsUrl(card.profile.avatarUrl),
    };
    if (this.mediaErrorStage === 'preview' && this.mediaErrorRevision === errorRevision) {
      this.mediaErrorRevision += 1;
      this.mediaErrorStage = '';
      patch.mediaError = '';
    }
    this.safeSetData(patch);
  },
  ensurePhotoUrlCache(): TempFileUrlCache | null {
    const cloud = wx.cloud as
      | (WxCloudApi & {
          getTempFileURL?(options: { fileList: string[] }): Promise<{
            fileList?: { fileID?: string; tempFileURL?: string }[];
          }>;
        })
      | undefined;
    if (typeof cloud?.getTempFileURL !== 'function') return null;
    // 绑定回 cloud 后交给应用级单例，个人资料、活动编辑和骑行名片复用同一批临时地址。
    const fn = cloud.getTempFileURL;
    return getSharedTempFileUrlCache({
      getTempFileURL: (options) => fn.call(cloud, options),
    });
  },
  async loadPhotoPreviews(cardPromise?: Promise<PersonalCapabilityCard | null>) {
    const current = this.data.p as Profile | null;
    if (!current) return;
    const p = normalizeBackgroundProfile(current) as Profile;
    if (p !== current) this.safeSetData({ p });
    const requestId = ++this.photoPreviewRequestId;
    const currentItems = p.photos.map((photo) => {
      const previewUrl = this.localPhotoPreviews[photo.id] || safeHttpsUrl(photo.id);
      return {
        ...photo,
        previewUrl,
        previewState: previewUrl ? ('ready' as const) : ('loading' as const),
      };
    });
    this.safeSetData({ photoItems: currentItems });
    const unresolved = p.photos.filter(
      (photo) => !this.localPhotoPreviews[photo.id] && !safeHttpsUrl(photo.id),
    );
    const resolved: Record<string, string> = {};
    if (unresolved.length) {
      const card = await (cardPromise ||
        settleBeforeDeadline(rideService.getPersonalCapabilityCard(), AVATAR_PREVIEW_DEADLINE_MS));
      const serverBackgrounds = new Map(
        (card?.backgrounds || [])
          .filter(
            (background) =>
              background.source === 'user_photo' && background.id && safeHttpsUrl(background.url),
          )
          .map((background) => [background.id as string, safeHttpsUrl(background.url)]),
      );
      unresolved.forEach((photo) => {
        const serverUrl = serverBackgrounds.get(photo.id);
        if (serverUrl) resolved[photo.id] = serverUrl;
      });
      const clientUnresolved = unresolved.filter((photo) => !resolved[photo.id]);
      const cache = this.ensurePhotoUrlCache();
      if (cache && clientUnresolved.length) {
        try {
          // 服务端签名地址不可用时才由客户端缓存兜底；受保护媒体不依赖客户端存储读权限。
          const map = await cache.resolve(clientUnresolved.map((photo) => photo.id));
          for (const [id, url] of Object.entries(map)) {
            const safe = safeHttpsUrl(url);
            if (safe) resolved[id] = safe;
          }
        } catch {
          /* 单张预览失败不阻塞资料编辑，由明确失败态提供重试入口。 */
        }
      }
    }
    if (requestId !== this.photoPreviewRequestId) return;
    this.safeSetData({
      photoItems: p.photos.map((photo) => {
        const previewUrl =
          this.localPhotoPreviews[photo.id] || safeHttpsUrl(photo.id) || resolved[photo.id] || '';
        return {
          ...photo,
          previewUrl,
          previewState: previewUrl ? ('ready' as const) : ('failed' as const),
        };
      }),
    });
  },
  photoPreviewLoad(e: any) {
    const id = String(e.currentTarget?.dataset?.id || '');
    if (id) this.photoPreviewRetryIds.delete(id);
  },
  photoPreviewError(e: any) {
    const id = String(e.currentTarget?.dataset?.id || '');
    const failedUrl = String(e.currentTarget?.dataset?.url || '');
    if (!id) return;
    const current = this.data.photoItems.find((item: PhotoItem) => item.id === id);
    // 旧节点的迟到 error 不得清空已经刷新的新地址。
    if (!current || (failedUrl && current.previewUrl !== failedUrl)) return;
    const source = mediaSourceKind(failedUrl);
    // 本地临时文件一旦触发 binderror 就不可继续优先复用；仅删除与失败节点同值的路径，避免迟到错误覆盖新选择。
    if (source === 'local' && this.localPhotoPreviews[id] === failedUrl) {
      delete this.localPhotoPreviews[id];
    }
    reportMediaDiagnostic('profile-edit.photo', 'load-error', {
      source,
      retryAttempted: this.photoPreviewRetryIds.has(id),
    });
    this.ensurePhotoUrlCache()?.invalidate([id]);
    repositoryCache.invalidateProfiles();
    this.safeSetData({
      photoItems: this.data.photoItems.map((item: PhotoItem) =>
        item.id === id ? { ...item, previewUrl: '', previewState: 'failed' } : item,
      ),
    });
    if (this.photoPreviewRetryIds.has(id)) return;
    this.photoPreviewRetryIds.add(id);
    void this.loadPhotoPreviews();
  },
  retryPhotoPreview(e: any) {
    const id = String(e.currentTarget?.dataset?.id || '');
    if (!id) return;
    delete this.localPhotoPreviews[id];
    reportMediaDiagnostic('profile-edit.photo', 'manual-retry', {});
    this.photoPreviewRetryIds.delete(id);
    this.ensurePhotoUrlCache()?.invalidate([id]);
    repositoryCache.invalidateProfiles();
    void this.loadPhotoPreviews();
  },
  applyAvatarProfile(authoritative: Profile) {
    const p = mergeAvatarFields(this.data.p, authoritative);
    this.safeSetData({ p, canEditDetails: canEditProfileDetails(p) });
    invalidateProfilePageCache();
  },
  async reloadAvatarProfile(expected: {
    source: AvatarSource;
    fileId?: string;
    revisionAfter?: number;
  }) {
    const state = await runPageTask(() => rideService.getProfile(), '头像状态刷新失败');
    if (state.data) this.applyAvatarProfile(state.data);
    const confirmed = Boolean(state.data && confirmsAvatar(state.data, expected));
    void this.loadAvatarPreview();
    return confirmed;
  },
  set(e: any) {
    this.safeSetData({ ['p.' + e.currentTarget.dataset.k]: e.detail.value });
  },
  selectGender(e: any) {
    this.safeSetData({ 'p.gender': e.detail.value });
  },
  async runAvatarAction(action: (generation: number) => Promise<void>) {
    if (this.data.avatarBusy || this.data.photoBusy || this.data.saving) return;
    const generation = ++this.avatarMediaGeneration;
    this.mediaErrorRevision += 1;
    this.mediaErrorStage = '';
    this.safeSetData({ avatarBusy: true, mediaProgress: '正在上传头像…', mediaError: '' });
    try {
      await action(generation);
    } catch (error) {
      if (!this.unloaded && !isUserCancellation(error)) {
        const detail = mediaFailureDetail(error);
        this.mediaErrorRevision += 1;
        this.mediaErrorStage =
          error &&
          typeof error === 'object' &&
          typeof (error as { mediaStage?: unknown }).mediaStage === 'string'
            ? String((error as { mediaStage: string }).mediaStage)
            : '';
        this.safeSetData({ mediaError: detail });
        wx.showToast({ title: detail, icon: 'none' });
      }
    } finally {
      if (generation === this.avatarMediaGeneration) this.avatarUploadTask = null;
      this.safeSetData({ avatarBusy: false, mediaProgress: '' });
    }
  },
  async uploadAndSetAvatar(image: SelectedImage, generation: number) {
    const origin: ClientAvatarSource = 'wechat';
    const cloud = wx.cloud;
    if (!cloud) throw mediaCloudUnavailableError();
    this.assertAvatarMediaCurrent(generation);
    const verifiedImage = await ensureLocalImageSize(image);
    this.assertAvatarMediaCurrent(generation);
    const digest = await contentDigest(verifiedImage.path);
    this.assertAvatarMediaCurrent(generation);
    const avatarDigestKey = digest ? `profile-avatar:${digest}` : '';
    const reusedFileId = avatarDigestKey ? this.uploadedMediaDigests.get(avatarDigestKey) : '';
    if (reusedFileId) {
      this.assertAvatarMediaCurrent(generation);
      let authoritative: Profile;
      try {
        authoritative = await rideService.setAvatar(origin, reusedFileId);
      } catch (error) {
        throw mediaStageError(error, 'setAvatar', 'AVATAR_SET_FAILED');
      }
      this.assertAvatarMediaCurrent(generation);
      this.applyAvatarProfile(authoritative);
      await this.loadAvatarPreview();
      wx.showToast({ title: '头像已更新' });
      return;
    }
    let canonicalFileId = '';
    let selectionDispatched = false;
    try {
      const uploaded = await uploadMedia({
        cloud: cloud as Parameters<typeof uploadMedia>[0]['cloud'],
        filePath: verifiedImage.path,
        category: 'profile-avatar',
        authorize: (category, requestId, extension) =>
          rideService.issueMediaUploadPath(category, requestId, extension as 'jpg'),
        finalize: (fileId, category, requestId) =>
          rideService.finalizeMediaUpload(fileId, category, requestId, origin),
        onTask: (task) => {
          if (this.unloaded || generation !== this.avatarMediaGeneration) task?.abort?.();
          else this.avatarUploadTask = task;
        },
        onProgress: (progress) => {
          if (!this.unloaded && generation === this.avatarMediaGeneration)
            this.safeSetData({ mediaProgress: `正在上传 ${progress}%` });
        },
        onRetry: (attempt, maxAttempts) => {
          if (!this.unloaded && generation === this.avatarMediaGeneration)
            this.safeSetData({
              mediaProgress: `网络不稳定，正在重新上传 ${attempt}/${maxAttempts}`,
            });
        },
      });
      canonicalFileId = uploaded.canonicalFileId;
      this.assertAvatarMediaCurrent(generation);
      this.safeSetData({ mediaProgress: '正在确认头像…' });
      selectionDispatched = true;
      let authoritative: Profile;
      try {
        authoritative = await rideService.setAvatar(origin, canonicalFileId);
      } catch (error) {
        throw mediaStageError(error, 'setAvatar', 'AVATAR_SET_FAILED');
      }
      this.assertAvatarMediaCurrent(generation);
      if (avatarDigestKey) this.uploadedMediaDigests.set(avatarDigestKey, canonicalFileId);
      this.applyAvatarProfile(authoritative);
      await this.loadAvatarPreview();
      wx.showToast({ title: '头像已更新' });
    } catch (error) {
      if (selectionDispatched) {
        if (this.unloaded || generation !== this.avatarMediaGeneration) throw error;
        const confirmed = await this.reloadAvatarProfile({
          source: origin,
          fileId: canonicalFileId,
        });
        if (confirmed) {
          wx.showToast({ title: '头像已更新' });
          return;
        }
      }
      throw error;
    }
  },
  async chooseWechatAvatar(e: any) {
    const filePath = e?.detail?.avatarUrl;
    if (typeof filePath !== 'string' || !filePath) return;
    await this.runAvatarAction((generation: number) =>
      this.uploadAndSetAvatar({ path: filePath }, generation),
    );
  },
  avatarPreviewError(event: any) {
    const failedUrl = event?.currentTarget?.dataset?.url;
    if (typeof failedUrl === 'string' && failedUrl === this.data.avatarPreviewUrl) {
      reportMediaDiagnostic('profile-edit.avatar', 'load-error', {
        source: mediaSourceKind(failedUrl),
        retryAttempted: this.avatarPreviewRetryAttempted,
      });
      repositoryCache.invalidateProfiles();
      this.safeSetData({ avatarPreviewUrl: '' });
      if (this.avatarPreviewRetryAttempted) return;
      this.avatarPreviewRetryAttempted = true;
      void this.loadAvatarPreview();
    }
  },
  async addPhoto() {
    // 添加照片加在途锁，避免快速连点触发多次并发上传产生孤立文件或状态错乱。
    if (this.data.photoBusy || this.data.saving || this.data.avatarBusy) return;
    const generation = ++this.backgroundMediaGeneration;
    this.mediaErrorRevision += 1;
    this.mediaErrorStage = '';
    this.safeSetData({ photoBusy: true, mediaProgress: '请选择并调整背景图…', mediaError: '' });
    let canonicalFileId = '';
    try {
      const cloud = wx.cloud;
      if (!cloud) throw mediaCloudUnavailableError();
      this.assertBackgroundMediaCurrent(generation);
      const image = await chooseSingleImage();
      if (!image) return;
      this.assertBackgroundMediaCurrent(generation);
      const sourceImage = await ensureBackgroundSourceSize(image);
      this.assertBackgroundMediaCurrent(generation);
      const croppedImage = await cropBackgroundImage(sourceImage);
      this.assertBackgroundMediaCurrent(generation);
      const compressedImage = await compressBackgroundImage(croppedImage);
      this.assertBackgroundMediaCurrent(generation);
      this.safeSetData({ mediaProgress: '正在上传背景图…' });
      const verifiedImage = await ensureLocalImageSize(compressedImage);
      this.assertBackgroundMediaCurrent(generation);
      const photoDigest = await contentDigest(verifiedImage.path);
      this.assertBackgroundMediaCurrent(generation);
      const backgroundDigestKey = photoDigest ? `profile-background:${photoDigest}` : '';
      const reusedPhotoId = backgroundDigestKey
        ? this.uploadedMediaDigests.get(backgroundDigestKey)
        : '';
      if (reusedPhotoId) {
        // 同内容图片本次会话已上传登记：跳过路径申请、上传与注册，直接把背景槽位指向已有 fileId。
        const current = this.data.p;
        if (!current) return;
        current.photos = [{ id: reusedPhotoId, category: PROFILE_BACKGROUND_CATEGORY }];
        current.backgroundPhoto = { id: reusedPhotoId, category: PROFILE_BACKGROUND_CATEGORY };
        this.localPhotoPreviews = { [reusedPhotoId]: verifiedImage.path };
        this.safeSetData({ p: current });
        await this.loadPhotoPreviews();
        return;
      }
      const uploaded = await uploadMedia({
        cloud: cloud as Parameters<typeof uploadMedia>[0]['cloud'],
        filePath: verifiedImage.path,
        category: 'profile-background',
        authorize: (category, requestId, extension) =>
          rideService.issueMediaUploadPath(category, requestId, extension as 'jpg'),
        finalize: (fileId, category, requestId) =>
          rideService.finalizeMediaUpload(fileId, category, requestId),
        onTask: (task) => {
          if (this.unloaded || generation !== this.backgroundMediaGeneration) task?.abort?.();
          else this.backgroundUploadTask = task;
        },
        onProgress: (progress) => {
          if (!this.unloaded && generation === this.backgroundMediaGeneration)
            this.safeSetData({ mediaProgress: `正在上传 ${progress}%` });
        },
        onRetry: (attempt, maxAttempts) => {
          if (!this.unloaded && generation === this.backgroundMediaGeneration)
            this.safeSetData({
              mediaProgress: `网络不稳定，正在重新上传 ${attempt}/${maxAttempts}`,
            });
        },
      });
      canonicalFileId = uploaded.canonicalFileId;
      this.assertBackgroundMediaCurrent(generation);
      this.safeSetData({ mediaProgress: '正在确认背景图…' });
      this.assertBackgroundMediaCurrent(generation);
      if (backgroundDigestKey) this.uploadedMediaDigests.set(backgroundDigestKey, canonicalFileId);
      const p = this.data.p;
      if (!p) return;
      p.photos = [{ id: canonicalFileId, category: PROFILE_BACKGROUND_CATEGORY }];
      p.backgroundPhoto = { id: canonicalFileId, category: PROFILE_BACKGROUND_CATEGORY };
      this.localPhotoPreviews = { [canonicalFileId]: verifiedImage.path };
      this.safeSetData({ p });
      await this.loadPhotoPreviews();
    } catch (error) {
      if (this.unloaded || isUserCancellation(error)) return;
      const detail = mediaFailureDetail(error);
      this.mediaErrorRevision += 1;
      this.mediaErrorStage =
        error &&
        typeof error === 'object' &&
        typeof (error as { mediaStage?: unknown }).mediaStage === 'string'
          ? String((error as { mediaStage: string }).mediaStage)
          : '';
      this.safeSetData({ mediaError: detail });
      wx.showToast({ title: detail, icon: 'none' });
    } finally {
      if (generation === this.backgroundMediaGeneration) this.backgroundUploadTask = null;
      this.safeSetData({ photoBusy: false, mediaProgress: '' });
    }
  },
  removeBackgroundPhoto() {
    if (!this.data.p || this.data.photoBusy || this.data.saving || this.data.avatarBusy) return;
    this.data.p.photos = [];
    this.data.p.backgroundPhoto = null;
    this.localPhotoPreviews = {};
    this.safeSetData({ p: this.data.p, photoItems: [], mediaError: '' });
  },
  previewAvatar() {
    const current = safeHttpsUrl(this.data.avatarPreviewUrl);
    if (current) wx.previewImage({ current, urls: [current] });
  },
  previewPhoto(e: any) {
    const current = e?.currentTarget?.dataset?.url;
    const urls = this.data.photoItems.map((item: PhotoItem) => item.previewUrl).filter(Boolean);
    if (typeof current === 'string' && current && urls.includes(current))
      wx.previewImage({ current, urls });
  },
  movePhoto(e: any) {
    if (!this.data.p || this.data.photoBusy || this.data.saving || this.data.avatarBusy) return;
    const from = Number(e?.currentTarget?.dataset?.index);
    const direction = Number(e?.currentTarget?.dataset?.direction);
    const to = from + direction;
    if (
      !Number.isInteger(from) ||
      ![-1, 1].includes(direction) ||
      to < 0 ||
      to >= this.data.p.photos.length
    )
      return;
    const photos = [...this.data.p.photos];
    [photos[from], photos[to]] = [photos[to], photos[from]];
    this.data.p.photos = photos;
    this.safeSetData({ p: this.data.p });
    void this.loadPhotoPreviews();
  },
  async save() {
    if (
      !this.data.p ||
      !this.data.canEditDetails ||
      this.data.saving ||
      this.data.photoBusy ||
      this.data.avatarBusy
    )
      return;
    const p = this.data.p;
    const loaded = this.loadedSensitive;
    const validationMessage = profileSaveValidationMessage(p, loaded);
    if (validationMessage) {
      // 头像有独立即时保存流程；仅整表保存时合并检查必填项，避免用户提交不完整报名资料。
      this.safeSetData({ error: validationMessage });
      wx.showToast({ title: validationMessage, icon: 'none' });
      return;
    }
    this.safeSetData({ saving: true, error: '' });
    const state = await runPageTask(
      () =>
        rideService.updateProfile({
          nickname: p.nickname,
          gender: p.gender,
          phone: p.phone === loaded.phone ? undefined : p.phone,
          emergencyName: p.emergencyName,
          backgroundPhoto:
            p.backgroundPhoto !== undefined ? p.backgroundPhoto : p.photos[0] || null,
          realName: p.realName === loaded.realName ? undefined : p.realName,
          emergencyPhone: p.emergencyPhone === loaded.emergencyPhone ? undefined : p.emergencyPhone,
        }),
      '保存失败',
    );
    if (state.data) this.loadedSensitive = sensitiveValues(state.data);
    this.safeSetData({
      saving: false,
      error: state.error,
      p: state.data ? normalizeBackgroundProfile(state.data) : p,
    });
    if (state.data) {
      invalidateProfilePageCache();
      await this.loadPhotoPreviews();
      wx.showToast({ title: '已安全保存' });
    }
  },
});
