// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appConfig = JSON.parse(readFileSync('miniprogram/app.json', 'utf8')) as { pages: string[] };

describe('双主题页面接线', () => {
  it('14 个页面根节点和 onShow 均接入主题同步', () => {
    expect(appConfig.pages).toHaveLength(14);

    for (const pagePath of appConfig.pages) {
      const script = readFileSync(`miniprogram/${pagePath}.ts`, 'utf8');
      const template = readFileSync(`miniprogram/${pagePath}.wxml`, 'utf8');
      const onShow = script.match(/(?:async\s+)?onShow\(\)\s*\{([\s\S]*?)\n\s*\},/)?.[1] || '';

      expect(template.split('\n')[0], pagePath).toContain('{{themeClass}}');
      expect(script, pagePath).toContain('themeClass:');
      expect(onShow, pagePath).toContain('syncPageTheme(this)');
    }
  });

  it('设置页提供可访问且触控高度足够的双主题选项', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');
    const styles = readFileSync('miniprogram/pages/settings/index.wxss', 'utf8');
    const profileTemplate = readFileSync('miniprogram/pages/profile/index.wxml', 'utf8');
    const profileScript = readFileSync('miniprogram/pages/profile/index.ts', 'utf8');

    expect(profileTemplate).toContain('class="settings-entry"');
    expect(profileTemplate).toContain('aria-label="打开设置"');
    expect(profileTemplate).not.toContain('class="theme-option');
    expect(profileScript).toContain("wx.navigateTo({ url: '/pages/settings/index' })");
    expect(template).toContain('显示主题');
    expect(template).toContain('深色（默认）');
    expect(template).toContain('浅色（户外）');
    expect(template.match(/class="theme-option /g)).toHaveLength(2);
    expect(styles).toMatch(/\.theme-option\s*\{[^}]*min-height:\s*112rpx;/s);
    expect(template.match(/role="radio"/g)).toHaveLength(2);
    expect(template.match(/aria-checked=/g)).toHaveLength(2);
    expect(script).toContain('setTheme(event.currentTarget?.dataset?.theme)');
    expect(script).toContain('syncPageTheme(this)');
  });

  it('设置页展示当前版本与历史功能升级日志', () => {
    const template = readFileSync('miniprogram/pages/settings/index.wxml', 'utf8');
    const script = readFileSync('miniprogram/pages/settings/index.ts', 'utf8');

    expect(template).toContain('功能升级日志');
    expect(template).toContain('wx:for="{{releaseNotes}}"');
    expect(script).toContain("version: '2026.10.01.3'");
    expect(script).toContain("version: '2026.10.01.2'");
    expect(script).toContain("version: '2026.10.01.1'");
  });
});
