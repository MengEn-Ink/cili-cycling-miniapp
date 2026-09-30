import { initializeCloud } from './config/cloud-init';
import type { AuthCloudApi } from './services/auth-service';
import { applyTheme } from './services/theme-service';
import { appStore } from './store/app-store';

// 兜底捕获页面未处理的脚本错误与 Promise 拒绝，避免异常被静默吞掉；统一加前缀记录，便于在控制台排查。
function reportRuntimeError(scope: string, error: unknown) {
  console.error(`[此里运行时异常:${scope}]`, error);
}

function warmupIdentity(cloud: AuthCloudApi | undefined) {
  void appStore
    .ensureIdentity(cloud)
    .catch((error: unknown) => reportRuntimeError('identity-warmup', error));
}

App({
  globalData: { store: appStore },
  onLaunch() {
    applyTheme();
    appStore.bootstrap();
    const cloud = initializeCloud(wx.cloud) === 'initialized' ? wx.cloud : undefined;
    if (!appStore.hasFreshIdentityHint()) {
      // 近期已经完成过微信身份验证时，启动阶段不重复预热；预热失败只记录诊断，不让冷启动出现未处理拒绝。
      warmupIdentity(cloud);
    }

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
