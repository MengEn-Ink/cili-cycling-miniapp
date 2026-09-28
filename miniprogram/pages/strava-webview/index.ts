Page({
  data: { url: '' },
  onLoad(query: any) {
    let url = '';
    try {
      url = decodeURIComponent(query.url || '');
    } catch {
      url = '';
    }
    if (!url.startsWith('https://')) {
      wx.showModal({
        title: '授权地址不可用',
        content: '请先配置并部署 Strava HTTP callback 路由。',
        showCancel: false,
      });
      return;
    }
    this.setData({ url });
  },
});
