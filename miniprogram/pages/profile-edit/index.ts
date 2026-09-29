import { rideService } from '../../services/ride-service';
import { runPageTask } from '../../services/page-service';
import type { Profile } from '../../models';
Page({
  data: {
    loading: true,
    error: '',
    p: null as Profile | null,
    saving: false,
    uploadHint: '照片将上传到云存储；请在真机确认文件权限和存储规则。',
  },
  async onLoad() {
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
        try {
          await wx.cloud.deleteFile({ fileList: [uploadedFileId] });
        } catch {
          // Unreferenced media records carry cleanup_after for server-side reclamation.
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
