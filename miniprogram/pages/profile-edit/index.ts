import type { AvatarSource, ClientAvatarSource, Profile } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';

const ORPHAN_LEDGER_KEY = 'profile-media-orphans-v1';
const AVATAR_PREVIEW_DEADLINE_MS = 1_200;
const MAX_LOCAL_IMAGE_BYTES = 5 * 1024 * 1024;
type MediaStage =
  'selection' | 'uploadPath' | 'upload' | 'register' | 'setAvatar' | 'preview' | 'import';
type SelectedImage = { path: string; size?: number };
type MediaOrphan = {
  fileId: string;
  category: 'other';
  origin?: ClientAvatarSource;
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
  return /(?:^|[\s:])cancel(?:led)?(?:$|[\s:])/i.test(message);
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

async function atMediaStage<T>(
  stage: MediaStage,
  fallbackCode: string,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    throw mediaStageError(error, stage, fallbackCode);
  }
}

function mediaFailureDetail(error: unknown): string {
  const value = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const stage = typeof value.mediaStage === 'string' ? value.mediaStage : '';
  const fallbackByStage: Record<string, string> = {
    selection: 'MEDIA_SELECTION_FAILED',
    uploadPath: 'MEDIA_UPLOAD_PATH_FAILED',
    upload: 'MEDIA_UPLOAD_FAILED',
    register: 'MEDIA_REGISTER_FAILED',
    setAvatar: 'AVATAR_SET_FAILED',
    preview: 'AVATAR_PREVIEW_FAILED',
    import: 'STRAVA_AVATAR_IMPORT_FAILED',
  };
  const messageByStage: Record<string, string> = {
    selection: '无法选择图片，请检查相册权限或系统设置后重试',
    uploadPath: '无法准备安全上传，请检查网络后重试',
    upload: '图片上传失败，请重新选择图片后重试',
    register: '云端图片校验失败，请重新选择图片后重试',
    setAvatar: '头像保存未确认，请稍后重试',
    preview: '头像预览暂不可用，请稍后重试',
    import: 'Strava 头像导入失败，请重新授权或稍后重试',
  };
  const fallbackCode = fallbackByStage[stage] || 'MEDIA_OPERATION_FAILED';
  const causeCode = safeErrorCode(error, '');
  const specificCodes = new Set([
    'MEDIA_TOO_LARGE',
    'MEDIA_OBJECT_NOT_FOUND',
    'MEDIA_OBJECT_VERIFY_FAILED',
    'MEDIA_OBJECT_TOO_LARGE',
    'MEDIA_OBJECT_TYPE_INVALID',
    'STRAVA_NOT_CONNECTED',
    'STRAVA_AVATAR_UNAVAILABLE',
  ]);
  const code = specificCodes.has(causeCode) ? causeCode : fallbackCode;
  const messageByCode: Record<string, string> = {
    MEDIA_TOO_LARGE: '图片超过 5MB，请压缩或更换图片后重试',
    MEDIA_OBJECT_TOO_LARGE: '图片超过 5MB，请压缩或更换图片后重试',
    MEDIA_OBJECT_TYPE_INVALID: '图片格式无效，请选择 JPEG、PNG 或 WebP 图片',
    MEDIA_OBJECT_NOT_FOUND: '图片暂未同步到云端，请稍后重试',
    MEDIA_OBJECT_VERIFY_FAILED: '图片暂未同步到云端，请稍后重试',
    STRAVA_NOT_CONNECTED: 'Strava 尚未连接或没有可用头像，请先同步 Strava',
    STRAVA_AVATAR_UNAVAILABLE: 'Strava 尚未连接或没有可用头像，请先同步 Strava',
  };
  return `[${code}] ${messageByCode[causeCode] || messageByStage[stage] || '媒体操作失败，请稍后重试'}`;
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
    const tempFilePath = (file as { tempFilePath?: unknown }).tempFilePath;
    const size = (file as { size?: unknown }).size;
    if (typeof tempFilePath === 'string' && tempFilePath)
      return {
        path: tempFilePath,
        ...(typeof size === 'number' && Number.isFinite(size) ? { size } : {}),
      };
    const path = (file as { path?: unknown }).path;
    if (typeof path === 'string' && path)
      return {
        path,
        ...(typeof size === 'number' && Number.isFinite(size) ? { size } : {}),
      };
  }
  const paths =
    choice &&
    typeof choice === 'object' &&
    Array.isArray((choice as { tempFilePaths?: unknown }).tempFilePaths)
      ? (choice as { tempFilePaths: unknown[] }).tempFilePaths
      : [];
  const firstPath = paths[0];
  return typeof firstPath === 'string' && firstPath ? { path: firstPath } : null;
}

