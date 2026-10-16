// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('沸点固定操作区布局契约', () => {
  it('使用统一预留变量适配 96rpx 控件与固定操作栏', () => {
    const appStyles = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/registration-form/index.wxss');

    expect(appStyles).toMatch(/--fixed-action-reserve:\s*240rpx;/);
    expect(appStyles).toMatch(/--fixed-action-reserve-narrow:\s*292rpx;/);
    expect(appStyles).toMatch(
      /\.detail-page,[\s\S]*?\.form-page,[\s\S]*?padding-bottom:\s*calc\(var\(--fixed-action-reserve\) \+ env\(safe-area-inset-bottom\)\);/,
    );
    expect(styles).toContain('padding-bottom: var(--fixed-action-reserve);');
    expect(styles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + constant(safe-area-inset-bottom));',
    );
    expect(styles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + env(safe-area-inset-bottom));',
    );
    expect(styles).toContain(
      'min-height: calc(var(--fixed-action-reserve) + constant(safe-area-inset-bottom));',
    );
    expect(styles).toContain('min-height: var(--fixed-action-reserve);');
    expect(styles).toContain(
      'min-height: calc(var(--fixed-action-reserve) + env(safe-area-inset-bottom));',
    );
  });

  it('raises the same reserve contract when two actions stack below 340px', () => {
    const styles = read('miniprogram/pages/registration-form/index.wxss');
    const narrow = styles.match(/@media\s*\(max-width:\s*340px\)\s*\{([\s\S]+)\}\s*$/)?.[1];

    expect(narrow).toBeDefined();
    expect(narrow).toMatch(
      /\.page\.form-page\s*\{[^}]*--fixed-action-reserve:\s*var\(--fixed-action-reserve-narrow\);/s,
    );
    expect(narrow).toMatch(/[^{}]*\.action-bar[^{}]*\{[^}]*grid-template-columns:\s*1fr;/s);
  });

  it('keeps both safe-area syntaxes on the shared fixed primitive', () => {
    const appStyles = read('miniprogram/app.wxss');

    expect(appStyles).toContain('padding: 16rpx var(--page-gutter)');
    expect(appStyles).toContain('calc(16rpx + constant(safe-area-inset-bottom))');
    expect(appStyles).toContain('calc(16rpx + env(safe-area-inset-bottom))');
  });

  it('matches both form navigation bars to the unified bright theme', () => {
    for (const file of [
      'miniprogram/pages/registration-form/index.json',
      'miniprogram/pages/admin/activity-edit/index.json',
    ]) {
      const config = JSON.parse(read(file));

      expect(String(config.navigationBarBackgroundColor || '').toLowerCase()).toBe('#fbf5ea');
      expect(config.navigationBarTextStyle).toBe('black');
    }
  });
});
