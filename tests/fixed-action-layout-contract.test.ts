// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('fixed action layout contract', () => {
  it('uses one reserve variable for the form content and fixed action bar', () => {
    const appStyles = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/registration-form/index.wxss');
    const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');

    expect(appStyles).toMatch(/--fixed-action-reserve:\s*\d+rpx;/);
    expect(appStyles).toMatch(/--fixed-action-reserve-narrow:\s*\d+rpx;/);
    expect(styles).toContain('padding-bottom: var(--fixed-action-reserve);');
    expect(styles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + constant(safe-area-inset-bottom));',
    );
    expect(styles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + env(safe-area-inset-bottom));',
    );
    expect(detailStyles).toContain('padding-bottom: var(--fixed-action-reserve);');
    expect(detailStyles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + constant(safe-area-inset-bottom));',
    );
    expect(detailStyles).toContain(
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

    expect(appStyles).toContain('padding: 16rpx 24rpx;');
    expect(appStyles).toContain('calc(16rpx + constant(safe-area-inset-bottom))');
    expect(appStyles).toContain('calc(16rpx + env(safe-area-inset-bottom))');
  });

  it('matches both dark form navigation bars to their page theme', () => {
    for (const file of [
      'miniprogram/pages/registration-form/index.json',
      'miniprogram/pages/admin/activity-edit/index.json',
    ]) {
      const config = JSON.parse(read(file));

      expect(String(config.navigationBarBackgroundColor || '').toLowerCase()).toBe('#090b0f');
      expect(config.navigationBarTextStyle).toBe('white');
    }
  });
});
