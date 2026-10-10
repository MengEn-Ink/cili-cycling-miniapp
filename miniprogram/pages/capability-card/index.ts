import type { PersonalCapabilityCard } from '../../models/index';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { personalCardViewModel } from '../../utils/personal-card';

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

Page({
  loadRequestId: 0,
  data: {
    loading: true,
    error: '',
    syncing: false,
    card: null as PersonalCardView | null,
  },
  async onShow() {
    await this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  async load() {
    const requestId = ++this.loadRequestId;
    this.setData({ loading: true, error: '' });
    const result = await runPageTask(
      () => rideService.getPersonalCapabilityCard(),
      '骑行名片暂时无法加载',
    );
    if (requestId !== this.loadRequestId) return false;
    this.setData({
      loading: false,
      error: result.error,
      card: result.data ? personalCardViewModel(result.data as PersonalCapabilityCard) : null,
    });
    return !result.error;
  },
  backgroundError(event: {
    currentTarget: { dataset: { index?: number | string; url?: string } };
  }) {
    const card = this.data.card as PersonalCardView | null;
    if (!card) return;
    const failedUrl = event.currentTarget.dataset.url;
    const reportedIndex = Number(event.currentTarget.dataset.index);
    const matchingIndex =
      Number.isInteger(reportedIndex) && card.backgrounds[reportedIndex]?.url === failedUrl
        ? reportedIndex
        : card.backgrounds.findIndex(
            (background: PersonalCardView['backgrounds'][number]) => background.url === failedUrl,
          );
    if (matchingIndex < 0) return;
    const backgrounds = card.backgrounds.filter(
      (_: PersonalCardView['backgrounds'][number], index: number) => index !== matchingIndex,
    );
    this.setData({
      card: {
        ...card,
        backgrounds,
        hasBackgrounds: backgrounds.length > 0,
        hasMultipleBackgrounds: backgrounds.length > 1,
        needsProfilePhoto: backgrounds.length === 0,
      },
    });
  },
  async refreshStrava() {
    if (this.data.syncing || !this.data.card?.canSyncStrava) return;
    this.setData({ syncing: true });
    const result = await runPageTask(() => rideService.syncStrava(), 'Strava 数据同步失败');
    if (result.error) {
      this.setData({ syncing: false });
      wx.showToast({ title: result.error, icon: 'none' });
      return;
    }
    const readiness = result.data;
    if (!readiness || readiness.state !== 'ready') {
      await this.load();
      this.setData({ syncing: false });
      const message =
        readiness?.state === 'syncing'
          ? 'Strava 数据正在同步，请稍后刷新'
          : readiness?.error?.message || 'Strava 数据同步失败';
      wx.showToast({ title: message, icon: 'none' });
      return;
    }
    const loaded = await this.load();
    this.setData({ syncing: false });
    wx.showToast({
      title: loaded ? 'Strava 数据已更新' : '数据已同步，但骑行名片刷新失败',
      icon: loaded ? 'success' : 'none',
    });
  },
  openStravaProfile() {
    const url = this.data.card?.stravaProfileUrl;
    if (!url) return;
    // 微信小程序不支持稳定唤起任意第三方 App；复制 HTTPS 主页链接可避免无反馈或死链。
    wx.setClipboardData({
      data: url,
      success: () =>
        wx.showModal({
          title: 'Strava 主页链接已复制',
          content: '请前往系统浏览器粘贴打开；若已安装 Strava，可继续由浏览器唤起。',
          showCancel: false,
          confirmText: '知道了',
        }),
      fail: () => wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' }),
    });
  },
  repairStrava() {
    if (this.data.card?.needsStravaRepair) wx.navigateTo({ url: '/pages/strava/index' });
  },
  completeProfile() {
    if (this.data.card?.needsProfilePhoto) wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
