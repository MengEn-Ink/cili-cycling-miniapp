import { rideService } from '../../services/ride-service';
import { runPageTask } from '../../services/page-service';
Page({
  data: { loading: true, error: '', connection: null as any, busy: false, routeReady: false },
  onShow() {
    void this.load();
  },
  async load() {
    const state = await runPageTask(() => rideService.getStravaStatus(), 'Strava 状态加载失败');
    this.setData({
      loading: false,
      error: state.error,
      connection: state.data || { connected: false },
    });
  },
  async connect() {
    this.setData({ busy: true, error: '' });
    const state = await runPageTask(() => rideService.startStrava(), '无法发起 Strava 授权');
    this.setData({ busy: false, error: state.error });
    if (state.data)
      wx.navigateTo({
        url: '/pages/strava-webview/index?url=' + encodeURIComponent(state.data.authorizationUrl),
      });
  },
  async sync() {
    this.setData({ busy: true, error: '' });
    const state = await runPageTask(() => rideService.syncStrava(), '同步失败');
    this.setData({
      busy: false,
      error: state.error,
      connection: state.data || this.data.connection,
    });
  },
  async disconnect() {
    const state = await runPageTask(() => rideService.disconnectStrava(), '解绑失败');
    if (!state.error) this.setData({ connection: { connected: false } });
    else this.setData({ error: state.error });
  },
});
