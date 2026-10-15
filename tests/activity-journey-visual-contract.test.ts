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
      /\.day-chip\.is-active\s*\{[^}]*background:\s*var\(--color-brand\)/s,
    );
  });

  it('活动卡保留整卡点击，并提供查看详情与报名或行程的主次操作', () => {
    expect(activityCard).toContain('bindtap="open"');
    expect(activityCard).toContain('class="secondary card-action card-action--detail"');
    expect(activityCard).toContain('class="btn card-action card-action--primary"');
    expect(activityCard).toContain("item.registrationStatus ? '查看行程' : '报名活动'");
    expect(activityCard.match(/catchtap="open"/g)).toHaveLength(2);
    expect(activityCardStyles).toMatch(
      /\.card-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/s,
    );
  });

  it('行程卡使用清晰次按钮，且审核橙点只由正数状态控制', () => {
    expect(registrations).toContain('wx:if="{{statusCounts.review > 0}}"');
    expect(registrations).toContain('wx:else class="trip-stat"');
    expect(registrations).toContain('class="secondary trip-action"');
    expect(registrations).not.toContain('class="open-link"');
    expect(registrationStyles).toContain('.trip-stat--review .trip-stat__value:not(:empty)::after');
    expect(registrationStyles).toMatch(
      /\.trip-action\s*\{[^}]*min-height:\s*var\(--control-height\)/s,
    );
  });

  it('公开骑行名片置于凭证顶部，集合时间使用 48rpx', () => {
    expect(credential.indexOf('class="public-card-heading"')).toBeLessThan(
      credential.indexOf('class="compact-rider-card'),
    );
    expect(credential.indexOf('class="compact-rider-card')).toBeLessThan(
      credential.indexOf('class="credential-card"'),
    );
    expect(credential).toContain('公开骑行名片');
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
