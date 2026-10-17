export interface NavigateToOptions {
  url: string;
  success?: () => void;
  fail?: () => void;
  complete?: () => void;
}

export function createNavigationSingleFlight(
  navigate: (options: NavigateToOptions) => unknown,
  timeoutMs = 8_000,
) {
  let pending = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const release = () => {
    pending = false;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  return {
    run(url: string): boolean {
      if (pending || !url) return false;
      pending = true;
      timer = setTimeout(release, timeoutMs);
      try {
        // success/complete 只表示微信已受理导航，并不代表目标页已完成切换；
        // 成功路径由源页 onHide/onUnload 释放，超时仅防平台不派发生命周期时永久锁死。
        navigate({ url, fail: release });
        return true;
      } catch (error) {
        release();
        throw error;
      }
    },
    release,
    isPending: () => pending,
  };
}
