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

  it('凭证主视觉使用文字票据，并严格分离活动分享与本人身份', () => {
    expect(credential).toContain('class="credential-card"');
    expect(credential).not.toMatch(/class="[^"]*\bstatus-\{\{item\.status\}\}\b/);
    expect(credential).not.toContain('wx:for="{{backgroundImages}}"');
    expect(credential).toContain('class="compact-rider-avatar"');
    expect(credential).toContain('src="{{avatarUrl}}"');
    expect(credential).toContain('公开昵称 · {{riderName}}');
    expect(credential).not.toContain('cardMetrics');
    expect(credential).toContain('{{statusText}}');
    expect(credential).toContain('avatar-missing');
    expect(credential).toContain('open-type="share"');
    expect(credential).not.toMatch(/保存图片|条码|二维码核销/);
    expect(credentialStyles).toContain('.credential-card');
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
      /\.activity-title\s*\{[^}]*display:\s*-webkit-box;[^}]*-webkit-line-clamp:\s*2/s,
    );
    expect(activityCardStyles).toMatch(
      /\.route-line\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap/s,
    );
  });

  it('活动首页与行程页共享墨黑、暖米白和红色的信息层级', () => {
    expect(activityPageStyles).toMatch(
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-action\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(activityCardStyles).toMatch(
      /\.activity-card\s*\{[^}]*border-bottom:\s*2rpx solid var\(--color-border-strong\)[^}]*background:\s*transparent/s,
    );
    expect(activityCardStyles).toMatch(
      /\.card-caption\s*\{[^}]*background:\s*var\(--color-media-card-bg\)[^}]*color:\s*var\(--color-on-media\)/s,
    );
    expect(activityCardStyles).toContain('--card-accent: var(--color-brand)');
    expect(tripStyles).toMatch(
      /\.trip-stat--review \.trip-stat__value:not\(:empty\)::after\s*\{[^}]*background:\s*var\(--color-brand\)/s,
    );
  });

  it('集合时间与集合地点成为独立高权重信息，驳回原因仅在 rejected 状态以视图模型展示', () => {
    expect(credential).toContain('class="meeting-spotlight"');
    expect(credential).toContain('class="meeting-time"');
    expect(credential).toContain('meeting-location');
    expect(credential).not.toContain('报名进度');
    expect(credential).not.toContain('审批意见');
    expect(credential).not.toContain('reviewComment');
    expect(credential).not.toContain('timeline-card');
    expect(credential).toContain(
      'wx:if="{{item.status === \'rejected\'}}" class="card danger reject-card"',
    );
    expect(credential).toContain('未通过原因');
    expect(credential).toContain('{{rejectReason}}');
    expect(credentialPage).toContain('item.reviewComment?.trim()');
    expect(credentialPage).toContain('审核未填写原因，可修改后重新报名');
    expect(credential).toContain('{{item.profile.phone');
    expect(credential).toContain('supportVehicleDriver.contactPhone');
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
