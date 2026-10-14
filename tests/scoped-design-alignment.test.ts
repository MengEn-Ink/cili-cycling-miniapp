import { describe, expect, it } from 'vitest';
import { effectiveBlock, declaration, expectSemantic, read } from './theme-contract-helpers';

describe('报名、骑行名片与个人中心设计对齐', () => {
  it('报名表单使用四张同级分区卡片，不再嵌套外层表面', () => {
    const page = read('miniprogram/pages/registration-form/index.ts');
    const template = read('miniprogram/pages/registration-form/index.wxml');
    const styles = read('miniprogram/pages/registration-form/index.wxss');

    expect(page).toContain('displayActivityDate: formatChinaDateTime(');
    expect(template).toContain('{{displayActivityDate}}');
    expect(template).not.toContain('{{activity.date}}');

    expect(template).not.toContain('class="form-surface"');
    expect(template.match(/class="form-section form-card/g)).toHaveLength(4);
    const section = effectiveBlock(styles, '.form-section');
    expect(section).toContain('border: 2rpx solid var(--color-border)');
    expectSemantic(declaration(section, 'border-radius'), '--radius-display');
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-page .submit-button'), 'background'),
      '--color-brand',
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
    expect(styles).toMatch(/\.capability-page\s*\{[^}]*padding:\s*32rpx var\(--page-gutter\)/s);
    expect(styles).toMatch(/\.card-visual\s*\{[^}]*height:\s*336rpx/s);
    expect(
      declaration(effectiveBlock(read('miniprogram/app.wxss'), '.photo-button'), 'min-height'),
    ).toBe('var(--control-height)');
  });

  it('个人中心保留微信身份与紧凑菜单，默认隐藏 Strava 指标', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('<brand-logo compact="{{true}}"');
    expect(template).not.toContain('class="profile-capability-section"');
    expect(template).not.toContain('class="hero-capability-metrics"');
    expect(template).not.toContain('cardExpanded');
    expect(template).toContain('class="profile-refresh-feedback');
    expect(styles).toMatch(/\.profile-hero\s*\{[^}]*min-height:\s*360rpx/s);
    expect(declaration(effectiveBlock(styles, '.menu-card'), 'min-height')).toBe('120rpx');
    expectSemantic(declaration(effectiveBlock(styles, '.chevron'), 'color'), '--color-muted');
    expectSemantic(
      declaration(effectiveBlock(styles, '.menu-list'), 'background'),
      '--color-surface',
    );
  });
});
