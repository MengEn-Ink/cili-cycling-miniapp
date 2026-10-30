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
  'docs/brand/logo-materials/generated/core/logo-horizontal-dark-1200x540.png',
  'docs/brand/logo-materials/generated/core/logo-horizontal-light-1200x540.png',
  'docs/brand/logo-materials/generated/platform/logo-app-icon-1024.png',
  'docs/brand/logo-materials/generated/platform/favicon.ico',
  'docs/brand/logo-materials/generated/applications/logo-business-card-1050x600.png',
  'docs/brand/logo-materials/generated/applications/logo-letterhead-a4-1240x1754.png',
  'docs/brand/logo-materials/generated/preview/logo-brand-board-1600x1200.png',
  'docs/brand/logo-materials/generated/print/logo-brand-board.pdf',
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
      warm: '#F7F4F2',
      muted: '#B8B3BA',
    });
    expect(manifest.assets).toHaveLength(42);
    expect(new Set(manifest.assets.map((item: { path: string }) => item.path)).size).toBe(42);
    for (const item of manifest.assets as Array<{
      path: string;
      width: number;
      height: number;
      bytes: number;
      sha256: string;
    }>) {
      expect(existsSync(item.path), item.path).toBe(true);
      expect(item.width).toBeGreaterThan(0);
      expect(item.height).toBeGreaterThan(0);
      expect(item.bytes).toBeGreaterThan(0);
      expect(item.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(existsSync('docs/brand/logo-materials/GUIDELINES.md')).toBe(true);
    expect(existsSync('miniprogram/assets/brand/logo-circle-144.png')).toBe(true);
    expect(existsSync('miniprogram/assets/brand/logo-share-500x400.png')).toBe(true);
  });

  it('品牌组件与导出物料共享墨黑白沸点红品牌色', () => {
    const appStyles = read('miniprogram/app.wxss');
    const logoStyles = read('miniprogram/components/brand-logo/index.wxss');
    const logoMarkup = read('miniprogram/components/brand-logo/index.wxml');

    expect(appStyles).toContain('--color-logo-background: #211f1c;');
    expect(appStyles).toContain('--color-logo-foreground: #ffffff;');
    expect(appStyles).toContain('--color-logo-accent: #e13b2b;');
    expect(logoStyles).toContain('background: var(--color-logo-background);');
    expect(logoStyles).toContain('color: var(--color-logo-foreground);');
    expect(logoStyles).toContain('background: var(--color-logo-accent);');
    expect(logoMarkup).toContain('aria-label="CILI"');
    expect(logoMarkup).toContain('>CILI</text>');
    expect(logoMarkup).not.toContain('>此</text>');
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
      expect(source).toContain('CILI');
      expect(source).not.toContain('>此里<');
      expect(source).not.toMatch(/#20241f|#e85b32/i);
    }
  });

  it('活动空态复用 brand-logo，旧名片路由只做兼容跳转且不重复绘制导航', () => {
    const activities = read('miniprogram/pages/activities/index.wxml');
    const capabilityCard = read('miniprogram/pages/capability-card/index.wxml');
    const reviewDetail = read('miniprogram/pages/admin/review-detail/index.wxml');

    expect(activities).toContain('<generated-activity-cover');
    expect(read('miniprogram/components/generated-activity-cover/index.wxml')).toContain(
      '<brand-logo compact="{{true}}"',
    );
    expect(capabilityCard).toContain('loading-title="正在打开我的页面"');
    expect(capabilityCard).not.toContain('<brand-logo');
    expect(read('miniprogram/pages/capability-card/index.ts')).toContain(
      "url: '/pages/profile/index'",
    );
    expect(reviewDetail).toContain('<brand-logo compact="{{true}}" meta="审批详情" />');
    expect(activities).not.toMatch(/>CILI<|骑有此里/);
    expect(capabilityCard).not.toContain('class="cinema-slate"');
    expect(reviewDetail).not.toContain('class="cinema-slate"');
    expect(`${capabilityCard}\n${reviewDetail}`).not.toContain('骑有此里');
  });

  it('通用默认头像保留品牌物料，但活动报名人员绝不回退默认头像或背景', () => {
    const profile = read('miniprogram/pages/profile/index.wxml');
    const avatar = read('miniprogram/components/cili-avatar/index.wxml');
    const profileEdit = read('miniprogram/pages/profile-edit/index.wxml');
    const detail = read('miniprogram/pages/activity-detail/index.wxml');
    const settings = read('miniprogram/pages/settings/index.wxml');
    const hero = read('miniprogram/assets/profile/hero-alpine.svg');

    expect(profile).toContain('<cili-avatar');
    expect(avatar).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(profileEdit).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(detail).not.toContain('src="/assets/brand/logo-circle-144.png"');
    expect(detail).not.toContain('src="/assets/brand/logo-share-500x400.png"');
    expect(settings).toContain('此里 · 持续为每一次出发升级');
    expect(hero).toContain('aria-label="此里品牌标识"');
    expect(hero).not.toContain('CILI 此里');
  });
});
