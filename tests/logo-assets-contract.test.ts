// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

const brandAssets = [
  'docs/brand/logo-materials/generated/logo-wechat-144.png',
  'docs/brand/logo-materials/generated/logo-square-1024.png',
  'docs/brand/logo-materials/generated/logo-circle-144.png',
  'docs/brand/logo-materials/generated/logo-photo-watermark-360x144.png',
  'docs/brand/logo-materials/generated/logo-share-500x400.png',
  'docs/brand/logo-materials/generated/logo-loading-512.gif',
];

describe('统一 Logo 物料与页面接入契约', () => {
  it('提供平台、圆形、照片角标、分享和加载动画物料', () => {
    const manifest = JSON.parse(read('docs/brand/logo-materials/manifest.json'));

    for (const asset of brandAssets) {
      expect(existsSync(asset), asset).toBe(true);
      expect(
        manifest.assets.some((item: { path: string }) => item.path === asset),
        asset,
      ).toBe(true);
    }
    expect(manifest.colors).toEqual({
      background: '#211F1C',
      foreground: '#FFFFFF',
      accent: '#E13B2B',
    });
    expect(existsSync('miniprogram/assets/brand/logo-circle-144.png')).toBe(true);
    expect(existsSync('miniprogram/assets/brand/logo-share-500x400.png')).toBe(true);
  });

  it('品牌组件与导出物料共享墨黑白沸点红品牌色', () => {
    const appStyles = read('miniprogram/app.wxss');
    const logoStyles = read('miniprogram/components/brand-logo/index.wxss');

    expect(appStyles).toContain('--color-logo-background: #211f1c;');
    expect(appStyles).toContain('--color-logo-foreground: #ffffff;');
    expect(appStyles).toContain('--color-logo-accent: #e13b2b;');
    expect(logoStyles).toContain('background: var(--color-logo-background);');
    expect(logoStyles).toContain('color: var(--color-logo-foreground);');
    expect(logoStyles).toContain('border: 4rpx solid var(--color-logo-accent);');
  });

  it('Logo 源稿统一使用沸点墨黑与品牌红，不再保留旧橙黑色值', () => {
    for (const file of [
      'logo-square.svg',
      'logo-circle.svg',
      'logo-watermark.svg',
      'logo-share.svg',
      ...Array.from({ length: 8 }, (_, index) => `loading-${String(index).padStart(2, '0')}.svg`),
    ]) {
      const source = read(`docs/brand/logo-materials/source/${file}`);
      expect(source).toContain('#211f1c');
      expect(source).toContain('#e13b2b');
      expect(source).not.toMatch(/#20241f|#e85b32/i);
    }
  });

  it('活动空态与核心名片页面统一复用 brand-logo，不再展示旧 CILI 字标', () => {
    const activityCard = read('miniprogram/components/activity-card/index.wxml');
    const capabilityCard = read('miniprogram/pages/capability-card/index.wxml');
    const reviewDetail = read('miniprogram/pages/admin/review-detail/index.wxml');

    expect(activityCard).toContain('<generated-activity-cover');
    expect(read('miniprogram/components/generated-activity-cover/index.wxml')).toContain(
      '<brand-logo compact="{{true}}"',
    );
    expect(capabilityCard.match(/<brand-logo compact="\{\{true\}\}"/g)).toHaveLength(2);
    expect(reviewDetail).toContain('<brand-logo compact="{{true}}" meta="审批详情" />');
    expect(`${activityCard}\n${capabilityCard}\n${reviewDetail}`).not.toMatch(/>CILI<|骑有此里/);
  });

  it('默认头像和名片背景统一引用品牌图片物料', () => {
    const profile = read('miniprogram/pages/profile/index.wxml');
    const avatar = read('miniprogram/components/cili-avatar/index.wxml');
    const profileEdit = read('miniprogram/pages/profile-edit/index.wxml');
    const detail = read('miniprogram/pages/activity-detail/index.wxml');
    const settings = read('miniprogram/pages/settings/index.wxml');
    const hero = read('miniprogram/assets/profile/hero-alpine.svg');

    expect(profile).toContain('<cili-avatar');
    expect(avatar).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(profileEdit).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(detail).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(detail).toContain('src="/assets/brand/logo-share-500x400.png"');
    expect(settings).toContain('此里 · 持续为每一次出发升级');
    expect(hero).toContain('aria-label="此里品牌标识"');
    expect(hero).not.toContain('CILI 此里');
  });
});
