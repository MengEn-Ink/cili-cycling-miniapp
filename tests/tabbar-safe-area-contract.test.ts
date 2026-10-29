// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolvedHex, uiTokens } from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');

describe('native tabbar safe-area contract', () => {
  it('keeps the native window and three-tab navigation on the cinematic chrome palette', () => {
    const app = JSON.parse(read('miniprogram/app.json'));

    expect(String(app.window.navigationBarBackgroundColor || '').toLowerCase()).toBe('#0b0a0c');
    expect(app.window.navigationBarTextStyle).toBe('white');
    expect(String(app.window.backgroundColor || '').toLowerCase()).toBe('#0b0a0c');
    expect(String(app.window.backgroundColorTop || '').toLowerCase()).toBe('#0b0a0c');
    expect(String(app.window.backgroundColorBottom || '').toLowerCase()).toBe('#0b0a0c');
    expect(app.window.backgroundTextStyle).toBe('light');
    expect(app.tabBar).toBeDefined();
    expect(app.tabBar.custom).not.toBe(true);
    expect(existsSync('miniprogram/custom-tab-bar')).toBe(false);
    expect(String(app.tabBar.backgroundColor || '').toLowerCase()).toBe('#0b0a0c');
    expect(String(app.tabBar.color || '').toLowerCase()).toBe('#b8b3ba');
    expect(String(app.tabBar.selectedColor || '').toLowerCase()).toBe('#e54242');
    expect(app.tabBar.borderStyle).toBe('black');
    expect(app.tabBar.list.map((item: { pagePath: string }) => item.pagePath)).toEqual([
      'pages/activities/index',
      'pages/registrations/index',
      'pages/profile/index',
    ]);
  });

  it('keeps every tab page root semantic and full-height with route-appropriate canvas', () => {
    const appStyles = read('miniprogram/app.wxss').toLowerCase();
    expect(appStyles).toMatch(/\.page\s*,[\s\S]*?\{[^}]*background:\s*var\(--color-bg\);/s);

    for (const root of ['activities', 'registrations', 'profile']) {
      const config = JSON.parse(read(`miniprogram/pages/${root}/index.json`));
      const styles = read(`miniprogram/pages/${root}/index.wxss`).toLowerCase();
      const template = read(`miniprogram/pages/${root}/index.wxml`);
      const script = read(`miniprogram/pages/${root}/index.ts`);

      expect(String(config.backgroundColor || '').toLowerCase()).toBe('#0b0a0c');
      expect(config.navigationStyle).toBe('custom');
      expect(config.backgroundTextStyle).toBe('light');
      expect(template).toContain('style="padding-top: {{navigationTopPx}}px"');
      expect(script).toContain('navigationTopPx: customNavigationTopPx()');
      expect(template).toMatch(new RegExp(`class="page ${root}-page\\b`));
      expect(styles).not.toContain('background: #000;');
    }
  });

  it('keeps the global page canvas on one cinematic dark semantic token set', () => {
    const appStyles = read('miniprogram/app.wxss');
    const tokens = uiTokens(appStyles);

    expect(appStyles).toMatch(/^page\s*\{[\s\S]*?min-height:\s*100%;/);
    expect(appStyles).toContain('background: var(--color-bg);');
    expect(appStyles).toContain('color: var(--color-text);');
    expect(resolvedHex(tokens['--color-bg'], tokens)).toBe('#0b0a0c');
    expect(resolvedHex(tokens['--color-text'], tokens)).toBe('#f7f4f2');
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
