// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const activities = read('miniprogram/pages/activities/index.wxml');
const activityStyles = read('miniprogram/pages/activities/index.wxss');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');
const registrations = read('miniprogram/pages/registrations/index.wxml');
const registrationStyles = read('miniprogram/pages/registrations/index.wxss');
const credential = read('miniprogram/pages/credential/index.wxml');
const credentialStyles = read('miniprogram/pages/credential/index.wxss');

describe('activity journey visual contract', () => {
  it('活动首页复用统一分段控件，并以双行票据展示日期', () => {
    expect(activities).toContain('class="timeline-tabs"');
    expect(activities).toContain('class="day-chip__relative"');
    expect(activities).toContain('class="day-chip__date"');
    expect(activities).toContain('{{item.dateLabel}}');
    expect(activityStyles).toMatch(/\.day-chip\s*\{[^}]*height:\s*104rpx/s);
    expect(activityStyles).toMatch(/\.day-chip\s*\{[^}]*flex-direction:\s*column/s);
    expect(activityStyles).toMatch(
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-action\)/s,
    );
  });

  it('活动卡以单一整卡入口承载查看活动操作并保持明确可访问名称', () => {
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).toContain('role="button"');
    expect(activityCard).toContain('aria-label="查看活动：{{item.title}}"');
    expect(activityCard).toContain('class="card-arrow">查看活动 →');
    expect(activityCard).not.toContain('catchtap="open"');
    expect(activityCard).not.toContain('card-action--primary');
    expect(activityCardStyles).toMatch(/\.route-line\s*\{[^}]*min-height:\s*88rpx/s);
  });

  it('行程卡使用清晰次按钮，且审核橙点只由正数状态控制', () => {
    expect(registrations).toContain('wx:if="{{statusCounts.review > 0}}"');
    expect(registrations).toContain('wx:else class="trip-stat"');
    expect(registrations).toContain("'trip-action--primary' : ''");
    expect(registrations).not.toContain('class="open-link"');
    expect(registrationStyles).toContain('.trip-stat--review .trip-stat__value:not(:empty)::after');
    expect(registrationStyles).toMatch(
      /\.trip-action,\s*\.delete-record-button\s*\{[^}]*min-height:\s*var\(--control-height\)/s,
    );
  });

  it('行程统计统一居中对齐，主动作不再使用误导性的粗下划线', () => {
    expect(registrationStyles).toMatch(/\.trip-stat\s*\{[^}]*align-items:\s*center/s);
    expect(registrationStyles).toMatch(/\.trip-stat\s*\{[^}]*text-align:\s*center/s);
    expect(registrationStyles).not.toMatch(/text-decoration-thickness:\s*4rpx/);
  });

  it('行程首屏使用骨架结构且加载完成前不展示错误的 0 场统计', () => {
    expect(registrations).toContain('class="trip-skeleton"');
    expect(registrations).toContain('loading && !items.length');
    expect(registrations).toContain('同步中');
    expect(registrations).toContain('<state-view wx:else loading="{{false}}"');
    expect(registrationStyles).toMatch(/\.trip-skeleton__stats\s*\{/);
    expect(registrationStyles).toMatch(/\.trip-skeleton__card\s*\{/);
  });

  it('凭证使用影像志票据并只分享公开活动，集合时间使用 48rpx', () => {
    expect(credential.indexOf('class="journal-heading"')).toBeLessThan(
      credential.indexOf('class="credential-card"'),
    );
    expect(credential).not.toContain('class="compact-rider-card');
    expect(credential).toContain('open-type="share"');
    expect(credential).toContain('仅分享公开活动详情');
    expect(credential).toContain('class="meeting-navigation"');
    expect(credentialStyles).toMatch(/\.meeting-time\s*\{[^}]*font-size:\s*48rpx/s);
    expect(credentialStyles).toMatch(
      /\.meeting-navigation,\s*\.meeting-location button\s*\{[^}]*min-height:\s*var\(--control-height\)/s,
    );
  });

  it('本次页面样式只引用既有颜色 token', () => {
    for (const styles of [
      activityStyles,
      activityCardStyles,
      registrationStyles,
      credentialStyles,
    ]) {
      expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
      expect(styles).not.toContain('linear-gradient');
      expect(styles).not.toContain('radial-gradient');
    }
  });
});
