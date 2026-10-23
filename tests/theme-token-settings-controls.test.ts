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

describe('设置页 · 骑行影像志设计稿样式契约（settings.html 1:1）', () => {
  it('暖纸底色与宋体编辑式 pageheading 对齐设计稿，不复用旧行动红大块', () => {
    const page = effectiveBlock(settings, '.settings-page');
    expectSemantic(declaration(page, 'background'), '--color-bg');
    expectSemantic(declaration(page, 'color'), '--color-text');

    const heading = effectiveBlock(settings, '.pageheading');
    expectSemantic(declaration(heading, 'background'), '--color-bg');
    expectSemantic(declaration(heading, 'color'), '--color-text');
    expect(declaration(heading, 'background')).not.toContain('--color-action');

    const headingTitle = effectiveBlock(settings, '.pageheading-title');
    expect(declaration(headingTitle, 'font-family')).toContain('--font-family-editorial');
    expect(declaration(headingTitle, 'font-size')).toBe('64rpx');
    expect(declaration(headingTitle, 'line-height')).toBe('80rpx');

    const sub = effectiveBlock(settings, '.pageheading-sub');
    expectSemantic(declaration(sub, 'color'), '--color-muted');

    // 共享 token 仍被页面消费（骑行影像志统一视觉基线）
    expect(tokens['--color-border-subtle']).toBe('var(--color-border)');
    expect(tokens['--font-mono']).toBe('var(--font-family-mono)');
    expect(tokens['--font-family-mono']).toContain('ui-monospace');
    expect(tokens['--font-family-mono']).toContain('monospace');
    expect(settings).toContain('var(--font-mono)');
  });

  it('每个 section 使用无横线章节标题，入口使用 52px 紧凑分隔行并保持完整触控区', () => {
    const chapterTitle = effectiveBlock(settings, '.chapterhead-title');
    expect(declaration(chapterTitle, 'font-family')).toContain('--font-family-editorial');
    const chapterRule = effectiveBlock(settings, '.chapterhead-rule');
    expect(declaration(chapterRule, 'display')).toBe('none');

    const row = effectiveBlock(settings, '.row.rowlink.rowbutton');
    expect(declaration(row, 'min-height')).toBe('104rpx');
    expect(declaration(row, 'background')).toBe('transparent');
    expectSemantic(declaration(row, 'color'), '--color-text');
    expect(declaration(row, 'border')).toBe('0');
    expect(declaration(row, 'border-bottom')).toContain('var(--color-border)');

    expectSemantic(declaration(effectiveBlock(settings, '.rowtext-sub'), 'color'), '--color-muted');
    // 行内行动色不应该直接漆到次级操作，避免整页行动红饱和
    expect(declaration(effectiveBlock(settings, '.rowtext-title'), 'color')).not.toContain(
      '--color-action',
    );
  });

  it('应用 section 的 detailrows 承载当前版本与本次更新，使用两列紧凑排版', () => {
    const detailrows = effectiveBlock(settings, '.detailrows');
    expect(declaration(detailrows, 'background')).toBe('transparent');
    expect(declaration(detailrows, 'border')).toBe('0');

    const detailrow = effectiveBlock(settings, '.detailrow');
    expect(declaration(detailrow, 'display')).toBe('grid');
    expect(declaration(detailrow, 'grid-template-columns')).toContain('minmax');
    expect(declaration(detailrow, 'border-bottom')).toContain('var(--color-border)');

    expectSemantic(
      declaration(effectiveBlock(settings, '.detailrow-term'), 'color'),
      '--color-muted',
    );
    expect(declaration(effectiveBlock(settings, '.detailrow-desc'), 'font-family')).toContain(
      '--font-mono',
    );

    // 不再渲染独立 release-card / release-feature 等旧 Oil UI 结构
    expect(settings).not.toContain('.release-card');
    expect(settings).not.toContain('.release-feature');
    expect(settings).not.toContain('.release-list');
    expect(settings).not.toContain('.management-list');
    expect(settings).not.toContain('.management-row');
  });

  it('全局按钮触控高度与按钮、输入控件禁用态仍遵守沸点基线', () => {
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
