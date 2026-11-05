/** Approved AI Hero semantic overlays. Media/QR surfaces retain their independent contrast. */
export type AppearanceMode = 'light' | 'dark';

const common = {
  '--page-gutter': '40rpx',
  '--border-width-hairline': '1px',
  '--border-width-strong': '1px',
  '--input-border-width': '1px',
  '--segment-border-width': '1px',
  '--radius-sm': '18rpx',
  '--radius-card': '22rpx',
  '--shadow-hard': 'none',
  '--shadow-card': 'none',
  '--shadow-floating': 'none',
  '--shadow-actionbar': 'none',
};

export const APPEARANCE_TOKENS = {
  dark: {
    ...common,
    '--color-bg': '#0b0a0c',
    '--color-surface': '#100f0e',
    '--color-raised': '#1d1b1a',
    '--color-floating': '#242120',
    '--color-text': '#f4f3f1',
    '--color-muted': '#b8b3ba',
    '--color-placeholder': '#aaa5ad',
    '--color-disabled-text': '#aaa5ad',
    '--color-border': 'rgba(255,255,255,0.08)',
    '--color-border-strong': '#827c86',
    '--color-card-border': 'rgba(255,255,255,0.12)',
    '--color-input-bg': '#100f0e',
    '--color-fixed-bar': '#0b0a0c',
    '--color-sticky-surface': '#0b0a0c',
    '--color-shadow': 'rgba(0,0,0,0)',
    '--color-brand-active': '#f06464',
    // 品牌文字专用：暗色画布需亮于填充红，6.31:1（画布）/ 5.48:1（raised）。
    '--color-brand-text': '#f06464',
    '--color-status-success': '#7bdba1',
    '--color-status-success-soft': '#183424',
    '--color-status-warning': '#f0ce75',
    '--color-status-warning-soft': '#3a2d12',
    '--color-danger': '#ffb4a6',
    '--color-danger-text': '#ffb4a6',
    '--color-danger-soft': '#431b17',
  },
  light: {
    ...common,
    '--color-bg': '#f7f6f2',
    '--color-surface': '#ffffff',
    '--color-raised': '#eeede8',
    '--color-floating': '#f7f4f2',
    '--color-text': '#1f2324',
    '--color-muted': '#5c6467',
    '--color-placeholder': '#66686b',
    '--color-disabled-text': '#66686b',
    '--color-border': 'rgba(20,22,26,0.1)',
    '--color-border-strong': '#858580',
    '--color-card-border': 'rgba(20,22,26,0.14)',
    '--color-input-bg': '#ffffff',
    '--color-fixed-bar': '#f7f6f2',
    '--color-sticky-surface': '#f7f6f2',
    '--color-shadow': 'rgba(0,0,0,0)',
    '--color-brand-active': '#b72c2c',
    // 品牌文字专用：暖白画布 5.69:1、白卡片 6.16:1、浅 raised 5.25:1。
    '--color-brand-text': '#b72c2c',
    '--color-status-success': '#007e46',
    '--color-status-success-soft': '#e8f5ed',
    '--color-status-warning': '#806000',
    '--color-status-warning-soft': '#faf2dc',
    '--color-danger': '#b72c2c',
    '--color-danger-text': '#b72c2c',
    '--color-danger-soft': '#fcebea',
  },
} as const;

export const LIGHT_APPEARANCE = {
  navigation: { backgroundColor: '#f7f6f2', frontColor: '#000000' },
  tabBar: {
    backgroundColor: '#f7f6f2',
    borderStyle: 'white',
    color: '#5c6467',
    // 浅色 TabBar 选中文字沿用 --color-brand-active：#e54242 在暖白底仅 3.74:1，低于 4.5:1。
    selectedColor: '#b72c2c',
  },
  background: {
    backgroundColor: '#f7f6f2',
    backgroundColorTop: '#f7f6f2',
    backgroundColorBottom: '#f7f6f2',
  },
} as const;
