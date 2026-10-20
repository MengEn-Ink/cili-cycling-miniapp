import type { SoleClubHome } from '../../../models';
import { rideService } from '../../../services/ride-service';
import { appStore } from '../../../store/app-store';

// 单俱乐部裁决：本页只渲染全平台唯一俱乐部的只读主页。
// loading 骨架 / error 可重试 / home 有俱乐部 / empty 空库（管理员可见创建入口）。
type CenterMode = 'loading' | 'error' | 'home' | 'empty';

Page({
  loadToken: 0,
  unloaded: false,
  isCurrent(token: number) {
    return !this.unloaded && this.loadToken === token;
  },
  data: {
    mode: 'loading' as CenterMode,
    club: null as SoleClubHome | null,
    avatarInitial: '俱',
    avatarFailed: false,
    coverFailed: false,
    isAdmin: false,
    loadError: '',
  },
  onShow() {
    this.unloaded = false;
    void this.load();
  },
  onUnload() {
    this.unloaded = true;
    this.loadToken += 1;
  },
  async load() {
    const token = ++this.loadToken;
    // 保留结构稳定的骨架，弱网或从编辑页返回时不闪烁旧状态。
    this.setData({
      mode: 'loading',
      loadError: '',
      avatarFailed: false,
      coverFailed: false,
    });
    try {
      await appStore.ensureIdentity(wx.cloud);
      if (!this.isCurrent(token)) return;
      if (appStore.authStatus !== 'authenticated') {
        this.setData({
          mode: 'error',
          club: null,
          isAdmin: false,
          loadError: '请先完成微信登录后再进入俱乐部主页',
        });
        return;
      }
      const isAdmin = appStore.role === 'admin';
      const snapshot = await rideService.getSoleClubHome();
      if (!this.isCurrent(token)) return;
      if (snapshot.exists) {
        const club = snapshot.club;
        this.setData({
          mode: 'home',
          club,
          avatarInitial: Array.from(club.name.trim())[0] || '俱',
          isAdmin,
          loadError: '',
        });
      } else {
        // 空库：普通骑友看到中性空态；平台管理员看到“创建唯一俱乐部”入口。
        this.setData({ mode: 'empty', club: null, isAdmin, loadError: '' });
      }
    } catch (error) {
      if (!this.isCurrent(token)) return;
      this.setData({
        mode: 'error',
        club: null,
        loadError: error instanceof Error ? error.message : '俱乐部主页加载失败',
      });
    }
  },
  retry() {
    return this.load();
  },
  avatarError() {
    if (!this.data.avatarFailed) this.setData({ avatarFailed: true });
  },
  coverError() {
    if (!this.data.coverFailed) this.setData({ coverFailed: true });
  },
  openActivities() {
    wx.switchTab({ url: '/pages/activities/index' });
  },
  editClub() {
    if (!this.data.club?.canManage) return;
    // 编辑态由 #321 重构后的管理页承载，路由参数与其保持一致。
    wx.navigateTo({ url: '/pages/admin/club-application-detail/index?mode=edit' });
  },
  createClub() {
    if (!this.data.isAdmin) return;
    // 空库 bootstrap 态与管理端“创建唯一俱乐部”入口指向同一页面与参数。
    wx.navigateTo({ url: '/pages/admin/club-application-detail/index?mode=bootstrap' });
  },
});
