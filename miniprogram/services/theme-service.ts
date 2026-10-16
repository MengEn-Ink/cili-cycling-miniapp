const APPEARANCE = {
  navigation: { backgroundColor: '#fbf5ea', frontColor: '#000000' },
  tabBar: {
    backgroundColor: '#ffffff',
    borderStyle: 'white',
    color: '#6f675d',
    selectedColor: '#211f1c',
  },
  background: {
    backgroundColor: '#fbf5ea',
    backgroundColorTop: '#fbf5ea',
    backgroundColorBottom: '#fbf5ea',
  },
} as const;

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

  safePlatformCall('setNavigationBarColor', APPEARANCE.navigation, onSettled);
  safePlatformCall('setTabBarStyle', APPEARANCE.tabBar, onSettled);
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
  safePlatformCall('setBackgroundColor', APPEARANCE.background, onSettled);
}
