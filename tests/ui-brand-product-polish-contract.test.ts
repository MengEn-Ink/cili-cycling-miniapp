// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  cssBlock,
  declaration,
  effectiveBlock,
  expectSemantic,
  uiTokens,
} from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');
const pageRoots = [
  'activities',
  'activity-detail',
  'registration-form',
  'registrations',
  'credential',
  'profile',
  'capability-card',
  'profile-edit',
  'strava',
  'admin/activity-list',
  'admin/activity-edit',
  'admin/reviews',
  'admin/review-detail',
];
const logoPages = [
  'activities',
  'registrations',
  'profile',
  'activity-detail',
  'admin/reviews',
  'admin/review-detail',
];
const oldLogoClass =
  /brand-lockup|brand-bar|cili-symbol|cili-mark|mini-symbol|brand-word|brand-cn|mark-cut|brand-rule|detail-brand|desk-code|profile-code/;

describe('品牌与页面体验静态契约', () => {
  it('全局默认关闭下拉刷新，仅个人中心开放主动刷新，并统一明亮滚动边界', () => {
    const app = JSON.parse(read('miniprogram/app.json'));
    expect(app.window).toMatchObject({
      enablePullDownRefresh: false,
      backgroundColor: '#ffffff',
      backgroundColorTop: '#ffffff',
      backgroundColorBottom: '#ffffff',
      backgroundTextStyle: 'dark',
    });

    for (const page of pageRoots) {
      const config = JSON.parse(read(`miniprogram/pages/${page}/index.json`));
      expect(config, page).toMatchObject({
        enablePullDownRefresh: page === 'profile',
        backgroundColor: '#ffffff',
        backgroundColorTop: '#ffffff',
        backgroundColorBottom: '#ffffff',
        backgroundTextStyle: 'dark',
      });
      expect(config, page).not.toHaveProperty('disableScroll');
    }
  });

  it.each(logoPages)('%s 接入 brand-logo 且不残留旧 Logo class', (page) => {
    const root = `miniprogram/pages/${page}`;
    const config = JSON.parse(read(`${root}/index.json`));
    const viewAndStyles = `${read(`${root}/index.wxml`)}\n${read(`${root}/index.wxss`)}`;
    expect(config.usingComponents['brand-logo']).toBe('/components/brand-logo/index');
    expect(viewAndStyles).toContain('<brand-logo');
    expect(viewAndStyles).not.toMatch(oldLogoClass);
  });

  it('核心文案聚焦选择骑行、一起出发与我的行程', () => {
    const activities = read('miniprogram/pages/activities/index.wxml');
    const registrations = read('miniprogram/pages/registrations/index.wxml');
    const form = read('miniprogram/pages/registration-form/index.wxml');
    expect(activities).toContain('选一场骑行，一起出发');
    expect(activities).toContain('路线、时间、集合点，一眼看清');
    expect(registrations).toContain('我的行程');
    expect(registrations).not.toContain('journey-line');
    expect(form).toContain('提交后将进入审核，请确认资料准确；日常活动默认自行前往。');
    expect(`${activities}\n${registrations}\n${form}`).not.toMatch(/ROOKIE|ELITE|PELOTON/);
  });

  it('活动详情仅在字段有内容时展示说明卡片', () => {
    const detail = read('miniprogram/pages/activity-detail/index.wxml');
    expect(detail).toContain('wx:if="{{item.description}}"');
    expect(detail).toContain('wx:if="{{item.schedule && item.schedule.length}}"');
    expect(detail).toContain(
      'wx:if="{{(item.equipment && item.equipment.length) || (item.notices && item.notices.length)}}"',
    );
    expect(detail).toContain('wx:if="{{item.fee}}"');
    expect(detail).not.toContain("item.fee || '费用待补充'");
  });

  it('报名提示与骑行名片说明使用更清晰的语义色和字号', () => {
    const formStyles = read('miniprogram/pages/registration-form/index.wxss');
    const cardStyles = read('miniprogram/pages/capability-card/index.wxss');
    const stepLine = cssBlock(formStyles, '.step-line');
    const cardCaption = cssBlock(cardStyles, '.card-caption');

    expectSemantic(declaration(stepLine, 'color'), '--color-muted');
    expect(declaration(stepLine, 'font-size')).toBe('22rpx');
    expect(formStyles).toMatch(
      /\.section-hint\s*\{\s*margin-top:\s*1rpx;\s*color:\s*var\(--color-muted\);\s*font-size:\s*22rpx;/,
    );
    expectSemantic(declaration(cardCaption, 'color'), '--color-muted');
    expect(declaration(cardCaption, 'font-size')).toBe('20rpx');
  });

  it('卡片入场与关键按压反馈支持系统减少动态效果偏好', () => {
    const capability = read('miniprogram/pages/capability-card/index.wxss');
    const activityCard = read('miniprogram/components/activity-card/index.wxss');
    const profile = read('miniprogram/pages/profile/index.wxss');

    expect(capability).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.card-stage\s*\{[^}]*animation:\s*none;/,
    );
    expect(activityCard).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.activity-card--pressed\s*\{[^}]*transform:\s*none;/,
    );
    expect(profile).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.refresh-feedback-spinner\s*\{[^}]*animation-duration:\s*0\.01ms;[^}]*animation-iteration-count:\s*1;/,
    );
  });

  it('核心页面遵循瑞士网格、单一强调色与 44px 触控门禁', () => {
    const activities = read('miniprogram/pages/activities/index.wxss');
    const activityCard = read('miniprogram/components/activity-card/index.wxss');
    const detail = read('miniprogram/pages/activity-detail/index.wxss');
    const management = read('miniprogram/pages/admin/activity-list/index.wxss');
    const profile = read('miniprogram/pages/profile/index.wxss');

    for (const [styles, selector] of [
      [activities, '.activities-page'],
      [detail, '.detail-page'],
      [management, '.page.activity-list-page'],
      [profile, '.page.profile-page'],
    ] as const) {
      expect(styles).toContain(`${selector} {\n  --page-gutter: 48rpx;`);
    }

    expect(declaration(effectiveBlock(activityCard, '.activity-card'), 'border-radius')).toBe(
      'var(--radius-card)',
    );
    expect(declaration(effectiveBlock(activityCard, '.metric-item'), 'text-align')).toBe('center');
    expect(declaration(effectiveBlock(activityCard, '.card-cta'), 'min-height')).toBe(
      'var(--control-height)',
    );
    expect(declaration(effectiveBlock(detail, '.detail-page .card'), 'border-radius')).toBe(
      'var(--radius-card)',
    );
    expect(declaration(effectiveBlock(detail, '.detail-metric'), 'text-align')).toBe('center');
    expect(
      declaration(effectiveBlock(management, '.activity-list-page .status-filter'), 'min-height'),
    ).toBe('var(--control-height)');
    expect(declaration(effectiveBlock(profile, '.menu-card'), 'min-height')).toBe(
      'var(--control-height)',
    );

    const scopedStyles = `${activities}\n${activityCard}\n${detail}\n${management}\n${profile}`;
    expect(scopedStyles).not.toMatch(/#39ff14|#00ff00|lime|neon/i);
  });

  it('视觉升级保留核心旅程入口和真实事件绑定', () => {
    const activities = read('miniprogram/pages/activities/index.wxml');
    const detail = read('miniprogram/pages/activity-detail/index.wxml');
    const management = read('miniprogram/pages/admin/activity-list/index.wxml');
    const profile = read('miniprogram/pages/profile/index.wxml');

    expect(activities).toContain('bind:open="open"');
    expect(detail).toContain('class="fixed detail-action');
    expect(detail).toContain('bindtap="go"');
    expect(management).toContain('catchtap="toggleOnline"');
    expect(management).toContain('catchtap="confirmDelete"');
    expect(profile).toContain('bindtap="activities"');
    expect(profile).toContain('bindtap="openSettings"');
  });

  it('全局共享表面使用单一语义 token，并以黑白层级表达完成状态', () => {
    const appStyles = read('miniprogram/app.wxss');
    const statusStyles = read('miniprogram/components/status-pill/index.wxss');
    const tokens = uiTokens(appStyles);
    expect(tokens['--color-success']).toBe('#171717');
    expectSemantic(declaration(cssBlock(appStyles, '.card'), 'background'), '--color-surface');
    expectSemantic(declaration(cssBlock(appStyles, '.fixed'), 'background'), '--color-fixed-bar');
    const success = cssBlock(statusStyles, '.pill--success');
    expectSemantic(declaration(success, 'background'), '--color-success-soft');
    expectSemantic(declaration(success, 'border-color'), '--color-success');
    expectSemantic(declaration(success, 'color'), '--color-success-text');
    expect(`${appStyles}\n${statusStyles}`).not.toMatch(/#39ff14|#00ff00|lime|neon/i);
  });
});
