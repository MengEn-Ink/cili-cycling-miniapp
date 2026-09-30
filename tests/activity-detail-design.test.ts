// @ts-expect-error Vitest provides the Node runtime used by this repository.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatActivityDate } from '../miniprogram/pages/activity-detail/format';

const read = (file: string) => readFileSync(file, 'utf8');

describe('活动详情设计与日期契约', () => {
  it('将 ISO 或日历日期格式化为友好中文日期，且不偏移时区', () => {
    expect(formatActivityDate('2026-10-18')).toBe('10月18日 周日');
    expect(formatActivityDate('2026-10-18T00:00:00.000Z')).toBe('10月18日 周日');
    expect(formatActivityDate('2026-09-30T23:00:00.000Z')).toBe('10月1日 周四');
    expect(formatActivityDate('10月18日 周日')).toBe('日期待公布');
    expect(formatActivityDate('2026-02-30')).toBe('日期待公布');
    expect(formatActivityDate(undefined)).toBe('日期待公布');
  });

  it('保持轮播降级、地图导航和真实 CTA 状态接线', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    expect(template).toContain('wx:if="{{galleryImages.length > 1 && !coverFailed}}"');
    expect(template).toContain('binderror="galleryImageError"');
    expect(template).toContain('binderror="coverImageError"');
    expect(template).toContain('bindtap="navigate"');
    expect(template).toContain('disabled="{{loading || !item || !activityAction.enabled}}"');
  });

  it('详情日期优先使用开始时间，且活动卡只暴露一个跳转按钮', () => {
    const page = read('miniprogram/pages/activity-detail/index.ts');
    const template = read('miniprogram/components/activity-card/index.wxml');
    expect(page).toContain('formatActivityDate(item.startAt || item.date)');
    expect(template.match(/role="button"/g)).toHaveLength(1);
    expect(template).toContain('class="card-cta" aria-hidden="true"');
  });

  it('使用等宽三列指标、16px 卡片圆角和轻量安全区 CTA', () => {
    const template = read('miniprogram/pages/activity-detail/index.wxml');
    const styles = read('miniprogram/pages/activity-detail/index.wxss');
    expect(template.match(/class="detail-metric"/g)).toHaveLength(3);
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(styles).toMatch(/\.detail-page \.card\s*\{[^}]*border-radius:\s*32rpx;/s);
    expect(styles).toMatch(/\.detail-action \.btn\s*\{[^}]*min-height:\s*88rpx;/s);
    expect(styles).toContain('calc(12rpx + env(safe-area-inset-bottom))');
  });
});
