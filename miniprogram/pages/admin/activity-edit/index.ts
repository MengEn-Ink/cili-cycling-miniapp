import { appStore } from '../../../store/app-store';
Page({
  data: { allowed: false, message: '正在验证管理员身份' },
  async onLoad() {
    await appStore.refreshIdentity(wx.cloud);
    this.setData({
      allowed: appStore.role === 'admin' && appStore.authStatus === 'authenticated',
      message: '真实云端活动编辑尚未提供后端命令，本页面不会保存或伪造成功。',
    });
  },
});
