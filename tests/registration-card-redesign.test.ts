// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');
const trips = read('miniprogram/pages/registrations/index.wxml');
const tripStyles = read('miniprogram/pages/registrations/index.wxss');
const credential = read('miniprogram/pages/credential/index.wxml');
const credentialStyles = read('miniprogram/pages/credential/index.wxss');
const activityCard = read('miniprogram/components/activity-card/index.wxml');
const activityCardStyles = read('miniprogram/components/activity-card/index.wxss');

describe('行程状态卡与报名凭证重设计契约', () => {
  it.each([
    ['waiting', '#fff6df'],
    ['pending', '#edf5ff'],
    ['approved', '#eaf7ee'],
    ['checked_in', '#e9f4f2'],
    ['rejected', '#fff0ef'],
    ['cancelled', '#f2f0ec'],
  ])('%s 使用可区分的浅色背景 %s', (status, color) => {
    expect(trips).toContain(`status-{{item.status}}`);
    expect(tripStyles).toMatch(
      new RegExp(`\\.registration-card\\.status-${status}\\s*\\{[^}]*background:\\s*${color}`, 's'),
    );
  });

  it('凭证主视觉展示背景照片、头像和单一状态', () => {
    expect(credential).toContain('class="credential-visual status-hero status-{{item.status}}"');
    expect(credential).toContain('wx:for="{{backgroundImages}}"');
    expect(credential).toContain('class="rider-avatar"');
    expect(credential).toContain('{{statusText}}');
    expect(credentialStyles).toContain('.credential-visual');
    expect(credentialStyles).toContain('.rider-avatar');
  });

  it('活动卡片日期只由分组标题承载，卡片重点展示具体集合时间', () => {
    expect(activityCard).not.toContain('class="date-value"');
    expect(activityCard).toContain('aria-label="集合时间：{{item.displayTimeLabel}}"');
    expect(activityCardStyles).not.toContain('.date-value');
    expect(activityCardStyles).toMatch(/\.time-value\s*\{[^}]*font-size:\s*34rpx/s);
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
  });
});
