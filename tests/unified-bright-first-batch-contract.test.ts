import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic, read } from './theme-contract-helpers';

describe('HP-20261010-02 第一批六页尺寸契约', () => {
  it('活动首页使用统一页边距、40px 分段控件和完整卡片轮播', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/activities/index.wxss');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(declaration(effectiveBlock(app, '.timeline-tab'), 'min-height')).toBe(
      'var(--segment-height)',
    );
    expect(declaration(effectiveBlock(styles, '.activity-carousel'), 'height')).toBe('1040rpx');
    expect(declaration(effectiveBlock(app, '.page-title'), 'font-size')).toBe('48rpx');
  });

  it('我的行程使用白底 2px 描边卡片和可读序号', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/registrations/index.wxss');
    const list = effectiveBlock(styles, '.registration-list');
    const card = effectiveBlock(app, '.registration-card');
    expect(declaration(list, 'gap')).toBe('var(--card-gap)');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border')).toBe('4rpx solid var(--color-card-border)');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    expect(declaration(card, 'box-shadow')).toBe('none');
    expectSemantic(declaration(effectiveBlock(styles, '.card-index'), 'color'), '--color-muted');
  });

  it('活动详情使用统一同级分区、紧凑路线操作和安全区 CTA', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    const metrics = effectiveBlock(app, '.metric-panel');
    const card = effectiveBlock(app, '.card');
    expect(declaration(metrics, 'border')).toBe('2rpx solid var(--color-border)');
    expect(declaration(metrics, 'border-radius')).toBe('var(--radius-card)');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border')).toBe('4rpx solid var(--color-card-border)');
    expect(declaration(card, 'border-radius')).toBe('var(--radius-card)');
    expect(declaration(effectiveBlock(styles, '.route-location-row button'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(app, '.btn'), 'min-height')).toBe('var(--control-height)');
    expect(app).toContain('calc(16rpx + env(safe-area-inset-bottom))');
  });

  it('创建活动使用统一页边距、16px 卡片和 44px 控件', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const card = effectiveBlock(app, '.form-card');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(styles).toMatch(/\.date-time-row\s*\{[^}]*grid-template-columns:\s*1fr 1fr/s);
    expect(declaration(effectiveBlock(styles, '.date-time-row'), 'grid-template-columns')).toBe(
      '1fr',
    );
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border')).toBe('4rpx solid var(--color-card-border)');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    expect(declaration(effectiveBlock(app, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(app, '.btn'), 'min-height')).toBe('var(--control-height)');
  });

  it('个人中心保留媒体 Hero，其余卡片回到明亮描边结构', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');
    expect(template).toContain('bindtap="openSettings"');
    expect(template).toContain('aria-label="打开设置"');
    expect(template).not.toContain('<text>设置</text>');
    expect(styles).toMatch(/\.profile-hero\s*\{[^}]*min-height:\s*360rpx/s);
    const card = effectiveBlock(styles, '.menu-list');
    expect(declaration(card, 'border')).toBe('4rpx solid var(--color-border-strong)');
    expect(declaration(card, 'border-radius')).toBe('var(--radius-card)');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    expect(declaration(effectiveBlock(styles, '.menu-card'), 'min-height')).toBe('120rpx');
  });

  it('设置页使用统一边距、四级标题和 16px 卡片', () => {
    const app = read('miniprogram/app.wxss');
    const styles = read('miniprogram/pages/settings/index.wxss');
    const release = effectiveBlock(styles, '.release-content');
    const releaseCard = effectiveBlock(styles, '.release-card');
    expect(app).toContain('padding: 32rpx var(--page-gutter);');
    expect(declaration(effectiveBlock(styles, '.hero-title'), 'font-size')).toBe('48rpx');
    expect(declaration(release, 'padding')).toBe('28rpx');
    expect(declaration(releaseCard, 'border')).toBe('4rpx solid var(--color-border-strong)');
    expectSemantic(declaration(releaseCard, 'border-radius'), '--radius-card');
    expect(styles).not.toMatch(/theme-option|theme-preview|appearance-card/);
  });

  it('报名凭证页禁用深色硬编码色并把关键文字收口到明亮 token', () => {
    const styles = read('miniprogram/pages/credential/index.wxss');
    const forbidden = [
      '#f7f7f5',
      '#c8c8cc',
      '#a8a8ad',
      '#9bc2aa',
      '#e9a071',
      '#6f9b82',
      '#1b1b1d',
      '#1c1c1e',
      '#151517',
      '#242427',
      '#2c2c2e',
      '#343438',
      '#3a3a3c',
      '#3a3a3e',
      '#ff8f86',
    ];
    for (const value of forbidden) {
      expect(styles.toLowerCase()).not.toContain(value);
    }
    const app = read('miniprogram/app.wxss');
    expectSemantic(
      declaration(effectiveBlock(styles, '.credential-page'), 'background'),
      '--color-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.credential-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(declaration(effectiveBlock(styles, '.serial'), 'color'), '--color-muted');
    expectSemantic(
      declaration(effectiveBlock(app, '.approved-mark'), 'color'),
      '--color-status-success',
    );
    expectSemantic(
      declaration(effectiveBlock(app, '.approved-mark'), 'background'),
      '--color-status-success-soft',
    );
  });
});
