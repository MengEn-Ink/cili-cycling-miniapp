import { APP_APPEARANCE } from '../config/theme';

const tabs = ['activities', 'registrations', 'profile'] as const;

let applying = false;
let applied = false;
let failedInFlight = false;
let retryRequested = false;

function safePlatformCall(
  name: string,
  options: Record<string, unknown>,
  onSettled: (succeeded: boolean) => void,
): void {
  try {
    const api = typeof wx === 'undefined' ? undefined : wx[name];
    if (typeof api !== 'function') {
      onSettled(true);
      return;
    }
    api.call(wx, {
      ...options,
      success: () => onSettled(true),
      fail: () => onSettled(false),
    });
  } catch {
    onSettled(false);
  }
}

export function applyAppAppearance(): void {
  if (applying) {
    if (failedInFlight) retryRequested = true;
    return;
  }
  if (applied) return;

  applying = true;
  failedInFlight = false;
  let remaining = tabs.length + 3;
  let failed = false;

  const onSettled = (succeeded: boolean) => {
    failed ||= !succeeded;
    failedInFlight = failed;
    remaining -= 1;
    if (remaining > 0) return;

    applying = false;
    failedInFlight = false;
    applied = !failed;
    const shouldRetry = retryRequested;
    retryRequested = false;
    if (shouldRetry) applyAppAppearance();
  };

  safePlatformCall('setNavigationBarColor', APP_APPEARANCE.navigation, onSettled);
  safePlatformCall('setTabBarStyle', APP_APPEARANCE.tabBar, onSettled);
  tabs.forEach((name, index) => {
    safePlatformCall(
      'setTabBarItem',
      {
        index,
        iconPath: `assets/tabbar/${name}-light.png`,
        selectedIconPath: `assets/tabbar/${name}-active.png`,
      },
      onSettled,
    );
  });
  safePlatformCall('setBackgroundColor', APP_APPEARANCE.background, onSettled);
}
