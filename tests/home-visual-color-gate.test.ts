// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const homeTemplate = read('miniprogram/pages/activities/index.wxml');
const homeStyles = read('miniprogram/pages/activities/index.wxss');
const logoTemplate = read('miniprogram/components/brand-logo/index.wxml');
const logoStyles = read('miniprogram/components/brand-logo/index.wxss');

describe('首页视觉与配色门禁', () => {
  it('首页沿用全局明亮主题且不引入页面级硬编码色值', () => {
    expect(homeStyles).toContain('var(--color-bg)');
    expect(homeStyles).toContain('var(--color-text)');
    expect(homeStyles).toContain('var(--color-action)');
    expect(homeStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(homeStyles).not.toMatch(/navy|blue|gradient/i);
  });

  it('内容区使用页面统一边距并为轮播与日期滑动保留稳定节奏', () => {
    expect(homeStyles).toMatch(
      /\.activity-carousel\s*\{[^}]*height:\s*900rpx[^}]*margin-top:\s*16rpx;/s,
    );
    expect(homeStyles).toMatch(
      /\.day-chip-bar__inner\s*\{[^}]*padding:\s*0 calc\(var\(--page-gutter\) \+ 48rpx\) 8rpx var\(--page-gutter\)/s,
    );
    expect(homeStyles).not.toMatch(/\.activity-carousel\s*\{[^}]*padding:/s);
  });

  it('品牌标识固定为深色底牌、暖灰白艺术字与品牌橙终点', () => {
    expect(logoTemplate).toContain('aria-label="此里"');
    expect(logoTemplate).toContain('>此</text>');
    expect(logoTemplate).toContain('>里</text>');
    expect(logoTemplate).not.toContain('CILI');
    expect(logoStyles).toMatch(
      /\.brand-logo__wordmark\s*\{[^}]*background:\s*var\(--color-logo-background\)[^}]*color:\s*var\(--color-logo-foreground\)/s,
    );
    expect(logoStyles).toMatch(/\.brand-logo\s*\{[^}]*background:\s*transparent/s);
    expect(logoStyles).toMatch(/\.brand-logo__meta\s*\{[^}]*margin-left:\s*0/s);
    expect(logoStyles).toContain('border: 4rpx solid var(--color-logo-accent)');
    expect(logoStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|navy|blue|gradient/i);
  });

  it('首页首屏文案与信息层级保持高保真方案', () => {
    expect(homeTemplate).toContain('class="activities-intro"');
    expect(homeTemplate).toContain('选一场骑行，一起出发');
    expect(homeTemplate).toContain('路线、时间、集合点，一眼看清');
    expect(homeTemplate).toContain('class="activity-carousel"');
    expect(homeTemplate).toContain('即将开始');
    expect(homeTemplate).toContain('历史活动');
  });
});
