import type { PersonalCapabilityCard } from '../../models/index';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import { personalCardViewModel } from '../../utils/personal-card';

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

Page({
  loadRequestId: 0,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    loading: true,
    error: '',
    card: null as PersonalCardView | null,
  },
  async onShow() {
    syncPageTheme(this);
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
    if (requestId !== this.loadRequestId) return;
    this.setData({
      loading: false,
      error: result.error,
      card: result.data ? personalCardViewModel(result.data as PersonalCapabilityCard) : null,
    });
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
  repairStrava() {
    if (this.data.card?.needsStravaRepair) wx.navigateTo({ url: '/pages/strava/index' });
  },
  completeProfile() {
    if (this.data.card?.needsProfilePhoto) wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
