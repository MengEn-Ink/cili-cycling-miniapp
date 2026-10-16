// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
const appConfig = JSON.parse(read('miniprogram/app.json')) as {
  pages: string[];
  window: Record<string, unknown>;
  tabBar: {
    backgroundColor: string;
    borderStyle: string;
    color: string;
    selectedColor: string;
    list: Array<{ iconPath: string; selectedIconPath: string }>;
  };
};

const brightWindow = {
  navigationBarBackgroundColor: '#fbf5ea',
  navigationBarTextStyle: 'black',
  backgroundColor: '#fbf5ea',
  backgroundColorTop: '#fbf5ea',
  backgroundColorBottom: '#fbf5ea',
  backgroundTextStyle: 'dark',
};

describe('HP-20261010-02 单一明亮 UI 底座', () => {
  it('固定白色系统导航、滚动边界和 TabBar', () => {
    expect(appConfig.window).toMatchObject(brightWindow);
    expect(appConfig.tabBar).toMatchObject({
      backgroundColor: '#ffffff',
      borderStyle: 'white',
      color: '#6f675d',
      selectedColor: '#211f1c',
    });
    expect(appConfig.tabBar.list.map((item) => item.iconPath)).toEqual([
      'assets/tabbar/activities-light.png',
      'assets/tabbar/registrations-light.png',
      'assets/tabbar/profile-light.png',
    ]);
  });

  it('全部页面固定明亮系统外观且不再同步运行时主题', () => {
    expect(appConfig.pages).toHaveLength(13);

    for (const pagePath of appConfig.pages) {
      const root = `miniprogram/${pagePath}`;
      const config = JSON.parse(read(`${root}.json`)) as Record<string, unknown>;
      const script = read(`${root}.ts`);
      const template = read(`${root}.wxml`);

      expect(config, pagePath).toMatchObject(brightWindow);
      expect(script, pagePath).not.toMatch(
        /themeClass|syncPageTheme|setTheme|display-theme|services\/theme-service/,
      );
      expect(template, pagePath).not.toMatch(/themeClass|theme-light|theme-dark/);
    }
  });

  it('设置页删除主题选择与第三方授权并保留升级日志', () => {
    const template = read('miniprogram/pages/settings/index.wxml');
    const script = read('miniprogram/pages/settings/index.ts');

    expect(template).not.toMatch(/显示主题|深色（默认）|浅色（户外）|theme-option/);
    expect(script).not.toMatch(/setTheme|switchTheme|themeClass|display-theme/);
    expect(template).not.toContain('第三方授权');
    expect(script).not.toContain('getStravaReadiness');
    expect(template).toContain('功能升级日志');
  });

  it('共享组件只消费全局语义 token，不保留旧暗色副本', () => {
    const activityCard = read('miniprogram/components/activity-card/index.wxss');
    const brandLogo = read('miniprogram/components/brand-logo/index.wxss');
    const statusPill = read('miniprogram/components/status-pill/index.wxss');
    const capabilityCard = read('miniprogram/pages/capability-card/index.wxss');
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    const registration = read('miniprogram/pages/registration-form/index.wxss');

    expect(activityCard).not.toMatch(/--color-(surface|raised|muted|border|action|on-action):/);
    expect(brandLogo).not.toMatch(/#f7f7f5|#4a4a4f|#c7c7ca|#85858a/i);
    expect(statusPill).not.toMatch(/#29292d|#55555b|#b8b8bc|#ff7068/i);
    expect(capabilityCard).toContain('background: var(--color-media-card-bg);');
    expect(detail).toContain('background: var(--color-media-placeholder-bg);');
    expect(registration).not.toContain('background: #1c1c1e;');
    expect(registration).toMatch(/\.form-card\s*\{[^}]*color: var\(--color-text\);/s);
  });

  it('全局样式只定义一套明亮 token 和确认稿尺寸', () => {
    const styles = read('miniprogram/app.wxss');

    expect(styles).not.toMatch(/\.theme-light|\.theme-dark/);
    expect(styles).toContain('--color-bg: #fbf5ea;');
    expect(styles).toContain('--color-surface: #ffffff;');
    expect(styles).toContain('--color-raised: #f3e6d0;');
    expect(styles).toContain('--color-text: #211f1c;');
    expect(styles).toContain('--color-muted: #6f675d;');
    expect(styles).toContain('--color-brand: #e13b2b;');
    expect(styles).toContain('--color-on-brand: #0c0a07;');
    expect(styles).toContain('--color-action: #c0321f;');
    expect(styles).toContain('--color-on-action: #ffffff;');
    expect(styles).toContain('--control-height: 96rpx;');
    expect(styles).toContain('--segment-height: 92rpx;');
    expect(styles).toContain('--page-gutter: 32rpx;');
    expect(styles).toContain('--page-gutter-narrow: 24rpx;');
    expect(styles).toContain('--radius-card: 36rpx;');
    expect(styles).toContain('--card-gap: 28rpx;');
  });
});
