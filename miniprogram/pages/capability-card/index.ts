import { isMock } from '../../repositories/index';
import { rideService } from '../../services/ride-service';
import {
  loadCapabilityCard,
  type CapabilityCardView,
} from '../../services/capability-card-service';
import { runPageTask } from '../../services/page-service';

Page({
  data: {
    loading: true,
    error: '',
    card: null as CapabilityCardView | null,
    isMock,
  },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    const state = await runPageTask(
      () => loadCapabilityCard(rideService),
      '骑行名片暂时无法加载，请稍后重试',
    );
    this.setData({ loading: false, card: state.data || null, error: state.error });
  },
  openStrava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
});