function isUnsupportedChooseMedia(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { errMsg?: unknown; message?: unknown };
  const message = String(value.errMsg || value.message || '');
  return /(?:api )?not supported|not available|version too low|基础库版本过低/i.test(message);
}

function assertLocalImageSize(image: SelectedImage): SelectedImage {
  if (image.size !== undefined && image.size > MAX_LOCAL_IMAGE_BYTES)
    throw Object.assign(new Error('图片不能超过 5MB'), { code: 'MEDIA_TOO_LARGE' });
  return image;
}

async function ensureLocalImageSize(image: SelectedImage): Promise<SelectedImage> {
  if (image.size !== undefined) return assertLocalImageSize(image);
  if (typeof wx.getFileInfo !== 'function') return image;
  const info = await atMediaStage<{ size?: unknown }>('selection', 'MEDIA_SELECTION_FAILED', () =>
    wx.getFileInfo({ filePath: image.path }),
  );
  const size =
    info && typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : undefined;
  return assertLocalImageSize({ ...image, ...(size === undefined ? {} : { size }) });
}

async function chooseSingleImage(): Promise<SelectedImage | null> {
  if (typeof wx.chooseMedia === 'function') {
    try {
      const image = firstTempImage(
        await wx.chooseMedia({
          count: 1,
          mediaType: ['image'],
          sizeType: ['compressed'],
          sourceType: ['album', 'camera'],
        }),
      );
      return image;
    } catch (error) {
      if (
        isUserCancellation(error) ||
        !isUnsupportedChooseMedia(error) ||
        typeof wx.chooseImage !== 'function'
      )
        throw mediaStageError(error, 'selection', 'MEDIA_SELECTION_FAILED');
    }
  }
  if (typeof wx.chooseImage !== 'function') return null;
  const image = firstTempImage(
    await atMediaStage('selection', 'MEDIA_SELECTION_FAILED', () =>
      wx.chooseImage({ count: 1, sizeType: ['compressed'], sourceType: ['album', 'camera'] }),
    ),
  );
  return image;
}

function mergeAvatarFields(current: Profile | null, authoritative: Profile): Profile {
  if (!current) return authoritative;
  const merged = { ...current, avatarRevision: authoritative.avatarRevision };
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

function readOrphanLedger(): MediaOrphan[] {
  try {
    const value = wx.getStorageSync(ORPHAN_LEDGER_KEY);
    return Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item &&
              typeof item.fileId === 'string' &&
              item.category === 'other' &&
              (item.origin === undefined || item.origin === 'wechat' || item.origin === 'custom'),
          )
          .map((item) => ({
            fileId: item.fileId,
            category: 'other' as const,
            ...(item.origin ? { origin: item.origin as ClientAvatarSource } : {}),
          }))
      : [];
  } catch {
    return [];
  }
}

function saveOrphanLedger(entries: MediaOrphan[]) {
  if (entries.length) wx.setStorageSync(ORPHAN_LEDGER_KEY, entries);
  else wx.removeStorageSync(ORPHAN_LEDGER_KEY);
}

