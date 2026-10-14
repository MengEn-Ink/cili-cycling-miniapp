import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic, uiTokens } from './theme-contract-helpers';

const read = (path) => fs.readFileSync(path, 'utf8');
const activities = read('miniprogram/pages/activities/index.wxml');
const activitiesController = read('miniprogram/pages/activities/index.ts');
const activitiesStyles = read('miniprogram/pages/activities/index.wxss');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
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

  it('活动卡保留真实字段、三列指标、状态、占位和点击反馈', () => {
    expect(activityCard).toContain('wx:if="{{item.coverImage && !coverFailed}}"');
    expect(activityCard).toContain('src="{{item.coverImage}}"');
    expect(activityCard).toContain('binderror="coverImageError"');
    expect(activityCard).toContain('<status-pill status="{{item.displayStatus}}" />');
    expect(activityCard.match(/class="metric-item"/g)).toHaveLength(3);
    expect(activityCard).toContain(
      "item.capacity > 0 ? (item.occupied + ' / ' + item.capacity) : '待确认'",
    );
    expect(activityCard).toContain("item.capacity <= 0 ? '名额' : '报名'");
    expect(activityCard).not.toContain('人已报名');
    expect(activityCard).toContain('hover-class="activity-card--pressed"');
    expect(activityCard).toContain('wx:else class="card-placeholder"');
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).not.toContain('class="card-cta"');
    expect(activityCard).toContain('查看详情');
    expect(activityCard).toContain('aria-label="查看活动：{{item.title}}"');
    expect(activityCardStyles).toContain('.activity-card--pressed');
    expect(activityCardStyles).toContain('.card-placeholder');
    expect(activityCardStyles).not.toContain('.card-cta');
  });

  it('方案 A 让每张卡都使用固定照片区与独立信息区并稳定承载长文案', () => {
    expect(activityCard).toContain('class="card-media"');
    expect(activityCard).toContain('class="card-info"');
    expect(activityCard).toContain('mode="aspectFill"');
    expect(activityCard).toContain('wx:else class="card-placeholder"');
    expect(activityCard).not.toContain('activity-card--featured');
    expect(activityCard).not.toContain('activity-card--compact');
    expect(activityCardStyles).not.toContain('.activity-card--compact');
    expect(activityCardStyles).toMatch(/\.card-media\s*\{[^}]*height:\s*360rpx/s);
    const title = effectiveBlock(activityCardStyles, '.activity-title');
    expect(declaration(title, 'white-space')).toBe('nowrap');
    expect(declaration(title, 'text-overflow')).toBe('ellipsis');
    expect(title).not.toMatch(/(?:^|\n)\s*min-height\s*:/);
    const route = effectiveBlock(activityCardStyles, '.route-line');
    expect(declaration(route, 'white-space')).toBe('nowrap');
    expect(declaration(route, 'text-overflow')).toBe('ellipsis');
    expect(route).not.toMatch(/(?:^|\n)\s*min-height\s*:/);
  });

  it('里程、爬升和报名保持固定三列，缺失可选指标显示占位而不折叠', () => {
    expect(activityCard.match(/class="metric-item"/g)).toHaveLength(3);
    expect(activityCard).toContain("item.route.distanceKm > 0 ? item.route.distanceKm : '—'");
    expect(activityCard).toContain("item.route.elevationM > 0 ? item.route.elevationM : '—'");
    expect(activityCard).not.toContain(
      '<view wx:if="{{item.route.distanceKm > 0}}" class="metric-item">',
    );
    expect(activityCard).not.toContain(
      '<view wx:if="{{item.route.elevationM > 0}}" class="metric-item">',
    );
    expect(activityCardStyles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
  });

  it('V4 保留时间筛选并通过横向照片卡片突出核心信息', () => {
    expect(activities).toContain('>即将开始</button>');
    expect(activities).toContain('>历史活动</button>');
    expect(activities).toContain('class="activity-carousel"');
    expect(activities).toContain('bindchange="cardChange"');
    expect(activities).toContain('role="tabpanel"');
    expect(activityCard).toContain('{{item.displayDateLabel}}');
    expect(activityCard).toContain('{{item.displayTimeLabel}}');
    expect(activityCard).toContain('class="location-label">集合');
    expect(activityCard).toContain('{{item.route.start');
    expect(activityCard).toContain("item.capacity <= 0 ? '名额' : '报名'");
  });

  it('首页只使用品牌橙、石墨黑和暖灰白主题色，不继承荧光黄视觉', () => {
    expect(logoStyles).toContain('background: var(--color-logo-background)');
    expect(activitiesStyles).toContain('background: var(--color-bg)');
    expect(activitiesStyles).toContain('border: 2rpx solid var(--color-border)');
    expect(activitiesStyles).toContain('background: var(--color-brand)');
    expect(activitiesStyles).toMatch(
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-brand\)/s,
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

  it('照片卡片保留整卡点击，并提供清晰的主次操作', () => {
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).toContain('查看详情');
    expect(activityCard).toContain('class="card-actions"');
    expect(activityCardStyles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(activityCardStyles).not.toContain('.route-arrow');
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
    expect(detailStyles).toMatch(/\.detail-hero\s*\{[^}]*height:\s*360rpx/s);
    expect(detailStyles).toContain(
      'padding-bottom: calc(var(--fixed-action-reserve) + env(safe-area-inset-bottom));',
    );
    expect(detail).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
  });

  it('使用单一明亮 token 和 16/24/32rpx 语义层级', () => {
    const appStyles = read('miniprogram/app.wxss');
    const tokens = uiTokens(appStyles);
    expect(tokens['--color-bg']).toBe('#f3f3f1');
    expect(tokens['--radius-sm']).toBe('16rpx');
    expect(tokens['--radius-md']).toBe('24rpx');
    expect(tokens['--radius-display']).toBe('32rpx');
    const card = effectiveBlock(activityCardStyles, '.activity-card');
    expectSemantic(declaration(card, 'background'), '--color-surface');
    expectSemantic(declaration(card, 'border-radius'), '--radius-display');
    expectSemantic(
      declaration(effectiveBlock(read('miniprogram/app.wxss'), '.metric-item'), 'background'),
      '--color-surface',
    );
    expectSemantic(
      declaration(effectiveBlock(detailStyles, '.detail-action .btn'), 'background'),
      '--color-brand',
    );
    expect(themeSources).not.toMatch(/pink|#ff69b4|#ffc0cb|#e91e63|#ec4899/i);
  });
});
