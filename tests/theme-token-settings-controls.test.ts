import { describe, expect, it } from 'vitest';
import {
  declaration,
  effectiveBlock,
  expectSemantic,
  read,
  uiTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const settings = read('miniprogram/pages/settings/index.wxss');
const tokens = uiTokens(app);

describe('主题 token 与控件契约', () => {
  it('设置页复用现有颜色语义，行动红只保留在“当前版本”胶囊', () => {
    // 顶部改为暖纸编辑式页头，不再使用独立卡片或整块行动红。
    const hero = effectiveBlock(settings, '.settings-hero');
    expectSemantic(declaration(hero, 'background'), '--color-bg');
    expectSemantic(declaration(hero, 'color'), '--color-text');
    expect(declaration(hero, 'background')).not.toContain('--color-action');
    const heroCopy = effectiveBlock(settings, '.hero-copy');
    expectSemantic(declaration(heroCopy, 'color'), '--color-muted');
    expectSemantic(
      declaration(effectiveBlock(settings, '.release-latest'), 'background'),
      '--color-action',
    );
    expect(settings).not.toContain('var(--color-on-action-muted)');
    expect(tokens['--color-border-subtle']).toBe('var(--color-border)');
    expect(tokens['--font-mono']).toBe('var(--font-family-mono)');
    expect(tokens['--font-family-mono']).toContain('ui-monospace');
    expect(tokens['--font-family-mono']).toContain('monospace');

    for (const token of ['--color-border-subtle', '--font-mono']) {
      expect(settings).toContain(`var(${token})`);
    }
  });

  it('设置管理列表保持完整触控区、清晰分隔与中性色操作提示', () => {
    const row = effectiveBlock(settings, '.management-row');
    expect(declaration(row, 'min-height')).toBe('116rpx');
    expectSemantic(declaration(row, 'background'), '--color-surface');
    expectSemantic(declaration(row, 'color'), '--color-text');
    expect(
      declaration(effectiveBlock(settings, '.management-row + .management-row'), 'border-top'),
    ).toContain('--color-border-subtle');
    expectSemantic(
      declaration(effectiveBlock(settings, '.management-description'), 'color'),
      '--color-muted',
    );
    expect(declaration(effectiveBlock(settings, '.management-action'), 'color')).not.toContain(
      '--color-action',
    );
  });

  it('发布日志字号按沸点规格收口为 16px 标题与 12.5px 功能点、约 1.7 行高', () => {
    expect(declaration(effectiveBlock(settings, '.release-title'), 'font-size')).toBe('32rpx');
    expect(declaration(effectiveBlock(settings, '.release-title'), 'line-height')).toBe('54rpx');
    expect(declaration(effectiveBlock(settings, '.release-summary'), 'font-size')).toBe('25rpx');
    expect(declaration(effectiveBlock(settings, '.release-summary'), 'line-height')).toBe('42rpx');
    expect(declaration(effectiveBlock(settings, '.release-feature'), 'font-size')).toBe('25rpx');
    expect(declaration(effectiveBlock(settings, '.release-feature'), 'line-height')).toBe('42rpx');
  });

  it('统一按钮触控高度与按钮、输入控件禁用态', () => {
    expect(app).toMatch(/button\s*\{[^}]*min-height:\s*var\(--control-height\)/s);
    expect(tokens['--control-height']).toBe('96rpx');
    expect(declaration(effectiveBlock(app, '.btn'), 'min-height')).toBe('var(--control-height)');
    expect(app).not.toContain('min-height: 44px;');

    for (const selector of ['button[disabled]', 'input[disabled]', 'textarea[disabled]']) {
      const disabled = effectiveBlock(app, selector);
      expect(declaration(disabled, 'background')).toBe('var(--color-raised) !important');
      expect(declaration(disabled, 'color')).toBe('var(--color-disabled-text) !important');
      expect(declaration(disabled, 'opacity')).toBe('1');
    }
  });
});
