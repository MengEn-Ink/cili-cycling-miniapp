// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssBlock, declaration, expectSemantic, uiTokens } from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');

describe('native tabbar safe-area contract', () => {
  it('keeps the native window and three-tab navigation on the unified bright palette', () => {
    const app = JSON.parse(read('miniprogram/app.json'));

    expect(String(app.window.navigationBarBackgroundColor || '').toLowerCase()).toBe('#ffffff');
    expect(app.window.navigationBarTextStyle).toBe('black');
    expect(String(app.window.backgroundColor || '').toLowerCase()).toBe('#f6f7f4');
    expect(String(app.window.backgroundColorTop || '').toLowerCase()).toBe('#f6f7f4');
    expect(String(app.window.backgroundColorBottom || '').toLowerCase()).toBe('#f6f7f4');
    expect(app.window.backgroundTextStyle).toBe('dark');
    expect(app.tabBar).toBeDefined();
    expect(app.tabBar.custom).not.toBe(true);
    expect(existsSync('miniprogram/custom-tab-bar')).toBe(false);
    expect(String(app.tabBar.backgroundColor || '').toLowerCase()).toBe('#ffffff');
    expect(String(app.tabBar.color || '').toLowerCase()).toBe('#5b6258');
    expect(String(app.tabBar.selectedColor || '').toLowerCase()).toBe('#10120f');
    expect(app.tabBar.borderStyle).toBe('white');
    expect(app.tabBar.list.map((item: { pagePath: string }) => item.pagePath)).toEqual([
      'pages/activities/index',
      'pages/registrations/index',
      'pages/profile/index',
    ]);
  });

  it('keeps every tab page root bright, semantic and full-height', () => {
    for (const root of ['activities', 'registrations', 'profile']) {
      const config = JSON.parse(read(`miniprogram/pages/${root}/index.json`));
      const styles = read(`miniprogram/pages/${root}/index.wxss`).toLowerCase();

      expect(String(config.backgroundColor || '').toLowerCase()).toBe('#f6f7f4');
      expect(config.backgroundTextStyle).toBe('dark');
      expect(styles).toMatch(/page\s*\{[^}]*background:\s*var\(--color-bg\);/s);
      expect(styles).toMatch(new RegExp(`\\.${root}-page\\s*\\{[^}]*min-height:\\s*100%;`, 's'));
      expect(styles).not.toContain('background: #000;');
    }
  });

  it('keeps the global page canvas on one bright semantic token set', () => {
    const appStyles = read('miniprogram/app.wxss');
    const pageRule = cssBlock(appStyles, 'page');
    const tokens = uiTokens(appStyles);

    expect(pageRule.toLowerCase()).toMatch(/height:\s*100%;/);
    expectSemantic(declaration(pageRule, 'background'), '--color-bg');
    expectSemantic(declaration(pageRule, 'color'), '--color-text');
    expect(tokens['--color-bg']).toBe('#f6f7f4');
    expect(tokens['--color-text']).toBe('#10120f');
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
