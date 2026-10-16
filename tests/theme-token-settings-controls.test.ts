import { describe, expect, it } from 'vitest';
import { contrast, declaration, effectiveBlock, read, uiTokens } from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const settings = read('miniprogram/pages/settings/index.wxss');
const tokens = uiTokens(app);

describe('主题 token 与控件契约', () => {
  it('补齐设置页使用的共享 token，并复用现有颜色语义', () => {
    expect(
      contrast(tokens['--color-on-action-muted'], tokens['--color-action']),
    ).toBeGreaterThanOrEqual(4.5);
    expect(tokens['--color-border-subtle']).toBe('var(--color-border)');
    expect(tokens['--font-mono']).toContain('ui-monospace');
    expect(tokens['--font-mono']).toContain('monospace');

    for (const token of ['--color-on-action-muted', '--color-border-subtle', '--font-mono']) {
      expect(settings).toContain(`var(${token})`);
    }
  });

  it('统一按钮触控高度与按钮、输入控件禁用态', () => {
    expect(app).toMatch(/button\s*\{[^}]*min-height:\s*var\(--control-height\)/s);
    expect(tokens['--control-height']).toBe('96rpx');
    expect(tokens['--primary-control-height']).toBe('104rpx');
    expect(declaration(effectiveBlock(app, '.btn'), 'min-height')).toBe(
      'var(--primary-control-height)',
    );
    expect(app).not.toContain('min-height: 44px;');

    for (const selector of ['button[disabled]', 'input[disabled]', 'textarea[disabled]']) {
      const disabled = effectiveBlock(app, selector);
      expect(declaration(disabled, 'background')).toBe('var(--color-raised) !important');
      expect(declaration(disabled, 'color')).toBe('var(--color-disabled-text) !important');
      expect(declaration(disabled, 'opacity')).toBe('1');
    }
  });
});
