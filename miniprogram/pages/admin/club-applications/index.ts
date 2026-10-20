import type { SoleClubProfile } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

type ClubAdminMode = 'loading' | 'error' | 'bootstrap' | 'default';

Page({
  data: {
    mode: 'loading' as ClubAdminMode,
    club: null as SoleClubProfile | null,
    avatarInitial: '俱',
    avatarFailed: false,
    error: '',
  },
  onShow() {
    void this.load();
  },
  async load() {
    this.setData({ mode: 'loading', error: '', avatarFailed: false });
    await appStore.ensureIdentity(wx.cloud);
    if (appStore.authStatus !== 'authenticated' || appStore.role !== 'admin') {
      this.setData({
        mode: 'error',
        club: null,
        error: '仅平台管理员可管理俱乐部资料',
      });
      return;
    }
    try {
      const snapshot = await rideService.getSoleClub();
      if (snapshot.exists) {
        this.setData({
          mode: 'default',
          club: snapshot.club,
          avatarInitial: Array.from(snapshot.club.name.trim())[0] || '俱',
          error: '',
        });
      } else {
        this.setData({ mode: 'bootstrap', club: null, error: '' });
      }
    } catch (error) {
      this.setData({
        mode: 'error',
        club: null,
        error: error instanceof Error ? error.message : '俱乐部资料加载失败',
      });
    }
  },
  create() {
    wx.navigateTo({
      url: '/pages/admin/club-application-detail/index?mode=bootstrap',
    });
  },
  edit() {
    wx.navigateTo({
      url: '/pages/admin/club-application-detail/index?mode=edit',
    });
  },
  avatarError() {
    this.setData({ avatarFailed: true });
  },
});
