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
    expectSemantic(declaration(section, 'border-radius'), '--radius-card');
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-card'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(styles, '.form-page .submit-button'), 'background'),
      '--color-action',
    );
    expect(styles).not.toContain('linear-gradient');
  });

  it('旧名片页重定向到融合头像和背景的我的页面', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');
    const source = read('miniprogram/pages/capability-card/index.ts');
    const profile = read('miniprogram/pages/profile/index.wxml');
    const profileStyles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('loading-copy="你的头像和背景就是骑行名片"');
    expect(source).toContain('wx.switchTab({');
    expect(source).toContain("url: '/pages/profile/index'");
    expect(profile).toContain('wx:if="{{heroBackgrounds.length}}"');
    expect(profile).toContain('wx:elif="{{heroFallbackImageUrl}}"');
    expect(profile).toContain('wx:else class="hero-alpine"');
    expect(profileStyles).toMatch(/\.profile-hero\s*\{[^}]*min-height:\s*680rpx/s);
    expect(`${template}\n${source}`).not.toMatch(/lifetimeMetrics|recentMetrics|STRAVA/);
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
    // 松手无动作的自定义指示器已移除，只保留原生下拉刷新与顶部非阻断提示
    expect(template).not.toContain('profile-refresh-feedback');
    expect(template).not.toContain('bindtouchstart');
    expect(template).toContain('class="refresh-note');
    expect(styles).toMatch(/\.profile-hero\s*\{[^}]*min-height:\s*680rpx/s);
    expect(declaration(effectiveBlock(styles, '.menu-card'), 'min-height')).toBe('144rpx');
    expectSemantic(declaration(effectiveBlock(styles, '.chevron'), 'color'), '--color-muted');
    expectSemantic(declaration(effectiveBlock(styles, '.menu-list'), 'background'), '--color-bg');
  });
});
