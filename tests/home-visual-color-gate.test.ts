// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

const homeTemplate = read('miniprogram/pages/activities/index.wxml');
const homeStyles = read('miniprogram/pages/activities/index.wxss');
const logoTemplate = read('miniprogram/components/brand-logo/index.wxml');
const logoStyles = read('miniprogram/components/brand-logo/index.wxss');

describe('首页视觉与配色门禁', () => {
  it('首页沿用项目三色主题且不引入页面级硬编码色值', () => {
    expect(homeStyles).toContain('var(--color-bg)');
    expect(homeStyles).toContain('var(--color-text)');
    expect(homeStyles).toContain('var(--color-brand)');
    expect(homeStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
    expect(homeStyles).not.toMatch(/navy|blue|gradient/i);
  });

  it('内容区只使用页面单层边距，避免活动卡片两侧重复留白', () => {
    expect(homeStyles).toMatch(/\.activities-content\s*\{[^}]*padding:\s*32rpx 0 0;/s);
    expect(homeStyles).not.toMatch(/\.activities-content\s*\{[^}]*var\(--page-gutter\)/s);
    expect(homeStyles).not.toMatch(/\.activities-hero,\s*\.activities-content/);
  });

  it('品牌标识保持纯单色并只展示中文艺术字', () => {
    expect(logoTemplate).toContain('aria-label="此里"');
    expect(logoTemplate).toContain('>此</text>');
    expect(logoTemplate).toContain('>里</text>');
    expect(logoTemplate).not.toContain('CILI');
    expect(logoStyles).toContain('color: var(--color-text)');
    expect(logoStyles).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|var\(--color-brand\)/i);
  });

  it('首页首屏文案与信息层级保持高保真方案', () => {
    expect(homeTemplate).toContain('class="activities-hero"');
    expect(homeTemplate).toContain('选一场骑行，一起出发');
    expect(homeTemplate).toContain('路线、时间、集合点，一眼看清');
    expect(homeTemplate).toContain('class="activities-content"');
    expect(homeTemplate).toContain('即将开始');
    expect(homeTemplate).toContain('历史活动');
  });
});
