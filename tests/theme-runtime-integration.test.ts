// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { expandAppRoutes, type MiniProgramAppConfig } from './helpers/app-routes';

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as MiniProgramAppConfig;

describe('单一明亮外观接线', () => {
  it('14 个页面不再保存或同步运行时主题', () => {
    const appRoutes = expandAppRoutes(appConfig);
    expect(appRoutes).toHaveLength(14);

    for (const pagePath of appRoutes) {
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

    expect(profileTemplate).toContain('bindtap="openSettings"');
    expect(profileTemplate).toContain('aria-label="打开设置"');
    expect(profileScript).toContain("wx.navigateTo({ url: '/pages/settings/index' })");
    expect(template).not.toMatch(/显示主题|深色（默认）|浅色（户外）|theme-option/);
    expect(script).not.toMatch(/setTheme|switchTheme/);
    expect(template).not.toContain('第三方授权');
    expect(script).not.toContain('getStravaReadiness');
    expect(template).toContain('App 更新');
  });

  it('设置页只渲染当前版本的 App 更新卡片，RELEASE_NOTES 保留一条供发布门禁', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');

    expect(template).toContain('App 更新');
    expect(template).toContain('wx:if="{{currentRelease}}"');
    expect(template).not.toContain('wx:for="{{releaseNotes}}"');
    expect(script).toContain("date: '2026-10-17'");
    expect(script).toContain('version: CLIENT_RELEASE_VERSION');
    expect(script).toContain("title: '项目说明更完整，运行包更轻'");
    const latestMatches = script.match(/latest:\s*true/g) || [];
    expect(latestMatches).toHaveLength(1);
  });
});
