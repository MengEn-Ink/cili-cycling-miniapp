// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as { pages: string[] };

describe('单一明亮外观接线', () => {
  it('14 个页面不再保存或同步运行时主题', () => {
    expect(appConfig.pages).toHaveLength(14);

    for (const pagePath of appConfig.pages) {
      const script = readFileSync(`miniprogram/${pagePath}.ts`, 'utf8');
      const template = readFileSync(`miniprogram/${pagePath}.wxml`, 'utf8');

      expect(script, pagePath).not.toMatch(/themeClass|syncPageTheme|setTheme|display-theme/);
      expect(template, pagePath).not.toMatch(/themeClass|theme-light|theme-dark/);
    }
  });

  it('设置页保留可访问入口，但不再提供主题切换', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    const profileTemplate = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const profileScript = readFileSync('miniprogram/pages/profile/index.ts', 'utf8');

    expect(profileTemplate).toContain('class="settings-entry"');
    expect(profileTemplate).toContain('aria-label="打开设置"');
    expect(profileScript).toContain("wx.navigateTo({ url: '/pages/settings/index' })");
    expect(template).not.toMatch(/显示主题|深色（默认）|浅色（户外）|theme-option/);
    expect(script).not.toMatch(/setTheme|switchTheme/);
    expect(template).toContain('Strava 授权');
    expect(template).toContain('功能升级日志');
  });

  it('设置页展示当前版本与历史功能升级日志', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');

    expect(template).toContain('功能升级日志');
    expect(template).toContain('wx:for="{{releaseNotes}}"');
    expect(script).toContain("version: '2026.10.02.2'");
    expect(script).toContain("version: '2026.10.02.1'");
    expect(script).toContain("version: '2026.10.01.3'");
    expect(script).toContain("version: '2026.10.01.2'");
    expect(script).toContain("version: '2026.10.01.1'");
  });
});
