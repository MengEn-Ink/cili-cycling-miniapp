import { rideService } from '../../services/ride-service';
import { runPageTask } from '../../services/page-service';
import type { Profile } from '../../models';
const ORPHAN_LEDGER_KEY = 'profile-media-orphans-v1';
type MediaOrphan = { fileId: string; category: 'other' };

function readOrphanLedger(): MediaOrphan[] {
  try {
    const value = wx.getStorageSync(ORPHAN_LEDGER_KEY);
    return Array.isArray(value)
      ? value.filter(
          (item): item is MediaOrphan =>
            item && typeof item.fileId === 'string' && item.category === 'other',
        )
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

Page({
  data: {
    loading: true,
    error: '',
    p: null as Profile | null,
    saving: false,
    uploadHint: '照片将上传到云存储；请在真机确认文件权限和存储规则。',
    avatarSourceOptions: [
      { value: 'wechat', label: '微信头像' },
      { value: 'strava', label: 'Strava 头像' },
    ],
    avatarSourceIndex: 0,
  },
  async onLoad() {
    await retryOrphanLedger();
    const state = await runPageTask(() => rideService.getProfile(), '资料加载失败');
    const p = state.data || null;
    this.setData({
      loading: false,
      error: state.error,
      p,
      avatarSourceIndex: p?.avatarSource === 'strava' ? 1 : 0,
    });
  },
  set(e: any) {
    this.setData({ ['p.' + e.currentTarget.dataset.k]: e.detail.value });
  },
  setAvatarSource(e: { detail: { value: string | number } }) {
    const p = this.data.p;
    if (!p) return;
    const index = Number(e.detail.value) === 1 ? 1 : 0;
    const source = this.data.avatarSourceOptions[index].value;
    this.setData({ avatarSourceIndex: index, p: { ...p, avatarSource: source } });
  },
  async uploadProfileMedia(filePath: string) {
    let uploadedFileId = '';
    try {
      const cloud = wx.cloud;
      if (!cloud) {
        wx.showToast({ title: '当前环境不支持云存储', icon: 'none' });
        return '';
      }
      const cloudPath = await rideService.getProfileMediaUploadPath();
      const uploaded = await cloud.uploadFile({
        cloudPath,
        filePath,
      });
      uploadedFileId = uploaded.fileID;
      await rideService.registerProfileMedia(uploadedFileId, 'other');
      return uploadedFileId;
    } catch {
      if (uploadedFileId && wx.cloud) {
        let deleted = false;
        try {
          const result = (await wx.cloud.deleteFile({ fileList: [uploadedFileId] })) as {
            fileList?: { fileID?: string; status?: number }[];
          };
          deleted = Boolean(
            result?.fileList?.some(
              (item) => item.fileID === uploadedFileId && Number(item.status) === 0,
            ),
          );
        } catch {
          // 删除失败会进入持久化孤儿账本，后续打开资料页继续上报清理。
        }
        if (!deleted) {
          const orphan: MediaOrphan = { fileId: uploadedFileId, category: 'other' };
          try {
            await reportOrphan(orphan);
          } catch {
            const entries = readOrphanLedger();
            if (!entries.some((item) => item.fileId === orphan.fileId)) entries.push(orphan);
            saveOrphanLedger(entries);
          }
        }
      }
      wx.showToast({ title: '照片上传未完成，请稍后重试', icon: 'none' });
      return '';
    }
  },
  async chooseAvatar(event: { detail?: { avatarUrl?: string } }) {
    const p = this.data.p;
    const path = event.detail?.avatarUrl;
    if (!p || !path) return;
    const avatarId = await this.uploadProfileMedia(path);
    if (!avatarId) return;
    this.setData({ p: { ...p, avatarId, avatarSource: 'wechat' } });
    wx.showToast({ title: '头像已选择，保存后生效' });
  },
  async addPhoto() {
    const p = this.data.p;
    if (!p) return;
    try {
      const cloud = wx.cloud;
      if (!cloud) return wx.showToast({ title: '当前环境不支持云存储', icon: 'none' });
      const choice = await wx.chooseMedia({ count: 1, mediaType: ['image'] });
      const path = choice.tempFiles?.[0]?.tempFilePath;
      if (!path) return;
      const uploadedFileId = await this.uploadProfileMedia(path);
      if (!uploadedFileId) return;
      this.setData({
        p: { ...p, photos: [...p.photos, { id: uploadedFileId, category: 'other' }] },
      });
    } catch {
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
          avatarFileId: p.avatarId,
          avatarSource: p.avatarSource === 'strava' ? 'strava' : 'wechat',
          photos: p.photos,
          realName: p.realName.includes('*') ? undefined : p.realName,
          phone: p.phone.includes('*') ? undefined : p.phone,
          emergencyPhone: p.emergencyPhone.includes('*') ? undefined : p.emergencyPhone,
        }),
      '保存失败',
    );
    // 保存成功后以服务端 DTO 为准；但头像来源是用户刚确认的选择，旧部署回包可能缺该字段，不能被旧值覆盖。
    const savedProfile = state.data
      ? { ...state.data, avatarSource: p.avatarSource ?? state.data.avatarSource }
      : p;
    this.setData({ saving: false, error: state.error, p: savedProfile });
    if (state.data) wx.showToast({ title: '已安全保存' });
  },
});
