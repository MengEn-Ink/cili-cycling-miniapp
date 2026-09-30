import { describe, expect, it } from 'vitest';
import { read, themeTokens } from './theme-contract-helpers';

const darkPages = [
  'miniprogram/pages/registrations',
  'miniprogram/pages/profile',
  'miniprogram/pages/capability-card',
  'miniprogram/pages/admin/reviews',
  'miniprogram/pages/admin/review-detail',
];
const logoPages = [
  'miniprogram/pages/activities',
  'miniprogram/pages/registrations',
  'miniprogram/pages/profile',
  'miniprogram/pages/activity-detail',
  'miniprogram/pages/admin/reviews',
  'miniprogram/pages/admin/review-detail',
];

const legacyLogoClass =
  /brand-lockup|brand-bar|cili-symbol|cili-mark|mini-symbol|brand-word|brand-cn|mark-cut|brand-rule|detail-brand|desk-code|profile-code/;

describe('CILI 双主题竞技页面静态契约', () => {
  it.each(darkPages)('%s 默认继承暗色 token，并通过语义品牌色支持双主题', (root) => {
    const styles = read(`${root}/index.wxss`).toLowerCase();
    const config = JSON.parse(read(`${root}/index.json`));
    const appStyles = read('miniprogram/app.wxss');
    const dark = themeTokens(appStyles, 'dark');
    const light = themeTokens(appStyles, 'light');

    expect(dark['--color-bg']).toBe('#0b0b0c');
    expect(dark['--color-brand']).toBe('#d55b1f');
    expect(light['--color-bg']).not.toBe(dark['--color-bg']);
    expect(styles).toContain('var(--color-bg)');
    expect(styles).toContain('var(--color-brand)');
    expect(config.navigationBarBackgroundColor.toLowerCase()).toBe('#0b0b0c');
    expect(config.navigationBarTextStyle).toBe('white');
  });

  it.each(logoPages)('%s 使用统一品牌组件且不残留旧 Logo 实现', (root) => {
    const template = read(`${root}/index.wxml`);
    const styles = read(`${root}/index.wxss`);
    const config = JSON.parse(read(`${root}/index.json`));

    expect(template).toContain('<brand-logo');
    expect(config.usingComponents['brand-logo']).toBe('/components/brand-logo/index');
    expect(`${template}\n${styles}`).not.toMatch(legacyLogoClass);
  });

  it('审核列表保留权限校验、筛选和导航事件', () => {
    const source = read('miniprogram/pages/admin/reviews/index.ts');
    const template = read('miniprogram/pages/admin/reviews/index.wxml');

    expect(source).toContain("appStore.role !== 'admin'");
    expect(source).toContain("appStore.authStatus !== 'authenticated'");
    expect(template).toContain('bindchange="choose"');
    expect(template).toContain('bindtap="tab"');
    expect(template).toContain('bindtap="open"');
  });

  it('审核详情展示验证来源，但不展示用车方式、实名或手机号字段源值', () => {
    const template = read('miniprogram/pages/admin/review-detail/index.wxml');
    const source = read('miniprogram/pages/admin/review-detail/index.ts');

    expect(template).toContain('wx:if="{{x.gatheringMode}}"');
    expect(template).toContain('{{phoneSource}}');
    expect(source).toContain('phoneSource:');
    expect(template).not.toMatch(
      /card\.bikeMode|车辆方式|报名用车|profile\.realName|profile\.phone|实名资料/,
    );
    expect(source).not.toMatch(/maskPhone/);
  });

  it('个人名片继续保留 Strava 缺失修复条件和私有提示', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');

    expect(template).toContain('wx:if="{{card.needsStravaRepair}}"');
    expect(template).toContain('wx:if="{{card.needsProfilePhoto}}"');
    expect(template).toContain('仅自己可见 · 不作为活动审核依据');
  });
});