async function reportOrphan(entry: MediaOrphan) {
  if (entry.origin) {
    await rideService.reportProfileMediaOrphan(entry.fileId, entry.category, entry.origin);
    return;
  }
  await rideService.reportProfileMediaOrphan(entry.fileId, entry.category);
}

async function retryOrphanLedger() {
  const pending = readOrphanLedger();
  const remaining: MediaOrphan[] = [];
  for (const entry of pending) {
    try {
      await reportOrphan(entry);
    } catch {
      remaining.push(entry);
    }
  }
  saveOrphanLedger(remaining);
}

async function compensateUploadedMedia(entry: MediaOrphan) {
  let deleted = false;
  try {
    const result = (await wx.cloud?.deleteFile({ fileList: [entry.fileId] })) as
      { fileList?: { fileID?: string; status?: number }[] } | undefined;
    deleted = Boolean(
      result?.fileList?.some((item) => item.fileID === entry.fileId && Number(item.status) === 0),
    );
  } catch {
    // Fall through to the durable orphan report below.
  }
  if (deleted) return;
  try {
    await reportOrphan(entry);
  } catch {
    const entries = readOrphanLedger();
    if (!entries.some((item) => item.fileId === entry.fileId)) entries.push(entry);
    saveOrphanLedger(entries);
  }
}

