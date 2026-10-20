import { repositoryCache } from '../../repositories/index';
import type { PersonalCapabilityCard } from '../../models/index';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { personalCardViewModel } from '../../utils/personal-card';

type PersonalCardView = ReturnType<typeof personalCardViewModel>;

Page({
  loadRequestId: 0,
  mediaRetryKeys: new Set<string>(),
  data: {
    loading: true,
    error: '',
    card: null as PersonalCardView | null,
    avatarFailed: false,
    // 媒体语义色取自设计契约 --color-media-muted / --color-on-media（swiper 属性不支持 CSS 变量）。
    colorMediaMuted: '#d4d4d4',
    colorOnMedia: '#ffffff',
  },
  async onShow() {
    this.mediaRetryKeys.clear();
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
      avatarFailed: false,
      card: result.data ? personalCardViewModel(result.data as PersonalCapabilityCard) : null,
    });
    return !result.error;
  },
  avatarError() {
    if (this.data.avatarFailed) return;
    this.setData({ avatarFailed: true });
  },
  backgroundLoad() {
    // 每个图片槽位在一次页面生命周期内最多自动重试一次；再次进入页面时 onShow 重置。
  },
  async backgroundError(event: {
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
    const retryKey = `background:${matchingIndex}`;
    const requestId = this.loadRequestId;
    if (failedUrl && !this.mediaRetryKeys.has(retryKey)) {
      this.mediaRetryKeys.add(retryKey);
      repositoryCache.invalidateProfiles();
      const result = await runPageTask(
        () => rideService.getPersonalCapabilityCard(),
        '骑行名片照片暂时无法加载',
      );
      if (requestId !== this.loadRequestId) return;
      const refreshedCard = result.data
        ? personalCardViewModel(result.data as PersonalCapabilityCard)
        : null;
      if (refreshedCard) {
        const refreshedUrl = refreshedCard.backgrounds[matchingIndex]?.url || '';
        if (refreshedUrl && refreshedUrl !== failedUrl) {
          this.setData({ error: '', card: refreshedCard });
          return;
        }
      }
    }
    const retainedBackgrounds = card.backgrounds.filter(
      (_: PersonalCardView['backgrounds'][number], index: number) => index !== matchingIndex,
    );
    const backgrounds = retainedBackgrounds.length
      ? retainedBackgrounds
      : card.avatarUrl
        ? [{ url: card.avatarUrl, source: 'avatar' as const, category: 'avatar' }]
        : [];
    this.setData({
      card: {
        ...card,
        backgrounds,
        hasBackgrounds: backgrounds.length > 0,
        hasMultipleBackgrounds: backgrounds.length > 1,
        needsProfilePhoto: !retainedBackgrounds.some(
          (background: PersonalCardView['backgrounds'][number]) =>
            background.source === 'user_photo',
        ),
      },
    });
  },
  completeProfile() {
    if (this.data.card?.needsProfilePhoto) wx.navigateTo({ url: '/pages/profile-edit/index' });
  },
});
