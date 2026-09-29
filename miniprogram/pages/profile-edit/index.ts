import type { AvatarSource, ClientAvatarSource, Profile } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';

const ORPHAN_LEDGER_KEY = 'profile-media-orphans-v1';
const AVATAR_PREVIEW_DEADLINE_MS = 1_200;
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
  data: {
    loading: true,
    error: '',
    p: null as Profile | null,
    saving: false,
    avatarBusy: false,
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
    const card = await settleBeforeDeadline(
      rideService.getPersonalCapabilityCard(),
      AVATAR_PREVIEW_DEADLINE_MS,
    );
    if (requestId !== this.avatarPreviewRequestId) return;
    this.setData({ avatarPreviewUrl: safeHttpsUrl(card?.profile.avatarUrl) });
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
    const ready = state.data?.state === 'ready';
    this.setData({
      stravaAvatarReady: ready,
      stravaAvatarHint: ready ? '已连接，可导入当前 Strava 头像' : '先绑定/同步 Strava',
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
    if (this.data.avatarBusy) return;
    this.setData({ avatarBusy: true });
    try {
      await action();
    } catch (error) {
      if (!isUserCancellation(error)) {
        wx.showToast({ title: '头像更新失败，请稍后重试', icon: 'none' });
      }
    } finally {
      this.setData({ avatarBusy: false });
    }
  },
  async uploadAndSetAvatar(filePath: string, origin: ClientAvatarSource) {
    const cloud = wx.cloud;
    if (!cloud) throw new Error('cloud unavailable');
    let uploadedFileId = '';
    let selectionDispatched = false;
    try {
      const cloudPath = await rideService.getProfileMediaUploadPath();
      const uploaded = await cloud.uploadFile({ cloudPath, filePath });
      uploadedFileId = uploaded.fileID;
      await rideService.registerProfileMedia(uploadedFileId, 'other', origin);
      selectionDispatched = true;
      const authoritative = await rideService.setAvatar(origin, uploadedFileId);
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
    await this.runAvatarAction(() => this.uploadAndSetAvatar(filePath, 'wechat'));
  },
  async chooseCustomAvatar() {
    await this.runAvatarAction(async () => {
      const choice = await wx.chooseMedia({ count: 1, mediaType: ['image'] });
      const filePath = choice.tempFiles?.[0]?.tempFilePath;
      if (filePath) await this.uploadAndSetAvatar(filePath, 'custom');
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
        const authoritative = await rideService.importStravaAvatar();
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
    let uploadedFileId = '';
    try {
      const cloud = wx.cloud;
      if (!cloud) return wx.showToast({ title: '当前环境不支持云存储', icon: 'none' });
      const choice = await wx.chooseMedia({ count: 1, mediaType: ['image'] });
      const path = choice.tempFiles?.[0]?.tempFilePath;
      if (!path) return;
      const cloudPath = await rideService.getProfileMediaUploadPath();
      const uploaded = await cloud.uploadFile({ cloudPath, filePath: path });
      uploadedFileId = uploaded.fileID;
      await rideService.registerProfileMedia(uploadedFileId, 'other');
      const p = this.data.p;
      if (!p) return;
      p.photos = [...p.photos, { id: uploadedFileId, category: 'other' }];
      this.setData({ p });
    } catch (error) {
      if (isUserCancellation(error)) return;
      if (uploadedFileId) {
        await compensateUploadedMedia({ fileId: uploadedFileId, category: 'other' });
      }
      wx.showToast({ title: '照片上传未完成，请稍后重试', icon: 'none' });
    }
  },
  async save() {
    if (!this.data.p) return;
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
