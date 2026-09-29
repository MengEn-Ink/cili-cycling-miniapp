import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import {
  pollStravaReadiness,
  stravaReadinessMessage,
} from '../../services/strava-readiness-service';

function disconnectedReadiness(): StravaReadiness {
  return {
    state: 'disconnected',
    canRegister: false,
    athleteName: null,
    snapshot: null,
    error: null,
  };
}

function confirmDisconnect(): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '确认解绑 Strava',
      content: '解绑后将无法提交新的活动报名，已提交记录不受影响。',
      confirmText: '确认解绑',
      success: (result: { confirm: boolean }) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

Page({
  data: {
    loading: true,
    error: '',
    readiness: null as StravaReadiness | null,
    readinessMessage: '',
    busyAction: null as null | 'connect' | 'retry' | 'disconnect',
  },
  onShow() {
    void this.load();
  },
  setReadiness(readiness: StravaReadiness) {
    this.setData({ readiness, readinessMessage: stravaReadinessMessage(readiness) });
  },
  async load() {
    this.setData({ loading: true, error: '' });
    const status = await runPageTask(() => rideService.getStravaReadiness(), 'Strava 状态加载失败');
    if (!status.data) {
      this.setData({ loading: false, error: status.error });
      return;
    }

    let readiness = status.data;
    if (readiness.state === 'syncing' || readiness.state === 'failed') {
      const prepared = await runPageTask(
        () => pollStravaReadiness(() => rideService.ensureStravaReady()),
        'Strava 数据准备失败',
      );
      if (!prepared.data) {
        this.setData({ loading: false, error: prepared.error });
        return;
      }
      readiness = prepared.data;
    }
    this.setReadiness(readiness);
    this.setData({ loading: false });
  },
  async connect() {
    if (this.data.busyAction) return;
    this.setData({ busyAction: 'connect', error: '' });
    try {
      const state = await runPageTask(() => rideService.startStrava(), '无法发起 Strava 授权');
      this.setData({ error: state.error });
      if (state.data) {
        wx.navigateTo({
          url: '/pages/strava-webview/index?url=' + encodeURIComponent(state.data.authorizationUrl),
        });
      }
    } finally {
      this.setData({ busyAction: null });
    }
  },
  async retry() {
    if (this.data.busyAction) return;
    this.setData({ busyAction: 'retry', error: '' });
    try {
      const state = await runPageTask(
        () => pollStravaReadiness(() => rideService.ensureStravaReady()),
        'Strava 数据准备失败',
      );
      if (state.data) this.setReadiness(state.data);
      this.setData({ error: state.error });
    } finally {
      this.setData({ busyAction: null });
    }
  },
  async disconnect() {
    if (this.data.busyAction) return;
    this.setData({ busyAction: 'disconnect', error: '' });
    try {
      if (!(await confirmDisconnect())) return;
      const state = await runPageTask(() => rideService.disconnectStrava(), '解绑失败');
      this.setData({ error: state.error });
      if (!state.error) this.setReadiness(disconnectedReadiness());
    } finally {
      this.setData({ busyAction: null });
    }
  },
});
