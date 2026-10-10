import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic, read } from './theme-contract-helpers';

describe('HP-20261010-02 第一批六页尺寸契约', () => {
  it('活动首页使用 16px 边距、40px 分段控件和 12px 活动间距', () => {
    const styles = read('miniprogram/pages/activities/index.wxss');
    const page = effectiveBlock(styles, '.activities-page');
    expect(declaration(page, 'padding-right')).toBe('var(--page-gutter)');
    expect(declaration(page, 'padding-left')).toBe('var(--page-gutter)');
    expect(declaration(effectiveBlock(styles, '.timeline-tab'), 'min-height')).toBe(
      'var(--segment-height)',
    );
    expect(declaration(effectiveBlock(styles, '.activity-results'), 'row-gap')).toBe(
      'var(--card-gap)',
    );
    expect(declaration(effectiveBlock(styles, '.page-title'), 'font-size')).toBe('48rpx');
  });

  it('我的行程使用白底 2px 描边卡片和可读序号', () => {
    const styles = read('miniprogram/pages/registrations/index.wxss');
    const list = effectiveBlock(styles, '.registration-list');
    const card = effectiveBlock(styles, '.registration-card');
    expect(declaration(list, 'gap')).toBe('var(--card-gap)');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border-width')).toBe('4rpx');
    expectSemantic(declaration(card, 'border-color'), '--color-card-border');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    expectSemantic(declaration(card, 'box-shadow'), '--shadow-card');
    expectSemantic(declaration(effectiveBlock(styles, '.card-index'), 'color'), '--color-muted');
  });

  it('活动详情使用 16px 内容卡、48px 路线操作和安全区 CTA', () => {
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    const metrics = effectiveBlock(styles, '.metric-panel');
    const card = effectiveBlock(styles, '.detail-page .card');
    expect(declaration(metrics, 'border-width')).toBe('4rpx');
    expectSemantic(declaration(metrics, 'border-radius'), '--radius-card');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border-width')).toBe('4rpx');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    for (const selector of ['.route-actions button', '.route-location-row button']) {
      expect(declaration(effectiveBlock(styles, selector), 'min-height')).toBe(
        'var(--control-height)',
      );
    }
    expect(declaration(effectiveBlock(styles, '.detail-action .btn'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(styles).toContain('calc(12rpx + env(safe-area-inset-bottom))');
  });

  it('创建活动在 375px 使用单列、16px 卡片和 48px 控件', () => {
    const styles = read('miniprogram/pages/admin/activity-edit/index.wxss');
    const page = effectiveBlock(styles, '.activity-form-page');
    const card = effectiveBlock(styles, '.form-card');
    expect(declaration(page, 'padding-right')).toBe('var(--page-gutter)');
    expect(declaration(page, 'padding-left')).toBe('var(--page-gutter)');
    expect(declaration(effectiveBlock(styles, '.mode-grid'), 'grid-template-columns')).toBe('1fr');
    expect(declaration(effectiveBlock(styles, '.split'), 'grid-template-columns')).toBe('1fr');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border-width')).toBe('4rpx');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    expect(declaration(effectiveBlock(styles, '.field input'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(styles, '.actions button'), 'min-height')).toBe(
      'var(--control-height)',
    );
  });

  it('个人中心保留媒体 Hero，其余卡片回到明亮描边结构', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');
    expect(template).toContain('aria-label="打开设置"');
    expect(template).not.toContain('<text>设置</text>');
    expect(declaration(effectiveBlock(styles, '.settings-entry'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(styles, '.profile-hero'), 'min-height')).toBe('640rpx');
    const card = effectiveBlock(styles, '.profile-page .profile-card');
    expect(declaration(card, 'padding')).toBe('32rpx');
    expect(declaration(card, 'border-width')).toBe('4rpx');
    expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    expect(declaration(effectiveBlock(styles, '.menu-card'), 'min-height')).toBe(
      'var(--control-height)',
    );
  });

  it('设置页使用 16px 边距、紧凑标题、16px 卡片和 48px 操作', () => {
    const styles = read('miniprogram/pages/settings/index.wxss');
    const page = effectiveBlock(styles, '.settings-page');
    const strava = effectiveBlock(styles, '.strava-settings-card');
    const release = effectiveBlock(styles, '.release-content');
    expect(declaration(page, 'padding-right')).toBe('var(--page-gutter)');
    expect(declaration(page, 'padding-left')).toBe('var(--page-gutter)');
    expect(declaration(effectiveBlock(styles, '.hero-title'), 'font-size')).toBe('48rpx');
    for (const card of [strava, release]) {
      expect(declaration(card, 'padding')).toBe('32rpx');
      expect(declaration(card, 'border-width')).toBe('4rpx');
      expectSemantic(declaration(card, 'border-radius'), '--radius-card');
    }
    expect(declaration(effectiveBlock(styles, '.strava-actions button'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(styles).not.toMatch(/theme-option|theme-preview|appearance-card/);
  });
});
