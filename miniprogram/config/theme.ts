export const THEME_COLORS = {
  brand: '#e54242',
  action: '#d93636',
  background: '#0b0a0c',
  ink: '#f7f4f2',
  surface: '#121116',
  raised: '#1a1820',
  floating: '#24212b',
  muted: '#b8b3ba',
  borderStrong: '#766f7a',
  cinema: '#0b0a0c',
  cinemaMuted: '#b8b3ba',
  navigationFront: '#ffffff',
} as const;

/** Runtime source of truth for native WeChat appearance APIs. */
export const APP_APPEARANCE = {
  navigation: {
    backgroundColor: THEME_COLORS.cinema,
    frontColor: THEME_COLORS.navigationFront,
  },
  tabBar: {
    backgroundColor: THEME_COLORS.cinema,
    borderStyle: 'black',
    color: THEME_COLORS.cinemaMuted,
    selectedColor: THEME_COLORS.brand,
  },
  background: {
    backgroundColor: THEME_COLORS.cinema,
    backgroundColorTop: THEME_COLORS.cinema,
    backgroundColorBottom: THEME_COLORS.cinema,
  },
} as const;
