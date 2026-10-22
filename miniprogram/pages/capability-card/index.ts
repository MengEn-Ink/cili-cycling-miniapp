// 保留已注册的旧地址；本人头像和背景在「我的」统一展示。
export {};

Page({
  data: { error: '' },
  onShow() {
    this.openProfile();
  },
  openProfile() {
    this.setData({ error: '' });
    wx.switchTab({
      url: '/pages/profile/index',
      success: () => this.setData({ error: '' }),
      fail: () => this.setData({ error: '暂时无法打开我的页面，请重试' }),
    });
  },
});
