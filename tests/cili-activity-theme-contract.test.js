import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic, uiTokens } from './theme-contract-helpers';

const read = (path) => fs.readFileSync(path, 'utf8');
const activities = read('miniprogram/pages/activities/index.wxml');
const activitiesController = read('miniprogram/pages/activities/index.ts');
const activitiesStyles = read('miniprogram/pages/activities/index.wxss');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
const generatedCover = read('miniprogram/components/generated-activity-cover/index.wxml');
const generatedCoverStyles = read('miniprogram/components/generated-activity-cover/index.wxss');
const detail = read('miniprogram/pages/activity-detail/index.wxml');
const detailStyles = read('miniprogram/pages/activity-detail/index.wxss');
const logo = read('miniprogram/components/brand-logo/index.wxml');
const logoStyles = read('miniprogram/components/brand-logo/index.wxss');
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
    expect(logo).toContain('class="brand-logo__wordmark"');
    expect(logo).toContain('>此</text>');
    expect(logo).toContain('>里</text>');
    expect(logo).not.toContain('CILI');
  });

  it('活动列表和详情继续渲染现有关键字段', () => {
    expect(activities).toContain('item="{{item}}"');
    expect(detail).toContain('{{item.title}}');
    expect(detail).toContain('{{displayDate}}');
    expect(detail).toContain('item.route.distanceKm > 0 ? item.route.distanceKm');
    expect(detail).toContain('item.route.elevationM > 0 ? item.route.elevationM');
    expect(detail).toContain('{{item.capacity}}');
    expect(detail).toContain('{{activityAction.label}}');
  });

  it('活动卡保留真实字段、里程爬升时长、状态、占位和点击反馈', () => {
    expect(activityCard).toContain('wx:if="{{item.coverImage && !coverFailed}}"');
    expect(activityCard).toContain('src="{{item.coverImage}}"');
    expect(activityCard).toContain('binderror="coverImageError"');
    expect(activityCard).toContain('<status-pill status="{{item.displayStatus}}" />');
    expect(activityCard.match(/class="metric-item"/g)).toHaveLength(3);
    expect(activityCard).toContain("item.route.distanceKm > 0 ? item.route.distanceKm : '—'");
    expect(activityCard).toContain("item.route.elevationM > 0 ? item.route.elevationM : '—'");
    expect(activityCard).toContain("item.estimatedRideTime || '—'");
    expect(activityCard).not.toContain('item.capacity');
    expect(activityCard).not.toContain('人已报名');
    expect(activityCard).toContain('hover-class="activity-card--pressed"');
    expect(activityCard).toContain('wx:else item="{{item}}" variant="card"');
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).not.toContain('class="card-cta"');
    expect(activityCard).toContain('查看活动 →');
    expect(activityCard).toContain('aria-label="查看活动：{{item.title}}"');
    expect(activityCardStyles).toContain('.activity-card--pressed');
    expect(activityCardStyles).not.toContain('.card-placeholder');
    expect(activityCardStyles).not.toContain('.card-cta');
    expect(generatedCover).toContain("{{item.title || '一起出发去骑行'}}");
    expect(generatedCover).toContain(
      "{{item.route.routeName || item.route.start || '路线信息即将公布'}}",
    );
    expect(generatedCover).toContain("{{item.route.distanceKm > 0 ? item.route.distanceKm : '—'}}");
    expect(generatedCoverStyles).toContain('background: var(--color-media-card-bg)');
    expect(generatedCoverStyles).toContain('background: var(--color-brand)');
    expect(generatedCoverStyles).not.toContain('linear-gradient');
  });

  it('影像志让每张卡使用大幅照片、实况说明和独立事实区承载长文案', () => {
    expect(activityCard).toContain('class="card-media"');
    expect(activityCard).toContain('class="card-caption"');
    expect(activityCard).toContain('class="card-facts"');
    expect(activityCard).toContain('mode="aspectFill"');
    expect(activityCard).toContain('wx:else item="{{item}}" variant="card"');
    expect(activityCard).not.toContain('activity-card--featured');
    expect(activityCard).not.toContain('activity-card--compact');
    expect(activityCardStyles).not.toContain('.activity-card--compact');
    expect(activityCardStyles).toMatch(/\.card-media\s*\{[^}]*height:\s*560rpx/s);
    const title = effectiveBlock(activityCardStyles, '.activity-title');
    expect(declaration(title, 'display')).toBe('-webkit-box');
    expect(declaration(title, '-webkit-line-clamp')).toBe('2');
    expect(title).not.toMatch(/(?:^|\n)\s*min-height\s*:/);
    const route = effectiveBlock(activityCardStyles, '.route-line');
    expect(declaration(route, 'white-space')).toBe('nowrap');
    expect(declaration(route, 'text-overflow')).toBe('ellipsis');
    expect(declaration(route, 'min-height')).toBe('88rpx');
  });

  it('里程、爬升和预计骑行保持固定三列，缺失可选指标显示占位而不折叠', () => {
    expect(activityCard.match(/class="metric-item"/g)).toHaveLength(3);
    expect(activityCard).toContain("item.route.distanceKm > 0 ? item.route.distanceKm : '—'");
    expect(activityCard).toContain("item.route.elevationM > 0 ? item.route.elevationM : '—'");
    expect(activityCard).toContain("item.estimatedRideTime || '—'");
    expect(activityCard).not.toContain(
      '<view wx:if="{{item.route.distanceKm > 0}}" class="metric-item">',
    );
    expect(activityCard).not.toContain(
      '<view wx:if="{{item.route.elevationM > 0}}" class="metric-item">',
    );
    expect(activityCardStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('影像志保留时间筛选并通过竖向照片故事突出核心信息', () => {
    expect(activities).toContain('>即将开始</button>');
    expect(activities).toContain('>历史活动</button>');
    expect(activities).toContain('class="activity-story-list"');
    expect(activities).toContain('class="activity-story"');
    expect(activities).not.toContain('bindchange="cardChange"');
    expect(activities).toContain('role="tabpanel"');
    expect(activityCard).toContain('{{item.displayDateLabel}}');
    expect(activityCard).toContain('{{item.displayTimeLabel}}');
    expect(activityCard).toContain('class="location-label">集合');
    expect(activityCard).toContain('{{item.route.start');
    expect(activityCard).toContain('{{item.estimatedRideTime');
  });

  it('首页只使用品牌红、墨黑和暖米白主题色，不继承荧光黄视觉', () => {
    expect(logoStyles).toContain('background: var(--color-logo-background)');
    expect(activitiesStyles).toContain('background: var(--color-bg)');
    expect(activitiesStyles).toContain('border: 2rpx solid var(--color-border)');
    expect(activitiesStyles).toContain('background: var(--color-action)');
    expect(activitiesStyles).toMatch(
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-action\)/s,
    );
    expect(activitiesStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|navy|blue|gradient/i);
    expect(activityCardStyles).toContain('--card-accent: var(--color-brand)');
    expect(`${activitiesStyles}\n${activityCardStyles}`).not.toMatch(/#d9ff43|#c4ec23|#f2ffc2/i);
  });

  it('活动界面删除装饰英文但保留品牌与专有名词', () => {
    expect(activities).not.toContain('RIDES /');
    expect(activitiesController).not.toContain('RIDE ARCHIVE');
    expect(activityCard).not.toContain('RIDE DATE');
    expect(detail).not.toContain('RIDE DETAIL');
    expect(detail).not.toContain('RIDE / 01');
    expect(logo).toContain('aria-label="此里"');
    expect(logo).not.toContain('CILI');
    expect(detail).toContain('Strava');
    expect(detail).toContain('GPX');
  });

  it('照片卡片保留整卡点击，并提供清晰的单一查看操作', () => {
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).toContain('查看活动 →');
    expect(activityCard).toContain('aria-label="查看活动：{{item.title}}"');
    expect(activityCard).not.toContain('class="card-actions"');
    expect(activityCardStyles).toMatch(/\.route-line\s*\{[^}]*min-height:\s*88rpx/s);
    expect(activityCardStyles).not.toContain('.card-cta');
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
    expect(detailStyles).toMatch(/\.detail-hero\s*\{[^}]*height:\s*520rpx/s);
    expect(detailStyles).toMatch(
      /padding-bottom:\s*calc\(\s*var\(--fixed-action-reserve\) \+ var\(--card-gap\) \+ env\(safe-area-inset-bottom\)\s*\)/s,
    );
    expect(detail).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
  });

  it('使用单一明亮 token 和沸点语义层级', () => {
    const appStyles = read('miniprogram/app.wxss');
    const tokens = uiTokens(appStyles);
    expect(tokens['--color-bg']).toBe('#fbf5ea');
    expect(tokens['--radius-sm']).toBe('12rpx');
    expect(tokens['--radius-md']).toBe('20rpx');
    expect(tokens['--radius-card']).toBe('28rpx');
    expect(tokens['--radius-display']).toBe('32rpx');
    const card = effectiveBlock(activityCardStyles, '.activity-card');
    expect(declaration(card, 'background')).toBe('transparent');
    expect(declaration(card, 'border-bottom')).toBe('2rpx solid var(--color-border-strong)');
    const caption = effectiveBlock(activityCardStyles, '.card-caption');
    expectSemantic(declaration(caption, 'background'), '--color-media-card-bg');
    expectSemantic(declaration(caption, 'color'), '--color-on-media');
    expectSemantic(
      declaration(effectiveBlock(read('miniprogram/app.wxss'), '.metric-item'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(detailStyles, '.detail-action .btn'), 'background'),
      '--color-action',
    );
    expect(themeSources).not.toMatch(/pink|#ff69b4|#ffc0cb|#e91e63|#ec4899/i);
  });
});
