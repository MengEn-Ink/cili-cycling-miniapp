// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('native tabbar safe-area contract', () => {
  it('keeps the native window and three-tab navigation on the CILI dark palette', () => {
    const app = JSON.parse(read('miniprogram/app.json'));

    expect(String(app.window.navigationBarBackgroundColor || '').toLowerCase()).toBe('#0b0b0c');
    expect(app.window.navigationBarTextStyle).toBe('white');
    expect(String(app.window.backgroundColor || '').toLowerCase()).toBe('#0b0b0c');
    expect(app.window.backgroundTextStyle).toBe('light');
    expect(app.tabBar).toBeDefined();
    expect(app.tabBar.custom).not.toBe(true);
    expect(existsSync('miniprogram/custom-tab-bar')).toBe(false);
    expect(String(app.tabBar.backgroundColor || '').toLowerCase()).toBe('#0b0b0c');
    expect(String(app.tabBar.color || '').toLowerCase()).toBe('#a8a8ad');
    expect(String(app.tabBar.selectedColor || '').toLowerCase()).toBe('#d55b1f');
    expect(app.tabBar.borderStyle).toBe('black');
    expect(app.tabBar.list.map((item: { pagePath: string }) => item.pagePath)).toEqual([
      'pages/activities/index',
      'pages/registrations/index',
      'pages/profile/index',
    ]);
  });

  it('keeps every tab page root dark and full-height', () => {
    for (const root of ['activities', 'registrations', 'profile']) {
      const styles = read(`miniprogram/pages/${root}/index.wxss`).toLowerCase();

      expect(styles).toMatch(/page\s*\{[^}]*background:\s*#0b0b0c;/s);
      expect(styles).toMatch(new RegExp(`\\.${root}-page\\s*\\{[^}]*min-height:\\s*100vh;`, 's'));
    }
  });

  it('gives all tab roots one shared safe-area bottom spacing contract', () => {
    const appStyles = read('miniprogram/app.wxss');
    const rootRule = appStyles.match(
      /\.page\.activities-page\s*,\s*\.page\.registrations-page\s*,\s*\.page\.profile-page\s*\{([^}]+)\}/s,
    )?.[1];

    expect(rootRule).toBeDefined();
    expect(appStyles).toMatch(/--tab-page-bottom-space:\s*\d+rpx;/);
    expect(rootRule).toContain(
      'padding-bottom: calc(var(--tab-page-bottom-space) + constant(safe-area-inset-bottom));',
    );
    expect(rootRule).toContain(
      'padding-bottom: calc(var(--tab-page-bottom-space) + env(safe-area-inset-bottom));',
    );
  });

  it('does not replace native navigation with fixed tab markup or styles', () => {
    for (const root of ['activities', 'registrations', 'profile']) {
      const template = read(`miniprogram/pages/${root}/index.wxml`);
      const styles = read(`miniprogram/pages/${root}/index.wxss`);

      expect(template).not.toMatch(/class="[^"]*\b(?:custom-)?tab-?bar\b/i);
      expect(styles).not.toMatch(/\.(?:custom-)?tab-?bar\b/i);
    }
  });
});
