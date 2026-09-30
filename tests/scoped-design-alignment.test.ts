import { describe, expect, it } from 'vitest';
import { effectiveBlock, declaration, expectSemantic, read } from './theme-contract-helpers';

describe('报名、骑行名片与个人中心设计对齐', () => {
  it('报名表单使用连续深色表面并减少分区卡片碎片', () => {
    const page = read('miniprogram/pages/registration-form/index.ts');
    const template = read('miniprogram/pages/registration-form/index.wxml');
    const styles = read('miniprogram/pages/registration-form/index.wxss');

    expect(page).toContain('displayActivityDate: formatChinaDateTime(');
    expect(template).toContain('{{displayActivityDate}}');
    expect(template).not.toContain('{{activity.date}}');

    expect(template).toContain('class="form-surface"');
    expect(template.match(/class="form-section/g)).toHaveLength(4);
    const surface = effectiveBlock(styles, '.form-surface');
    expectSemantic(declaration(surface, 'border-radius'), '--radius-display');
    expectSemantic(declaration(surface, 'background'), '--color-surface');
    expect(styles).toMatch(/\.form-section\s*\{[^}]*border-top:\s*1rpx solid #3a3a3c/s);
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-section'), 'border-color'),
      '--color-border',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-page .submit-button'), 'background'),
      '--color-brand',
    );
    expect(styles).not.toContain('linear-gradient');
  });

  it('名片优先照片背景，保留 STRAVA 标识、真实指标网格和诚实空态', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');
    const styles = read('miniprogram/pages/capability-card/index.wxss');

    expect(template.indexOf('wx:if="{{card.hasBackgrounds}}"')).toBeLessThan(
      template.indexOf('wx:else class="card-visual alpine-fallback"'),
    );
    expect(template).toContain('STRAVA {{card.statusLabel}}');
    expect(template).toContain('wx:for="{{card.metrics}}"');
    expect(template).toContain('wx:else class="metric-empty">{{card.emptyMetricsText}}');
    expect(styles).toMatch(/\.metric-grid\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.rider-card\s*\{[^}]*min-height:\s*820rpx/s);
  });

  it('个人中心扩大照片背景，同时保持品牌头部、摘要和菜单紧凑', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('<brand-logo compact="{{true}}"');
    expect(template).toContain('hero-capability-card {{cardExpanded');
    expect(styles).toMatch(/\.profile-hero\.has-bg\s*\{[^}]*min-height:\s*600rpx/s);
    expect(styles).toMatch(/\.menu-card,\s*\.menu-card:active\s*\{[^}]*min-height:\s*88rpx/s);
    expectSemantic(declaration(effectiveBlock(styles, '.chevron'), 'color'), '--color-brand');
    expectSemantic(
      declaration(effectiveBlock(styles, '.profile-page .card'), 'background'),
      '--color-surface',
    );
  });
});
