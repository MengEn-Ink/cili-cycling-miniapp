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
    avatarSources: [
      { label: '微信头像', value: 'wechat' },
      { label: 'Strava 头像', value: 'strava' },
    ],
    uploadHint: '照片将上传到云存储；请在真机确认文件权限和存储规则。',
  },
  async onLoad() {
    await retryOrphanLedger();
    const state = await runPageTask(() => rideService.getProfile(), '资料加载失败');
    this.setData({ loading: false, error: state.error, p: state.data || null });
  },
  set(e: any) {
    this.setData({ ['p.' + e.currentTarget.dataset.k]: e.detail.value });
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
      const uploaded = await cloud.uploadFile({
        cloudPath,
        filePath: path,
      });
      uploadedFileId = uploaded.fileID;
      await rideService.registerProfileMedia(uploadedFileId, 'other');
      const p = this.data.p;
      p.photos = [...p.photos, { id: uploadedFileId, category: 'other' }];
      this.setData({ p });
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
          // Fall through to the durable orphan report below.
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
      wx.showToast({ title: '照片上传未完成，请检查真机权限与云存储配置', icon: 'none' });
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
          avatarSource: p.avatarSource,
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
