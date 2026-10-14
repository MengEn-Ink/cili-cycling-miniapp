import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, read, uiTokens } from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const settings = read('miniprogram/pages/settings/index.wxss');
const tokens = uiTokens(app);

describe('主题 token 与控件契约', () => {
  it('补齐设置页使用的共享 token，并复用现有颜色语义', () => {
    expect(tokens['--color-on-action-muted']).toBe('var(--color-media-muted)');
    expect(tokens['--color-border-subtle']).toBe('var(--color-border)');
    expect(tokens['--font-mono']).toContain('ui-monospace');
    expect(tokens['--font-mono']).toContain('monospace');

    for (const token of ['--color-on-action-muted', '--color-border-subtle', '--font-mono']) {
      expect(settings).toContain(`var(${token})`);
    }
  });

  it('统一按钮触控高度与按钮、输入控件禁用态', () => {
    expect(declaration(effectiveBlock(app, 'button'), 'min-height')).toBe('var(--control-height)');

    for (const selector of ['button[disabled]', 'input[disabled]', 'textarea[disabled]']) {
      const disabled = effectiveBlock(app, selector);
      expect(declaration(disabled, 'background')).toBe('var(--color-raised) !important');
      expect(declaration(disabled, 'color')).toBe('var(--color-disabled-text) !important');
      expect(declaration(disabled, 'opacity')).toBe('1');
    }
  });
});
