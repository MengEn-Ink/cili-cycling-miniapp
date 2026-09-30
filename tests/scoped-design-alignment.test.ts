// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

describe('报名、骑行名片与个人中心设计对齐', () => {
  it('报名表单使用连续深色表面并减少分区卡片碎片', () => {
    const page = read('miniprogram/pages/registration-form/index.ts');
    const template = read('miniprogram/pages/registration-form/index.wxml');
    const styles = read('miniprogram/pages/registration-form/index.wxss');

    expect(page).toContain('displayActivityDate: formatActivityDate(');
    expect(template).toContain('{{displayActivityDate}}');
    expect(template).not.toContain('{{activity.date}}');

    expect(template).toContain('class="form-surface"');
    expect(template.match(/class="form-section/g)).toHaveLength(4);
    expect(styles).toMatch(
      /\.form-surface\s*\{[^}]*border-radius:\s*40rpx[^}]*background:\s*#1c1c1e/s,
    );
    expect(styles).toMatch(/\.form-section\s*\{[^}]*border-top:\s*1rpx solid #3a3a3c/s);
    expect(styles).toContain('background: #ff5722;');
    expect(styles).not.toContain('linear-gradient');
  });

  it('名片优先照片背景，保留 STRAVA 标识、真实指标网格和诚实空态', () => {
    const template = read('miniprogram/pages/capability-card/index.wxml');
    const styles = read('miniprogram/pages/capability-card/index.wxss');

    expect(template.indexOf('wx:if="{{card.hasBackgrounds}}"')).toBeLessThan(
      template.indexOf('wx:else class="card-visual alpine-fallback"'),
    );
    expect(template).toContain('STRAVA {{card.statusLabel}}');
    expect(template).toContain('wx:for="{{card.metrics}}"');
    expect(template).toContain('wx:else class="metric-empty">{{card.emptyMetricsText}}');
    expect(styles).toMatch(/\.metric-grid\s*\{[^}]*flex-wrap:\s*wrap/s);
    expect(styles).toMatch(/\.rider-card\s*\{[^}]*min-height:\s*820rpx/s);
  });

  it('个人中心压缩品牌头部、摘要和菜单间距', () => {
    const template = read('miniprogram/pages/profile/index.wxml');
    const styles = read('miniprogram/pages/profile/index.wxss');

    expect(template).toContain('<brand-logo compact="{{true}}"');
    expect(template).toContain('class="hero-capability-card"');
    expect(styles).toMatch(/\.profile-hero\.has-bg\s*\{[^}]*min-height:\s*390rpx/s);
    expect(styles).toMatch(/\.menu-card,\s*\.menu-card:active\s*\{[^}]*min-height:\s*88rpx/s);
    expect(styles).toContain('color: #ff5722;');
  });
});
