import { APP_APPEARANCE } from '../config/theme';
import { APPEARANCE_TOKENS, LIGHT_APPEARANCE, type AppearanceMode } from '../config/appearance';

const STORAGE_KEY = 'cili-appearance';
const tabs = ['activities', 'registrations', 'profile'] as const;
let mode: AppearanceMode | undefined;
let applying = false;
let applied = false;
let retryRequested = false;
const listeners = new Set<() => void>();

export function getAppearance(): AppearanceMode {
  if (!mode) {
    try {
      mode = wx.getStorageSync(STORAGE_KEY) === 'light' ? 'light' : 'dark';
    } catch {
      mode = 'dark';
    }
  }
  return mode;
}

function appearanceData() {
  const appearanceMode = getAppearance();
  const appearanceStyle = Object.entries(APPEARANCE_TOKENS[appearanceMode])
    .map(([name, value]) => `${name}:${value}`)
    .join(';');
  return { appearanceMode, appearanceStyle };
}

/** Fail closed on storage errors: do not report a preference that was not saved. */
export function setAppearance(value: AppearanceMode): boolean {
  if (value !== 'light' && value !== 'dark') return false;
  try {
    wx.setStorageSync(STORAGE_KEY, value);
  } catch {
    return false;
  }
  mode = value;
  applied = false;
  listeners.forEach((update) => update());
  applyAppAppearance();
  return true;
}

function safePlatformCall(
  name: string,
  options: Record<string, unknown>,
  onSettled: (succeeded: boolean) => void,
): void {
  let settled = false;
  const settle = (succeeded: boolean) => {
    if (settled) return;
    settled = true;
    onSettled(succeeded);
  };
  try {
    const api = typeof wx === 'undefined' ? undefined : wx[name];
    if (typeof api !== 'function') {
      settle(true);
      return;
    }
    api.call(wx, { ...options, success: () => settle(true), fail: () => settle(false) });
  } catch {
    settle(false);
  }
}

/** Navigation/background are page-scoped: reapply on every page show, not just app launch. */
export function applyAppAppearance(force = false): void {
  if (force) applied = false;
  if (applying) {
    retryRequested = true;
    return;
  }
  if (applied) return;
  const applyingMode = getAppearance();
  const appearance = applyingMode === 'light' ? LIGHT_APPEARANCE : APP_APPEARANCE;
  applying = true;
  let remaining = tabs.length + 3;
  let failed = false;
  const onSettled = (succeeded: boolean) => {
    failed ||= !succeeded;
    remaining -= 1;
    if (remaining > 0) return;
    applying = false;
    applied = !failed && applyingMode === getAppearance();
    const shouldRetry = retryRequested;
    retryRequested = false;
    if (shouldRetry) applyAppAppearance(true);
  };
  safePlatformCall('setNavigationBarColor', appearance.navigation, onSettled);
  safePlatformCall('setTabBarStyle', appearance.tabBar, onSettled);
  tabs.forEach((name, index) => {
    safePlatformCall(
      'setTabBarItem',
      {
        index,
        iconPath: `assets/tabbar/${name}${applyingMode === 'dark' ? '-light' : ''}.png`,
        selectedIconPath: `assets/tabbar/${name}-active.png`,
      },
      onSettled,
    );
  });
  safePlatformCall('setBackgroundColor', appearance.background, onSettled);
}

/** Decorate only appearance lifecycles. Business callbacks, return values and this are preserved. */
export function themedPage<T extends Record<string, any>>(options: T & ThisType<any>): void {
  const updates = new WeakMap<object, () => void>();
  Page({
    ...options,
    data: { ...options.data, ...appearanceData() },
    onLoad(this: any, ...args: any[]) {
      let update = updates.get(this);
      if (!update) {
        update = () => this.setData(appearanceData());
        updates.set(this, update);
        listeners.add(update);
      }
      update();
      return options.onLoad?.apply(this, args);
    },
    onShow(this: any, ...args: any[]) {
      this.setData(appearanceData());
      applyAppAppearance(true);
      return options.onShow?.apply(this, args);
    },
    onUnload(this: any, ...args: any[]) {
      const update = updates.get(this);
      if (update) listeners.delete(update);
      updates.delete(this);
      return options.onUnload?.apply(this, args);
    },
  });
}
