import type { StravaReadiness } from '../../models';
import { runPageTask } from '../../services/page-service';
import { rideService } from '../../services/ride-service';
import { invalidateProfilePageCache } from '../../utils/profile-page-cache';
import { encodeQrCode } from '../../utils/qrcode';
import { planQrRender, drawQrCode } from '../../utils/qrcode-canvas';
import {
  pollStravaAuthorization,
  pollStravaReadiness,
  stravaReadinessMessage,
  stravaSnapshotMeta,
} from '../../services/strava-readiness-service';

interface StravaQrCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): {
    fillStyle: string;
    fillRect(x: number, y: number, w: number, h: number): void;
  };
}

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

function showBrowserGuide(): Promise<void> {
  return new Promise((resolve) => {
    wx.showModal({
      title: '扫码完成 Strava 授权',
      content:
        '请点「保存二维码到相册」，再用微信或相机扫描保存的二维码，在系统浏览器完成 Strava 授权。完成后返回微信，本页会自动同步。二维码将在 10 分钟后失效。',
      confirmText: '我知道了',
      showCancel: false,
      success: () => resolve(),
      fail: () => resolve(),
    });
  });
}

Page({
  loadRequestId: 0,
  qrCanvas: null as StravaQrCanvas | null,
  data: {
    loading: true,
    error: '',
    readiness: null as StravaReadiness | null,
    readinessMessage: '',
    snapshotMeta: stravaSnapshotMeta(null),
    busyAction: null as null | 'connect' | 'retry' | 'disconnect' | 'refresh' | 'save',
    reauthorize: false,
    authorizationUrl: '',
    manualAuthorization: false,
    qrReady: false,
  },
  onLoad(options: Record<string, string>) {
    this.setData({ reauthorize: options.reauthorize === '1' });
  },
  onShow() {
    void this.load();
  },
  onHide() {
    this.loadRequestId += 1;
  },
  onUnload() {
    this.loadRequestId += 1;
  },
  renderAuthorizationQr() {
    const url = this.data.authorizationUrl;
    if (!url) return;
    this.setData({ qrReady: false });
    let code;
    try {
      code = encodeQrCode(url, 'M');
    } catch {
      // 编码失败时保留错误提示；授权仅支持扫码，无复制兜底。
      this.setData({ qrReady: false, error: '二维码生成失败，请点击「刷新二维码」重试。' });
      return;
    }
    wx.createSelectorQuery()
      .in(this)
      .select('#strava-auth-qr')
      .fields({ node: true, size: true })
      .exec((result: Array<{ node?: StravaQrCanvas; width: number; height: number }>) => {
        const target = result?.[0];
        const canvas = target?.node;
        if (!canvas || !target.width || !target.height) return;
        const ratio = wx.getWindowInfo?.().pixelRatio || wx.getSystemInfoSync?.().pixelRatio || 1;
        const plan = planQrRender(code, target.width, ratio);
        canvas.width = plan.pixelSize;
        canvas.height = plan.pixelSize;
        drawQrCode(canvas.getContext('2d'), code, plan);
        this.qrCanvas = canvas;
        this.setData({ qrReady: true });
      });
  },
  async saveAuthorizationQr() {
    if (this.data.busyAction || !this.data.qrReady || !this.qrCanvas) return;
    this.setData({ busyAction: 'save', error: '' });
    try {
      const canvas = this.qrCanvas;
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          success: (res: { tempFilePath: string }) => resolve(res.tempFilePath),
          fail: reject,
        });
      });
      await new Promise<void>((resolve, reject) => {
        wx.saveImageToPhotosAlbum({
          filePath: tempFilePath,
          success: () => resolve(),
          fail: reject,
        });
      });
      wx.showToast({ title: '二维码已保存到相册', icon: 'success' });
    } catch (error) {
      const message = (error as { errMsg?: string } | undefined)?.errMsg || '';
      if (message.includes('auth deny') || message.includes('authorize')) {
        // 相册写入权限被拒：引导去系统设置手动开启，而非反复静默失败。
        wx.showModal({
          title: '需要相册权限',
          content: '保存二维码需要相册写入权限，请在设置中开启后重试。',
          confirmText: '去设置',
          cancelText: '取消',
          success: (res: { confirm: boolean }) => {
            if (res.confirm) wx.openSetting?.({});
          },
        });
      } else {
        this.setData({ error: '二维码保存失败，请重试，或直接扫描屏幕上的二维码。' });
      }
    } finally {
      this.setData({ busyAction: null });
    }
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
    this.setData({
      loading: false,
      ...(readiness.state === 'authorizing'
        ? {}
        : { authorizationUrl: '', manualAuthorization: false }),
    });
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
      const authorizationUrl = state.data.authorizationUrl;
      // 授权仅支持扫码：把一次性授权链接渲染成二维码，用户扫码到系统浏览器完成授权。
      this.setData({ authorizationUrl, manualAuthorization: true }, () => {
        this.renderAuthorizationQr();
      });
      if (requestId !== this.loadRequestId) return;
      await showBrowserGuide();
      if (requestId !== this.loadRequestId) return;
      const currentState = this.data.readiness?.state;
      // 一次性 state 只由回调消费或到期失效；关闭提示不能撤销，否则刚生成的二维码会立即失效。
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
  async refreshAuthorizationQr() {
    if (this.data.busyAction) return;
    const requestId = this.loadRequestId;
    this.setData({ busyAction: 'refresh', error: '' });
    try {
      // 「刷新二维码」必须创建新的 OAuth state，不能继续使用已消费或已过期的旧链接。
      const state = await runPageTask(
        () => rideService.startStrava(),
        '无法刷新 Strava 授权二维码',
      );
      if (requestId !== this.loadRequestId) return;
      if (!state.data) {
        this.setData({ error: state.error });
        return;
      }
      const authorizationUrl = state.data.authorizationUrl;
      this.setData({ authorizationUrl, manualAuthorization: true }, () => {
        this.renderAuthorizationQr();
      });
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
    // 授权状态超时说明 OAuth 是否成功仍未知，必须先重查服务端状态，不能误走数据准备接口。
    if (this.data.readiness?.error?.code === 'STRAVA_AUTH_STATUS_TIMEOUT') {
      await this.load();
      return;
    }
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
