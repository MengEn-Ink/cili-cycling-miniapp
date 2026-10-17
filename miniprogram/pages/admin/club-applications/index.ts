import type { ClubApplication, ClubApplicationStatus } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

const FILTERS: { value: ClubApplicationStatus; label: string }[] = [
  { value: 'pending_review', label: '待审批' },
  { value: 'approved', label: '已通过' },
  { value: 'rejected', label: '已驳回' },
];
Page({
  data: {
    filters: FILTERS,
    status: 'pending_review' as ClubApplicationStatus,
    items: [] as ClubApplication[],
    loading: true,
    error: '',
  },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ loading: true, error: '' });
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated' || appStore.role !== 'admin') {
      this.setData({ loading: false, items: [], error: '仅已验证管理员可查看俱乐部申请' });
      return;
    }
    try {
      const items = await rideService.listClubApplications(this.data.status);
      this.setData({ items, loading: false });
    } catch (error) {
      this.setData({
        loading: false,
        items: [],
        error: error instanceof Error ? error.message : '申请列表加载失败',
      });
    }
  },
  filter(e: any) {
    const status = e.currentTarget.dataset.status as ClubApplicationStatus;
    if (status === this.data.status) return;
    this.setData({ status, items: [] });
    void this.load();
  },
  open(e: any) {
    wx.navigateTo({
      url: `/pages/admin/club-application-detail/index?id=${e.currentTarget.dataset.id}`,
    });
  },
});
