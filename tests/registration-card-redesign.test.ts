// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const trips = read('miniprogram/pages/registrations/index.wxml');
const tripStyles = read('miniprogram/pages/registrations/index.wxss');
const credential = read('miniprogram/pages/credential/index.wxml');
const credentialStyles = read('miniprogram/pages/credential/index.wxss');
const credentialPage = read('miniprogram/pages/credential/index.ts');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
const activityPageStyles = read('miniprogram/pages/activities/index.wxss');

describe('行程状态卡与报名凭证重设计契约', () => {
  it('全部状态使用统一白色票面，待处理状态仅用主题橙描边强调', () => {
    expect(trips).toContain('status-{{item.status}}');
    for (const status of [
      'waiting',
      'pending',
      'approved',
      'checked_in',
      'rejected',
      'cancelled',
    ]) {
      expect(tripStyles).toContain(`.registration-card.status-${status}`);
    }
    expect(tripStyles).toMatch(
      /\.registration-card\.status-waiting,[\s\S]*\.registration-card\.status-pending\s*\{[^}]*border-color:\s*var\(--color-brand\)/,
    );
    expect(tripStyles).not.toMatch(/#fff6df|#edf5ff|#eaf7ee|#e9f4f2|#fff0ef/);
  });

  it('凭证主视觉复用个人名片缩小布局，并严格分离真实背景与真实头像', () => {
    expect(credential).toContain('class="compact-rider-card status-{{item.status}}"');
    expect(credential).toContain('wx:for="{{backgroundImages}}"');
    expect(credential).toContain('class="compact-rider-avatar"');
    expect(credential).toContain('src="{{avatarUrl}}"');
    expect(credential).toContain('你的公开资料与照片已随报名提交');
    expect(credential).not.toContain('cardMetrics');
    expect(credential).toContain('{{statusText}}');
    expect(credential).toContain('背景照片待完善');
    expect(credential).toContain('头像待完善');
    expect(credentialStyles).toContain('.compact-rider-card');
    expect(credentialStyles).toContain('.compact-rider-avatar');
  });

  it('背景只接收用户真实骑行照片，头像保持独立数据源', () => {
    expect(credentialPage).toContain("background.source === 'user_photo'");
    expect(credentialPage).toContain("const avatarUrl = capabilityCard?.profile?.avatarUrl || ''");
    expect(credentialPage).not.toContain('backgroundImages.push(avatarUrl)');
    expect(credentialPage).not.toContain('backgroundImages.concat(avatarUrl)');
  });

  it('活动卡片日期只由分组标题承载，卡片重点展示具体集合时间', () => {
    expect(activityCard).not.toContain('class="date-value"');
    expect(activityCard).toContain('aria-label="集合时间：{{item.displayTimeLabel}}"');
    expect(activityCardStyles).not.toContain('.date-value');
    expect(activityCardStyles).toMatch(/\.time-value\s*\{[^}]*font-size:\s*34rpx/s);
  });

  it('活动首页与行程页共享黑白橙票据信息层级', () => {
    expect(activityPageStyles).toMatch(
      /\.section-head\s*\{[^}]*border-left:\s*8rpx solid var\(--color-brand\)[^}]*background:\s*var\(--color-text\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(activityCardStyles).toMatch(
      /\.date-plate\s*\{[^}]*border-left:\s*8rpx solid var\(--color-brand\)[^}]*background:\s*var\(--color-text\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(activityCardStyles).toMatch(
      /\.metrics\s*\{[^}]*border-left:\s*8rpx solid var\(--color-brand\)/s,
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
    expect(credentialStyles).toContain('.meeting-spotlight');
    expect(credentialStyles).toMatch(
      /\.meeting-spotlight\s*\{[^}]*background:\s*var\(--color-text\)[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(credentialStyles).toMatch(
      /\.meeting-spotlight \.meet-label\s*\{[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(credentialStyles).toMatch(/\.meeting-time\s*\{[^}]*color:\s*var\(--color-on-action\)/s);
    expect(credentialStyles).toMatch(
      /\.meeting-location-title\s*\{[^}]*color:\s*var\(--color-on-action\)/s,
    );
    expect(credentialStyles).toMatch(
      /\.meeting-location button\s*\{[^}]*background:\s*var\(--color-on-action\)[^}]*color:\s*var\(--color-text\)/s,
    );
  });
});
