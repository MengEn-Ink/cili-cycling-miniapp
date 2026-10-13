import { describe, expect, it } from 'vitest';
import { effectiveBlock, declaration, expectSemantic, read } from './theme-contract-helpers';

describe('报名、骑行名片与个人中心设计对齐', () => {
  it('报名表单使用连续明亮表面并减少分区卡片碎片', () => {
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
    expect(styles).toMatch(
      /\.form-section\s*\{[^}]*border-top:\s*1rpx solid var\(--color-border\)/s,
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-section'), 'border-color'),
      '--color-border',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-page .submit-button'), 'background'),
      '--color-action',
    );
    expect(styles).not.toContain('linear-gradient');
  });

  it('名片优先照片背景，只展示本人维护的公开资料', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');
    const styles = read('miniprogram/pages/capability-card/index.wxss');

    expect(template.indexOf('wx:if="{{card.hasBackgrounds}}"')).toBeLessThan(
      template.indexOf('wx:else class="card-visual alpine-fallback"'),
    );
    expect(template).toContain('公开骑行名片');
    expect(template).toContain('这是你在活动中展示的公开资料');
    expect(template).toContain('昵称、头像和照片由你维护');
    expect(template).not.toMatch(/lifetimeMetrics|recentMetrics|emptyMetricsText|STRAVA/);
    expect(styles).toMatch(/\.capability-page\s*\{[^}]*padding:\s*18rpx var\(--page-gutter\)/s);
    expect(styles).toMatch(/\.rider-card\s*\{[^}]*min-height:\s*980rpx/s);
    expect(styles).toMatch(/\.photo-button[^}]*\{[^}]*min-height:\s*var\(--control-height\)/s);
  });

  it('个人中心保留微信身份与紧凑菜单，默认隐藏 Strava 指标', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('<brand-logo compact="{{true}}"');
    expect(template).not.toContain('class="profile-capability-section"');
    expect(template).not.toContain('class="hero-capability-metrics"');
    expect(template).not.toContain('cardExpanded');
    expect(template).toContain('class="profile-refresh-feedback');
    expect(styles).toMatch(/\.profile-hero\.has-bg\s*\{[^}]*min-height:\s*600rpx/s);
    expect(declaration(effectiveBlock(styles, '.menu-card'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expectSemantic(declaration(effectiveBlock(styles, '.chevron'), 'color'), '--color-brand');
    expectSemantic(
      declaration(effectiveBlock(styles, '.menu-list'), 'background'),
      '--color-surface',
    );
  });
});
