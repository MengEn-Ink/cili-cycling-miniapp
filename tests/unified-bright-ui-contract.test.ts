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
  navigationBarBackgroundColor: '#ffffff',
  navigationBarTextStyle: 'black',
  backgroundColor: '#f6f7f4',
  backgroundColorTop: '#f6f7f4',
  backgroundColorBottom: '#f6f7f4',
  backgroundTextStyle: 'dark',
};

describe('HP-20261010-02 单一明亮 UI 底座', () => {
  it('固定白色系统导航、滚动边界和 TabBar', () => {
    expect(appConfig.window).toMatchObject(brightWindow);
    expect(appConfig.tabBar).toMatchObject({
      backgroundColor: '#ffffff',
      borderStyle: 'white',
      color: '#5b6258',
      selectedColor: '#10120f',
    });
    expect(appConfig.tabBar.list.map((item) => item.iconPath)).toEqual([
      'assets/tabbar/activities-light.png',
      'assets/tabbar/registrations-light.png',
      'assets/tabbar/profile-light.png',
    ]);
  });

  it('全部页面固定明亮系统外观且不再同步运行时主题', () => {
    expect(appConfig.pages).toHaveLength(14);

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

  it('设置页删除主题选择并保留 Strava 管理与升级日志', () => {
    const template = read('miniprogram/pages/settings/index.wxml');
    const script = read('miniprogram/pages/settings/index.ts');

    expect(template).not.toMatch(/显示主题|深色（默认）|浅色（户外）|theme-option/);
    expect(script).not.toMatch(/setTheme|switchTheme|themeClass|display-theme/);
    expect(template).toContain('Strava 授权');
    expect(template).toContain('功能升级日志');
  });

  it('全局样式只定义一套明亮 token 和确认稿尺寸', () => {
    const styles = read('miniprogram/app.wxss');

    expect(styles).not.toMatch(/\.theme-light|\.theme-dark/);
    expect(styles).toContain('--color-bg: #f6f7f4;');
    expect(styles).toContain('--color-surface: #ffffff;');
    expect(styles).toContain('--color-raised: #eff1ec;');
    expect(styles).toContain('--color-text: #10120f;');
    expect(styles).toContain('--color-muted: #5b6258;');
    expect(styles).toContain('--color-brand: #a3461f;');
    expect(styles).toContain('--color-on-brand: #ffffff;');
    expect(styles).toContain('--control-height: 96rpx;');
    expect(styles).toContain('--segment-height: 80rpx;');
    expect(styles).toContain('--page-gutter: 32rpx;');
    expect(styles).toContain('--radius-card: 32rpx;');
    expect(styles).toContain('--card-gap: 24rpx;');
  });
});