Page({
  avatarReadinessRequestId: 0,
  avatarPreviewRequestId: 0,
  mediaErrorRevision: 0,
  mediaErrorStage: '',
  data: {
    loading: true,
    error: '',
    p: null as Profile | null,
    saving: false,
    avatarBusy: false,
    photoBusy: false,
    mediaError: '',
    avatarPreviewUrl: '',
    stravaAvatarReady: false,
    stravaAvatarHint: '先绑定/同步 Strava',
    stravaAvatarError: '',
    uploadHint: '照片将上传到云存储；请在真机确认文件权限和存储规则。',
  },
  async onLoad() {
    await retryOrphanLedger();
    const state = await runPageTask(() => rideService.getProfile(), '资料加载失败');
    this.setData({ loading: false, error: state.error, p: state.data || null });
  },
  async onShow() {
    await Promise.all([this.loadAvatarPreview(), this.loadStravaAvatarReadiness()]);
  },
  onHide() {
    this.avatarReadinessRequestId += 1;
    this.avatarPreviewRequestId += 1;
  },
  onUnload() {
    this.avatarReadinessRequestId += 1;
    this.avatarPreviewRequestId += 1;
  },
  async loadAvatarPreview() {
    const requestId = ++this.avatarPreviewRequestId;
    const errorRevision = this.mediaErrorRevision;
    const card = await settleBeforeDeadline(
      rideService.getPersonalCapabilityCard(),
      AVATAR_PREVIEW_DEADLINE_MS,
    );
    if (requestId !== this.avatarPreviewRequestId) return;
    if (!card) {
      if (
        this.mediaErrorRevision !== errorRevision ||
        (this.mediaErrorStage && this.mediaErrorStage !== 'preview')
      )
        return;
      this.mediaErrorRevision += 1;
      this.mediaErrorStage = 'preview';
      this.setData({
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
    this.setData(patch);
  },
  async loadStravaAvatarReadiness() {
    const requestId = ++this.avatarReadinessRequestId;
    this.setData({
      stravaAvatarReady: false,
      stravaAvatarHint: '正在检查 Strava 状态',
      stravaAvatarError: '',
    });
    const state = await runPageTask(() => rideService.getStravaReadiness(), 'Strava 状态加载失败');
    if (requestId !== this.avatarReadinessRequestId) return;
    if (!state.data) {
      this.setData({
        stravaAvatarReady: false,
        stravaAvatarHint: 'Strava 状态暂时无法确认',
        stravaAvatarError: state.error || 'Strava 状态加载失败',
      });
      return;
    }
    const connected = state.data?.state === 'ready';
    const ready = connected && state.data.avatarAvailable === true;
    this.setData({
      stravaAvatarReady: ready,
      stravaAvatarHint: ready
        ? '已连接，可导入当前 Strava 头像'
        : connected
          ? 'Strava 未提供头像，请重新授权或同步'
          : '先绑定/同步 Strava',
      stravaAvatarError: '',
    });
  },
  applyAvatarProfile(authoritative: Profile) {
    this.setData({ p: mergeAvatarFields(this.data.p, authoritative) });
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
    this.setData({ ['p.' + e.currentTarget.dataset.k]: e.detail.value });
  },
  async runAvatarAction(action: () => Promise<void>) {
    if (this.data.avatarBusy || this.data.photoBusy || this.data.saving) return;
    this.mediaErrorRevision += 1;
    this.mediaErrorStage = '';
    this.setData({ avatarBusy: true, mediaError: '' });
    try {
      await action();
    } catch (error) {
      if (!isUserCancellation(error)) {
        const detail = mediaFailureDetail(error);
        this.mediaErrorRevision += 1;
        this.mediaErrorStage =
          error &&
          typeof error === 'object' &&
          typeof (error as { mediaStage?: unknown }).mediaStage === 'string'
            ? String((error as { mediaStage: string }).mediaStage)
            : '';
        this.setData({ mediaError: detail });
        wx.showToast({ title: detail, icon: 'none' });
      }
    } finally {
      this.setData({ avatarBusy: false });
    }
  },
  async uploadAndSetAvatar(image: SelectedImage, origin: ClientAvatarSource) {
    const cloud = wx.cloud;
    if (!cloud) throw new Error('cloud unavailable');
    const verifiedImage = await ensureLocalImageSize(image);
    let uploadedFileId = '';
    let selectionDispatched = false;
    try {
      const cloudPath = await atMediaStage('uploadPath', 'MEDIA_UPLOAD_PATH_FAILED', () =>
        rideService.getProfileMediaUploadPath(),
      );
      const uploaded = await atMediaStage('upload', 'MEDIA_UPLOAD_FAILED', () =>
        cloud.uploadFile({ cloudPath, filePath: verifiedImage.path }),
      );
      uploadedFileId = uploaded.fileID;
      await atMediaStage('register', 'MEDIA_REGISTER_FAILED', () =>
        rideService.registerProfileMedia(uploadedFileId, 'other', origin),
      );
      selectionDispatched = true;
      const authoritative = await atMediaStage('setAvatar', 'AVATAR_SET_FAILED', () =>
        rideService.setAvatar(origin, uploadedFileId),
      );
      this.applyAvatarProfile(authoritative);
      await this.loadAvatarPreview();
      wx.showToast({ title: '头像已更新' });
    } catch (error) {
      if (selectionDispatched) {
        const confirmed = await this.reloadAvatarProfile({
          source: origin,
          fileId: uploadedFileId,
        });
        if (confirmed) {
          wx.showToast({ title: '头像已更新' });
          return;
        }
      } else if (uploadedFileId) {
        await compensateUploadedMedia({ fileId: uploadedFileId, category: 'other', origin });
      }
      throw error;
    }
  },
  async chooseWechatAvatar(e: any) {
    const filePath = e?.detail?.avatarUrl;
    if (typeof filePath !== 'string' || !filePath) return;
    await this.runAvatarAction(() => this.uploadAndSetAvatar({ path: filePath }, 'wechat'));
  },
  async chooseCustomAvatar() {
    await this.runAvatarAction(async () => {
      const image = await chooseSingleImage();
      if (image) await this.uploadAndSetAvatar(image, 'custom');
    });
  },
  async importStravaAvatar() {
    if (!this.data.stravaAvatarReady || this.data.avatarBusy) return;
    await this.runAvatarAction(async () => {
      const baseline = await runPageTask(() => rideService.getProfile(), '头像状态刷新失败');
      if (!baseline.data) throw new Error(baseline.error || '头像状态刷新失败');
      this.applyAvatarProfile(baseline.data);
      const beforeAvatarRevision = baseline.data.avatarRevision;
      try {
        const authoritative = await atMediaStage('import', 'STRAVA_AVATAR_IMPORT_FAILED', () =>
          rideService.importStravaAvatar(),
        );
        this.applyAvatarProfile(authoritative);
        await this.loadAvatarPreview();
        wx.showToast({ title: 'Strava 头像已导入' });
      } catch (error) {
        const confirmed = await this.reloadAvatarProfile({
          source: 'strava',
          revisionAfter: beforeAvatarRevision,
        });
        if (confirmed) {
          wx.showToast({ title: 'Strava 头像已导入' });
          return;
        }
        throw error;
      }
    });
  },
  goToStrava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
  avatarPreviewError(event: any) {
    const failedUrl = event?.currentTarget?.dataset?.url;
    if (typeof failedUrl === 'string' && failedUrl === this.data.avatarPreviewUrl) {
      this.setData({ avatarPreviewUrl: '' });
    }
  },
  async addPhoto() {
    // 添加照片加在途锁，避免快速连点触发多次并发上传产生孤立文件或状态错乱。
    if (this.data.photoBusy || this.data.saving || this.data.avatarBusy) return;
    this.mediaErrorRevision += 1;
    this.mediaErrorStage = '';
    this.setData({ photoBusy: true, mediaError: '' });
    let uploadedFileId = '';
    try {
      const cloud = wx.cloud;
      if (!cloud) return wx.showToast({ title: '当前环境不支持云存储', icon: 'none' });
      const image = await chooseSingleImage();
      if (!image) return;
      const verifiedImage = await ensureLocalImageSize(image);
      const cloudPath = await atMediaStage('uploadPath', 'MEDIA_UPLOAD_PATH_FAILED', () =>
        rideService.getProfileMediaUploadPath(),
      );
      const uploaded = await atMediaStage('upload', 'MEDIA_UPLOAD_FAILED', () =>
        cloud.uploadFile({ cloudPath, filePath: verifiedImage.path }),
      );
      uploadedFileId = uploaded.fileID;
      await atMediaStage('register', 'MEDIA_REGISTER_FAILED', () =>
        rideService.registerProfileMedia(uploadedFileId, 'other'),
      );
      const p = this.data.p;
      if (!p) {
        await compensateUploadedMedia({ fileId: uploadedFileId, category: 'other' });
        return;
      }
      p.photos = [...p.photos, { id: uploadedFileId, category: 'other' }];
      this.setData({ p });
    } catch (error) {
      if (isUserCancellation(error)) return;
      if (uploadedFileId) {
        await compensateUploadedMedia({ fileId: uploadedFileId, category: 'other' });
      }
      const detail = mediaFailureDetail(error);
      this.mediaErrorRevision += 1;
      this.mediaErrorStage =
        error &&
        typeof error === 'object' &&
        typeof (error as { mediaStage?: unknown }).mediaStage === 'string'
          ? String((error as { mediaStage: string }).mediaStage)
          : '';
      this.setData({ mediaError: detail });
      wx.showToast({ title: detail, icon: 'none' });
    } finally {
      this.setData({ photoBusy: false });
    }
  },
  async save() {
    if (!this.data.p || this.data.saving || this.data.photoBusy || this.data.avatarBusy) return;
    this.setData({ saving: true, error: '' });
    const p = this.data.p;
    const state = await runPageTask(
      () =>
        rideService.updateProfile({
          nickname: p.nickname,
          gender: p.gender,
          emergencyName: p.emergencyName,
          photos: p.photos,
          realName: p.realName.includes('*') ? undefined : p.realName,
          phone: p.phone.includes('*') ? undefined : p.phone,
          emergencyPhone: p.emergencyPhone.includes('*') ? undefined : p.emergencyPhone,
        }),
      '保存失败',
    );
    this.setData({ saving: false, error: state.error, p: state.data || p });
    if (state.data) wx.showToast({ title: '已安全保存' });
  },
});
