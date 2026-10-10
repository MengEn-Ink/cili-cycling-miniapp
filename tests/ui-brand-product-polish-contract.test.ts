// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssBlock, declaration, expectSemantic, uiTokens } from './theme-contract-helpers';

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

  it('核心文案聚焦发现活动、报名出发与我的行程', () => {
    const activities = read('miniprogram/pages/activities/index.wxml');
    const registrations = read('miniprogram/pages/registrations/index.wxml');
    const form = read('miniprogram/pages/registration-form/index.wxml');
    expect(activities).toContain('<view>发现活动</view>');
    expect(activities).toContain('<view>报名出发</view>');
    expect(registrations).toContain('我的行程');
    expect(registrations).not.toContain('journey-line');
    expect(form).toContain('提交后将进入审核，请确认联系信息与集合方式准确。');
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
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.settings-entry:active\s*\{[^}]*transform:\s*none;/,
    );
  });

  it('全局共享表面使用单一语义 token，并提供低饱和成功状态', () => {
    const appStyles = read('miniprogram/app.wxss');
    const statusStyles = read('miniprogram/components/status-pill/index.wxss');
    const tokens = uiTokens(appStyles);
    expect(tokens['--color-success']).toBe('#356348');
    expectSemantic(declaration(cssBlock(appStyles, '.card'), 'background'), '--color-surface');
    expectSemantic(declaration(cssBlock(appStyles, '.fixed'), 'background'), '--color-fixed-bar');
    const success = cssBlock(statusStyles, '.pill--success');
    expectSemantic(declaration(success, 'background'), '--color-success-soft');
    expectSemantic(declaration(success, 'border-color'), '--color-success');
    expectSemantic(declaration(success, 'color'), '--color-success-text');
    expect(`${appStyles}\n${statusStyles}`).not.toMatch(/#39ff14|#00ff00|lime|neon/i);
  });
});
