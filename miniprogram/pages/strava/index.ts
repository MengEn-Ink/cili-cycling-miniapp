import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { syncPageTheme } from '../../services/theme-service';
import { invalidateProfilePageCache } from '../../utils/profile-page-cache';
import {
  pollStravaAuthorization,
  pollStravaReadiness,
  stravaReadinessMessage,
  stravaSnapshotMeta,
} from '../../services/strava-readiness-service';

function disconnectedReadiness(): StravaReadiness {
  return {
    state: 'disconnected',
    canRegister: false,
    avatarAvailable: false,
    athleteName: null,
    snapshot: null,
    error: null,
  };
}

function confirmDisconnect(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认解绑 Strava',
      content:
        '这只会断开此里并清理本地 Strava 数据，不会撤销 Strava 网站中的外部授权；已提交记录不受影响。',
      confirmText: '确认解绑',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

function copyAuthorizationUrl(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({ data: url, success: resolve, fail: reject });
  });
}

function showBrowserGuide(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '授权链接已复制',
      content: '请打开系统浏览器，粘贴并访问链接完成 Strava 授权；完成后返回微信，本页会自动同步。',
      confirmText: '我知道了',
      cancelText: '取消授权',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  loadRequestId: 0,
  data: {
    theme: 'dark',
    themeClass: 'theme-dark',
    loading: true,
    error: '',
    readiness: null as StravaReadiness | null,
    readinessMessage: '',
    snapshotMeta: stravaSnapshotMeta(null),
    busyAction: null as null | 'connect' | 'retry' | 'disconnect',
    reauthorize: false,
  },
  onLoad(options: Record<string, string>) {
    this.setData({ reauthorize: options.reauthorize === '1' });
  },
  onShow() {
    syncPageTheme(this);
    void this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  setReadiness(readiness: StravaReadiness) {
    this.setData({
      readiness,
      readinessMessage: stravaReadinessMessage(readiness),
      snapshotMeta: stravaSnapshotMeta(readiness.snapshot),
    });
  },
  async load() {
    const requestId = ++this.loadRequestId;
    if (this.data.busyAction) this.setData({ busyAction: null });
    this.setData({ loading: true, error: '' });
    const status = await runPageTask(() => rideService.getStravaReadiness(), 'Strava 状态加载失败');
    if (requestId !== this.loadRequestId) return;
    if (!status.data) {
      this.setData({ loading: false, error: status.error });
      return;
    }

    let readiness = status.data;
    if (readiness.state === 'authorizing') {
      const authorized = await runPageTask(
        () =>
          pollStravaAuthorization(() => rideService.getStravaReadiness(), {
            isCancelled: () => requestId !== this.loadRequestId,
          }),
        'Strava 授权状态检查失败',
      );
      if (requestId !== this.loadRequestId) return;
      if (!authorized.data) {
        this.setData({ loading: false, error: authorized.error });
        return;
      }
      readiness = authorized.data;
    }
    if (readiness.state === 'syncing') {
      const prepared = await runPageTask(
        () =>
          pollStravaReadiness(() => rideService.ensureStravaReady(), {
            isCancelled: () => requestId !== this.loadRequestId,
          }),
        'Strava 数据准备失败',
      );
      if (requestId !== this.loadRequestId) return;
      if (!prepared.data) {
        this.setData({ loading: false, error: prepared.error });
        return;
      }
      invalidateProfilePageCache();
      readiness = prepared.data;
    }
    this.setReadiness(readiness);
    this.setData({ loading: false });
  },
  async connect() {
    if (this.data.busyAction) return;
    const requestId = this.loadRequestId;
    this.setData({ busyAction: 'connect', error: '' });
    try {
      const state = await runPageTask(() => rideService.startStrava(), '无法发起 Strava 授权');
      if (state.data) invalidateProfilePageCache();
      if (requestId !== this.loadRequestId) return;
      if (!state.data) {
        this.setData({ error: state.error });
        return;
      }
      // 真机 web-view 不能承载未配置为业务域名的 strava.com，授权链接必须交给系统浏览器。
      try {
        await copyAuthorizationUrl(state.data.authorizationUrl);
      } catch {
        if (requestId === this.loadRequestId)
          this.setData({ error: '授权链接复制失败，未开始浏览器授权，请重试。' });
        return;
      }
      if (requestId !== this.loadRequestId) return;
      const confirmed = await showBrowserGuide();
      if (requestId !== this.loadRequestId) return;
      if (!confirmed) {
        const cancelled = await runPageTask(
          () => rideService.cancelStravaAuthorization(),
          '取消授权状态失败',
        );
        if (!cancelled.error) invalidateProfilePageCache();
        if (requestId !== this.loadRequestId) return;
        if (cancelled.error) {
          this.setData({ error: cancelled.error });
          return;
        }
        this.setReadiness(disconnectedReadiness());
        this.setData({ error: '已取消浏览器授权；如需连接，请重新点击授权。' });
        return;
      }
      const currentState = this.data.readiness?.state;
      // modal 回调可能晚于返回微信后的 onShow，只允许同一轮 connect 更新未连接/授权中的旧状态。
      if (
        requestId === this.loadRequestId &&
        (currentState === 'disconnected' || currentState === 'authorizing')
      ) {
        this.setReadiness({ ...disconnectedReadiness(), state: 'authorizing' });
      }
    } finally {
      if (requestId === this.loadRequestId) this.setData({ busyAction: null });
    }
  },
  async retry() {
    if (
      this.data.busyAction ||
      (this.data.readiness?.state === 'failed' &&
        this.data.readiness.error?.recoveryAction !== 'retry')
    )
      return;
    const requestId = ++this.loadRequestId;
    this.setData({ busyAction: 'retry', error: '' });
    try {
      const state = await runPageTask(
        () =>
          pollStravaReadiness(() => rideService.ensureStravaReady(), {
            isCancelled: () => requestId !== this.loadRequestId,
          }),
        'Strava 数据准备失败',
      );
      if (state.data) invalidateProfilePageCache();
      if (state.data && requestId === this.loadRequestId) this.setReadiness(state.data);
      if (requestId === this.loadRequestId) this.setData({ error: state.error });
    } finally {
      if (requestId === this.loadRequestId) this.setData({ busyAction: null });
    }
  },
  contactSupport() {
    wx.showModal({
      title: '联系支持',
      content: 'Strava 服务配置异常，请联系「此里」管理员处理。',
      showCancel: false,
    });
  },
  async disconnect() {
    if (this.data.busyAction) return;
    this.setData({ busyAction: 'disconnect', error: '' });
    try {
      if (!(await confirmDisconnect())) return;
      const state = await runPageTask(() => rideService.disconnectStrava(), '解绑失败');
      this.setData({ error: state.error });
      if (!state.error) {
        invalidateProfilePageCache();
        this.setReadiness(disconnectedReadiness());
      }
    } finally {
      this.setData({ busyAction: null });
    }
  },
});
