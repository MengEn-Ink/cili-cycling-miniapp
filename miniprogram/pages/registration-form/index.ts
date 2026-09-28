import { rideService } from '../../services/ride-service';
import { validateRegistration } from '../../utils/validation';
Page({
  data: {
    activityId: '',
    profile: null as any,
    bikeMode: '自带车',
    experience: '常骑',
    remark: '',
    stravaStatus: 'connected',
    errors: [] as string[],
    submitting: false,
  },
  async onLoad(q: any) {
    this.setData({ activityId: q.id || 'forest', profile: await rideService.getProfile() });
  },
  set(e: any) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  async submit() {
    const errors = validateRegistration(this.data as any);
    if (errors.length) return this.setData({ errors });
    this.setData({ submitting: true });
    try {
      const x = await rideService.saveRegistration(this.data);
      wx.redirectTo({ url: '/pages/credential/index?id=' + x.id });
    } finally {
      this.setData({ submitting: false });
    }
  },
  strava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
});
