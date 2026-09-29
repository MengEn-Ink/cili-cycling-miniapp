import { initializeCloud } from './config/cloud-init';
import { appStore } from './store/app-store';

// 兜底捕获页面未处理的脚本错误与 Promise 拒绝，避免异常被静默吞掉；统一加前缀记录，便于在控制台排查。
function reportRuntimeError(scope: string, error: unknown) {
  console.error(`[此里运行时异常:${scope}]`, error);
}

App({
  globalData: { store: appStore },
  onLaunch() {
    appStore.bootstrap();
    const cloud = initializeCloud(wx.cloud) === 'initialized' ? wx.cloud : undefined;
    void appStore.ensureIdentity(cloud);

    // 旧基础库可能缺少对应 API，仅在能力存在时注册，避免注册阶段自身抛出。
    if (typeof wx.onError === 'function') {
      wx.onError((error: unknown) => reportRuntimeError('error', error));
    }
    if (typeof wx.onUnhandledRejection === 'function') {
      wx.onUnhandledRejection((event: { reason?: unknown }) =>
        reportRuntimeError('unhandledrejection', event?.reason ?? event),
      );
    }
  },
});
