import { runtimeConfig } from '../../config/runtime';

const ROUTE_ID_PATTERN = /^[1-9]\d{0,19}$/;

Page({
  data: {
    src: '',
    officialUrl: '',
    failed: false,
  },
  onLoad(query: Record<string, unknown>) {
    const routeId = typeof query.id === 'string' && ROUTE_ID_PATTERN.test(query.id) ? query.id : '';
    if (!routeId) {
      this.setData({ failed: true });
      return;
    }
    this.setData({
      src: `${runtimeConfig.routeEmbedOrigin}/route/embed?id=${encodeURIComponent(routeId)}`,
      officialUrl: `https://www.strava.com/routes/${routeId}`,
      failed: false,
    });
  },
  routeLoaded() {
    if (this.data.failed) this.setData({ failed: false });
  },
  routeFailed(error: unknown) {
    console.error('[route-view] 官方路线页面加载失败', error);
    this.setData({ failed: true });
  },
  copyRouteUrl() {
    const officialUrl = this.data.officialUrl;
    if (!officialUrl) return;
    wx.setClipboardData({
      data: officialUrl,
      success: () => wx.showToast({ title: '路线链接已复制', icon: 'success' }),
      fail: (error: unknown) => {
        console.error('[route-view] 路线链接复制失败', error);
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' });
      },
    });
  },
  goBack() {
    wx.navigateBack({
      delta: 1,
      fail: () => wx.switchTab({ url: '/pages/activities/index' }),
    });
  },
});
