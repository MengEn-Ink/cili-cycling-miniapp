import { rideService } from '../../services/ride-service';
import { validateRegistration } from '../../utils/validation';
Page({
  data: {
    activityId: '',
    profile: null as any,
    bikeMode: '自带车',
    experience: '常骑',
    remark: '',
    stravaStatus: 'pending',
    errors: [] as string[],
    submitting: false,
    loading: true,
  },
  async onShow() {
    try {
      const [profile, strava] = await Promise.all([
        rideService.getProfile(),
        rideService.getStravaStatus(),
      ]);
      this.setData({
        profile,
        stravaStatus: strava.connected ? 'connected' : 'pending',
        loading: false,
      });
    } catch (error) {
      this.setData({
        loading: false,
        errors: [error instanceof Error ? error.message : '请先完善资料并绑定 Strava'],
      });
    }
  },
  onLoad(q: any) {
    this.setData({ activityId: q.id || '' });
  },
  set(e: any) {
    this.setData({ [e.currentTarget.dataset.key]: e.detail.value });
  },
  async submit() {
    const errors = validateRegistration(this.data as any);
    if (errors.length) return this.setData({ errors });
    this.setData({ submitting: true, errors: [] });
    try {
      const item = await rideService.saveRegistration(this.data);
      wx.redirectTo({ url: '/pages/credential/index?id=' + item.id });
    } catch (error) {
      this.setData({ errors: [error instanceof Error ? error.message : '提交失败'] });
    } finally {
      this.setData({ submitting: false });
    }
  },
  strava() {
    wx.navigateTo({ url: '/pages/strava/index' });
  },
  profile() {
    wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
