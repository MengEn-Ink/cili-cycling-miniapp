export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'display-theme';
const DEFAULT_THEME: Theme = 'dark';

const palettes = {
  dark: {
    navigation: { backgroundColor: '#0b0b0c', frontColor: '#ffffff' },
    tabBar: {
      backgroundColor: '#0b0b0c',
      borderStyle: 'black',
      color: '#a8a8ad',
      selectedColor: '#d55b1f',
    },
    background: {
      backgroundColor: '#0b0b0c',
      backgroundColorTop: '#0b0b0c',
      backgroundColorBottom: '#0b0b0c',
    },
  },
  light: {
    navigation: { backgroundColor: '#ffffff', frontColor: '#000000' },
    tabBar: {
      backgroundColor: '#ffffff',
      borderStyle: 'white',
      color: '#4f4f4c',
      selectedColor: '#bd3f00',
    },
    background: {
      backgroundColor: '#ffffff',
      backgroundColorTop: '#ffffff',
      backgroundColorBottom: '#ffffff',
    },
  },
} as const;

const tabs = ['activities', 'registrations', 'profile'] as const;

let sessionTheme: Theme | undefined;
let appliedTheme: Theme | undefined;
let applyingTheme: Theme | undefined;
let applyingFailed = false;
let pendingTheme: Theme | undefined;

function normalizeTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}

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
    // 主题仅增强系统外观，旧基础库或宿主异常不能阻断页面；失败状态交给下一次同步重试。
    onSettled(false);
  }
}

export function getTheme(): Theme {
  if (sessionTheme) return sessionTheme;
  try {
    sessionTheme = normalizeTheme(wx.getStorageSync?.(STORAGE_KEY));
  } catch {
    sessionTheme = DEFAULT_THEME;
  }
  return sessionTheme;
}

export function themeClass(theme: Theme = getTheme()): string {
  return `theme-${theme}`;
}

export function applyTheme(theme: Theme = getTheme()): void {
  // 原生主题 API 无法取消；不同主题必须串行，确保最后一次选择对应的调用最后落地。
  if (applyingTheme !== undefined) {
    // 当前批次已经失败时保留同主题重试；未失败的重复同步仍只做去重。
    if (applyingTheme !== theme || applyingFailed) pendingTheme = theme;
    return;
  }
  // Tab 快速切换会连续触发各页面 onShow；已生效主题不重复跨桥更新，避免重绘空窗露出宿主白底。
  if (appliedTheme === theme) return;

  const palette = palettes[theme];
  const callCount = tabs.length + 3;
  let remaining = callCount;
  let failed = false;
  applyingTheme = theme;
  applyingFailed = false;

  const onSettled = (succeeded: boolean) => {
    failed ||= !succeeded;
    applyingFailed = failed;
    remaining -= 1;
    if (remaining > 0) return;

    // 只有本轮全部 API 成功后才缓存主题；任一失败都允许下一次同步重试。
    appliedTheme = failed ? undefined : theme;
    applyingTheme = undefined;
    applyingFailed = false;

    const nextTheme = pendingTheme;
    pendingTheme = undefined;
    if (nextTheme !== undefined) applyTheme(nextTheme);
  };

  safePlatformCall('setNavigationBarColor', palette.navigation, onSettled);
  safePlatformCall('setTabBarStyle', palette.tabBar, onSettled);
  tabs.forEach((name, index) => {
    safePlatformCall(
      'setTabBarItem',
      {
        index,
        iconPath: `assets/tabbar/${name}${theme === 'light' ? '-light' : ''}.png`,
        selectedIconPath: `assets/tabbar/${name}-active.png`,
      },
      onSettled,
    );
  });
  safePlatformCall('setBackgroundColor', palette.background, onSettled);
}

export function setTheme(value: unknown): Theme {
  const theme = normalizeTheme(value);
  // 先更新内存，保证持久化不可用时当前会话仍立即生效。
  sessionTheme = theme;
  try {
    wx.setStorageSync?.(STORAGE_KEY, theme);
  } catch {
    // 存储失败不回滚会话主题。
  }
  applyTheme(theme);
  return theme;
}

export function syncPageTheme(page: {
  data?: { theme?: unknown; themeClass?: unknown };
  setData?: (data: Record<string, unknown>) => void;
}): Theme {
  const theme = getTheme();
  const nextThemeClass = themeClass(theme);
  try {
    // 页面初始 data 已带默认深色；仅主题实际变化时 setData，避免 Tab onShow 造成无意义重排。
    if (page.data?.theme !== theme || page.data?.themeClass !== nextThemeClass) {
      page.setData?.({ theme, themeClass: nextThemeClass });
    }
  } catch {
    // 页面销毁竞态中的 setData 失败不影响系统主题同步。
  }
  const refreshNavigation = appliedTheme === theme && applyingTheme === undefined;
  applyTheme(theme);
  // 每个页面的静态 navigationBar 配置会在入栈时重新生效；全局 TabBar 可去重，页面导航栏必须重设。
  if (refreshNavigation) {
    safePlatformCall('setNavigationBarColor', palettes[theme].navigation, () => undefined);
  }
  return theme;
}
