export const THEME_COLORS = {
  brand: '#c0321f',
  background: '#fbf5ea',
  ink: '#211f1c',
  surface: '#ffffff',
  muted: '#6f675d',
  navigationFront: '#000000',
} as const;

/** Runtime source of truth for native WeChat appearance APIs. */
export const APP_APPEARANCE = {
  navigation: {
    backgroundColor: THEME_COLORS.background,
    frontColor: THEME_COLORS.navigationFront,
  },
  tabBar: {
    backgroundColor: THEME_COLORS.surface,
    borderStyle: 'white',
    color: THEME_COLORS.muted,
    selectedColor: THEME_COLORS.ink,
  },
  background: {
    backgroundColor: THEME_COLORS.background,
    backgroundColorTop: THEME_COLORS.background,
    backgroundColorBottom: THEME_COLORS.background,
  },
} as const;
