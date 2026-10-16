// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { declaration, effectiveBlock, expectSemantic } from './theme-contract-helpers';

const read = (file: string) => readFileSync(file, 'utf8');
const trips = read('miniprogram/pages/registrations/index.wxml');
const tripStyles = read('miniprogram/pages/registrations/index.wxss');
const credential = read('miniprogram/pages/credential/index.wxml');
const credentialStyles = read('miniprogram/pages/credential/index.wxss');
const credentialPage = read('miniprogram/pages/credential/index.ts');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
const activityPageStyles = read('miniprogram/pages/activities/index.wxss');
const appStyles = read('miniprogram/app.wxss');
const statusPill = read('miniprogram/components/status-pill/index.wxml');
const statusPillStyles = read('miniprogram/components/status-pill/index.wxss');

describe('行程状态卡与报名凭证重设计契约', () => {
  it('全部状态使用统一白色票面，状态语义由统一状态组件承载', () => {
    expect(trips).toContain('status-{{item.status}}');
    expect(trips).toContain('status-pill ticket="{{true}}" status="{{item.displayStatusText}}"');
    expectSemantic(
      declaration(effectiveBlock(tripStyles, '.registration-card'), 'background'),
      '--color-surface',
    );
    expect(statusPill).toContain("status === '已驳回' || status === '已取消'");
    const danger = effectiveBlock(statusPillStyles, '.pill--danger');
    expect(declaration(danger, 'border')).toContain('var(--color-brand)');
    expectSemantic(declaration(danger, 'color'), '--color-brand-active');
    expect(tripStyles).not.toMatch(/#fff6df|#edf5ff|#eaf7ee|#e9f4f2|#fff0ef/);
  });

  it('凭证主视觉复用个人名片缩小布局，并严格分离真实背景与真实头像', () => {
    expect(credential).toContain('class="compact-rider-card"');
    expect(credential).not.toMatch(/class="[^"]*\bstatus-\{\{item\.status\}\}\b/);
    expect(credential).toContain('wx:for="{{backgroundImages}}"');
    expect(credential).toContain('class="compact-rider-avatar"');
    expect(credential).toContain('src="{{avatarUrl}}"');
    expect(credential).toContain('你的公开资料与照片已随报名提交');
    expect(credential).not.toContain('cardMetrics');
    expect(credential).toContain('{{statusText}}');
    expect(credential).toContain('以品牌底图展示');
    expect(credential).toContain('avatar-missing');
    expect(credentialStyles).toContain('.compact-rider-card');
    expect(credentialStyles).toContain('.compact-rider-avatar');
  });

  it('背景只接收用户真实骑行照片，头像保持独立数据源', () => {
    expect(credentialPage).toContain("background.source === 'user_photo'");
    expect(credentialPage).toContain("const avatarUrl = capabilityCard?.profile?.avatarUrl || ''");
    expect(credentialPage).not.toContain('backgroundImages.push(avatarUrl)');
    expect(credentialPage).not.toContain('backgroundImages.concat(avatarUrl)');
  });

  it('活动卡片同时展示日期、集合时间与集合地点，不丢失关键决策信息', () => {
    expect(activityCard).toContain('{{item.displayDateLabel}}');
    expect(activityCard).toContain('{{item.displayTimeLabel}}');
    expect(activityCard).toContain("item.route.start || '集合地点待公布'");
    expect(activityCardStyles).toMatch(
      /\.activity-title\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/s,
    );
    expect(activityCardStyles).toMatch(
      /\.route-line\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/s,
    );
  });

  it('活动首页与行程页共享黑白橙的信息层级', () => {
    expect(activityPageStyles).toMatch(
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-action\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(activityCardStyles).toMatch(
      /\.activity-card\s*\{[^}]*border:\s*2rpx solid var\(--color-border\)[^}]*background:\s*var\(--color-surface\)/s,
    );
    expect(activityCardStyles).toContain('--card-accent: var(--color-brand)');
    expect(tripStyles).toMatch(
      /\.trip-stat--review \.trip-stat__value:not\(:empty\)::after\s*\{[^}]*background:\s*var\(--color-brand\)/s,
    );
  });

  it('集合时间与集合地点成为独立高权重信息，不再展示审批意见和进度', () => {
    expect(credential).toContain('class="meeting-spotlight"');
    expect(credential).toContain('class="meeting-time"');
    expect(credential).toContain('meeting-location');
    expect(credential).not.toContain('报名进度');
    expect(credential).not.toContain('审批意见');
    expect(credential).not.toContain('reviewComment');
    expect(credential).not.toContain('timeline-card');
    expectSemantic(
      declaration(effectiveBlock(appStyles, '.meeting-spotlight'), 'background'),
      '--color-media-card-bg',
    );
    expectSemantic(
      declaration(effectiveBlock(appStyles, '.meeting-time'), 'color'),
      '--color-on-media',
    );
    expectSemantic(
      declaration(effectiveBlock(credentialStyles, '.meeting-location-title'), 'color'),
      '--color-on-media',
    );
    expectSemantic(
      declaration(effectiveBlock(credentialStyles, '.meeting-location button'), 'background'),
      '--color-surface',
    );
  });
});
