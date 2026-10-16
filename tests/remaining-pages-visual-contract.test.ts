import { describe, expect, it } from 'vitest';
import {
  contrast,
  declaration,
  effectiveBlock,
  expectSemantic,
  read,
  resolvedHex,
  uiTokens,
} from './theme-contract-helpers';

const app = read('miniprogram/app.wxss');
const tokens = uiTokens(app);
const pages = [
  { root: 'miniprogram/pages/credential', page: '.credential-page' },
  { root: 'miniprogram/pages/admin/activity-list', page: '.activity-list-page' },
  { root: 'miniprogram/pages/profile-edit', page: '.profile-form-page' },
];

function expectReadable(foreground: string, background: string, minimum = 4.5): void {
  expect(
    contrast(resolvedHex(foreground, tokens), resolvedHex(background, tokens)),
  ).toBeGreaterThanOrEqual(minimum);
}

describe('其余页面 CILI 沸点浅色 UI 静态契约', () => {
  it.each(pages)('$root 使用明亮原生导航栏和统一语义色', ({ root, page }) => {
    const config = JSON.parse(read(`${root}/index.json`));
    const styles = read(`${root}/index.wxss`);
    expect(config.navigationBarBackgroundColor.toLowerCase()).toBe('#ffffff');
    expect(config.navigationBarTextStyle).toBe('black');
    expectSemantic(declaration(effectiveBlock(styles, page), 'background'), '--color-bg');
    expectSemantic(declaration(effectiveBlock(app, '.page'), 'color'), '--color-text');
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expectReadable('var(--color-text)', 'var(--color-bg)');
  });

  it('报名凭证页主视觉、凭证卡与集合区使用语义 token', () => {
    const styles = read('miniprogram/pages/credential/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.compact-rider-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.compact-rider-media'), 'background'),
      '--color-media-card-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.credential-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.meeting-spotlight'), 'background'),
      '--color-media-card-bg',
    );
    expectSemantic(declaration(effectiveBlock(styles, '.serial'), 'color'), '--color-muted');
    expectReadable('var(--color-muted)', 'var(--color-surface)');
    expectReadable('var(--color-on-media)', 'var(--color-media-card-bg)');
  });

  it('活动管理页卡片、筛选、克隆输入与次按钮接入统一语义色', () => {
    const styles = read('miniprogram/pages/admin/activity-list/index.wxss');
    expectSemantic(declaration(effectiveBlock(app, '.card'), 'background'), '--color-surface');
    expect(styles).toMatch(/\.status-filters\s*\{[^}]*grid-template-columns:\s*repeat\(4, 1fr\)/s);
    expectSemantic(
      declaration(effectiveBlock(app, '.field input'), 'background'),
      '--color-input-bg',
    );
    expectSemantic(declaration(effectiveBlock(app, '.field input'), 'color'), '--color-text');
    expect(declaration(effectiveBlock(app, '.secondary'), 'background')).toContain(
      'var(--color-surface)',
    );
  });

  it('编辑输入统一为 96rpx 触控高度并保持窄屏单列布局', () => {
    const activityStyles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const profileStyles = read('miniprogram/pages/profile-edit/index.wxss');
    expect(tokens['--control-height']).toBe('96rpx');
    expect(declaration(effectiveBlock(app, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(profileStyles, '.avatar-action'), 'min-height')).toBe(
      '88rpx',
    );
    expect(activityStyles).toMatch(
      /@media \(max-width:\s*340px\)[\s\S]*?\.date-time-row,[\s\S]*?grid-template-columns:\s*1fr;/s,
    );
    expect(activityStyles).not.toContain('var(--accent)');
  });

  it('活动状态标签在明亮表面保持正文级对比度', () => {
    const pill = read('miniprogram/components/status-pill/index.wxss');
    const success = effectiveBlock(pill, '.pill--success');
    const warning = effectiveBlock(pill, '.pill--warning');
    expectSemantic(declaration(success, 'color'), '--color-status-success');
    expectSemantic(declaration(success, 'background'), '--color-status-success-soft');
    expectSemantic(declaration(warning, 'color'), '--color-status-warning');
    expectSemantic(declaration(warning, 'background'), '--color-status-warning-soft');
    expectReadable('var(--color-status-success)', 'var(--color-status-success-soft)');
    expectReadable('var(--color-status-warning)', 'var(--color-status-warning-soft)');
  });

  it('创建/编辑活动页错误、标题与操作按钮使用语义主题', () => {
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-editor'), 'background'),
      '--color-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.activity-editor'), 'color'),
      '--color-text',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.form-error'), 'color'),
      '--color-brand-active',
    );
    expect(declaration(effectiveBlock(app, '.section-title'), 'font-weight')).toBe('800');
    expect(declaration(effectiveBlock(styles, '.button--primary'), 'background')).toContain(
      'var(--color-action)',
    );
  });

  it('资料编辑页标签、头像外壳、错误条与上传按钮接入统一主题', () => {
    const styles = read('miniprogram/pages/profile-edit/index.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.profile-form-page'), 'background'),
      '--color-bg',
    );
    expectSemantic(declaration(effectiveBlock(app, '.label'), 'color'), '--color-text');
    expectSemantic(
      declaration(effectiveBlock(styles, '.avatar-preview-shell'), 'background'),
      '--color-raised',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-error'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.photo-action'), 'background'),
      '--color-surface',
    );
    expect(declaration(effectiveBlock(app, '.photo-action'), 'min-height')).toBe(
      'var(--control-height)',
    );
  });
});
