import type { PersonalCapabilityCard } from '../../models/index';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { personalCardViewModel } from '../../utils/personal-card';

Page({
  data: {
    loading: true,
    error: '',
    card: null as ReturnType<typeof personalCardViewModel> | null,
  },
  async onLoad() {
    await this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    const result = await runPageTask(
      () => rideService.getPersonalCapabilityCard(),
      '骑行名片暂时无法加载',
    );
    this.setData({
      loading: false,
      error: result.error,
      card: result.data ? personalCardViewModel(result.data as PersonalCapabilityCard) : null,
    });
  },
  repairStrava() {
    if (this.data.card?.needsStravaRepair) wx.navigateTo({ url: '/pages/strava/index' });
  },
  completeProfile() {
    if (this.data.card?.needsProfilePhoto) wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
