import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cssBlock, declaration, expectSemantic, themeTokens } from './theme-contract-helpers';

const read = (path) => fs.readFileSync(path, 'utf8');
const activities = read('miniprogram/pages/activities/index.wxml');
const activitiesStyles = read('miniprogram/pages/activities/index.wxss');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
const detail = read('miniprogram/pages/activity-detail/index.wxml');
const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
const logo = read('miniprogram/components/brand-logo/index.wxml');
const themeSources = [
  read('miniprogram/app.wxss'),
  read('miniprogram/components/brand-logo/index.wxss'),
  read('miniprogram/components/activity-card/index.wxss'),
  read('miniprogram/components/status-pill/index.wxss'),
  read('miniprogram/components/state-view/index.wxss'),
  read('miniprogram/pages/activities/index.wxss'),
  read('miniprogram/pages/activity-detail/index.wxss'),
].join('\n');

describe('CILI 活动页静态契约', () => {
  it('活动列表与详情使用统一 CILI 品牌组件', () => {
    expect(activities).toContain('<brand-logo');
    expect(detail).toContain('<brand-logo');
    expect(logo).toContain('class="brand-logo__symbol"');
    expect(logo).toContain('class="brand-logo__word">CILI');
    expect(logo).toContain('class="brand-logo__cn">此里');
  });

  it('活动列表和详情继续渲染现有关键字段', () => {
    expect(activities).toContain('item="{{item}}"');
    expect(detail).toContain('{{item.title}}');
    expect(detail).toContain('{{displayDate}}');
    expect(detail).toContain('{{item.route.distanceKm}}');
    expect(detail).toContain('{{item.route.elevationM}}');
    expect(detail).toContain('{{item.capacity}}');
    expect(detail).toContain('{{activityAction.label}}');
  });

  it('活动卡保留真实字段、三列指标、状态、占位和点击反馈', () => {
    expect(activityCard).toContain('wx:if="{{item.coverImage && !coverFailed}}"');
    expect(activityCard).toContain('src="{{item.coverImage}}"');
    expect(activityCard).toContain('binderror="coverImageError"');
    expect(activityCard).toContain('<status-pill status="{{item.displayStatus}}" />');
    expect(activityCard.match(/class="metric-item"/g)).toHaveLength(3);
    expect(activityCard).toContain(
      "item.capacity > 0 ? (item.occupied + ' / ' + item.capacity + ' 人已报名') : '名额确认中'",
    );
    expect(activityCard).toContain('hover-class="activity-card--pressed"');
    expect(activityCard).toContain('wx:else class="card-placeholder"');
    expect(activityCard).toContain('class="card-cta"');
    expect(activityCard).toContain('查看详情');
    expect(activityCard).toContain('{{item.displayDate}}');
    expect(activityCardStyles).toContain('.activity-card--pressed');
    expect(activityCardStyles).toContain('.card-placeholder');
    const cta = cssBlock(activityCardStyles, '.card-cta');
    expectSemantic(declaration(cta, 'background'), '--color-brand');
    expectSemantic(declaration(cta, 'color'), '--color-on-brand');
    expect(declaration(cta, 'min-height')).toBe('88rpx');
  });

  it('列表压缩首屏介绍并前置活动卡，详情压缩 Hero、时间轴并保留吸底安全区', () => {
    expect(activities).toContain('class="activities-intro"');
    expect(activities).not.toContain('class="hero hero--compact activities-hero"');
    expect(detail).toContain('class="hero-media"');
    expect(detail).toContain('wx:if="{{galleryImages.length > 1 && !coverFailed}}"');
    expect(detail).toContain('wx:elif="{{galleryImages.length === 1 && !coverFailed}}"');
    expect(detail).toContain('binderror="galleryImageError"');
    expect(detail).toContain('binderror="coverImageError"');
    expect(detail).toContain('class="schedule-track"');
    expect(detailStyles).toMatch(/\.detail-hero\s*\{[^}]*min-height:\s*(?:2\d\d|3[0-6]\d)rpx/s);
    expect(detailStyles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + env(safe-area-inset-bottom));',
    );
    expect(detail).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
  });

  it('使用默认暗色、浅色覆盖和 8/16/24rpx 语义层级', () => {
    const appStyles = read('miniprogram/app.wxss');
    const dark = themeTokens(appStyles, 'dark');
    const light = themeTokens(appStyles, 'light');
    expect(dark['--color-bg']).toBe('#0b0b0c');
    expect(light['--color-bg']).toBe('#f4f2ed');
    expect(dark['--radius-sm']).toBe('8rpx');
    expect(dark['--radius-md']).toBe('16rpx');
    expect(dark['--radius-display']).toBe('24rpx');
    const card = cssBlock(activityCardStyles, '.activity-card');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    expectSemantic(declaration(card, 'border-radius'), '--radius-display');
    expectSemantic(
      declaration(cssBlock(activityCardStyles, '.metric-item'), 'background'),
      '--color-raised',
    );
    expectSemantic(
      declaration(cssBlock(detailStyles, '.detail-action .btn'), 'background'),
      '--color-brand',
    );
    expect(themeSources).not.toMatch(/pink|#ff69b4|#ffc0cb|#e91e63|#ec4899/i);
  });
});
