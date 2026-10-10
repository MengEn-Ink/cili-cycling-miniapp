import { describe, expect, it } from 'vitest';
import {
  contrast,
  effectiveBlock,
  declaration,
  expectSemantic,
  read,
  resolvedHex,
  rpx,
  themeTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const dark = themeTokens(app, 'dark');
const light = themeTokens(app, 'light');
const themes = [dark, light];
const pages = [
  { root: 'miniprogram/pages/strava', page: '.strava-page' },
  { root: 'miniprogram/pages/credential', page: '.page.credential-page' },
  { root: 'miniprogram/pages/admin/activity-list', page: '.activity-list-page' },
  { root: 'miniprogram/pages/profile-edit', page: '.profile-form-page' },
];

function expectReadable(foreground: string, background: string, minimum = 4.5): void {
  for (const tokens of themes) {
    expect(
      contrast(resolvedHex(foreground, tokens), resolvedHex(background, tokens)),
    ).toBeGreaterThanOrEqual(minimum);
  }
}

describe('其余页面 CILI 双主题接入静态契约', () => {
  it.each(pages)('$root 保留暗色原生导航栏，页面使用双主题语义色', ({ root, page }) => {
    const config = JSON.parse(read(`${root}/index.json`));
    expect(config.navigationBarBackgroundColor.toLowerCase()).toBe('#0b0b0c');
    expect(config.navigationBarTextStyle).toBe('white');
    const block = effectiveBlock(read(`${root}/index.wxss`), page);
    expectSemantic(declaration(block, 'background'), '--color-bg');
    expectSemantic(declaration(block, 'color'), '--color-text');
    expectReadable('var(--color-text)', 'var(--color-bg)');
  });

  it('Strava 页状态卡、数据指标与次按钮使用语义表面且双主题可读', () => {
    const styles = read('miniprogram/pages/strava/index.wxss');
    const status = effectiveBlock(styles, '.status-card');
    expectSemantic(declaration(status, 'background'), '--color-surface');
    expectSemantic(declaration(status, 'color'), '--color-text');
    expectSemantic(declaration(effectiveBlock(styles, '.status-help'), 'color'), '--color-muted');
    const card = effectiveBlock(styles, '.strava-page .card');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    const metric = effectiveBlock(styles, '.strava-page .metric');
    expectSemantic(declaration(metric, 'background'), '--color-raised');
    expectSemantic(declaration(metric, 'color'), '--color-muted');
    expectReadable('var(--color-muted)', 'var(--color-raised)');
    expectReadable('var(--color-brand)', 'var(--color-raised)', 3);
    expectSemantic(
      declaration(effectiveBlock(styles, '.strava-page .secondary'), 'background'),
      '--color-input-bg',
    );
  });

  it('报名凭证页主视觉、凭证卡与时间线使用语义 token', () => {
    const styles = read('miniprogram/pages/credential/index.wxss');
    for (const selector of ['.status-hero', '.credential-card', '.credential-page .card']) {
      expectSemantic(
        declaration(effectiveBlock(styles, selector), 'background'),
        '--color-surface',
      );
    }
    expectSemantic(declaration(effectiveBlock(styles, '.serial'), 'color'), '--color-brand');
    expectSemantic(
      declaration(effectiveBlock(styles, '.meet-info'), 'background'),
      '--color-raised',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.review-comment'), 'color'),
      '--color-muted',
    );
    expectReadable('var(--color-muted)', 'var(--color-raised)');

    const statusTokens = {
      pending: ['--color-warning', '--color-warning-soft'],
      approved: ['--color-success', '--color-success-soft'],
      rejected: ['--color-danger', '--color-danger-soft'],
      cancelled: ['--color-border-strong', '--color-raised'],
    } as const;
    for (const [status, [border, background]] of Object.entries(statusTokens)) {
      const block = effectiveBlock(styles, `.status-${status}`);
      expectSemantic(declaration(block, 'border-color'), border);
      expectSemantic(declaration(block, 'background'), background);
    }
    expectReadable('var(--color-text)', 'var(--color-surface)');
  });

  it('活动管理页卡片、标签、克隆输入与次按钮接入双主题语义色', () => {
    const styles = read('miniprogram/pages/admin/activity-list/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-list-page .card'), 'background'),
      '--color-surface',
    );
    const tag = effectiveBlock(styles, '.activity-list-page .tag');
    expectSemantic(declaration(tag, 'background'), '--color-raised');
    expectSemantic(declaration(tag, 'color'), '--color-muted');
    const input = effectiveBlock(styles, '.activity-list-page .field input');
    expectSemantic(declaration(input, 'background'), '--color-input-bg');
    expectSemantic(declaration(input, 'color'), '--color-text');
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-list-page .secondary'), 'background'),
      '--color-input-bg',
    );
  });

  it('编辑输入统一为 88rpx 触控高度并保持窄屏单列布局', () => {
    const activityStyles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const activityControls =
      activityStyles.match(/\.field input,\s*\.field textarea\s*\{([^}]*)\}/s)?.[1] || '';
    const narrowLayout =
      activityStyles.match(/@media \(max-width:\s*(\d+)px\)\s*\{([\s\S]*?)\n\}/)?.slice(1) || [];
    const profileInput = effectiveBlock(
      read('miniprogram/pages/profile-edit/index.wxss'),
      '.form-card .input',
    );
    const cloneInput = effectiveBlock(
      read('miniprogram/pages/admin/activity-list/index.wxss'),
      '.activity-list-page .field input',
    );
    expect(declaration(activityControls, 'min-height')).toBe('var(--control-height)');
    expect(declaration(profileInput, 'min-height')).toBe('var(--control-height)');
    expect(declaration(cloneInput, 'min-height')).toBe('var(--control-height)');
    expect(Number(narrowLayout[0])).toBeGreaterThanOrEqual(430);
    expect(narrowLayout[1]).toMatch(/\.split\s*\{[^}]*grid-template-columns:\s*1fr;/s);
    expect(activityStyles).not.toContain('var(--accent)');
  });

  it('活动状态标签在暗色与浅色表面均保持正文级对比度', () => {
    const tag = effectiveBlock(
      read('miniprogram/pages/admin/activity-list/index.wxss'),
      '.activity-list-page .tag',
    );
    expectSemantic(declaration(tag, 'color'), '--color-muted');
    expectSemantic(declaration(tag, 'background'), '--color-raised');
    expectReadable('var(--color-muted)', 'var(--color-raised)');
  });

  it('创建/编辑活动页错误卡、标题与次按钮使用语义主题', () => {
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-form-page .card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-form-page .card.danger'), 'background'),
      '--color-danger-soft',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-form-page .secondary'), 'background'),
      '--color-input-bg',
    );
    expectSemantic(declaration(effectiveBlock(styles, '.section-title'), 'color'), '--color-text');
  });

  it('资料编辑页标签、头像外壳、错误条与上传按钮接入双主题', () => {
    const styles = read('miniprogram/pages/profile-edit/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.profile-form-page .form-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.profile-form-page .form-card .label'), 'color'),
      '--color-muted',
    );
    expectReadable('var(--color-muted)', 'var(--color-surface)');
    expectSemantic(
      declaration(effectiveBlock(styles, '.avatar-preview-shell'), 'background'),
      '--color-raised',
    );
    expect(
      declaration(effectiveBlock(styles, '.profile-form-page .form-error'), 'background'),
    ).toContain('rgba(200');
    expectSemantic(
      declaration(effectiveBlock(styles, '.profile-form-page .photo-action'), 'background'),
      '--color-raised',
    );
    expect(
      rpx(effectiveBlock(styles, '.profile-form-page .photo-action'), 'min-height'),
    ).toBeGreaterThanOrEqual(88);
  });
});
