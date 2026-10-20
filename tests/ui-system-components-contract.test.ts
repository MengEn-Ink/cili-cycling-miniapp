// @ts-expect-error The repository intentionally omits Node typings; Vitest provides this runtime.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('UI 重构通用组件契约', () => {
  it('通用组件复用现有圆角、颜色和触控令牌', () => {
    const styles = read('miniprogram/app.wxss');

    for (const token of ['--radius-sm', '--radius-card', '--control-height']) {
      expect(styles).toContain(token);
    }
    expect(styles).toContain('--color-brand: #e13b2b');
    expect(styles).toContain('--color-border: #ededed');
    expect(styles).toContain('--color-border-strong: #9a9186');
    expect(read('docs/styles.css')).toContain('--color-action: #c0321f');
  });

  it('头像组件在远端图片失败时回退品牌物料并透传事件', () => {
    const template = read('miniprogram/components/cili-avatar/index.wxml');
    const script = read('miniprogram/components/cili-avatar/index.ts');

    expect(template).toContain('wx:if="{{src && !imageFailed}}"');
    expect(template).toContain('src="/assets/brand/logo-circle-144.png"');
    expect(template).toContain('aria-label="{{ariaLabel}}"');
    expect(script).toContain('this.setData({ imageFailed: true })');
    expect(script).toContain("this.triggerEvent('error'");
    expect(script).toContain("this.triggerEvent('tap'");
  });

  it('个人中心大头像按稿为 66px（132rpx）', () => {
    const styles = read('miniprogram/components/cili-avatar/index.wxss');
    expect(styles).toMatch(/\.avatar--lg\s*\{[^}]*width:\s*132rpx;[^}]*height:\s*132rpx;/s);
  });

  it('指标组件只消费展示数据并支持窄屏列数', () => {
    const template = read('miniprogram/components/metric-grid/index.wxml');
    const script = read('miniprogram/components/metric-grid/index.ts');
    const styles = read('miniprogram/components/metric-grid/index.wxss');

    expect(script).toContain('items: { type: Array');
    expect(script).toContain('narrowColumns: { type: Number');
    expect(script).not.toMatch(/Repository|ride-service|wx\.cloud/);
    expect(template).toContain('wx:for="{{items}}"');
    expect(template).toContain('metric-grid--narrow-{{narrowColumns}}');
    expect(styles).toContain('@media (max-width: 340px)');
    expect(styles).toMatch(
      /\.metric-grid__value\s*\{[^}]*white-space:\s*nowrap[^}]*font-size:\s*48rpx/s,
    );
    expect(styles).toMatch(
      /\.metric-grid__unit\s*\{[^}]*align-self:\s*end[^}]*padding-bottom:\s*6rpx/s,
    );
  });

  it('详情与个人资料页注册并使用通用组件', () => {
    const detailConfig = read('miniprogram/pages/activity-detail/index.json');
    const detailTemplate = read('miniprogram/pages/activity-detail/index.wxml');
    const profileConfig = read('miniprogram/pages/profile/index.json');
    const profileTemplate = read('miniprogram/pages/profile/index.wxml');

    expect(detailConfig).toContain('"metric-grid": "/components/metric-grid/index"');
    expect(detailTemplate).toContain('<metric-grid class="detail-metric-panel"');
    expect(profileConfig).toContain('"cili-avatar": "/components/cili-avatar/index"');
    expect(profileTemplate).toContain('<cili-avatar');
  });
});
