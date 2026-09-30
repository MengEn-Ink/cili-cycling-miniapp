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
    navigation: { backgroundColor: '#f6f1e8', frontColor: '#000000' },
    tabBar: {
      backgroundColor: '#fffaf2',
      borderStyle: 'white',
      color: '#67615a',
      selectedColor: '#d55b1f',
    },
    background: {
      backgroundColor: '#f6f1e8',
      backgroundColorTop: '#f6f1e8',
      backgroundColorBottom: '#f6f1e8',
    },
  },
} as const;

let sessionTheme: Theme | undefined;

function normalizeTheme(value: unknown): Theme {
  return value === 'light' || value === 'dark' ? value : DEFAULT_THEME;
}

function safePlatformCall(name: string, options: Record<string, unknown>): void {
  try {
    const api = typeof wx === 'undefined' ? undefined : wx[name];
    if (typeof api === 'function') api.call(wx, { ...options, fail: () => undefined });
  } catch {
    // 主题仅增强系统外观，旧基础库或宿主异常不能阻断页面。
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
  const palette = palettes[theme];
  safePlatformCall('setNavigationBarColor', palette.navigation);
  safePlatformCall('setTabBarStyle', palette.tabBar);
  safePlatformCall('setBackgroundColor', palette.background);
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

export function syncPageTheme(page: { setData?: (data: Record<string, unknown>) => void }): Theme {
  const theme = getTheme();
  try {
    page.setData?.({ theme, themeClass: themeClass(theme) });
  } catch {
    // 页面销毁竞态中的 setData 失败不影响系统主题同步。
  }
  applyTheme(theme);
  return theme;
}
